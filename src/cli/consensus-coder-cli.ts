/**
 * Consensus-Coder CLI - Command-Line Interface
 *
 * Provides CLI commands for interacting with the consensus-coder skill.
 *
 * Commands:
 * 1. start <problem> [context]     - Start a new consensus debate
 * 2. status <debateId>             - Check debate progress
 * 3. history <debateId>            - Show full debate history
 * 4. implement <debateId>          - Generate and execute implementation plan
 * 5. list [--limit N]              - List all saved debates
 *
 * @module cli/consensus-coder-cli
 * @version 1.0
 * @author Auggie (implementation)
 */

import * as yargs from 'yargs';
import chalk from 'chalk';
import { table } from 'table';
import * as readline from 'readline';
import { ConsensusCoder, createConsensusCoder } from '../consensus-coder.skill.js';
import { StateStore } from '../persistence/state-store.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface CLIContext {
  coder: ConsensusCoder;
  store: StateStore;
  debug: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Initialize the CLI context (creates ConsensusCoder instance)
 */
async function initializeContext(debug: boolean = false): Promise<CLIContext> {
  try {
    const coder = await createConsensusCoder({ debug });
    const store = new StateStore();
    return { coder, store, debug };
  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize consensus-coder:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Format a date for display
 */
function formatDate(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return date.toLocaleString();
}

/**
 * Prompt user for confirmation (yes/no)
 */
function promptConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${question} (yes/no): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Display a section header
 */
function printHeader(title: string): void {
  console.log('\n' + chalk.cyan('═'.repeat(60)));
  console.log(chalk.cyan.bold(`  ${title}`));
  console.log(chalk.cyan('═'.repeat(60)));
}

/**
 * Display an info message
 */
function printInfo(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Display a success message
 */
function printSuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

/**
 * Display a warning message
 */
function printWarning(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

/**
 * Display an error message
 */
function printError(message: string): void {
  console.log(chalk.red('✗'), message);
}

/**
 * Format debate status with color
 */
function formatStatus(status: string): string {
  switch (status) {
    case 'pending':
      return chalk.yellow(status);
    case 'in_progress':
      return chalk.blue(status);
    case 'converged':
      return chalk.green(status);
    case 'escalated':
      return chalk.red(status);
    default:
      return chalk.gray(status);
  }
}

/**
 * Wait for a debate to complete (polling)
 */
async function waitForDebateCompletion(ctx: CLIContext, debateId: string, maxWaitMs: number = 300000): Promise<boolean> {
  const pollIntervalMs = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const status = await ctx.coder.getDebateStatus(debateId);

    if (status.status === 'converged' || status.status === 'escalated') {
      return true;
    }

    process.stdout.write(chalk.gray(`  Waiting for debate... Round ${status.iteration} `) + '\r');
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  printWarning('Debate polling timeout - debate may still be running in background');
  return false;
}

// ============================================================================
// COMMAND: START
// ============================================================================

async function commandStart(argv: any, ctx: CLIContext): Promise<void> {
  const problem: string = argv.problem;
  const context: string | undefined = argv.context;
  const interactive: boolean = argv.interactive || false;
  const silent: boolean = argv.silent || false;

  if (!silent) {
    printHeader('Starting Consensus Debate');
    printInfo(`Problem: ${problem.substring(0, 100)}${problem.length > 100 ? '...' : ''}`);
    if (context) {
      printInfo(`Context: ${context.substring(0, 100)}${context.length > 100 ? '...' : ''}`);
    }
  }

  try {
    const debateId = await ctx.coder.startConsensus(problem, context);

    if (!silent) {
      printSuccess(`Debate started successfully`);
      console.log(chalk.bold(`Debate ID: ${chalk.cyan(debateId)}`));
    } else {
      console.log(debateId);
      return;
    }

    if (interactive) {
      printInfo('Entering interactive mode (Ctrl+C to exit)...\n');
      await waitForDebateCompletion(ctx, debateId);

      const finalStatus = await ctx.coder.getDebateStatus(debateId);
      printSuccess(`Debate completed with status: ${formatStatus(finalStatus.status)}`);
      console.log(`  Iterations: ${finalStatus.iteration}`);
      console.log(`  Voting score: ${finalStatus.votingScore}%`);
      console.log(`  Uncertainty: ${finalStatus.uncertaintyLevel}%`);
      if (finalStatus.winningApproach) {
        console.log(`  Winning approach: ${finalStatus.winningApproach}`);
      }
    }
  } catch (error) {
    printError(`Failed to start debate: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// ============================================================================
// COMMAND: STATUS
// ============================================================================

async function commandStatus(argv: any, ctx: CLIContext): Promise<void> {
  const debateId: string = argv.debateId;

  printHeader('Debate Status');

  try {
    const status = await ctx.coder.getDebateStatus(debateId);

    if (status.status === 'not_found') {
      printError(`Debate not found: ${debateId}`);
      process.exit(1);
    }

    const statusData = [
      ['Property', 'Value'],
      ['Debate ID', chalk.cyan(debateId)],
      ['Status', formatStatus(status.status)],
      ['Iteration', String(status.iteration)],
      ['Last Update', formatDate(status.lastUpdate)],
      ['Voting Score', status.votingScore ? `${status.votingScore}%` : 'N/A'],
      ['Uncertainty Level', status.uncertaintyLevel ? `${status.uncertaintyLevel}%` : 'N/A'],
      ['Winning Approach', status.winningApproach || 'Not yet determined'],
      [
        'Est. Time Remaining',
        status.estimatedTimeRemainingMs ? `${(status.estimatedTimeRemainingMs / 1000).toFixed(1)}s` : 'Unknown',
      ],
    ];

    const tableOutput = table(statusData, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼',
      },
    });

    console.log(tableOutput);
  } catch (error) {
    printError(`Failed to get debate status: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// ============================================================================
// COMMAND: HISTORY
// ============================================================================

async function commandHistory(argv: any, ctx: CLIContext): Promise<void> {
  const debateId: string = argv.debateId;

  printHeader('Debate History');

  try {
    const debateState = await ctx.coder.getDebateHistory(debateId);

    if (!debateState) {
      printError(`Debate not found: ${debateId}`);
      process.exit(1);
    }

    // Print metadata
    console.log(chalk.bold('Metadata:'));
    console.log(`  Debate ID: ${chalk.cyan(debateId)}`);
    console.log(`  Problem: ${debateState.problemStatement.substring(0, 80)}${debateState.problemStatement.length > 80 ? '...' : ''}`);
    console.log(`  Created: ${formatDate(debateState.createdAt)}`);
    console.log(`  Rounds: ${debateState.currentRound}/${debateState.maxRounds}`);
    console.log(`  Status: ${debateState.isConverged ? chalk.green('Converged') : chalk.yellow('In Progress')}`);

    // Print each round
    if (debateState.rounds.length === 0) {
      printInfo('No rounds completed yet');
      return;
    }

    debateState.rounds.forEach((round, index) => {
      console.log(`\n${chalk.blue.bold(`Round ${index + 1}:`)}`);
      console.log(`  Timestamp: ${formatDate(round.timestamp)}`);

      // Show model proposals/critiques
      console.log(chalk.dim('  Model Responses:'));
      const opusCode = round.opusProposal.solution?.code || round.opusProposal.content;
      const geminiCode = round.geminiCritique.critique ? 'Critique received' : round.geminiCritique.content;
      const codexCode = round.codexRefinement.refinement?.finalCode || round.codexRefinement.content;
      
      console.log(`    - Opus: "${opusCode.substring(0, 50)}${opusCode.length > 50 ? '...' : ''}"`);
      console.log(`    - Gemini: "${geminiCode.substring(0, 50)}${geminiCode.length > 50 ? '...' : ''}"`);
      console.log(`    - Codex: "${codexCode.substring(0, 50)}${codexCode.length > 50 ? '...' : ''}"`);
    });

    // Show final code solution if converged
    if (debateState.isConverged && debateState.consensusSolution) {
      console.log(`\n${chalk.green.bold('Consensus Solution:')}`);
      console.log(chalk.dim('Generated code:'));
      console.log('  ' + debateState.consensusSolution.code.substring(0, 100) + (debateState.consensusSolution.code.length > 100 ? '...' : ''));
    }
  } catch (error) {
    printError(`Failed to get debate history: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// ============================================================================
// COMMAND: IMPLEMENT
// ============================================================================

async function commandImplement(argv: any, ctx: CLIContext): Promise<void> {
  const debateId: string = argv.debateId;
  const dryRun: boolean = argv['dry-run'] || false;
  const timeout: number = argv.timeout || 30000;

  printHeader('Implementation Plan Generation');

  try {
    // Check if debate is converged
    const status = await ctx.coder.getDebateStatus(debateId);
    if (status.status !== 'converged') {
      printWarning(`Debate is not yet converged (status: ${status.status})`);
      const confirmed = await promptConfirm('Continue anyway?');
      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }
    }

    printInfo('Generating implementation plan...');

    const result = await ctx.coder.executeImplementation(debateId);

    if (result.status === 'success' || result.status === 'partial') {
      printSuccess(`Plan ${result.status === 'success' ? 'generated and executed' : 'generated but execution incomplete'}`);

      console.log(chalk.bold('\nGenerated Code:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(result.generatedCode);
      console.log(chalk.gray('─'.repeat(60)));
    } else {
      printError(`Implementation failed`);
      process.exit(1);
    }
  } catch (error) {
    printError(`Failed to generate implementation: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// ============================================================================
// COMMAND: LIST
// ============================================================================

async function commandList(argv: any, ctx: CLIContext): Promise<void> {
  const limit: number = argv.limit || 10;

  printHeader('Saved Debates');

  try {
    const debates = await ctx.store.listDebates();

    if (debates.length === 0) {
      printInfo('No debates found');
      return;
    }

    // Sort by most recent first and limit
    const sorted = debates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);

    // Build table data
    const tableData: string[][] = [
      ['Debate ID', 'Status', 'Iteration', 'Created', 'Updated'],
      ...sorted.map((debate) => [
        chalk.cyan(debate.debateId.substring(0, 16)),
        formatStatus(debate.status),
        String(debate.iteration),
        formatDate(debate.createdAt),
        formatDate(debate.lastUpdated),
      ]),
    ];

    const tableOutput = table(tableData, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼',
      },
    });

    console.log(tableOutput);
    console.log(`\nShowing ${sorted.length} of ${debates.length} debates (limited to ${limit})`);
  } catch (error) {
    printError(`Failed to list debates: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// ============================================================================
// CLI BUILDER
// ============================================================================

/**
 * Build and run the yargs CLI
 */
async function main(): Promise<void> {
  const ctx = await initializeContext(process.env.DEBUG === 'true');

  yargs
    .command(
      'start <problem> [context]',
      'Start a new consensus debate',
      (yargs) =>
        yargs
          .positional('problem', {
            describe: 'The coding problem to solve',
            type: 'string',
          })
          .positional('context', {
            describe: 'Optional additional context',
            type: 'string',
          })
          .option('context', {
            alias: 'c',
            describe: 'Additional context (alternative to positional)',
            type: 'string',
          })
          .option('interactive', {
            alias: 'i',
            describe: 'Watch progress live (blocks until complete)',
            type: 'boolean',
            default: false,
          })
          .option('silent', {
            alias: 's',
            describe: 'Only output the debate ID',
            type: 'boolean',
            default: false,
          }),
      (argv) => commandStart(argv as any, ctx),
    )
    .command(
      'status <debateId>',
      'Check debate progress',
      (yargs) =>
        yargs.positional('debateId', {
          describe: 'The debate ID to check',
          type: 'string',
        }),
      (argv) => commandStatus(argv as any, ctx),
    )
    .command(
      'history <debateId>',
      'Show full debate history',
      (yargs) =>
        yargs.positional('debateId', {
          describe: 'The debate ID',
          type: 'string',
        }),
      (argv) => commandHistory(argv as any, ctx),
    )
    .command(
      'implement <debateId>',
      'Generate and execute implementation plan',
      (yargs) =>
        yargs
          .positional('debateId', {
            describe: 'The debate ID',
            type: 'string',
          })
          .option('dry-run', {
            describe: 'Show plan without executing',
            type: 'boolean',
            default: false,
          })
          .option('timeout', {
            describe: 'Execution timeout in milliseconds',
            type: 'number',
            default: 30000,
          }),
      (argv) => commandImplement(argv as any, ctx),
    )
    .command(
      'list',
      'List all saved debates',
      (yargs) =>
        yargs.option('limit', {
          alias: 'l',
          describe: 'Maximum debates to show',
          type: 'number',
          default: 10,
        }),
      (argv) => commandList(argv as any, ctx),
    )
    .option('debug', {
      alias: 'd',
      describe: 'Enable debug logging',
      type: 'boolean',
      global: true,
    })
    .option('help', {
      alias: 'h',
      describe: 'Show help',
    })
    .version('1.0.0')
    .strict()
    .parseSync();
}

// ============================================================================
// EXPORTS & EXECUTION
// ============================================================================

export {
  initializeContext,
  commandStart,
  commandStatus,
  commandHistory,
  commandImplement,
  commandList,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
  printError,
};

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}
