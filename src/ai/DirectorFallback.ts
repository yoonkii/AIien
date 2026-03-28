/**
 * Director Fallback — heuristic-based strategy scoring when Gemini fails.
 * Inspired by budok-ai's 3-tier graceful degradation.
 *
 * Instead of blindly reusing the last decision, we score strategies
 * based on current game state to pick the best fallback action.
 */

import type { GameState, DirectorDecision, Strategy } from "../game/GameState";
import { getRoomAt } from "../game/TileMap";

interface StrategyScore {
  strategy: Strategy;
  score: number;
  reason: string;
}

/** Score all strategies based on current state and return the best one */
export function computeFallbackDecision(
  state: GameState,
  lastDecision: DirectorDecision | null
): DirectorDecision {
  const scores = scoreStrategies(state, lastDecision);
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0] ?? { strategy: "patrol" as Strategy, score: 0, reason: "no scores" };

  // Pick best target for the chosen strategy
  const targetPlayer = pickTarget(state, best.strategy);

  return {
    strategy: best.strategy,
    targetPlayer,
    environmentActions: [],
    vocalize: "none",
    innerMonologue: `[Fallback] ${best.reason}`,
    reasoning: `Heuristic fallback: ${best.reason} (score: ${best.score})`,
    timestamp: Date.now(),
  };
}

function scoreStrategies(
  state: GameState,
  lastDecision: DirectorDecision | null
): StrategyScore[] {
  const alien = state.alien;
  const alivePlayers = state.players.filter((p) => p.state !== "dead");
  const hpRatio = alien.hp / alien.maxHp;

  // Find nearest alive player distance
  let nearestDist = Infinity;
  for (const p of alivePlayers) {
    const dist = Math.abs(p.x - alien.x) + Math.abs(p.y - alien.y);
    if (dist < nearestDist) nearestDist = dist;
  }

  // Check if players are grouped or scattered
  let maxPlayerSpread = 0;
  for (let i = 0; i < alivePlayers.length; i++) {
    for (let j = i + 1; j < alivePlayers.length; j++) {
      const pi = alivePlayers[i]!;
      const pj = alivePlayers[j]!;
      const dist = Math.abs(pi.x - pj.x) + Math.abs(pi.y - pj.y);
      if (dist > maxPlayerSpread) maxPlayerSpread = dist;
    }
  }

  const scores: StrategyScore[] = [];

  // RETREAT: prioritize when HP is low
  {
    let score = 0;
    let reason = "";
    if (hpRatio < 0.2) {
      score = 100;
      reason = "Critical HP — must retreat to survive";
    } else if (hpRatio < 0.4) {
      score = 60;
      reason = "Low HP — retreat recommended";
    } else {
      score = 5;
      reason = "HP okay — retreat not needed";
    }
    scores.push({ strategy: "retreat", score, reason });
  }

  // HUNT: best when a player is nearby and alien is healthy
  {
    let score = 0;
    let reason = "";
    if (nearestDist <= 5 && hpRatio > 0.5) {
      score = 80;
      reason = "Player nearby and HP good — hunt them down";
    } else if (nearestDist <= 10 && hpRatio > 0.3) {
      score = 50;
      reason = "Player in range — pursue cautiously";
    } else {
      score = 20;
      reason = "No easy target for hunting";
    }
    scores.push({ strategy: "hunt", score, reason });
  }

  // AMBUSH: best at mid-range with good HP
  {
    let score = 0;
    let reason = "";
    if (nearestDist > 5 && nearestDist <= 15 && hpRatio > 0.4) {
      score = 70;
      reason = "Players at medium range — set up ambush";
    } else if (hpRatio > 0.6) {
      score = 35;
      reason = "Good HP for ambush but positioning unclear";
    } else {
      score = 15;
      reason = "Not ideal for ambush";
    }
    scores.push({ strategy: "ambush", score, reason });
  }

  // STALK: best when players are scattered
  {
    let score = 0;
    let reason = "";
    if (maxPlayerSpread > 15 && hpRatio > 0.3) {
      score = 65;
      reason = "Players scattered — stalk isolated targets";
    } else if (nearestDist > 3 && nearestDist <= 8) {
      score = 45;
      reason = "Good stalking distance";
    } else {
      score = 25;
      reason = "Players too close or grouped for stalking";
    }
    scores.push({ strategy: "stalk", score, reason });
  }

  // PATROL: low-priority default
  {
    const score = 30;
    const reason = "Default patrol — sweep rooms for opportunities";
    scores.push({ strategy: "patrol", score, reason });
  }

  // TERRORIZE: best mid-game with good HP and some dark rooms
  {
    let score = 0;
    let reason = "";
    const darkRoomCount = Array.from(state.environment.lights.values()).filter((v) => !v).length;
    if (darkRoomCount >= 2 && hpRatio > 0.5) {
      score = 55;
      reason = "Multiple dark rooms — terrorize through environment";
    } else {
      score = 20;
      reason = "Environment not set up for terrorize";
    }
    scores.push({ strategy: "terrorize", score, reason });
  }

  // Bonus: penalize repeating the same strategy as last decision
  if (lastDecision) {
    const same = scores.find((s) => s.strategy === lastDecision.strategy);
    if (same) {
      same.score -= 10;
      same.reason += " (repeat penalty)";
    }
  }

  return scores;
}

/** Pick the best target player for a given strategy */
function pickTarget(state: GameState, strategy: Strategy): string | null {
  const alivePlayers = state.players.filter((p) => p.state !== "dead");
  if (alivePlayers.length === 0) return null;

  // Strategies that don't need a target
  if (strategy === "patrol" || strategy === "retreat" || strategy === "terrorize") {
    return null;
  }

  // For hunt/stalk/ambush: target the weakest or nearest
  const alien = state.alien;

  if (strategy === "hunt") {
    // Target the nearest player
    let best = alivePlayers[0]!;
    let bestDist = Infinity;
    for (const p of alivePlayers) {
      const dist = Math.abs(p.x - alien.x) + Math.abs(p.y - alien.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return best.nickname;
  }

  // For stalk/ambush: target the most isolated player
  let mostIsolated = alivePlayers[0]!;
  let maxMinDist = 0;
  for (const p of alivePlayers) {
    let minDistToOther = Infinity;
    for (const other of alivePlayers) {
      if (other === p) continue;
      const dist = Math.abs(p.x - other.x) + Math.abs(p.y - other.y);
      if (dist < minDistToOther) minDistToOther = dist;
    }
    if (minDistToOther > maxMinDist) {
      maxMinDist = minDistToOther;
      mostIsolated = p;
    }
  }
  return mostIsolated.nickname;
}
