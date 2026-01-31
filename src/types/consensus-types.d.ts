/**
 * Consensus-Coder Type Definitions
 *
 * Core data structures for the multi-model debate system.
 * All interfaces are designed for strict TypeScript mode compliance.
 *
 * Data Flow:
 * 1. User submits problem → DebateState created
 * 2. Each round: ModelResponse collected from Opus/Gemini/Codex
 * 3. Models rate each other → RatingMatrix populated
 * 4. SynthesisEngine aggregates → SynthesisResult produced
 * 5. DebateRound stored in DebateState.rounds[]
 * 6. On convergence: CodeSolution extracted, implementation plan generated
 *
 * @version 1.0
 * @author Claude Opus (architecture), Auggie (implementation)
 */
/**
 * Primary state container for a single consensus-coder debate session.
 *
 * Stores all metadata, round history, convergence metrics, and final output.
 * Persisted to disk after every round to allow recovery from failures.
 *
 * @interface DebateState
 *
 * @example
 * ```typescript
 * const state: DebateState = {
 *   debateId: 'debate-abc123',
 *   problemId: 'prob-001',
 *   createdAt: Date.now(),
 *   userId: 'user-ben',
 *   currentRound: 3,
 *   maxRounds: 5,
 *   isConverged: false,
 *   problemStatement: 'Write a cache eviction strategy',
 *   rounds: [...],
 *   votingScore: 72,
 *   uncertaintyLevel: 35,
 *   ...
 * };
 * ```
 */
