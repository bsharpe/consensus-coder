/**
 * Implementation Plan Generator
 *
 * Transforms converged debate consensus into detailed, step-by-step
 * implementation plans that Auggie (code agent) can execute.
 *
 * Flow:
 * 1. Accept converged DebateState (consensus achieved)
 * 2. Extract winning solution with supporting evidence
 * 3. Call Claude Opus to synthesize detailed implementation plan
 * 4. Parse response into structured ImplementationPlan
 * 5. Format plan as executable Auggie prompt
 * 6. Validate and return
 *
 * @module implementation-plan-generator
 * @version 1.0
 */

import { DebateState, DebateRound, SynthesisResult } from './types/consensus-types.js';

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Configuration options for ImplementationPlanGenerator
 */
export interface PlanGeneratorOptions {
  /** Model ID for Opus calls (default: 'anthropic/claude-opus-4-5') */
  opusModel?: string;

  /** Maximum words in generated plan (default: 3000) */
  maxPlanLength?: number;

  /** API key for Anthropic (required if ANTHROPIC_API_KEY not in env) */
  apiKey?: string;

  /** Timeout for Opus API call (ms, default: 60000) */
  opusTimeoutMs?: number;

  /** Enable verbose logging (default: false) */
  verbose?: boolean;

  /** Custom logger function */
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
}

/**
 * A single implementation step, actionable by Auggie
 */
export interface ImplementationStep {
  /** Step number (1-indexed) */
  number: number;

  /** Brief title of this step */
  title: string;

  /** Detailed description of what to do */
  description: string;

  /** Expected output or result of this step */
  expectedOutput: string;

  /** Files affected or created by this step */
  filesAffected?: string[];

  /** Estimated time in minutes */
  estimatedMinutes?: number;
}

/**
 * Extracted summary of the winning solution
 */
export interface SolutionSummary {
  /** The consensus solution text */
  solution: string;

  /** Voting agreement score (0-100) */
  votingScore: number;

  /** Uncertainty level (0-100) */
  uncertaintyLevel: number;

  /** Supporting narrative from synthesis */
  supportingNarrative: string;

  /** How many rounds were needed to reach consensus */
  roundsRequired: number;

  /** All debate rounds for context */
  allRoundsData: DebateRound[];

  /** Timestamp when consensus was reached */
  consensusTimestamp: number;
}

/**
 * Context passed to Opus for plan generation
 */
export interface PlanContext {
  /** Original problem statement */
  problem: string;

  /** The winning/consensus approach */
  winningApproach: string;

  /** Voting score (alignment) */
  votingScore: number;

  /** Uncertainty level (disagreement) */
  uncertaintyLevel: number;

  /** How many rounds to reach consensus */
  roundsRequired: number;

  /** Complete narrative history of all rounds */
  allRoundsNarrative: string;

  /** Summary of debate context */
  debateSummary: SolutionSummary;

  /** Max words for the plan */
  maxWords: number;
}

/**
 * Complete, structured implementation plan
 * Ready for Auggie to execute
 */
export interface ImplementationPlan {
  /** ID of the debate this plan came from */
  debateId: string;

  /** The winning approach (one-liner) */
  winningApproach: string;

  /** What we're building/fixing (objectives) */
  objectives: string[];

  /** Step-by-step implementation instructions */
  steps: ImplementationStep[];

  /** How to validate the implementation */
  testingStrategy: string;

  /** Estimated time to completion */
  timeEstimate: string;

  /** Dependencies and prerequisites */
  dependencies: string[];

  /** Risks and mitigation strategies */
  risksMitigation: string;

  /** How to rollback if something goes wrong */
  rollbackPlan: string;

  /** Code examples (if applicable) */
  codeExamples?: string;

  /** This is the prompt Auggie will read and execute */
  auggiePreparedPrompt: string;

  /** Metadata */
  metadata: {
    votingScore: number;
    uncertaintyLevel: number;
    roundsRequired: number;
    generatedAt: number;
  };
}

/**
 * Represents a plan validation error
 */
export class PlanValidationError extends Error {
  constructor(
    message: string,
    public violations: string[],
  ) {
    super(message);
    this.name = 'PlanValidationError';
  }
}

// ============================================================================
// MAIN CLASS
// ============================================================================

/**
 * Generates detailed implementation plans from converged debate states
 *
 * Usage:
 * ```typescript
 * const generator = new ImplementationPlanGenerator({
 *   opusModel: 'anthropic/claude-opus-4-5',
 *   verbose: true
 * });
 *
 * const plan = await generator.generatePlan(convergencedDebateState);
 * console.log(plan.auggiePreparedPrompt); // Ready for auggie --print
 * ```
 */
