/**
 * Alien Evolution System — the alien grows stronger mid-game.
 *
 * Evolution is a Director decision, not automatic. The Director can trigger
 * evolution by including an `evolve` field in its response. Signals the
 * Director uses to decide:
 *   - Kills (alien scored a kill → can evolve as reward)
 *   - Player dominance (players doing well → alien adapts)
 *   - Time elapsed (late-game aliens should be stronger)
 *
 * Evolution draws from a predefined ability pool per body type.
 * Phase 3: Gemini generates abilities inline.
 */

import type { AlienCard, AlienAbility } from "./AlienCard";
import type { AlienState } from "../game/GameState";

// ── Ability pools by body type ───────────────────────────────────
const EVOLUTION_POOLS: Record<string, AlienAbility[]> = {
  fast: [
    { name: "Sonic Dash", cooldown: 6, range: 5, damage: 20, description: "Burst of speed, damaging anything in path", currentCooldown: 0 },
    { name: "Frenzy", cooldown: 20, range: 0, damage: 0, description: "Double movement speed for 5 seconds", currentCooldown: 0 },
    { name: "Razor Claws", cooldown: 0, range: 1, damage: 35, description: "Permanent melee damage upgrade", currentCooldown: 0 },
  ],
  tanky: [
    { name: "Regeneration", cooldown: 0, range: 0, damage: 0, description: "Passively heal 1 HP per second", currentCooldown: 0 },
    { name: "Seismic Stomp", cooldown: 15, range: 3, damage: 15, description: "AoE that shakes the screen and slows players", currentCooldown: 0 },
    { name: "Thick Hide", cooldown: 0, range: 0, damage: 0, description: "Permanently reduce all incoming damage by 5", currentCooldown: 0 },
  ],
  stealth: [
    { name: "Perfect Camouflage", cooldown: 10, range: 0, damage: 0, description: "Become invisible even under direct light for 3 seconds", currentCooldown: 0 },
    { name: "Fear Aura", cooldown: 15, range: 4, damage: 0, description: "Players in range move 30% slower for 5 seconds", currentCooldown: 0 },
    { name: "Backstab", cooldown: 12, range: 1, damage: 40, description: "Massive damage when attacking from behind", currentCooldown: 0 },
  ],
  swarm: [
    { name: "Spawn Drone", cooldown: 20, range: 0, damage: 0, description: "Create a weak drone that patrols a room", currentCooldown: 0 },
    { name: "Acid Spray", cooldown: 8, range: 3, damage: 10, description: "Cone attack that damages all players in front", currentCooldown: 0 },
    { name: "Infest", cooldown: 25, range: 1, damage: 5, description: "Attach parasite to player, dealing damage over 10 seconds", currentCooldown: 0 },
  ],
};

export interface EvolutionEvent {
  tick: number;
  newAbility: AlienAbility;
  reason: string;
  hpBonus: number;
}

/**
 * Check if the alien should be allowed to evolve.
 * Returns evolution signals for the Director to consider.
 */
export function getEvolutionSignals(
  alien: AlienState,
  tick: number,
  playerKills: number,
  alivePlayers: number
): {
  canEvolve: boolean;
  signals: string[];
} {
  const maxAbilities = 5; // Cap at 5 abilities
  if (alien.card.abilities.length >= maxAbilities) {
    return { canEvolve: false, signals: ["Max abilities reached"] };
  }

  const signals: string[] = [];
  let canEvolve = false;

  // Kill reward: can evolve after each kill
  if (playerKills > 0 && playerKills > alien.card.abilities.length - 3) {
    signals.push(`Scored ${playerKills} kills — evolution available as reward`);
    canEvolve = true;
  }

  // Player dominance: players are doing well
  if (alivePlayers >= 2 && alien.hp < alien.maxHp * 0.5 && tick > 300) {
    signals.push("Players dominating — adaptation available");
    canEvolve = true;
  }

  // Late game: after 5 minutes
  if (tick > 3000) {
    signals.push("Late game — evolution available to increase pressure");
    canEvolve = true;
  }

  return { canEvolve, signals };
}

/**
 * Apply an evolution to the alien.
 * Picks a random ability from the body type's evolution pool.
 */
export function evolveAlien(alien: AlienState, reason: string): EvolutionEvent | null {
  const pool = EVOLUTION_POOLS[alien.card.bodyType];
  if (!pool || pool.length === 0) return null;

  // Filter out abilities the alien already has
  const available = pool.filter(
    (a) => !alien.card.abilities.some((existing) => existing.name === a.name)
  );
  if (available.length === 0) return null;

  const newAbility = available[Math.floor(Math.random() * available.length)];
  const hpBonus = 10; // Small HP boost on evolution

  alien.card.abilities.push({ ...newAbility });
  alien.maxHp += hpBonus;
  alien.hp = Math.min(alien.hp + hpBonus, alien.maxHp);

  const event: EvolutionEvent = {
    tick: 0, // set by caller
    newAbility,
    reason,
    hpBonus,
  };

  console.log(`[Evolution] Alien gained "${newAbility.name}" — ${reason}. HP: ${alien.hp}/${alien.maxHp}`);
  return event;
}