export interface DebateState {
    /**
     * Unique identifier for this debate session.
     * Format: `debate-{timestamp}-{randomHash}`
     * Used for file naming, logging, and recovery.
     *
     * @type {string}
     * @constraints Non-empty, UUID-like format
     */
    debateId: string;
    /**
     * User-provided identifier for the problem.
     * Can be a ticket ID, issue number, or short code.
     * Helpful for tracking which problem this debate solves.
     *
     * @type {string}
     * @constraints Non-empty
     */
    problemId: string;
    /**
     * Unix timestamp (milliseconds) when this debate was created.
     *
     * @type {number}
     * @constraints > 0, typically Date.now()
     */
    createdAt: number;
    /**
     * User ID of the debate initiator (typically Ben).
     * Used for permission checks and escalation routing.
     *
     * @type {string}
     * @constraints Non-empty
     */
    userId: string;
    /**
     * Current round number (1-indexed).
     * Starts at 1, increments after each executeRound().
     *
     * @type {number}
     * @constraints 1 <= currentRound <= maxRounds
     */
    currentRound: number;
    /**
     * Maximum number of debate rounds allowed.
     * Default: 5. If reached without convergence, escalate to human.
     *
     * @type {number}
     * @constraints maxRounds >= 1, typically 5
     */
    maxRounds: number;
    /**
     * The original coding problem statement.
     * Provided by user; passed to all models in every round.
     *
     * @type {string}
     * @constraints Non-empty, < 10,000 characters
     */
    problemStatement: string;
    /**
     * Optional constraints or additional context.
     * Examples: "Use TypeScript", "Performance critical", "Must support Node.js 20+"
     *
     * @type {string[] | undefined}
     * @constraints Each item < 500 characters
     */
    constraints?: string[];
    /**
     * Array of completed debate rounds.
     * Ordered chronologically. Length = (currentRound - 1).
     * Each round contains proposals, critiques, ratings, and synthesis.
     *
     * @type {DebateRound[]}
     * @constraints Immutable order; append-only
     */
    rounds: DebateRound[];
    /**
     * Voting agreement score (0-100).
     * Higher = more agreement on best solution.
     *
     * Calculation:
     * - 100: All 3 models chose same solution (consensus achieved)
     * - 75-99: 2 out of 3 models agree
     * - < 75: High disagreement across models
     *
     * @type {number}
     * @constraints 0 <= votingScore <= 100
     */
    votingScore: number;
    /**
     * Uncertainty/disagreement metric (0-100).
     * Lower = more agreement. Higher = models disagree on approach.
     *
     * Calculation:
     * - 0: All models have identical rating distributions
     * - 50: Moderate disagreement
     * - 100: Maximum disagreement (each model prefers different solution)
     *
     * Uses cosine similarity of rating vectors.
     *
     * @type {number}
     * @constraints 0 <= uncertaintyLevel <= 100
     */
    uncertaintyLevel: number;
    /**
     * Voting score threshold for convergence.
     * Default: 75. Convergence requires votingScore >= this value.
     * Configurable per debate via consensus-coder.config.json.
     *
     * @type {number}
     * @constraints 50 <= convergenceThreshold <= 100, typically 75
     */
    convergenceThreshold: number;
    /**
     * Uncertainty score threshold for convergence.
     * Default: 30. Convergence requires uncertaintyLevel <= this value.
     * Configurable per debate via consensus-coder.config.json.
     *
     * @type {number}
     * @constraints 0 <= uncertaintyThreshold <= 50, typically 30
     */
    uncertaintyThreshold: number;
    /**
     * Set to true when both convergence conditions are met:
     * - votingScore >= convergenceThreshold
     * - uncertaintyLevel <= uncertaintyThreshold
     *
     * Once true, debate stops and implementation plan is generated.
     *
     * @type {boolean}
     */
    isConverged: boolean;
    /**
     * Unix timestamp (milliseconds) when convergence was detected.
     * Only set if isConverged === true.
     *
     * @type {number | undefined}
     * @constraints > 0 if defined; typically Date.now()
     */
    convergedAt?: number;
    /**
     * Flag indicating if debate was escalated to human.
     * Escalation occurs when:
     * - Max rounds reached without convergence (round 5, no consensus)
     * - 3+ LLM API calls failed
     * - Models oscillate (diverging trend 3+ rounds)
     * - Explicit escalation requested by user
     *
     * @type {boolean}
     */
    shouldEscalate: boolean;
    /**
     * Unix timestamp when escalation was triggered.
     * Only set if shouldEscalate === true.
     *
     * @type {number | undefined}
     * @constraints > 0 if defined; typically Date.now()
     */
    escalatedAt?: number;
    /**
     * Human-readable reason for escalation.
     * Examples:
     * - "Max 5 rounds reached; voting score: 65%"
     * - "Models oscillating between 65% and 70% agreement"
     * - "Gemini API failed 3 times; cannot continue debate"
     *
     * @type {string | undefined}
     * @constraints < 500 characters if defined
     */
    escalationReason?: string;
    /**
     * The consensus solution when convergence is reached.
     * Extracted from highest-ranked solution in final round's synthesis.
     * Only populated if isConverged === true.
     *
     * @type {CodeSolution | undefined}
     */
    consensusSolution?: CodeSolution;
    /**
     * Step-by-step implementation plan generated by Opus after convergence.
     * Markdown format, designed for Auggie execution.
     * Only populated if isConverged === true.
     *
     * @type {string | undefined}
     * @constraints Markdown format, < 50,000 characters
     */
    implementationPlan?: string;
    /**
     * Status of Auggie execution if plan was handed off.
     * Possible values:
     * - "pending": Plan generated, awaiting Auggie pickup
     * - "running": Auggie is executing the plan
     * - "completed": Auggie finished successfully
     * - "failed": Auggie encountered errors
     * - null: No handoff attempted (debate escalated instead)
     *
     * @type {'pending' | 'running' | 'completed' | 'failed' | null}
     */
    auggieStatus?: 'pending' | 'running' | 'completed' | 'failed' | null;
    /**
     * Logs from Auggie execution (stdout + stderr).
     * Only set if auggieStatus !== null and !== 'pending'.
     *
     * @type {string | undefined}
     * @constraints < 100,000 characters if defined
     */
    auggieExecutionLog?: string;
    /**
     * Unix timestamp of last state save to disk.
     * Updated after every round. Used to detect staleness.
     *
     * @type {number}
     * @constraints > 0, typically Date.now()
     */
    persistedAt: number;
    /**
     * Schema version for state file.
     * Current: "1.0"
     * Used for migrations if schema changes in future versions.
     *
     * @type {string}
     * @constraints Semantic version format (e.g., "1.0", "2.1")
     */
    version: string;
}
/**
 * Container for one complete debate round.
 *
 * A round includes:
 * 1. Three parallel LLM calls (Opus proposal, Gemini critique, Codex refinement)
 * 2. Each model rates all three approaches
 * 3. Synthesis engine aggregates data
 * 4. Convergence metrics calculated
 *
 * @interface DebateRound
 */
