/**
 * Tool Registry
 *
 * Manages tool adapter instances for the consensus-coder system.
 * Provides registration, initialization, and lifecycle management
 * for all tool adapters.
 *
 * @module tool-registry
 * @version 1.0
 */

import type { ToolAdapter, ToolConfig, ToolName, ToolRole } from './tool-adapter.js';
import { AuggieAdapter } from './auggie-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { CodexAdapter } from './codex-adapter.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Logger function type for registry logging.
 */
type LoggerFn = (message: string, data?: unknown) => void;

// ============================================================================
// ToolRegistry Class
// ============================================================================

/**
 * Registry for managing tool adapter instances.
 *
 * Handles registration, initialization, and lifecycle management
 * of tool adapters. Provides factory methods for creating adapters
 * and utility methods for querying registered tools.
 *
 * @example
 * ```typescript
 * const registry = new ToolRegistry();
 * registry.registerDefaults();
 *
 * await registry.initializeAll({
 *   auggie: { name: 'auggie', path: '/usr/local/bin/auggie' },
 *   gemini: { name: 'gemini', apiKey: 'key' },
 *   codex: { name: 'codex', apiKey: 'key' }
 * });
 *
 * const contextEngine = registry.getContextEngine();
 * const reviewers = registry.getReviewers();
 * ```
 */
export class ToolRegistry {
  /**
   * Map of registered tool adapters by name.
   * @private
   */
  private adapters: Map<ToolName, ToolAdapter> = new Map();

  /**
   * Default configurations per tool.
   * @private
   */
  private defaultConfig: Partial<Record<ToolName, ToolConfig>>;

  /**
   * Logger function for registry operations.
   * @private
   */
  private logger: LoggerFn;

  /**
   * Creates a new ToolRegistry instance.
   *
   * @param defaultConfig - Optional default configurations per tool
   */
  constructor(defaultConfig?: Partial<Record<ToolName, ToolConfig>>) {
    this.defaultConfig = defaultConfig ?? {};
    this.logger = (message: string, data?: unknown) => {
      if (data !== undefined) {
        console.log(`[ToolRegistry] ${message}`, data);
      } else {
        console.log(`[ToolRegistry] ${message}`);
      }
    };
  }

  // ==========================================================================
  // Registration Methods
  // ==========================================================================

  /**
   * Register an adapter with the registry.
   *
   * @param adapter - The tool adapter to register
   */
  registerAdapter(adapter: ToolAdapter): void {
    this.adapters.set(adapter.name, adapter);
    this.logger('Adapter registered', { name: adapter.name, role: adapter.role });
  }

  /**
   * Register all default adapters (Auggie, Gemini, Codex).
   *
   * Creates instances of each default adapter and registers them.
   * Auggie is registered as context-engine, Gemini and Codex as reviewers.
   */
  registerDefaults(): void {
    this.registerAdapter(new AuggieAdapter('context-engine'));
    this.registerAdapter(new GeminiAdapter('reviewer'));
    this.registerAdapter(new CodexAdapter('reviewer'));
    this.logger('Default adapters registered');
  }

  /**
   * Unregister an adapter from the registry.
   *
   * @param name - The name of the adapter to unregister
   */
  unregisterAdapter(name: ToolName): void {
    if (this.adapters.delete(name)) {
      this.logger('Adapter unregistered', { name });
    }
  }

  // ==========================================================================
  // Getter Methods
  // ==========================================================================

  /**
   * Get a specific adapter by name.
   *
   * @param name - The name of the adapter to retrieve
   * @returns The adapter if registered, undefined otherwise
   */
  getAdapter(name: ToolName): ToolAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get the context engine adapter.
   *
   * @param name - Optional specific tool name (default: 'auggie')
   * @returns The context engine adapter if registered
   */
  getContextEngine(name?: ToolName): ToolAdapter | undefined {
    return this.adapters.get(name ?? 'auggie');
  }

