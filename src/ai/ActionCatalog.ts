/**
 * Action Catalog — metadata for every Director action.
 * Inspired by budok-ai's move_catalog.json pattern.
 *
 * Each action has fear_impact, cooldown hints, and narrative weight
 * so the Director can make more informed decisions.
 */

export interface ActionMeta {
  id: string;
  type: "environment" | "vocalization" | "strategy";
  description: string;
  fearImpact: number; // 1-10 scale
  cooldownHint: number; // suggested minimum ticks between uses
  narrativeWeight: "low" | "medium" | "high";
  /** What this action counters or synergizes with */
  notes: string;
}

export const ACTION_CATALOG: ActionMeta[] = [
  // ── Environment Actions ──
  {
    id: "lights_off",
    type: "environment",
    description: "Turn off lights in a room, plunging players into darkness",
    fearImpact: 8,
    cooldownHint: 50,
    narrativeWeight: "high",
    notes: "Most effective against players who fear darkness. Combine with stalk or ambush.",
  },
  {
    id: "lights_on",
    type: "environment",
    description: "Restore lights — can create false sense of safety before an ambush",
    fearImpact: 2,
    cooldownHint: 10,
    narrativeWeight: "low",
    notes: "Use to reset tension. Lights on → players relax → then strike.",
  },
  {
    id: "door_lock",
    type: "environment",
    description: "Lock a room's doors, trapping or isolating players inside",
    fearImpact: 7,
    cooldownHint: 40,
    narrativeWeight: "high",
    notes: "Best for isolation tactics. Lock a room with one player, then hunt them.",
  },
  {
    id: "door_unlock",
    type: "environment",
    description: "Unlock doors to allow movement or lure players into a trap",
    fearImpact: 1,
    cooldownHint: 5,
    narrativeWeight: "low",
    notes: "Use to funnel players toward ambush points.",
  },
  {
    id: "door_close",
    type: "environment",
    description: "Close doors without locking — creates sound cue and slows movement",
    fearImpact: 4,
    cooldownHint: 20,
    narrativeWeight: "medium",
    notes: "Closing doors remotely signals alien presence. Good for terrorize strategy.",
  },
  {
    id: "power_off",
    type: "environment",
    description: "Cut ship-wide power — all lights go dark simultaneously",
    fearImpact: 10,
    cooldownHint: 100,
    narrativeWeight: "high",
    notes: "Maximum fear. Use sparingly — overuse dulls the impact. Best as climactic moment.",
  },
  {
    id: "power_on",
    type: "environment",
    description: "Restore ship power — reveals the alien's position if visible",
    fearImpact: 3,
    cooldownHint: 20,
    narrativeWeight: "medium",
    notes: "Restoring power after darkness can be scarier than the darkness itself.",
  },

  // ── Vocalizations ──
  {
    id: "vocalize_hiss",
    type: "vocalization",
    description: "Low threatening hiss — signals nearby presence",
    fearImpact: 5,
    cooldownHint: 30,
    narrativeWeight: "medium",
    notes: "Effective during stalk. Players know you're close but can't see you.",
  },
  {
    id: "vocalize_screech",
    type: "vocalization",
    description: "Loud screech — announces aggression, startles players",
    fearImpact: 9,
    cooldownHint: 60,
    narrativeWeight: "high",
    notes: "Best paired with hunt or ambush attack. Overuse reduces shock value.",
  },
  {
    id: "vocalize_silence",
    type: "vocalization",
    description: "Deliberate silence — the absence of sound builds dread",
    fearImpact: 6,
    cooldownHint: 10,
    narrativeWeight: "medium",
    notes: "Silence after a hiss is more unsettling than continuous noise.",
  },

  // ── Strategy Descriptions ──
  {
    id: "strategy_hunt",
    type: "strategy",
    description: "Aggressive pursuit — A* pathfinding toward target, attack on contact",
    fearImpact: 7,
    cooldownHint: 0,
    narrativeWeight: "high",
    notes: "High damage but predictable. Best when player is isolated and low HP.",
  },
  {
    id: "strategy_stalk",
    type: "strategy",
    description: "Follow at 4-6 tile distance — player senses presence but can't confirm",
    fearImpact: 8,
    cooldownHint: 0,
    narrativeWeight: "high",
    notes: "Best for building tension. Combine with darkness and occasional hiss.",
  },
  {
    id: "strategy_ambush",
    type: "strategy",
    description: "Move to chokepoint and wait — surprise attack with bonus damage",
    fearImpact: 9,
    cooldownHint: 0,
    narrativeWeight: "high",
    notes: "Highest damage per hit. Requires patience and predicting player movement.",
  },
  {
    id: "strategy_patrol",
    type: "strategy",
    description: "Sweep rooms randomly — opportunistic attacks, map coverage",
    fearImpact: 3,
    cooldownHint: 0,
    narrativeWeight: "low",
    notes: "Low tension. Use between active hunting phases to reset player anxiety.",
  },
  {
    id: "strategy_retreat",
    type: "strategy",
    description: "Flee to vents and regenerate HP — survival priority",
    fearImpact: 2,
    cooldownHint: 0,
    narrativeWeight: "low",
    notes: "Necessary when HP is low. Heal on vent tiles. Don't retreat when winning.",
  },
  {
    id: "strategy_terrorize",
    type: "strategy",
    description: "Stay still, rely purely on environmental manipulation and sound",
    fearImpact: 7,
    cooldownHint: 0,
    narrativeWeight: "high",
    notes: "Alien doesn't move — all fear comes from environment. Best in mid-game.",
  },
];

/** Format the action catalog as a reference section for the Director prompt */
export function formatActionCatalogForPrompt(): string {
  const lines: string[] = ["ACTION REFERENCE (fear_impact 1-10):"];

  const envActions = ACTION_CATALOG.filter((a) => a.type === "environment");
  const vocalActions = ACTION_CATALOG.filter((a) => a.type === "vocalization");
  const stratActions = ACTION_CATALOG.filter((a) => a.type === "strategy");

  lines.push("  Environment:");
  for (const a of envActions) {
    lines.push(`    ${a.id} [fear:${a.fearImpact}] — ${a.notes}`);
  }

  lines.push("  Vocalizations:");
  for (const a of vocalActions) {
    lines.push(`    ${a.id} [fear:${a.fearImpact}] — ${a.notes}`);
  }

  lines.push("  Strategies:");
  for (const a of stratActions) {
    lines.push(`    ${a.id} [fear:${a.fearImpact}] — ${a.notes}`);
  }

  return lines.join("\n");
}