export interface DebateRound {
    /**
     * Round number (1-indexed).
     * Matches the round during which this data was collected.
     *
     * @type {number}
     * @constraints 1 <= roundNum <= 5
     */
    roundNum: number;
    /**
     * Unix timestamp when this round started execution.
     *
     * @type {number}
     * @constraints > 0, typically Date.now()
     */
    timestamp: number;
    /**
     * Opus's proposal (Round 1) or synthesis (Rounds 2+).
     * Round 1: Proposes 3 alternative solutions.
     * Rounds 2+: Summarizes round and provides strategic guidance.
     *
     * @type {ModelResponse}
     * @constraints Fully populated with solution or critique field
     */
    opusProposal: ModelResponse;
    /**
     * Gemini's critique and ratings of all proposals.
     * Provides structured evaluation with scores and suggestions.
     *
     * @type {ModelResponse}
     * @constraints Fully populated with critique field
     */
    geminiCritique: ModelResponse;
    /**
     * Codex's (Claude) refinement of the best solution.
     * Takes the highest-rated proposal and improves it.
     *
     * @type {ModelResponse}
     * @constraints Fully populated with refinement field
     */
    codexRefinement: ModelResponse;
    /**
     * 3x3 rating matrix: each model rates all three proposals.
     * Used to calculate voting score and uncertainty level.
     *
     * @type {RatingMatrix}
     */
    ratings: RatingMatrix;
    /**
     * Aggregated synthesis results for this round.
     * Includes convergence analysis, ranked solutions, and synthesis narrative.
     *
     * @type {SynthesisResult}
     */
    synthesis: SynthesisResult;
    /**
     * Total time (milliseconds) for all three LLM calls to complete.
     * Includes API latency, parsing, and synthesis time.
     *
     * @type {number}
     * @constraints > 0
     */
    durationMs: number;
    /**
     * Per-model token usage and estimated API cost.
     *
     * @type {object}
     * @property opus - Opus API tokens and cost estimate
     * @property gemini - Gemini API tokens and cost estimate
     * @property codex - Codex (Claude) API tokens and cost estimate
     */
    apiCalls: {
        opus: {
            tokens: number;
            cost: number;
        };
        gemini: {
            tokens: number;
            cost: number;
        };
        codex: {
            tokens: number;
            cost: number;
        };
    };
}
/**
 * Encapsulates one model's response in a debate round.
 *
 * Contains raw LLM output plus structured fields extracted via parsing.
 * Supports three roles: proposer (Opus R1), critic (Gemini), refiner (Codex).
 *
 * @interface ModelResponse
 */
export interface ModelResponse {
    /**
     * Which model produced this response.
     * "opus" | "gemini" | "codex"
     *
     * @type {'opus' | 'gemini' | 'codex'}
     */
    modelName: 'opus' | 'gemini' | 'codex';
    /**
     * Role this model played in this round.
     * - "proposer": Suggests solution(s)
     * - "critic": Reviews and rates proposals
     * - "refiner": Improves best proposal
     *
     * @type {'proposer' | 'critic' | 'refiner'}
     */
    role: 'proposer' | 'critic' | 'refiner';
    /**
     * Complete raw response from LLM API.
     * Stored for debugging, audit, and fallback parsing.
     *
     * @type {string}
     * @constraints Non-empty, < 100,000 characters
     */
    content: string;
    /**
     * Extracted solution (if role === "proposer").
     * Populated by Opus in Round 1.
     * Null for other roles or rounds.
     *
     * @type {CodeSolution | undefined}
     */
    solution?: CodeSolution;
    /**
     * Extracted critique (if role === "critic").
     * Populated by Gemini in all rounds.
     * Contains: issues, suggestions, overall score (1-10).
     *
     * @type {object | undefined}
     * @property issues - Array of identified problems with severity
     * @property suggestions - List of improvement recommendations
     * @property overallScore - Numeric rating of all proposals (1-10)
     */
    critique?: {
        issues: Array<{
            issue: string;
            severity: 'low' | 'medium' | 'high';
        }>;
        suggestions: string[];
        overallScore: number;
    };
    /**
     * Extracted refinement (if role === "refiner").
     * Populated by Codex in all rounds.
     * Contains: improvements made, final code, confidence (1-10).
     *
     * @type {object | undefined}
     * @property improvements - List of changes made
     * @property finalCode - Refined/improved code
     * @property confidence - Model's confidence in refinement (1-10)
     */
    refinement?: {
        improvements: string[];
        finalCode: string;
        confidence: number;
    };
    /**
     * Detailed metadata about this API call and response.
     *
     * @type {object}
     * @property requestedAt - Unix timestamp of API call
     * @property completedAt - Unix timestamp of response receipt
     * @property inputTokens - Tokens in the API request
     * @property outputTokens - Tokens in the API response
     * @property modelVersion - API model identifier (e.g., "claude-opus-4-5")
     * @property temperature - Sampling temperature used (0.0-2.0)
     * @property error - Error details if API call failed
     */
    metadata: {
        requestedAt: number;
        completedAt: number;
        inputTokens: number;
        outputTokens: number;
        modelVersion: string;
        temperature?: number;
        error?: {
            code: string;
            message: string;
            retryable: boolean;
        };
    };
}
/**
 * 3x3 matrix of ratings where each model rates all three approaches.
 *
 * Structure:
 * ```
 * Rows (Raters):     Opus, Gemini, Codex
 * Columns (Ratees):  Opus, Gemini, Codex
 *
 * Example:
 *   opus rates opus=9, gemini=6, codex=7
 *   gemini rates opus=8, gemini=5, codex=8
 *   codex rates opus=8, gemini=6, codex=7
 * ```
 *
 * Used to calculate voting score (who agrees on best solution?)
 * and uncertainty level (how much do ratings vary?).
 *
 * @interface RatingMatrix
 */
