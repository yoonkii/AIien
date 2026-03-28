/**
 * Player Controller — the heart of platformer feel.
 * Implements all GMTK Platformer Toolkit principles:
 *
 *   - Variable jump height (hold = higher, tap = short hop)
 *   - Asymmetric gravity (fall faster than rise)
 *   - Coyote time (grace period after leaving platform)
 *   - Jump buffering (register jump input before landing)
 *   - Apex hang (floaty peak)
 *   - Corner correction (nudge past ledge corners)
 *   - Snappy acceleration with air control
 */

import type { PlayerState, InputState, DoorState } from "./GameState";
import type { LevelMap } from "./GameState";
import {
  JUMP_VELOCITY,
  MAX_RUN_SPEED,
  RUN_ACCELERATION,
  RUN_DECELERATION,
  TURN_ACCELERATION,
  AIR_ACCEL_MULT,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  applyGravity,
  resolveCollisionX,
  resolveCollisionY,
  cornerCorrection,
} from "./Physics";

/** Attack duration in seconds */
const ATTACK_DURATION = 0.15;
/** Attack cooldown in seconds */
const ATTACK_COOLDOWN = 0.4;
/** Invincibility after being hit */
const HURT_DURATION = 0.5;

/**
 * Update a player for one physics timestep.
 * This is where all the GMTK magic happens.
 */
export function updatePlayer(
  player: PlayerState,
  dt: number,
  map: LevelMap,
  doorStates?: Map<string, DoorState>
): void {
  if (player.state === "dead") return;

  const input = player.input;

  // ── Timers ──────────────────────────────────────────────────
  if (player.attackTimer > 0) player.attackTimer -= dt;
  if (player.attackCooldown > 0) player.attackCooldown -= dt;
  if (player.invincibleTimer > 0) player.invincibleTimer -= dt;

  // ── Coyote Time ─────────────────────────────────────────────
  if (player.grounded) {
    player.coyoteTimer = 0;
    player.wasGrounded = true;
  } else {
    if (player.wasGrounded) {
      // Just left ground — start coyote timer
      player.wasGrounded = false;
    }
    player.coyoteTimer += dt;
  }

  // ── Jump Buffer ─────────────────────────────────────────────
  if (input.jumpPressed) {
    player.jumpBufferTimer = 0;
  } else {
    player.jumpBufferTimer += dt;
  }

  // ── Horizontal Movement ─────────────────────────────────────
  const moveDir = (input.left ? -1 : 0) + (input.right ? 1 : 0);

  if (moveDir !== 0) {
    // Set facing direction
    player.facing = moveDir > 0 ? "right" : "left";

    // Choose acceleration: turning is snappier
    const isTurning =
      (moveDir > 0 && player.vx < 0) || (moveDir < 0 && player.vx > 0);
    let accel = isTurning ? TURN_ACCELERATION : RUN_ACCELERATION;

    // Reduce acceleration in air
    if (!player.grounded) {
      accel *= AIR_ACCEL_MULT;
    }

    // Accelerate toward max speed
    player.vx += moveDir * accel * dt;

    // Clamp to max speed
    if (player.vx > MAX_RUN_SPEED) player.vx = MAX_RUN_SPEED;
    if (player.vx < -MAX_RUN_SPEED) player.vx = -MAX_RUN_SPEED;
  } else {
    // No input — decelerate
    const decel = player.grounded ? RUN_DECELERATION : RUN_DECELERATION * AIR_ACCEL_MULT;

    if (player.vx > 0) {
      player.vx -= decel * dt;
      if (player.vx < 0) player.vx = 0;
    } else if (player.vx < 0) {
      player.vx += decel * dt;
      if (player.vx > 0) player.vx = 0;
    }
  }

  // ── Jump ────────────────────────────────────────────────────
  const canJump =
    player.grounded || player.coyoteTimer < COYOTE_TIME;
  const wantsJump = player.jumpBufferTimer < JUMP_BUFFER_TIME;

  if (canJump && wantsJump) {
    player.vy = -JUMP_VELOCITY; // negative = upward
    player.grounded = false;
    player.wasGrounded = false;
    player.coyoteTimer = COYOTE_TIME; // expire coyote time
    player.jumpBufferTimer = JUMP_BUFFER_TIME; // expire buffer
    player.jumpHeld = true;
  }

  // Track if jump button is held (for variable height)
  player.jumpHeld = input.jump;

  // ── Attack ──────────────────────────────────────────────────
  if (input.attackPressed && player.attackCooldown <= 0 && player.attackTimer <= 0) {
    player.attackTimer = ATTACK_DURATION;
    player.attackCooldown = ATTACK_COOLDOWN;
  }

  // ── Gravity ─────────────────────────────────────────────────
  applyGravity(player, dt, player.jumpHeld);

  // ── Position Update + Collision ─────────────────────────────
  // X axis
  player.x += player.vx * dt;
  resolveCollisionX(
    player,
    map.tiles,
    map.width,
    map.height,
    false, // not alien
    doorStates as Map<string, string> | undefined
  );

  // Y axis
  player.y += player.vy * dt;
  resolveCollisionY(
    player,
    map.tiles,
    map.width,
    map.height,
    false,
    doorStates as Map<string, string> | undefined
  );

  // Corner correction (when jumping into corners)
  cornerCorrection(player, map.tiles, map.width, map.height, false);

  // ── State Animation ─────────────────────────────────────────
  if (player.invincibleTimer > 0) {
    player.state = "hurt";
  } else if (player.attackTimer > 0) {
    player.state = "attacking";
  } else if (!player.grounded) {
    player.state = player.vy < 0 ? "jumping" : "falling";
  } else if (Math.abs(player.vx) > 5) {
    player.state = "running";
  } else {
    player.state = "idle";
  }
}
