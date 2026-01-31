/**
 * Jest Mocks & API Response Simulators for Consensus-Coder Tests
 *
 * Provides:
 * - Mock LLM API responses (Opus, Gemini, Codex)
 * - Mock implementations of services
 * - Jest mock utilities
 * - Fake implementations for testing
 *
 * @module tests/fixtures/mocks
 */

// @ts-nocheck
import { jest } from '@jest/globals';
import { ModelResponse, SynthesisResult } from '../../src/types/consensus-types';
import {
  MOCK_OPUS_PROPOSAL,
  MOCK_GEMINI_CRITIQUE,
  MOCK_CODEX_REFINEMENT,
  SAMPLE_CODE_SOLUTION,
} from './sample-debate-states';

// ============================================================================
// API RESPONSE MOCKS
// ============================================================================

/**
 * Mock Anthropic API response for Opus
 */
export const mockAnthropicResponse = {
  content: [
    {
      type: 'text',
      text: MOCK_OPUS_PROPOSAL.content,
    },
  ],
  usage: {
    input_tokens: MOCK_OPUS_PROPOSAL.metadata.inputTokens,
    output_tokens: MOCK_OPUS_PROPOSAL.metadata.outputTokens,
  },
  model: 'claude-opus-4-5',
  stop_reason: 'end_turn',
};

/**
 * Mock Google API response for Gemini
 */
export const mockGeminiResponse = {
  content: {
    parts: [
      {
        text: MOCK_GEMINI_CRITIQUE.content,
      },
    ],
  },
  usageMetadata: {
    promptTokenCount: MOCK_GEMINI_CRITIQUE.metadata.inputTokens,
    candidatesTokenCount: MOCK_GEMINI_CRITIQUE.metadata.outputTokens,
  },
  modelVersion: 'gemini-2.0-flash',
};

/**
 * Mock failed API response (timeout/error)
 */
export const mockFailedApiResponse = new Error('API request timed out');

// ============================================================================
// SERVICE MOCKS
// ============================================================================

/**
 * Mock LLM Service that simulates API calls
 */
export const mockLLMService = {
  callOpus: jest.fn().mockResolvedValue(MOCK_OPUS_PROPOSAL),
  callGemini: jest.fn().mockResolvedValue(MOCK_GEMINI_CRITIQUE),
  callCodex: jest.fn().mockResolvedValue(MOCK_CODEX_REFINEMENT),
};

/**
 * Mock Synthesis Service
 */
export const mockSynthesisService = {
  aggregateRound: jest.fn().mockResolvedValue({
    roundNum: 1,
    votes: {
      bestProposal: 'opus',
      voteCount: { opus: 2, gemini: 1, codex: 0 },
      consensus: false,
    },
    votingScore: 67,
    uncertaintyLevel: 42,
    rankedSolutions: [],
    convergenceAnalysis: { isConverging: false },
    opusSynthesis: 'Test synthesis',
    metadata: { synthesizedAt: Date.now(), synthesizedBy: 'opus-model' },
  }),
};

/**
 * Mock Retry Orchestrator
 */
export const mockRetryOrchestrator = {
  executeWithRetry: jest.fn().mockResolvedValue(MOCK_OPUS_PROPOSAL),
  executeWithExponentialBackoff: jest.fn().mockResolvedValue(MOCK_OPUS_PROPOSAL),
};

/**
 * Mock State Store for persistence
 */
export const mockStateStore = {
  save: jest.fn().mockResolvedValue(true),
  load: jest.fn().mockResolvedValue(null),
  delete: jest.fn().mockResolvedValue(true),
  exists: jest.fn().mockResolvedValue(true),
  listDebates: jest.fn().mockResolvedValue([]),
};

/**
 * Mock Auggie Relay
 */
export const mockAuggieRelay = {
  execute: jest.fn().mockResolvedValue({
    debateId: 'debate-123',
    planId: 'plan-456',
    exitCode: 0,
    stdout: 'Plan executed successfully',
    stderr: '',
    codeBlocks: [
      {
        language: 'typescript',
        code: SAMPLE_CODE_SOLUTION.code,
        startLine: 1,
        endLine: 25,
      },
    ],
    executionLog: 'All steps completed',
    summary: 'Successfully implemented cache eviction strategy',
    errors: [],
    warnings: [],
  }),
};