export interface RatingMatrix {
    /**
     * Nested rating structure: { rater: { ratee: { score, justification, timestamp } } }
     *
     * @type {object}
     * @property opus - Ratings given by Opus
     * @property gemini - Ratings given by Gemini
     * @property codex - Ratings given by Codex
     */
    ratings: {
        [rater in 'opus' | 'gemini' | 'codex']: {
            [ratee in 'opus' | 'gemini' | 'codex']: {
                /**
                 * Numeric score for this proposal (1-10).
                 * 10 = best, 1 = worst.
                 *
                 * @type {number}
                 * @constraints 1 <= score <= 10
                 */
                score: number;
                /**
                 * Brief explanation of why this score was given.
                 * Parsed from LLM response.
                 *
                 * @type {string}
                 * @constraints < 300 characters
                 */
                justification: string;
                /**
                 * Unix timestamp when this rating was recorded.
                 *
                 * @type {number}
                 * @constraints > 0
                 */
                timestamp: number;
            };
        };
    };
    /**
     * Aggregated average score across all rater-ratee pairs.
     * Mean of all 9 rating scores.
     *
     * @type {number}
     * @constraints 1 <= averageScore <= 10
     */
    averageScore: number;
    /**
     * Standard deviation of all 9 scores.
     * High stdev = high disagreement.
     *
     * @type {number}
     * @constraints >= 0
     */
    standardDeviation: number;
    /**
     * Agreement score based on cosine similarity of rating vectors.
     * Used to calculate uncertainty level.
     * 0 = no agreement, 1 = perfect agreement.
     *
     * @type {number}
     * @constraints 0 <= agreementScore <= 1
     */
    agreementScore: number;
}
/**
 * Aggregated synthesis of one debate round.
 *
 * Produced by SynthesisEngine after all model responses are received.
 * Contains convergence metrics, ranked solutions, and strategic guidance.
 *
 * @interface SynthesisResult
 */
