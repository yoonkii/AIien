/**
 * Alien Generator — Gemini creates a unique alien card at session start.
 * Each run has a different alien with different abilities, personality, and voice.
 * Fallback: 5 hardcoded alien cards if Gemini fails.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AlienCard, AlienAbility } from "./AlienCard";
import { LURKER_CARD } from "./AlienCard";

const GENERATION_PROMPT = `You are creating an alien creature for a horror game. Generate a unique alien with a distinct personality and abilities.

You MUST return ONLY a valid JSON object. No markdown formatting, no code blocks, no explanation text. Just the raw JSON object matching this schema:
{
  "name": string (1-2 words, evocative horror name),
  "bodyType": "fast" | "tanky" | "stealth" | "swarm",
  "hp": number (50-150, based on bodyType: fast=50-80, tanky=120-150, stealth=60-90, swarm=40-60),
  "speed": number (1.0-3.0, fast=2.5-3.0, tanky=1.0-1.5, stealth=1.5-2.0, swarm=2.0-2.5),
  "abilities": [2-4 abilities, each: {
    "name": string (creative ability name),
    "cooldown": number (5-20 seconds),
    "range": number (0-6 tiles, 0=self/melee),
    "damage": number (0-40),
    "description": string (1 sentence, what it does mechanically)
  }],
  "movementStyle": "ground" | "ceiling" | "vents-only" | "teleport",
  "personality": "aggressive" | "patient" | "sadistic" | "curious",
  "voiceStyle": string (describe how this alien thinks/speaks in its inner monologue, 1 sentence)
}

Make each alien feel DIFFERENT. A patient ceiling-crawler thinks differently than an aggressive ground-charger. The voiceStyle should give the inner monologue real character — not generic "hunt prey" but specific personality.

Examples of good voiceStyle:
- "Speaks in fragmented, obsessive whispers. Fixates on one target."
- "Cold and analytical. Refers to players as specimens. Clinical detachment."
- "Gleeful and cruel. Enjoys the chase more than the kill. Taunts internally."
- "Ancient and weary. Hunts out of instinct, not malice. Poetic observations."`;

// ── Fallback hardcoded cards ─────────────────────────────────────
const FALLBACK_CARDS: AlienCard[] = [
  LURKER_CARD,
  {
    name: "Brute",
    bodyType: "tanky",
    hp: 140,
    speed: 1.2,
    abilities: [
      { name: "Charge", cooldown: 10, range: 5, damage: 35, description: "Rush forward in a line, damaging everything in path", currentCooldown: 0 },
      { name: "Armor Plates", cooldown: 20, range: 0, damage: 0, description: "Reduce incoming damage by 50% for 5 seconds", currentCooldown: 0 },
      { name: "Ground Slam", cooldown: 15, range: 2, damage: 20, description: "AoE slam that stuns nearby players for 1 second", currentCooldown: 0 },
    ],
    movementStyle: "ground",
    personality: "aggressive",
    voiceStyle: "Blunt and direct. Speaks in short, declarative sentences. Doesn't understand fear, only obstacles.",
  },
  {
    name: "Phantom",
    bodyType: "stealth",
    hp: 70,
    speed: 1.8,
    abilities: [
      { name: "Phase Walk", cooldown: 8, range: 0, damage: 0, description: "Become invisible for 3 seconds, can pass through doors", currentCooldown: 0 },
      { name: "Mimic Sound", cooldown: 12, range: 6, damage: 0, description: "Create a false sound at target location to lure players", currentCooldown: 0 },
      { name: "Shadow Strike", cooldown: 15, range: 1, damage: 30, description: "Attack from stealth for bonus damage", currentCooldown: 0 },
    ],
    movementStyle: "vents-only",
    personality: "sadistic",
    voiceStyle: "Gleeful and cruel. Enjoys watching players panic more than killing them. Internal giggling.",
  },
  {
    name: "Hivemind",
    bodyType: "swarm",
    hp: 50,
    speed: 2.2,
    abilities: [
      { name: "Spore Cloud", cooldown: 6, range: 3, damage: 5, description: "Release spores that damage players in an area over time", currentCooldown: 0 },
      { name: "Split", cooldown: 25, range: 0, damage: 0, description: "Create a decoy that moves toward the nearest player", currentCooldown: 0 },
      { name: "Consume", cooldown: 10, range: 1, damage: 15, description: "Absorb a player's health to heal self", currentCooldown: 0 },
    ],
    movementStyle: "ground",
    personality: "curious",
    voiceStyle: "Speaks in plural 'we'. Fascinated by human behavior. Studies before striking. Alien curiosity.",
  },
  {
    name: "Wraith",
    bodyType: "stealth",
    hp: 80,
    speed: 2.0,
    abilities: [
      { name: "Ceiling Drop", cooldown: 8, range: 2, damage: 25, description: "Drop from ceiling onto unsuspecting player below", currentCooldown: 0 },
      { name: "Darkness Pulse", cooldown: 15, range: 4, damage: 0, description: "Disable lights in current room and adjacent rooms for 10 seconds", currentCooldown: 0 },
      { name: "Tendril Grab", cooldown: 12, range: 3, damage: 15, description: "Pull a player 2 tiles toward the alien", currentCooldown: 0 },
    ],
    movementStyle: "ceiling",
    personality: "patient",
    voiceStyle: "Ancient and weary. Hunts out of instinct, not malice. Poetic observations about human fragility.",
  },
];

// ── Generator ────────────────────────────────────────────────────
export async function generateAlienCard(apiKey: string): Promise<{ card: AlienCard; generated: boolean }> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 1.2, // High creativity for unique aliens
      },
    });

    const result = await Promise.race([
      model.generateContent(GENERATION_PROMPT),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Alien generation timeout")), 10000)
      ),
    ]);

    const text = result.response.text();
    const parsed = JSON.parse(text);

    // Validate required fields
    if (!parsed.name || !parsed.bodyType || !parsed.abilities || !Array.isArray(parsed.abilities)) {
      throw new Error("Invalid alien card structure");
    }

    // Build card with validated abilities
    const card: AlienCard = {
      name: String(parsed.name).slice(0, 30),
      bodyType: ["fast", "tanky", "stealth", "swarm"].includes(parsed.bodyType) ? parsed.bodyType : "fast",
      hp: clamp(Number(parsed.hp) || 80, 40, 160),
      speed: clamp(Number(parsed.speed) || 2.0, 0.8, 3.5),
      abilities: parsed.abilities.slice(0, 4).map((a: any): AlienAbility => ({
        name: String(a.name || "Unknown").slice(0, 30),
        cooldown: clamp(Number(a.cooldown) || 10, 3, 30),
        range: clamp(Number(a.range) || 0, 0, 8),
        damage: clamp(Number(a.damage) || 0, 0, 50),
        description: String(a.description || "").slice(0, 100),
        currentCooldown: 0,
      })),
      movementStyle: ["ground", "ceiling", "vents-only", "teleport"].includes(parsed.movementStyle)
        ? parsed.movementStyle
        : "ground",
      personality: ["aggressive", "patient", "sadistic", "curious"].includes(parsed.personality)
        ? parsed.personality
        : "patient",
      voiceStyle: String(parsed.voiceStyle || "Cold and predatory.").slice(0, 200),
    };

    return { card, generated: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[AlienGen] Gemini failed (${msg}), using fallback card`);

    // Pick a random fallback card
    const idx = Math.floor(Math.random() * FALLBACK_CARDS.length);
    return { card: FALLBACK_CARDS[idx], generated: false };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
