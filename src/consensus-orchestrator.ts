/**
 * Consensus-Coder Orchestrator
 *
 * Core orchestration engine for multi-round debate lifecycle.
 *
 * Responsibilities:
 * 1. Initialize debate with user's problem and context
 * 2. Each round: spawn parallel model calls (Opus proposes, Gemini critiques, Codex refines)
 * 3. Collect all responses in parallel
 * 4. Call synthesis engine to aggregate ratings and convergence metrics
 * 5. Check convergence conditions (voting + uncertainty thresholds)
 * 6. Loop until consensus or max iterations
 * 7. Return final debate state
 *
 * Error Handling:
 * - Model call timeouts: retry up to 2x with exponential backoff
 * - API failures: log, return error ModelResponse (don't throw)
 * - Synthesis failures: log and escalate immediately
 * - Never throw from executeRound(): always return partial DebateRound
 *
 * @author Claude Opus (architecture), Auggie (implementation)
 * @version 1.0
 */

import {
  DebateState,
  DebateRound,
  ModelResponse,
  RatingMatrix,
  SynthesisResult,
  CodeSolution,
  ModelName,
  ModelRole,
  ConsensusCoderConfig,
  DEBATE_CONSTRAINTS,
} from './types/consensus-types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_RETRY_DELAY_MS = 1000;
const EXPONENTIAL_BACKOFF_FACTOR = 2;

/**
 * Default configuration for consensus debates.
 * Can be overridden via constructor.
 */
const DEFAULT_CONFIG: ConsensusConfig = {
  maxIterations: 5,
  votingThreshold: 75,
  uncertaintyThreshold: 30,
  requestTimeout: 60000,
  retryAttempts: 2,
};

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuration for consensus debate behavior.
 *
 * @interface ConsensusConfig
 */
export interface ConsensusConfig {
  /**
   * Maximum number of debate rounds (1-5).
   * Default: 5
   */
  maxIterations: number;

  /**
   * Voting agreement threshold for convergence (0-100).
   * Default: 75 (requires 75% agreement)
   */
  votingThreshold: number;

  /**
   * Uncertainty threshold for convergence (0-100).
   * Default: 30 (requires <= 30% uncertainty)
   * Lower is more agreement.
   */
  uncertaintyThreshold: number;

  /**
   * Request timeout in milliseconds for LLM API calls.
   * Default: 60000 (60 seconds)
   */
  requestTimeout: number;

  /**
   * Number of retry attempts on timeout/rate-limit.
   * Default: 2
   */
  retryAttempts: number;
}

/**
 * Internal state tracked during debate execution.
 *
 * @interface OrchestrationState
 */
interface OrchestrationState {
  currentIteration: number;
  rounds: DebateRound[];
  lastSynthesis: SynthesisResult | null;
  isConverged: boolean;
  apiCallCount: number;
  apiFailureCount: number;
}

// ============================================================================
// CLASS: ConsensusOrchestrator
// ============================================================================

/**
 * Orchestrates the multi-round debate lifecycle.
 *
 * Main entry point is `run()` which:
 * 1. Initializes debate state
 * 2. Loops through up to 5 rounds
 * 3. Each round: parallel calls to Opus, Gemini, Codex
 * 4. Aggregates responses via SynthesisEngine
 * 5. Checks convergence
 * 6. Returns final state (converged or escalated)
 *
 * @class ConsensusOrchestrator
 *
 * @example
 * ```typescript
 * const orchestrator = new ConsensusOrchestrator(
 *   'Write a cache eviction strategy',
 *   'TypeScript, Redis backend',
 *   { maxIterations: 5 }
 * );
 *
 * const finalState = await orchestrator.run();
 * console.log(finalState.isConverged); // true if consensus reached
 * ```
 */
export class ConsensusOrchestrator {
  private readonly problem: string;
  private readonly context: string;
  private readonly config: ConsensusConfig;
  private readonly state: OrchestrationState;
  private debateState: DebateState;
  private readonly debateId: string;

