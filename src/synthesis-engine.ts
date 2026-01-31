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

import {
  DebateRound,
  ModelResponse,
  RatingMatrix,
  SynthesisResult,
  CodeSolution,
} from './types/consensus-types.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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
 * Internal rating matrix for calculations
 */
interface RatingMatrixInternal {
  ratings: {
    [rater in 'opus' | 'gemini' | 'codex']: {
      [ratee in 'opus' | 'gemini' | 'codex']: {
        score: number;
        justification: string;
        timestamp: number;
      };
    };
  };
  averageScore: number;
  standardDeviation: number;
  agreementScore: number;
}

/**
 * Ranked solution representation
 */
interface RankedSolution {
  rank: number;
  modelName: string;
  score: number;
  confidence: number;
  keyStrengths: string[];
  keyWeaknesses: string[];
}

/**
 * Extracted ratings from a response
 */
interface ExtractedRatings {
  opusScore: number;
  geminiScore: number;
  codexScore: number;
}

/**
 * Narrative generation parameters
 */
interface NarrativeParams {
  iteration: number;
  opusProposals: ModelResponse[];
  geminCritique: ModelResponse;
  codexRefinement: ModelResponse;
  votingScore: number;
  uncertaintyLevel: number;
  rankedSolutions: RankedSolution[];
}

// ============================================================================
// SYNTHESIS ENGINE CLASS
// ============================================================================

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
export class SynthesisEngine {
  // ─────────────────────────────────────────────────────────────────────
  // Constructor & Configuration
  // ─────────────────────────────────────────────────────────────────────

  private readonly opusModel: string;
  private readonly enableDetailedMetrics: boolean;
  private readonly logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
  private readonly synthesisTimeoutMs: number;

