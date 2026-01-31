#!/usr/bin/env python3
"""
Consensus Coder Orchestrator

Manages multi-model consensus workflow:
1. Opus proposes 3 alternatives
2. Gemini/Codex review and vote
3. Iterate on disagreement (max 5 rounds)
4. Escalate to human if no consensus
5. Opus creates implementation plan
"""

import json
import sys
from typing import Optional
from dataclasses import dataclass, asdict


@dataclass
class Vote:
    """A single model's vote on proposals."""
    model: str
    choice: str  # A, B, C, or alternative name
    confidence: str  # High, Medium, Low
    reasoning: str
    concerns: str


@dataclass
class Round:
    """One consensus round."""
    iteration: int
    proposals: dict  # {"A": {...}, "B": {...}, "C": {...}, ...}
    votes: list  # [Vote, Vote, Vote, ...]
    tally: dict  # {"A": count, "B": count, ...}
    consensus: Optional[str]  # winning proposal if unanimous


class ConsensusOrchestrator:
    """Orchestrate multi-model consensus."""

    def __init__(self, problem: str, context: str = "", max_iterations: int = 5):
        self.problem = problem
        self.context = context
        self.max_iterations = max_iterations
        self.rounds = []
        self.human_decision = None
        self.final_solution = None

    def phase1_opus_proposes(self) -> dict:
        """
        Phase 1: Opus analyzes problem and proposes 3 alternatives.
        
        Returns: {"A": {...}, "B": {...}, "C": {...}}
        """
        print("\n=== PHASE 1: OPUS PROPOSES ===\n")
        print(f"Problem: {self.problem}\n")
        
        prompt = self._build_proposal_prompt()
        print(f"[Calling Opus to propose 3 alternatives...]")
        # In actual implementation, call Opus API here
        # For now, return structure
        
        proposals = {
            "A": {"name": "Approach A", "description": "...", "rationale": "...", "tradeoffs": "...", "complexity": "Medium", "risks": "..."},
            "B": {"name": "Approach B", "description": "...", "rationale": "...", "tradeoffs": "...", "complexity": "Low", "risks": "..."},
            "C": {"name": "Approach C", "description": "...", "rationale": "...", "tradeoffs": "...", "complexity": "High", "risks": "..."},
        }
        
        print("\nProposals received:")
        for key, prop in proposals.items():
            print(f"\n  {key}: {prop['name']}")
            print(f"     Complexity: {prop['complexity']}")
        
        return proposals

    def phase2_vote(self, proposals: dict, iteration: int) -> list:
        """
        Phase 2: Gemini, Codex, Opus vote on proposals.
        
        Returns: [Vote, Vote, Vote]
        """
        print(f"\n=== PHASE 2: VOTING (Iteration {iteration + 1}) ===\n")
        
        votes = []
        
        for model in ["Gemini", "Codex", "Opus"]:
            print(f"[{model} reviewing proposals...]")
            
            vote = Vote(
                model=model,
                choice="A",  # placeholder
                confidence="High",  # placeholder
                reasoning="...",  # placeholder
                concerns="..."  # placeholder
            )
            votes.append(vote)
            print(f"  {model} votes: {vote.choice} (Confidence: {vote.confidence})")
        
        return votes

    def tally_votes(self, votes: list) -> dict:
        """Tally votes and check for consensus."""
        tally = {}
        for vote in votes:
            tally[vote.choice] = tally.get(vote.choice, 0) + 1
        
        return tally

    def check_consensus(self, tally: dict) -> Optional[str]:
        """
        Check if consensus reached (3-0 on any proposal).
        
        Returns: winning proposal letter if unanimous, None otherwise
        """
        for proposal, count in tally.items():
            if count == 3:
                return proposal
        return None

    def phase3_dissent(self, proposals: dict, tally: dict, iteration: int) -> dict:
        """
        Phase 3: If dissent, minority model proposes alternative.
        
        Returns: updated proposals dict with new alternative
        """
        print(f"\n=== PHASE 3: DISSENT & ALTERNATIVE (Iteration {iteration + 1}) ===\n")
        
        # Find minority voter
        minority_votes = [k for k, v in tally.items() if v == 1]
        if not minority_votes:
            return proposals
        
        minority_choice = minority_votes[0]
        print(f"Minority voted for: {minority_choice}")
        print(f"[Minority model proposing alternative...]")
        
        # Generate alternative name
        alt_name = f"Alt_{iteration}"
        proposals[alt_name] = {
            "name": f"Alternative {iteration}",
            "description": "...",
            "rationale": "...",
            "tradeoffs": "...",
            "complexity": "Medium",
            "risks": "..."
        }
        
        print(f"\nAlternative proposed: {alt_name}")
        
        return proposals

    def orchestrate(self) -> dict:
        """Run the full consensus workflow."""
        print("\n" + "="*50)
        print("CONSENSUS CODER ORCHESTRATION")
        print("="*50)
        
        # Phase 1: Opus proposes
        proposals = self.phase1_opus_proposes()
        
        # Iteration loop
        for iteration in range(self.max_iterations):
            print(f"\n--- Iteration {iteration + 1}/{self.max_iterations} ---")
            
            # Phase 2: Vote
            votes = self.phase2_vote(proposals, iteration)
            
            # Tally
            tally = self.tally_votes(votes)
            print(f"\nVote tally: {tally}")
            
            # Check consensus
            winner = self.check_consensus(tally)
            
            if winner:
                print(f"\n✅ CONSENSUS REACHED: Proposal {winner}")
                self.final_solution = winner
                return {
                    "status": "consensus",
                    "iteration": iteration + 1,
                    "winner": winner,
                    "votes": [asdict(v) for v in votes],
                }
            
            # If not consensus and iterations remain, try dissent
            if iteration < self.max_iterations - 1:
                proposals = self.phase3_dissent(proposals, tally, iteration)
        
        # Max iterations reached, escalate to human
        print(f"\n⚠️ No consensus after {self.max_iterations} iterations")
        print("\nEscalating to human for decision...")
        
        return {
            "status": "escalated",
            "iterations": self.max_iterations,
            "final_tally": tally,
            "proposals": proposals,
            "awaiting_human_decision": True
        }

    def _build_proposal_prompt(self) -> str:
        """Build the proposal prompt for Opus."""
        return f"""
Analyze this problem and propose 3 distinct approaches.

Problem: {self.problem}
Context: {self.context}

For each approach, provide:
1. Name
2. Description (1-2 sentences)
3. Rationale
4. Trade-offs
5. Complexity (Low/Medium/High)
6. Key risks

Be specific and realistic.
"""


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: orchestrate.py '<problem>' [context]")
        sys.exit(1)
    
    problem = sys.argv[1]
    context = sys.argv[2] if len(sys.argv) > 2 else ""
    
    orchestrator = ConsensusOrchestrator(problem, context)
    result = orchestrator.orchestrate()
    
    print("\n" + "="*50)
    print("ORCHESTRATION RESULT")
    print("="*50)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