  /**
   * Constructor initializes debate parameters and default state.
   *
   * @param problem - The coding problem to solve
   * @param context - Optional additional context or constraints
   * @param config - Optional configuration overrides
   *
   * @throws Error if problem is empty or invalid
   */
  constructor(
    problem: string,
    context: string = '',
    config: Partial<ConsensusConfig> = {}
  ) {
    // Validation
    if (!problem || problem.trim().length === 0) {
      throw new Error('Problem statement cannot be empty');
    }

    if (problem.length > DEBATE_CONSTRAINTS.maxContentLength.problem) {
      throw new Error(
        `Problem statement exceeds maximum length of ${DEBATE_CONSTRAINTS.maxContentLength.problem} characters`
      );
    }

    this.problem = problem.trim();
    this.context = context.trim();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Generate unique debate ID
    this.debateId = this.generateDebateId();

    // Initialize orchestration state
    this.state = {
      currentIteration: 0,
      rounds: [],
      lastSynthesis: null,
      isConverged: false,
      apiCallCount: 0,
      apiFailureCount: 0,
    };

    // Initialize debate state
    this.debateState = {
      debateId: this.debateId,
      problemId: `prob-${Date.now()}`,
      createdAt: Date.now(),
      userId: 'user-ben',
      currentRound: 0,
      maxRounds: this.config.maxIterations,
      problemStatement: this.problem,
      rounds: [],
      votingScore: 0,
      uncertaintyLevel: 100,
      convergenceThreshold: this.config.votingThreshold,
      uncertaintyThreshold: this.config.uncertaintyThreshold,
      isConverged: false,
      shouldEscalate: false,
      persistedAt: Date.now(),
      version: '1.0',
    };

    this.logInfo(
      `Debate initialized: ${this.debateId}`,
      `Max rounds: ${this.config.maxIterations}, Voting threshold: ${this.config.votingThreshold}%`
    );
  }

  // =========================================================================
  // PUBLIC INTERFACE
  // =========================================================================

  /**
   * Main entry point: execute the full debate lifecycle.
   *
   * Algorithm:
   * 1. Initialize DebateState
   * 2. Loop iterations 1-5:
   *    a. Call executeRound()
   *    b. Collect responses
   *    c. Check isConverged()
   *    d. If converged → return state with status='converged'
   *    e. If max iterations reached → escalate
   * 3. Return final state
   *
   * @returns Promise<DebateState> - Final debate state (converged or escalated)
   *
   * @example
   * ```typescript
   * const finalState = await orchestrator.run();
   * if (finalState.isConverged) {
   *   console.log('Solution:', finalState.consensusSolution?.code);
   * } else {
   *   console.log('Escalated:', finalState.escalationReason);
   * }
   * ```
   */
  async run(): Promise<DebateState> {
    try {
      this.logInfo('Starting debate orchestration');

      // Loop through rounds
      while (this.state.currentIteration < this.config.maxIterations) {
        this.state.currentIteration++;
        this.debateState.currentRound = this.state.currentIteration;

        this.logInfo(`--- ROUND ${this.state.currentIteration} ---`);

        // Execute one round: parallel Opus/Gemini/Codex calls + synthesis
        const round = await this.executeRound(this.state.currentIteration);

        // Store round results
        this.state.rounds.push(round);
        this.debateState.rounds.push(round);

        // Update convergence metrics from synthesis
        this.debateState.votingScore = round.synthesis.votingScore;
        this.debateState.uncertaintyLevel = round.synthesis.uncertaintyLevel;
        this.state.lastSynthesis = round.synthesis;

        this.logInfo(
          `Round ${this.state.currentIteration} complete`,
          `Voting: ${round.synthesis.votingScore}%, Uncertainty: ${round.synthesis.uncertaintyLevel}%`,
          `Duration: ${round.durationMs}ms`
        );

        // Check convergence
        if (this.checkConvergence(round)) {
          this.debateState.isConverged = true;
          this.debateState.convergedAt = Date.now();
          this.state.isConverged = true;

          this.logInfo(
            `✓ CONVERGENCE REACHED at round ${this.state.currentIteration}`,
            `Voting: ${round.synthesis.votingScore}%, Uncertainty: ${round.synthesis.uncertaintyLevel}%`
          );

          // Extract consensus solution from best-ranked solution
          if (round.synthesis.rankedSolutions.length > 0) {
            const bestSolution = round.synthesis.rankedSolutions[0];
            // In a real implementation, extract CodeSolution from the model response
            // For now, this will be populated by the synthesis engine
            this.debateState.consensusSolution = this.extractSolution(round);
          }

          return this.debateState;
        }

        // Log progress toward convergence
        const analysis = round.synthesis.convergenceAnalysis;
        if (analysis.isConverging && analysis.predictedConvergenceRound) {
          this.logInfo(
            `Progress: Converging toward round ${analysis.predictedConvergenceRound}`,
            `Trend: ${analysis.trendFromPreviousRound || 'unknown'}`
          );
        }
      }

      // Max iterations reached without convergence
      this.debateState.shouldEscalate = true;
      this.debateState.escalatedAt = Date.now();
      this.debateState.escalationReason = `Max ${this.config.maxIterations} rounds reached without convergence. Final voting: ${this.debateState.votingScore}%, Uncertainty: ${this.debateState.uncertaintyLevel}%`;

      this.logWarn(
        `Escalating after max rounds`,
        this.debateState.escalationReason
      );

      return this.debateState;
    } catch (error) {
      // Catastrophic error: escalate
      this.debateState.shouldEscalate = true;
      this.debateState.escalatedAt = Date.now();
      this.debateState.escalationReason = `Orchestration error: ${error instanceof Error ? error.message : String(error)}`;

      this.logError('Fatal orchestration error', error);

      return this.debateState;
    }
  }

