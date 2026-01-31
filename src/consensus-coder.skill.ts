/**
 * Consensus-Coder Skill - Clawdbot Integration
 *
 * Main entry point for consensus-coder as a Clawdbot skill.
 *
 * Responsibilities:
 * 1. Register consensus-coder as a Clawdbot skill
 * 2. Initialize and wire all sub-components
 * 3. Expose public API for agent invocation
 * 4. Handle session routing and state management
 * 5. Manage debate lifecycle (start, track, execute, report)
 *
 * Architecture:
 * - ConsensusCoder (main skill class) orchestrates the workflow
 * - ConsensusOrchestrator handles the debate rounds
 * - SynthesisEngine aggregates model responses
 * - StateStore persists state to disk
 * - AuggieRelay executes implementation plans
 * - RetryOrchestrator handles error recovery
 * - ImplementationPlanGenerator converts consensus to actionable plan
 *
 * @module consensus-coder.skill
 * @version 1.0
 * @author Claude Opus (architecture), Auggie (implementation)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { ConsensusOrchestrator, ConsensusConfig } from './consensus-orchestrator.js';
import { SynthesisEngine, SynthesisEngineOptions } from './synthesis-engine.js';
import { StateStore, DebateMetadata } from './persistence/state-store.js';
import { AuggieRelay, AuggieRelayOptions, AuggieExecutionResult } from './integrations/auggie-relay.js';
import { RetryOrchestrator, RetryOrchestratorOptions, RetryResult } from './error-handling/retry-orchestrator.js';
import { ImplementationPlanGenerator, PlanGeneratorOptions, ImplementationPlan } from './implementation-plan-generator.js';

import {
  DebateState,
  ConsensusCoderConfig,
  DEBATE_CONSTRAINTS,
} from './types/consensus-types.js';

// ============================================================================
// SKILL METADATA (Clawdbot Registration)
// ============================================================================

export const SKILL_ID = 'consensus-coder';
export const SKILL_VERSION = '1.0.0';
export const SKILL_DESCRIPTION = 'Multi-model consensus coding workflow - debate system for generating high-quality code through orchestrated AI deliberation';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Options for ConsensusCoder initialization
 */
export interface ConsensusCoderOptions {
  /** Working directory for skill state (default: ~/.clawdbot/consensus-coder) */
  workspace?: string;

  /** Enable debug logging (default: false) */
  debug?: boolean;

  /** Full configuration override (default: load from config.json) */
  config?: ConsensusCoderConfig;
}

/**
 * Response from starting a new consensus debate
 */
export interface StartConsensusResponse {
  debateId: string;
  status: 'started' | 'error';
  message: string;
  timestamp: Date;
}

/**
 * Status of an ongoing debate
 */
export interface DebateStatusResponse {
  debateId: string;
  status: 'pending' | 'in_progress' | 'converged' | 'escalated' | 'not_found';
  iteration: number;
  lastUpdate: Date;
  votingScore?: number;
  uncertaintyLevel?: number;
  winningApproach?: string;
  estimatedTimeRemainingMs?: number;
}

/**
 * Result of executing an implementation plan
 */
export interface ImplementationResult {
  debateId: string;
  status: 'success' | 'partial' | 'failed';
  generatedCode: string;
  errors?: string[];
  warnings?: string[];
  executionTimeMs: number;
  retriesUsed?: number;
}

/**
 * Comprehensive report of a completed debate
 */
export interface DebateReport {
  debateId: string;
  status: 'converged' | 'escalated' | 'incomplete';
  problemStatement: string;
  roundsCompleted: number;
  votingScore: number;
  uncertaintyLevel: number;
  winningApproach: string;
  generatedCode?: string;
  executionErrors?: string[];
  totalTimeMs: number;
  createdAt: Date;
  completedAt: Date;
}

// ============================================================================
// LOGGER HELPER
// ============================================================================

interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

function createLogger(debug: boolean): Logger {
  const prefix = '[ConsensusCoder]';
  return {
    debug: (msg: string, data?: unknown) => {
      if (debug) console.log(`${prefix} DEBUG:`, msg, data ?? '');
    },
    info: (msg: string, data?: unknown) => {
      console.log(`${prefix} INFO:`, msg, data ?? '');
    },
    warn: (msg: string, data?: unknown) => {
      console.warn(`${prefix} WARN:`, msg, data ?? '');
    },
    error: (msg: string, data?: unknown) => {
      console.error(`${prefix} ERROR:`, msg, data ?? '');
    },
  };
}