export class ImplementationPlanGenerator {
  private readonly opusModel: string;
  private readonly maxPlanLength: number;
  private readonly apiKey: string;
  private readonly opusTimeoutMs: number;
  private readonly verbose: boolean;
  private readonly logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;

  constructor(options?: PlanGeneratorOptions) {
    this.opusModel = options?.opusModel ?? 'anthropic/claude-opus-4-5';
    this.maxPlanLength = options?.maxPlanLength ?? 3000;
    this.apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.opusTimeoutMs = options?.opusTimeoutMs ?? 60000;
    this.verbose = options?.verbose ?? false;

    // Default logger: console with simple formatting
    this.logger =
      options?.logger ??
      ((level: string, message: string, data?: unknown) => {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        if (this.verbose) {
          console.log(`${prefix} ${message}`, data ? data : '');
        } else if (level === 'error' || level === 'warn') {
          console.log(`${prefix} ${message}`, data ? data : '');
        }
      });

    this.logger('debug', 'ImplementationPlanGenerator initialized', {
      opusModel: this.opusModel,
      maxPlanLength: this.maxPlanLength,
      verbose: this.verbose,
    });
  }

  /**
   * Main entry point: Generate implementation plan from converged debate state
   *
   * @param state - Converged DebateState (must have isConverged === true)
   * @returns Structured ImplementationPlan ready for Auggie
   * @throws Error if debate not converged or validation fails
   */
  async generatePlan(state: DebateState): Promise<ImplementationPlan> {
    this.logger('info', 'Starting plan generation', { debateId: state.debateId });

    // Validate preconditions
    if (!state.isConverged) {
      const message = `Cannot generate plan for non-converged debate (isConverged=${state.isConverged})`;
      this.logger('error', message, { debateId: state.debateId });
      throw new Error(message);
    }

    if (state.rounds.length === 0) {
      const message = 'Cannot generate plan: no rounds completed';
      this.logger('error', message, { debateId: state.debateId });
      throw new Error(message);
    }

    try {
      // Step 1: Extract winning solution
      this.logger('debug', 'Extracting winning solution', { debateId: state.debateId });
      const winningSolution = this.extractWinningSolution(state);

      // Step 2: Build context for Opus
      this.logger('debug', 'Building context for Opus', { debateId: state.debateId });
      const planContext = this.buildPlanContext(state, winningSolution);

      // Step 3: Call Opus to generate plan
      this.logger('info', 'Calling Opus to generate implementation plan', {
        debateId: state.debateId,
        model: this.opusModel,
      });
      const planResponse = await this.callOpusForPlan(planContext);

      // Step 4: Parse Opus response
      this.logger('debug', 'Parsing Opus response', { debateId: state.debateId });
      const implementationPlan = this.parsePlanResponse(planResponse, state, winningSolution);

      // Step 5: Format as Auggie-executable prompt
      this.logger('debug', 'Formatting Auggie-prepared prompt', { debateId: state.debateId });
      implementationPlan.auggiePreparedPrompt = this.formatAuggiePreparedPrompt(implementationPlan, state);

      // Step 6: Validate plan
      this.logger('info', 'Validating generated plan', { debateId: state.debateId });
      await this.validatePlan(implementationPlan);

      this.logger('info', 'Plan generation complete', {
        debateId: state.debateId,
        stepsCount: implementationPlan.steps.length,
      });

      return implementationPlan;
    } catch (error) {
      this.logger('error', 'Plan generation failed', {
        debateId: state.debateId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Extract the winning/consensus solution from debate state
   *
   * @private
   */
  private extractWinningSolution(state: DebateState): SolutionSummary {
    // Get the last (most recent) synthesis round
    const lastRound = state.rounds[state.rounds.length - 1];
    if (!lastRound || !lastRound.synthesis) {
      throw new Error('No synthesis found in final round');
    }

    const synthesis: SynthesisResult = lastRound.synthesis;

    // Extract the top-ranked solution (rank 1 is best)
    const topRanked = synthesis.rankedSolutions[0];
    const winningSolution =
      topRanked && topRanked.modelName
        ? `${topRanked.modelName}'s solution (${topRanked.score}% confidence)`
        : 'Consensus solution from debate';

    // Build narrative from all rounds
    const allRoundsNarrative = state.rounds
      .map((round, idx) => {
        const parts: string[] = [];
        parts.push(`## Round ${idx + 1}`);

        if (round.opusProposal) {
          parts.push('### Opus Proposal:');
          const proposalText =
            typeof round.opusProposal.content === 'string'
              ? round.opusProposal.content.substring(0, 200)
              : 'Solution provided';
          parts.push(`${proposalText}...`);
        }

        if (round.synthesis) {
          parts.push(`### Synthesis: ${round.synthesis.opusSynthesis.substring(0, 300) || 'N/A'}...`);
        }

        return parts.join('\n');
      })
      .join('\n\n');

    return {
      solution: winningSolution,
      votingScore: state.votingScore,
      uncertaintyLevel: state.uncertaintyLevel,
      supportingNarrative: synthesis.opusSynthesis || 'Consensus reached through debate rounds',
      roundsRequired: state.rounds.length,
      allRoundsData: state.rounds,
      consensusTimestamp: Date.now(),
    };
  }

  /**
   * Build context object for Opus prompt
   *
   * @private
   */
  private buildPlanContext(state: DebateState, winningSolution: SolutionSummary): PlanContext {
    const allRoundsNarrative = winningSolution.allRoundsData
      .map((round, idx) => {
        const lines: string[] = [];
        lines.push(`\n### Round ${idx + 1}`);

        if (round.opusProposal) {
          lines.push('**Opus Proposal:**');
          const content =
            typeof round.opusProposal.content === 'string'
              ? round.opusProposal.content.substring(0, 150)
              : 'Solution provided';
          lines.push(`${content}`);
        }

        if (round.geminiCritique) {
          lines.push('**Gemini Critique:**');
          const critique = round.geminiCritique.critique;
          if (critique && critique.issues && critique.issues.length > 0) {
            const issueText = critique.issues.map((i) => i.issue).join('; ');
            lines.push(`Issues: ${issueText.substring(0, 150)}`);
          }
        }

        if (round.synthesis) {
          lines.push(
            `**Summary:** ${round.synthesis.opusSynthesis.substring(0, 200) || 'Consensus formed'}`,
          );
        }

        return lines.join('\n');
      })
      .join('\n');

    return {
      problem: state.problemStatement,
      winningApproach: winningSolution.solution,
      votingScore: winningSolution.votingScore,
      uncertaintyLevel: winningSolution.uncertaintyLevel,
      roundsRequired: winningSolution.roundsRequired,
      allRoundsNarrative,
      debateSummary: winningSolution,
      maxWords: this.maxPlanLength,
    };
  }

  /**
   * Call Claude Opus to generate the implementation plan
   *
   * @private
   */
  private async callOpusForPlan(context: PlanContext): Promise<string> {
    const prompt = `You are an expert software engineer. Based on this consensus debate, generate a detailed, step-by-step implementation plan.

## Winning Approach (Consensus Selected)
${context.winningApproach}

## Problem Statement
${context.problem}

## Debate Metrics
- Voting Agreement Score: ${context.votingScore}%
- Uncertainty Level: ${context.uncertaintyLevel}%
- Rounds to Consensus: ${context.roundsRequired}

## Complete Debate History
${context.allRoundsNarrative}

## Your Task

Generate a comprehensive implementation plan with exactly these sections:

### 1. Objective
Clear statement of what we're building/fixing and why this consensus approach is optimal.

### 2. Step-by-Step Implementation
Provide 8-12 numbered steps. For each step include:
- **What to do:** Specific action
- **Files to change/create:** Exact paths
- **Expected output:** What success looks like
- **Time estimate:** In minutes

### 3. Testing Strategy
How to validate the implementation works correctly. Include unit tests, integration tests, and acceptance criteria.

### 4. Time Estimate
Total estimated time (hours/days) and effort breakdown.

### 5. Dependencies
What needs to be done first, external dependencies, or prerequisite knowledge.

### 6. Risks & Mitigation
Potential problems and how to prevent/handle them.

### 7. Rollback Plan
Step-by-step instructions to revert if needed.

### 8. Code Examples (if applicable)
Specific code snippets showing the solution pattern.

---

**Important:** Format for an AI code agent to execute. Be specific, concrete, and actionable. Keep total response under ${context.maxWords} words.`;

    try {
      this.logger('debug', 'Calling Opus API', { model: this.opusModel });

      const response = await this.callAnthropicAPI(prompt);

      this.logger('debug', 'Opus API response received', { responseLength: response.length });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger('error', 'Opus API call failed', { error: errorMessage });

      // Retry once on timeout
      if (errorMessage.includes('timeout')) {
        this.logger('warn', 'Retrying Opus call after timeout', { model: this.opusModel });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.callAnthropicAPI(prompt);
      }

      throw error;
    }
  }

  /**
   * Call Anthropic API using fetch
   *
   * @private
   */
  private async callAnthropicAPI(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.opusTimeoutMs);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.opusModel,
          max_tokens: Math.ceil((this.maxPlanLength / 5) * 4), // Roughly 4 chars per token
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorData}`);
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; text: string }>;
      };

      if (!data.content || data.content.length === 0) {
        throw new Error('Empty response from Anthropic API');
      }

      const textContent = data.content.find((c) => c.type === 'text');
      if (!textContent) {
        throw new Error('No text content in Anthropic API response');
      }

      return textContent.text;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Opus API call timeout (${this.opusTimeoutMs}ms)`);
      }

      throw error;
    }
  }

  /**
   * Parse Opus's plan response into structured ImplementationPlan
   *
   * @private
   */
  private parsePlanResponse(
    response: string,
    state: DebateState,
    winningSolution: SolutionSummary,
  ): ImplementationPlan {
    // Extract sections using regex
    const extractSection = (heading: string): string => {
      const regex = new RegExp(`### ${heading}\\s*\\n([\\s\\S]*?)(?=###|$)`, 'i');
      const match = response.match(regex);
      return match ? match[1].trim() : '';
    };

    // Parse sections
    const objectiveText = extractSection('Objective') || extractSection('1\\. Objective');
    const objectives = objectiveText
      .split('\n')
      .filter((line) => line.trim().length > 0 && !line.startsWith('#'))
      .slice(0, 5); // Max 5 objectives

    const stepsText = extractSection('Step-by-Step Implementation') || extractSection('2\\. Step-by-Step');
    const steps = this.parseStepsFromText(stepsText);

    const testingText = extractSection('Testing Strategy') || extractSection('3\\. Testing');
    const timeEstimateText = extractSection('Time Estimate') || extractSection('4\\. Time');
    const dependenciesText = extractSection('Dependencies') || extractSection('5\\. Dependencies');
    const risksText = extractSection('Risks & Mitigation') || extractSection('6\\. Risks');
    const rollbackText = extractSection('Rollback Plan') || extractSection('7\\. Rollback');
    const codeText = extractSection('Code Examples') || extractSection('8\\. Code');

    return {
      debateId: state.debateId,
      winningApproach: winningSolution.solution,
      objectives: objectives.length > 0 ? objectives : ['Implement consensus solution'],
      steps: steps.length > 0 ? steps : this.generateDefaultSteps(),
      testingStrategy: testingText || 'Run all tests and manual validation',
      timeEstimate: timeEstimateText || 'TBD',
      dependencies: dependenciesText
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(0, 10),
      risksMitigation: risksText || 'See rollback plan for recovery',
      rollbackPlan: rollbackText || 'Revert changes via git and restart',
      codeExamples: codeText || undefined,
      auggiePreparedPrompt: '', // Will be filled by formatAuggiePreparedPrompt()
      metadata: {
        votingScore: winningSolution.votingScore,
        uncertaintyLevel: winningSolution.uncertaintyLevel,
        roundsRequired: winningSolution.roundsRequired,
        generatedAt: Date.now(),
      },
    };
  }

  /**
   * Parse numbered steps from text
   *
   * @private
   */
  private parseStepsFromText(text: string): ImplementationStep[] {
    const steps: ImplementationStep[] = [];
    const lines = text.split('\n');

    let currentStep: Partial<ImplementationStep> | null = null;
    let stepNum = 0;

    for (const line of lines) {
      // Match numbered steps like "1. Step Title"
      const stepMatch = line.match(/^[-•]?\s*(\d+)\.\s*\*?\*?([^\*]+)\*?\*?/);
      if (stepMatch) {
        if (currentStep && 'title' in currentStep) {
          steps.push(currentStep as ImplementationStep);
        }
        stepNum = parseInt(stepMatch[1], 10);
        currentStep = {
          number: stepNum,
          title: stepMatch[2].trim(),
          description: '',
          expectedOutput: '',
        };
      } else if (currentStep && line.trim().length > 0) {
        // Add to current step description
        if (!currentStep.description) {
          currentStep.description = line.trim();
        } else {
          currentStep.description += '\n' + line.trim();
        }
      }
    }

    if (currentStep && 'title' in currentStep) {
      steps.push(currentStep as ImplementationStep);
    }

    // Ensure description and expectedOutput are non-empty
    return steps.map((step) => ({
      ...step,
      description: step.description || `Complete step ${step.number}`,
      expectedOutput: step.expectedOutput || 'Step completed successfully',
    }));
  }

  /**
   * Generate default steps if parsing fails
   *
   * @private
   */
  private generateDefaultSteps(): ImplementationStep[] {
    return [
      {
        number: 1,
        title: 'Setup and Review',
        description: 'Review the implementation plan and verify all prerequisites are met',
        expectedOutput: 'Environment ready, dependencies installed',
      },
      {
        number: 2,
        title: 'Implementation',
        description: 'Implement the consensus solution',
        expectedOutput: 'Code changes committed',
      },
      {
        number: 3,
        title: 'Testing',
        description: 'Run comprehensive tests',
        expectedOutput: 'All tests passing',
      },
      {
        number: 4,
        title: 'Validation',
        description: 'Validate the solution meets objectives',
        expectedOutput: 'Solution verified',
      },
      {
        number: 5,
        title: 'Documentation',
        description: 'Document changes and rollback procedure',
        expectedOutput: 'Documentation complete',
      },
    ];
  }

  /**
   * Format the plan as an Auggie-executable prompt
   *
   * @private
   */
  private formatAuggiePreparedPrompt(plan: ImplementationPlan, state: DebateState): string {
    const stepsFormatted = plan.steps
      .map((step) => {
        return `\n**${step.number}. ${step.title}**\n${step.description}\n- Expected Output: ${step.expectedOutput}${
          step.filesAffected ? '\n- Files: ' + step.filesAffected.join(', ') : ''
        }`;
      })
      .join('\n');

    const dependenciesFormatted = plan.dependencies.length > 0 ? plan.dependencies.join('\n- ') : 'None identified';

    return `## Task: ${plan.winningApproach}

### Context
**Problem:** ${state.problemStatement}

**Consensus Metrics:**
- Voting Alignment: ${plan.metadata.votingScore}%
- Uncertainty Level: ${plan.metadata.uncertaintyLevel}%
- Debate Rounds: ${plan.metadata.roundsRequired}

**Debate ID:** \`${state.debateId}\`

---

### Objectives
${plan.objectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}

---

### Steps to Implement
${stepsFormatted}

---

### Testing Strategy
${plan.testingStrategy}

**Acceptance Criteria:**
- All existing tests pass
- New functionality is covered by tests
- Code follows project patterns and idioms
- No regressions in related features

---

### Time Estimate
${plan.timeEstimate}

---

### Dependencies & Prerequisites
- ${dependenciesFormatted}

---

### Risks & Mitigations
${plan.risksMitigation}

---

### Rollback Plan
${plan.rollbackPlan}

---

### Implementation Notes
- This plan was generated from consensus debate (${plan.metadata.roundsRequired} rounds)
- Follow each step sequentially
- Test after each major change
- Commit changes with descriptive messages
- Update documentation as you go
${plan.codeExamples ? `\n### Code Examples\n${plan.codeExamples}` : ''}

---

**Status:** Ready for implementation. Execute each step in order.`;
  }

  /**
   * Validate that plan is executable
   *
   * @throws PlanValidationError if validation fails
   */
  async validatePlan(plan: ImplementationPlan): Promise<boolean> {
    const violations: string[] = [];

    // Check required fields
    if (!plan.debateId) violations.push('Missing debateId');
    if (!plan.winningApproach) violations.push('Missing winningApproach');
    if (plan.objectives.length === 0) violations.push('No objectives defined');
    if (!plan.testingStrategy) violations.push('Missing testingStrategy');
    if (!plan.timeEstimate) violations.push('Missing timeEstimate');
    if (!plan.rollbackPlan) violations.push('Missing rollbackPlan');
    if (!plan.auggiePreparedPrompt || plan.auggiePreparedPrompt.length < 100) {
      violations.push('auggiePreparedPrompt is missing or too short');
    }

    // Check steps
    if (plan.steps.length < 3) {
      violations.push(`Expected at least 3 steps, got ${plan.steps.length}`);
    }

    for (const step of plan.steps) {
      if (!step.title || !step.description || !step.expectedOutput) {
        violations.push(`Step ${step.number} missing required fields`);
      }
    }

    // Check metadata
    if (typeof plan.metadata.votingScore !== 'number' || plan.metadata.votingScore < 0 || plan.metadata.votingScore > 100) {
      violations.push('Invalid votingScore in metadata');
    }

    if (violations.length > 0) {
      const message = `Plan validation failed with ${violations.length} violation(s)`;
      this.logger('error', message, { violations });
      throw new PlanValidationError(message, violations);
    }

    this.logger('info', 'Plan validation passed', {
      stepsCount: plan.steps.length,
      objectivesCount: plan.objectives.length,
    });

    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DebateState, DebateRound } from './types/consensus-types.js';
