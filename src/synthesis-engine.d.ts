/**
 * Synthesis Engine - Consensus Aggregation & Analysis
 *
 * Aggregates all model responses from a debate round and produces:
 * - Voting alignment score (0-100)
 * - Uncertainty level (0-100)
 * - Synthesis narrative from Opus
 * - Ranked solutions by consensus
 * - Recommended next action (continue, converge, escalate)
 *
 * @module synthesis-engine
 * @version 1.0
 */
import { ModelResponse, SynthesisResult } from './types/consensus-types.js';
/**
 * Configuration options for SynthesisEngine
 */
export interface SynthesisEngineOptions {
    /** Model ID for Opus synthesis calls (default: 'anthropic/claude-opus-4-5') */
    opusModel?: string;
    /** Enable detailed metrics logging (default: false) */
    enableDetailedMetrics?: boolean;
    /** Logger function for comprehensive diagnostics */
    logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
    /** Timeout for Opus synthesis generation (ms, default: 30000) */
    synthesisTimeoutMs?: number;
}
/**
 * Input parameters for aggregateRound()
 */
export interface AggregateParams {
    /** Three proposals from Opus (R1) or synthesis (R2+) */
    opusProposals: ModelResponse[];
    /** Critique from Gemini */
    geminCritique: ModelResponse;
    /** Refined solution from Codex */
    codexRefinement: ModelResponse;
    /** Round number (1-5) */
    iteration: number;
    /** Prior round's synthesis (optional, for trend analysis) */
    previousSynthesis?: SynthesisResult;
}
/**
 * Recommended action after synthesis
 */
export type RecommendedAction = 'CONVERGE' | 'CONTINUE_DEBATE' | 'ESCALATE';
/**
 * Main synthesis engine for aggregating debate results and calculating convergence.
 *
 * Responsibilities:
 * 1. Extract and normalize ratings from all model responses
 * 2. Calculate voting alignment score (0-100)
 * 3. Calculate uncertainty level (0-100)
 * 4. Generate synthesis narrative via Opus
 * 5. Rank solutions by consensus strength
 * 6. Recommend next action (continue, converge, escalate)
 *
 * All calculations are deterministic and reproducible.
 * Error handling is graceful - always returns partial results.
 *
 * @class SynthesisEngine
 */