  /**
   * Returns the current debate state for inspection/persistence.
   *
   * @returns Promise<DebateState> - Current state snapshot
   *
   * @example
   * ```typescript
   * const state = await orchestrator.getState();
   * await stateStore.save(state); // Persist to disk
   * ```
   */
  async getState(): Promise<DebateState> {
    this.debateState.persistedAt = Date.now();
    return this.debateState;
  }

  /**
   * Build prompt for testing (public for unit tests).
   *
   * Returns a sample prompt for the given model in the current round.
   * Useful for testing prompt construction without running full debate.
   *
   * @param modelName - 'opus', 'gemini', or 'codex'
   * @returns Sample prompt string
   *
   * @example
   * ```typescript
   * const prompt = orchestrator._buildPromptForTest('opus');
   * console.log(prompt); // Inspect prompt structure
   * ```
   */
  _buildPromptForTest(modelName: ModelName): string {
    return this.buildPrompt(modelName, 1, {
      proposal: '',
      critique: '',
    });
  }

  // =========================================================================
  // PRIVATE IMPLEMENTATION
  // =========================================================================

  /**
   * Execute one complete debate round.
   *
   * Steps:
   * 1. Get previous round's synthesis for context (if exists)
   * 2. Build parallel tasks:
   *    - Opus: generateProposals(problem, context)
   *    - Gemini: critiqueSolutions(opusProposals)
   *    - Codex: refineSolution(opusProposals, geminCritique)
   * 3. Execute in parallel: await Promise.all([opus, gemini, codex])
   * 4. Collect responses
   * 5. Call synthesisEngine.aggregateRound(responses)
   * 6. Return DebateRound with all data
   *
   * Error Handling:
   * - If any model fails: log, continue with partial data
   * - Never throw from this method: always return DebateRound
   *
   * @param iteration - Current round number (1-5)
   * @returns Promise<DebateRound> - Round data with all responses and synthesis
   */
  private async executeRound(iteration: number): Promise<DebateRound> {
    const roundStartMs = Date.now();

    try {
      // Get previous synthesis for context
      const prevSynthesis =
        this.state.lastSynthesis && iteration > 1 ? this.state.lastSynthesis : null;

      // Build prompts for each model
      const opusPrompt = this.buildPrompt('opus', iteration, {
        proposal: '',
        critique: '',
      });
      const geminiPrompt = this.buildPrompt('gemini', iteration, {
        proposal: opusPrompt,
        critique: '',
      });
      const codexPrompt = this.buildPrompt('codex', iteration, {
        proposal: opusPrompt,
        critique: geminiPrompt,
      });

      // Execute in parallel: Opus → Gemini → Codex
      // (In practice, Gemini and Codex wait for Opus, so true parallel is limited)
      this.logDebug(
        `Round ${iteration}: spawning parallel Opus/Gemini/Codex calls`
      );

      const [opusResponse, geminiResponse, codexResponse] = await Promise.all([
        this.callModel('opus', opusPrompt, { role: 'proposer', iteration }),
        this.callModel('gemini', geminiPrompt, { role: 'critic', iteration }),
        this.callModel('codex', codexPrompt, { role: 'refiner', iteration }),
      ]);

      // Collect responses
      const responses: ModelResponse[] = [opusResponse, geminiResponse, codexResponse];

      // Check for critical failures
      const failedResponses = responses.filter((r) => r.metadata.error);
      if (failedResponses.length >= 2) {
        this.state.apiFailureCount += failedResponses.length;
        this.logError(
          `Round ${iteration}: ${failedResponses.length}/3 models failed`
        );

        if (this.state.apiFailureCount >= 3) {
          this.debateState.shouldEscalate = true;
          this.debateState.escalationReason = `Too many API failures (${this.state.apiFailureCount} total)`;
        }
      }

      // Call synthesis engine to aggregate
      // TODO: Import and use SynthesisEngine (Step 3)
      // For now, create minimal synthesis result
      const synthesis = await this.synthesizeRound(
        iteration,
        responses,
        prevSynthesis
      );

      // Build ratings matrix from responses
      const ratings = this.buildRatingMatrix(responses);

      // Calculate metrics
      const durationMs = Date.now() - roundStartMs;

      // Return complete DebateRound
      const debateRound: DebateRound = {
        roundNum: iteration,
        timestamp: roundStartMs,
        opusProposal: opusResponse,
        geminiCritique: geminiResponse,
        codexRefinement: codexResponse,
        ratings,
        synthesis,
        durationMs,
        apiCalls: {
          opus: {
            tokens: opusResponse.metadata.inputTokens + opusResponse.metadata.outputTokens,
            cost: this.estimateTokenCost('opus', opusResponse.metadata.inputTokens, opusResponse.metadata.outputTokens),
          },
          gemini: {
            tokens: geminiResponse.metadata.inputTokens + geminiResponse.metadata.outputTokens,
            cost: this.estimateTokenCost('gemini', geminiResponse.metadata.inputTokens, geminiResponse.metadata.outputTokens),
          },
          codex: {
            tokens: codexResponse.metadata.inputTokens + codexResponse.metadata.outputTokens,
            cost: this.estimateTokenCost('codex', codexResponse.metadata.inputTokens, codexResponse.metadata.outputTokens),
          },
        },
      };

      return debateRound;
    } catch (error) {
      // Catastrophic error: return minimal round with error flags
      this.logError(`executeRound(${iteration}) catastrophic error`, error);

      // Create minimal DebateRound with error state
      return {
        roundNum: iteration,
        timestamp: Date.now(),
        opusProposal: this.createErrorResponse('opus'),
        geminiCritique: this.createErrorResponse('gemini'),
        codexRefinement: this.createErrorResponse('codex'),
        ratings: this.createEmptyRatingMatrix(),
        synthesis: this.createErrorSynthesis(iteration),
        durationMs: Date.now() - roundStartMs,
        apiCalls: {
          opus: { tokens: 0, cost: 0 },
          gemini: { tokens: 0, cost: 0 },
          codex: { tokens: 0, cost: 0 },
        },
      };
    }
  }

