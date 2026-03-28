/**
 * Combat System — hitbox-based melee attacks with knockback.
 *
 * Attack hitboxes extend from the entity in their facing direction.
 * Both players and alien have attack animations with active frames.
 */

import type { PlayerState, AlienState, GameState } from "./GameState";
import { aabbOverlap, type AABB } from "./Physics";

// ── Constants ───────────────────────────────────────────────────

/** Player attack hitbox (extends from body in facing direction) */
const PLAYER_ATTACK_WIDTH = 24;
const PLAYER_ATTACK_HEIGHT = 16;
const PLAYER_ATTACK_DAMAGE = 15;

/** Alien attack hitbox */
const ALIEN_ATTACK_WIDTH = 32;
const ALIEN_ATTACK_HEIGHT = 24;

/** Alien damage varies by strategy */
const ALIEN_DAMAGE: Record<string, number> = {
  hunt: 25,
  ambush: 35, // ambush bonus
  stalk: 20,
  patrol: 15,
  terrorize: 10,
  retreat: 10,
};

/** Knockback velocity applied on hit */
const KNOCKBACK_VX = 200; // px/s
const KNOCKBACK_VY = -120; // px/s (slight upward pop)

// ── Attack Hitbox ───────────────────────────────────────────────

/** Get the attack hitbox for a player */
function getPlayerAttackBox(player: PlayerState): AABB {
  const x =
    player.facing === "right"
      ? player.x + player.width
      : player.x - PLAYER_ATTACK_WIDTH;
  return {
    x,
    y: player.y + (player.height - PLAYER_ATTACK_HEIGHT) / 2,
    width: PLAYER_ATTACK_WIDTH,
    height: PLAYER_ATTACK_HEIGHT,
  };
}

/** Get the attack hitbox for the alien */
function getAlienAttackBox(alien: AlienState): AABB {
  const x =
    alien.facing === "right"
      ? alien.x + alien.width
      : alien.x - ALIEN_ATTACK_WIDTH;
  return {
    x,
    y: alien.y + (alien.height - ALIEN_ATTACK_HEIGHT) / 2,
    width: ALIEN_ATTACK_WIDTH,
    height: ALIEN_ATTACK_HEIGHT,
  };
}

// ── Combat Resolution ───────────────────────────────────────────

export interface CombatEvent {
  type: "player_hit" | "alien_hit";
  attacker: string;
  target: string;
  damage: number;
}

/**
 * Check all combat interactions for one frame.
 * Returns list of combat events that occurred.
 */
export function resolveCombat(state: GameState): CombatEvent[] {
  const events: CombatEvent[] = [];

  // ── Player attacks hitting alien ──
  for (const player of state.players) {
    if (player.state === "dead" || player.attackTimer <= 0) continue;

    const attackBox = getPlayerAttackBox(player);
    const alienBody: AABB = {
      x: state.alien.x,
      y: state.alien.y,
      width: state.alien.width,
      height: state.alien.height,
    };

    if (state.alien.invincibleTimer <= 0 && aabbOverlap(attackBox, alienBody)) {
      events.push({
        type: "alien_hit",
        attacker: player.nickname,
        target: "alien",
        damage: PLAYER_ATTACK_DAMAGE,
      });

      // Apply damage
      state.alien.hp -= PLAYER_ATTACK_DAMAGE;

      // Knockback alien
      const dir = player.facing === "right" ? 1 : -1;
      state.alien.vx = KNOCKBACK_VX * dir;
      state.alien.vy = KNOCKBACK_VY;
      state.alien.invincibleTimer = 0.3;
      state.alien.grounded = false;
    }
  }

  // ── Alien attacks hitting players ──
  if (state.alien.attackTimer > 0) {
    const attackBox = getAlienAttackBox(state.alien);
    const damage = ALIEN_DAMAGE[state.alien.strategy] ?? 20;

    for (const player of state.players) {
      if (player.state === "dead" || player.invincibleTimer > 0) continue;

      const playerBody: AABB = {
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height,
      };

      if (aabbOverlap(attackBox, playerBody)) {
        events.push({
          type: "player_hit",
          attacker: "alien",
          target: player.nickname,
          damage,
        });

        // Apply damage
        player.hp -= damage;

        // Knockback player
        const dir = state.alien.facing === "right" ? 1 : -1;
        player.vx = KNOCKBACK_VX * dir;
        player.vy = KNOCKBACK_VY;
        player.invincibleTimer = 0.5;
        player.grounded = false;

        if (player.hp <= 0) {
          player.hp = 0;
          player.state = "dead";
          player.vx = 0;
          player.vy = 0;
        }
      }
    }
  }

  // ── Contact damage (alien body touching player) ──
  // Simplified: alien deals minor contact damage when touching player
  for (const player of state.players) {
    if (player.state === "dead" || player.invincibleTimer > 0) continue;

    const playerBody: AABB = {
      x: player.x,
      y: player.y,
      width: player.width,
      height: player.height,
    };
    const alienBody: AABB = {
      x: state.alien.x,
      y: state.alien.y,
      width: state.alien.width,
      height: state.alien.height,
    };

    if (aabbOverlap(playerBody, alienBody)) {
      const contactDamage = 5;
      events.push({
        type: "player_hit",
        attacker: "alien_contact",
        target: player.nickname,
        damage: contactDamage,
      });

      player.hp -= contactDamage;

      // Push player away
      const dx = player.x - state.alien.x;
      player.vx = (dx >= 0 ? 1 : -1) * KNOCKBACK_VX * 0.5;
      player.vy = KNOCKBACK_VY * 0.5;
      player.invincibleTimer = 0.5;
      player.grounded = false;

      if (player.hp <= 0) {
        player.hp = 0;
        player.state = "dead";
        player.vx = 0;
        player.vy = 0;
      }
    }
  }

  return events;
}