export interface SynthesisResult {
    /**
     * Round number this synthesis covers.
     *
     * @type {number}
     * @constraints 1 <= roundNum <= 5
     */
    roundNum: number;
    /**
     * Voting tallies from the rating matrix.
     *
     * @type {object}
     * @property bestProposal - Which model's solution won ("opus" | "gemini" | "codex")
     * @property voteCount - Tally of votes for each model
     * @property consensus - True if all 3 models chose the same winner
     */
    votes: {
        /**
         * Which model's solution received the most votes.
         * Ties broken by average score.
         *
         * @type {'opus' | 'gemini' | 'codex'}
         */
        bestProposal: string;
        /**
         * Vote counts for each model.
         *
         * @type {object}
         * @property opus - Number of models that voted for Opus's solution
         * @property gemini - Number of models that voted for Gemini's solution
         * @property codex - Number of models that voted for Codex's solution
         */
        voteCount: {
            opus: number;
            gemini: number;
            codex: number;
        };
        /**
         * True if all 3 models voted for the same solution (3-0).
         *
         * @type {boolean}
         */
        consensus: boolean;
    };
    /**
     * Voting agreement score (0-100).
     * - 100: All 3 agreed
     * - 75: 2 out of 3 agreed
     * - 25: All 3 disagreed
     *
     * @type {number}
     * @constraints 0 <= votingScore <= 100
     */
    votingScore: number;
    /**
     * Uncertainty/disagreement level (0-100).
     * Based on stdev and disagreement of rating vectors.
     *
     * @type {number}
     * @constraints 0 <= uncertaintyLevel <= 100
     */
    uncertaintyLevel: number;
    /**
     * Solutions ranked by consensus strength.
     * Position 0 = best, position 2 = worst.
     *
     * @type {Array<RankedSolution>}
     * @constraints length === 3 (always three models)
     */
    rankedSolutions: Array<{
        /**
         * Rank position (1, 2, or 3).
         *
         * @type {number}
         * @constraints rank === index + 1
         */
        rank: number;
        /**
         * Which model's solution this is.
         *
         * @type {string}
         */
        modelName: string;
        /**
         * Average score from all raters (1-10 normalized to 0-100).
         *
         * @type {number}
         * @constraints 0 <= score <= 100
         */
        score: number;
        /**
         * Confidence in this ranking (0-100).
         * Based on how much models agreed on this solution.
         *
         * @type {number}
         * @constraints 0 <= confidence <= 100
         */
        confidence: number;
        /**
         * Key strengths identified in critique.
         * Extracted from Gemini's feedback.
         *
         * @type {string[]}
         */
        keyStrengths: string[];
        /**
         * Key weaknesses identified in critique.
         * Extracted from Gemini's feedback.
         *
         * @type {string[]}
         */
        keyWeaknesses: string[];
    }>;
    /**
     * Analysis of convergence progress and trend.
     *
     * @type {object}
     * @property isConverging - True if trend is improving toward consensus
     * @property trendFromPreviousRound - Direction: "improving" | "stable" | "diverging"
     * @property predictedConvergenceRound - Estimated round for convergence (if trend continues)
     */
    convergenceAnalysis: {
        /**
         * True if votingScore is rising and uncertaintyLevel is falling.
         *
         * @type {boolean}
         */
        isConverging: boolean;
        /**
         * Trend direction compared to previous round.
         * - "improving": votingScore up ≥5, uncertaintyLevel down ≥5
         * - "stable": changes within ±5
         * - "diverging": votingScore down ≥5 or uncertaintyLevel up ≥5
         *
         * @type {'improving' | 'stable' | 'diverging' | undefined}
         */
        trendFromPreviousRound?: 'improving' | 'stable' | 'diverging';
        /**
         * Predicted round when convergence threshold will be reached.
         * Calculated via linear regression of voting score trend.
         * Null if trend is not converging.
         *
         * @type {number | undefined}
         * @constraints predictedConvergenceRound > roundNum if defined
         */
        predictedConvergenceRound?: number;
    };
    /**
     * Opus's summary of this round in markdown format.
     * Includes:
     * - Key agreements and disagreements
     * - Why models rated solutions as they did
     * - Strategic guidance for next round (if needed)
     * - Areas of uncertainty that need resolution
     *
     * @type {string}
     * @constraints Non-empty, < 10,000 characters, markdown format
     */
    opusSynthesis: string;
    /**
     * Synthesis generation metadata.
     *
     * @type {object}
     * @property synthesizedAt - Unix timestamp when synthesis was completed
     * @property synthesizedBy - Always "opus-model" (Opus generates synthesis)
     */
    metadata: {
        synthesizedAt: number;
        synthesizedBy: 'opus-model';
    };
}
/**
 * A complete code solution with explanation and alternatives.
 *
 * Extracted from the highest-ranked proposal after convergence.
 * Used to generate implementation plan and hand off to Auggie.
 *
 * @interface CodeSolution
 */
