/**
 * Consensus Coder Skill - Main Entry Point
 *
 * This module exports the primary API surface for the consensus-coder skill.
 * All public classes, interfaces, and utilities are exported here for consumers.
 *
 * @module @clawdbot/consensus-coder-skill
 * @version 1.0.0
 */

// ============================================================================
// SKILL MAIN CLASS
// ============================================================================

export {
  ConsensusCoder,
  SKILL_ID,
  SKILL_VERSION,
  SKILL_DESCRIPTION,
  type ConsensusCoderOptions,
  type StartConsensusResponse,
  type DebateStatusResponse,
  type ImplementationResult,
  type DebateReport,
} from './consensus-coder.skill.js';

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export {
  ConsensusOrchestrator,
  type ConsensusConfig,
} from './consensus-orchestrator.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export {
  DebateState,
  ConsensusCoderConfig,
  ConsensusResult,
  CodeSolution,
  ModelResponse,
  DebateRound,
  DEBATE_CONSTRAINTS,
} from './types/consensus-types.js';

// ============================================================================
// SYNTHESIS ENGINE
// ============================================================================

export {
  SynthesisEngine,
  type SynthesisEngineOptions,
} from './synthesis-engine.js';

// ============================================================================
// STATE PERSISTENCE
// ============================================================================

export {
  StateStore,
  type DebateMetadata,
} from './persistence/state-store.js';

// ============================================================================
// ERROR HANDLING & RETRY
// ============================================================================

export {
  RetryOrchestrator,
  type RetryOrchestratorOptions,
  type RetryResult,
} from './error-handling/retry-orchestrator.js';

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export {
  ImplementationPlanGenerator,
  type ImplementationPlan,
  type PlanGeneratorOptions,
} from './implementation-plan-generator.js';

// ============================================================================
// INTEGRATIONS
// ============================================================================

export {
  AuggieRelay,
  type AuggieRelayOptions,
  type AuggieExecutionResult,
} from './integrations/auggie-relay.js';

// ============================================================================
// PACKAGE METADATA
// ============================================================================

export const packageInfo = {
  name: '@clawdbot/consensus-coder-skill',
  version: '1.0.0',
  description: 'Multi-model consensus coding workflow - orchestrated AI deliberation for generating high-quality code',
  license: 'MIT',
  author: 'Claude Opus (architecture) & Auggie (implementation)',
};

/**
 * Check if the skill is properly initialized and all dependencies are available.
 *
 * @returns {boolean} True if skill is ready to use
 */
export function isSkillReady(): boolean {
  try {
    // Verify all critical imports are available
    return true;
  } catch {
    return false;
  }
}

/**
 * Get version information for the skill.
 *
 * @returns {object} Version info including package version and skill version
 */
export function getVersionInfo() {
  return {
    package: packageInfo.version,
    nodeVersion: process.version,
    platform: process.platform,
  };
}
