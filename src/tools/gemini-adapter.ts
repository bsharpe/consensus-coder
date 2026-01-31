/**
 * Gemini Adapter
 *
 * Implements the ToolAdapter interface for Google Gemini API.
 * Supports both context-engine (solution generation) and reviewer (voting) roles.
 *
 * @module gemini-adapter
 * @version 1.0
 */

import { BaseAdapter } from './base-adapter.js';
import {
  ToolRole,
  ToolConfig,
  ToolGenerateRequest,
  ToolReviewRequest,
  ToolSolution,
  ToolVote,
} from './tool-adapter.js';

/**
 * Gemini API endpoint for generating content
 */
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * GeminiAdapter - Adapter for Google Gemini API
 *
 * Provides integration with Google's Gemini models for code generation
 * and review tasks within the consensus-coder system.
 *
 * @example
 * ```typescript
 * const gemini = new GeminiAdapter('reviewer');
 * await gemini.initialize({ name: 'gemini', apiKey: 'your-api-key' });
 *
 * if (await gemini.isAvailable()) {
 *   const vote = await gemini.reviewSolutions(request);
 * }
 * ```
 */
export class GeminiAdapter extends BaseAdapter {
  /**
   * API key for Gemini API authentication
   * @private
   */
  private apiKey: string | null = null;

  /**
   * Gemini model to use for generation
   * @private
   */
  private model: string = 'gemini-2.0-flash';

  /**
   * Temperature for response generation
   * @private
   */
  private temperature: number = 0.7;

  /**
   * Timeout for API calls in milliseconds
   * @private
   */
  private timeout: number = 60000;

  /**
   * Create a new GeminiAdapter instance
   *
   * @param role - The role this adapter plays ('context-engine' or 'reviewer')
   */
  constructor(role: ToolRole = 'reviewer') {
    super('gemini', role);
  }

  /**
   * Initialize the adapter with configuration
   *
   * Sets up API key, model, temperature, and timeout from config or environment.
   *
   * @param config - Configuration options for the adapter
   */
  async initialize(config: ToolConfig): Promise<void> {
    // Set API key from config or environment variable
    this.apiKey = config.apiKey ?? process.env.GEMINI_API_KEY ?? null;

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

    // Call parent initialize
    await super.initialize(config);
  }