export interface CodeSolution {
    /**
     * The actual implementation code.
     * Language specified in the `language` field.
     *
     * @type {string}
     * @constraints Non-empty, < 50,000 characters
     */
    code: string;
    /**
     * Programming language of the code.
     * Examples: "typescript", "python", "rust", "go"
     *
     * @type {string}
     * @constraints Non-empty, lowercase
     */
    language: string;
    /**
     * High-level explanation of what this solution does.
     * 2-3 sentences.
     *
     * @type {string}
     * @constraints Non-empty, < 500 characters
     */
    explanation: string;
    /**
     * Detailed description of the approach/algorithm.
     * Explains design decisions and key trade-offs.
     *
     * @type {string}
     * @constraints Non-empty, < 2,000 characters
     */
    approach: string;
    /**
     * Time and space complexity analysis.
     *
     * @type {object}
     * @property time - Big-O time complexity (e.g., "O(n log n)")
     * @property space - Big-O space complexity (e.g., "O(n)")
     */
    complexity: {
        time: string;
        space: string;
    };
    /**
     * Example test cases demonstrating usage.
     * Each includes input and expected output.
     *
     * @type {Array<object>}
     * @property input - Input description or example
     * @property output - Expected output description or example
     */
    testCases: Array<{
        input: string;
        output: string;
    }>;
    /**
     * Advantages of this solution.
     * Key strengths highlighted in debate.
     *
     * @type {string[]}
     * @constraints Each item < 200 characters
     */
    pros: string[];
    /**
     * Disadvantages or trade-offs of this solution.
     * Potential issues identified in debate.
     *
     * @type {string[]}
     * @constraints Each item < 200 characters
     */
    cons: string[];
    /**
     * Alternative approaches considered but not chosen.
     * Brief descriptions of why consensus preferred this solution.
     *
     * @type {string[]}
     * @constraints Each item < 300 characters
     */
    alternatives: string[];
}
/**
 * Minimum and maximum values for validation.
 *
 * Use these to validate input and state transitions.
 * Example: if (state.votingScore < DEBATE_CONSTRAINTS.votingScore.min) throw Error()
 *
 * @constant
 */
export declare const DEBATE_CONSTRAINTS: {
    readonly debateId: {
        readonly pattern: RegExp;
    };
    readonly currentRound: {
        readonly min: 1;
        readonly max: 5;
    };
    readonly maxRounds: {
        readonly min: 1;
        readonly max: 10;
    };
    readonly votingScore: {
        readonly min: 0;
        readonly max: 100;
    };
    readonly uncertaintyLevel: {
        readonly min: 0;
        readonly max: 100;
    };
    readonly convergenceThreshold: {
        readonly min: 50;
        readonly max: 100;
        readonly default: 75;
    };
    readonly uncertaintyThreshold: {
        readonly min: 0;
        readonly max: 50;
        readonly default: 30;
    };
    readonly modelRating: {
        readonly min: 1;
        readonly max: 10;
    };
    readonly confidenceScore: {
        readonly min: 0;
        readonly max: 100;
    };
    readonly temperatureRange: {
        readonly min: 0;
        readonly max: 2;
    };
    readonly maxContentLength: {
        readonly problem: 10000;
        readonly response: 100000;
        readonly plan: 50000;
    };
};
/**
 * Type-safe model names.
 * Use instead of string literals where possible.
 *
 * @type {'opus' | 'gemini' | 'codex'}
 */
export type ModelName = 'opus' | 'gemini' | 'codex';
/**
 * Type-safe model roles in a debate.
 *
 * @type {'proposer' | 'critic' | 'refiner'}
 */
export type ModelRole = 'proposer' | 'critic' | 'refiner';
/**
 * Convergence trend directions.
 *
 * @type {'improving' | 'stable' | 'diverging'}
 */
export type ConvergenceTrend = 'improving' | 'stable' | 'diverging';
/**
 * Escalation reasons.
 *
 * @type {'max-rounds' | 'api-failures' | 'oscillation' | 'user-requested' | 'other'}
 */
export type EscalationReason = 'max-rounds' | 'api-failures' | 'oscillation' | 'user-requested' | 'other';
/**
 * Auggie execution status.
 *
 * @type {'pending' | 'running' | 'completed' | 'failed'}
 */
export type AuggieStatus = 'pending' | 'running' | 'completed' | 'failed';
/**
 * Config for consensus-coder skill.
 * Loaded from consensus-coder.config.json.
 *
 * @interface ConsensusCoderConfig
 */
export interface ConsensusCoderConfig {
    convergenceThreshold: number;
    uncertaintyThreshold: number;
    maxRounds: number;
    llmTimeoutMs: number;
    apiRetryAttempts: number;
    apiRetryBackoffMs: number;
    debateStateDir: string;
    enableCodebakeIntegration: boolean;
    models: {
        opus: {
            model: string;
            temperature: number;
        };
        gemini: {
            model: string;
            temperature: number;
        };
        codex: {
            model: string;
            temperature: number;
        };
    };
}
/**
 * Result of a consensus debate (final output).
 *
 * @interface ConsensusResult
 */
export interface ConsensusResult {
    status: 'implemented' | 'escalated' | 'in-progress';
    debateId: string;
    resultUrl?: string;
    consensusSolution?: CodeSolution;
    implementationPlan?: string;
    escalationReason?: string;
    rounds: number;
    finalVotingScore: number;
    finalUncertaintyLevel: number;
    totalTokens: number;
    estimatedCost: number;
    completedAt: number;
}
