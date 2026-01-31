/**
 * Tools Module
 *
 * Exports all tool-related types, interfaces, and classes for the
 * consensus-coder system.
 *
 * @module tools
 * @version 1.0
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export type {
  ToolName,
  ToolRole,
  ToolConfig,
  ToolSolution,
  ToolVote,
  ToolGenerateRequest,
  ToolReviewRequest,
  ToolAdapter,
} from './tool-adapter.js';

export type { LogLevel, LoggerFn } from './base-adapter.js';

// ============================================================================
// Classes
// ============================================================================

export { BaseAdapter } from './base-adapter.js';
export { AuggieAdapter } from './auggie-adapter.js';
export { GeminiAdapter } from './gemini-adapter.js';
export { CodexAdapter } from './codex-adapter.js';
export { ToolRegistry, toolRegistry } from './tool-registry.js';

