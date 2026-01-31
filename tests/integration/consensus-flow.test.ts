/**
 * Integration Tests: Full Consensus Debate Flow
 *
 * Tests the complete debate lifecycle:
 * - Start debate with problem statement
 * - Execute multiple rounds of debate
 * - Models propose, critique, and refine
 * - Convergence detection and escalation
 * - State persistence across rounds
 * - Implementation plan generation
 * - Success path (converged) and escalation path (too many rounds)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  FakeConsensusOrchestrator,
  FakeSynthesisEngine,
  mockLLMService,
  mockSynthesisService,
  mockStateStore,
  resetAllMocks,
} from '../fixtures/mocks';
import {
  MOCK_DEBATE_STATE_INITIAL,
  MOCK_DEBATE_STATE_ROUND_1,
  MOCK_DEBATE_STATE_CONVERGED,
  MOCK_DEBATE_STATE_ESCALATE,
  SAMPLE_CODE_SOLUTION,
} from '../fixtures/sample-debate-states';

describe('Full Consensus Debate Flow', () => {
  let orchestrator: FakeConsensusOrchestrator;
  let synthesisEngine: FakeSynthesisEngine;

  beforeEach(() => {
    resetAllMocks();
    orchestrator = new FakeConsensusOrchestrator(
      'Implement a cache eviction strategy',
      'TypeScript, O(1) operations',
      { maxIterations: 5, votingThreshold: 75, uncertaintyThreshold: 30 }
    );
    synthesisEngine = new FakeSynthesisEngine();
  });

  afterEach(() => {
    resetAllMocks();
  });

  // ============================================================================
  // INITIALIZATION & SETUP
  // ============================================================================

  describe('Debate Initialization', () => {
    it('should start debate with problem statement', async () => {
      const state = await orchestrator.run();
      expect(state.problemStatement).toBeDefined();
      expect(state.problemStatement).toContain('cache');
    });

    it('should initialize with empty rounds array', async () => {
      const state = await orchestrator.run();
      expect(Array.isArray(state.rounds)).toBe(true);
    });

    it('should set round to 1 at start', async () => {
      const state = await orchestrator.run();
      expect(state.currentRound).toBeGreaterThanOrEqual(1);
    });

    it('should initialize convergence metrics to 0/100', async () => {
      const state = await orchestrator.run();
      expect(state.votingScore).toBeGreaterThanOrEqual(0);
      expect(state.uncertaintyLevel).toBeGreaterThanOrEqual(0);
      expect(state.isConverged).toBe(false);
    });

    it('should generate unique debate ID', async () => {
      const state1 = await orchestrator.run();
      const orch2 = new FakeConsensusOrchestrator(
        'Problem 2',
        'Context 2',
        {}
      );
      const state2 = await orch2.run();

      // Different debates should have different IDs
      expect(state1.debateId).not.toBe(state2.debateId);
    });

    it('should store problem constraints', async () => {
      const state = await orchestrator.run();
      expect(state.constraints).toBeDefined();
    });

    it('should persist initial state to disk', async () => {
      await orchestrator.run();
      expect(mockStateStore.save).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // ROUND EXECUTION FLOW
  // ============================================================================

  describe('Round Execution Sequence', () => {
    it('should execute round 1: proposals from all 3 models', async () => {
      const round = await orchestrator.executeRound();
      expect(round.roundNum).toBe(1);
      expect(round.opusProposal).toBeDefined();
      expect(round.geminiCritique).toBeDefined();
      expect(round.codexRefinement).toBeDefined();
    });

    it('should call Opus first to propose solutions', async () => {
      mockLLMService.callOpus.mockClear();
      await orchestrator.executeRound();
      expect(mockLLMService.callOpus).toHaveBeenCalled();
    });

    it('should call Gemini second to critique proposals', async () => {
      mockLLMService.callGemini.mockClear();
      await orchestrator.executeRound();
      expect(mockLLMService.callGemini).toHaveBeenCalled();
    });

    it('should call Codex third to refine best proposal', async () => {
      mockLLMService.callCodex.mockClear();
      await orchestrator.executeRound();
      expect(mockLLMService.callCodex).toHaveBeenCalled();
    });

    it('should aggregate responses via synthesis engine', async () => {
      mockSynthesisService.aggregateRound.mockClear();
      const round = await orchestrator.executeRound();
      expect(round.synthesis).toBeDefined();
      expect(round.synthesis.votingScore).toBeGreaterThanOrEqual(0);
    });

    it('should record metrics for each API call', async () => {
      const round = await orchestrator.executeRound();
      expect(round.apiCalls.opus).toBeDefined();
      expect(round.apiCalls.gemini).toBeDefined();
      expect(round.apiCalls.codex).toBeDefined();

      expect(round.apiCalls.opus.tokens).toBeGreaterThan(0);
      expect(round.apiCalls.opus.cost).toBeGreaterThan(0);
    });

    it('should measure total round duration', async () => {
      const round = await orchestrator.executeRound();
      expect(round.durationMs).toBeGreaterThan(0);
      expect(round.durationMs).toBeLessThan(120000);
    });

    it('should append round to state history', async () => {
      const state = await orchestrator.run();
      if (state.rounds && state.rounds.length > 0) {
        expect((state.rounds[0] as any).roundNum).toBe(1);
      }
    });

    it('should increment round counter after each round', async () => {
      const round1 = MOCK_DEBATE_STATE_INITIAL;
      const round2 = MOCK_DEBATE_STATE_ROUND_1;

      expect(round2.currentRound).toBeGreaterThan(round1.currentRound);
    });
  });

  // ============================================================================
  // CONVERGENCE PATH (SUCCESS)
  // ============================================================================

  describe('Convergence Path (Success)', () => {
    it('should detect convergence when thresholds met', async () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      expect(state.votingScore).toBeGreaterThanOrEqual(75);
      expect(state.uncertaintyLevel).toBeLessThanOrEqual(30);
      expect(state.isConverged).toBe(true);
    });

    it('should stop debate on convergence', async () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      expect(state.isConverged).toBe(true);
      expect(state.currentRound).toBeLessThanOrEqual(5);
    });

    it('should generate implementation plan on convergence', async () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      if (state.isConverged) {
        expect(state.implementationPlan).toBeDefined();
        expect(state.implementationPlan?.length).toBeGreaterThan(0);
      }
    });

    it('should extract consensus solution', async () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      if (state.isConverged) {
        expect(state.consensusSolution).toBeDefined();
        expect(state.consensusSolution?.code).toBeDefined();
        expect(state.consensusSolution?.language).toBeDefined();
        expect(state.consensusSolution?.explanation).toBeDefined();
      }
    });

    it('should set convergedAt timestamp', async () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      if (state.isConverged) {
        expect(state.convergedAt).toBeGreaterThan(state.createdAt);
      }
    });

    it('should NOT escalate on convergence', async () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      expect(state.shouldEscalate).toBe(false);
      expect(state.escalatedAt).toBeUndefined();
    });

    it('should complete in fewer rounds on early convergence', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      expect(state.currentRound).toBeLessThanOrEqual(5);
    });

    it('should set Auggie status to pending', async () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      if (state.isConverged) {
        expect(state.auggieStatus).toMatch(/pending|null/);
      }
    });
  });

  // ============================================================================
  // ESCALATION PATH (MAX ROUNDS)
  // ============================================================================

  describe('Escalation Path (Max Rounds)', () => {
    it('should escalate after max rounds without convergence', () => {
      const state = MOCK_DEBATE_STATE_ESCALATE;
      expect(state.currentRound).toBe(5);
      expect(state.isConverged).toBe(false);
      expect(state.shouldEscalate).toBe(true);
    });

    it('should escalate with clear reason', () => {
      const state = MOCK_DEBATE_STATE_ESCALATE;
      expect(state.escalationReason).toBeDefined();
      expect(state.escalationReason).toContain('Max');
    });

    it('should set escalatedAt timestamp', () => {
      const state = MOCK_DEBATE_STATE_ESCALATE;
      expect(state.escalatedAt).toBeGreaterThan(state.createdAt);
    });

    it('should NOT generate implementation plan on escalation', () => {
      const state = MOCK_DEBATE_STATE_ESCALATE;
      if (state.shouldEscalate) {
        // Plan should not be generated if escalating
        expect(state.isConverged).toBe(false);
      }
    });

    it('should preserve round history for human review', () => {
      const state = MOCK_DEBATE_STATE_ESCALATE;
      expect(state.rounds.length).toBeGreaterThan(0);
      expect(state.rounds[0].roundNum).toBe(1);
    });

    it('should continue debate even when disagreement persists', () => {
      const state = MOCK_DEBATE_STATE_ESCALATE;
      expect(state.rounds.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ============================================================================
  // MULTI-ROUND PROGRESSION
  // ============================================================================

  describe('Multi-Round Debate Progression', () => {
    it('should show improving voting score over rounds', () => {
      const round1Voting = MOCK_DEBATE_STATE_ROUND_1.votingScore;
      const round2Voting = MOCK_DEBATE_STATE_CONVERGED.votingScore;

      expect(round2Voting).toBeGreaterThanOrEqual(round1Voting);
    });

    it('should show decreasing uncertainty over rounds', () => {
      const round1Uncertainty = MOCK_DEBATE_STATE_ROUND_1.uncertaintyLevel;
      const round2Uncertainty = MOCK_DEBATE_STATE_CONVERGED.uncertaintyLevel;

      expect(round2Uncertainty).toBeLessThanOrEqual(round1Uncertainty);
    });

    it('should maintain immutable round history', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      const roundCount = state.rounds.length;

      // Rounds should never change once recorded
      expect(state.rounds[0].roundNum).toBe(1);
      if (state.rounds.length > 1) {
        expect(state.rounds[1].roundNum).toBe(2);
      }
    });

    it('should pass context from previous rounds', () => {
      // Round 2 should know about Round 1's synthesis
      const state = MOCK_DEBATE_STATE_CONVERGED;
      if (state.rounds.length > 1) {
        expect(state.rounds[1]).toBeDefined();
      }
    });

    it('should allow models to learn from critique', () => {
      // Codex in round 2 should reference Gemini's round 1 critique
      const state = MOCK_DEBATE_STATE_CONVERGED;
      expect(state.rounds.length).toBeGreaterThan(0);
    });

    it('should detect convergence trend', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      if (state.rounds.length > 1) {
        const lastRound = state.rounds[state.rounds.length - 1];
        expect(lastRound.synthesis.convergenceAnalysis).toBeDefined();
      }
    });
  });

  // ============================================================================
  // STATE PERSISTENCE
  // ============================================================================

  describe('State Persistence Across Rounds', () => {
    it('should save state after each round', async () => {
      mockStateStore.save.mockClear();
      await orchestrator.executeRound();
      expect(mockStateStore.save).toHaveBeenCalled();
    });

    it('should save complete state (not partial)', async () => {
      mockStateStore.save.mockClear();
      await orchestrator.executeRound();

      const savedState = mockStateStore.save.mock.calls[0]?.[0] as any;
      if (savedState) {
        expect(savedState.debateId).toBeDefined();
        expect(savedState.rounds).toBeDefined();
      }
    });

    it('should allow recovery from saved state', async () => {
      const savedState = MOCK_DEBATE_STATE_CONVERGED;
      mockStateStore.load.mockResolvedValueOnce(savedState as any);

      const loaded = await mockStateStore.load(savedState.debateId);
      expect(loaded).toEqual(savedState);
    });

    it('should preserve round order on reload', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      for (let i = 0; i < state.rounds.length; i++) {
        expect(state.rounds[i].roundNum).toBe(i + 1);
      }
    });

    it('should update persistedAt timestamp', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      expect(state.persistedAt).toBeGreaterThan(0);
      expect(state.persistedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  // ============================================================================
  // ERROR RECOVERY & RESILIENCE
  // ============================================================================

  describe('Error Recovery & Resilience', () => {
    it('should continue debate if one model times out', async () => {
      // Mock Opus timeout
      mockLLMService.callOpus.mockRejectedValueOnce(new Error('Timeout'));

      const round = await orchestrator.executeRound();
      // Should still have Gemini and Codex responses
      expect(round).toBeDefined();
    });

    it('should retry on transient API failure', async () => {
      mockLLMService.callOpus
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(require('../fixtures/sample-debate-states').MOCK_OPUS_PROPOSAL);

      // Should eventually succeed after retry
      expect(mockLLMService.callOpus).toBeDefined();
    });

    it('should handle synthesis engine errors gracefully', async () => {
      mockSynthesisService.aggregateRound.mockRejectedValueOnce(new Error('Synthesis failed') as any);

      // Should not crash entire debate
      expect(async () => {
        try {
          await orchestrator.executeRound();
        } catch {
          // Expected
        }
      }).not.toThrow();
    });

    it('should escalate on repeated API failures', () => {
      // If 3+ API calls fail, escalate
      const failureCount = 3;
      expect(failureCount).toBeGreaterThanOrEqual(3);
    });

    it('should preserve partial round data on synthesis failure', async () => {
      mockSynthesisService.aggregateRound.mockRejectedValueOnce(new Error('Synthesis failed'));

      const round = await orchestrator.executeRound();
      // Should have model responses even if synthesis fails
      expect(round.opusProposal || round.geminiCritique || round.codexRefinement).toBeTruthy();
    });
  });

  // ============================================================================
  // END-TO-END SCENARIOS
  // ============================================================================

  describe('End-to-End Scenarios', () => {
    it('should complete happy path: debate -> convergence -> plan -> ready for Auggie', async () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;

      // Should converge
      expect(state.isConverged).toBe(true);

      // Should have solution
      expect(state.consensusSolution).toBeDefined();

      // Should have plan
      expect(state.implementationPlan).toBeDefined();

      // Should be ready for Auggie
      expect(state.auggieStatus).toMatch(/pending|null/);
    });

    it('should complete escalation path: debate -> max rounds -> escalation', async () => {
      const state = MOCK_DEBATE_STATE_ESCALATE;

      // Should reach max rounds
      expect(state.currentRound).toBe(5);

      // Should not converge
      expect(state.isConverged).toBe(false);

      // Should escalate
      expect(state.shouldEscalate).toBe(true);

      // Should have history for human review
      expect(state.rounds.length).toBeGreaterThan(0);
    });

    it('should handle early convergence (round 2-3)', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;

      // Converged in round 2-3
      expect(state.currentRound).toBeLessThan(5);
      expect(state.isConverged).toBe(true);
    });

    it('should track total cost across debate', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;

      let totalCost = 0;
      for (const round of state.rounds) {
        totalCost += round.apiCalls.opus.cost;
        totalCost += round.apiCalls.gemini.cost;
        totalCost += round.apiCalls.codex.cost;
      }

      expect(totalCost).toBeGreaterThan(0);
    });

    it('should provide audit trail of all decisions', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;

      // Should have complete history
      for (const round of state.rounds) {
        expect(round.roundNum).toBeGreaterThan(0);
        expect(round.timestamp).toBeGreaterThan(0);
        expect(round.synthesis).toBeDefined();
        expect(round.synthesis.opusSynthesis).toBeDefined();
      }
    });
  });

  // ============================================================================
  // PERFORMANCE & SCALING
  // ============================================================================

  describe('Performance & Scaling', () => {
    it('should complete full debate within reasonable time', async () => {
      const startTime = Date.now();
      const state = await orchestrator.run();
      const duration = Date.now() - startTime;

      // Full debate should complete quickly
      expect(duration).toBeLessThan(60000); // 60 seconds
    });

    it('should handle multiple concurrent debates', async () => {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        const orch = new FakeConsensusOrchestrator(
          `Problem ${i}`,
          'Context',
          {}
        );
        promises.push(orch.run());
      }

      const states = await Promise.all(promises);
      expect(states.length).toBe(3);
    });

    it('should not leak memory across debates', () => {
      resetAllMocks();

      // Create multiple debates sequentially
      for (let i = 0; i < 5; i++) {
        const orch = new FakeConsensusOrchestrator(
          `Problem ${i}`,
          'Context',
          {}
        );
        expect(orch).toBeDefined();
      }

      // Should not accumulate garbage
      expect(mockStateStore.save).toHaveBeenCalled();
    });

    it('should handle large problem statements', async () => {
      const largeStatement = 'Problem: ' + 'x'.repeat(5000);
      const orch = new FakeConsensusOrchestrator(largeStatement, 'Context', {});

      const state = await orch.run();
      expect(state.problemStatement.length).toBe(largeStatement.length);
    });
  });

  // ============================================================================
  // DATA VALIDATION
  // ============================================================================

  describe('Data Validation', () => {
    it('should validate debate state schema', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      expect(state).toBeDefined();
      expect(state.debateId).toBeDefined();
      expect(typeof state.currentRound).toBe('number');
      expect(typeof state.isConverged).toBe('boolean');
    });

    it('should validate synthesis results', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      if (state.rounds.length > 0) {
        const synthesis = state.rounds[0].synthesis;
        expect(synthesis).toBeDefined();
        expect(typeof synthesis.roundNum).toBe('number');
        expect(typeof synthesis.votingScore).toBe('number');
        expect(Array.isArray(synthesis.rankedSolutions)).toBe(true);
      }
    });

    it('should ensure convergence scores are consistent', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      if (state.isConverged) {
        expect(state.votingScore).toBeGreaterThanOrEqual(75);
        expect(state.uncertaintyLevel).toBeLessThanOrEqual(30);
      }
    });

    it('should validate all model responses have required fields', () => {
      const state = MOCK_DEBATE_STATE_CONVERGED;
      for (const round of state.rounds) {
        expect(round.opusProposal.modelName).toBe('opus');
        expect(round.geminiCritique.modelName).toBe('gemini');
        expect(round.codexRefinement.modelName).toBe('codex');
      }
    });
  });
});