  /**
   * Call a single LLM with retry logic.
   *
   * Features:
   * - Retry on timeout/rate-limit (up to `retryAttempts`)
   * - Exponential backoff: baseDelay * (2 ** attemptNumber)
   * - Track token usage, latency
   * - Catch and log errors
   * - Return ModelResponse with metadata (don't throw)
   *
   * Fallback:
   * - If all retries fail, return error ModelResponse
   * - Never throw: caller expects ModelResponse
   *
   * @param modelName - 'opus', 'gemini', or 'codex'
   * @param prompt - The prompt to send to the model
   * @param options - Metadata about the call (role, iteration)
   * @returns Promise<ModelResponse> - Response with metadata, never throws
   */
  private async callModel(
    modelName: ModelName,
    prompt: string,
    options: { role: ModelRole; iteration: number }
  ): Promise<ModelResponse> {
    const requestedAt = Date.now();
    let lastError: Error | null = null;

    // Retry loop
    for (
      let attempt = 0;
      attempt <= this.config.retryAttempts;
      attempt++
    ) {
      try {
        // Calculate backoff delay
        const delayMs =
          attempt > 0
            ? BASE_RETRY_DELAY_MS *
              Math.pow(EXPONENTIAL_BACKOFF_FACTOR, attempt - 1)
            : 0;

        if (delayMs > 0) {
          this.logDebug(
            `${modelName} retry attempt ${attempt}/${this.config.retryAttempts}, waiting ${delayMs}ms`
          );
          await this.delay(delayMs);
        }

        // Simulate API call with timeout
        const response = await this.simulateLLMCall(
          modelName,
          prompt,
          this.config.requestTimeout
        );

        const completedAt = Date.now();
        this.state.apiCallCount++;

        // Parse response (placeholder implementation)
        const parseResult = this.parseModelResponse(modelName, response);

        const modelResponse: ModelResponse = {
          modelName,
          role: options.role,
          content: response,
          metadata: {
            requestedAt,
            completedAt,
            inputTokens: Math.ceil(prompt.length / 4), // Rough estimate
            outputTokens: Math.ceil(response.length / 4),
            modelVersion: this.getModelVersion(modelName),
            temperature: this.getTemperature(modelName),
          },
          ...parseResult,
        };

        return modelResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isTimeout =
          lastError.message.toLowerCase().includes('timeout');
        const isRateLimit =
          lastError.message.toLowerCase().includes('rate');
        const isRetryable = isTimeout || isRateLimit;

        if (attempt < this.config.retryAttempts && isRetryable) {
          this.logWarn(
            `${modelName} attempt ${attempt + 1} failed (retryable)`,
            lastError.message
          );
          continue; // Retry
        }

        // Non-retryable error or last attempt
        this.logError(
          `${modelName} call failed after ${attempt + 1} attempt(s)`,
          lastError
        );
        break; // Exit retry loop
      }
    }

    // All retries exhausted: return error response
    const completedAt = Date.now();
    this.state.apiFailureCount++;

    return {
      modelName,
      role: options.role,
      content: '',
      metadata: {
        requestedAt,
        completedAt,
        inputTokens: 0,
        outputTokens: 0,
        modelVersion: this.getModelVersion(modelName),
        error: {
          code: 'MAX_RETRIES_EXCEEDED',
          message: lastError?.message || 'Unknown error',
          retryable: false,
        },
      },
    };
  }

