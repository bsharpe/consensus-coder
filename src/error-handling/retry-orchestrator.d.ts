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
export declare class RetryOrchestrator {
    private readonly maxRetries;
    private readonly baseDelayMs;
    private readonly maxDelayMs;
    private readonly backoffMultiplier;
    private readonly enableUserFeedback;
    private readonly userFeedbackTimeoutMs;
    private readonly logger;
    /**
     * Initialize RetryOrchestrator with configuration
     */
    constructor(options?: RetryOrchestratorOptions);
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
    executeWithRetry(plan: ImplementationPlan, relay: AuggieRelay, debateState?: DebateState): Promise<RetryResult>;
    /**
     * Request user feedback for a classified error.
     *
     * Prompts user for clarification or next steps.
     * Waits for response with timeout.
     *
     * @param classification - Error classification
     * @returns User feedback
     */
    requestUserFeedback(classification: ErrorClassification): Promise<UserFeedback>;
    /**
     * Escalate to human with detailed context.
     *
     * Formats escalation message and sends to user/Slack.
     *
     * @param state - Current retry state
     * @param debateState - Debate context (optional)
     */
    escalateToHuman(state: EscalationState): Promise<void>;
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
    private classifyError;
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
    private calculateBackoff;
    /**
     * Sleep for specified milliseconds.
     *
     * @param ms - Milliseconds to sleep
     */
    private delay;
    /**
     * Handle escalation to human.
     *
     * @param state - Current retry state
     * @param debateState - Debate context (optional)
     * @returns RetryResult with escalation status
     */
    private handleEscalation;
    /**
     * Format user feedback prompt.
     *
     * @param classification - Error classification
     * @returns Formatted prompt string
     */
    private formatUserFeedbackPrompt;
    /**
     * Format escalation message for human review.
     *
     * @param state - Escalation state
     * @returns Formatted escalation message
     */
    private formatEscalationMessage;
    /**
     * Default logger implementation.
     *
     * @param level - Log level
     * @param message - Log message
     * @param data - Optional data
     */
    private defaultLogger;
}
