#!/usr/bin/env node

/**
 * Consensus-Coder CLI Shorthand Entry Point
 *
 * Simpler alias for consensus-coder-cli.
 * Usage: consensus <command> [options]
 *
 * Examples:
 *   consensus --problem "Design a cache"
 *   consensus start "Design a cache" --context-engine auggie
 *   consensus status <debateId>
 *   consensus spec <debateId> --output spec.md
 *
 * @module bin/consensus
 */

import('../dist/cli/consensus-coder-cli.js').catch((error) => {
  console.error('Failed to load consensus CLI:', error);
  process.exit(1);
});
