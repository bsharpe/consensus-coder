---
name: consensus-coder
description: Multi-model consensus coding workflow. Use when you need multiple LLMs (Opus, Gemini, Codex) to collaboratively diagnose a coding problem, propose solutions, debate alternatives, and reach consensus before implementation. Ideal for complex architectural decisions, refactoring strategies, or tricky algorithmic problems where diverse perspectives improve solution quality.
---

# Consensus Coder

A collaborative multi-model workflow that achieves consensus on coding solutions through structured debate and voting.

## How It Works

### Phase 1: Diagnosis & Proposal (Opus)
1. **Opus 4.5** analyzes the problem and proposes 3 distinct approaches
2. Each proposal includes: rationale, trade-offs, estimated complexity

### Phase 2: Review & Vote (Gemini 2.5 + Codex)
1. **Gemini 2.5** reviews all 3 proposals and casts a vote with reasoning
2. **Codex** reviews all 3 proposals and casts a vote with reasoning
3. **Opus** votes on its own proposals or agrees with a reviewer's choice

### Phase 3: Consensus or Iteration
- **If unanimous**: Opus creates implementation plan → Auggie implements
- **If split**: The dissenting model(s) propose alternative solutions → revote
- **Max 5 iterations**: If no consensus after 5 rounds, escalate to you for human decision

### Phase 4: Implementation (Auggie)
Once consensus achieved:
1. Opus creates detailed implementation plan
2. Auggie executes the plan with your Codebake tasks

## Usage

### Start a consensus session:
```
problem: "Your coding problem or refactoring challenge"
context: "Additional context (framework, constraints, goals)"
```

### The workflow will:
1. Show each model's proposals and reasoning
2. Display vote tallies each round
3. Auto-iterate on disagreement
4. Ask for your decision if stuck after 5 rounds
5. Implement the winning solution

## Voting Format

Each model votes using this structure:
```
**Vote:** [Proposal A | Proposal B | Proposal C]
**Confidence:** [High | Medium | Low]
**Reasoning:** [Why this proposal wins]
**Concerns:** [Any reservations or caveats]
```

## Iteration Rules

- **Unanimous (3-0)**: Move to implementation
- **2-1 split**: Dissenting model proposes alternative → revote
- **No consensus after 5 rounds**: Escalate to human decision (you decide)

When dissenting, the minority model must articulate:
- Specific concern with the winning proposal
- What their alternative addresses that others miss

## Implementation

Auggie executes with:
- Opus's detailed plan as the spec
- Your Codebake workspace for task tracking
- Automatic error feedback loops

## Token Cost

Expect ~8-12k tokens per consensus cycle (3 proposal reviews + voting + iteration logic). Multiple iterations can be expensive, so this works best for high-impact decisions.

---

See `references/` for voting logic, prompt templates, and consensus rules.
