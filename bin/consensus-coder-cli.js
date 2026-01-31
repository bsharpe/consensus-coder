#!/usr/bin/env node

/**
 * Consensus-Coder CLI Bin Entry Point
 *
 * Executable script to run consensus-coder CLI from command line.
 * Usage: consensus-coder-cli <command> [options]
 *
 * @module bin/consensus-coder-cli
 */

import('../dist/cli/consensus-coder-cli.js').catch((error) => {
  console.error('Failed to load consensus-coder CLI:', error);
  process.exit(1);
});
