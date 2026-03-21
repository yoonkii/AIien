/**
 * Alien card — defines the alien's body type, abilities, and personality.
 * Phase 1: hardcoded Lurker. Phase 2: Gemini-generated per session.
 */

export interface AlienAbility {
  name: string;
  cooldown: number; // seconds
  range: number; // tiles
  damage: number;
  description: string;
  currentCooldown: number; // ticks remaining
}

export interface AlienCard {
  name: string;
  bodyType: "fast" | "tanky" | "stealth" | "swarm";
  hp: number;
  speed: number; // tiles per second
  abilities: AlienAbility[];
  movementStyle: "ground" | "ceiling" | "vents-only" | "teleport";
  personality: "aggressive" | "patient" | "sadistic" | "curious";
  voiceStyle: string;
}

/** Phase 1 hardcoded alien */
export const LURKER_CARD: AlienCard = {
  name: "Lurker",
  bodyType: "fast",
  hp: 100,
  speed: 2.5,
  abilities: [
    {
      name: "Ceiling Crawl",
      cooldown: 5,
      range: 0,
      damage: 0,
      description: "Move along ceiling, invisible to players without flashlights",
      currentCooldown: 0,
    },
    {
      name: "Acid Spit",
      cooldown: 8,
      range: 4,
      damage: 20,
      description: "Ranged acid attack, damages target and leaves residue",
      currentCooldown: 0,
    },
    {
      name: "Vent Dash",
      cooldown: 12,
      range: 0,
      damage: 30,
      description: "Burst from vent onto nearby player, high damage surprise attack",
      currentCooldown: 0,
    },
  ],
  movementStyle: "ceiling",
  personality: "patient",
  voiceStyle: "cold, calculating, speaks in short declarative sentences",
};