// ============================================================================
// MAIN SKILL CLASS: ConsensusCoder
// ============================================================================

/**
 * ConsensusCoder - Main Skill Class for Clawdbot Integration
 *
 * Public API for agents/CLIs to invoke consensus coding workflows.
 *
 * Workflow:
 * 1. User calls startConsensus(problem, context) → returns debateId
 * 2. User polls getDebateStatus(debateId) to track progress
 * 3. Once converged, user calls executeImplementation(debateId)
 * 4. Final code returned and can be executed
 *
 * State is persisted to disk, allowing recovery from failures.
 *
 * @class ConsensusCoder
 * @example
 * ```typescript
 * const coder = await createConsensusCoder({ debug: true });
 * const { debateId } = await coder.startConsensus(
 *   'Write a cache eviction strategy',
 *   'TypeScript, Redis backend'
 * );
 * // Poll status...
 * const status = await coder.getDebateStatus(debateId);
 * // Execute when converged...
 * const result = await coder.executeImplementation(debateId);
 * ```
 */
export class ConsensusCoder {
  private readonly workspace: string;
  private readonly logger: Logger;
  private readonly config: ConsensusCoderConfig;

  // Components
  private stateStore!: StateStore;
  private synthesisEngine!: SynthesisEngine;
  private auggieRelay!: AuggieRelay;
  private retryOrchestrator!: RetryOrchestrator;
  private implementationPlanGenerator!: ImplementationPlanGenerator;

  private initialized: boolean = false;

  /**
   * Constructor
   *
   * Does NOT initialize components synchronously.
   * Must call initialize() before using public API.
   *
   * @param {ConsensusCoderOptions} [options] - Configuration options
   * @throws {Error} If configuration validation fails
   */
  constructor(options?: ConsensusCoderOptions) {
    // Resolve workspace path
    this.workspace = this.resolvePath(
      options?.workspace ?? path.join(os.homedir(), '.clawdbot', 'consensus-coder')
    );

    // Set up logger
    const debug = options?.debug ?? false;
    this.logger = createLogger(debug);

    // Load or use provided configuration
    this.config = options?.config ?? this.loadDefaultConfig();

    this.logger.debug('ConsensusCoder constructed', {
      workspace: this.workspace,
      config: this.config,
    });
  }

