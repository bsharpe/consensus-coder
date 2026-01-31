# Agent Guide: Using Consensus-Coder

This document is for AI agents integrating consensus-coder into their workflows.

## What This Tool Does

Consensus-Coder solves **architectural complexity** by orchestrating multiple AI coding tools to debate and reach consensus on difficult design decisions. Instead of a single tool deciding in isolation, this system:

1. **Understands your codebase** (context engine analyzes actual code)
2. **Generates 3 solution approaches** (grounded in your real architecture)
3. **Gets independent evaluations** (multiple reviewers vote on solutions)
4. **Produces a spec** (detailed markdown document ready for implementation)

You don't implement directly—you get a vetted specification that any implementation agent can use.

## When to Use This

**Use consensus-coder when:**
- Making architectural decisions (cache design, authentication strategy, API redesign)
- Complex refactoring (large module restructuring, tech stack changes)
- You want multiple perspectives before committing to an approach
- The problem involves tradeoffs (speed vs. memory, simplicity vs. power)
- You need to justify your decision (spec documents the reasoning)

**Don't use consensus-coder when:**
- The problem is straightforward (simple bug fix, obvious implementation)
- You need instant output (consensus takes 30-90 seconds)
- You're in the middle of implementation (consensus is for planning, not mid-flight changes)

## How to Use It

### Scenario A: Get Consensus on Architecture

```typescript
import { ConsensusCoder } from '@clawdbot/consensus-coder-skill';

const coder = new ConsensusCoder({
  workspace: './my-project-debates',
  debug: true, // see voting process
});

const result = await coder.startConsensus({
  problem: 'Design caching layer for user sessions. Need O(1) access, handle cache invalidation, support distributed environment.',
  context: 'Using Elixir/Phoenix, Redis available, need to support 10k concurrent users',
  config: {
    useToolAdapters: true,
    tools: {
      preferredContextEngine: 'auggie', // Auggie understands Elixir/Phoenix
      reviewers: ['gemini', 'codex'],
      votingWeights: {
        auggie: 1.5,  // Weight context engine heavily
        gemini: 1.0,
        codex: 1.0,
      }
    }
  }
});

console.log(`Debate started: ${result}`);
```

### Scenario B: Poll for Results

```typescript
// Check status
let status = await coder.getDebateStatus(result);
while (status.status !== 'converged' && status.status !== 'escalated') {
  console.log(`Round ${status.iteration}: uncertainty = ${status.uncertaintyLevel}%`);
  await sleep(5000);
  status = await coder.getDebateStatus(result);
}

// Get the consensus
const consensus = await coder.getConsensusResult(result);
console.log(`Winner: ${consensus.winningApproach}`);
console.log(`Confidence: ${(consensus.confidence * 100).toFixed(0)}%`);
```

### Scenario C: Get Spec & Implement

```typescript
// Generate the specification
const spec = await coder.getConsensusSpec(result);

// Write to file
import fs from 'fs';
fs.writeFileSync('caching-spec.md', spec);

// Now hand to implementation agent
// The spec contains:
// - Problem statement
// - All 3 proposed approaches with pros/cons
// - Voting history & reasoning
// - Winning approach with detailed explanation
// - Acceptance criteria
// - Implementation guidelines
```

## Understanding the Output Spec

The consensus spec is a **markdown document** designed for implementation agents. It includes:

```markdown
# Consensus Spec: Caching Layer Design

## Problem Statement
Your problem + context, reformulated for clarity

## Proposed Approaches

### Approach A: [Name]
**Pros:**
- [benefits]

**Cons:**
- [tradeoffs]

### Approach B: [Name]
...

## Consensus Decision
**Winner:** Approach [X]
**Confidence:** 92%
**Why:** [Detailed reasoning from reviewers]

## Acceptance Criteria
- [ ] Works with current architecture
- [ ] Handles 10k concurrent users
- [ ] Implements cache invalidation
- [ ] Distributed-ready

## Implementation Guidelines
[Specific technical guidance]

## Example Skeleton
[Code template to start from]
```

**Share this spec with implementation agents:**
```bash
# Any of these work:
claude exec --file caching-spec.md
auggie --instruction-file caching-spec.md
pi --prompt "$(cat caching-spec.md)"
```

## Configuring Tools

The power of consensus-coder is **choosing which tools participate**. Different tools bring different expertise:

### Recommended Setups

**For Elixir/Phoenix Projects:**
```typescript
tools: {
  preferredContextEngine: 'auggie',      // Best Elixir context analysis
  reviewers: ['gemini', 'codex'],        // General + code-specific review
}
```

**For Node/TypeScript Projects:**
```typescript
tools: {
  preferredContextEngine: 'claude-code', // Strong TS knowledge
  reviewers: ['auggie', 'codex'],        // Implementation + code review
}
```

**For Architectural Decisions:**
```typescript
tools: {
  preferredContextEngine: 'pi',          // Excels at system design
  reviewers: ['claude-code', 'auggie'],  // Build & implementation focus
}
```

