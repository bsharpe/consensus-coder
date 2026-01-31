/**
 * Test Fixtures & Mock Data for Consensus-Coder Tests
 *
 * Provides reusable sample data for unit and integration tests:
 * - Sample debate states at various stages
 * - Mock model responses
 * - Mock rating matrices
 * - Mock synthesis results
 * - Helper functions to create realistic test data
 *
 * @module tests/fixtures/sample-debate-states
 */

import {
  DebateState,
  DebateRound,
  ModelResponse,
  RatingMatrix,
  SynthesisResult,
  CodeSolution,
} from '../../src/types/consensus-types';

// ============================================================================
// SAMPLE CODE SOLUTIONS
// ============================================================================

export const SAMPLE_CODE_SOLUTION: CodeSolution = {
  code: `
    function lruCache(capacity: number) {
      const cache = new Map();
      
      return {
        get(key: string) {
          if (!cache.has(key)) return -1;
          const value = cache.get(key);
          cache.delete(key);
          cache.set(key, value);
          return value;
        },
        put(key: string, value: number) {
          if (cache.has(key)) cache.delete(key);
          cache.set(key, value);
          if (cache.size > capacity) {
            cache.delete(cache.keys().next().value);
          }
        }
      };
    }
  `,
  language: 'typescript',
  explanation: 'LRU cache using TypeScript Map with O(1) operations.',
  approach: 'Uses native Map to maintain insertion order. Delete and re-insert on access to move items to end.',
  complexity: {
    time: 'O(1)',
    space: 'O(capacity)',
  },
  testCases: [
    {
      input: 'capacity=2, put(1,1), put(2,2), get(1), put(3,3)',
      output: '1 found, 2 evicted'
    },
  ],
  pros: [
    'Native Map maintains insertion order',
    'O(1) time complexity',
    'Simple and readable',
  ],
  cons: [
    'Map iteration adds memory overhead',
    'No TTL support',
  ],
  alternatives: [
    'Use doubly-linked list for more control',
    'Use Redis for distributed caching',
  ],
};

// ============================================================================
// MOCK MODEL RESPONSES
// ============================================================================

export const MOCK_OPUS_PROPOSAL: ModelResponse = {
  modelName: 'opus',
  role: 'proposer',
  content: `Here are three approaches to cache eviction:
    
    1. LRU: Evict least recently used item (simple, effective)
    2. LFU: Evict least frequently used item (tracks frequency)
    3. TTL: Time-based expiration with cleanup
  `,
  solution: SAMPLE_CODE_SOLUTION,
  metadata: {
    requestedAt: Date.now() - 10000,
    completedAt: Date.now(),
    inputTokens: 1200,
    outputTokens: 450,
    modelVersion: 'claude-opus-4-5',
    temperature: 0.7,
  },
};

export const MOCK_GEMINI_CRITIQUE: ModelResponse = {
  modelName: 'gemini',
  role: 'critic',
  content: `Critique of proposals:
    
    Proposal 1 (LRU): Excellent approach, straightforward implementation, O(1) operations.
    Score: 9/10
    
    Proposal 2 (LFU): Good for certain workloads but more complex to implement.
    Score: 7/10
    
    Proposal 3 (TTL): Useful but requires background cleanup threads.
    Score: 6/10
  `,
  critique: {
    issues: [
      { issue: 'LFU requires more memory for frequency tracking', severity: 'low' },
      { issue: 'TTL needs cleanup mechanism', severity: 'medium' },
    ],
    suggestions: [
      'LRU is most practical for general use',
      'Consider hybrid approach for specific domains',
    ],
    overallScore: 8,
  },
  metadata: {
    requestedAt: Date.now() - 8000,
    completedAt: Date.now(),
    inputTokens: 2100,
    outputTokens: 380,
    modelVersion: 'gemini-2.0-flash',
    temperature: 0.5,
  },
};