  /**
   * Initialize all sub-components.
   * Must be called before any public API methods.
   *
   * Initializes in order:
   * 1. StateStore (persistence)
   * 2. SynthesisEngine
   * 3. AuggieRelay
   * 4. RetryOrchestrator
   * 5. ImplementationPlanGenerator
   *
   * @async
   * @throws {Error} If initialization fails (with diagnostic info)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.logger.info('Initializing ConsensusCoder components...');

      // Validate configuration first
      this.validateConfiguration();

      // Create workspace directory
      await fs.mkdir(this.workspace, { recursive: true });

      // Initialize StateStore
      this.stateStore = new StateStore(path.join(this.workspace, 'debates'));
      this.logger.debug('StateStore initialized');

      // Initialize SynthesisEngine
      const synthesisOptions: SynthesisEngineOptions = {
        opusModel: this.config.models.opus.model,
        enableDetailedMetrics: false,
        synthesisTimeoutMs: this.config.llmTimeoutMs,
        logger: (level, msg, data) => {
          if (level === 'debug' && !this.logger) return;
          this.logger[level](msg, data);
        },
      };
      this.synthesisEngine = new SynthesisEngine(synthesisOptions);
      this.logger.debug('SynthesisEngine initialized');

      // Initialize AuggieRelay
      const relayOptions: AuggieRelayOptions = {
        auggiePath: 'auggie',
        timeout: 300000,
        captureOutput: true,
        verbose: false,
        logger: (level, msg, data) => {
          this.logger[level](msg, data);
        },
      };
      this.auggieRelay = new AuggieRelay(relayOptions);
      this.logger.debug('AuggieRelay initialized');

      // Initialize RetryOrchestrator
      const retryOptions: RetryOrchestratorOptions = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
        enableUserFeedback: true,
        logger: (level, msg, data) => {
          this.logger[level](msg, data);
        },
      };
      this.retryOrchestrator = new RetryOrchestrator(retryOptions);
      this.logger.debug('RetryOrchestrator initialized');

      // Initialize ImplementationPlanGenerator
      const planOptions: PlanGeneratorOptions = {
        opusModel: this.config.models.opus.model,
        maxPlanLength: 3000,
        opusTimeoutMs: this.config.llmTimeoutMs,
        verbose: false,
        logger: (level, msg, data) => {
          this.logger[level](msg, data);
        },
      };
      this.implementationPlanGenerator = new ImplementationPlanGenerator(planOptions);
      this.logger.debug('ImplementationPlanGenerator initialized');

      this.initialized = true;
      this.logger.info('ConsensusCoder initialization complete');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Initialization failed', { message });
      throw new Error(
        `ConsensusCoder initialization failed: ${message}\n` +
          `Ensure ANTHROPIC_API_KEY, GOOGLE_AI_STUDIO_API_KEY are set, and auggie binary is available.`
      );
    }
  }

  /**
   * Start a new consensus debate.
   *
   * Creates a new DebateState, initializes ConsensusOrchestrator,
   * and starts the debate loop asynchronously (non-blocking).
   *
   * @async
   * @param {string} problem - Problem statement (required)
   * @param {string} [context] - Optional context (domain, language, etc.)
   * @returns {Promise<string>} debateId for tracking progress
   * @throws {Error} If not initialized or on invalid input
   *
   * @example
   * ```typescript
   * const debateId = await skill.startConsensus(
   *   'Write a cache eviction strategy',
   *   'TypeScript, Redis backend'
   * );
   * ```
   */
  async startConsensus(problem: string, context?: string): Promise<string> {
    this.ensureInitialized();

    if (!problem || problem.trim().length === 0) {
      throw new Error('Problem statement is required and cannot be empty');
    }

    const debateId = this.generateDebateId();
    const contextStr = context?.trim() ?? '';

    this.logger.info('Starting consensus debate', {
      debateId,
      problemLength: problem.length,
      hasContext: contextStr.length > 0,
    });

    // Create orchestrator
    const consensusConfig: Partial<ConsensusConfig> = {
      maxIterations: 5,
      votingThreshold: 75,
      uncertaintyThreshold: 30,
      requestTimeout: 60000,
      retryAttempts: 2,
    };

    const orchestrator = new ConsensusOrchestrator(problem, contextStr, consensusConfig);

    // Start debate async (non-blocking)
    // This will run in the background and update state on disk
    this.runDebateAsync(orchestrator).catch((error) => {
      this.logger.error('Debate execution failed', {
        debateId,
        message: error instanceof Error ? error.message : String(error),
      });
    });

    return debateId;
  }

  /**
   * Get current status of a debate.
   *
   * Loads debate state from disk and extracts status info.
   *
   * @async
   * @param {string} debateId - Debate to query
   * @returns {Promise<DebateStatusResponse>} Current status
   *
   * @example
   * ```typescript
   * const status = await skill.getDebateStatus(debateId);
   * console.log(status.status); // 'in_progress', 'converged', etc.
   * ```
   */
  async getDebateStatus(debateId: string): Promise<DebateStatusResponse> {
    this.ensureInitialized();

    try {
      const state = await this.stateStore.loadState(debateId);

      return {
        debateId,
        status: state.isConverged ? 'converged' : 'in_progress',
        iteration: state.currentRound,
        lastUpdate: new Date(state.createdAt),
        votingScore: state.votingScore,
        uncertaintyLevel: state.uncertaintyLevel,
        winningApproach: state.consensusSolution?.explanation,
        estimatedTimeRemainingMs: state.isConverged
          ? 0
          : (this.config.maxRounds - state.currentRound) * 30000, // ~30s per round estimate
      };
    } catch (error) {
      return {
        debateId,
        status: 'not_found',
        iteration: 0,
        lastUpdate: new Date(),
      };
    }
  }

  /**
   * Get full debate history and state.
   *
   * Returns the complete DebateState object with all rounds, synthesis,
   * and metadata.
   *
   * @async
   * @param {string} debateId - Debate to retrieve
   * @returns {Promise<DebateState>} Full debate state
   * @throws {Error} If debate not found
   *
   * @example
   * ```typescript
   * const state = await skill.getDebateHistory(debateId);
   * console.log(state.rounds); // All debate rounds
   * ```
   */
  async getDebateHistory(debateId: string): Promise<DebateState> {
    this.ensureInitialized();
    return this.stateStore.loadState(debateId);
  }