  /**
   * Get reviewer adapters.
   *
   * @param names - Optional specific tool names (default: ['gemini', 'codex'])
   * @returns Array of registered reviewer adapters
   */
  getReviewers(names?: ToolName[]): ToolAdapter[] {
    const reviewerNames = names ?? (['gemini', 'codex'] as ToolName[]);
    return reviewerNames
      .map((name) => this.adapters.get(name))
      .filter((adapter): adapter is ToolAdapter => adapter !== undefined);
  }

  /**
   * Get all registered adapters.
   *
   * @returns Array of all registered adapters
   */
  getAllAdapters(): ToolAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get list of available tools (those that pass isAvailable check).
   *
   * @returns Promise resolving to array of available tool names
   */
  async getAvailableTools(): Promise<ToolName[]> {
    const results = await Promise.all(
      Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
        const available = await adapter.isAvailable();
        return available ? name : null;
      })
    );
    return results.filter((name): name is ToolName => name !== null);
  }

  // ==========================================================================
  // Initialization Methods
  // ==========================================================================

  /**
   * Initialize a specific adapter with configuration.
   *
   * @param name - The name of the adapter to initialize
   * @param config - Optional configuration (uses default if not provided)
   * @throws Error if adapter is not registered
   */
  async initializeAdapter(name: ToolName, config?: ToolConfig): Promise<void> {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Adapter '${name}' is not registered`);
    }

    const effectiveConfig = config ?? this.defaultConfig[name] ?? { name };
    await adapter.initialize(effectiveConfig);
    this.logger('Adapter initialized', { name });
  }

  /**
   * Initialize all registered adapters.
   *
   * @param configs - Optional configurations per tool
   */
  async initializeAll(configs?: Record<ToolName, ToolConfig>): Promise<void> {
    const initPromises = Array.from(this.adapters.keys()).map((name) => {
      const config = configs?.[name] ?? this.defaultConfig[name] ?? { name };
      return this.initializeAdapter(name, config);
    });

    await Promise.all(initPromises);
    this.logger('All adapters initialized');
  }

  // ==========================================================================
  // Factory Methods
  // ==========================================================================

  /**
   * Create an adapter instance by name.
   *
   * Factory method for creating new adapter instances without
   * registering them in the registry.
   *
   * @param name - The tool name
   * @param role - The role for the adapter
   * @returns A new adapter instance
   * @throws Error if tool name is not supported
   */
  static createAdapter(name: ToolName, role: ToolRole): ToolAdapter {
    switch (name) {
      case 'auggie':
        return new AuggieAdapter(role);
      case 'gemini':
        return new GeminiAdapter(role);
      case 'codex':
        return new CodexAdapter(role);
      default:
        throw new Error(`Unsupported tool: ${name}`);
    }
  }

  // ==========================================================================
  // Cleanup Methods
  // ==========================================================================

  /**
   * Dispose all registered adapters.
   *
   * Cleans up resources for all adapters and clears the registry.
   */
  async dispose(): Promise<void> {
    const disposePromises = Array.from(this.adapters.values()).map((adapter) =>
      adapter.dispose()
    );
    await Promise.all(disposePromises);
    this.adapters.clear();
    this.logger('All adapters disposed');
  }

  /**
   * Dispose a specific adapter.
   *
   * @param name - The name of the adapter to dispose
   */
  async disposeAdapter(name: ToolName): Promise<void> {
    const adapter = this.adapters.get(name);
    if (adapter) {
      await adapter.dispose();
      this.adapters.delete(name);
      this.logger('Adapter disposed', { name });
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if an adapter is registered.
   *
   * @param name - The name of the adapter to check
   * @returns true if the adapter is registered
   */
  isRegistered(name: ToolName): boolean {
    return this.adapters.has(name);
  }

  /**
   * Get list of registered tool names.
   *
   * @returns Array of registered tool names
   */
  getRegisteredNames(): ToolName[] {
    return Array.from(this.adapters.keys());
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton instance of the ToolRegistry.
 *
 * Pre-configured registry for convenient access throughout the application.
 */
export const toolRegistry = new ToolRegistry();

