# Consensus Coder Skill

[![npm version](https://badge.fury.io/js/@clawdbot%2Fconsensus-coder-skill.svg)](https://www.npmjs.com/package/@clawdbot/consensus-coder-skill)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Multi-model consensus coding workflow** — Orchestrated AI deliberation for generating high-quality code through structured debate.

## Overview

Consensus Coder leverages multiple AI models to debate and reach consensus on complex coding challenges. By combining the strengths of different models (Claude Opus for diagnosis, Gemini + Codex for review), the skill produces more robust, well-reasoned solutions than any single model could generate alone.

### Key Features

- 🤖 **Multi-Model Orchestration** — Coordinates multiple AI models in structured debate
- 🎯 **Consensus-Driven** — Iterates until models agree (or escalates for human review)
- 💾 **State Persistence** — Full debate state saved to disk for recovery and audit
- 🔄 **Automatic Retry** — Handles transient failures and rate limits gracefully
- 🛠️ **Implementation Execution** — Converts consensus decisions into working code via Auggie
- 📊 **Comprehensive Logging** — Track every decision point and voting outcome
- ⚙️ **Highly Configurable** — Tune debate rounds, voting thresholds, timeouts

## Installation

### Via npm

```bash
npm install @clawdbot/consensus-coder-skill
```

### Via Clawdbot Skill Manager

```bash
clawdbot skill install consensus-coder
```

### From Source

```bash
git clone https://github.com/clawdbot/consensus-coder-skill.git
cd consensus-coder-skill
npm install
npm run build
```

## Quick Start

### Basic Usage

```typescript
import { ConsensusCoder } from '@clawdbot/consensus-coder-skill';

// Initialize the skill
const coder = new ConsensusCoder({
  workspace: './debate-workspace',
  debug: true,
});

// Start a new consensus debate
const result = await coder.startConsensus({
  problem: 'Design an efficient algorithm to merge K sorted linked lists',
  context: {
    constraints: 'Time: O(n log k), Space: O(1)',
    language: 'TypeScript',
  },
});

console.log('Debate started:', result.debateId);

// Poll for completion
let status = await coder.getDebateStatus(result.debateId);
while (status.status === 'in_progress') {
  console.log(`Round ${status.iteration}: uncertainty=${status.uncertaintyLevel}`);
  await new Promise(r => setTimeout(r, 5000)); // Wait 5s
  status = await coder.getDebateStatus(result.debateId);
}

// Get final result
const finalResult = await coder.getConsensusResult(result.debateId);
console.log('Winner:', finalResult.winningApproach);
console.log('Confidence:', finalResult.confidence);
```

## Architecture

### Components

| Component | Purpose |
|-----------|---------|
| **ConsensusOrchestrator** | Manages the debate workflow (rounds, voting, convergence) |
| **SynthesisEngine** | Aggregates model votes and scores approaches |
| **StateStore** | Persists debate state to disk for recovery |
| **RetryOrchestrator** | Handles transient failures and rate limits |
| **ImplementationPlanGenerator** | Converts consensus decisions to actionable tasks |
| **AuggieRelay** | Executes implementation tasks via Auggie agent |

### Workflow

```
1. Problem Intake
   ↓
2. Opus Diagnosis → 3 Proposed Approaches
   ↓
3. Round Loop (max 5 iterations)
   ├─ Gemini reviews approach A, votes
   ├─ Codex reviews approach B, votes
   ├─ Synthesis: Calculate confidence & winner
   └─ Continue if uncertainty > threshold
   ↓
4. Convergence Decision
   ├─ If consensus reached: Move to implementation
   └─ If uncertain: Escalate to human review
   ↓
5. Plan Generation
   ├─ Convert winning approach to implementation steps
   └─ Organize into task graph
   ↓
6. Auggie Implementation
   ├─ Execute tasks in dependency order
   └─ Generate working code
   ↓
7. Report & Archive
```

## API Reference

### Class: ConsensusCoder

Main skill class. Manages the complete consensus workflow.

#### Constructor

```typescript
constructor(options?: ConsensusCoderOptions)
```

**Options:**
- `workspace` (string, optional) — Working directory for skill state
  - Default: `~/.clawdbot/consensus-coder`
- `debug` (boolean, optional) — Enable debug logging
  - Default: `false`
- `config` (ConsensusCoderConfig, optional) — Full configuration override
  - Default: Load from `consensus-coder.config.json`

#### Methods

##### startConsensus

```typescript
startConsensus(request: ConsensusRequest): Promise<StartConsensusResponse>
```

Start a new consensus debate.

**Parameters:**
- `request.problem` — The coding problem to solve
- `request.context` — Additional context (constraints, language, etc.)
- `request.maxRounds` — Maximum debate rounds (default: 5)
- `request.convergenceThreshold` — Certainty required to converge (default: 0.85)

**Returns:**
```typescript
{
  debateId: string;      // Unique debate identifier
  status: 'started' | 'error';
  message: string;
  timestamp: Date;
}
```

##### getDebateStatus

```typescript
getDebateStatus(debateId: string): Promise<DebateStatusResponse>
```

Get the current status of an ongoing debate.

**Returns:**
```typescript
{
  debateId: string;
  status: 'pending' | 'in_progress' | 'converged' | 'escalated' | 'not_found';
  iteration: number;
  lastUpdate: Date;
  votingScore?: number;
  uncertaintyLevel?: number;
  winningApproach?: string;
  estimatedTimeRemainingMs?: number;
}
```

##### getConsensusResult

```typescript
getConsensusResult(debateId: string): Promise<ConsensusResult>
```

Retrieve the final consensus result.

**Returns:**
```typescript
{
  debateId: string;
  winningApproach: string;
  confidence: number;
  iterations: number;
  totalTimeMs: number;
  approaches: ApproachDetail[];
  votes: VoteHistory[];
  escalated: boolean;
}
```

##### executeImplementation

```typescript
executeImplementation(
  debateId: string,
  options?: ImplementationOptions
): Promise<ImplementationResult>
```

Convert the winning approach into an implementation plan and execute it via Auggie.

**Returns:**
```typescript
{
  debateId: string;
  status: 'success' | 'partial' | 'failed';
  generatedCode: string;
  generatedFiles: string[];
  executionTimeMs: number;
}
```

### Type: ConsensusCoderConfig

```typescript
interface ConsensusCoderConfig {
  // Debate behavior
  maxRounds: number;                  // Max consensus rounds (default: 5)
  convergenceThreshold: number;       // Certainty to converge (default: 0.85)
  votingWeights: Record<string, number>; // Model voting weights
  
  // Timeouts
  debateTimeoutMs: number;           // Max total debate time
  roundTimeoutMs: number;            // Max time per round
  
  // API configuration
  models: {
    diagnosis: string;               // Model for initial diagnosis (Opus)
    reviewer1: string;               // First reviewer (Gemini)
    reviewer2: string;               // Second reviewer (Codex)
  };
  
  // Persistence
  persistenceDir: string;            // Where to save state
  retentionDays: number;             // Keep debates for N days
}
```

## Configuration

### Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
# Clawdbot
CLAWDBOT_WORKSPACE=~/.clawdbot

# API Keys (if using external models)
ANTHROPIC_API_KEY=sk-...
GOOGLE_AI_API_KEY=sk-...
OPENAI_API_KEY=sk-...

# Debate Configuration
CONSENSUS_MAX_ROUNDS=5
CONSENSUS_CONVERGENCE_THRESHOLD=0.85
CONSENSUS_DEBATE_TIMEOUT_MS=300000
CONSENSUS_ROUND_TIMEOUT_MS=60000

# Persistence
CONSENSUS_PERSISTENCE_DIR=~/.clawdbot/consensus-coder/debates
CONSENSUS_RETENTION_DAYS=30
```

### Config File

Edit `consensus-coder.config.json`:

```json
{
  "maxRounds": 5,
  "convergenceThreshold": 0.85,
  "votingWeights": {
    "gemini": 1.0,
    "codex": 1.0,
    "opus": 1.5
  },
  "debateTimeoutMs": 300000,
  "roundTimeoutMs": 60000,
  "models": {
    "diagnosis": "claude-opus",
    "reviewer1": "gemini-pro",
    "reviewer2": "gpt-4"
  },
  "persistenceDir": "~/.clawdbot/consensus-coder/debates",
  "retentionDays": 30
}
```

## Examples

### Example 1: Solve an Algorithm Problem

```typescript
import { ConsensusCoder } from '@clawdbot/consensus-coder-skill';

const coder = new ConsensusCoder();

const result = await coder.startConsensus({
  problem: 'Implement a binary search tree with in-order traversal',
  context: {
    language: 'TypeScript',
    constraints: 'Must handle duplicate values',
    performanceTarget: 'O(log n) average case',
  },
});

// Wait for completion
let status = await coder.getDebateStatus(result.debateId);
while (status.status !== 'converged') {
  console.log(`Round ${status.iteration}...`);
  await new Promise(r => setTimeout(r, 10000));
  status = await coder.getDebateStatus(result.debateId);
}

// Execute the winning solution
const impl = await coder.executeImplementation(result.debateId);
console.log('Generated code:\n', impl.generatedCode);
```

### Example 2: Refactor Existing Code

```typescript
const coder = new ConsensusCoder();

const existingCode = `
function sort(arr) {
  for (let i = 0; i < arr.length; i++) {
    for (let j = i; j < arr.length; j++) {
      if (arr[j] < arr[i]) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
  }
  return arr;
}
`;

const result = await coder.startConsensus({
  problem: 'Refactor this sorting function for better performance',
  context: {
    language: 'JavaScript',
    existingCode,
    constraints: 'In-place sort, stable sort preferred',
  },
});

// ... wait for consensus ...

const impl = await coder.executeImplementation(result.debateId);
```

### Example 3: Architecture Decision

```typescript
const coder = new ConsensusCoder({
  debug: true, // See detailed voting process
});

const result = await coder.startConsensus({
  problem: 'Design data structure for LRU cache with O(1) operations',
  context: {
    language: 'Python',
    constraints: [
      'Capacity: configurable',
      'Get/Put: O(1) average case',
      'Thread-safe implementation',
    ],
  },
});

// Poll with shorter interval to see voting in action
for (let i = 0; i < 30; i++) {
  const status = await coder.getDebateStatus(result.debateId);
  console.log(`[${new Date().toISOString()}] Round ${status.iteration}: `
    + `uncertainty=${status.uncertaintyLevel?.toFixed(2)}`);
  
  if (status.status !== 'in_progress') break;
  await new Promise(r => setTimeout(r, 2000));
}

const finalResult = await coder.getConsensusResult(result.debateId);
console.log('\nWinning Approach:', finalResult.winningApproach);
console.log('Confidence:', (finalResult.confidence * 100).toFixed(1) + '%');
console.log('Votes:', finalResult.votes);
```

## CLI Usage

The skill includes a CLI for interactive use:

```bash
# Start interactive consensus on a problem
npm start -- --problem "Design a rate limiter"

# Check status of an existing debate
npm start -- --status <debateId>

# Get final result
npm start -- --result <debateId>

# Run in debug mode
npm start -- --problem "..." --debug

# Show version
npm start -- --version

# Show help
npm start -- --help
```

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Advanced Topics

### Custom Voting Weights

Increase the weight of certain models in voting:

```typescript
const config: ConsensusCoderConfig = {
  // ...
  votingWeights: {
    'claude-opus': 1.5,    // Trust Opus 50% more
    'gemini': 1.0,
    'gpt-4': 0.9,          // Trust GPT-4 a bit less
  },
};
```

### Custom Convergence Logic

Override the convergence criteria:

```typescript
const orchestrator = new ConsensusOrchestrator({
  // ...
  convergenceThreshold: 0.95, // Require higher confidence
});
```

### Error Recovery

The skill includes automatic retry with exponential backoff:

```typescript
const orchestrator = new ConsensusOrchestrator({
  // ...
  retryPolicy: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    backoffMultiplier: 2,
    timeoutMs: 30000,
  },
});
```

### Custom Implementation Planner

Extend the plan generation:

```typescript
class CustomPlanGenerator extends ImplementationPlanGenerator {
  protected generateTasks(approach: string): ImplementationTask[] {
    // Custom task generation logic
    return super.generateTasks(approach);
  }
}
```

## Performance Characteristics

- **Average debate time**: 30-90 seconds (5 rounds, 2 reviewers)
- **Memory usage**: ~50MB for typical workloads
- **Disk usage**: ~1MB per debate (state + logs)
- **Model API calls**: ~15-20 per debate (1 diagnosis + 5 rounds × 2 reviewers + synthesis)

## Troubleshooting

### Debates Not Converging

**Symptom**: Debates hit max rounds without consensus

**Solution**:
1. Check `convergenceThreshold` — may be too strict
2. Verify model weights are balanced
3. Look at `debug` logs to see disagreement patterns
4. Try increasing `maxRounds`

### Timeout Errors

**Symptom**: `ETIMEDOUT` or `ROUND_TIMEOUT`

**Solution**:
1. Increase `debateTimeoutMs` and `roundTimeoutMs`
2. Check network connectivity
3. Monitor API rate limits
4. Enable debug mode to see which round times out

### State Corruption

**Symptom**: `Error loading debate state`

**Solution**:
1. Clear `~/.clawdbot/consensus-coder/debates/`
2. Restart the skill
3. Check disk permissions
4. Review logs in `debug` mode

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — See [LICENSE](LICENSE) for details.

## Support

- **GitHub Issues**: [Report bugs](https://github.com/clawdbot/consensus-coder-skill/issues)
- **Documentation**: [Full docs](https://clawdbot.dev/skills/consensus-coder)
- **Clawdbot Community**: [Discord](https://discord.gg/clawdbot)

## Changelog

### v1.0.0 (2024-01-30)

- ✅ Initial release
- ✅ Multi-model orchestration
- ✅ Consensus-driven debate
- ✅ State persistence
- ✅ Automatic retry handling
- ✅ Implementation execution via Auggie
- ✅ CLI interface
- ✅ Comprehensive testing

---

**Built with ❤️ by Claude Opus (architecture) and Auggie (implementation)**
