/**
 * Implementation Plan Generator
 *
 * Transforms converged debate consensus into detailed, step-by-step
 * implementation plans that Auggie (code agent) can execute.
 *
 * Flow:
 * 1. Accept converged DebateState (consensus achieved)
 * 2. Extract winning solution with supporting evidence
 * 3. Call Claude Opus to synthesize detailed implementation plan
 * 4. Parse response into structured ImplementationPlan
 * 5. Format plan as executable Auggie prompt
 * 6. Validate and return
 *
 * @module implementation-plan-generator
 * @version 1.0
 */
import { DebateState, DebateRound } from './types/consensus-types.js';
/**
 * Configuration options for ImplementationPlanGenerator
 */
export interface PlanGeneratorOptions {
    /** Model ID for Opus calls (default: 'anthropic/claude-opus-4-5') */
    opusModel?: string;
    /** Maximum words in generated plan (default: 3000) */
    maxPlanLength?: number;
    /** API key for Anthropic (required if ANTHROPIC_API_KEY not in env) */
    apiKey?: string;
    /** Timeout for Opus API call (ms, default: 60000) */
    opusTimeoutMs?: number;
    /** Enable verbose logging (default: false) */
    verbose?: boolean;
    /** Custom logger function */
    logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
}
/**
 * A single implementation step, actionable by Auggie
 */
export interface ImplementationStep {
    /** Step number (1-indexed) */
    number: number;
    /** Brief title of this step */
    title: string;
    /** Detailed description of what to do */
    description: string;
    /** Expected output or result of this step */
    expectedOutput: string;
    /** Files affected or created by this step */
    filesAffected?: string[];
    /** Estimated time in minutes */
    estimatedMinutes?: number;
}
/**
 * Extracted summary of the winning solution
 */
export interface SolutionSummary {
    /** The consensus solution text */
    solution: string;
    /** Voting agreement score (0-100) */
    votingScore: number;
    /** Uncertainty level (0-100) */
    uncertaintyLevel: number;
    /** Supporting narrative from synthesis */
    supportingNarrative: string;
    /** How many rounds were needed to reach consensus */
    roundsRequired: number;
    /** All debate rounds for context */
    allRoundsData: DebateRound[];
    /** Timestamp when consensus was reached */
    consensusTimestamp: number;
}
/**
 * Context passed to Opus for plan generation
 */
export interface PlanContext {
    /** Original problem statement */
    problem: string;
    /** The winning/consensus approach */
    winningApproach: string;
    /** Voting score (alignment) */
    votingScore: number;
    /** Uncertainty level (disagreement) */
    uncertaintyLevel: number;
    /** How many rounds to reach consensus */
    roundsRequired: number;
    /** Complete narrative history of all rounds */
    allRoundsNarrative: string;
    /** Summary of debate context */
    debateSummary: SolutionSummary;
    /** Max words for the plan */
    maxWords: number;
}
/**
 * Complete, structured implementation plan
 * Ready for Auggie to execute
 */
export interface ImplementationPlan {
    /** ID of the debate this plan came from */
    debateId: string;
    /** The winning approach (one-liner) */
    winningApproach: string;
    /** What we're building/fixing (objectives) */
    objectives: string[];
    /** Step-by-step implementation instructions */
    steps: ImplementationStep[];
    /** How to validate the implementation */
    testingStrategy: string;
    /** Estimated time to completion */
    timeEstimate: string;
    /** Dependencies and prerequisites */
    dependencies: string[];
    /** Risks and mitigation strategies */
    risksMitigation: string;
    /** How to rollback if something goes wrong */
    rollbackPlan: string;
    /** Code examples (if applicable) */
    codeExamples?: string;
    /** This is the prompt Auggie will read and execute */
    auggiePreparedPrompt: string;
    /** Metadata */
    metadata: {
        votingScore: number;
        uncertaintyLevel: number;
        roundsRequired: number;
        generatedAt: number;
    };
}
/**
 * Represents a plan validation error
 */
export declare class PlanValidationError extends Error {
    violations: string[];
    constructor(message: string, violations: string[]);
}
/**
 * Generates detailed implementation plans from converged debate states
 *
 * Usage:
 * ```typescript
 * const generator = new ImplementationPlanGenerator({
 *   opusModel: 'anthropic/claude-opus-4-5',
 *   verbose: true
 * });
 *
 * const plan = await generator.generatePlan(convergencedDebateState);
 * console.log(plan.auggiePreparedPrompt); // Ready for auggie --print
 * ```
 */
export declare class ImplementationPlanGenerator {
    private readonly opusModel;
    private readonly maxPlanLength;
    private readonly apiKey;
    private readonly opusTimeoutMs;
    private readonly verbose;
    private readonly logger;
    constructor(options?: PlanGeneratorOptions);
    /**
     * Main entry point: Generate implementation plan from converged debate state
     *
     * @param state - Converged DebateState (must have isConverged === true)
     * @returns Structured ImplementationPlan ready for Auggie
     * @throws Error if debate not converged or validation fails
     */
    generatePlan(state: DebateState): Promise<ImplementationPlan>;
    /**
     * Extract the winning/consensus solution from debate state
     *
     * @private
     */
    private extractWinningSolution;
    /**
     * Build context object for Opus prompt
     *
     * @private
     */
    private buildPlanContext;
    /**
     * Call Claude Opus to generate the implementation plan
     *
     * @private
     */
    private callOpusForPlan;
    /**
     * Call Anthropic API using fetch
     *
     * @private
     */
    private callAnthropicAPI;
    /**
     * Parse Opus's plan response into structured ImplementationPlan
     *
     * @private
     */
    private parsePlanResponse;
    /**
     * Parse numbered steps from text
     *
     * @private
     */
    private parseStepsFromText;
    /**
     * Generate default steps if parsing fails
     *
     * @private
     */
    private generateDefaultSteps;
    /**
     * Format the plan as an Auggie-executable prompt
     *
     * @private
     */
    private formatAuggiePreparedPrompt;
    /**
     * Validate that plan is executable
     *
     * @throws PlanValidationError if validation fails
     */
    validatePlan(plan: ImplementationPlan): Promise<boolean>;
}
export { DebateState, DebateRound } from './types/consensus-types.js';