export const MOCK_CODEX_REFINEMENT: ModelResponse = {
  modelName: 'codex',
  role: 'refiner',
  content: `Refined LRU implementation with better error handling and type safety.`,
  refinement: {
    improvements: [
      'Added generic type support',
      'Added capacity validation',
      'Improved documentation',
    ],
    finalCode: SAMPLE_CODE_SOLUTION.code,
    confidence: 9,
  },
  metadata: {
    requestedAt: Date.now() - 6000,
    completedAt: Date.now(),
    inputTokens: 1800,
    outputTokens: 520,
    modelVersion: 'claude-3-5-sonnet',
    temperature: 0.3,
  },
};

// ============================================================================
// MOCK RATING MATRICES
// ============================================================================

export const MOCK_RATING_MATRIX_CONSENSUS: RatingMatrix = {
  ratings: {
    opus: {
      opus: {
        score: 9,
        justification: 'My LRU approach is clean and efficient',
        timestamp: Date.now(),
      },
      gemini: {
        score: 6,
        justification: 'Critique is helpful but verbose',
        timestamp: Date.now(),
      },
      codex: {
        score: 8,
        justification: 'Good refinement with type safety',
        timestamp: Date.now(),
      },
    },
    gemini: {
      opus: {
        score: 9,
        justification: 'LRU solution is well-designed',
        timestamp: Date.now(),
      },
      gemini: {
        score: 5,
        justification: 'My critique was thorough',
        timestamp: Date.now(),
      },
      codex: {
        score: 8,
        justification: 'Solid refinement work',
        timestamp: Date.now(),
      },
    },
    codex: {
      opus: {
        score: 9,
        justification: 'Strong fundamental approach',
        timestamp: Date.now(),
      },
      gemini: {
        score: 6,
        justification: 'Fair analysis, some redundancy',
        timestamp: Date.now(),
      },
      codex: {
        score: 8,
        justification: 'Improved implementation quality',
        timestamp: Date.now(),
      },
    },
  },
  averageScore: 7.67,
  standardDeviation: 1.22,
  agreementScore: 0.92,
};

export const MOCK_RATING_MATRIX_DISAGREEMENT: RatingMatrix = {
  ratings: {
    opus: {
      opus: {
        score: 10,
        justification: 'Best approach',
        timestamp: Date.now(),
      },
      gemini: {
        score: 3,
        justification: 'Too complex',
        timestamp: Date.now(),
      },
      codex: {
        score: 4,
        justification: 'Missing features',
        timestamp: Date.now(),
      },
    },
    gemini: {
      opus: {
        score: 5,
        justification: 'Missing error handling',
        timestamp: Date.now(),
      },
      gemini: {
        score: 9,
        justification: 'My approach is balanced',
        timestamp: Date.now(),
      },
      codex: {
        score: 8,
        justification: 'Good refinement',
        timestamp: Date.now(),
      },
    },
    codex: {
      opus: {
        score: 4,
        justification: 'Oversimplified',
        timestamp: Date.now(),
      },
      gemini: {
        score: 6,
        justification: 'Some good points',
        timestamp: Date.now(),
      },
      codex: {
        score: 10,
        justification: 'Most complete solution',
        timestamp: Date.now(),
      },
    },
  },
  averageScore: 6.78,
  standardDeviation: 2.45,
  agreementScore: 0.35,
};

// ============================================================================
// MOCK SYNTHESIS RESULTS
// ============================================================================