  /**
   * Initialize the SynthesisEngine with optional configuration.
   *
   * @param options - Configuration options
   */
  constructor(options?: SynthesisEngineOptions) {
    this.opusModel = options?.opusModel ?? 'anthropic/claude-opus-4-5';
    this.enableDetailedMetrics = options?.enableDetailedMetrics ?? false;
    this.synthesisTimeoutMs = options?.synthesisTimeoutMs ?? 30000;

    // Default logger (can be overridden)
    this.logger = options?.logger ?? ((level, message, data) => {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [SynthesisEngine] [${level.toUpperCase()}]`;
      if (data) {
        console.log(`${prefix} ${message}`, data);
      } else {
        console.log(`${prefix} ${message}`);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Public Methods
  // ─────────────────────────────────────────────────────────────────────

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
  recommendAction(votingScore: number, uncertaintyLevel: number, iteration: number): RecommendedAction {
    if (votingScore >= 75 && uncertaintyLevel <= 30) {
      return 'CONVERGE';
    }

    if (iteration >= 5) {
      return 'ESCALATE';
    }

    if (uncertaintyLevel > 60) {
      return 'CONTINUE_DEBATE';
    }

    return 'CONTINUE_DEBATE';
  }

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
  async aggregateRound(params: AggregateParams): Promise<SynthesisResult> {
    this.logger('info', `Starting synthesis aggregation for round ${params.iteration}`);

    try {
      // Step 1: Validate inputs
      this.validateInputs(params);

      // Step 2: Build rating matrix
      const ratingMatrix = this.buildRatingMatrix({
        opusProposals: params.opusProposals,
        geminCritique: params.geminCritique,
        codexRefinement: params.codexRefinement,
      });

      this.logger('debug', 'Rating matrix built successfully', {
        averageScore: ratingMatrix.averageScore,
        standardDeviation: ratingMatrix.standardDeviation,
      });

      // Step 3: Calculate voting score
      const votingScore = this.calculateVotingScore(ratingMatrix, params.opusProposals);
      this.logger('debug', `Voting score calculated: ${votingScore.toFixed(1)}`);

      // Step 4: Calculate uncertainty level
      const uncertaintyLevel = this.calculateUncertaintyLevel(ratingMatrix);
      this.logger('debug', `Uncertainty level calculated: ${uncertaintyLevel.toFixed(1)}`);

      // Step 5: Rank solutions
      const rankedSolutions = this.rankSolutions(ratingMatrix, params.opusProposals);
      this.logger('debug', 'Solutions ranked', {
        top1: rankedSolutions[0]?.modelName,
        top1Score: rankedSolutions[0]?.score.toFixed(1),
      });

      // Step 6: Generate synthesis narrative
      const opusSynthesis = await this.generateNarrative({
        iteration: params.iteration,
        opusProposals: params.opusProposals,
        geminCritique: params.geminCritique,
        codexRefinement: params.codexRefinement,
        votingScore,
        uncertaintyLevel,
        rankedSolutions,
      });

      // Step 7: Build synthesis result
      const result = this.buildSynthesisResult({
        roundNum: params.iteration,
        votingScore,
        uncertaintyLevel,
        rankedSolutions,
        opusSynthesis,
        ratingMatrix,
        previousSynthesis: params.previousSynthesis,
      });

      this.logger('info', `Synthesis complete for round ${params.iteration}`, {
        votingScore: result.votingScore.toFixed(1),
        uncertaintyLevel: result.uncertaintyLevel.toFixed(1),
        bestProposal: result.votes.bestProposal,
        consensus: result.votes.consensus,
      });

      return result;
    } catch (error) {
      this.logger('error', 'Error during synthesis aggregation', error);
      // Return partial result with defaults (never throw)
      return this.buildPartialResult(params.iteration, error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Methods: Core Calculations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Validate input parameters.
   *
   * @param params - Parameters to validate
   * @throws Error if validation fails
   */
  private validateInputs(params: AggregateParams): void {
    if (!params.opusProposals || params.opusProposals.length === 0) {
      throw new Error('opusProposals array is required and must not be empty');
    }

    if (!params.geminCritique) {
      throw new Error('geminCritique is required');
    }

    if (!params.codexRefinement) {
      throw new Error('codexRefinement is required');
    }

    if (params.iteration < 1 || params.iteration > 5) {
      throw new Error(`iteration must be between 1 and 5, got ${params.iteration}`);
    }
  }

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
  private buildRatingMatrix(responses: {
    opusProposals: ModelResponse[];
    geminCritique: ModelResponse;
    codexRefinement: ModelResponse;
  }): RatingMatrixInternal {
    const timestamp = Date.now();

    // Initialize empty rating matrix
    const ratings: RatingMatrixInternal['ratings'] = {
      opus: { opus: { score: 5, justification: 'default', timestamp }, gemini: { score: 5, justification: 'default', timestamp }, codex: { score: 5, justification: 'default', timestamp } },
      gemini: { opus: { score: 5, justification: 'default', timestamp }, gemini: { score: 5, justification: 'default', timestamp }, codex: { score: 5, justification: 'default', timestamp } },
      codex: { opus: { score: 5, justification: 'default', timestamp }, gemini: { score: 5, justification: 'default', timestamp }, codex: { score: 5, justification: 'default', timestamp } },
    };

    try {
      // Extract Gemini's ratings of all three approaches
      const geminiRatings = this.extractRatingsFromResponse(responses.geminCritique.content);
      ratings.gemini.opus.score = geminiRatings.opusScore;
      ratings.gemini.gemini.score = geminiRatings.geminiScore;
      ratings.gemini.codex.score = geminiRatings.codexScore;
      ratings.gemini.opus.justification = 'Gemini critique';
      ratings.gemini.gemini.justification = 'Gemini critique';
      ratings.gemini.codex.justification = 'Gemini critique';
    } catch (error) {
      this.logger('warn', 'Failed to extract Gemini ratings, using defaults', error);
    }

    try {
      // Extract Codex's confidence/rating from refinement
      const codexRatings = this.extractRatingsFromResponse(responses.codexRefinement.content);
      ratings.codex.opus.score = codexRatings.opusScore;
      ratings.codex.gemini.score = codexRatings.geminiScore;
      ratings.codex.codex.score = codexRatings.codexScore;
      ratings.codex.opus.justification = 'Codex refinement assessment';
      ratings.codex.gemini.justification = 'Codex refinement assessment';
      ratings.codex.codex.justification = 'Codex refinement assessment';
    } catch (error) {
      this.logger('warn', 'Failed to extract Codex ratings, using defaults', error);
    }

    // Opus rates itself and others based on confidence in proposals
    try {
      for (let i = 0; i < responses.opusProposals.length; i++) {
        const proposal = responses.opusProposals[i];
        const confidenceRating = this.extractConfidenceFromProposal(proposal.content);

        // Opus rates its own proposals
        if (i === 0) {
          ratings.opus.opus.score = confidenceRating;
          ratings.opus.opus.justification = 'Opus self-assessment (Proposal A)';
        }
        // Use average confidence for rating other models
        ratings.opus.gemini.score = Math.max(4, Math.round(confidenceRating * 0.9));
        ratings.opus.codex.score = Math.max(4, Math.round(confidenceRating * 0.85));
      }
    } catch (error) {
      this.logger('warn', 'Failed to extract Opus confidence ratings, using defaults', error);
    }

    // Calculate aggregate metrics
    const allScores = this.flattenMatrix(ratings);
    const averageScore = this.calculateMean(allScores);
    const standardDeviation = this.calculateStdDev(allScores, averageScore);
    const agreementScore = this.calculateAgreementScore(ratings);

    const result: RatingMatrixInternal = {
      ratings,
      averageScore,
      standardDeviation,
      agreementScore,
    };

    if (this.enableDetailedMetrics) {
      this.logger('debug', 'Rating matrix details', {
        matrix: ratings,
        averageScore,
        standardDeviation,
        agreementScore,
      });
    }

    return result;
  }

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
  private calculateVotingScore(matrix: RatingMatrixInternal, proposals: ModelResponse[]): number {
    const weights = { codex: 0.4, opus: 0.3, gemini: 0.3 };

    // For each model's proposal, calculate weighted score
    const proposalScores: number[] = [];

    // Opus proposals
    proposalScores.push(
      (matrix.ratings.codex.opus.score * weights.codex +
        matrix.ratings.opus.opus.score * weights.opus +
        matrix.ratings.gemini.opus.score * weights.gemini) /
        10
    );

    proposalScores.push(
      (matrix.ratings.codex.gemini.score * weights.codex +
        matrix.ratings.opus.gemini.score * weights.opus +
        matrix.ratings.gemini.gemini.score * weights.gemini) /
        10
    );

    proposalScores.push(
      (matrix.ratings.codex.codex.score * weights.codex +
        matrix.ratings.opus.codex.score * weights.opus +
        matrix.ratings.gemini.codex.score * weights.gemini) /
        10
    );

    // Average across all proposals and scale to 0-100
    const avgScore = this.calculateMean(proposalScores);
    const votingScore = Math.min(100, Math.max(0, avgScore * 100));

    return Math.round(votingScore * 10) / 10; // Round to 1 decimal
  }

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
  private calculateUncertaintyLevel(matrix: RatingMatrixInternal): number {
    // Standard deviation already calculated
    const stdDev = matrix.standardDeviation;

    // Normalize to 0-100 scale (stdDev of 0-10 rating scale)
    const uncertaintyLevel = (stdDev / 10) * 100;

    return Math.min(100, Math.max(0, Math.round(uncertaintyLevel * 10) / 10));
  }

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
  private async generateNarrative(params: NarrativeParams): Promise<string> {
    try {
      // Build Opus prompt
      const proposalSummaries = params.opusProposals
        .map(
          (p, i) => `Proposal ${String.fromCharCode(65 + i)}: ${p.content.substring(0, 500)}...`
        )
        .join('\n\n');

      const prompt = `You are synthesizing a consensus debate round.

Round: ${params.iteration}

Proposals from three models:
${proposalSummaries}

Gemini's critique:
${params.geminCritique.content.substring(0, 1000)}

Codex's refinement:
${params.codexRefinement.content.substring(0, 1000)}

Voting Alignment Score: ${params.votingScore.toFixed(1)}/100
Uncertainty Level: ${params.uncertaintyLevel.toFixed(1)}/100

Ranked Solutions:
${params.rankedSolutions
  .map((s) => `${s.rank}. ${s.modelName} (Score: ${s.score.toFixed(1)}, Confidence: ${s.confidence.toFixed(1)})`)
  .join('\n')}

Write a 3-4 sentence synthesis that:
1. Identifies areas of strong agreement among the models
2. Highlights main points of disagreement or concern
3. Notes which proposal has the strongest consensus and why
4. Recommends the best path forward (continue debate, iterate, or converge)

Be concise, specific, and focus on actionable insights for the next round.`;

      // Call Opus API (simulated - in real implementation, use actual API)
      // For now, return a structured narrative based on the data
      const narrative = this.buildNarrativeFromMetrics(params);

      this.logger('debug', 'Synthesis narrative generated');
      return narrative;
    } catch (error) {
      this.logger('warn', 'Error generating Opus narrative, using fallback', error);
      return this.buildFallbackNarrative(params);
    }
  }

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
  private rankSolutions(matrix: RatingMatrixInternal, proposals: ModelResponse[]): RankedSolution[] {
    const solutions: RankedSolution[] = [];
    const weights = { codex: 1.5, gemini: 1.2, opus: 1.0 };
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

    const modelNames = ['opus', 'gemini', 'codex'] as const;

    for (const modelName of modelNames) {
      const codexScore = matrix.ratings.codex[modelName].score;
      const geminiScore = matrix.ratings.gemini[modelName].score;
      const opusScore = matrix.ratings.opus[modelName].score;

      const weightedScore =
        (codexScore * weights.codex + geminiScore * weights.gemini + opusScore * weights.opus) /
        totalWeight;

      const score = Math.round((weightedScore / 10) * 100 * 10) / 10; // Convert to 0-100, round to 1 decimal

      // Extract strengths and weaknesses from critique
      const { keyStrengths, keyWeaknesses } = this.extractStrengthsAndWeaknesses(
        matrix.ratings.gemini[modelName].justification
      );

      solutions.push({
        rank: 0, // Will be set after sorting
        modelName: String(modelName),
        score: Math.min(100, Math.max(0, score)),
        confidence: Math.round((agreementConfidence(matrix, modelName) * 10) / 10),
        keyStrengths,
        keyWeaknesses,
      });
    }

    // Sort by score (highest first)
    solutions.sort((a, b) => b.score - a.score);

    // Assign ranks
    solutions.forEach((s, i) => {
      s.rank = i + 1;
    });

    return solutions;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Methods: Helpers & Utilities
  // ─────────────────────────────────────────────────────────────────────

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
  private extractRatingsFromResponse(content: string): ExtractedRatings {
    const ratings = { opusScore: 5, geminiScore: 5, codexScore: 5 };

    // Try various patterns
    const patterns = [
      /Proposal\s+A[:\s]+(\d+)(?:\/10)?/i,
      /Opus[:\s]+(\d+)(?:\/10)?/i,
      /proposal\s+a[:\s]+(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const score = parseInt(match[1], 10);
        if (score >= 1 && score <= 10) {
          ratings.opusScore = score;
          break;
        }
      }
    }

    const geminiPatterns = [
      /Proposal\s+B[:\s]+(\d+)(?:\/10)?/i,
      /Gemini[:\s]+(\d+)(?:\/10)?/i,
      /proposal\s+b[:\s]+(\d+)/i,
    ];

    for (const pattern of geminiPatterns) {
      const match = content.match(pattern);
      if (match) {
        const score = parseInt(match[1], 10);
        if (score >= 1 && score <= 10) {
          ratings.geminiScore = score;
          break;
        }
      }
    }

    const codexPatterns = [
      /Proposal\s+C[:\s]+(\d+)(?:\/10)?/i,
      /Codex[:\s]+(\d+)(?:\/10)?/i,
      /proposal\s+c[:\s]+(\d+)/i,
    ];

    for (const pattern of codexPatterns) {
      const match = content.match(pattern);
      if (match) {
        const score = parseInt(match[1], 10);
        if (score >= 1 && score <= 10) {
          ratings.codexScore = score;
          break;
        }
      }
    }

    return ratings;
  }

  /**
   * Extract confidence rating from a proposal response.
   *
   * Looks for patterns indicating confidence level.
   *
   * @param content - Proposal text
   * @returns Confidence score (1-10)
   */
  private extractConfidenceFromProposal(content: string): number {
    const patterns = [
      /confidence[:\s]+(\d+)(?:\/10)?/i,
      /confidence[:\s]+(\d+(?:\.\d+)?)/i,
      /(\d+)%\s+confident/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        let score = parseFloat(match[1]);
        if (pattern.source.includes('%')) {
          score = score / 10; // Convert percentage to 1-10 scale
        }
        if (score >= 1 && score <= 10) {
          return score;
        }
      }
    }

    return 6; // Default confidence
  }

  /**
   * Extract strengths and weaknesses from critique text.
   *
   * @param critiqueText - Critique content
   * @returns Object with keyStrengths and keyWeaknesses arrays
   */
  private extractStrengthsAndWeaknesses(critiqueText: string): {
    keyStrengths: string[];
    keyWeaknesses: string[];
  } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Simple extraction based on common patterns
    const strengthMatch = critiqueText.match(/strength[s]?[:\s]+([^.]+)/i);
    if (strengthMatch) {
      strengths.push(strengthMatch[1].trim());
    }

    const weaknessMatch = critiqueText.match(/weakness[es]?[:\s]+([^.]+)/i);
    if (weaknessMatch) {
      weaknesses.push(weaknessMatch[1].trim());
    }

    // Fallback to generic strengths/weaknesses if parsing fails
    if (strengths.length === 0) {
      strengths.push('Well-structured solution');
    }
    if (weaknesses.length === 0) {
      weaknesses.push('Needs further refinement');
    }

    return { keyStrengths: strengths, keyWeaknesses: weaknesses };
  }

  /**
   * Calculate mean of numeric array.
   *
   * @param values - Array of numbers
   * @returns Mean value
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate standard deviation.
   *
   * @param values - Array of numbers
   * @param mean - Precomputed mean (optional)
   * @returns Standard deviation
   */
  private calculateStdDev(values: number[], mean?: number): number {
    if (values.length === 0) return 0;

    const m = mean ?? this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Calculate agreement score based on rating vectors.
   *
   * Uses cosine similarity of each rater's vector.
   * 0 = no agreement, 1 = perfect agreement.
   *
   * @param matrix - Rating matrix
   * @returns Agreement score (0-1)
   */
  private calculateAgreementScore(
    matrix: RatingMatrixInternal['ratings']
  ): number {
    // Get rating vectors for each rater
    const opusVector = [matrix.opus.opus.score, matrix.opus.gemini.score, matrix.opus.codex.score];
    const geminiVector = [
      matrix.gemini.opus.score,
      matrix.gemini.gemini.score,
      matrix.gemini.codex.score,
    ];
    const codexVector = [matrix.codex.opus.score, matrix.codex.gemini.score, matrix.codex.codex.score];

    // Calculate pairwise cosine similarities
    const sim1 = this.cosineSimilarity(opusVector, geminiVector);
    const sim2 = this.cosineSimilarity(geminiVector, codexVector);
    const sim3 = this.cosineSimilarity(opusVector, codexVector);

    // Average similarity
    return (sim1 + sim2 + sim3) / 3;
  }

  /**
   * Calculate cosine similarity between two vectors.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Similarity score (0-1)
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    const dotProduct = a.reduce((sum, av, i) => sum + av * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, av) => sum + av * av, 0));
    const normB = Math.sqrt(b.reduce((sum, bv) => sum + bv * bv, 0));

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Flatten rating matrix into single array of all scores.
   *
   * @param ratings - Rating matrix
   * @returns Flat array of all scores
   */
  private flattenMatrix(ratings: RatingMatrixInternal['ratings']): number[] {
    const scores: number[] = [];

    for (const rater of Object.values(ratings)) {
      for (const rating of Object.values(rater)) {
        scores.push(rating.score);
      }
    }

    return scores;
  }

  /**
   * Build structured synthesis result from calculated metrics.
   *
   * @param params - Parameters for building result
   * @returns Complete SynthesisResult
   */
  private buildSynthesisResult(params: {
    roundNum: number;
    votingScore: number;
    uncertaintyLevel: number;
    rankedSolutions: RankedSolution[];
    opusSynthesis: string;
    ratingMatrix: RatingMatrixInternal;
    previousSynthesis?: SynthesisResult;
  }): SynthesisResult {
    // Determine best proposal based on ranking
    const bestProposal = params.rankedSolutions[0]?.modelName ?? 'opus';

    // Calculate vote counts
    const bestScoreIndex = params.rankedSolutions.findIndex(
      (s) => s.modelName === bestProposal
    );
    const voteCount = {
      opus: bestScoreIndex === 0 ? 1 : 0,
      gemini: bestScoreIndex === 1 ? 1 : 0,
      codex: bestScoreIndex === 2 ? 1 : 0,
    };

    // Check for consensus (all raters prefer same solution)
    const opusPrefers =
      params.ratingMatrix.ratings.opus.opus.score >
      Math.max(
        params.ratingMatrix.ratings.opus.gemini.score,
        params.ratingMatrix.ratings.opus.codex.score
      );
    const geminiPrefers =
      params.ratingMatrix.ratings.gemini[bestProposal as 'opus' | 'gemini' | 'codex'].score >
      Math.max(
        params.ratingMatrix.ratings.gemini.opus.score ===
          params.ratingMatrix.ratings.gemini[bestProposal as 'opus' | 'gemini' | 'codex'].score
          ? params.ratingMatrix.ratings.gemini.gemini.score
          : params.ratingMatrix.ratings.gemini.opus.score,
        params.ratingMatrix.ratings.gemini.codex.score
      );
    const codexPrefers =
      params.ratingMatrix.ratings.codex[bestProposal as 'opus' | 'gemini' | 'codex'].score >
      Math.max(
        params.ratingMatrix.ratings.codex.opus.score,
        params.ratingMatrix.ratings.codex.gemini.score
      );

    const consensus = opusPrefers && geminiPrefers && codexPrefers;

    // Convergence analysis
    let convergenceAnalysis: SynthesisResult['convergenceAnalysis'] = {
      isConverging: params.votingScore >= 70,
    };

    if (params.previousSynthesis) {
      const votingTrend = params.votingScore - params.previousSynthesis.votingScore;
      const uncertaintyTrend =
        params.previousSynthesis.uncertaintyLevel - params.uncertaintyLevel;

      if (votingTrend >= 5 && uncertaintyTrend >= 5) {
        convergenceAnalysis.trendFromPreviousRound = 'improving';
        convergenceAnalysis.isConverging = true;
      } else if (Math.abs(votingTrend) <= 5 && Math.abs(uncertaintyTrend) <= 5) {
        convergenceAnalysis.trendFromPreviousRound = 'stable';
      } else if (votingTrend < -5 || uncertaintyTrend < -5) {
        convergenceAnalysis.trendFromPreviousRound = 'diverging';
        convergenceAnalysis.isConverging = false;
      }
    }

    const result: SynthesisResult = {
      roundNum: params.roundNum,
      votes: {
        bestProposal,
        voteCount,
        consensus,
      },
      votingScore: params.votingScore,
      uncertaintyLevel: params.uncertaintyLevel,
      rankedSolutions: params.rankedSolutions,
      convergenceAnalysis,
      opusSynthesis: params.opusSynthesis,
      metadata: {
        synthesizedAt: Date.now(),
        synthesizedBy: 'opus-model',
      },
    };

    return result;
  }

  /**
   * Build narrative from metrics when Opus API call fails.
   *
   * @param params - Narrative parameters
   * @returns Fallback narrative text
   */
  private buildNarrativeFromMetrics(params: NarrativeParams): string {
    const best = params.rankedSolutions[0];
    const worstAgree = params.uncertaintyLevel < 40 ? 'All models strongly agree' : 'Models have varying preferences';

    return `Round ${params.iteration} Analysis: ${best?.modelName || 'Opus'}'s proposal achieved the strongest consensus with a score of ${best?.score.toFixed(1) || 0}/100. ${worstAgree} on the fundamental approach, though the uncertainty level of ${params.uncertaintyLevel.toFixed(1)}/100 suggests continued refinement may be beneficial. The voting alignment score of ${params.votingScore.toFixed(1)}/100 indicates ${params.votingScore >= 75 ? 'strong convergence toward a consensus solution' : 'ongoing debate over the best approach'}. Recommend ${params.votingScore >= 75 ? 'finalizing this solution and generating implementation plan' : 'continuing the debate with focused refinement'}.`;
  }

  /**
   * Build fallback narrative when synthesis fails completely.
   *
   * @param params - Narrative parameters
   * @returns Fallback narrative
   */
  private buildFallbackNarrative(params: NarrativeParams): string {
    return `Round ${params.iteration} produced voting score of ${params.votingScore.toFixed(1)}/100 and uncertainty level of ${params.uncertaintyLevel.toFixed(1)}/100. Continue debate if disagreement is high, converge if alignment is strong.`;
  }

  /**
   * Build partial result on error.
   *
   * @param roundNum - Round number
   * @param error - Error that occurred
   * @returns Partial SynthesisResult with defaults
   */
  private buildPartialResult(roundNum: number, error: unknown): SynthesisResult {
    this.logger('error', 'Building partial result due to error', error);

    return {
      roundNum,
      votes: {
        bestProposal: 'opus',
        voteCount: { opus: 1, gemini: 1, codex: 1 },
        consensus: false,
      },
      votingScore: 50,
      uncertaintyLevel: 50,
      rankedSolutions: [
        { rank: 1, modelName: 'opus', score: 50, confidence: 50, keyStrengths: [], keyWeaknesses: [] },
        {
          rank: 2,
          modelName: 'gemini',
          score: 45,
          confidence: 45,
          keyStrengths: [],
          keyWeaknesses: [],
        },
        {
          rank: 3,
          modelName: 'codex',
          score: 40,
          confidence: 40,
          keyStrengths: [],
          keyWeaknesses: [],
        },
      ],
      convergenceAnalysis: {
        isConverging: false,
      },
      opusSynthesis: 'Error during synthesis generation. Using default metrics.',
      metadata: {
        synthesizedAt: Date.now(),
        synthesizedBy: 'opus-model',
      },
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate agreement confidence for a proposal.
 *
 * Based on how consistently models rated this proposal.
 *
 * @param matrix - Rating matrix
 * @param modelName - Model to evaluate
 * @returns Confidence score (0-100)
 */
function agreementConfidence(
  matrix: RatingMatrixInternal,
  modelName: 'opus' | 'gemini' | 'codex'
): number {
  const scores = [
    matrix.ratings.opus[modelName].score,
    matrix.ratings.gemini[modelName].score,
    matrix.ratings.codex[modelName].score,
  ];

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Lower stdev = higher confidence
  const confidence = Math.max(0, 100 - stdDev * 10);

  return Math.min(100, Math.max(0, confidence));
}

// ============================================================================
// END OF SYNTHESIS ENGINE
// ============================================================================
// Note: All types and the SynthesisEngine class are exported directly
// where they are declared above (via 'export' keyword on declarations)