  /**
   * Execute implementation plan for a converged debate.
   *
   * Once a debate has converged:
   * 1. Load debate state
   * 2. Verify convergence
   * 3. Generate implementation plan from consensus
   * 4. Execute plan via AuggieRelay
   * 5. Handle errors with RetryOrchestrator
   * 6. Save final result
   * 7. Return implementation result
   *
   * @async
   * @param {string} debateId - Converged debate to implement
   * @returns {Promise<ImplementationResult>} Execution result
   * @throws {Error} If debate not found or not converged
   *
   * @example
   * ```typescript
   * const result = await skill.executeImplementation(debateId);
   * console.log(result.generatedCode);
   * ```
   */
  async executeImplementation(debateId: string): Promise<ImplementationResult> {
    this.ensureInitialized();

    const startTime = Date.now();

    try {
      // Load debate state
      const debateState = await this.stateStore.loadState(debateId);

      // Verify convergence
      if (!debateState.isConverged) {
        throw new Error(
          `Debate ${debateId} is not converged. ` +
            `Current status: round ${debateState.currentRound}/${debateState.maxRounds}`
        );
      }

      this.logger.info('Executing implementation for converged debate', { debateId });

      // Generate implementation plan
      const plan = await this.implementationPlanGenerator.generatePlan(debateState);

      // Execute via AuggieRelay with retry logic
      let executionResult: AuggieExecutionResult;
      let retriesUsed: number = 0;

      try {
        // First attempt without retry orchestrator
        executionResult = await this.auggieRelay.executeImplementationPlan(plan);

        // If successful, return immediately
        if (executionResult.status === 'success') {
          const elapsedMs = Date.now() - startTime;
          return {
            debateId,
            status: 'success',
            generatedCode: executionResult.generatedCode,
            warnings: executionResult.warnings,
            executionTimeMs: elapsedMs,
          };
        }

        // If not successful, attempt retries
        this.logger.warn('Initial execution attempt failed, attempting retries', {
          debateId,
          status: executionResult.status,
        });

        const retryResult = await this.retryOrchestrator.executeWithRetry(
          plan,
          this.auggieRelay,
          debateState
        );

        executionResult = retryResult.lastExecutionResult;
        retriesUsed = retryResult.retriesUsed;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Implementation execution failed', {
          debateId,
          message,
        });

        const elapsedMs = Date.now() - startTime;
        return {
          debateId,
          status: 'failed',
          generatedCode: '',
          errors: [message],
          executionTimeMs: elapsedMs,
          retriesUsed,
        };
      }

