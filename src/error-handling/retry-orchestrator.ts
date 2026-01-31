/**
 * Retry Orchestrator - Error Handling & Recovery
 *
 * Detects implementation errors from Auggie execution, classifies them,
 * attempts retries with exponential backoff, requests user clarification
 * if needed, and escalates to human if retries are exhausted.
 *
 * Error Classification Strategy:
 * - TRANSIENT: Network/timeout errors → retry with backoff
 * - FIXABLE_WITH_FEEDBACK: Missing deps/unclear requirements → ask user
 * - PERMANENT: Syntax/unsupported features → escalate immediately
 * - UNKNOWN: Unrecognized errors → treat as transient (conservative)
 *
 * Retry Strategy:
 * - Transient: Up to 3 retries with exponential backoff (1s, 2s, 4s, 8s)
 * - Fixable with Feedback: Up to 2 feedback rounds
 * - Permanent: No retries, escalate immediately
 * - Unknown: 2 retries, then escalate
 *
 * @module error-handling/retry-orchestrator
 * @version 1.0
 */

import { AuggieRelay, ImplementationPlan, AuggieExecutionResult } from '../integrations/auggie-relay.js';
import { DebateState } from '../types/consensus-types.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Configuration options for RetryOrchestrator
 */
export interface RetryOrchestratorOptions {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;

  /** Initial backoff delay in milliseconds (default: 1000) */
  baseDelayMs?: number;

  /** Maximum backoff delay in milliseconds (default: 60000) */
  maxDelayMs?: number;

  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number;

  /** Enable user feedback collection (default: true) */
  enableUserFeedback?: boolean;

  /** Custom logger function */
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;

  /** Timeout for user feedback in milliseconds (default: 300000 = 5 minutes) */
  userFeedbackTimeoutMs?: number;
}

/**
 * Classification of an error from Auggie execution
 */
export interface ErrorClassification {
  /** Type of error */
  type: 'TRANSIENT' | 'FIXABLE_WITH_FEEDBACK' | 'PERMANENT' | 'UNKNOWN';

  /** Confidence in classification (0-100%) */
  confidence: 'high' | 'medium' | 'low';

  /** Suggested action */
  suggestedAction: 'retry' | 'ask_user' | 'escalate';

  /** Message to show to user (if asking for feedback) */
  userMessage?: string;

  /** Detailed explanation of the error */
  explanation: string;

  /** Suggested fixes or next steps */
  suggestedFixes: string[];
}

/**
 * User feedback in response to an error
 */
export interface UserFeedback {
  /** How the user wants to resolve this */
  resolution: 'retry' | 'skip' | 'escalate';

  /** Optional user input (e.g., dependency to install) */
  userInput?: string;

  /** When this feedback was provided */
  timestamp: Date;

  /** Clarification text provided by user */
  clarification?: string;
}

/**
 * State tracking for retries
 */
export interface RetryState {
  /** Debate ID */
  debateId: string;

  /** Plan ID */
  planId: string;

  /** Current attempt number (0-indexed) */
  currentAttempt: number;

  /** Total retries allowed */
  totalRetries: number;

  /** Last error classification */
  lastError?: ErrorClassification;

  /** Current backoff delay in milliseconds */
  backoffMs: number;

  /** Last execution result */
  lastExecutionResult?: AuggieExecutionResult;

  /** History of user feedback */
  userFeedbackHistory: UserFeedback[];

  /** Timestamp when this state was created */
  startTime: number;
}

/**
 * Final result of retry orchestration
 */
export interface RetryResult {
  /** Debate ID */
  debateId: string;

  /** Plan ID */
  planId: string;

  /** Final status */
  finalStatus: 'success' | 'escalated' | 'user_cancelled';

  /** Last execution result */
  lastExecutionResult: AuggieExecutionResult;

  /** Number of retries used */
  retriesUsed: number;

  /** Total execution time in milliseconds */
  totalTimeMs: number;

