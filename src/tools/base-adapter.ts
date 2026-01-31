/**
 * Base Adapter Abstract Class
 *
 * Provides common functionality for all tool adapters in the consensus-coder system.
 * Subclasses implement the abstract methods to handle tool-specific logic while
 * inheriting validation, logging, and lifecycle management.
 *
 * @version 1.0
 */

import type {
  ToolAdapter,
  ToolConfig,
  ToolGenerateRequest,
  ToolName,
  ToolReviewRequest,
  ToolRole,
  ToolSolution,
  ToolVote,
} from './tool-adapter.js';

// ============================================================================
// Logger Type
// ============================================================================

/**
 * Log levels supported by the adapter logging system.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger function signature for adapter logging.
 */
export type LoggerFn = (
  level: LogLevel,
  message: string,
  data?: unknown
) => void;

// ============================================================================
// BaseAdapter Abstract Class
// ============================================================================

/**
 * Abstract base class for all tool adapters.
 *
 * Provides common infrastructure including:
 * - Lifecycle management (initialize, dispose)
 * - Request validation
 * - Logging utilities
 * - Solution ID generation
 *
 * Subclasses must implement the abstract `do*` methods to provide
 * tool-specific behavior.
 *
 * @abstract
 * @implements {ToolAdapter}
 *
 * @example
 * ```typescript
 * class AuggieAdapter extends BaseAdapter {
 *   constructor() {
 *     super('auggie', 'context-engine');
 *   }
 *
 *   protected async doIsAvailable(): Promise<boolean> {
 *     // Check if auggie CLI is installed
 *   }
 *
 *   protected async doGenerateSolutions(request: ToolGenerateRequest): Promise<ToolSolution[]> {
 *     // Call auggie CLI to generate solutions
 *   }
 *
 *   protected async doReviewSolutions(request: ToolReviewRequest): Promise<ToolVote> {
 *     // Call auggie CLI to review solutions
 *   }
 * }
 * ```
 */
export abstract class BaseAdapter implements ToolAdapter {
  /**
   * The name of this tool.
   * @readonly
   */
  public readonly name: ToolName;

  /**
   * The role this tool plays in the consensus process.
   * @readonly
   */
  public readonly role: ToolRole;

  /**
   * Configuration stored after initialization.
   * @protected
   */
  protected config: ToolConfig | null = null;

  /**
   * Tracks whether initialize() has been called successfully.
   * @protected
   */
  protected initialized = false;

  /**
   * Logger function for adapter logging.
   * Defaults to console-based logging.
   * @protected
   */
  protected logger: LoggerFn = (level, message, data) => {
    const prefix = `[${this.name}:${level.toUpperCase()}]`;
    if (data !== undefined) {
      console[level](`${prefix} ${message}`, data);
    } else {
      console[level](`${prefix} ${message}`);
    }
  };

  /**
   * Creates a new BaseAdapter instance.
   *
   * @param name - The tool name identifier
   * @param role - The role this tool plays (context-engine or reviewer)
   */
  constructor(name: ToolName, role: ToolRole) {
    this.name = name;
    this.role = role;
  }

  // ==========================================================================
  // Abstract Methods - Must be implemented by subclasses
  // ==========================================================================

  /**
   * Performs the actual availability check for the tool.
   * Subclasses implement this to verify tool-specific requirements.
   *
   * @returns Promise resolving to true if the tool is available
   * @protected
   * @abstract
   */
  protected abstract doIsAvailable(): Promise<boolean>;

  /**
   * Performs the actual solution generation.
   * Subclasses implement this to call the underlying tool.
   *
   * @param request - The validated generation request
   * @returns Promise resolving to an array of solutions
   * @protected
   * @abstract
   */
  protected abstract doGenerateSolutions(
    request: ToolGenerateRequest
  ): Promise<ToolSolution[]>;

  /**
   * Performs the actual solution review.
   * Subclasses implement this to call the underlying tool.
   *
   * @param request - The validated review request
   * @returns Promise resolving to a vote
   * @protected
   * @abstract
   */
  protected abstract doReviewSolutions(
    request: ToolReviewRequest
  ): Promise<ToolVote>;

