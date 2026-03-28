/**
 * Alien Controller — AI-driven platformer movement.
 *
 * The alien uses the same physics system as players but with
 * different parameters (faster, higher jump, wall cling).
 * High-level navigation uses tile-level A* waypoints.
 */

import type { AlienState, PlayerState, GameState, Strategy } from "../game/GameState";
import type { LevelMap } from "../game/GameState";
import {
  TILE_SIZE,
  applyGravity,
  resolveCollisionX,
  resolveCollisionY,
  TERMINAL_VELOCITY,
} from "../game/Physics";
import { worldToTile } from "../game/TileMap";

// ── Alien Physics Constants (different from player) ─────────────

const ALIEN_MAX_SPEED = 170; // faster than player
const ALIEN_ACCELERATION = 1200;
const ALIEN_JUMP_VELOCITY = 380; // higher jump
const ALIEN_ATTACK_DURATION = 0.2;
const ALIEN_ATTACK_COOLDOWN = 0.6;

// ── Navigation ──────────────────────────────────────────────────

/** Get the pixel center of the alien */
function alienCenter(alien: AlienState): [number, number] {
  return [alien.x + alien.width / 2, alien.y + alien.height / 2];
}

/** Distance between alien and a point */
function distTo(alien: AlienState, px: number, py: number): number {
  const [ax, ay] = alienCenter(alien);
  return Math.sqrt((ax - px) ** 2 + (ay - py) ** 2);
}

/** Find nearest alive player */
function nearestPlayer(state: GameState): PlayerState | null {
  let best: PlayerState | null = null;
  let bestDist = Infinity;
  for (const p of state.players) {
    if (p.state === "dead") continue;
    const dist = distTo(state.alien, p.x + p.width / 2, p.y + p.height / 2);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/** Find target player by nickname */
function findTarget(state: GameState): PlayerState | null {
  if (state.alien.targetPlayer) {
    const p = state.players.find(
      (p) => p.nickname === state.alien.targetPlayer && p.state !== "dead"
    );
    if (p) return p;
  }
  return nearestPlayer(state);
}

// ── Strategy Behaviors ──────────────────────────────────────────

function moveToward(
  alien: AlienState,
  targetX: number,
  targetY: number,
  dt: number,
  map: LevelMap,
  speed: number = ALIEN_MAX_SPEED
): void {
  const [cx, _cy] = alienCenter(alien);
  const dx = targetX - cx;

  // Horizontal movement
  if (Math.abs(dx) > 4) {
    alien.facing = dx > 0 ? "right" : "left";
    const dir = dx > 0 ? 1 : -1;
    alien.vx += dir * ALIEN_ACCELERATION * dt;
    if (alien.vx > speed) alien.vx = speed;
    if (alien.vx < -speed) alien.vx = -speed;
  } else {
    // Close enough horizontally — decelerate
    alien.vx *= 0.8;
  }

  // Jump if target is above and we're grounded
  if (targetY < alien.y - TILE_SIZE && alien.grounded) {
    alien.vy = -ALIEN_JUMP_VELOCITY;
    alien.grounded = false;
    alien.jumpHeld = true;
  }

  // Jump over obstacles — if hitting a wall, try jumping
  if (alien.grounded && Math.abs(alien.vx) < 5 && Math.abs(dx) > TILE_SIZE) {
    alien.vy = -ALIEN_JUMP_VELOCITY;
    alien.grounded = false;
    alien.jumpHeld = true;
  }
}

function tickPatrol(state: GameState, dt: number): void {
  const alien = state.alien;

  // Pick a random patrol target within the current room
  if (alien.waypoints.length === 0 || alien.waypointIndex >= alien.waypoints.length) {
    const rooms = state.map.rooms;
    const targetRoom = rooms[Math.floor(Math.random() * rooms.length)]!;
    const tx = (targetRoom.x + Math.floor(targetRoom.width / 2)) * TILE_SIZE;
    const ty = (targetRoom.y + targetRoom.height - 2) * TILE_SIZE;
    alien.waypoints = [[tx, ty]];
    alien.waypointIndex = 0;
  }

  const wp = alien.waypoints[alien.waypointIndex]!;
  moveToward(alien, wp[0], wp[1], dt, state.map, ALIEN_MAX_SPEED * 0.6);

  // Advance waypoint when close
  if (distTo(alien, wp[0], wp[1]) < TILE_SIZE * 2) {
    alien.waypointIndex++;
  }
}

function tickHunt(state: GameState, dt: number): void {
  const target = findTarget(state);
  if (!target) {
    tickPatrol(state, dt);
    return;
  }

  const alien = state.alien;
  const targetCX = target.x + target.width / 2;
  const targetCY = target.y + target.height / 2;

  moveToward(alien, targetCX, targetCY, dt, state.map, ALIEN_MAX_SPEED);

  // Attack when close enough
  const dist = distTo(alien, targetCX, targetCY);
  if (dist < TILE_SIZE * 2.5 && alien.attackCooldown <= 0) {
    alien.attackTimer = ALIEN_ATTACK_DURATION;
    alien.attackCooldown = ALIEN_ATTACK_COOLDOWN;
  }
}

function tickStalk(state: GameState, dt: number): void {
  const target = findTarget(state);
  if (!target) {
    tickPatrol(state, dt);
    return;
  }

  const alien = state.alien;
  const targetCX = target.x + target.width / 2;
  const targetCY = target.y + target.height / 2;
  const dist = distTo(alien, targetCX, targetCY);

  // Maintain distance of 4-8 tiles
  if (dist > 8 * TILE_SIZE) {
    moveToward(alien, targetCX, targetCY, dt, state.map, ALIEN_MAX_SPEED * 0.5);
  } else if (dist < 4 * TILE_SIZE) {
    // Too close — back away
    const [cx, _] = alienCenter(alien);
    const awayX = cx + (cx > targetCX ? TILE_SIZE * 6 : -TILE_SIZE * 6);
    moveToward(alien, awayX, alien.y, dt, state.map, ALIEN_MAX_SPEED * 0.4);
  } else {
    // In sweet spot — slow down
    alien.vx *= 0.9;
  }

  // Face the target
  alien.facing = targetCX > alien.x + alien.width / 2 ? "right" : "left";
}

function tickAmbush(state: GameState, dt: number): void {
  const alien = state.alien;

  // Move to a platform above the target and wait
  const target = findTarget(state);
  if (!target) {
    tickPatrol(state, dt);
    return;
  }

  const targetCX = target.x + target.width / 2;
  const aboveTarget = target.y - TILE_SIZE * 5; // 5 tiles above
  const dist = distTo(alien, targetCX, aboveTarget);

  if (dist > TILE_SIZE * 3) {
    // Move to ambush position
    moveToward(alien, targetCX, aboveTarget, dt, state.map, ALIEN_MAX_SPEED * 0.7);
  } else {
    // In position — wait and drop attack when target is below
    alien.vx *= 0.85;

    const horizontalDist = Math.abs(
      alien.x + alien.width / 2 - targetCX
    );

    if (horizontalDist < TILE_SIZE * 2 && alien.y < target.y) {
      // Drop attack! Don't jump, just fall
      if (alien.attackCooldown <= 0) {
        alien.attackTimer = ALIEN_ATTACK_DURATION * 2; // longer attack for ambush
        alien.attackCooldown = ALIEN_ATTACK_COOLDOWN;
      }
    }
  }

  alien.facing = targetCX > alien.x + alien.width / 2 ? "right" : "left";
}

function tickRetreat(state: GameState, dt: number): void {
  const alien = state.alien;

  // Find nearest vent tile and move to it
  if (alien.waypoints.length === 0 || alien.waypointIndex >= alien.waypoints.length) {
    let bestVent: [number, number] | null = null;
    let bestDist = Infinity;
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        if (state.map.tiles[y]?.[x] === 4) {
          const dist = distTo(alien, x * TILE_SIZE, y * TILE_SIZE);
          if (dist < bestDist) {
            bestDist = dist;
            bestVent = [x * TILE_SIZE, y * TILE_SIZE];
          }
        }
      }
    }
    if (bestVent) {
      alien.waypoints = [bestVent];
      alien.waypointIndex = 0;
    }
  }

  if (alien.waypoints.length > alien.waypointIndex) {
    const wp = alien.waypoints[alien.waypointIndex]!;
    moveToward(alien, wp[0], wp[1], dt, state.map, ALIEN_MAX_SPEED * 0.8);
    if (distTo(alien, wp[0], wp[1]) < TILE_SIZE * 2) {
      alien.waypointIndex++;
    }
  }

  // Passive regen on vent tiles
  const alienTileX = worldToTile(alien.x + alien.width / 2);
  const alienTileY = worldToTile(alien.y + alien.height / 2);
  if (state.map.tiles[alienTileY]?.[alienTileX] === 4) {
    alien.hp = Math.min(alien.maxHp, alien.hp + 0.5); // 0.5 HP per tick at 60fps
  }
}

