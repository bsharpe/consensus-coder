# Consensus Coder Workflow

## State Machine

```
START
  ↓
PHASE 1: Opus Proposes 3 Alternatives
  ↓
PHASE 2: Gemini, Codex, Opus Vote
  ↓
CHECK VOTES
  ├→ 3-0 UNANIMOUS → PHASE 4: IMPLEMENT
  ├→ 2-1 or 1-2 → PHASE 3: DISSENT PROPOSES
  │   ↓
  │   REVISIT VOTING (increment iteration counter)
  │   ↓
  │   [loop back to CHECK VOTES]
  │
  └→ After 5 iterations with no consensus → ESCALATE TO HUMAN
      ↓
      WAIT FOR HUMAN DECISION
      ↓
      PHASE 4: IMPLEMENT (human-chosen solution)
```

## Detailed Workflow

### Phase 1: Opus Proposes (Iteration 0)

**Prompt to Opus:**
```
You are architecting a coding solution. Analyze this problem and propose 3 distinct approaches.

Problem: {problem}
Context: {context}

For each approach, provide:
1. **Name**: Short identifier (A, B, C)
2. **Description**: 1-2 sentence summary
3. **Rationale**: Why this approach is viable
4. **Trade-offs**: What it trades off (performance, simplicity, flexibility, etc.)
5. **Complexity**: Estimated implementation effort (Low/Medium/High)
6. **Key risks**: Potential gotchas

Format as a structured list. Be specific and realistic.
```

**Output format:**
```
## Proposal A: [Name]
- **Description**: ...
- **Rationale**: ...
- **Trade-offs**: ...
- **Complexity**: ...
- **Risks**: ...

## Proposal B: [Name]
- ...

## Proposal C: [Name]
- ...
```

---

### Phase 2: Review & Vote

**Voting prompt template:**

```
You are a code architect reviewing 3 proposed solutions.

Problem: {problem}
Context: {context}

{opus_proposals}

Consider:
1. Which approach best solves the problem?
2. Which has the best trade-off balance?
3. Any critical flaws in your top choice?

Cast your vote (A, B, or C) with reasoning.

Format:
**Vote:** [A | B | C]
**Confidence:** [High | Medium | Low]
**Reasoning:** [2-3 sentences why]
**Concerns:** [Any reservations]
```

**Vote submission order:**
1. Gemini 2.5 votes
2. Codex votes
3. Opus reconsiders (can change its mind or stick with its proposal)

---

### Phase 3: Check for Consensus

**Tally votes:**

```
Proposal A: [count] votes
Proposal B: [count] votes
Proposal C: [count] votes
```

**Logic:**
- **3-0**: Unanimous → move to Phase 4
- **2-1 or 1-2**: Dissent → dissenting model(s) propose alternatives
- **After 5 iterations with no 3-0**: Escalate to human

---

### Phase 3b: Dissent & Revote (If Needed)

**Prompt to minority voter:**

```
The vote was [2-1 for Proposal X].

You voted for Proposal Y. To convince the others, propose an alternative solution that:
1. Addresses your concerns with Proposal X
2. Incorporates strengths from all 3 initial proposals
3. Is realistic to implement

Your alternative: [concise description]

Why it's better: [2-3 key points]
```

**Revote round:**
1. All 3 models re-vote on the original 3 proposals + new alternative
2. Tally again
3. If no consensus, repeat (up to 5 total iterations)

---

### Phase 4: Implementation

**Opus creates plan:**
```
You have consensus: Proposal {X} will be implemented.

Create a detailed implementation plan with:
1. **Approach summary**: High-level overview
2. **Key components**: What needs to be built/changed
3. **Step-by-step plan**: 5-10 concrete steps
4. **Dependencies**: What needs to be done first
5. **Testing strategy**: How to validate
6. **Rollback plan**: If something goes wrong

Format for Auggie consumption.
```

**Auggie executes:**
- Takes Opus's plan as spec
- Implements step-by-step
- Integrates with Codebake for task tracking
- Loops back on errors

---

### Escalation to Human (If Max Iterations Reached)

Display current vote state and ask:

```
After 5 rounds, no consensus was reached.

Current vote tally:
- Proposal A: [votes]
- Proposal B: [votes]
- Proposal C: [votes]
- Alternative proposals: [list]

Here's the debate:
[summary of key disagreements]

Which proposal should we implement?

Respond with: A, B, C, or [your own choice]
```

Wait for your response, then proceed to Phase 4 with your chosen solution.

---

## Token Budget

Per consensus cycle (1 iteration):
- Opus proposal + reconsideration: ~3k tokens
- Gemini review + vote: ~2k tokens
- Codex review + vote: ~2k tokens
- Voting logic + reformatting: ~1k tokens

**Total per iteration: ~8k tokens**

5 iterations = ~40k tokens worst case. Plan accordingly.
