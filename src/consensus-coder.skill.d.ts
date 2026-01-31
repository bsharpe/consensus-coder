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
import { DebateState, ConsensusCoderConfig } from './types/consensus-types.js';
export declare const SKILL_ID = "consensus-coder";
export declare const SKILL_VERSION = "1.0.0";
export declare const SKILL_DESCRIPTION = "Multi-model consensus coding workflow - debate system for generating high-quality code through orchestrated AI deliberation";
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
export declare class ConsensusCoder {
    private readonly workspace;
    private readonly logger;
    private readonly config;
    private stateStore;
    private synthesisEngine;
    private auggieRelay;
    private retryOrchestrator;
    private implementationPlanGenerator;
    private initialized;
    /**
     * Constructor
     *
     * Does NOT initialize components synchronously.
     * Must call initialize() before using public API.
     *
     * @param {ConsensusCoderOptions} [options] - Configuration options
     * @throws {Error} If configuration validation fails
     */
    constructor(options?: ConsensusCoderOptions);
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
    initialize(): Promise<void>;
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
    startConsensus(problem: string, context?: string): Promise<string>;
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
    getDebateStatus(debateId: string): Promise<DebateStatusResponse>;
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
    getDebateHistory(debateId: string): Promise<DebateState>;
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
    executeImplementation(debateId: string): Promise<ImplementationResult>;
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
    getDebateReport(debateId: string): Promise<DebateReport>;
    /**
     * Internal method to run debate asynchronously.
     * Orchestrator.run() handles the entire debate lifecycle.
     *
     * @private
     * @async
     */
    private runDebateAsync;
    /**
     * Ensure skill has been initialized.
     * @private
     */
    private ensureInitialized;
    /**
     * Validate configuration.
     * @private
     * @throws {Error} If required configs missing
     */
    private validateConfiguration;
    /**
     * Load default configuration.
     * @private
     */
    private loadDefaultConfig;
    /**
     * Resolve a file path, expanding ~ to home directory.
     * @private
     */
    private resolvePath;
    /**
     * Generate a unique debate ID.
     * @private
     */
    private generateDebateId;
}
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
export declare function createConsensusCoder(options?: ConsensusCoderOptions): Promise<ConsensusCoder>;
export { DebateState } from './types/consensus-types.js';
export { ImplementationPlan, ImplementationStep, } from './implementation-plan-generator.js';
export { AuggieExecutionResult } from './integrations/auggie-relay.js';
export { RetryResult } from './error-handling/retry-orchestrator.js';