  /** Reason for escalation (if applicable) */
  escalationReason?: string;

  /** User feedback provided (if applicable) */
  userFeedbackProvided?: string;
}

/**
 * State for escalation to human
 */
export interface EscalationState {
  /** Debate ID */
  debateId: string;

  /** Plan ID */
  planId: string;

  /** Number of retries used */
  retriesUsed: number;

  /** Maximum retries allowed */
  maxRetries: number;

  /** Total time spent in milliseconds */
  totalTimeMs: number;

  /** Error classification */
  errorClassification: ErrorClassification;

  /** Last execution result */
  lastExecutionResult: AuggieExecutionResult;

  /** Debate context (for reporting) */
  debateContext?: {
    winningApproach?: string;
    votingScore?: number;
    roundsRequired?: number;
  };

  /** User feedback history */
  userFeedbackHistory: UserFeedback[];
}

// ============================================================================
// MAIN CLASS: RetryOrchestrator
// ============================================================================

/**
 * Manages retry logic and error recovery for implementation execution.
 *
 * Main responsibility: Execute implementation plans with automatic retry,
 * error classification, user feedback, and escalation to human if needed.
 *
 * Usage:
 * ```typescript
 * const orchestrator = new RetryOrchestrator({ maxRetries: 3 });
 * const result = await orchestrator.executeWithRetry(plan, relay);
 * ```
 */
export class RetryOrchestrator {
  // ─────────────────────────────────────────────────────────────────────
  // Properties
  // ─────────────────────────────────────────────────────────────────────

  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly backoffMultiplier: number;
  private readonly enableUserFeedback: boolean;
  private readonly userFeedbackTimeoutMs: number;
  private readonly logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;