  /**
   * Check if the debate has reached convergence.
   *
   * Convergence criteria (both must be true):
   * 1. votingScore >= convergenceThreshold (e.g., >= 75%)
   * 2. uncertaintyLevel <= uncertaintyThreshold (e.g., <= 30%)
   *
   * Delegates to round.synthesis.votingScore and round.synthesis.uncertaintyLevel.
   *
   * @param round - The debate round to check
   * @returns true if convergence achieved, false otherwise
   */
  private checkConvergence(round: DebateRound): boolean {
    const votingConverged =
      round.synthesis.votingScore >= this.config.votingThreshold;
    const uncertaintyConverged =
      round.synthesis.uncertaintyLevel <= this.config.uncertaintyThreshold;

    const converged = votingConverged && uncertaintyConverged;

    this.logDebug(
      `Convergence check: voting=${round.synthesis.votingScore}/${this.config.votingThreshold} (${votingConverged ? '✓' : '✗'}), uncertainty=${round.synthesis.uncertaintyLevel}/${this.config.uncertaintyThreshold} (${uncertaintyConverged ? '✓' : '✗'})`
    );

    return converged;
  }

  /**
   * Build a prompt for a model based on its role and round.
   *
   * Prompt structure varies by model:
   * - Opus (proposer): Asks for 3 alternative solutions
   * - Gemini (critic): Asks to evaluate Opus's proposals
   * - Codex (refiner): Asks to synthesize best elements
   *
   * @param modelName - 'opus', 'gemini', or 'codex'
   * @param iteration - Current round number
   * @param context - Previous responses (proposal, critique)
   * @returns Constructed prompt string
   */
  private buildPrompt(
    modelName: ModelName,
    iteration: number,
    context: { proposal: string; critique: string }
  ): string {
    const header = `Round ${iteration}/${this.config.maxIterations}`;

    if (modelName === 'opus') {
      return this.buildOpusPrompt(header);
    } else if (modelName === 'gemini') {
      return this.buildGeminiPrompt(header, context.proposal);
    } else {
      // codex
      return this.buildCodexPrompt(header, context.proposal, context.critique);
    }
  }

  /**
   * Build Opus prompt (proposer role).
   *
   * Opus generates 3 alternative architectural approaches.
   */
  private buildOpusPrompt(header: string): string {
    return `
${header}

You are an expert software architect specializing in consensus code generation.

PROBLEM:
${this.problem}

${this.context ? `CONTEXT:\n${this.context}\n` : ''}

Your task: Propose 3 DISTINCT architectural approaches to solve this problem.

For each approach, provide:
1. **Name** - A concise identifier
2. **Description** - 2-3 sentences explaining the approach
3. **Rationale** - Why this approach makes sense
4. **Trade-offs** - Performance vs maintainability vs complexity
5. **Complexity** - Low/Medium/High assessment
6. **Risks** - Potential issues or edge cases

Format each proposal clearly with separators. Be specific and technical.
    `.trim();
  }

  /**
   * Build Gemini prompt (critic role).
   *
   * Gemini evaluates Opus's proposals and rates them (1-10).
   */
  private buildGeminiPrompt(header: string, opusProposals: string): string {
    return `
${header}

You are a critical code reviewer and architectural skeptic.

PROBLEM:
${this.problem}

${this.context ? `CONTEXT:\n${this.context}\n` : ''}

PROPOSALS TO EVALUATE:
${opusProposals}

Your task: Critically evaluate each proposal. For each, provide:
1. **Clarity** - Does it clearly solve the problem? (1-10)
2. **Performance** - What are the trade-offs? (1-10)
3. **Maintainability** - How easy to modify later? (1-10)
4. **Overall Score** - Weighted average (1-10)
5. **Key Issues** - What could go wrong?
6. **Suggestions** - How could this be improved?

Be harsh and specific. Identify real weaknesses, not just minor nitpicks.
    `.trim();
  }

