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

import { spawn, ChildProcess, SpawnOptionsWithoutStdio, spawnSync } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

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
  steps?: Array<{ number: number; title: string; description: string }>;
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
 * Low-level process output
 */
interface ProcessOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: Error;
  timedOut?: boolean;
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

// ============================================================================
// MAIN CLASS: AuggieRelay
// ============================================================================

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
export class AuggieRelay {
  private readonly auggiePath: string;
  private readonly timeout: number;
  private readonly captureOutput: boolean;
  private readonly verbose: boolean;
  private readonly logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;

  /**
   * Constructor
   *
   * @param options - Configuration options
   */
  constructor(options?: AuggieRelayOptions) {
    this.auggiePath = options?.auggiePath ?? 'auggie';
    this.timeout = options?.timeout ?? 300000; // 5 minutes default
    this.captureOutput = options?.captureOutput ?? true;
    this.verbose = options?.verbose ?? false;

    // Default logger
    this.logger =
      options?.logger ??
      ((level: string, message: string, data?: unknown) => {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [AuggieRelay] [${level.toUpperCase()}]`;
        if (this.verbose) {
          console.log(`${prefix} ${message}`, data ? JSON.stringify(data, null, 2) : '');
        } else if (level === 'error' || level === 'warn') {
          console.log(`${prefix} ${message}`, data ? JSON.stringify(data, null, 2) : '');
        }
      });

    this.logger('debug', 'AuggieRelay initialized', {
      auggiePath: this.auggiePath,
      timeout: this.timeout,
      captureOutput: this.captureOutput,
    });
  }

  /**
   * Main entry point: Execute implementation plan via Auggie CLI
   *
   * @param plan - ImplementationPlan from ImplementationPlanGenerator
   * @returns AuggieExecutionResult with status, code, errors, warnings
   */
  async executeImplementationPlan(plan: ImplementationPlan): Promise<AuggieExecutionResult> {
    this.logger('info', 'Starting implementation plan execution', { debateId: plan.debateId });

    const startTime = Date.now();
    const result: AuggieExecutionResult = {
      debateId: plan.debateId,
      planId: plan.debateId, // Use same ID for tracking
      status: 'pending',
      exitCode: -1,
      stdout: '',
      stderr: '',
      warnings: [],
      errors: [],
      generatedCode: '',
      executionTimeMs: 0,
      timestamp: new Date(),
    };

    try {
      // Step 1: Validate plan is executable
      this.logger('debug', 'Validating implementation plan', { steps: plan.steps?.length ?? 0 });
      if (!plan.auggiePreparedPrompt || plan.auggiePreparedPrompt.trim().length === 0) {
        this.logger('error', 'Plan has no auggiePreparedPrompt');
        result.status = 'failed';
        result.errors.push('Plan has no auggiePreparedPrompt');
        result.executionTimeMs = Date.now() - startTime;
        return result;
      }

      // Step 2: Validate Auggie binary exists
      const binValidated = await this.validateAuggieBinary();
      if (!binValidated) {
        this.logger('error', `Auggie binary not found at: ${this.auggiePath}`);
        result.status = 'failed';
        result.errors.push(`Auggie CLI not found at ${this.auggiePath}`);
        result.executionTimeMs = Date.now() - startTime;
        return result;
      }

      // Step 3: Spawn Auggie process
      this.logger('info', 'Spawning Auggie process', { prompt: plan.auggiePreparedPrompt.substring(0, 100) });
      const processOutput = await this.spawnAuggieProcess(plan.auggiePreparedPrompt);

      // Step 4: Populate result with process output
      result.stdout = processOutput.stdout;
      result.stderr = processOutput.stderr;
      result.exitCode = processOutput.exitCode;

      if (processOutput.timedOut) {
        this.logger('warn', 'Auggie process timed out', { timeout: this.timeout });
        result.status = 'timeout';
        result.errors.push(`Auggie execution timed out after ${this.timeout}ms`);
      } else if (processOutput.error) {
        this.logger('error', 'Process execution error', { error: processOutput.error.message });
        result.status = 'failed';
        result.errors.push(`Process error: ${processOutput.error.message}`);
      } else {
        // Step 5: Parse output for code, errors, warnings
        const parsed = this.parseAuggieOutput(result.stdout);

        result.generatedCode = parsed.codeBlocks.map((block) => block.code).join('\n\n');
        result.warnings = parsed.warnings;
        result.errors.push(...parsed.errors);

        // Step 6: Determine status
        if (result.exitCode === 0 && result.errors.length === 0) {
          result.status = 'success';
          this.logger('info', 'Auggie execution succeeded', { codeBlocks: parsed.codeBlocks.length });
        } else if (result.exitCode === 0 && result.errors.length > 0) {
          result.status = 'partial';
          this.logger('warn', 'Auggie execution partial (warnings/errors found)', {
            errors: result.errors.length,
            warnings: result.warnings.length,
          });
        } else {
          result.status = 'failed';
          this.logger('error', 'Auggie execution failed', { exitCode: result.exitCode });
        }
      }
    } catch (err) {
      this.logger('error', 'Unexpected error during plan execution', { error: String(err) });
      result.status = 'failed';
      result.errors.push(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      result.executionTimeMs = Date.now() - startTime;
      result.timestamp = new Date();
      this.logger('info', 'Plan execution completed', {
        status: result.status,
        duration: `${result.executionTimeMs}ms`,
        errors: result.errors.length,
        warnings: result.warnings.length,
      });
    }

    return result;
  }

  /**
   * Spawn Auggie as child process and capture output
   *
   * @param prompt - The auggiePreparedPrompt to execute
   * @returns ProcessOutput with exit code, stdout, stderr
   */
  private async spawnAuggieProcess(prompt: string): Promise<ProcessOutput> {
    return new Promise((resolve) => {
      this.logger('debug', 'Spawning child process', { auggiePath: this.auggiePath });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      try {
        const spawnOptions: any = {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: this.timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          shell: false,
        };

        const child: ChildProcess = spawn(this.auggiePath, ['--print', prompt], spawnOptions);

        // Timeout handler
        const timeoutHandle = setTimeout(() => {
          timedOut = true;
          this.logger('warn', 'Process timeout triggered, killing process');
          child.kill('SIGTERM');
        }, this.timeout);

        // Capture stdout
        if (child.stdout) {
          child.stdout.on('data', (data: Buffer) => {
            const chunk = data.toString('utf-8');
            stdout += chunk;
            if (this.captureOutput && this.verbose) {
              this.logger('debug', 'Received stdout chunk', { size: chunk.length });
            }
          });
        }

        // Capture stderr
        if (child.stderr) {
          child.stderr.on('data', (data: Buffer) => {
            const chunk = data.toString('utf-8');
            stderr += chunk;
            if (this.captureOutput) {
              this.logger('debug', 'Received stderr chunk', { size: chunk.length });
            }
          });
        }

        // Handle process errors
        child.on('error', (err: Error) => {
          this.logger('error', 'Child process error', { error: err.message });
          clearTimeout(timeoutHandle);
          resolve({
            exitCode: -1,
            stdout,
            stderr,
            error: err,
            timedOut: false,
          });
        });

        // Handle process exit
        child.on('exit', (code: number | null, signal: string | null) => {
          clearTimeout(timeoutHandle);
          const exitCode = code ?? 1;
          this.logger('debug', 'Child process exited', { exitCode, signal, timedOut });
          resolve({
            exitCode,
            stdout,
            stderr,
            timedOut,
          });
        });
      } catch (err) {
        this.logger('error', 'Failed to spawn child process', { error: String(err) });
        resolve({
          exitCode: -1,
          stdout: '',
          stderr: '',
          error: err instanceof Error ? err : new Error(String(err)),
          timedOut: false,
        });
      }
    });
  }

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
  private parseAuggieOutput(output: string): ParsedOutput {
    const codeBlocks: CodeBlock[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Extract code blocks (```language ... ```)
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    let match;

    let currentLine = 0;
    const lines = output.split('\n');

    while ((match = codeBlockRegex.exec(output)) !== null) {
      const language = match[1] || 'text';
      const code = match[2];
      const startLine = output.substring(0, match.index).split('\n').length;
      const endLine = startLine + code.split('\n').length;

      codeBlocks.push({
        language,
        code,
        startLine,
        endLine,
      });
    }

    // Extract errors and warnings from output
    const errorPatterns = [
      /(?:^|\n)\s*(?:error|fail|failed|cannot|undefined|not found|exception|traceback)[\s:]*(.+?)(?:\n|$)/gi,
      /(?:^|\n)\s*at\s+.+?:\d+:\d+/gi,
      /SyntaxError|TypeError|ReferenceError|RangeError/gi,
    ];

    const warningPatterns = [
      /(?:^|\n)\s*warning[\s:]*(.+?)(?:\n|$)/gi,
      /deprecated|note:|todo:|fixme:/gi,
    ];

    for (const line of lines) {
      // Check for errors
      for (const pattern of errorPatterns) {
        if (pattern.test(line)) {
          const cleanError = line.replace(/^[\s-]*/, '').trim();
          if (cleanError.length > 0 && !errors.includes(cleanError)) {
            errors.push(cleanError);
          }
          pattern.lastIndex = 0; // Reset regex
        }
      }

      // Check for warnings
      for (const pattern of warningPatterns) {
        if (pattern.test(line)) {
          const cleanWarning = line.replace(/^[\s-]*/, '').trim();
          if (cleanWarning.length > 0 && !warnings.includes(cleanWarning)) {
            warnings.push(cleanWarning);
          }
          pattern.lastIndex = 0; // Reset regex
        }
      }
    }

    const summary = output.substring(0, 500);

    this.logger('debug', 'Parsed Auggie output', {
      codeBlocks: codeBlocks.length,
      errors: errors.length,
      warnings: warnings.length,
    });

    return {
      codeBlocks,
      errors,
      warnings,
      summary,
    };
  }

  /**
   * Validate that Auggie binary exists and is executable
   *
   * Runs `auggie --version` to verify availability.
   *
   * @returns true if auggie is available, false otherwise
   */
  private async validateAuggieBinary(): Promise<boolean> {
    try {
      this.logger('debug', 'Validating Auggie binary', { auggiePath: this.auggiePath });
      const { stdout, stderr } = await exec(`${this.auggiePath} --version`);

      if (stdout || !stderr.includes('not found')) {
        this.logger('debug', 'Auggie binary validated', { version: stdout.trim() });
        return true;
      }
      return false;
    } catch (err) {
      this.logger('error', 'Auggie binary validation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

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
  async detectImplementationErrors(result: AuggieExecutionResult): Promise<DetectedIssues> {
    this.logger('info', 'Detecting implementation errors', { status: result.status });

    const issues: DetectedIssues = {
      hasErrors: false,
      hasMissingDeps: false,
      hasWarnings: result.warnings.length > 0,
      requiresUserInput: false,
    };

    // Check exit code
    if (result.exitCode !== 0) {
      issues.hasErrors = true;
      this.logger('warn', 'Non-zero exit code', { exitCode: result.exitCode });
    }

    // Check error array
    if (result.errors.length > 0) {
      issues.hasErrors = true;
    }

    // Check stderr for errors
    if (result.stderr && result.stderr.toLowerCase().includes('error')) {
      issues.hasErrors = true;
    }

    // Detect missing dependencies
    const missingDepPatterns = [
      /(?:cannot find module|import .+ not found|undefined .+)/gi,
      /(?:No such file or directory|ENOENT)/gi,
      /(?:not defined|is not a function|cannot read property)/gi,
    ];

    for (const pattern of missingDepPatterns) {
      if (pattern.test(result.stdout) || pattern.test(result.stderr)) {
        issues.hasMissingDeps = true;
        break;
      }
    }

    // Check for empty code blocks
    if (result.generatedCode.trim().length === 0) {
      issues.hasErrors = true;
      this.logger('warn', 'No code generated');
    }

    // Determine if user input needed
    if (issues.hasErrors || issues.hasMissingDeps) {
      issues.requiresUserInput = true;

      if (issues.hasMissingDeps) {
        issues.userPrompt = 'Implementation missing dependencies. Review errors and provide clarification or install missing packages.';
        issues.suggestions = [
          'Install missing packages: npm install',
          'Review import statements for typos',
          'Check that all required files exist',
        ];
      } else if (issues.hasErrors) {
        issues.userPrompt = 'Implementation encountered errors. Review error logs and decide how to proceed.';
        issues.suggestions = [
          'Review error messages in stderr',
          'Check implementation against original problem statement',
          'Provide clarification if Auggie misunderstood the requirements',
        ];
      }
    }

    this.logger('debug', 'Error detection complete', issues);
    return issues;
  }

  /**
   * Format user clarification request
   *
   * Takes detected issues and formats a user-friendly request
   * for clarification or next steps.
   *
   * @param issues - DetectedIssues from detectImplementationErrors
   * @returns UserFeedback with formatted request
   */
  async requestUserClarification(issues: DetectedIssues): Promise<UserFeedback> {
    this.logger('info', 'Requesting user clarification', { requiresInput: issues.requiresUserInput });

    const feedback: UserFeedback = {
      needed: issues.requiresUserInput,
      issue: issues.userPrompt ?? 'Unknown issue',
      options: issues.suggestions,
      nextSteps: 'Please review the error messages and provide clarification.',
    };

    if (issues.hasErrors) {
      feedback.nextSteps = 'Review stderr logs and provide clarification on what went wrong.';
    } else if (issues.hasMissingDeps) {
      feedback.nextSteps = 'Install missing dependencies and retry, or provide additional context for the implementation.';
    } else if (issues.hasWarnings) {
      feedback.nextSteps = 'Review warnings and decide if implementation is acceptable despite warnings.';
    }

    this.logger('debug', 'User feedback formatted', feedback);
    return feedback;
  }
}

// ============================================================================
// EXPORTS (all types and classes already exported above)
// ============================================================================
// AuggieRelay class and all interfaces/types are already exported inline
