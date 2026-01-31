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
import { DebateState } from '../types/consensus-types';
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
export declare class StateStore {
    private basePath;
    private config;
    private logger;
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
    constructor(basePath?: string);
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
    saveState(state: DebateState): Promise<void>;
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
    loadState(debateId: string): Promise<DebateState>;
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
    listDebates(): Promise<DebateMetadata[]>;
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
    deleteDebate(debateId: string): Promise<void>;
    /**
     * Ensure a directory exists, creating it recursively if needed.
     *
     * @async
     * @private
     * @param {string} dirPath - The directory path to ensure
     * @throws {Error} On permission denied or other filesystem errors
     */
    private ensureDirectoryExists;
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
    private validateState;
    /**
     * Check if an object matches the DebateRound schema.
     *
     * @private
     * @param {unknown} round - Object to validate
     * @returns {boolean} True if valid DebateRound
     */
    private isValidDebateRound;
    /**
     * Check if an object matches the ModelResponse schema.
     *
     * @private
     * @param {unknown} response - Object to validate
     * @returns {boolean} True if valid ModelResponse
     */
    private isValidModelResponse;
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
    private atomicWrite;
    /**
     * Determine the status of a debate based on its state.
     *
     * @private
     * @param {DebateState} state - The debate state
     * @returns {string} Status: 'pending' | 'in_progress' | 'converged' | 'escalated'
     */
    private getDebateStatus;
    /**
     * Expand tilde (~) to user home directory.
     *
     * @private
     * @param {string} filePath - Path that may start with ~
     * @returns {string} Expanded path
     */
    private expandPath;
    /**
     * Get the base path for testing.
     *
     * @public
     * @returns {string} The configured base path
     */
    _getBasePath(): string;
    /**
     * Public wrapper for ensureDirectoryExists (for testing).
     *
     * @public
     * @async
     * @param {string} dirPath - Directory path to ensure
     */
    _ensureDirectoryExists(dirPath: string): Promise<void>;
    /**
     * Public wrapper for validateState (for testing).
     *
     * @public
     * @async
     * @param {DebateState} state - State to validate
     */
    _validateState(state: DebateState): Promise<void>;
}
/**
 * StateStoreConfig is exported as an interface above.
 * DebateMetadata is exported as an interface above.
 */
