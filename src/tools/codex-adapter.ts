/**
 * Codex Adapter
 *
 * Implements the ToolAdapter interface for OpenAI Codex/GPT API integration.
 * Extends BaseAdapter to provide OpenAI-specific solution generation and review.
 *
 * Supports both context-engine (solution generation) and reviewer (solution voting) roles.
 *
 * @module codex-adapter
 * @version 1.0
 */

import type {
  ToolConfig,
  ToolGenerateRequest,
  ToolReviewRequest,
  ToolRole,
  ToolSolution,
  ToolVote,
} from './tool-adapter.js';
import { BaseAdapter } from './base-adapter.js';

// ============================================================================
// CodexAdapter Class
// ============================================================================

/**
 * Adapter for OpenAI Codex/GPT API integration.
 *
 * Uses the OpenAI Chat Completions API to generate and review code solutions.
 * Supports configurable model, temperature, and timeout settings.
 *
 * @extends BaseAdapter
 *
 * @example
 * ```typescript
 * const codex = new CodexAdapter('context-engine');
 * await codex.initialize({
 *   name: 'codex',
 *   apiKey: 'sk-...',
 *   model: 'gpt-4o',
 *   temperature: 0.7
 * });
 *
 * if (await codex.isAvailable()) {
 *   const solutions = await codex.generateSolutions({
 *     problem: 'Implement a binary search',
 *     context: '// existing code...',
 *     numSolutions: 3
 *   });
 * }
 * ```
 */
export class CodexAdapter extends BaseAdapter {
  /**
   * The name of this tool.
   * @readonly
   */
  public readonly name = 'codex' as const;

  /**
   * OpenAI API key for authentication.
   * @private
   */
  private apiKey: string | null = null;

  /**
   * OpenAI model to use (e.g., 'gpt-4o', 'gpt-4-turbo').
   * @private
   */
  private model: string = 'gpt-4o';

  /**
   * Sampling temperature for response generation.
   * @private
   */
  private temperature: number = 0.7;

  /**
   * Request timeout in milliseconds.
   * @private
   */
  private timeout: number = 60000;

