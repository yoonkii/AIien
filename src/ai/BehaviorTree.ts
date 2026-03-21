/**
 * Behavior Tree — Layer 1 of the Hybrid Brain.
 * Runs at game framerate. Executes the Director's strategy autonomously.
 *
 * STATE MACHINE:
 *   ┌──────────────────────────────────────────┐
 *   │  Any state ──Director response──▶ Any state  │
 *   │                                          │
 *   │  PATROL ── sweep rooms, investigate sounds   │
 *   │  HUNT ── A* toward target, attack on sight   │
 *   │  STALK ── follow at distance, stay hidden    │
 *   │  AMBUSH ── move to chokepoint, wait          │
 *   │  RETREAT ── flee to nearest vent, heal        │
 *   │  TERRORIZE ── vocalize + env manipulation     │
 *   └──────────────────────────────────────────┘
 */

import type { GameState, AlienState, PlayerState, Strategy } from "../game/GameState";
import { findPath, getRoomAt } from "../game/TileMap";

export interface BehaviorTickResult {
  /** New alien position after this tick */
  newX: number;
  newY: number;
  /** Did the alien attack this tick? */
  attacked: boolean;
  attackTarget: string | null;
  attackDamage: number;
}

/** Move alien one step along its current path */
function stepAlongPath(alien: AlienState): { x: number; y: number } {
  if (alien.currentPath.length === 0 || alien.pathIndex >= alien.currentPath.length) {
    return { x: alien.x, y: alien.y };
  }
  const [nx, ny] = alien.currentPath[alien.pathIndex];
  alien.pathIndex++;
  return { x: nx, y: ny };
}

/** Calculate A* path from alien to target position */
function pathTo(state: GameState, tx: number, ty: number): [number, number][] | null {
  return findPath(
    state.map,
    state.alien.x,
    state.alien.y,
    tx,
    ty,
    true, // alien can use vents
    state.environment.doors
  );
}

/** Find the alive player with given nickname */
function findPlayer(state: GameState, nickname: string): PlayerState | null {
  return state.players.find((p) => p.nickname === nickname && p.state !== "dead") ?? null;
}

/** Find nearest alive player */
function nearestPlayer(state: GameState): PlayerState | null {
  let best: PlayerState | null = null;
  let bestDist = Infinity;
  for (const p of state.players) {
    if (p.state === "dead") continue;
    const dist = Math.abs(p.x - state.alien.x) + Math.abs(p.y - state.alien.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/** Is the alien adjacent to (within 1 tile of) a player? */
function isAdjacentTo(alien: AlienState, player: PlayerState): boolean {
  return Math.abs(alien.x - player.x) <= 1 && Math.abs(alien.y - player.y) <= 1;
}

/** Find a vent tile to flee toward */
function findNearestVent(state: GameState): [number, number] | null {
  let best: [number, number] | null = null;
  let bestDist = Infinity;
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      if (state.map.tiles[y][x] === 4) {
        const dist = Math.abs(x - state.alien.x) + Math.abs(y - state.alien.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = [x, y];
        }
      }
    }
  }
  return best;
}

// ── Strategy implementations ──────────────────────────────────────

function tickPatrol(state: GameState): BehaviorTickResult {
  const alien = state.alien;

  // If no path, pick a random room to patrol toward
  if (alien.currentPath.length === 0 || alien.pathIndex >= alien.currentPath.length) {
    const rooms = state.map.rooms;
    const targetRoom = rooms[Math.floor(Math.random() * rooms.length)];
    const tx = targetRoom.x + Math.floor(targetRoom.width / 2);
    const ty = targetRoom.y + Math.floor(targetRoom.height / 2);
    const path = pathTo(state, tx, ty);
    if (path) {
      alien.currentPath = path;
      alien.pathIndex = 1; // skip current position
    }
  }

  const { x, y } = stepAlongPath(alien);

  // Check for opportunistic attack if adjacent to a player
  for (const p of state.players) {
    if (p.state !== "dead" && isAdjacentTo({ ...alien, x, y } as AlienState, p)) {
      return { newX: x, newY: y, attacked: true, attackTarget: p.nickname, attackDamage: 15 };
    }
  }

  return { newX: x, newY: y, attacked: false, attackTarget: null, attackDamage: 0 };
}

function tickHunt(state: GameState): BehaviorTickResult {
  const alien = state.alien;
  const target = alien.targetPlayer ? findPlayer(state, alien.targetPlayer) : nearestPlayer(state);

  if (!target) return tickPatrol(state); // fallback

  // Recalculate path toward target every tick (target moves)
  const path = pathTo(state, target.x, target.y);
  if (path && path.length > 1) {
    alien.currentPath = path;
    alien.pathIndex = 1;
  }

  const { x, y } = stepAlongPath(alien);

  // Attack if adjacent
  if (isAdjacentTo({ ...alien, x, y } as AlienState, target)) {
    return { newX: x, newY: y, attacked: true, attackTarget: target.nickname, attackDamage: 25 };
  }

  return { newX: x, newY: y, attacked: false, attackTarget: null, attackDamage: 0 };
}

function tickStalk(state: GameState): BehaviorTickResult {
  const alien = state.alien;
  const target = alien.targetPlayer ? findPlayer(state, alien.targetPlayer) : nearestPlayer(state);

  if (!target) return tickPatrol(state);

  const dist = Math.abs(target.x - alien.x) + Math.abs(target.y - alien.y);

  // Maintain distance of 4-6 tiles — close enough to watch, far enough to stay hidden
  if (dist > 6) {
    // Get closer
    const path = pathTo(state, target.x, target.y);
    if (path && path.length > 4) {
      alien.currentPath = path.slice(0, path.length - 3); // stop 3 tiles short
      alien.pathIndex = 1;
    }
    const { x, y } = stepAlongPath(alien);
    return { newX: x, newY: y, attacked: false, attackTarget: null, attackDamage: 0 };
  }

  if (dist < 3) {
    // Too close — back off (stay put for now)
    return { newX: alien.x, newY: alien.y, attacked: false, attackTarget: null, attackDamage: 0 };
  }

  // In sweet spot — hold position
  return { newX: alien.x, newY: alien.y, attacked: false, attackTarget: null, attackDamage: 0 };
}

function tickAmbush(state: GameState): BehaviorTickResult {
  const alien = state.alien;

  // In ambush mode, the alien moves to a chokepoint and waits
  // If already at a door/vent tile, hold position
  const currentTile = state.map.tiles[alien.y]?.[alien.x];
  if (currentTile === 3 || currentTile === 4) {
    // At a chokepoint — wait and attack anyone who comes close
    for (const p of state.players) {
      if (p.state !== "dead" && isAdjacentTo(alien, p)) {
        return { newX: alien.x, newY: alien.y, attacked: true, attackTarget: p.nickname, attackDamage: 30 }; // ambush bonus damage
      }
    }
    return { newX: alien.x, newY: alien.y, attacked: false, attackTarget: null, attackDamage: 0 };
  }

  // Move to nearest door/vent (chokepoint)
  if (alien.currentPath.length === 0 || alien.pathIndex >= alien.currentPath.length) {
    // Find nearest chokepoint
    let bestPos: [number, number] | null = null;
    let bestDist = Infinity;
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const t = state.map.tiles[y][x];
        if (t === 3 || t === 4) {
          const d = Math.abs(x - alien.x) + Math.abs(y - alien.y);
          if (d < bestDist && d > 0) {
            bestDist = d;
            bestPos = [x, y];
          }
        }
      }
    }
    if (bestPos) {
      const path = pathTo(state, bestPos[0], bestPos[1]);
      if (path) {
        alien.currentPath = path;
        alien.pathIndex = 1;
      }
    }
  }

  const { x, y } = stepAlongPath(alien);
  return { newX: x, newY: y, attacked: false, attackTarget: null, attackDamage: 0 };
}