  // ==========================================================================
  // ToolAdapter Interface Implementation
  // ==========================================================================

  /**
   * Initialize the tool adapter with configuration.
   *
   * Stores the configuration and marks the adapter as initialized.
   * Subclasses can override to perform additional setup.
   *
   * @param config - Configuration options for the tool
   * @throws Error if config.name doesn't match this adapter's name
   */
  async initialize(config: ToolConfig): Promise<void> {
    if (config.name !== this.name) {
      throw new Error(
        `Configuration name mismatch: expected '${this.name}', got '${config.name}'`
      );
    }

    this.config = config;
    this.initialized = true;
    this.log('info', 'Adapter initialized', { role: this.role });
  }

  /**
   * Check if the tool is available and ready to use.
   *
   * Delegates to the abstract doIsAvailable() method after
   * checking initialization state.
   *
   * @returns Promise resolving to true if tool is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      return await this.doIsAvailable();
    } catch (error) {
      this.log('warn', 'Availability check failed', { error });
      return false;
    }
  }

  /**
   * Generate solutions for a given problem.
   *
   * Validates the request and delegates to doGenerateSolutions().
   *
   * @param request - The generation request with problem and context
   * @returns Promise resolving to an array of solutions
   * @throws Error if not initialized or validation fails
   */
  async generateSolutions(request: ToolGenerateRequest): Promise<ToolSolution[]> {
    this.ensureInitialized();
    this.validateRequest(request);

    this.log('info', 'Generating solutions', {
      problemLength: request.problem.length,
      numSolutions: request.numSolutions ?? 3,
    });

    const solutions = await this.doGenerateSolutions(request);

    this.log('info', 'Solutions generated', { count: solutions.length });
    return solutions;
  }

  /**
   * Review solutions and provide a vote.
   *
   * Validates the request and delegates to doReviewSolutions().
   *
   * @param request - The review request with problem, context, and solutions
   * @returns Promise resolving to a vote
   * @throws Error if not initialized or validation fails
   */
  async reviewSolutions(request: ToolReviewRequest): Promise<ToolVote> {
    this.ensureInitialized();
    this.validateRequest(request);

    this.log('info', 'Reviewing solutions', {
      solutionCount: request.solutions.length,
    });

    const vote = await this.doReviewSolutions(request);

    this.log('info', 'Review complete', {
      selectedSolutionId: vote.selectedSolutionId,
      confidence: vote.confidence,
    });
    return vote;
  }

  /**
   * Clean up resources and close connections.
   *
   * Resets the adapter state. Subclasses can override to
   * perform additional cleanup.
   */
  async dispose(): Promise<void> {
    this.log('info', 'Disposing adapter');
    this.config = null;
    this.initialized = false;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Ensures the adapter has been initialized.
   *
   * @throws Error if initialize() has not been called
   * @protected
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        `Adapter '${this.name}' is not initialized. Call initialize() first.`
      );
    }
  }

  /**
   * Logs a message with the specified level.
   *
   * @param level - The log level ('debug', 'info', 'warn', 'error')
   * @param message - The message to log
   * @param data - Optional additional data to include
   * @protected
   */
  protected log(level: LogLevel, message: string, data?: unknown): void {
    this.logger(level, message, data);
  }

  /**
   * Generates a unique solution ID.
   *
   * Format: `{name}-{timestamp}-{random}`
   *
   * @returns A unique solution ID string
   * @protected
   */
  protected generateSolutionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${this.name}-${timestamp}-${random}`;
  }

  /**
   * Validates a generation or review request.
   *
   * Checks for required fields and basic constraints.
   *
   * @param request - The request to validate
   * @throws Error if validation fails
   * @protected
   */
  protected validateRequest(
    request: ToolGenerateRequest | ToolReviewRequest
  ): void {
    if (!request.problem || typeof request.problem !== 'string') {
      throw new Error('Request must include a non-empty problem string');
    }

    if (!request.context || typeof request.context !== 'string') {
      throw new Error('Request must include a non-empty context string');
    }

    // Additional validation for review requests
    if ('solutions' in request) {
      if (!Array.isArray(request.solutions) || request.solutions.length === 0) {
        throw new Error('Review request must include at least one solution');
      }
    }
  }
}

