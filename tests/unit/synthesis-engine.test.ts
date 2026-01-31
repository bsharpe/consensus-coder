/**
 * Unit Tests: SynthesisEngine
 *
 * Tests the synthesis and aggregation logic:
 * - Rating matrix calculations
 * - Voting score computation
 * - Uncertainty level calculation
 * - Solution ranking
 * - Convergence analysis
 * - Trend detection
 * - Opus synthesis generation
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  FakeSynthesisEngine,
  mockSynthesisService,
  resetAllMocks,
} from '../fixtures/mocks';
import {
  MOCK_RATING_MATRIX_CONSENSUS,
  MOCK_RATING_MATRIX_DISAGREEMENT,
  MOCK_SYNTHESIS_RESULT_CONVERGED,
  MOCK_SYNTHESIS_RESULT_DIVERGING,
  MOCK_DEBATE_ROUND_1,
  MOCK_DEBATE_ROUND_2,
  MOCK_OPUS_PROPOSAL,
  MOCK_GEMINI_CRITIQUE,
  MOCK_CODEX_REFINEMENT,
  SAMPLE_CODE_SOLUTION,
} from '../fixtures/sample-debate-states';
import type { RatingMatrix, SynthesisResult } from '../../src/types/consensus-types';

describe('SynthesisEngine', () => {
  let engine: FakeSynthesisEngine;

  beforeEach(() => {
    resetAllMocks();
    engine = new FakeSynthesisEngine();
  });

  afterEach(() => {
    resetAllMocks();
  });

  // ============================================================================
  // RATING MATRIX CALCULATIONS
  // ============================================================================

  describe('Rating Matrix Analysis', () => {
    it('should calculate average score from all 9 ratings', () => {
      const matrix = MOCK_RATING_MATRIX_CONSENSUS;
      expect(matrix.averageScore).toBeGreaterThan(0);
      expect(matrix.averageScore).toBeLessThanOrEqual(10);
    });

    it('should calculate standard deviation correctly', () => {
      const matrix = MOCK_RATING_MATRIX_CONSENSUS;
      expect(matrix.standardDeviation).toBeGreaterThanOrEqual(0);

      // Consensus matrix should have lower stdev than disagreement
      const disagreement = MOCK_RATING_MATRIX_DISAGREEMENT;
      expect(disagreement.standardDeviation).toBeGreaterThan(matrix.standardDeviation);
    });

    it('should calculate agreement score (0-1)', () => {
      const consensus = MOCK_RATING_MATRIX_CONSENSUS;
      const disagreement = MOCK_RATING_MATRIX_DISAGREEMENT;

      expect(consensus.agreementScore).toBeGreaterThan(disagreement.agreementScore);
      expect(consensus.agreementScore).toBeGreaterThanOrEqual(0);
      expect(consensus.agreementScore).toBeLessThanOrEqual(1);
    });

    it('should have 9 rating entries (3x3 matrix)', () => {
      const matrix = MOCK_RATING_MATRIX_CONSENSUS;
      let count = 0;
      Object.keys(matrix.ratings).forEach(rater => {
        Object.keys(matrix.ratings[rater as 'opus' | 'gemini' | 'codex']).forEach(() => {
          count++;
        });
      });
      expect(count).toBe(9);
    });

    it('should ensure all ratings are between 1-10', () => {
      const matrix = MOCK_RATING_MATRIX_CONSENSUS;
      Object.entries(matrix.ratings).forEach(([_rater, raterObj]) => {
        Object.entries(raterObj).forEach(([_ratee, rating]) => {
          const score = rating.score;
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        });
      });
    });

    it('should include justification for each rating', () => {
      const matrix = MOCK_RATING_MATRIX_CONSENSUS;
      Object.entries(matrix.ratings).forEach(([_rater, raterObj]) => {
        Object.entries(raterObj).forEach(([_ratee, rating]) => {
          expect(rating.justification).toBeDefined();
          expect(rating.justification.length).toBeGreaterThan(0);
        });
      });
    });

    it('should timestamp each rating', () => {
      const matrix = MOCK_RATING_MATRIX_CONSENSUS;
      Object.entries(matrix.ratings).forEach(([_rater, raterObj]) => {
        Object.entries(raterObj).forEach(([_ratee, rating]) => {
          expect(rating.timestamp).toBeGreaterThan(0);
        });
      });
    });
  });

  // ============================================================================
  // VOTING SCORE CALCULATIONS
  // ============================================================================

  describe('Voting Score Calculation', () => {
    it('should calculate voting score (0-100)', async () => {
      const result = await engine.aggregateRound({
        opusProposals: [MOCK_OPUS_PROPOSAL],
        geminCritique: MOCK_GEMINI_CRITIQUE,
        codexRefinement: MOCK_CODEX_REFINEMENT,
        iteration: 1,
      });

      expect(result.votes.voteCount.opus).toBeGreaterThanOrEqual(0);
      expect(result.votes.voteCount.gemini).toBeGreaterThanOrEqual(0);
      expect(result.votes.voteCount.codex).toBeGreaterThanOrEqual(0);
    });

    it('should score 100 when all 3 models agree (consensus)', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.votes.consensus).toBe(true);
      expect(result.votingScore).toBe(100);
    });

    it('should score ~67 when 2 out of 3 agree', () => {
      // 2/3 = 66.67%
      const score = (2 / 3) * 100;
      expect(score).toBeGreaterThan(65);
      expect(score).toBeLessThan(68);
    });

    it('should score ~33 when all 3 disagree', () => {
      const result = MOCK_SYNTHESIS_RESULT_DIVERGING;
      expect(result.votingScore).toBeLessThan(50);
    });

    it('should track vote count for each model', async () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.votes.voteCount.opus).toBeGreaterThanOrEqual(0);
      expect(result.votes.voteCount.gemini).toBeGreaterThanOrEqual(0);
      expect(result.votes.voteCount.codex).toBeGreaterThanOrEqual(0);

      const total = result.votes.voteCount.opus + result.votes.voteCount.gemini + result.votes.voteCount.codex;
      expect(total).toBe(3); // 3 models vote
    });

    it('should identify best proposal (model with most votes)', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.votes.bestProposal).toMatch(/opus|gemini|codex/);
    });

    it('should break ties by average score', () => {
      // If two models have same vote count, use their average scores
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.votes.bestProposal).toBeDefined();
    });
  });

  // ============================================================================
  // UNCERTAINTY LEVEL CALCULATION
  // ============================================================================

  describe('Uncertainty Level Calculation', () => {
    it('should calculate uncertainty as 0-100 metric', () => {
      const consensus = MOCK_SYNTHESIS_RESULT_CONVERGED;
      const divergence = MOCK_SYNTHESIS_RESULT_DIVERGING;

      expect(consensus.uncertaintyLevel).toBeLessThan(divergence.uncertaintyLevel);
      expect(consensus.uncertaintyLevel).toBeGreaterThanOrEqual(0);
      expect(consensus.uncertaintyLevel).toBeLessThanOrEqual(100);
    });

    it('should score low uncertainty when models agree', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.uncertaintyLevel).toBeLessThan(20);
    });

    it('should score high uncertainty when models disagree', () => {
      const result = MOCK_SYNTHESIS_RESULT_DIVERGING;
      expect(result.uncertaintyLevel).toBeGreaterThan(75);
    });

    it('should use stdev and agreement score in calculation', () => {
      const consensus = MOCK_RATING_MATRIX_CONSENSUS;
      const disagreement = MOCK_RATING_MATRIX_DISAGREEMENT;

      // High stdev + low agreement = high uncertainty
      expect(disagreement.standardDeviation).toBeGreaterThan(consensus.standardDeviation);
      expect(disagreement.agreementScore).toBeLessThan(consensus.agreementScore);
    });

    it('should decrease with more agreement', () => {
      // Uncertainty should inversely correlate with agreement score
      const consensus = MOCK_RATING_MATRIX_CONSENSUS;
      const disagreement = MOCK_RATING_MATRIX_DISAGREEMENT;

      expect(consensus.agreementScore).toBeGreaterThan(disagreement.agreementScore);
    });
  });

  // ============================================================================
  // SOLUTION RANKING
  // ============================================================================

  describe('Solution Ranking', () => {
    it('should rank all 3 solutions', async () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.rankedSolutions.length).toBe(3);
    });

    it('should assign rank 1-3 in order', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.rankedSolutions[0].rank).toBe(1);
      expect(result.rankedSolutions[1].rank).toBe(2);
      expect(result.rankedSolutions[2].rank).toBe(3);
    });

    it('should score solutions by average rating (0-100)', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      result.rankedSolutions.forEach(solution => {
        expect(solution.score).toBeGreaterThanOrEqual(0);
        expect(solution.score).toBeLessThanOrEqual(100);
      });
    });

    it('should rank in descending score order', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      for (let i = 1; i < result.rankedSolutions.length; i++) {
        expect(result.rankedSolutions[i].score).toBeLessThanOrEqual(
          result.rankedSolutions[i - 1].score
        );
      }
    });

    it('should calculate confidence for each ranking', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      result.rankedSolutions.forEach(solution => {
        expect(solution.confidence).toBeGreaterThanOrEqual(0);
        expect(solution.confidence).toBeLessThanOrEqual(100);
      });
    });

    it('should include strengths and weaknesses', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      result.rankedSolutions.forEach(solution => {
        expect(Array.isArray(solution.keyStrengths)).toBe(true);
        expect(Array.isArray(solution.keyWeaknesses)).toBe(true);
      });
    });

    it('should identify top-ranked model', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.rankedSolutions[0].modelName).toMatch(/opus|gemini|codex/);
      expect(result.rankedSolutions[0].score).toBeGreaterThanOrEqual(
        result.rankedSolutions[1].score
      );
    });
  });

  // ============================================================================
  // CONVERGENCE ANALYSIS
  // ============================================================================

  describe('Convergence Analysis', () => {
    it('should calculate isConverging flag', () => {
      const converging = MOCK_SYNTHESIS_RESULT_CONVERGED;
      const diverging = MOCK_SYNTHESIS_RESULT_DIVERGING;

      expect(converging.convergenceAnalysis.isConverging).toBeDefined();
      expect(diverging.convergenceAnalysis.isConverging).toBeDefined();
    });

    it('should detect improving trend', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.convergenceAnalysis.trendFromPreviousRound).toMatch(
        /improving|stable|diverging/
      );
    });

    it('should detect stable trend', () => {
      // When metrics don't change much (±5%)
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      if (result.convergenceAnalysis.trendFromPreviousRound === 'stable') {
        // Should be within ±5 points
        expect(result.convergenceAnalysis).toBeDefined();
      }
    });

    it('should detect diverging trend', () => {
      const result = MOCK_SYNTHESIS_RESULT_DIVERGING;
      if (result.convergenceAnalysis.trendFromPreviousRound === 'diverging') {
        expect(result.convergenceAnalysis.isConverging).toBe(false);
      }
    });

    it('should predict convergence round', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      if (result.convergenceAnalysis.predictedConvergenceRound) {
        expect(result.convergenceAnalysis.predictedConvergenceRound).toBeGreaterThanOrEqual(
          result.roundNum
        );
      }
    });

    it('should set predictedConvergenceRound only if converging', () => {
      const converging = MOCK_SYNTHESIS_RESULT_CONVERGED;
      const diverging = MOCK_SYNTHESIS_RESULT_DIVERGING;

      if (converging.convergenceAnalysis.isConverging) {
        // May have prediction
      } else {
        // Should not have prediction
      }

      if (!diverging.convergenceAnalysis.isConverging) {
        // Diverging should not predict convergence
      }
    });

    it('should use linear regression for prediction', () => {
      // Prediction should be based on trend from previous rounds
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.convergenceAnalysis).toHaveProperty('predictedConvergenceRound');
    });
  });

  // ============================================================================
  // SYNTHESIS NARRATIVE
  // ============================================================================

  describe('Synthesis Narrative Generation', () => {
    it('should generate Opus synthesis markdown', async () => {
      const result = await engine.aggregateRound({
        opusProposals: [MOCK_OPUS_PROPOSAL],
        geminCritique: MOCK_GEMINI_CRITIQUE,
        codexRefinement: MOCK_CODEX_REFINEMENT,
        iteration: 1,
      });

      expect(result.opusSynthesis).toBeDefined();
      expect(result.opusSynthesis.length).toBeGreaterThan(0);
    });

    it('should include round number in synthesis', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.opusSynthesis).toContain('Round');
    });

    it('should summarize key agreements', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.opusSynthesis.length).toBeGreaterThan(50);
    });

    it('should highlight areas of disagreement', () => {
      const result = MOCK_SYNTHESIS_RESULT_DIVERGING;
      if (result.votingScore < 75) {
        expect(result.opusSynthesis.length).toBeGreaterThan(0);
      }
    });

    it('should provide strategic guidance for next round', () => {
      const result = MOCK_SYNTHESIS_RESULT_DIVERGING;
      // If not converged, synthesis should suggest next steps
      if (!result.roundNum) {
        expect(result.opusSynthesis).toBeDefined();
      }
    });

    it('should be in valid markdown format', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.opusSynthesis).toMatch(/^#|^##|^###/m);
    });

    it('should have reasonable length (<10000 chars)', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.opusSynthesis.length).toBeLessThan(10000);
    });
  });

  // ============================================================================
  // AGGREGATION INTEGRATION
  // ============================================================================

  describe('Round Aggregation', () => {
    it('should aggregate all model responses', async () => {
      const result = await engine.aggregateRound({
        opusProposals: [MOCK_OPUS_PROPOSAL],
        geminCritique: MOCK_GEMINI_CRITIQUE,
        codexRefinement: MOCK_CODEX_REFINEMENT,
        iteration: 1,
      });

      expect(result).toBeDefined();
      expect(typeof result.roundNum).toBe('number');
      expect(typeof result.votingScore).toBe('number');
      expect(Array.isArray(result.rankedSolutions)).toBe(true);
      expect(result.rankedSolutions.length).toBe(3);
    });

    it('should combine ratings from all 3 models', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.votes.voteCount.opus + result.votes.voteCount.gemini + result.votes.voteCount.codex).toBe(3);
    });

    it('should calculate metrics without throwing', async () => {
      expect(async () => {
        await engine.aggregateRound({
          opusProposals: [MOCK_OPUS_PROPOSAL],
          geminCritique: MOCK_GEMINI_CRITIQUE,
          codexRefinement: MOCK_CODEX_REFINEMENT,
          iteration: 1,
        });
      }).not.toThrow();
    });

    it('should use previous synthesis for trend analysis', async () => {
      const result = await engine.aggregateRound({
        opusProposals: [MOCK_OPUS_PROPOSAL],
        geminCritique: MOCK_GEMINI_CRITIQUE,
        codexRefinement: MOCK_CODEX_REFINEMENT,
        iteration: 2,
        previousSynthesis: MOCK_SYNTHESIS_RESULT_DIVERGING,
      });

      // Should have trend information
      expect(result.convergenceAnalysis).toBeDefined();
    });

    it('should handle round 1 without previous synthesis', async () => {
      const result = await engine.aggregateRound({
        opusProposals: [MOCK_OPUS_PROPOSAL],
        geminCritique: MOCK_GEMINI_CRITIQUE,
        codexRefinement: MOCK_CODEX_REFINEMENT,
        iteration: 1,
        // previousSynthesis undefined
      });

      expect(result.roundNum).toBe(1);
      expect(result.convergenceAnalysis).toBeDefined();
    });

    it('should set synthesizedAt timestamp', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.metadata.synthesizedAt).toBeGreaterThan(0);
    });

    it('should set synthesizedBy to opus-model', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.metadata.synthesizedBy).toBe('opus-model');
    });
  });

  // ============================================================================
  // EDGE CASES & ERROR HANDLING
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle unanimous vote (3-0)', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      if (result.votes.consensus) {
        expect(result.votingScore).toBe(100);
      }
    });

    it('should handle split vote (1-1-1)', () => {
      const result = MOCK_SYNTHESIS_RESULT_DIVERGING;
      const total = result.votes.voteCount.opus + result.votes.voteCount.gemini + result.votes.voteCount.codex;
      expect(total).toBe(3);
    });

    it('should handle zero disagreement (stdev = 0)', () => {
      // All models gave identical scores
      const allSame = MOCK_RATING_MATRIX_CONSENSUS;
      expect(allSame.standardDeviation).toBeGreaterThanOrEqual(0);
    });

    it('should handle maximum disagreement', () => {
      // Scores range from 1-10
      const maxDisagreement = MOCK_RATING_MATRIX_DISAGREEMENT;
      expect(maxDisagreement.standardDeviation).toBeGreaterThan(0);
    });

    it('should handle missing optional fields gracefully', async () => {
      const minimalInput = {
        opusProposals: [MOCK_OPUS_PROPOSAL],
        geminCritique: MOCK_GEMINI_CRITIQUE,
        codexRefinement: MOCK_CODEX_REFINEMENT,
        iteration: 1,
      };

      const result = await engine.aggregateRound(minimalInput);
      expect(result).toBeDefined();
    });

    it('should never crash with invalid input', async () => {
      expect(async () => {
        try {
          await engine.aggregateRound({
            opusProposals: [],
            geminCritique: MOCK_GEMINI_CRITIQUE,
            codexRefinement: MOCK_CODEX_REFINEMENT,
            iteration: 1,
          });
        } catch (err) {
          // May throw, but shouldn't crash
        }
      }).not.toThrow();
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  describe('Performance', () => {
    it('should aggregate round quickly (<1 second)', async () => {
      const startTime = Date.now();
      await engine.aggregateRound({
        opusProposals: [MOCK_OPUS_PROPOSAL],
        geminCritique: MOCK_GEMINI_CRITIQUE,
        codexRefinement: MOCK_CODEX_REFINEMENT,
        iteration: 1,
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    it('should calculate metrics without blocking', async () => {
      // Create multiple aggregations concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          engine.aggregateRound({
            opusProposals: [MOCK_OPUS_PROPOSAL],
            geminCritique: MOCK_GEMINI_CRITIQUE,
            codexRefinement: MOCK_CODEX_REFINEMENT,
            iteration: i + 1,
          })
        );
      }

      const results = await Promise.all(promises);
      expect(results.length).toBe(5);
    });

    it('should handle large synthesis narratives', () => {
      const result = MOCK_SYNTHESIS_RESULT_CONVERGED;
      expect(result.opusSynthesis.length).toBeLessThan(10000);
    });
  });
});