// ============================================================================
// JEST MOCK SETUP HELPERS
// ============================================================================

/**
 * Reset all mocks to their initial state
 */
export function resetAllMocks(): void {
  jest.clearAllMocks();
}

/**
 * Configure mock to fail with error
 */
export function mockApiFailure(
  service: any,
  method: string,
  error: Error = new Error('API error')
): void {
  if (service[method]) {
    service[method].mockRejectedValueOnce(error);
  }
}

/**
 * Configure mock to timeout
 */
export function mockApiTimeout(service: any, method: string, delayMs: number = 61000): void {
  if (service[method]) {
    service[method].mockImplementationOnce(
      () => new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), delayMs)
      )
    );
  }
}

/**
 * Configure mock to retry then succeed
 */
export function mockApiRetrySuccess(
  service: any,
  method: string,
  retries: number = 2
): void {
  if (service[method]) {
    service[method]
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockRejectedValueOnce(new Error('Temporary failure'));
    
    // Third call succeeds
    for (let i = 0; i < retries; i++) {
      service[method].mockRejectedValueOnce(new Error('Temporary failure'));
    }
    service[method].mockResolvedValueOnce(MOCK_OPUS_PROPOSAL);
  }
}

// ============================================================================
// JEST MATCHER EXTENSIONS
// ============================================================================

/**
 * Custom Jest matchers for consensus testing
 */
export const customMatchers = {
  /**
   * Match a valid DebateState structure
   */
  toBeValidDebateState: (received: any) => {
    const pass =
      received &&
      typeof received === 'object' &&
      received.debateId &&
      received.problemId &&
      typeof received.currentRound === 'number' &&
      typeof received.votingScore === 'number' &&
      typeof received.isConverged === 'boolean';

    return {
      pass,
      message: () =>
        pass
          ? `expected ${JSON.stringify(received)} not to be a valid DebateState`
          : `expected ${JSON.stringify(received)} to be a valid DebateState`,
    };
  },

  /**
   * Match converged state (voting score >= threshold, uncertainty <= threshold)
   */
  toBeConverged: (received: any) => {
    const pass =
      received &&
      received.isConverged === true &&
      received.votingScore >= 75 &&
      received.uncertaintyLevel <= 30;

    return {
      pass,
      message: () =>
        pass
          ? `expected state not to be converged`
          : `expected state to be converged (voting: ${received?.votingScore}, uncertainty: ${received?.uncertaintyLevel})`,
    };
  },

  /**
   * Match escalation state
   */
  toBeEscalated: (received: any) => {
    const pass = received && received.shouldEscalate === true && received.escalatedAt;

    return {
      pass,
      message: () =>
        pass
          ? `expected state not to be escalated`
          : `expected state to be escalated with reason: ${received?.escalationReason}`,
    };
  },

  /**
   * Match a valid SynthesisResult
   */
  toBeValidSynthesis: (received: any) => {
    const pass =
      received &&
      typeof received === 'object' &&
      typeof received.roundNum === 'number' &&
      typeof received.votingScore === 'number' &&
      Array.isArray(received.rankedSolutions) &&
      received.rankedSolutions.length === 3;

    return {
      pass,
      message: () =>
        pass
          ? `expected ${JSON.stringify(received)} not to be a valid SynthesisResult`
          : `expected ${JSON.stringify(received)} to be a valid SynthesisResult`,
    };
  },
};

// ============================================================================
// MOCK IMPLEMENTATIONS FOR TESTING
// ============================================================================

/**
 * Fake implementation of ConsensusOrchestrator for testing
 */
export class FakeConsensusOrchestrator {
  constructor(
    private problem: string,
    private context: string,
    private config: any = {}
  ) {}

  async run() {
    // Simulate debate - starts at round 1 without convergence
    return {
      debateId: 'debate-fake-' + Date.now(),
      problemId: 'prob-fake',
      createdAt: Date.now(),
      userId: 'user-test',
      currentRound: 1,
      maxRounds: 5,
      problemStatement: this.problem,
      constraints: [this.context],
      rounds: [],
      votingScore: 0,
      uncertaintyLevel: 100,
      convergenceThreshold: 75,
      uncertaintyThreshold: 30,
      isConverged: false,
      shouldEscalate: false,
      convergedAt: undefined,
      persistedAt: Date.now(),
      version: '1.0',
    } as any;
  }