function tickTerrorize(state: GameState, dt: number): void {
  // Stay still — rely on Director's environment manipulation
  state.alien.vx *= 0.9;
  const target = findTarget(state);
  if (target) {
    state.alien.facing =
      target.x > state.alien.x ? "right" : "left";
  }
}

// ── Public API ──────────────────────────────────────────────────

const strategyFns: Record<Strategy, (state: GameState, dt: number) => void> = {
  patrol: tickPatrol,
  hunt: tickHunt,
  stalk: tickStalk,
  ambush: tickAmbush,
  retreat: tickRetreat,
  terrorize: tickTerrorize,
};

/**
 * Update the alien for one physics timestep.
 */
export function updateAlien(state: GameState, dt: number): void {
  const alien = state.alien;

  // Timers
  if (alien.attackTimer > 0) alien.attackTimer -= dt;
  if (alien.attackCooldown > 0) alien.attackCooldown -= dt;
  if (alien.invincibleTimer > 0) alien.invincibleTimer -= dt;

  // Execute current strategy
  const fn = strategyFns[alien.strategy];
  fn(state, dt);

  // Gravity
  applyGravity(alien, dt, alien.jumpHeld);
  if (alien.grounded) alien.jumpHeld = false;

  // Position update + collision (alien can pass through vents)
  const doorStates = state.environment.doors as Map<string, string>;
  alien.x += alien.vx * dt;
  resolveCollisionX(
    alien,
    state.map.tiles,
    state.map.width,
    state.map.height,
    true, // is alien
    doorStates
  );

  alien.y += alien.vy * dt;
  resolveCollisionY(
    alien,
    state.map.tiles,
    state.map.width,
    state.map.height,
    true,
    doorStates
  );
}

/** Update the alien's strategy from a Director decision */
export function applyDirectorStrategy(
  state: GameState,
  strategy: Strategy,
  targetPlayer: string | null
): void {
  const alien = state.alien;
  const oldStrategy = alien.strategy;

  alien.strategy = strategy;
  alien.targetPlayer = targetPlayer;

  // Clear waypoints on strategy change
  if (strategy !== oldStrategy) {
    alien.waypoints = [];
    alien.waypointIndex = 0;
  }
}