function tickRetreat(state: GameState): BehaviorTickResult {
  const alien = state.alien;

  if (alien.currentPath.length === 0 || alien.pathIndex >= alien.currentPath.length) {
    const vent = findNearestVent(state);
    if (vent) {
      const path = pathTo(state, vent[0], vent[1]);
      if (path) {
        alien.currentPath = path;
        alien.pathIndex = 1;
      }
    }
  }

  const { x, y } = stepAlongPath(alien);

  // Passive HP regen while retreating (1 HP per tick on vent tiles)
  const tile = state.map.tiles[y]?.[x];
  if (tile === 4) {
    alien.hp = Math.min(alien.maxHp, alien.hp + 1);
  }

  return { newX: x, newY: y, attacked: false, attackTarget: null, attackDamage: 0 };
}

function tickTerrorize(state: GameState): BehaviorTickResult {
  // In terrorize mode, the alien doesn't move — it relies on environmental manipulation
  // (handled by Director's environment actions, not the behavior tree)
  return {
    newX: state.alien.x,
    newY: state.alien.y,
    attacked: false,
    attackTarget: null,
    attackDamage: 0,
  };
}

// ── Public API ────────────────────────────────────────────────────

const strategyFns: Record<Strategy, (state: GameState) => BehaviorTickResult> = {
  patrol: tickPatrol,
  hunt: tickHunt,
  stalk: tickStalk,
  ambush: tickAmbush,
  retreat: tickRetreat,
  terrorize: tickTerrorize,
};

/** Execute one tick of the behavior tree */
export function behaviorTreeTick(state: GameState): BehaviorTickResult {
  const fn = strategyFns[state.alien.strategy];
  return fn(state);
}

/** Update the alien's strategy from a Director decision */
export function applyDirectorStrategy(state: GameState, strategy: Strategy, targetPlayer: string | null) {
  const alien = state.alien;
  const oldStrategy = alien.strategy;

  alien.strategy = strategy;
  alien.targetPlayer = targetPlayer;

  // Clear path on strategy change so new strategy can compute its own
  if (strategy !== oldStrategy) {
    alien.currentPath = [];
    alien.pathIndex = 0;
  }
}