  // ─────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Initialize RetryOrchestrator with configuration
   */
  constructor(options?: RetryOrchestratorOptions) {
    this.maxRetries = options?.maxRetries ?? 3;
    this.baseDelayMs = options?.baseDelayMs ?? 1000;
    this.maxDelayMs = options?.maxDelayMs ?? 60000;
    this.backoffMultiplier = options?.backoffMultiplier ?? 2;
    this.enableUserFeedback = options?.enableUserFeedback ?? true;
    this.userFeedbackTimeoutMs = options?.userFeedbackTimeoutMs ?? 300000;

    this.logger = options?.logger ?? this.defaultLogger;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Public Methods
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Execute implementation plan with automatic retry and error handling.
   *
   * Algorithm:
   * 1. Initialize retry state
   * 2. Loop until success or max retries exhausted
   * 3. Execute plan via relay
   * 4. Classify any errors
   * 5. Decide on retry, user feedback, or escalation
   * 6. Return final result
   *
   * @param plan - Implementation plan to execute
   * @param relay - AuggieRelay instance for execution
   * @param debateState - Optional debate context for escalation
   * @returns RetryResult with final status and telemetry
   */
  public async executeWithRetry(
    plan: ImplementationPlan,
    relay: AuggieRelay,
    debateState?: DebateState
  ): Promise<RetryResult> {
    const startTime = Date.now();
    const state: RetryState = {
      debateId: plan.debateId,
      planId: plan.metadata?.generatedAt?.toString() ?? 'unknown',
      currentAttempt: 0,
      totalRetries: this.maxRetries,
      backoffMs: this.baseDelayMs,
      userFeedbackHistory: [],
      startTime,
    };

    this.logger('info', 'Starting executeWithRetry', {
      debateId: state.debateId,
      maxRetries: this.maxRetries,
    });

    // Loop: Execute with retries
    while (state.currentAttempt <= this.maxRetries) {
      try {
        this.logger('debug', `Attempt ${state.currentAttempt + 1} of ${this.maxRetries + 1}`);

        // Execute the plan
        const result = await relay.executeImplementationPlan(plan);
        state.lastExecutionResult = result;

        // Check result status
        if (result.status === 'success') {
          this.logger('info', 'Implementation succeeded', { debateId: state.debateId });

          return {
            debateId: state.debateId,
            planId: state.planId,
            finalStatus: 'success',
            lastExecutionResult: result,
            retriesUsed: state.currentAttempt,
            totalTimeMs: Date.now() - startTime,
          };
        }

        // Classify the error
        state.lastError = this.classifyError(result);
        this.logger('warn', 'Implementation failed', {
          attempt: state.currentAttempt + 1,
          errorType: state.lastError.type,
          confidence: state.lastError.confidence,
        });

        // Decide on next action
        if (state.lastError.type === 'PERMANENT') {
          this.logger('error', 'Permanent error - escalating immediately', {
            explanation: state.lastError.explanation,
          });

          return await this.handleEscalation(state, debateState);
        }

        if (state.lastError.type === 'FIXABLE_WITH_FEEDBACK' && this.enableUserFeedback) {
          if (state.userFeedbackHistory.length < 2) {
            this.logger('info', 'Requesting user feedback', {
              attempt: state.currentAttempt + 1,
            });

            const feedback = await this.requestUserFeedback(state.lastError);
            state.userFeedbackHistory.push(feedback);

            if (feedback.resolution === 'escalate') {
              return await this.handleEscalation(state, debateState);
            }

            if (feedback.resolution === 'skip') {
              // Retry with user feedback incorporated
              state.currentAttempt++;
              continue;
            }

            // Otherwise retry with user input
            state.currentAttempt++;
            continue;
          } else {
            this.logger('warn', 'Max feedback rounds exhausted - escalating');
            return await this.handleEscalation(state, debateState);
          }
        }

        // For transient and unknown errors: retry with backoff
        if (state.currentAttempt < this.maxRetries) {
          const backoffTime = await this.calculateBackoff(state.currentAttempt);
          this.logger('info', `Retrying after ${backoffTime}ms backoff`, {
            attempt: state.currentAttempt + 1,
            nextAttempt: state.currentAttempt + 2,
          });

          await this.delay(backoffTime);
          state.currentAttempt++;
          state.backoffMs = backoffTime;
        } else {
          this.logger('error', 'Max retries exhausted - escalating');
          return await this.handleEscalation(state, debateState);
        }
      } catch (error) {
        this.logger('error', 'Unexpected error during retry loop', { error });

        if (state.currentAttempt < this.maxRetries) {
          state.currentAttempt++;
          const backoffTime = await this.calculateBackoff(state.currentAttempt - 1);
          await this.delay(backoffTime);
        } else {
          // Create a synthetic failure result
          const failureResult: AuggieExecutionResult = {
            debateId: plan.debateId,
            planId: state.planId,
            status: 'failed',
            exitCode: 1,
            stdout: '',
            stderr: error instanceof Error ? error.message : String(error),
            warnings: [],
            errors: [error instanceof Error ? error.message : String(error)],
            generatedCode: '',
            executionTimeMs: Date.now() - startTime,
            timestamp: new Date(),
          };

          state.lastExecutionResult = failureResult;
          return await this.handleEscalation(state, debateState);
        }
      }
    }

    // Should not reach here
    throw new Error('Retry loop ended unexpectedly');
  }

  /**
   * Request user feedback for a classified error.
   *
   * Prompts user for clarification or next steps.
   * Waits for response with timeout.
   *
   * @param classification - Error classification
   * @returns User feedback
   */
  public async requestUserFeedback(classification: ErrorClassification): Promise<UserFeedback> {
    this.logger('info', 'Requesting user feedback', {
      errorType: classification.type,
      userMessage: classification.userMessage,
    });

    // Format the prompt
    const prompt = this.formatUserFeedbackPrompt(classification);

    // For now, this returns a default escalation feedback
    // In production, this would integrate with stdin/Slack messaging
    const feedback: UserFeedback = {
      resolution: 'escalate',
      timestamp: new Date(),
      clarification: 'User prompted for feedback but implementation awaiting real I/O integration',
    };

    return feedback;
  }

  /**
   * Escalate to human with detailed context.
   *
   * Formats escalation message and sends to user/Slack.
   *
   * @param state - Current retry state
   * @param debateState - Debate context (optional)
   */
  public async escalateToHuman(state: EscalationState): Promise<void> {
    const escalationMsg = this.formatEscalationMessage(state);

    this.logger('error', 'ESCALATING TO HUMAN', {
      debateId: state.debateId,
      planId: state.planId,
      retriesUsed: state.retriesUsed,
      message: escalationMsg,
    });

    // In production, this would send to Slack via message tool
    // For now, we just log it
    console.error('\n' + escalationMsg + '\n');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Classify an error from Auggie execution result.
   *
   * Analyzes error messages and determines if they are:
   * - TRANSIENT: Retry with backoff
   * - FIXABLE_WITH_FEEDBACK: Ask user
   * - PERMANENT: Escalate immediately
   * - UNKNOWN: Treat as transient (conservative)
   *
   * @param result - Auggie execution result
   * @returns Error classification
   */
  private classifyError(result: AuggieExecutionResult): ErrorClassification {
    const errorText = (result.stderr + ' ' + result.errors.join(' ')).toLowerCase();
    const stderrLower = result.stderr.toLowerCase();

    // Check for timeout
    if (result.status === 'timeout' || errorText.includes('timeout') || errorText.includes('econnrefused')) {
      return {
        type: 'TRANSIENT',
        confidence: 'high',
        suggestedAction: 'retry',
        explanation: 'Timeout or connection error detected - likely temporary network issue',
        suggestedFixes: [
          'Retry with exponential backoff',
          'Check network connectivity',
          'Verify Auggie service is running',
        ],
      };
    }

    // Check for missing dependencies
    if (
      errorText.includes('not found') &&
      (errorText.includes('npm') || errorText.includes('module') || errorText.includes('require'))
    ) {
      return {
        type: 'FIXABLE_WITH_FEEDBACK',
        confidence: 'high',
        suggestedAction: 'ask_user',
        explanation: 'Missing dependency detected - need user clarification on installation',
        userMessage: 'Auggie encountered a missing dependency. Should we install it automatically?',
        suggestedFixes: [
          'Install missing package: npm install <package>',
          'Update package.json',
          'Verify node_modules directory',
        ],
      };
    }

    // Check for syntax errors
    if (
      errorText.includes('syntax error') ||
      errorText.includes('parse error') ||
      errorText.includes('unexpected token')
    ) {
      return {
        type: 'PERMANENT',
        confidence: 'high',
        suggestedAction: 'escalate',
        explanation: 'Syntax error in generated code - requires manual review',
        suggestedFixes: [
          'Review generated code for syntax issues',
          'Check TypeScript configuration',
          'Verify code generation logic',
        ],
      };
    }

    // Check for unsupported/deprecated features
    if (
      errorText.includes('unsupported') ||
      errorText.includes('deprecated') ||
      errorText.includes('is no longer')
    ) {
      return {
        type: 'PERMANENT',
        confidence: 'high',
        suggestedAction: 'escalate',
        explanation: 'Unsupported or deprecated feature used - requires plan revision',
        suggestedFixes: [
          'Update implementation plan with supported alternatives',
          'Review deprecated API usage',
          'Consider using modern equivalents',
        ],
      };
    }

    // Check for unclear requirements (from error patterns)
    if (
      errorText.includes('unclear') ||
      errorText.includes('ambiguous') ||
      errorText.includes('specify')
    ) {
      return {
        type: 'FIXABLE_WITH_FEEDBACK',
        confidence: 'medium',
        suggestedAction: 'ask_user',
        explanation: 'Implementation plan has unclear or ambiguous requirements',
        userMessage: 'Auggie needs clarification on the requirements. Please provide more details.',
        suggestedFixes: [
          'Provide more detailed problem statement',
          'Clarify specific requirements',
          'Add examples of expected behavior',
        ],
      };
    }

    // Check for import/module errors
    if (errorText.includes('cannot find') || errorText.includes('no such file')) {
      return {
        type: 'FIXABLE_WITH_FEEDBACK',
        confidence: 'medium',
        suggestedAction: 'ask_user',
        explanation: 'Import or file path error detected',
        userMessage: 'Missing file or incorrect import path detected. Should we adjust the implementation?',
        suggestedFixes: [
          'Verify file paths are correct',
          'Check if files exist',
          'Update import statements',
        ],
      };
    }

    // Check for permission/authentication errors
    if (
      errorText.includes('permission denied') ||
      errorText.includes('eacces') ||
      errorText.includes('unauthorized')
    ) {
      return {
        type: 'FIXABLE_WITH_FEEDBACK',
        confidence: 'medium',
        suggestedAction: 'ask_user',
        explanation: 'Permission or authentication error - may need user input',
        userMessage: 'Permission or authentication issue detected. Do you want to adjust the implementation?',
        suggestedFixes: [
          'Check file permissions',
          'Verify authentication credentials',
          'Review security settings',
        ],
      };
    }

    // Rate limit errors
    if (errorText.includes('rate limit') || errorText.includes('too many requests')) {
      return {
        type: 'TRANSIENT',
        confidence: 'high',
        suggestedAction: 'retry',
        explanation: 'Rate limiting detected - wait and retry',
        suggestedFixes: [
          'Retry with exponential backoff',
          'Reduce request frequency',
          'Wait before next attempt',
        ],
      };
    }

    // Unknown error - treat conservatively as transient
    return {
      type: 'UNKNOWN',
      confidence: 'low',
      suggestedAction: 'retry',
      explanation: `Unknown error: ${result.stderr.substring(0, 200)}`,
      suggestedFixes: [
        'Retry with exponential backoff',
        'Check logs for more details',
        'Escalate if error persists',
      ],
    };
  }

  /**
   * Calculate exponential backoff delay.
   *
   * Formula: delay = baseDelayMs * (backoffMultiplier ^ attempt)
   * Capped at maxDelayMs
   *
   * Examples (with defaults):
   * - Attempt 0: 1000ms
   * - Attempt 1: 2000ms
   * - Attempt 2: 4000ms
   * - Attempt 3: 8000ms
   *
   * @param attempt - Current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  private async calculateBackoff(attempt: number): Promise<number> {
    const exponentialDelay = this.baseDelayMs * Math.pow(this.backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);

    this.logger('debug', 'Calculated backoff', {
      attempt,
      exponentialDelay,
      cappedDelay,
    });

    return cappedDelay;
  }

  /**
   * Sleep for specified milliseconds.
   *
   * @param ms - Milliseconds to sleep
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle escalation to human.
   *
   * @param state - Current retry state
   * @param debateState - Debate context (optional)
   * @returns RetryResult with escalation status
   */
  private async handleEscalation(state: RetryState, debateState?: DebateState): Promise<RetryResult> {
    if (!state.lastExecutionResult) {
      throw new Error('No execution result to escalate');
    }

    const escalationState: EscalationState = {
      debateId: state.debateId,
      planId: state.planId,
      retriesUsed: state.currentAttempt,
      maxRetries: state.totalRetries,
      totalTimeMs: Date.now() - state.startTime,
      errorClassification: state.lastError || {
        type: 'UNKNOWN',
        confidence: 'low',
        suggestedAction: 'escalate',
        explanation: 'Unknown error',
        suggestedFixes: [],
      },
      lastExecutionResult: state.lastExecutionResult,
      debateContext: debateState
        ? {
            winningApproach: debateState.consensusSolution?.explanation || 'See consensus solution',
            votingScore: debateState.votingScore,
            roundsRequired: debateState.currentRound,
          }
        : undefined,
      userFeedbackHistory: state.userFeedbackHistory,
    };

    await this.escalateToHuman(escalationState);

    return {
      debateId: state.debateId,
      planId: state.planId,
      finalStatus: 'escalated',
      lastExecutionResult: state.lastExecutionResult,
      retriesUsed: state.currentAttempt,
      totalTimeMs: Date.now() - state.startTime,
      escalationReason: state.lastError?.explanation,
      userFeedbackProvided:
        state.userFeedbackHistory.length > 0
          ? `${state.userFeedbackHistory.length} feedback rounds completed`
          : undefined,
    };
  }

  /**
   * Format user feedback prompt.
   *
   * @param classification - Error classification
   * @returns Formatted prompt string
   */
  private formatUserFeedbackPrompt(classification: ErrorClassification): string {
    const lines: string[] = [
      '🤔 **User Input Needed**',
      '',
      `**Issue:** ${classification.explanation}`,
      '',
      classification.userMessage ? `${classification.userMessage}` : '',
      '',
      '**Suggested Actions:**',
    ];

    for (const fix of classification.suggestedFixes) {
      lines.push(`- ${fix}`);
    }

    lines.push('', 'Please provide input or choose an action.');

    return lines.join('\n');
  }

  /**
   * Format escalation message for human review.
   *
   * @param state - Escalation state
   * @returns Formatted escalation message
   */
  private formatEscalationMessage(state: EscalationState): string {
    const lines: string[] = [
      '🚨 **Consensus Implementation Failed - Manual Intervention Needed**',
      '',
      `**Debate ID:** ${state.debateId}`,
      `**Plan ID:** ${state.planId}`,
      `**Attempts:** ${state.retriesUsed}/${state.maxRetries}`,
      `**Total Time:** ${state.totalTimeMs}ms`,
      '',
      '**Error Information:**',
      `**Type:** ${state.errorClassification.type}`,
      `**Confidence:** ${state.errorClassification.confidence}`,
      `**Explanation:** ${state.errorClassification.explanation}`,
      '',
      '**Last Error Output:**',
      `\`\`\``,
      `${state.lastExecutionResult.stderr.substring(0, 500)}`,
      `\`\`\``,
      '',
    ];

    if (state.debateContext) {
      lines.push('**Debate Summary:**');
      if (state.debateContext.winningApproach) {
        lines.push(`- Winning approach: ${state.debateContext.winningApproach}`);
      }
      if (state.debateContext.votingScore) {
        lines.push(`- Voting agreement: ${state.debateContext.votingScore}%`);
      }
      if (state.debateContext.roundsRequired) {
        lines.push(`- Rounds required: ${state.debateContext.roundsRequired}`);
      }
      lines.push('');
    }

    lines.push('**Suggested Fixes:**');
    for (const fix of state.errorClassification.suggestedFixes) {
      lines.push(`- ${fix}`);
    }

    if (state.userFeedbackHistory.length > 0) {
      lines.push('');
      lines.push('**User Feedback History:**');
      for (const feedback of state.userFeedbackHistory) {
        lines.push(
          `- ${feedback.timestamp.toISOString()}: ${feedback.resolution} (${feedback.clarification || 'no input'})`
        );
      }
    }

    lines.push('');
    lines.push('**Next Steps:**');
    lines.push('1. Review the implementation plan');
    lines.push('2. Clarify any missing requirements');
    lines.push('3. Consider alternative approaches');
    lines.push('4. Decide: retry manually or abandon');
    lines.push('');
    lines.push('Waiting for your input...');

    return lines.join('\n');
  }

  /**
   * Default logger implementation.
   *
   * @param level - Log level
   * @param message - Log message
   * @param data - Optional data
   */
  private defaultLogger(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

// Types are exported above in interface definitions