export declare class SynthesisEngine {
    private readonly opusModel;
    private readonly enableDetailedMetrics;
    private readonly logger;
    private readonly synthesisTimeoutMs;
    /**
     * Initialize the SynthesisEngine with optional configuration.
     *
     * @param options - Configuration options
     */
    constructor(options?: SynthesisEngineOptions);
    /**
     * Recommend next action based on convergence metrics.
     *
     * Logic:
     * - CONVERGE: votingScore >= 75 AND uncertaintyLevel <= 30
     * - ESCALATE: iteration >= 5 (max rounds reached)
     * - CONTINUE_DEBATE: otherwise (keep debating)
     *
     * @param votingScore - Current voting alignment (0-100)
     * @param uncertaintyLevel - Current uncertainty (0-100)
     * @param iteration - Current round number (1-5)
     * @returns Recommended action
     */
    recommendAction(votingScore: number, uncertaintyLevel: number, iteration: number): RecommendedAction;
    /**
     * Main entry point: Aggregate all responses from a debate round.
     *
     * Algorithm:
     * 1. Parse all responses (proposals, critique, refinement)
     * 2. Build rating matrix from extracted scores
     * 3. Calculate voting score (0-100)
     * 4. Calculate uncertainty level (0-100)
     * 5. Generate Opus synthesis narrative
     * 6. Rank solutions by aggregate score
     * 7. Return complete SynthesisResult
     *
     * @param params - Aggregation parameters
     * @returns SynthesisResult with all metrics
     */
    aggregateRound(params: AggregateParams): Promise<SynthesisResult>;
    /**
     * Validate input parameters.
     *
     * @param params - Parameters to validate
     * @throws Error if validation fails
     */
    private validateInputs;
    /**
     * Build rating matrix from all model responses.
     *
     * Extracts ratings from:
     * - Opus proposals (parsed from content)
     * - Gemini critique (parsed for proposal ratings)
     * - Codex refinement (parsed for confidence/ratings)
     *
     * Default rating: 5/10 (neutral) if parsing fails.
     *
     * @param responses - Model responses to extract ratings from
     * @returns RatingMatrixInternal with normalized scores
     */
    private buildRatingMatrix;
    /**
     * Calculate voting alignment score (0-100).
     *
     * Formula:
     * ```
     * weights = {
     *   "codex→proposal": 0.40,
     *   "opus→proposal": 0.30,
     *   "gemini→proposal": 0.30
     * }
     *
     * for each proposal:
     *   avgRating = (codexScore × 0.4 + opusScore × 0.3 + geminiScore × 0.3) / 10
     *   votingScore += avgRating
     *
     * votingScore = (votingScore / numProposals) × 100
     * ```
     *
     * Higher = more alignment on best solution.
     * 100 = all models rated same proposal highest.
     * 0 = all models rated different proposals highest.
     *
     * @param matrix - Rating matrix
     * @param proposals - Opus proposals for determining "best"
     * @returns Voting score (0-100, rounded to 1 decimal)
     */
    private calculateVotingScore;
    /**
     * Calculate uncertainty level (0-100).
     *
     * Measures disagreement across all ratings using standard deviation.
     *
     * Formula:
     * ```
     * allRatings = flatten([all scores from rating matrix])
     * mean = average(allRatings)
     * variance = avg((rating - mean)²)
     * stdDev = sqrt(variance)
     * uncertaintyLevel = (stdDev / 10) × 100  // normalize to 0-100
     * ```
     *
     * 0 = all models gave identical ratings (no uncertainty).
     * 100 = maximum disagreement (ratings spread across full range).
     *
     * @param matrix - Rating matrix
     * @returns Uncertainty level (0-100, rounded to 1 decimal)
     */
    private calculateUncertaintyLevel;
    /**
     * Generate synthesis narrative from Opus.
     *
     * Opus summarizes the round:
     * - Key agreements among models
     * - Main points of disagreement
     * - Which proposal has strongest consensus
     * - Recommended next steps
     *
     * @param params - Narrative generation parameters
     * @returns Synthesis narrative (2-3 paragraphs)
     */
    private generateNarrative;
    /**
     * Rank solutions by consensus strength.
     *
     * Scores each proposal based on weighted ratings:
     * - Codex rating: 1.5x weight (synthesizes best parts)
     * - Gemini rating: 1.2x weight (expert critique)
     * - Opus rating: 1.0x weight (proposer confidence)
     *
     * Formula:
     * ```
     * score(proposal) = (
     *   codex_rating × 1.5 +
     *   gemini_rating × 1.2 +
     *   opus_rating × 1.0
     * ) / 3.7  // sum of weights
     * ```
     *
     * Converted to 0-100 scale.
     *
     * @param matrix - Rating matrix
     * @param proposals - Opus proposals
     * @returns Ranked solutions (highest score first)
     */
    private rankSolutions;
    /**
     * Extract rating scores from response text using regex patterns.
     *
     * Looks for patterns like:
     * - "Proposal A: 8/10"
     * - "Score: 7"
     * - "Rating: 6.5/10"
     * - "8 out of 10"
     *
     * @param content - Response text to parse
     * @returns ExtractedRatings with scores for opus, gemini, codex
     */
    private extractRatingsFromResponse;
    /**
     * Extract confidence rating from a proposal response.
     *
     * Looks for patterns indicating confidence level.
     *
     * @param content - Proposal text
     * @returns Confidence score (1-10)
     */
    private extractConfidenceFromProposal;
    /**
     * Extract strengths and weaknesses from critique text.
     *
     * @param critiqueText - Critique content
     * @returns Object with keyStrengths and keyWeaknesses arrays
     */
    private extractStrengthsAndWeaknesses;
    /**
     * Calculate mean of numeric array.
     *
     * @param values - Array of numbers
     * @returns Mean value
     */
    private calculateMean;
    /**
     * Calculate standard deviation.
     *
     * @param values - Array of numbers
     * @param mean - Precomputed mean (optional)
     * @returns Standard deviation
     */
    private calculateStdDev;
    /**
     * Calculate agreement score based on rating vectors.
     *
     * Uses cosine similarity of each rater's vector.
     * 0 = no agreement, 1 = perfect agreement.
     *
     * @param matrix - Rating matrix
     * @returns Agreement score (0-1)
     */
    private calculateAgreementScore;
    /**
     * Calculate cosine similarity between two vectors.
     *
     * @param a - First vector
     * @param b - Second vector
     * @returns Similarity score (0-1)
     */
    private cosineSimilarity;
    /**
     * Flatten rating matrix into single array of all scores.
     *
     * @param ratings - Rating matrix
     * @returns Flat array of all scores
     */
    private flattenMatrix;
    /**
     * Build structured synthesis result from calculated metrics.
     *
     * @param params - Parameters for building result
     * @returns Complete SynthesisResult
     */
    private buildSynthesisResult;
    /**
     * Build narrative from metrics when Opus API call fails.
     *
     * @param params - Narrative parameters
     * @returns Fallback narrative text
     */
    private buildNarrativeFromMetrics;
    /**
     * Build fallback narrative when synthesis fails completely.
     *
     * @param params - Narrative parameters
     * @returns Fallback narrative
     */
    private buildFallbackNarrative;
    /**
     * Build partial result on error.
     *
     * @param roundNum - Round number
     * @param error - Error that occurred
     * @returns Partial SynthesisResult with defaults
     */
    private buildPartialResult;
}
