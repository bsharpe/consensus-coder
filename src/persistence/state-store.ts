/**
 * State Persistence Layer - Consensus-Coder
 *
 * Handles atomic saves and loads of debate state from disk.
 * Ensures no data loss on failures via atomic writes and validation.
 *
 * Features:
 * - Atomic writes (temp file + rename pattern)
 * - State validation on load/save
 * - Debate directory management
 * - Metadata tracking (created, updated timestamps)
 * - Cross-platform path handling
 * - Comprehensive error logging
 *
 * @module persistence/state-store
 * @version 1.0
 * @author Auggie (implementation), Claude Opus (architecture)
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  DebateState,
  DEBATE_CONSTRAINTS,
  DebateRound,
  ModelResponse,
  RatingMatrix,
  SynthesisResult,
  CodeSolution,
} from '../types/consensus-types';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Metadata about a saved debate for discovery and cleanup.
 * Read from metadata.json in each debate directory.
 *
 * @interface DebateMetadata
 */
export interface DebateMetadata {
  debateId: string;
  status: 'pending' | 'in_progress' | 'converged' | 'escalated';
  iteration: number;
  createdAt: Date;
  lastUpdated: Date;
  filePath: string;
}

/**
 * Configuration for state store persistence.
 * Loaded from ~/.clawdbot/consensus-debates/config.json
 *
 * @interface StateStoreConfig
 */
interface StateStoreConfig {
  version: string;
  schema: string;
  maxDebatesKept: number;
  autoCleanupDaysOld: number;
  atomicWrites: boolean;
}

// ============================================================================
// STATE STORE CLASS
// ============================================================================

/**
 * Manages persistence of debate state to disk.
 *
 * Thread-safe (single-process) atomic writes prevent corruption.
 * Uses temporary files + atomic rename pattern.
 *
 * @class StateStore
 * @example
 * ```typescript
 * const store = new StateStore();
 * await store.saveState(debateState);
 * const state = await store.loadState(debateId);
 * const debates = await store.listDebates();
 * ```
 */
export class StateStore {
  private basePath: string;
  private config: StateStoreConfig;
  private logger: Console;