  /**
   * Creates a new CodexAdapter instance.
   *
   * @param role - The role this adapter plays (default: 'reviewer')
   */
  constructor(role: ToolRole = 'reviewer') {
    super('codex', role);
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the adapter with configuration.
   *
   * Extracts API key, model, temperature, and timeout from config.
   * Falls back to OPENAI_API_KEY environment variable if apiKey not provided.
   *
   * @param config - Configuration options
   */
  async initialize(config: ToolConfig): Promise<void> {
    // Set API key from config or environment
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? null;

    // Set model if provided
    if (config.model) {
      this.model = config.model;
    }

    // Set temperature if provided
    if (config.temperature !== undefined) {
      this.temperature = config.temperature;
    }

    // Set timeout if provided
    if (config.timeout !== undefined) {
      this.timeout = config.timeout;
    }

    // Call parent initialization
    await super.initialize(config);

    this.log('info', 'Codex adapter configured', {
      model: this.model,
      temperature: this.temperature,
      timeout: this.timeout,
      hasApiKey: !!this.apiKey,
    });
  }

  // ==========================================================================
  // Abstract Method Implementations
  // ==========================================================================

  /**
   * Check if the OpenAI API is available.
   *
   * Returns true if an API key is configured.
   *
   * @returns Promise resolving to true if API key is set
   * @protected
   */
  protected async doIsAvailable(): Promise<boolean> {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /**
   * Generate solutions using OpenAI API.
   *
   * Builds a structured prompt and calls the API to generate solutions.
   *
   * @param request - The generation request
   * @returns Promise resolving to an array of solutions
   * @protected
   */
  protected async doGenerateSolutions(
    request: ToolGenerateRequest
  ): Promise<ToolSolution[]> {
    const prompt = this.buildGeneratePrompt(request);
    const output = await this.callOpenAIAPI(prompt);
    return this.parseGenerateSolutionsOutput(output, request.numSolutions ?? 3);
  }

  /**
   * Review solutions using OpenAI API.
   *
   * Builds a structured prompt and calls the API to review solutions.
   *
   * @param request - The review request
   * @returns Promise resolving to a vote
   * @protected
   */
  protected async doReviewSolutions(
    request: ToolReviewRequest
  ): Promise<ToolVote> {
    const prompt = this.buildReviewPrompt(request);
    const output = await this.callOpenAIAPI(prompt);
    const solutionIds = request.solutions.map((s) => s.solutionId);
    return this.parseReviewOutput(output, solutionIds);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Build a prompt for solution generation.
   *
   * @param request - The generation request
   * @returns Formatted prompt string
   * @private
   */
  private buildGeneratePrompt(request: ToolGenerateRequest): string {
    const numSolutions = request.numSolutions ?? 3;
    const constraintsSection = request.constraints?.length
      ? `\n\nConstraints:\n${request.constraints.map((c) => `- ${c}`).join('\n')}`
      : '';
    const previousRoundSection = request.previousRoundSynthesis
      ? `\n\nPrevious Round Synthesis:\n${request.previousRoundSynthesis}`
      : '';

    return `You are an expert software engineer. Generate ${numSolutions} distinct solutions for the following problem.

Problem:
${request.problem}

Codebase Context:
${request.context}${constraintsSection}${previousRoundSection}

For each solution, provide a JSON object with the following structure:
{
  "name": "Short descriptive name",
  "description": "2-3 sentences explaining the approach",
  "code": "The implementation code",
  "language": "programming language (lowercase)",
  "rationale": "Why this approach was chosen",
  "complexity": { "time": "O(...)", "space": "O(...)" },
  "tradeoffs": ["tradeoff 1", "tradeoff 2"],
  "risks": ["risk 1", "risk 2"],
  "confidence": 85
}

Return a JSON array containing exactly ${numSolutions} solution objects.
Respond ONLY with the JSON array, no additional text.`;
  }

  /**
   * Build a prompt for solution review.
   *
   * @param request - The review request
   * @returns Formatted prompt string
   * @private
   */
  private buildReviewPrompt(request: ToolReviewRequest): string {
    const solutionsText = request.solutions
      .map(
        (s, i) => `
Solution ${i + 1} (ID: ${s.solutionId}):
Name: ${s.name}
Description: ${s.description}
Code:
\`\`\`${s.language}
${s.code}
\`\`\`
Rationale: ${s.rationale}
Complexity: Time ${s.complexity.time}, Space ${s.complexity.space}
Confidence: ${s.confidence}%
`
      )
      .join('\n---\n');

    return `You are an expert code reviewer. Review the following solutions and select the best one.

Problem:
${request.problem}

Codebase Context:
${request.context}

Solutions to Review:
${solutionsText}

Evaluate each solution on:
1. Correctness
2. Code quality
3. Performance
4. Maintainability
5. Adherence to requirements

Respond with a JSON object:
{
  "selectedSolutionId": "the solutionId of your choice",
  "confidence": 0-100,
  "reasoning": "detailed explanation of your choice",
  "concerns": ["concern 1", "concern 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "scores": {
    "solutionId1": 1-10,
    "solutionId2": 1-10
  }
}

Respond ONLY with the JSON object, no additional text.`;
  }

  /**
   * Call the OpenAI API with a prompt.
   *
   * TODO: Replace mock implementation with actual OpenAI API call.
   *
   * @param prompt - The prompt to send
   * @returns Promise resolving to the response text
   * @private
   */
  private async callOpenAIAPI(prompt: string): Promise<string> {
    // TODO: Implement actual OpenAI API call
    // This is a placeholder that simulates an API response
    // Real implementation would use fetch() to POST to https://api.openai.com/v1/chat/completions
    //
    // Example real implementation:
    // const response = await fetch('https://api.openai.com/v1/chat/completions', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${this.apiKey}`,
    //   },
    //   body: JSON.stringify({
    //     model: this.model,
    //     messages: [{ role: 'user', content: prompt }],
    //     temperature: this.temperature,
    //   }),
    //   signal: AbortSignal.timeout(this.timeout),
    // });
    // const data = await response.json();
    // return data.choices[0].message.content;

    this.log('debug', 'Mock API call', {
      promptLength: prompt.length,
      model: this.model,
      temperature: this.temperature,
    });

    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Return mock response based on prompt type
    if (prompt.includes('Generate') && prompt.includes('solutions')) {
      return this.getMockGenerateResponse();
    } else {
      return this.getMockReviewResponse();
    }
  }

  /**
   * Get a mock response for solution generation.
   *
   * @returns Mock JSON string
   * @private
   */
  private getMockGenerateResponse(): string {
    const mockSolutions = [
      {
        name: 'Mock Solution 1',
        description: 'A mock solution for testing purposes.',
        code: '// Mock implementation\nfunction solution1() {\n  return "mock";\n}',
        language: 'typescript',
        rationale: 'This is a mock solution for testing the adapter.',
        complexity: { time: 'O(1)', space: 'O(1)' },
        tradeoffs: ['This is a mock', 'Not a real solution'],
        risks: ['Not suitable for production'],
        confidence: 75,
      },
    ];
    return JSON.stringify(mockSolutions);
  }

  /**
   * Get a mock response for solution review.
   *
   * @returns Mock JSON string
   * @private
   */
  private getMockReviewResponse(): string {
    return JSON.stringify({
      selectedSolutionId: 'mock-solution-id',
      confidence: 80,
      reasoning: 'This is a mock review response for testing.',
      concerns: ['Mock concern'],
      suggestions: ['Mock suggestion'],
      scores: {},
    });
  }

  /**
   * Parse the API output into ToolSolution objects.
   *
   * @param output - The raw API response
   * @param numSolutions - Expected number of solutions
   * @returns Array of ToolSolution objects
   * @private
   */
  private parseGenerateSolutionsOutput(
    output: string,
    numSolutions: number
  ): ToolSolution[] {
    try {
      const parsed = JSON.parse(output);
      const solutions: ToolSolution[] = [];

      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items.slice(0, numSolutions)) {
        solutions.push({
          solutionId: this.generateSolutionId(),
          name: item.name ?? 'Unnamed Solution',
          description: item.description ?? '',
          code: item.code ?? '',
          language: item.language ?? 'typescript',
          rationale: item.rationale ?? '',
          complexity: item.complexity ?? { time: 'O(?)', space: 'O(?)' },
          tradeoffs: item.tradeoffs ?? [],
          risks: item.risks ?? [],
          confidence: item.confidence ?? 50,
        });
      }

      return solutions;
    } catch (error) {
      this.log('error', 'Failed to parse generate response', { error, output });
      throw new Error('Failed to parse solution generation response from API');
    }
  }

  /**
   * Parse the API output into a ToolVote object.
   *
   * @param output - The raw API response
   * @param solutionIds - Valid solution IDs to reference
   * @returns ToolVote object
   * @private
   */
  private parseReviewOutput(output: string, solutionIds: string[]): ToolVote {
    try {
      const parsed = JSON.parse(output);

      // Validate selectedSolutionId
      let selectedId = parsed.selectedSolutionId;
      if (!solutionIds.includes(selectedId) && solutionIds.length > 0) {
        this.log('warn', 'Invalid selectedSolutionId, using first solution', {
          received: selectedId,
          available: solutionIds,
        });
        selectedId = solutionIds[0];
      }

      // Build scores map with defaults
      const scores: { [solutionId: string]: number } = {};
      for (const id of solutionIds) {
        scores[id] = parsed.scores?.[id] ?? 5;
      }

      return {
        voterId: this.name,
        selectedSolutionId: selectedId,
        confidence: parsed.confidence ?? 50,
        reasoning: parsed.reasoning ?? '',
        concerns: parsed.concerns ?? [],
        suggestions: parsed.suggestions ?? [],
        scores,
      };
    } catch (error) {
      this.log('error', 'Failed to parse review response', { error, output });
      throw new Error('Failed to parse review response from API');
    }
  }
}

