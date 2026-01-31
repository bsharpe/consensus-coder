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
import { DebateState, DebateRound, SynthesisResult, ModelName } from './types/consensus-types';
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
export declare class ConsensusOrchestrator {
    private readonly problem;
    private readonly context;
    private readonly config;
    private readonly state;
    private debateState;
    private readonly debateId;
    /**
     * Constructor initializes debate parameters and default state.
     *
     * @param problem - The coding problem to solve
     * @param context - Optional additional context or constraints
     * @param config - Optional configuration overrides
     *
     * @throws Error if problem is empty or invalid
     */
    constructor(problem: string, context?: string, config?: Partial<ConsensusConfig>);
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
    run(): Promise<DebateState>;
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
    getState(): Promise<DebateState>;
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
    _buildPromptForTest(modelName: ModelName): string;
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
    private executeRound;
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
    private callModel;
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
    private checkConvergence;
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
    private buildPrompt;
    /**
     * Build Opus prompt (proposer role).
     *
     * Opus generates 3 alternative architectural approaches.
     */
    private buildOpusPrompt;
    /**
     * Build Gemini prompt (critic role).
     *
     * Gemini evaluates Opus's proposals and rates them (1-10).
     */
    private buildGeminiPrompt;
    /**
     * Build Codex prompt (refiner role).
     *
     * Codex synthesizes the best elements from proposals + feedback.
     */
    private buildCodexPrompt;
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
    private synthesizeRound;
    /**
     * Build a 3x3 rating matrix from model responses.
     *
     * Placeholder: In real implementation, parse ratings from response content.
     * For now, return a dummy matrix with realistic scores.
     *
     * @param responses - Model responses
     * @returns RatingMatrix with scores
     */
    private buildRatingMatrix;
    /**
     * Extract CodeSolution from the best-ranked solution.
     *
     * In a real implementation, this would parse the actual solution from the model response.
     * For now, creates a placeholder CodeSolution.
     *
     * @param round - The debate round
     * @returns CodeSolution or undefined
     */
    private extractSolution;
    /**
     * Get current iteration (for unit testing).
     *
     * @returns Current iteration number
     */
    _getCurrentIteration(): number;
    /**
     * Get last synthesis result (for unit testing).
     *
     * @returns Last synthesis or null
     */
    _getLastSynthesis(): SynthesisResult | null;
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
    private simulateLLMCall;
    /**
     * Parse model response to extract structured fields.
     *
     * Placeholder: Real implementation would parse JSON, code blocks, etc.
     *
     * @param modelName - Model that responded
     * @param content - Response content
     * @returns Parsed fields (solution, critique, refinement)
     */
    private parseModelResponse;
    /**
     * Create error response when model call fails.
     *
     * @param modelName - Model that failed
     * @returns Error ModelResponse
     */
    private createErrorResponse;
    /**
     * Create empty rating matrix when round fails.
     *
     * @returns Empty RatingMatrix
     */
    private createEmptyRatingMatrix;
    /**
     * Create error synthesis when round fails.
     *
     * @param iteration - Round number
     * @returns Error SynthesisResult
     */
    private createErrorSynthesis;
    /**
     * Generate unique debate ID.
     *
     * @returns debate-{timestamp}-{randomHash}
     */
    private generateDebateId;
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
    private estimateTokenCost;
    /**
     * Get model version identifier.
     *
     * @param modelName - Model name
     * @returns Model version string
     */
    private getModelVersion;
    /**
     * Get default temperature for model.
     *
     * @param modelName - Model name
     * @returns Temperature value (0.0-2.0)
     */
    private getTemperature;
    /**
     * Async delay utility.
     *
     * @param ms - Milliseconds to delay
     */
    private delay;
    /**
     * Log info level message.
     */
    private logInfo;
    /**
     * Log warning level message.
     */
    private logWarn;
    /**
     * Log error level message.
     */
    private logError;
    /**
     * Log debug level message (development only).
     */
    private logDebug;
}
export { ConsensusConfig, OrchestrationState };