      const elapsedMs = Date.now() - startTime;
      return {
        debateId,
        status: executionResult.status === 'success' ? 'success' : 'partial',
        generatedCode: executionResult.generatedCode,
        errors: executionResult.errors,
        warnings: executionResult.warnings,
        executionTimeMs: elapsedMs,
        retriesUsed,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const elapsedMs = Date.now() - startTime;

      return {
        debateId,
        status: 'failed',
        generatedCode: '',
        errors: [message],
        executionTimeMs: elapsedMs,
      };
    }
  }

  /**
   * Generate a comprehensive report of a completed debate.
   *
   * @async
   * @param {string} debateId - Debate to report on
   * @returns {Promise<DebateReport>} Comprehensive report
   * @throws {Error} If debate not found
   *
   * @example
   * ```typescript
   * const report = await skill.getDebateReport(debateId);
   * console.log(report);
   * ```
   */
  async getDebateReport(debateId: string): Promise<DebateReport> {
    this.ensureInitialized();

    const state = await this.stateStore.loadState(debateId);
    const elapsedMs = Date.now() - state.createdAt;

    return {
      debateId,
      status: state.isConverged ? 'converged' : 'incomplete',
      problemStatement: state.problemStatement,
      roundsCompleted: state.currentRound,
      votingScore: state.votingScore,
      uncertaintyLevel: state.uncertaintyLevel,
      winningApproach: state.consensusSolution?.explanation ?? 'Pending',
      totalTimeMs: elapsedMs,
      createdAt: new Date(state.createdAt),
      completedAt: new Date(),
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // PRIVATE METHODS
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Internal method to run debate asynchronously.
   * Orchestrator.run() handles the entire debate lifecycle.
   *
   * @private
   * @async
   */
  private async runDebateAsync(
    orchestrator: ConsensusOrchestrator
  ): Promise<void> {
    try {
      const finalState = await orchestrator.run();

      // Save final state
      await this.stateStore.saveState(finalState);

      this.logger.info('Debate completed', {
        debateId: finalState.debateId,
        converged: finalState.isConverged,
        rounds: finalState.currentRound,
      });
    } catch (error) {
      this.logger.error('Debate execution error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Ensure skill has been initialized.
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'ConsensusCoder not initialized. Call await skill.initialize() first.'
      );
    }
  }

  /**
   * Validate configuration.
   * @private
   * @throws {Error} If required configs missing
   */
  private validateConfiguration(): void {
    const errors: string[] = [];

    // Check required API keys
    if (!process.env.ANTHROPIC_API_KEY) {
      errors.push('ANTHROPIC_API_KEY environment variable not set');
    }
    if (!process.env.GOOGLE_AI_STUDIO_API_KEY) {
      errors.push('GOOGLE_AI_STUDIO_API_KEY environment variable not set');
    }

    // Check consensus thresholds
    if (this.config.convergenceThreshold < 0 || this.config.convergenceThreshold > 100) {
      errors.push('convergenceThreshold must be between 0 and 100');
    }
    if (
      this.config.uncertaintyThreshold < 0 ||
      this.config.uncertaintyThreshold > 100
    ) {
      errors.push('uncertaintyThreshold must be between 0 and 100');
    }

    // Check max rounds
    if (this.config.maxRounds < 1 || this.config.maxRounds > 5) {
      errors.push('maxRounds must be between 1 and 5');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Load default configuration.
   * @private
   */
  private loadDefaultConfig(): ConsensusCoderConfig {
    return {
      convergenceThreshold: 75,
      uncertaintyThreshold: 30,
      maxRounds: 5,
      llmTimeoutMs: 60000,
      apiRetryAttempts: 3,
      apiRetryBackoffMs: 1000,
      debateStateDir: path.join(os.homedir(), '.clawdbot', 'consensus-debates'),
      enableCodebakeIntegration: false,
      models: {
        opus: { model: 'anthropic/claude-opus-4-5', temperature: 0.7 },
        gemini: { model: 'google/gemini-2-5-flash', temperature: 0.7 },
        codex: { model: 'anthropic/claude-opus-4-5', temperature: 0.7 },
      },
    };
  }

  /**
   * Resolve a file path, expanding ~ to home directory.
   * @private
   */
  private resolvePath(pathStr: string): string {
    if (pathStr.startsWith('~')) {
      return path.join(os.homedir(), pathStr.slice(1));
    }
    return path.resolve(pathStr);
  }

  /**
   * Generate a unique debate ID.
   * @private
   */
  private generateDebateId(): string {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 15);
    return `debate-${timestamp}-${randomPart}`;
  }
}

// ============================================================================
// FACTORY FUNCTION (Clawdbot Integration)
// ============================================================================

/**
 * Factory function for Clawdbot to create and initialize ConsensusCoder.
 *
 * This is the main entry point for Clawdbot agents.
 *
 * @async
 * @param {ConsensusCoderOptions} [options] - Initialization options
 * @returns {Promise<ConsensusCoder>} Initialized skill instance
 *
 * @example
 * ```typescript
 * // In Clawdbot agent code:
 * import { createConsensusCoder } from './skills/consensus-coder/src/consensus-coder.skill';
 *
 * const skill = await createConsensusCoder({ debug: true });
 * const debateId = await skill.startConsensus('Write a cache eviction strategy');
 * ```
 */
export async function createConsensusCoder(
  options?: ConsensusCoderOptions
): Promise<ConsensusCoder> {
  const skill = new ConsensusCoder(options);
  await skill.initialize();
  return skill;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Re-export key types from sub-modules for external consumers
export { DebateState } from './types/consensus-types.js';
export {
  ImplementationPlan,
  ImplementationStep,
} from './implementation-plan-generator.js';
export { AuggieExecutionResult } from './integrations/auggie-relay.js';
export { RetryResult } from './error-handling/retry-orchestrator.js';