export const MOCK_SYNTHESIS_RESULT_CONVERGED: SynthesisResult = {
  roundNum: 2,
  votes: {
    bestProposal: 'opus',
    voteCount: {
      opus: 3,
      gemini: 0,
      codex: 0,
    },
    consensus: true,
  },
  votingScore: 100,
  uncertaintyLevel: 5,
  rankedSolutions: [
    {
      rank: 1,
      modelName: 'opus',
      score: 96,
      confidence: 98,
      keyStrengths: ['O(1) operations', 'Simple to implement', 'Well-tested pattern'],
      keyWeaknesses: [],
    },
    {
      rank: 2,
      modelName: 'codex',
      score: 82,
      confidence: 85,
      keyStrengths: ['Good type safety', 'Improved error handling'],
      keyWeaknesses: ['Adds complexity'],
    },
    {
      rank: 3,
      modelName: 'gemini',
      score: 65,
      confidence: 70,
      keyStrengths: [],
      keyWeaknesses: ['Too verbose', 'Not practical'],
    },
  ],
  convergenceAnalysis: {
    isConverging: true,
    trendFromPreviousRound: 'improving',
    predictedConvergenceRound: 2,
  },
  opusSynthesis: `## Round 2 Synthesis

All models converged on the LRU approach as optimal for this use case. The solution demonstrates:
- Consensus: 3/3 models ranked LRU first
- Voting Score: 100%
- Uncertainty: 5% (minimal disagreement)

The debate has **achieved convergence**. Ready to generate implementation plan.`,
  metadata: {
    synthesizedAt: Date.now(),
    synthesizedBy: 'opus-model',
  },
};

export const MOCK_SYNTHESIS_RESULT_DIVERGING: SynthesisResult = {
  roundNum: 1,
  votes: {
    bestProposal: 'opus',
    voteCount: {
      opus: 1,
      gemini: 1,
      codex: 1,
    },
    consensus: false,
  },
  votingScore: 33,
  uncertaintyLevel: 85,
  rankedSolutions: [
    {
      rank: 1,
      modelName: 'opus',
      score: 70,
      confidence: 50,
      keyStrengths: [],
      keyWeaknesses: [],
    },
    {
      rank: 2,
      modelName: 'gemini',
      score: 68,
      confidence: 48,
      keyStrengths: [],
      keyWeaknesses: [],
    },
    {
      rank: 3,
      modelName: 'codex',
      score: 65,
      confidence: 45,
      keyStrengths: [],
      keyWeaknesses: [],
    },
  ],
  convergenceAnalysis: {
    isConverging: false,
  },
  opusSynthesis: `## Round 1 Synthesis

Models show **significant disagreement** on approach:
- Voting Score: 33% (each model ranked different solution first)
- Uncertainty: 85% (high variance in ratings)

Recommendation: Continue debate. Models should consider each other's critiques and refine proposals.`,
  metadata: {
    synthesizedAt: Date.now(),
    synthesizedBy: 'opus-model',
  },
};

// ============================================================================
// MOCK DEBATE ROUNDS
// ============================================================================

export const MOCK_DEBATE_ROUND_1: DebateRound = {
  roundNum: 1,
  timestamp: Date.now(),
  opusProposal: MOCK_OPUS_PROPOSAL,
  geminiCritique: MOCK_GEMINI_CRITIQUE,
  codexRefinement: MOCK_CODEX_REFINEMENT,
  ratings: MOCK_RATING_MATRIX_DISAGREEMENT,
  synthesis: MOCK_SYNTHESIS_RESULT_DIVERGING,
  durationMs: 18500,
  apiCalls: {
    opus: { tokens: 1650, cost: 0.0165 },
    gemini: { tokens: 2480, cost: 0.0124 },
    codex: { tokens: 2320, cost: 0.0232 },
  },
};

export const MOCK_DEBATE_ROUND_2: DebateRound = {
  roundNum: 2,
  timestamp: Date.now() + 30000,
  opusProposal: MOCK_OPUS_PROPOSAL,
  geminiCritique: MOCK_GEMINI_CRITIQUE,
  codexRefinement: MOCK_CODEX_REFINEMENT,
  ratings: MOCK_RATING_MATRIX_CONSENSUS,
  synthesis: MOCK_SYNTHESIS_RESULT_CONVERGED,
  durationMs: 16200,
  apiCalls: {
    opus: { tokens: 1400, cost: 0.0140 },
    gemini: { tokens: 2100, cost: 0.0105 },
    codex: { tokens: 1950, cost: 0.0195 },
  },
};

// ============================================================================
// MOCK DEBATE STATES
// ============================================================================

/**
 * Initial debate state at start of debate
 */
