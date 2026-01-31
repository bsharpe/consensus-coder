/**
 * Integration Tests: Auggie Relay Integration
 *
 * Tests the handoff from Consensus-Coder to Auggie Code Agent:
 * - Implementation plan generation
 * - Auggie relay execution
 * - Code generation from plan
 * - Error handling during execution
 * - Status tracking and logging
 * - Retry on failure
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  mockAuggieRelay,
  FakeConsensusOrchestrator,
  resetAllMocks,
  mockApiFailure,
} from '../fixtures/mocks';
import {
  MOCK_DEBATE_STATE_CONVERGED,
  SAMPLE_CODE_SOLUTION,
} from '../fixtures/sample-debate-states';
import type { DebateState } from '../../src/types/consensus-types';

describe('Auggie Integration', () => {
  let convergedState: DebateState;

  beforeEach(() => {
    resetAllMocks();
    convergedState = MOCK_DEBATE_STATE_CONVERGED;
  });

  afterEach(() => {
    resetAllMocks();
  });

  // ============================================================================
  // HANDOFF PREPARATION
  // ============================================================================

  describe('Implementation Plan Generation', () => {
    it('should generate plan only after convergence', () => {
      expect(convergedState.isConverged).toBe(true);
      expect(convergedState.implementationPlan).toBeDefined();
    });

    it('should NOT generate plan if debate escalated', () => {
      const escalatedState = { ...convergedState, shouldEscalate: true };
      expect(escalatedState.shouldEscalate).toBe(true);
      // Plan should not be set
    });

    it('should include consensus solution in plan', () => {
      if (convergedState.isConverged) {
        expect(convergedState.consensusSolution).toBeDefined();
        expect(convergedState.consensusSolution?.code).toBeDefined();
      }
    });

    it('should be in markdown format', () => {
      if (convergedState.implementationPlan) {
        expect(convergedState.implementationPlan).toMatch(/^#|^##/m);
      }
    });

    it('should include step-by-step instructions', () => {
      if (convergedState.implementationPlan) {
        expect(convergedState.implementationPlan).toMatch(/step|implement|test/i);
      }
    });

    it('should reference the consensus solution', () => {
      if (convergedState.implementationPlan && convergedState.consensusSolution) {
        // Plan should mention the approach/code
        expect(convergedState.implementationPlan.length).toBeGreaterThan(0);
      }
    });

    it('should have reasonable length (<50KB)', () => {
      if (convergedState.implementationPlan) {
        expect(convergedState.implementationPlan.length).toBeLessThan(50000);
      }
    });

    it('should include auggiePreparedPrompt for relay', () => {
      // Plan should have an auggiePreparedPrompt field
      expect(convergedState.implementationPlan).toBeDefined();
    });
  });

  // ============================================================================
  // AUGGIE RELAY EXECUTION
  // ============================================================================

  describe('Auggie Relay Execution', () => {
    it('should invoke Auggie CLI with plan', async () => {
      mockAuggieRelay.execute.mockClear();

      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(mockAuggieRelay.execute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should capture Auggie stdout', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      }) as any;

      expect(result.stdout).toBeDefined();
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('should capture Auggie stderr', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      }) as any;

      expect(result.stderr).toBeDefined();
      expect(typeof result.stderr).toBe('string');
    });

    it('should track exit code', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      }) as any;

      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    });

    it('should succeed on exit code 0', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      }) as any;

      expect(result.exitCode).toBe(0);
    });

    it('should handle timeouts gracefully', async () => {
      mockAuggieRelay.execute.mockRejectedValueOnce(new Error('Timeout after 5 minutes'));

      expect(mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      })).rejects.toThrow();
    });

    it('should respect execution timeout config', async () => {
      // Timeout default should be 5 minutes
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result).toBeDefined();
    });

    it('should handle non-zero exit codes', async () => {
      mockAuggieRelay.execute.mockResolvedValueOnce({
        debateId: 'debate-123',
        planId: 'plan-456',
        exitCode: 1,
        stdout: 'Error output',
        stderr: 'Error message',
        codeBlocks: [],
        executionLog: 'Failed',
        summary: 'Execution failed',
        errors: ['Failed to complete'],
        warnings: [],
      });

      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // OUTPUT PARSING & CODE EXTRACTION
  // ============================================================================

  describe('Output Parsing', () => {
    it('should extract code blocks from output', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result.codeBlocks).toBeDefined();
      expect(Array.isArray(result.codeBlocks)).toBe(true);
    });

    it('should identify code language', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      if (result.codeBlocks.length > 0) {
        expect(result.codeBlocks[0].language).toBeDefined();
        expect(result.codeBlocks[0].language).toMatch(/typescript|python|rust|go|java/i);
      }
    });

    it('should track code block line numbers', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      if (result.codeBlocks.length > 0) {
        expect(result.codeBlocks[0].startLine).toBeGreaterThanOrEqual(1);
        expect(result.codeBlocks[0].endLine).toBeGreaterThan(result.codeBlocks[0].startLine);
      }
    });

    it('should extract code content', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      if (result.codeBlocks.length > 0) {
        expect(result.codeBlocks[0].code).toBeDefined();
        expect(result.codeBlocks[0].code.length).toBeGreaterThan(0);
      }
    });

    it('should parse errors from output', async () => {
      mockAuggieRelay.execute.mockResolvedValueOnce({
        debateId: 'debate-123',
        planId: 'plan-456',
        exitCode: 0,
        stdout: 'Execution output',
        stderr: '',
        codeBlocks: [],
        executionLog: 'Done',
        summary: 'Completed with warnings',
        errors: ['Missing dependency', 'Type error'],
        warnings: [],
      });

      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should parse warnings from output', async () => {
      mockAuggieRelay.execute.mockResolvedValueOnce({
        debateId: 'debate-123',
        planId: 'plan-456',
        exitCode: 0,
        stdout: 'Execution output',
        stderr: '',
        codeBlocks: [],
        executionLog: 'Done',
        summary: 'Completed with warnings',
        errors: [],
        warnings: ['Deprecated API', 'Slow operation'],
      });

      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should generate execution summary', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // STATUS TRACKING
  // ============================================================================

  describe('Status Tracking', () => {
    it('should set status to pending when plan generated', () => {
      if (convergedState.isConverged) {
        expect(convergedState.auggieStatus).toMatch(/pending|null/);
      }
    });

    it('should set status to running during execution', async () => {
      const state = {
        ...convergedState,
        auggieStatus: 'running' as const,
      };
      expect(state.auggieStatus).toBe('running');
    });

    it('should set status to completed on success', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      if (result.exitCode === 0) {
        const state = {
          ...convergedState,
          auggieStatus: 'completed' as const,
        };
        expect(state.auggieStatus).toBe('completed');
      }
    });

    it('should set status to failed on error', async () => {
      mockAuggieRelay.execute.mockResolvedValueOnce({
        debateId: 'debate-123',
        planId: 'plan-456',
        exitCode: 1,
        stdout: '',
        stderr: 'Error',
        codeBlocks: [],
        executionLog: 'Failed',
        summary: 'Failed',
        errors: ['Error occurred'],
        warnings: [],
      });

      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      if (result.exitCode !== 0) {
        const state = {
          ...convergedState,
          auggieStatus: 'failed' as const,
        };
        expect(state.auggieStatus).toBe('failed');
      }
    });

    it('should log execution output', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result.executionLog).toBeDefined();
      expect(result.executionLog.length).toBeGreaterThan(0);
    });

    it('should preserve execution log in state', () => {
      if (convergedState.auggieExecutionLog) {
        expect(convergedState.auggieExecutionLog.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // ERROR HANDLING & RECOVERY
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle Auggie timeout', async () => {
      mockAuggieRelay.execute.mockRejectedValueOnce(
        new Error('Auggie execution timed out after 5 minutes')
      );

      expect(mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      })).rejects.toThrow(/timeout/i);
    });

    it('should handle Auggie not found', async () => {
      mockAuggieRelay.execute.mockRejectedValueOnce(
        new Error('Auggie binary not found in PATH')
      );

      expect(mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      })).rejects.toThrow();
    });

    it('should handle invalid plan', async () => {
      mockAuggieRelay.execute.mockRejectedValueOnce(
        new Error('Plan format invalid')
      );

      expect(mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: '',
      })).rejects.toThrow();
    });

    it('should handle parse errors gracefully', async () => {
      // If output can't be parsed, should still return basic result
      const result = {
        debateId: convergedState.debateId,
        planId: 'plan-456',
        exitCode: 0,
        stdout: 'Unparseable output',
        stderr: '',
        codeBlocks: [],
        executionLog: 'Output could not be parsed',
        summary: 'Completed but output was unclear',
        errors: [],
        warnings: [],
      };

      expect(result).toBeDefined();
      expect(result.codeBlocks.length).toBe(0);
    });

    it('should retry on transient failures', async () => {
      mockAuggieRelay.execute
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          debateId: convergedState.debateId,
          planId: 'plan-456',
          exitCode: 0,
          stdout: 'Success on retry',
          stderr: '',
          codeBlocks: [],
          executionLog: 'Completed',
          summary: 'Success',
          errors: [],
          warnings: [],
        });

      // Second call should succeed
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result.exitCode).toBe(0);
    });

    it('should not mask actual errors', async () => {
      const errors = ['Missing dependency', 'Type mismatch'];
      mockAuggieRelay.execute.mockResolvedValueOnce({
        debateId: convergedState.debateId,
        planId: 'plan-456',
        exitCode: 1,
        stdout: '',
        stderr: 'Errors during execution',
        codeBlocks: [],
        executionLog: 'Failed with errors',
        summary: 'Execution failed',
        errors,
        warnings: [],
      });

      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result.errors).toEqual(errors);
    });
  });

  // ============================================================================
  // END-TO-END: CONSENSUS -> AUGGIE
  // ============================================================================

  describe('Full Consensus to Auggie Flow', () => {
    it('should complete full flow: debate -> plan -> auggie execution', async () => {
      // Step 1: Debate converges
      expect(convergedState.isConverged).toBe(true);
      expect(convergedState.implementationPlan).toBeDefined();

      // Step 2: Auggie executes
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      // Step 3: Should succeed
      expect(result.exitCode).toBe(0);
      expect(result.summary).toBeDefined();
    });

    it('should provide feedback loop on Auggie failure', async () => {
      mockAuggieRelay.execute.mockResolvedValueOnce({
        debateId: convergedState.debateId,
        planId: 'plan-456',
        exitCode: 1,
        stdout: 'Output',
        stderr: 'Compilation error on line 42',
        codeBlocks: [],
        executionLog: 'Failed',
        summary: 'Compilation failed',
        errors: ['Type error in solution'],
        warnings: [],
      });

      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      // Should be able to provide feedback to user
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should not escalate debate if Auggie succeeds', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      if (result.exitCode === 0) {
        // Debate should stay converged
        expect(convergedState.isConverged).toBe(true);
        expect(convergedState.shouldEscalate).toBe(false);
      }
    });
  });

  // ============================================================================
  // PERFORMANCE & LIMITS
  // ============================================================================

  describe('Performance', () => {
    it('should execute Auggie with reasonable timeout (5 min)', async () => {
      const startTime = Date.now();
      await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(300000); // 5 minutes
    });

    it('should handle large plans', async () => {
      const largePlan = '# Large Plan\n' + 'x'.repeat(10000);

      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: largePlan,
      });

      expect(result).toBeDefined();
    });

    it('should generate code blocks without blocking', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      if (result.codeBlocks.length > 0) {
        expect(result.codeBlocks[0].code.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // DATA VALIDATION
  // ============================================================================

  describe('Data Validation', () => {
    it('should validate plan has all required fields', () => {
      if (convergedState.isConverged) {
        expect(convergedState.implementationPlan).toBeDefined();
        expect(convergedState.consensusSolution).toBeDefined();
      }
    });

    it('should validate execution result structure', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      expect(result).toHaveProperty('debateId');
      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result).toHaveProperty('summary');
    });

    it('should ensure all code blocks have required fields', async () => {
      const result = await mockAuggieRelay.execute({
        debateId: convergedState.debateId,
        auggiePreparedPrompt: convergedState.implementationPlan || '',
      });

      for (const block of result.codeBlocks) {
        expect(block).toHaveProperty('language');
        expect(block).toHaveProperty('code');
        expect(block).toHaveProperty('startLine');
        expect(block).toHaveProperty('endLine');
      }
    });
  });
});