  /**
   * Build Codex prompt (refiner role).
   *
   * Codex synthesizes the best elements from proposals + feedback.
   */
  private buildCodexPrompt(
    header: string,
    opusProposals: string,
    geminCritique: string
  ): string {
    return `
${header}

You are a systems engineer focused on synthesis and implementation.

PROBLEM:
${this.problem}

${this.context ? `CONTEXT:\n${this.context}\n` : ''}

PROPOSALS:
${opusProposals}

CRITIC'S FEEDBACK:
${geminCritique}

Your task: Synthesize a refined solution that:
1. Addresses the critic's key concerns
2. Incorporates best practices from all proposals
3. Provides specific, implementable code or pseudo-code
4. Explains your reasoning and trade-offs

Be concrete. If code is appropriate, provide actual implementation. Otherwise, provide detailed pseudo-code with clear steps.
    `.trim();
  }

  /**
   * Synthesize one round of responses.
   *
   * This is a placeholder that will be delegated to SynthesisEngine in Step 3.
   * For now, creates a basic synthesis with dummy convergence metrics.
   *
   * @param iteration - Round number
   * @param responses - Responses from Opus, Gemini, Codex
   * @param prevSynthesis - Previous round's synthesis (for trend analysis)
   * @returns Synthesized round results
   */
  private async synthesizeRound(
    iteration: number,
    responses: ModelResponse[],
    prevSynthesis: SynthesisResult | null
  ): Promise<SynthesisResult> {
    // Placeholder: SynthesisEngine will be imported in Step 3
    // For now, create a basic synthesis with dummy metrics

    const now = Date.now();

    // Dummy voting results
    const votingScore = Math.min(
      100,
      50 + iteration * 12 + Math.random() * 10 // Simulates improving scores
    );
    const uncertaintyLevel = Math.max(
      0,
      100 - iteration * 15 - Math.random() * 10 // Simulates decreasing uncertainty
    );

    // Determine trend
    let trendFromPreviousRound: 'improving' | 'stable' | 'diverging' | undefined;
    if (prevSynthesis) {
      const votingDelta = votingScore - prevSynthesis.votingScore;
      const uncertaintyDelta =
        uncertaintyLevel - prevSynthesis.uncertaintyLevel;

      if (votingDelta >= 5 && uncertaintyDelta <= -5) {
        trendFromPreviousRound = 'improving';
      } else if (votingDelta <= -5 || uncertaintyDelta >= 5) {
        trendFromPreviousRound = 'diverging';
      } else {
        trendFromPreviousRound = 'stable';
      }
    }

    const synthesis: SynthesisResult = {
      roundNum: iteration,
      votes: {
        bestProposal: 'opus',
        voteCount: {
          opus: 2,
          gemini: 1,
          codex: 0,
        },
        consensus: false,
      },
      votingScore: Math.round(votingScore),
      uncertaintyLevel: Math.round(uncertaintyLevel),
      rankedSolutions: [
        {
          rank: 1,
          modelName: 'opus',
          score: 80,
          confidence: 70,
          keyStrengths: [
            'Clear architecture',
            'Well-justified trade-offs',
          ],
          keyWeaknesses: ['Potential performance issues at scale'],
        },
        {
          rank: 2,
          modelName: 'codex',
          score: 75,
          confidence: 65,
          keyStrengths: ['Practical implementation details'],
          keyWeaknesses: ['Less architectural clarity'],
        },
        {
          rank: 3,
          modelName: 'gemini',
          score: 65,
          confidence: 60,
          keyStrengths: ['Identifies edge cases'],
          keyWeaknesses: ['Overly complex for the problem'],
        },
      ],
      convergenceAnalysis: {
        isConverging: votingScore >= 50 && uncertaintyLevel <= 50,
        trendFromPreviousRound,
        predictedConvergenceRound:
          votingScore < 75 ? iteration + 2 : iteration + 1,
      },
      opusSynthesis: `Round ${iteration}: Models are ${votingScore > 70 ? 'converging' : 'exploring different approaches'}. ` +
        `Voting score: ${votingScore}%, Uncertainty: ${uncertaintyLevel}%. ` +
        `${trendFromPreviousRound ? `Trend: ${trendFromPreviousRound}.` : ''}`,
      metadata: {
        synthesizedAt: now,
        synthesizedBy: 'opus-model',
      },
    };

    return synthesis;
  }