  async executeRound() {
    const synthesis = {
      roundNum: 1,
      votes: {
        bestProposal: 'opus',
        voteCount: { opus: 2, gemini: 1, codex: 0 },
        consensus: false,
      },
      votingScore: 67,
      uncertaintyLevel: 42,
      rankedSolutions: [
        { rank: 1, modelName: 'opus', score: 85, confidence: 75, keyStrengths: [], keyWeaknesses: [] },
        { rank: 2, modelName: 'gemini', score: 70, confidence: 65, keyStrengths: [], keyWeaknesses: [] },
        { rank: 3, modelName: 'codex', score: 60, confidence: 55, keyStrengths: [], keyWeaknesses: [] },
      ],
      convergenceAnalysis: { isConverging: false },
      opusSynthesis: 'Test synthesis',
      metadata: { synthesizedAt: Date.now(), synthesizedBy: 'opus-model' },
    };

    return {
      roundNum: 1,
      timestamp: Date.now(),
      opusProposal: MOCK_OPUS_PROPOSAL,
      geminiCritique: MOCK_GEMINI_CRITIQUE,
      codexRefinement: MOCK_CODEX_REFINEMENT,
      ratings: {
        ratings: {
          opus: {
            opus: { score: 8, justification: 'My work', timestamp: Date.now() },
            gemini: { score: 6, justification: 'OK', timestamp: Date.now() },
            codex: { score: 7, justification: 'Good', timestamp: Date.now() },
          },
          gemini: {
            opus: { score: 8, justification: 'My work', timestamp: Date.now() },
            gemini: { score: 5, justification: 'OK', timestamp: Date.now() },
            codex: { score: 7, justification: 'Good', timestamp: Date.now() },
          },
          codex: {
            opus: { score: 8, justification: 'My work', timestamp: Date.now() },
            gemini: { score: 6, justification: 'OK', timestamp: Date.now() },
            codex: { score: 7, justification: 'Good', timestamp: Date.now() },
          },
        },
        averageScore: 7,
        standardDeviation: 1,
        agreementScore: 0.8,
      } as any,
      synthesis,
      durationMs: 5000,
      apiCalls: {
        opus: { tokens: 100, cost: 0.01 },
        gemini: { tokens: 100, cost: 0.01 },
        codex: { tokens: 100, cost: 0.01 },
      },
    };
  }
}

/**
 * Fake implementation of SynthesisEngine for testing
 */
export class FakeSynthesisEngine {
  async aggregateRound(params: any): Promise<SynthesisResult> {
    return {
      roundNum: params.iteration,
      votes: {
        bestProposal: 'opus',
        voteCount: { opus: 3, gemini: 0, codex: 0 },
        consensus: true,
      },
      votingScore: 100,
      uncertaintyLevel: 0,
      rankedSolutions: [
        {
          rank: 1,
          modelName: 'opus',
          score: 95,
          confidence: 98,
          keyStrengths: ['Good approach'],
          keyWeaknesses: [],
        },
        {
          rank: 2,
          modelName: 'gemini',
          score: 80,
          confidence: 85,
          keyStrengths: [],
          keyWeaknesses: [],
        },
        {
          rank: 3,
          modelName: 'codex',
          score: 75,
          confidence: 80,
          keyStrengths: [],
          keyWeaknesses: [],
        },
      ],
      convergenceAnalysis: {
        isConverging: true,
        trendFromPreviousRound: 'improving',
        predictedConvergenceRound: 2,
      },
      opusSynthesis: '# Synthesis\nModels agree on solution',
      metadata: {
        synthesizedAt: Date.now(),
        synthesizedBy: 'opus-model',
      },
    };
  }
}

/**
 * Fake retry orchestrator
 */
export class FakeRetryOrchestrator {
  async executeWithRetry(fn: () => Promise<any>, maxAttempts: number = 3) {
    let lastError: Error | null = null;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
      }
    }
    throw lastError || new Error('Max retries exceeded');
  }

  async executeWithExponentialBackoff(fn: () => Promise<any>) {
    let attempt = 0;
    const maxAttempts = 3;
    let delay = 1000;

    while (attempt < maxAttempts) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (attempt >= maxAttempts) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }
}