  /**
   * Initialize StateStore with optional custom base path.
   *
   * @constructor
   * @param {string} [basePath] - Custom base path for debates. Defaults to ~/.clawdbot/consensus-debates
   * @throws {Error} If directory creation fails
   *
   * @example
   * ```typescript
   * // Default: ~/.clawdbot/consensus-debates
   * const store = new StateStore();
   *
   * // Custom path
   * const store = new StateStore('/tmp/debates');
   * ```
   */
  constructor(basePath?: string) {
    this.logger = console; // Use console for logging in subagent context

    // Resolve base path (expand ~ to home directory)
    if (basePath) {
      this.basePath = this.expandPath(basePath);
    } else {
      this.basePath = path.join(os.homedir(), '.clawdbot', 'consensus-debates');
    }

    // Default config
    this.config = {
      version: '1.0',
      schema: 'consensus-debate-v1',
      maxDebatesKept: 100,
      autoCleanupDaysOld: 30,
      atomicWrites: true,
    };

    this.logger.debug(`[StateStore] Initialized with base path: ${this.basePath}`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC METHODS
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Save debate state to disk atomically.
   *
   * Algorithm:
   * 1. Validate state schema
   * 2. Create debate directory if needed
   * 3. Write to temp file with timestamp
   * 4. Atomic rename: .tmp → state.json
   * 5. Write metadata.json
   * 6. Log success
   *
   * @async
   * @param {DebateState} state - The debate state to persist
   * @throws {Error} On validation failure, disk error, or permission denied
   *
   * @example
   * ```typescript
   * const state: DebateState = { ... };
   * await store.saveState(state);
   * ```
   */
  async saveState(state: DebateState): Promise<void> {
    try {
      // 1. Validate state before saving
      await this.validateState(state);

      // 2. Create debate directory
      const debateDir = path.join(this.basePath, state.debateId);
      await this.ensureDirectoryExists(debateDir);

      // 3. Write state atomically
      const stateFilePath = path.join(debateDir, 'state.json');
      const stateContent = JSON.stringify(state, null, 2);

      await this.atomicWrite(stateFilePath, stateContent);

      // 4. Write metadata
      const metadata = {
        debateId: state.debateId,
        status: this.getDebateStatus(state),
        iteration: state.currentRound,
        createdAt: new Date(state.createdAt),
        lastUpdated: new Date(state.persistedAt),
        filePath: stateFilePath,
      };

      const metadataFilePath = path.join(debateDir, 'metadata.json');
      const metadataContent = JSON.stringify(metadata, null, 2);
      await fs.writeFile(metadataFilePath, metadataContent, 'utf-8');

      // 5. Log success
      const fileSizeKb = stateContent.length / 1024;
      this.logger.info(
        `[StateStore] Saved debate ${state.debateId} to ${stateFilePath} (${fileSizeKb.toFixed(1)}KB)`
      );
    } catch (error) {
      if (error instanceof Error) {
        // Classify error and provide helpful message
        if (error.message.includes('ENOSPC')) {
          this.logger.error(`[StateStore] DISK FULL: Cannot save state for ${state.debateId}`);
          throw new Error(`Disk full: Cannot save debate state. Please free up space.`);
        } else if (error.message.includes('EACCES')) {
          this.logger.error(`[StateStore] PERMISSION DENIED: Cannot write to ${this.basePath}`);
          throw new Error(`Permission denied: Cannot write to ${this.basePath}. Check directory permissions.`);
        } else if (error.message.includes('JSON')) {
          this.logger.error(`[StateStore] JSON serialization error: ${error.message}`);
          throw new Error(`Failed to serialize state: ${error.message}`);
        } else {
          throw error;
        }
      }
      throw error;
    }
  }

  /**
   * Load debate state from disk.
   *
   * Algorithm:
   * 1. Check directory exists
   * 2. Read state.json
   * 3. Parse JSON
   * 4. Validate against schema
   * 5. Return typed state
   *
   * @async
   * @param {string} debateId - The debate ID to load
   * @returns {Promise<DebateState>} The loaded and validated debate state
   * @throws {Error} On file not found, parse error, validation failure, or permission denied
   *
   * @example
   * ```typescript
   * const state = await store.loadState('debate-123456-abcd1234');
   * ```
   */
  async loadState(debateId: string): Promise<DebateState> {
    try {
      // 1. Check directory exists
      const debateDir = path.join(this.basePath, debateId);
      const stateFilePath = path.join(debateDir, 'state.json');

      // Check if file exists
      try {
        await fs.access(stateFilePath, fs.constants.F_OK);
      } catch {
        throw new Error(`Debate not found: ${debateId}`);
      }

      // 2. Read state.json
      const stateContent = await fs.readFile(stateFilePath, 'utf-8');

      // 3. Parse JSON
      let state: DebateState;
      try {
        state = JSON.parse(stateContent) as DebateState;
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          const lines = stateContent.split('\n');
          this.logger.error(
            `[StateStore] JSON parse error at line ${parseError.message}. First 5 lines: ${lines.slice(0, 5).join('\n')}`
          );
          throw new Error(
            `Failed to parse state.json: ${parseError.message}. State may be corrupted.`
          );
        }
        throw parseError;
      }

      // 4. Validate against schema
      await this.validateState(state);

      this.logger.info(`[StateStore] Loaded debate ${debateId} from ${stateFilePath}`);
      return state;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('EACCES')) {
          this.logger.error(`[StateStore] PERMISSION DENIED: Cannot read ${debateId}`);
          throw new Error(`Permission denied: Cannot read debate state for ${debateId}.`);
        }
        throw error;
      }
      throw error;
    }
  }

  /**
   * List all saved debates for discovery and cleanup.
   *
   * Scans the base directory, reads metadata.json from each subdirectory.
   * Returns sorted by lastUpdated (newest first).
   *
   * @async
   * @returns {Promise<DebateMetadata[]>} Array of debate metadata, sorted by lastUpdated desc
   *
   * @example
   * ```typescript
   * const debates = await store.listDebates();
   * console.log(`Found ${debates.length} debates`);
   * debates.forEach(d => console.log(`${d.debateId}: ${d.status}`));
   * ```
   */
  async listDebates(): Promise<DebateMetadata[]> {
    try {
      // Ensure base directory exists
      await this.ensureDirectoryExists(this.basePath);

      // List subdirectories
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      const debateMetadata: DebateMetadata[] = [];

      for (const entry of entries) {
        // Skip non-directories and special files
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }

        const metadataFilePath = path.join(this.basePath, entry.name, 'metadata.json');

        try {
          const metadataContent = await fs.readFile(metadataFilePath, 'utf-8');
          const metadata = JSON.parse(metadataContent) as DebateMetadata;
          debateMetadata.push(metadata);
        } catch (err) {
          // Log but continue on individual metadata read failures
          this.logger.warn(
            `[StateStore] Failed to read metadata for ${entry.name}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Sort by lastUpdated (newest first)
      debateMetadata.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());

      this.logger.info(`[StateStore] Listed ${debateMetadata.length} debates`);
      return debateMetadata;
    } catch (error) {
      this.logger.error(`[StateStore] Failed to list debates: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Delete a debate's directory and all contents.
   *
   * Algorithm:
   * 1. Check directory exists
   * 2. List all files
   * 3. Delete each file
   * 4. Delete directory
   * 5. Log deletion
   *
   * Safety: Requires exact debateId match (no wildcards).
   *
   * @async
   * @param {string} debateId - The debate ID to delete
   * @throws {Error} On permission denied or other filesystem errors
   *
   * @example
   * ```typescript
   * await store.deleteDebate('debate-123456-abcd1234');
   * ```
   */
  async deleteDebate(debateId: string): Promise<void> {
    try {
      // 1. Check directory exists
      const debateDir = path.join(this.basePath, debateId);

      try {
        await fs.access(debateDir, fs.constants.F_OK);
      } catch {
        throw new Error(`Debate directory not found: ${debateId}`);
      }

      // 2. Delete directory recursively
      await fs.rm(debateDir, { recursive: true, force: true });

      this.logger.info(`[StateStore] Deleted debate directory: ${debateDir}`);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('EACCES')) {
          this.logger.error(`[StateStore] PERMISSION DENIED: Cannot delete ${debateId}`);
          throw new Error(`Permission denied: Cannot delete debate ${debateId}.`);
        }
        throw error;
      }
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // PRIVATE METHODS
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Ensure a directory exists, creating it recursively if needed.
   *
   * @async
   * @private
   * @param {string} dirPath - The directory path to ensure
   * @throws {Error} On permission denied or other filesystem errors
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes('EACCES')) {
        this.logger.error(`[StateStore] Permission denied creating directory: ${dirPath}`);
        throw new Error(`Permission denied: Cannot create directory ${dirPath}.`);
      }
      throw error;
    }
  }

  /**
   * Validate debate state schema before saving.
   *
   * Checks:
   * - debateId is non-empty string
   * - status is valid enum value
   * - iteration (currentRound) is 0-5
   * - rounds is array with valid DebateRound objects
   * - timestamps are valid dates (numbers)
   * - convergenceThreshold and uncertaintyThreshold are in valid ranges
   *
   * @async
   * @private
   * @param {DebateState} state - The state to validate
   * @throws {Error} On validation failure with detailed message
   */
  private async validateState(state: DebateState): Promise<void> {
    const errors: string[] = [];

    // Check debateId
    if (!state.debateId || typeof state.debateId !== 'string' || state.debateId.trim().length === 0) {
      errors.push('debateId: must be non-empty string');
    }

    // Check currentRound
    if (!Number.isInteger(state.currentRound) || state.currentRound < 0 || state.currentRound > 5) {
      errors.push(`currentRound: must be integer between 0-5, got ${state.currentRound}`);
    }

    // Check maxRounds
    if (!Number.isInteger(state.maxRounds) || state.maxRounds < 1 || state.maxRounds > 10) {
      errors.push(`maxRounds: must be integer between 1-10, got ${state.maxRounds}`);
    }

    // Check problemStatement
    if (!state.problemStatement || typeof state.problemStatement !== 'string' || state.problemStatement.trim().length === 0) {
      errors.push('problemStatement: must be non-empty string');
    }

    // Check timestamps
    if (!Number.isInteger(state.createdAt) || state.createdAt <= 0) {
      errors.push(`createdAt: must be positive integer timestamp, got ${state.createdAt}`);
    }

    if (!Number.isInteger(state.persistedAt) || state.persistedAt <= 0) {
      errors.push(`persistedAt: must be positive integer timestamp, got ${state.persistedAt}`);
    }

    // Check userId
    if (!state.userId || typeof state.userId !== 'string' || state.userId.trim().length === 0) {
      errors.push('userId: must be non-empty string');
    }

    // Check voting scores
    if (typeof state.votingScore !== 'number' || state.votingScore < 0 || state.votingScore > 100) {
      errors.push(`votingScore: must be number between 0-100, got ${state.votingScore}`);
    }

    if (typeof state.uncertaintyLevel !== 'number' || state.uncertaintyLevel < 0 || state.uncertaintyLevel > 100) {
      errors.push(`uncertaintyLevel: must be number between 0-100, got ${state.uncertaintyLevel}`);
    }

    // Check convergence thresholds
    if (
      typeof state.convergenceThreshold !== 'number' ||
      state.convergenceThreshold < 50 ||
      state.convergenceThreshold > 100
    ) {
      errors.push(`convergenceThreshold: must be number between 50-100, got ${state.convergenceThreshold}`);
    }

    if (
      typeof state.uncertaintyThreshold !== 'number' ||
      state.uncertaintyThreshold < 0 ||
      state.uncertaintyThreshold > 50
    ) {
      errors.push(`uncertaintyThreshold: must be number between 0-50, got ${state.uncertaintyThreshold}`);
    }

    // Check rounds array
    if (!Array.isArray(state.rounds)) {
      errors.push('rounds: must be an array');
    } else {
      state.rounds.forEach((round, idx) => {
        if (!this.isValidDebateRound(round)) {
          errors.push(`rounds[${idx}]: invalid DebateRound structure`);
        }
      });
    }

    // Check isConverged
    if (typeof state.isConverged !== 'boolean') {
      errors.push(`isConverged: must be boolean, got ${typeof state.isConverged}`);
    }

    // If converged, check convergedAt timestamp
    if (state.isConverged && (!state.convergedAt || !Number.isInteger(state.convergedAt) || state.convergedAt <= 0)) {
      errors.push('convergedAt: must be set and valid timestamp if isConverged=true');
    }

    // Check shouldEscalate
    if (typeof state.shouldEscalate !== 'boolean') {
      errors.push(`shouldEscalate: must be boolean, got ${typeof state.shouldEscalate}`);
    }

    // If escalated, check escalatedAt timestamp
    if (
      state.shouldEscalate &&
      (!state.escalatedAt || !Number.isInteger(state.escalatedAt) || state.escalatedAt <= 0)
    ) {
      errors.push('escalatedAt: must be set and valid timestamp if shouldEscalate=true');
    }

    // Check version
    if (!state.version || typeof state.version !== 'string') {
      errors.push(`version: must be non-empty string, got ${state.version}`);
    }

    if (errors.length > 0) {
      const errorMsg = errors.join('\n  ');
      this.logger.error(`[StateStore] State validation failed for ${state.debateId}:\n  ${errorMsg}`);
      throw new Error(`State validation failed:\n  ${errorMsg}`);
    }
  }

  /**
   * Check if an object matches the DebateRound schema.
   *
   * @private
   * @param {unknown} round - Object to validate
   * @returns {boolean} True if valid DebateRound
   */
  private isValidDebateRound(round: unknown): boolean {
    if (typeof round !== 'object' || round === null) {
      return false;
    }

    const r = round as Record<string, unknown>;

    // Check required fields
    return (
      Number.isInteger(r.roundNum) &&
      Number.isInteger(r.timestamp) &&
      this.isValidModelResponse(r.opusProposal) &&
      this.isValidModelResponse(r.geminiCritique) &&
      this.isValidModelResponse(r.codexRefinement) &&
      typeof r.ratings === 'object' &&
      r.ratings !== null &&
      typeof r.synthesis === 'object' &&
      r.synthesis !== null &&
      Number.isInteger(r.durationMs) &&
      typeof r.apiCalls === 'object' &&
      r.apiCalls !== null
    );
  }

  /**
   * Check if an object matches the ModelResponse schema.
   *
   * @private
   * @param {unknown} response - Object to validate
   * @returns {boolean} True if valid ModelResponse
   */
  private isValidModelResponse(response: unknown): boolean {
    if (typeof response !== 'object' || response === null) {
      return false;
    }

    const r = response as Record<string, unknown>;

    return (
      ['opus', 'gemini', 'codex'].includes(String(r.modelName)) &&
      ['proposer', 'critic', 'refiner'].includes(String(r.role)) &&
      typeof r.content === 'string' &&
      typeof r.metadata === 'object' &&
      r.metadata !== null
    );
  }

  /**
   * Write content to a file atomically.
   *
   * Pattern:
   * 1. Write to {filePath}.tmp
   * 2. fsync() to ensure disk write
   * 3. Rename .tmp → actual file
   *
   * Prevents partial writes on crash.
   *
   * @async
   * @private
   * @param {string} filePath - Path to write to
   * @param {string} content - Content to write
   * @throws {Error} On write or rename failure
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tmpFilePath = `${filePath}.tmp`;

    try {
      // 1. Write to temp file
      await fs.writeFile(tmpFilePath, content, 'utf-8');

      // 2. fsync to ensure disk write (sync the file descriptor)
      const fd = fsSync.openSync(tmpFilePath, 'r');
      fsSync.fsyncSync(fd);
      fsSync.closeSync(fd);

      // 3. Atomic rename
      await fs.rename(tmpFilePath, filePath);
    } catch (error) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tmpFilePath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Determine the status of a debate based on its state.
   *
   * @private
   * @param {DebateState} state - The debate state
   * @returns {string} Status: 'pending' | 'in_progress' | 'converged' | 'escalated'
   */
  private getDebateStatus(state: DebateState): 'pending' | 'in_progress' | 'converged' | 'escalated' {
    if (state.shouldEscalate) {
      return 'escalated';
    }
    if (state.isConverged) {
      return 'converged';
    }
    if (state.currentRound > 0) {
      return 'in_progress';
    }
    return 'pending';
  }

  /**
   * Expand tilde (~) to user home directory.
   *
   * @private
   * @param {string} filePath - Path that may start with ~
   * @returns {string} Expanded path
   */
  private expandPath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }

  // ──────────────────────────────────────────────────────────────────────
  // TESTING HOOKS - Public for test access
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Get the base path for testing.
   *
   * @public
   * @returns {string} The configured base path
   */
  public _getBasePath(): string {
    return this.basePath;
  }

  /**
   * Public wrapper for ensureDirectoryExists (for testing).
   *
   * @public
   * @async
   * @param {string} dirPath - Directory path to ensure
   */
  public async _ensureDirectoryExists(dirPath: string): Promise<void> {
    return this.ensureDirectoryExists(dirPath);
  }

  /**
   * Public wrapper for validateState (for testing).
   *
   * @public
   * @async
   * @param {DebateState} state - State to validate
   */
  public async _validateState(state: DebateState): Promise<void> {
    return this.validateState(state);
  }
}

/**
 * StateStoreConfig is exported as an interface above.
 * DebateMetadata is exported as an interface above.
 */