  /**
   * Build a 3x3 rating matrix from model responses.
   *
   * Placeholder: In real implementation, parse ratings from response content.
   * For now, return a dummy matrix with realistic scores.
   *
   * @param responses - Model responses
   * @returns RatingMatrix with scores
   */
  private buildRatingMatrix(responses: ModelResponse[]): RatingMatrix {
    const now = Date.now();

    const ratings: RatingMatrix = {
      ratings: {
        opus: {
          opus: {
            score: 8,
            justification: 'Clear and well-structured',
            timestamp: now,
          },
          gemini: {
            score: 6,
            justification: 'Good critique but overly complex',
            timestamp: now,
          },
          codex: {
            score: 7,
            justification: 'Solid implementation details',
            timestamp: now,
          },
        },
        gemini: {
          opus: {
            score: 8,
            justification: 'Addresses concerns directly',
            timestamp: now,
          },
          gemini: {
            score: 5,
            justification: 'Self-critical but less constructive',
            timestamp: now,
          },
          codex: {
            score: 8,
            justification: 'Practical and implementable',
            timestamp: now,
          },
        },
        codex: {
          opus: {
            score: 8,
            justification: 'Solid architecture',
            timestamp: now,
          },
          gemini: {
            score: 6,
            justification: 'Good analysis, could be clearer',
            timestamp: now,
          },
          codex: {
            score: 7,
            justification: 'Practical but could be optimized',
            timestamp: now,
          },
        },
      },
      averageScore: 7.0,
      standardDeviation: 1.0,
      agreementScore: 0.85,
    };

    return ratings;
  }

  /**
   * Extract CodeSolution from the best-ranked solution.
   *
   * In a real implementation, this would parse the actual solution from the model response.
   * For now, creates a placeholder CodeSolution.
   *
   * @param round - The debate round
   * @returns CodeSolution or undefined
   */
  private extractSolution(round: DebateRound): CodeSolution | undefined {
    const bestRanked = round.synthesis.rankedSolutions[0];

    // In real implementation, extract from actual model response
    const solution: CodeSolution = {
      code: '// Solution code would be extracted here\nfunction solve() { /* ... */ }',
      language: 'typescript',
      explanation: 'The consensus solution based on multi-model debate.',
      approach: 'Synthesized from Opus proposal, Gemini critique, and Codex refinement.',
      complexity: {
        time: 'O(n log n)',
        space: 'O(n)',
      },
      testCases: [
        {
          input: 'Example input',
          output: 'Expected output',
        },
      ],
      pros: bestRanked.keyStrengths || [],
      cons: bestRanked.keyWeaknesses || [],
      alternatives: [
        'Alternative approach 1',
        'Alternative approach 2',
      ],
    };

    return solution;
  }

  // =========================================================================
  // HELPER METHODS - Testing Hooks
  // =========================================================================

  /**
   * Get current iteration (for unit testing).
   *
   * @returns Current iteration number
   */
  _getCurrentIteration(): number {
    return this.state.currentIteration;
  }

  /**
   * Get last synthesis result (for unit testing).
   *
   * @returns Last synthesis or null
   */
  _getLastSynthesis(): SynthesisResult | null {
    return this.state.lastSynthesis;
  }

  // =========================================================================
  // HELPER METHODS - Utilities
  // =========================================================================

  /**
   * Simulate an LLM API call (placeholder for actual API integration).
   *
   * In real implementation, this would call Claude API, Gemini API, etc.
   * For now, returns a dummy response.
   *
   * @param modelName - Model to call
   * @param prompt - Prompt to send
   * @param timeoutMs - Request timeout
   * @returns Promise<string> - LLM response
   */
  private async simulateLLMCall(
    modelName: ModelName,
    prompt: string,
    timeoutMs: number
  ): Promise<string> {
    // Placeholder: In real implementation, call actual LLM APIs
    // For now, simulate with delay
    const delay = Math.random() * 2000; // 0-2s random delay

    if (delay > timeoutMs) {
      throw new Error(`Timeout: ${delay}ms > ${timeoutMs}ms`);
    }

    await this.delay(delay);

    return `Simulated response from ${modelName}.\n\nPrompt received: ${prompt.substring(0, 100)}...`;
  }

  /**
   * Parse model response to extract structured fields.
   *
   * Placeholder: Real implementation would parse JSON, code blocks, etc.
   *
   * @param modelName - Model that responded
   * @param content - Response content
   * @returns Parsed fields (solution, critique, refinement)
   */
  private parseModelResponse(
    modelName: ModelName,
    content: string
  ): {
    solution?: CodeSolution;
    critique?: { issues: Array<{ issue: string; severity: 'low' | 'medium' | 'high' }>; suggestions: string[]; overallScore: number };
    refinement?: { improvements: string[]; finalCode: string; confidence: number };
  } {
    // Placeholder: Parse based on model and content
    if (modelName === 'opus') {
      return {
        solution: {
          code: '// Generated code',
          language: 'typescript',
          explanation: 'Generated from Opus',
          approach: 'Opus approach',
          complexity: { time: 'O(n)', space: 'O(n)' },
          testCases: [],
          pros: [],
          cons: [],
          alternatives: [],
        },
      };
    }

    if (modelName === 'gemini') {
      return {
        critique: {
          issues: [{ issue: 'Example issue', severity: 'medium' }],
          suggestions: ['Suggestion 1'],
          overallScore: 7,
        },
      };
    }

    // codex
    return {
      refinement: {
        improvements: ['Improved clarity'],
        finalCode: '// Refined code',
        confidence: 8,
      },
    };
  }