  /**
   * Check if the adapter is available and ready for use
   *
   * @returns True if the API key is configured, false otherwise
   * @protected
   */
  protected async doIsAvailable(): Promise<boolean> {
    // For now, just check if API key is set
    // Could optionally make a test API call here
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /**
   * Generate solutions for a given problem
   *
   * @param request - The generation request with problem and context
   * @returns Array of generated solutions
   * @protected
   */
  protected async doGenerateSolutions(request: ToolGenerateRequest): Promise<ToolSolution[]> {
    const prompt = this.buildGeneratePrompt(request);
    const response = await this.callGeminiAPI(prompt);
    return this.parseGenerateSolutionsOutput(response);
  }

  /**
   * Review solutions and provide a vote
   *
   * @param request - The review request with problem, context, and solutions
   * @returns A vote with scores and reasoning
   * @protected
   */
  protected async doReviewSolutions(request: ToolReviewRequest): Promise<ToolVote> {
    const prompt = this.buildReviewPrompt(request);
    const response = await this.callGeminiAPI(prompt);
    const solutionIds = request.solutions.map((s) => s.solutionId);
    return this.parseReviewOutput(response, solutionIds);
  }

  /**
   * Build a prompt for solution generation
   *
   * @param request - The generation request
   * @returns Formatted prompt string
   * @private
   */
  private buildGeneratePrompt(request: ToolGenerateRequest): string {
    const numSolutions = request.numSolutions ?? 3;
    const constraintsText = request.constraints?.length
      ? `\n\nConstraints:\n${request.constraints.map((c) => `- ${c}`).join('\n')}`
      : '';
    const previousRoundText = request.previousRoundSynthesis
      ? `\n\nPrevious Round Synthesis:\n${request.previousRoundSynthesis}`
      : '';

    return `You are an expert software engineer. Generate ${numSolutions} distinct solutions for the following problem.

## Problem
${request.problem}

## Codebase Context
${request.context}${constraintsText}${previousRoundText}

## Instructions
Generate exactly ${numSolutions} different solutions. For each solution, provide a JSON object with these fields:
- solutionId: unique identifier (format: gemini-{timestamp}-{index})
- name: short descriptive name (< 100 chars)
- description: 2-3 sentences explaining the approach (< 500 chars)
- code: the implementation code
- language: programming language (lowercase)
- rationale: why this approach was chosen (< 2000 chars)
- complexity: { time: "O(...)", space: "O(...)" }
- tradeoffs: array of trade-off strings
- risks: array of potential risk strings
- confidence: number 0-100

Respond with a JSON array of ${numSolutions} solution objects. Do not include any text outside the JSON.`;
  }

  /**
   * Build a prompt for solution review
   *
   * @param request - The review request
   * @returns Formatted prompt string
   * @private
   */
  private buildReviewPrompt(request: ToolReviewRequest): string {
    const solutionsText = request.solutions
      .map(
        (s, i) => `### Solution ${i + 1}: ${s.name} (ID: ${s.solutionId})
Description: ${s.description}
Language: ${s.language}
Complexity: Time ${s.complexity.time}, Space ${s.complexity.space}
Rationale: ${s.rationale}

\`\`\`${s.language}
${s.code}
\`\`\`
`
      )
      .join('\n');

    const previousReviewsText = request.previousReviews?.length
      ? `\n\nPrevious Reviews:\n${request.previousReviews.map((r) => `- ${r.voterId}: Selected ${r.selectedSolutionId} (confidence: ${r.confidence})`).join('\n')}`
      : '';

    return `You are an expert code reviewer. Evaluate the following solutions and select the best one.

## Problem
${request.problem}

## Codebase Context
${request.context}

## Solutions to Review
${solutionsText}${previousReviewsText}

## Instructions
Review all solutions and provide your vote as a JSON object with these fields:
- voterId: "gemini"
- selectedSolutionId: the solutionId of your chosen solution
- confidence: number 0-100
- reasoning: detailed explanation of your selection (< 2000 chars)
- concerns: array of concerns about the selected solution
- suggestions: array of improvement suggestions
- scores: object mapping each solutionId to a score (1-10)

Respond with a single JSON object. Do not include any text outside the JSON.`;
  }

  /**
   * Make an API call to Gemini and return the response text
   *
   * @param prompt - The prompt to send to Gemini
   * @returns The response text from Gemini
   * @private
   */
  private async callGeminiAPI(prompt: string): Promise<string> {
    // TODO: Replace this mock implementation with actual Gemini API call
    // The real implementation would use fetch() to call:
    // `${GEMINI_API_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`
    //
    // Example real implementation:
    // const url = `${GEMINI_API_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;
    // const response = await fetch(url, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     contents: [{ parts: [{ text: prompt }] }],
    //     generationConfig: { temperature: this.temperature }
    //   }),
    //   signal: AbortSignal.timeout(this.timeout)
    // });
    // const data = await response.json();
    // return data.candidates[0].content.parts[0].text;

    // Mock implementation - simulate a response for testing
    console.log(`[GeminiAdapter] Mock API call with model: ${this.model}, temperature: ${this.temperature}`);
    void prompt; // Acknowledge prompt parameter
    void GEMINI_API_BASE_URL; // Acknowledge constant to avoid unused warning

    // Return a mock response based on whether this looks like a generate or review request
    if (prompt.includes('Generate') && prompt.includes('solutions')) {
      return JSON.stringify([
        {
          solutionId: `gemini-${Date.now()}-0`,
          name: 'Mock Solution',
          description: 'A mock solution generated for testing purposes.',
          code: '// Mock implementation\nfunction solve() { return true; }',
          language: 'typescript',
          rationale: 'This is a mock solution for testing the adapter.',
          complexity: { time: 'O(1)', space: 'O(1)' },
          tradeoffs: ['This is a mock - no real tradeoffs'],
          risks: ['This is a mock - no real risks'],
          confidence: 75,
        },
      ]);
    } else {
      // Review response
      return JSON.stringify({
        voterId: 'gemini',
        selectedSolutionId: 'mock-solution-id',
        confidence: 80,
        reasoning: 'Mock review response for testing.',
        concerns: ['This is a mock review'],
        suggestions: ['Replace with real implementation'],
        scores: { 'mock-solution-id': 8 },
      });
    }
  }

  /**
   * Parse LLM output into ToolSolution objects
   *
   * @param output - Raw output string from Gemini
   * @returns Array of parsed ToolSolution objects
   * @private
   */
  private parseGenerateSolutionsOutput(output: string): ToolSolution[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as ToolSolution[];

      // Validate and ensure all required fields are present
      return parsed.map((solution, index) => ({
        solutionId: solution.solutionId || `gemini-${Date.now()}-${index}`,
        name: solution.name || `Solution ${index + 1}`,
        description: solution.description || '',
        code: solution.code || '',
        language: solution.language || 'typescript',
        rationale: solution.rationale || '',
        complexity: solution.complexity || { time: 'O(?)', space: 'O(?)' },
        tradeoffs: solution.tradeoffs || [],
        risks: solution.risks || [],
        confidence: typeof solution.confidence === 'number' ? solution.confidence : 50,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse generate solutions output: ${message}`);
    }
  }

  /**
   * Parse LLM output into a ToolVote object
   *
   * @param output - Raw output string from Gemini
   * @param solutionIds - List of valid solution IDs for validation
   * @returns Parsed ToolVote object
   * @private
   */
  private parseReviewOutput(output: string, solutionIds: string[]): ToolVote {
    try {
      // Try to extract JSON from the response
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as ToolVote;

      // Validate selectedSolutionId if solutionIds provided
      const selectedId = parsed.selectedSolutionId || solutionIds[0] || '';
      if (solutionIds.length > 0 && !solutionIds.includes(selectedId)) {
        // Fall back to first solution if selected ID is invalid
        parsed.selectedSolutionId = solutionIds[0];
      }

      // Ensure all required fields are present
      return {
        voterId: 'gemini',
        selectedSolutionId: parsed.selectedSolutionId || solutionIds[0] || '',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
        reasoning: parsed.reasoning || '',
        concerns: parsed.concerns || [],
        suggestions: parsed.suggestions || [],
        scores: parsed.scores || {},
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse review output: ${message}`);
    }
  }
}