export const MOCK_DEBATE_STATE_INITIAL: DebateState = {
  debateId: 'debate-1704067200000-abc12345',
  problemId: 'prob-001',
  createdAt: Date.now() - 60000,
  userId: 'user-ben',
  currentRound: 1,
  maxRounds: 5,
  problemStatement: 'Implement a cache eviction strategy that maintains O(1) time complexity for both get and put operations.',
  constraints: ['TypeScript', 'Redis backend', 'Production-ready'],
  rounds: [],
  votingScore: 0,
  uncertaintyLevel: 100,
  convergenceThreshold: 75,
  uncertaintyThreshold: 30,
  isConverged: false,
  shouldEscalate: false,
  persistedAt: Date.now() - 60000,
  version: '1.0',
};

/**
 * Debate state after first round (diverging)
 */
export const MOCK_DEBATE_STATE_ROUND_1: DebateState = {
  ...MOCK_DEBATE_STATE_INITIAL,
  currentRound: 2,
  rounds: [MOCK_DEBATE_ROUND_1],
  votingScore: 33,
  uncertaintyLevel: 85,
  isConverged: false,
  persistedAt: Date.now(),
};

/**
 * Debate state after second round (converged)
 */
export const MOCK_DEBATE_STATE_CONVERGED: DebateState = {
  ...MOCK_DEBATE_STATE_INITIAL,
  currentRound: 3,
  rounds: [MOCK_DEBATE_ROUND_1, MOCK_DEBATE_ROUND_2],
  votingScore: 100,
  uncertaintyLevel: 5,
  isConverged: true,
  convergedAt: Date.now(),
  consensusSolution: SAMPLE_CODE_SOLUTION,
  implementationPlan: `# Implementation Plan

## Steps
1. Analyze requirements
2. Implement LRU cache
3. Add comprehensive tests
4. Document approach
`,
  persistedAt: Date.now(),
};

/**
 * Debate state at max rounds without convergence (needs escalation)
 */
export const MOCK_DEBATE_STATE_ESCALATE: DebateState = {
  ...MOCK_DEBATE_STATE_INITIAL,
  currentRound: 5,
  maxRounds: 5,
  rounds: [
    MOCK_DEBATE_ROUND_1,
    { ...MOCK_DEBATE_ROUND_2, roundNum: 2 },
    { ...MOCK_DEBATE_ROUND_2, roundNum: 3, synthesis: { ...MOCK_DEBATE_ROUND_2.synthesis, roundNum: 3 } },
    { ...MOCK_DEBATE_ROUND_2, roundNum: 4, synthesis: { ...MOCK_DEBATE_ROUND_2.synthesis, roundNum: 4 } },
  ],
  votingScore: 68,
  uncertaintyLevel: 40,
  isConverged: false,
  shouldEscalate: true,
  escalatedAt: Date.now(),
  escalationReason: 'Max 5 rounds reached without convergence. Voting score 68% (threshold: 75%)',
  persistedAt: Date.now(),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a debate state with custom values
 */
export function createDebateState(overrides: Partial<DebateState> = {}): DebateState {
  return { ...MOCK_DEBATE_STATE_INITIAL, ...overrides };
}

/**
 * Create a model response with custom values
 */
export function createModelResponse(overrides: Partial<ModelResponse> = {}): ModelResponse {
  return { ...MOCK_OPUS_PROPOSAL, ...overrides };
}

/**
 * Create a rating matrix with custom scores
 */
export function createRatingMatrix(overrides: Partial<RatingMatrix> = {}): RatingMatrix {
  return { ...MOCK_RATING_MATRIX_CONSENSUS, ...overrides };
}

/**
 * Create a synthesis result with custom values
 */
export function createSynthesisResult(overrides: Partial<SynthesisResult> = {}): SynthesisResult {
  return { ...MOCK_SYNTHESIS_RESULT_CONVERGED, ...overrides };
}

/**
 * Create a debate round with custom values
 */
export function createDebateRound(overrides: Partial<DebateRound> = {}): DebateRound {
  return { ...MOCK_DEBATE_ROUND_1, ...overrides };
}