  /**
   * Create error response when model call fails.
   *
   * @param modelName - Model that failed
   * @returns Error ModelResponse
   */
  private createErrorResponse(modelName: ModelName): ModelResponse {
    return {
      modelName,
      role: 'proposer',
      content: '',
      metadata: {
        requestedAt: Date.now(),
        completedAt: Date.now(),
        inputTokens: 0,
        outputTokens: 0,
        modelVersion: this.getModelVersion(modelName),
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Model call failed',
          retryable: false,
        },
      },
    };
  }

  /**
   * Create empty rating matrix when round fails.
   *
   * @returns Empty RatingMatrix
   */
  private createEmptyRatingMatrix(): RatingMatrix {
    const empty = {
      score: 0,
      justification: 'Error occurred',
      timestamp: Date.now(),
    };

    return {
      ratings: {
        opus: { opus: empty, gemini: empty, codex: empty },
        gemini: { opus: empty, gemini: empty, codex: empty },
        codex: { opus: empty, gemini: empty, codex: empty },
      },
      averageScore: 0,
      standardDeviation: 0,
      agreementScore: 0,
    };
  }

  /**
   * Create error synthesis when round fails.
   *
   * @param iteration - Round number
   * @returns Error SynthesisResult
   */
  private createErrorSynthesis(iteration: number): SynthesisResult {
    return {
      roundNum: iteration,
      votes: {
        bestProposal: 'opus',
        voteCount: { opus: 0, gemini: 0, codex: 0 },
        consensus: false,
      },
      votingScore: 0,
      uncertaintyLevel: 100,
      rankedSolutions: [],
      convergenceAnalysis: {
        isConverging: false,
      },
      opusSynthesis: 'Error occurred during synthesis',
      metadata: {
        synthesizedAt: Date.now(),
        synthesizedBy: 'opus-model',
      },
    };
  }

  /**
   * Generate unique debate ID.
   *
   * @returns debate-{timestamp}-{randomHash}
   */
  private generateDebateId(): string {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 10);
    return `debate-${ts}-${rand}`;
  }

  /**
   * Estimate API cost for token usage.
   *
   * Placeholder: Real implementation would use actual pricing.
   *
   * @param modelName - Model called
   * @param inputTokens - Input token count
   * @param outputTokens - Output token count
   * @returns Estimated cost in USD
   */
  private estimateTokenCost(
    modelName: ModelName,
    inputTokens: number,
    outputTokens: number
  ): number {
    // Rough estimates (in $/1M tokens)
    const rates: Record<ModelName, { input: number; output: number }> = {
      opus: { input: 3, output: 15 },
      gemini: { input: 0.5, output: 1.5 },
      codex: { input: 0.8, output: 2.4 },
    };

    const rate = rates[modelName];
    return (
      (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000
    );
  }

  /**
   * Get model version identifier.
   *
   * @param modelName - Model name
   * @returns Model version string
   */
  private getModelVersion(modelName: ModelName): string {
    const versions: Record<ModelName, string> = {
      opus: 'claude-opus-4-5',
      gemini: 'gemini-2.0-flash',
      codex: 'claude-opus-4-5', // Codex is Claude
    };
    return versions[modelName];
  }

  /**
   * Get default temperature for model.
   *
   * @param modelName - Model name
   * @returns Temperature value (0.0-2.0)
   */
  private getTemperature(modelName: ModelName): number {
    const temps: Record<ModelName, number> = {
      opus: 0.7, // Balanced
      gemini: 0.8, // Slightly more creative for critique
      codex: 0.5, // More focused for refinement
    };
    return temps[modelName];
  }

  /**
   * Async delay utility.
   *
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // =========================================================================
  // LOGGING UTILITIES
  // =========================================================================

  /**
   * Log info level message.
   */
  private logInfo(...args: unknown[]): void {
    console.log(`[${this.debateId}] INFO:`, ...args);
  }

  /**
   * Log warning level message.
   */
  private logWarn(...args: unknown[]): void {
    console.warn(`[${this.debateId}] WARN:`, ...args);
  }

  /**
   * Log error level message.
   */
  private logError(...args: unknown[]): void {
    console.error(`[${this.debateId}] ERROR:`, ...args);
  }

  /**
   * Log debug level message (development only).
   */
  private logDebug(...args: unknown[]): void {
    if (process.env.DEBUG === '1') {
      console.log(`[${this.debateId}] DEBUG:`, ...args);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { OrchestrationState };
