/**
 * Auggie Adapter - Tool adapter for Augment's Auggie CLI
 *
 * Implements the ToolAdapter interface by extending BaseAdapter to integrate
 * the Auggie CLI tool into the consensus-coder system. Auggie can act as either
 * a context-engine (generating solutions) or a reviewer (voting on solutions).
 *
 * @version 1.0
 */

import { spawn, type ChildProcess } from 'child_process';
import type {
  ToolConfig,
  ToolGenerateRequest,
  ToolReviewRequest,
  ToolSolution,
  ToolVote,
  ToolName,
  ToolRole,
} from './tool-adapter.js';
import { BaseAdapter } from './base-adapter.js';

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for Auggie CLI operations in milliseconds */
const DEFAULT_TIMEOUT = 300000; // 5 minutes

/** Default path to auggie binary */
const DEFAULT_AUGGIE_PATH = 'auggie';

/** Default number of solutions to generate */
const DEFAULT_NUM_SOLUTIONS = 3;

// ============================================================================
// AuggieAdapter Class
// ============================================================================

/**
 * Tool adapter for Augment's Auggie CLI.
 *
 * Provides integration with the Auggie CLI tool for both solution generation
 * (context-engine role) and solution review (reviewer role).
 *
 * @extends {BaseAdapter}
 *
 * @example
 * ```typescript
 * const auggie = new AuggieAdapter('context-engine');
 * await auggie.initialize({
 *   name: 'auggie',
 *   path: '/usr/local/bin/auggie',
 *   timeout: 300000
 * });
 *
 * if (await auggie.isAvailable()) {
 *   const solutions = await auggie.generateSolutions({
 *     problem: 'Implement a binary search function',
 *     context: '// existing code...',
 *     numSolutions: 3
 *   });
 * }
 * ```
 */
export class AuggieAdapter extends BaseAdapter {
  /**
   * The name of this tool.
   * @readonly
   */
  public readonly name: ToolName = 'auggie';

  /**
   * The role this tool plays in the consensus process.
   * @readonly
   */
  public readonly role: ToolRole;

  /**
   * Path to the auggie binary.
   * @private
   */
  private auggiePath: string = DEFAULT_AUGGIE_PATH;

  /**
   * Timeout for auggie operations in milliseconds.
   * @private
   */
  private timeout: number = DEFAULT_TIMEOUT;

  /**
   * Creates a new AuggieAdapter instance.
   *
   * @param role - The role this adapter plays (default: 'context-engine')
   */
  constructor(role: ToolRole = 'context-engine') {
    super('auggie', role);
    this.role = role;
  }

  // ==========================================================================
  // Initialization Override
  // ==========================================================================

  /**
   * Initialize the adapter with configuration.
   *
   * Sets auggiePath and timeout from config before calling super.initialize().
   *
   * @param config - Configuration options
   * @override
   */
  async initialize(config: ToolConfig): Promise<void> {
    // Set auggie-specific configuration
    if (config.path) {
      this.auggiePath = config.path;
    }
    if (config.timeout && config.timeout > 0) {
      this.timeout = config.timeout;
    }

    this.log('debug', 'Configuring Auggie adapter', {
      auggiePath: this.auggiePath,
      timeout: this.timeout,
      role: this.role,
    });

    await super.initialize(config);
  }

  // ==========================================================================
  // Abstract Method Implementations
  // ==========================================================================

  /**
   * Check if the Auggie CLI is available.
   *
   * Runs `auggie --version` to verify the binary exists and is executable.
   *
   * @returns Promise resolving to true if auggie is available
   * @protected
   * @override
   */
  protected async doIsAvailable(): Promise<boolean> {
    try {
      this.log('debug', 'Checking Auggie availability', { path: this.auggiePath });
      const output = await this.spawnAuggie(['--version']);
      const available = output.length > 0;
      this.log('debug', 'Auggie availability check result', { available, version: output.trim() });
      return available;
    } catch (error) {
      this.log('warn', 'Auggie not available', { error });
      return false;
    }
  }

  /**
   * Generate solutions using Auggie CLI.
   *
   * Builds a prompt and spawns Auggie to generate the requested number of solutions.
   *
   * @param request - The generation request
   * @returns Promise resolving to array of solutions
   * @protected
   * @override
   */
  protected async doGenerateSolutions(
    request: ToolGenerateRequest
  ): Promise<ToolSolution[]> {
    const numSolutions = request.numSolutions ?? DEFAULT_NUM_SOLUTIONS;

    this.log('info', 'Building generation prompt', { numSolutions });
    const prompt = this.buildGeneratePrompt(request, numSolutions);

    this.log('debug', 'Spawning Auggie for solution generation');
    const output = await this.spawnAuggie(['-p', prompt]);

    this.log('debug', 'Parsing Auggie output');
    return this.parseGenerateSolutionsOutput(output);
  }

  /**
   * Review solutions using Auggie CLI.
   *
   * Builds a review prompt and spawns Auggie to evaluate and vote on solutions.
   *
   * @param request - The review request
   * @returns Promise resolving to a vote
   * @protected
   * @override
   */
  protected async doReviewSolutions(
    request: ToolReviewRequest
  ): Promise<ToolVote> {
    this.log('info', 'Building review prompt', {
      solutionCount: request.solutions.length,
    });
    const prompt = this.buildReviewPrompt(request);

    this.log('debug', 'Spawning Auggie for solution review');
    const output = await this.spawnAuggie(['-p', prompt]);

    const solutionIds = request.solutions.map((s) => s.solutionId);
    this.log('debug', 'Parsing Auggie review output');
    return this.parseReviewOutput(output, solutionIds);
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Spawn the Auggie CLI process and return stdout.
   *
   * @param args - Arguments to pass to auggie
   * @returns Promise resolving to stdout content
   * @throws Error if the process fails or times out
   * @private
   */
  private spawnAuggie(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      this.log('debug', 'Spawning Auggie process', { args, timeout: this.timeout });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child: ChildProcess = spawn(this.auggiePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        reject(new Error(`Auggie process timed out after ${this.timeout}ms`));
      }, this.timeout);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutId);
        if (timedOut) return;

        if (code === 0) {
          resolve(stdout);
        } else {
          this.log('error', 'Auggie process failed', { code, stderr });
          reject(new Error(`Auggie process exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        if (timedOut) return;
        this.log('error', 'Auggie spawn error', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Build the prompt for solution generation.
   *
   * @param request - The generation request
   * @param numSolutions - Number of solutions to generate
   * @returns The formatted prompt string
   * @private
   */
  private buildGeneratePrompt(
    request: ToolGenerateRequest,
    numSolutions: number
  ): string {
    let prompt = `Generate ${numSolutions} different solutions for the following problem.

## Problem
${request.problem}

## Context
${request.context}`;

    if (request.constraints && request.constraints.length > 0) {
      prompt += `\n\n## Constraints\n${request.constraints.map((c) => `- ${c}`).join('\n')}`;
    }

    if (request.previousRoundSynthesis) {
      prompt += `\n\n## Previous Round Synthesis\n${request.previousRoundSynthesis}`;
    }

    prompt += `\n\n## Output Format
For each solution, provide:
1. name: A short descriptive name
2. description: 2-3 sentences explaining the approach
3. code: The implementation code
4. language: The programming language
5. rationale: Why this approach was chosen
6. complexity: Time and space complexity (e.g., "O(n)", "O(1)")
7. tradeoffs: List of trade-offs
8. risks: Potential issues or limitations
9. confidence: A number from 0-100

Format each solution as JSON with clear delimiters.`;

    return prompt;
  }

  /**
   * Build the prompt for solution review.
   *
   * @param request - The review request
   * @returns The formatted prompt string
   * @private
   */
  private buildReviewPrompt(request: ToolReviewRequest): string {
    const solutionsText = request.solutions
      .map(
        (s, i) => `### Solution ${i + 1}: ${s.name} (ID: ${s.solutionId})
**Description:** ${s.description}
**Rationale:** ${s.rationale}
**Complexity:** Time: ${s.complexity.time}, Space: ${s.complexity.space}
**Code:**
\`\`\`${s.language}
${s.code}
\`\`\`
**Trade-offs:** ${s.tradeoffs.join(', ')}
**Risks:** ${s.risks.join(', ')}
**Confidence:** ${s.confidence}`
      )
      .join('\n\n');

    let prompt = `Review and vote on the following solutions for the given problem.

## Problem
${request.problem}

## Context
${request.context}

## Solutions to Review
${solutionsText}

## Instructions
1. Evaluate each solution for correctness, efficiency, maintainability, and fit
2. Select the best solution by its ID
3. Provide scores (1-10) for each solution
4. Explain your reasoning

## Output Format
Provide your vote as JSON with:
- selectedSolutionId: The ID of the best solution
- confidence: Your confidence (0-100)
- reasoning: Why you chose this solution
- concerns: Any concerns about the selected solution
- suggestions: Improvements for the selected solution
- scores: Object mapping solution IDs to scores (1-10)`;

    if (request.previousReviews && request.previousReviews.length > 0) {
      const previousText = request.previousReviews
        .map((r) => `- ${r.voterId}: selected ${r.selectedSolutionId} (confidence: ${r.confidence})`)
        .join('\n');
      prompt += `\n\n## Previous Reviews\n${previousText}`;
    }

    return prompt;
  }

  /**
   * Parse Auggie output to extract solutions.
   *
   * @param output - Raw output from Auggie
   * @returns Array of parsed solutions
   * @private
   */
  private parseGenerateSolutionsOutput(output: string): ToolSolution[] {
    const solutions: ToolSolution[] = [];

    try {
      // Try to find JSON blocks in the output
      const jsonMatches = output.match(/\{[\s\S]*?\}/g);
      if (!jsonMatches) {
        this.log('warn', 'No JSON solutions found in output');
        return this.createFallbackSolution(output);
      }

      for (const jsonStr of jsonMatches) {
        try {
          const parsed = JSON.parse(jsonStr);
          if (this.isValidSolution(parsed)) {
            solutions.push({
              solutionId: parsed.solutionId || this.generateSolutionId(),
              name: parsed.name || 'Unnamed Solution',
              description: parsed.description || '',
              code: parsed.code || '',
              language: parsed.language || 'typescript',
              rationale: parsed.rationale || '',
              complexity: {
                time: parsed.complexity?.time || 'O(?)',
                space: parsed.complexity?.space || 'O(?)',
              },
              tradeoffs: Array.isArray(parsed.tradeoffs) ? parsed.tradeoffs : [],
              risks: Array.isArray(parsed.risks) ? parsed.risks : [],
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
            });
          }
        } catch {
          // Skip invalid JSON blocks
          this.log('debug', 'Skipping invalid JSON block');
        }
      }
    } catch (error) {
      this.log('error', 'Failed to parse solutions output', { error });
      return this.createFallbackSolution(output);
    }

    return solutions.length > 0 ? solutions : this.createFallbackSolution(output);
  }

  /**
   * Parse Auggie output to extract a vote.
   *
   * @param output - Raw output from Auggie
   * @param solutionIds - List of valid solution IDs
   * @returns Parsed vote object
   * @private
   */
  private parseReviewOutput(output: string, solutionIds: string[]): ToolVote {
    try {
      // Try to find JSON in the output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate selectedSolutionId
        const selectedId = solutionIds.includes(parsed.selectedSolutionId)
          ? parsed.selectedSolutionId
          : solutionIds[0];

        // Build scores object
        const scores: { [key: string]: number } = {};
        if (parsed.scores && typeof parsed.scores === 'object') {
          for (const id of solutionIds) {
            scores[id] = typeof parsed.scores[id] === 'number' ? parsed.scores[id] : 5;
          }
        } else {
          for (const id of solutionIds) {
            scores[id] = id === selectedId ? 8 : 5;
          }
        }

        return {
          voterId: this.name,
          selectedSolutionId: selectedId,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
          reasoning: parsed.reasoning || 'No reasoning provided',
          concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
          scores,
        };
      }
    } catch (error) {
      this.log('error', 'Failed to parse review output', { error });
    }

    // Fallback vote
    return this.createFallbackVote(solutionIds);
  }

  /**
   * Check if a parsed object is a valid solution.
   *
   * @param obj - The object to check
   * @returns True if the object has required solution fields
   * @private
   */
  private isValidSolution(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const s = obj as Record<string, unknown>;
    return (
      typeof s.name === 'string' ||
      typeof s.code === 'string' ||
      typeof s.description === 'string'
    );
  }

  /**
   * Create a fallback solution when parsing fails.
   *
   * @param output - The raw output to include
   * @returns Array with a single fallback solution
   * @private
   */
  private createFallbackSolution(output: string): ToolSolution[] {
    return [
      {
        solutionId: this.generateSolutionId(),
        name: 'Auggie Generated Solution',
        description: 'Solution generated by Auggie (parsing may have been incomplete)',
        code: output.substring(0, 50000),
        language: 'typescript',
        rationale: 'Generated by Auggie CLI',
        complexity: { time: 'O(?)', space: 'O(?)' },
        tradeoffs: ['Unable to parse structured output'],
        risks: ['Output format may need manual review'],
        confidence: 30,
      },
    ];
  }

  /**
   * Create a fallback vote when parsing fails.
   *
   * @param solutionIds - List of valid solution IDs
   * @returns A fallback vote selecting the first solution
   * @private
   */
  private createFallbackVote(solutionIds: string[]): ToolVote {
    const scores: { [key: string]: number } = {};
    for (const id of solutionIds) {
      scores[id] = 5;
    }
    if (solutionIds.length > 0) {
      scores[solutionIds[0]] = 6;
    }

    return {
      voterId: this.name,
      selectedSolutionId: solutionIds[0] || 'unknown',
      confidence: 30,
      reasoning: 'Fallback vote - unable to parse Auggie output',
      concerns: ['Review output could not be fully parsed'],
      suggestions: [],
      scores,
    };
  }
}