### Custom Weights

If you trust one tool more, increase its weight:

```typescript
votingWeights: {
  auggie: 2.0,  // Double weight
  gemini: 1.0,
  codex: 1.0,
}
```

A vote from Auggie now counts as 2× a vote from others.

## Interpreting Results

### Convergence Status

| Status | Meaning | Next Step |
|--------|---------|-----------|
| `in_progress` | Still debating | Wait, check back later |
| `converged` | Consensus reached | Call `getConsensusSpec()` |
| `escalated` | Reviewers disagreed | Need human decision or review |
| `timeout` | Took too long | Try simpler problem or increase timeout |

### Confidence Score

- **90%+** → Strong consensus, safe to implement as-is
- **75-90%** → Good consensus, minor concerns worth noting
- **50-75%** → Weak consensus, reviewers had reservations (read rationale)
- **<50%** → Escalated, need human review before implementation

### Reviewing Reviewer Votes

The spec shows each reviewer's reasoning:

```markdown
**Reviewer: Gemini**
- Voted for: Approach B (Redis + local cache)
- Reasoning: "Hybrid approach avoids network latency for common patterns"
- Concerns: "Invalidation becomes complex across distributed nodes"

**Reviewer: Codex**
- Voted for: Approach B (Redis + local cache)
- Reasoning: "Matches existing patterns in codebase"
- Concerns: "None significant"
```

Read these carefully—concerns may affect implementation.

## Error Handling

```typescript
try {
  const result = await coder.startConsensus({
    problem: 'Your problem',
    context: 'Your context',
  });
} catch (error) {
  if (error.message.includes('Problem statement cannot be empty')) {
    // Need better problem description
  }
  if (error.message.includes('timeout')) {
    // Consensus took too long, try simpler problem
  }
}
```

## Best Practices

### ✅ DO:
- **Be specific** — "Design a cache" is vague; "Design LRU cache for user session data, O(1) access, 10k concurrent users" is clear
- **Include constraints** — RAM limits, latency budgets, integration points
- **Provide context** — What's your tech stack? What's the current pain point?
- **Use domain-specific tools** — If it's Elixir, use Auggie; if it's architecture, use Pi
- **Read the reasoning** — Don't just take the winner; understand why reviewers chose it
- **Version specs** — Save consensus specs with project versions so you can track decisions

### ❌ DON'T:
- Ask trivial questions ("Write a hello world")
- Skip context (don't assume tools know your codebase structure)
- Ignore reviewer concerns (if a reviewer flagged something, it matters)
- Use consensus for quick decisions (takes 30-90 seconds; use for important calls)
- Implement without reading the spec first (the spec is the spec, not a suggestion)

## Integration Patterns

### Pattern 1: Architecture Review Loop
```
Problem → Consensus → Spec → Review → Implement → Test
   ↓ (if not confident)
   └─ Try different tool config → New Spec → Review
```

### Pattern 2: Team Decision Documentation
```
Engineer asks: "How should we cache?"
→ Consensus generates spec
→ Share spec in PR/discussion
→ Team reviews reasoning
→ Implement with confidence
```

### Pattern 3: Automated Decision Pipeline
```
detect_architecture_question()
  → startConsensus()
  → wait_for_convergence()
  → generate_spec()
  → save_to_project_docs()
  → notify_team()
```

## Common Questions

**Q: What if reviewers disagree?**
A: You get `escalated` status. Read the spec's reviewer section to understand each view. Make a human decision or reconfigure tools and try again.

**Q: Can I run consensus on my own code?**
A: Yes! The context engine will analyze your actual codebase. Be specific about which files matter ("We're refactoring the auth module at `src/auth/").

**Q: How long does it take?**
A: 30-90 seconds typically. Depends on problem complexity and reviewer agreement. More disagreement = more rounds (up to 5 max).

**Q: Should I use consensus for every decision?**
A: No. Use it for decisions with real tradeoffs. Simple problems don't need orchestration. Is it a "this vs. that" question? That's consensus territory.

**Q: Can I configure more than 2 reviewers?**
A: Yes. More reviewers = more perspectives but longer consensus. 2-3 is optimal; beyond that hits diminishing returns.

## Troubleshooting

**Problem: Consensus didn't converge after 5 rounds**
- Solution: Your problem might be too open-ended. Make constraints explicit.
- Or: Reviewers fundamentally disagree. Read reasoning, make human call.

**Problem: Spec doesn't match my codebase**
- Solution: Context engine may have misunderstood. Provide more specific context or use `--debug` to see reasoning.
- Or: Try different context engine (Claude Code instead of Auggie, etc.)

**Problem: Taking too long**
- Solution: Reduce problem scope. Don't ask about entire architecture, ask about specific component.

---

**Questions or feedback?** Open an issue on GitHub: https://github.com/bsharpe/consensus-coder/issues
