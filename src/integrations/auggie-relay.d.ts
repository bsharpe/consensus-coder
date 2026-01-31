/**
 * Auggie Integration & Relay
 *
 * Bridges the gap between Consensus Coder (debate system) and Auggie (code agent).
 *
 * Flow:
 * 1. Receive ImplementationPlan from ImplementationPlanGenerator
 * 2. Invoke Auggie CLI with the plan's auggiePreparedPrompt
 * 3. Capture stdout/stderr in real-time
 * 4. Monitor for completion, timeout, or errors
 * 5. Parse output for generated code, errors, and warnings
 * 6. Detect if implementation needs user clarification
 * 7. Return structured result or request user feedback
 *
 * @module auggie-relay
 * @version 1.0
 */
/**
 * Configuration options for AuggieRelay
 */
export interface AuggieRelayOptions {
    /** Path to auggie binary (default: 'auggie') */
    auggiePath?: string;
    /** Execution timeout in milliseconds (default: 300000 = 5 minutes) */
    timeout?: number;
    /** Capture stdout/stderr (default: true) */
    captureOutput?: boolean;
    /** Enable verbose logging (default: false) */
    verbose?: boolean;
    /** Custom logger function */
    logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
}
/**
 * Input plan structure from ImplementationPlanGenerator
 */
export interface ImplementationPlan {
    debateId: string;
    auggiePreparedPrompt: string;
    steps?: Array<{
        number: number;
        title: string;
        description: string;
    }>;
    metadata?: {
        votingScore?: number;
        uncertaintyLevel?: number;
        roundsRequired?: number;
        generatedAt?: number;
    };
}
/**
 * Code block extracted from Auggie output
 */
export interface CodeBlock {
    language: string;
    code: string;
    startLine: number;
    endLine: number;
}
/**
 * Parsed output from Auggie execution
 */
export interface ParsedOutput {
    codeBlocks: CodeBlock[];
    errors: string[];
    warnings: string[];
    summary: string;
}
/**
 * Result of Auggie execution
 */
export interface AuggieExecutionResult {
    debateId: string;
    planId: string;
    status: 'success' | 'partial' | 'failed' | 'timeout' | 'pending';
    exitCode: number;
    stdout: string;
    stderr: string;
    warnings: string[];
    errors: string[];
    generatedCode: string;
    executionTimeMs: number;
    timestamp: Date;
}
/**
 * Detected issues from execution result
 */
export interface DetectedIssues {
    hasErrors: boolean;
    hasMissingDeps: boolean;
    hasWarnings: boolean;
    requiresUserInput: boolean;
    userPrompt?: string;
    suggestions?: string[];
}
/**
 * User feedback request
 */
export interface UserFeedback {
    needed: boolean;
    issue: string;
    options?: string[];
    nextSteps: string;
}
/**
 * Auggie Relay - Executes implementation plans via Auggie CLI
 *
 * Manages the handoff from Consensus Coder debate system to Auggie code agent.
 * Handles process execution, output parsing, error detection, and user feedback.
 *
 * Usage:
 * ```typescript
 * const relay = new AuggieRelay({
 *   auggiePath: '/usr/local/bin/auggie',
 *   timeout: 300000,
 *   verbose: true
 * });
 *
 * const result = await relay.executeImplementationPlan(plan);
 * if (result.status === 'success') {
 *   console.log('Generated code:', result.generatedCode);
 * } else if (result.status === 'failed') {
 *   const issues = await relay.detectImplementationErrors(result);
 *   const feedback = await relay.requestUserClarification(issues);
 * }
 * ```
 */
export declare class AuggieRelay {
    private readonly auggiePath;
    private readonly timeout;
    private readonly captureOutput;
    private readonly verbose;
    private readonly logger;
    /**
     * Constructor
     *
     * @param options - Configuration options
     */
    constructor(options?: AuggieRelayOptions);
    /**
     * Main entry point: Execute implementation plan via Auggie CLI
     *
     * @param plan - ImplementationPlan from ImplementationPlanGenerator
     * @returns AuggieExecutionResult with status, code, errors, warnings
     */
    executeImplementationPlan(plan: ImplementationPlan): Promise<AuggieExecutionResult>;
    /**
     * Spawn Auggie as child process and capture output
     *
     * @param prompt - The auggiePreparedPrompt to execute
     * @returns ProcessOutput with exit code, stdout, stderr
     */
    private spawnAuggieProcess;
    /**
     * Parse Auggie output for code blocks, errors, and warnings
     *
     * Extracts:
     * - Code blocks (```typescript, ```js, etc.)
     * - Error patterns (error:, failed to, cannot find, stack traces)
     * - Warning patterns (warning:, deprecated, note:)
     *
     * @param output - Auggie stdout output
     * @returns ParsedOutput with code, errors, warnings
     */
    private parseAuggieOutput;
    /**
     * Validate that Auggie binary exists and is executable
     *
     * Runs `auggie --version` to verify availability.
     *
     * @returns true if auggie is available, false otherwise
     */
    private validateAuggieBinary;
    /**
     * Detect implementation errors and issues from execution result
     *
     * Analyzes:
     * - Exit code (0 = success, != 0 = failure)
     * - Stderr for error messages
     * - Output for error/warning patterns
     * - Code blocks (empty = potential issue)
     * - Missing dependencies (undefined symbols, import errors)
     *
     * @param result - AuggieExecutionResult from executeImplementationPlan
     * @returns DetectedIssues with error/warning/missing dep flags
     */
    detectImplementationErrors(result: AuggieExecutionResult): Promise<DetectedIssues>;
    /**
     * Format user clarification request
     *
     * Takes detected issues and formats a user-friendly request
     * for clarification or next steps.
     *
     * @param issues - DetectedIssues from detectImplementationErrors
     * @returns UserFeedback with formatted request
     */
    requestUserClarification(issues: DetectedIssues): Promise<UserFeedback>;
}
