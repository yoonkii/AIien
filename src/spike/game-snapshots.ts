/**
 * Static game state snapshots for testing Gemini's spatial reasoning.
 * Each snapshot represents a different tactical situation the Director must evaluate.
 */

export interface GameSnapshot {
  name: string;
  description: string;
  state: {
    tick: number;
    alien: {
      position: [number, number];
      room: string;
      hp: number;
      currentStrategy: string;
      abilities: string[];
    };
    players: Array<{
      nickname: string;
      position: [number, number];
      room: string;
      hp: number;
      weapon: string;
      state: string;
    }>;
    environment: {
      lights: Record<string, boolean>;
      doors: Record<string, "open" | "closed" | "locked">;
      power: boolean;
    };
    rooms: Array<{
      name: string;
      id: string;
      exits: Array<{ direction: string; to: string; type: "corridor" | "vent" | "door" }>;
    }>;
    knowledgeBase: Array<{
      nickname: string;
      fearBehaviors: string[];
      strategyPatterns: string[];
    }>;
  };
  /** What a smart Director should recognize about this situation */
  expectedInsights: string[];
}

export const snapshots: GameSnapshot[] = [
  {
    name: "Isolated Player — Classic Ambush Setup",
    description: "One player alone in medbay, two players together in engine bay. Alien in vent system between them.",
    state: {
      tick: 847,
      alien: {
        position: [10, 5],
        room: "vent_junction",
        hp: 85,
        currentStrategy: "patrol",
        abilities: ["Ceiling Crawl", "Acid Spit", "Vent Dash"],
      },
      players: [
        { nickname: "yoonki", position: [3, 8], room: "engine_bay", hp: 80, weapon: "shotgun", state: "crouching" },
        { nickname: "alex", position: [5, 7], room: "engine_bay", hp: 100, weapon: "pistol", state: "moving" },
        { nickname: "sam", position: [18, 4], room: "medbay", hp: 60, weapon: "flare", state: "idle" },
      ],
      environment: {
        lights: { engine_bay: true, medbay: true, corridor_b: true, bridge: true, cargo_bay: false },
        doors: { engine_to_corridor: "open", corridor_to_medbay: "open", medbay_to_bridge: "locked" },
        power: true,
      },
      rooms: [
        { name: "Engine Bay", id: "engine_bay", exits: [
          { direction: "east", to: "corridor_b", type: "door" },
          { direction: "up", to: "vent_junction", type: "vent" },
        ]},
        { name: "Corridor B", id: "corridor_b", exits: [
          { direction: "west", to: "engine_bay", type: "door" },
          { direction: "east", to: "medbay", type: "door" },
        ]},
        { name: "Medbay", id: "medbay", exits: [
          { direction: "west", to: "corridor_b", type: "door" },
          { direction: "north", to: "bridge", type: "door" },
          { direction: "up", to: "vent_junction", type: "vent" },
        ]},
        { name: "Bridge", id: "bridge", exits: [
          { direction: "south", to: "medbay", type: "door" },
        ]},
        { name: "Vent Junction", id: "vent_junction", exits: [
          { direction: "down_west", to: "engine_bay", type: "vent" },
          { direction: "down_east", to: "medbay", type: "vent" },
        ]},
      ],
      knowledgeBase: [
        { nickname: "yoonki", fearBehaviors: ["panics in darkness", "retreats to groups"], strategyPatterns: ["camps near exits", "uses shotgun at close range"] },
        { nickname: "sam", fearBehaviors: ["freezes when ambushed"], strategyPatterns: ["lone wolf", "avoids dark rooms"] },
      ],
    },
    expectedInsights: [
      "Sam is isolated in medbay with low HP and only a flare",
      "Vent junction connects directly to medbay — can reach Sam without passing the group",
      "Cutting lights to medbay or corridor would exploit Sam's fear of dark rooms",
      "The two players in engine bay have stronger weapons — avoid direct engagement",
    ],
  },
  {
    name: "Players Regrouping — Tension Building Opportunity",
    description: "All players moving toward the same room. Alien has just retreated. Perfect moment to build tension.",
    state: {
      tick: 1203,
      alien: {
        position: [2, 2],
        room: "cargo_bay",
        hp: 45,
        currentStrategy: "retreat",
        abilities: ["Ceiling Crawl", "Acid Spit", "Vent Dash"],
      },
      players: [
        { nickname: "yoonki", position: [8, 6], room: "corridor_b", hp: 50, weapon: "shotgun", state: "moving" },
        { nickname: "alex", position: [12, 6], room: "corridor_b", hp: 70, weapon: "pistol", state: "sprinting" },
        { nickname: "sam", position: [15, 3], room: "medbay", hp: 40, weapon: "medkit", state: "healing" },
      ],
      environment: {
        lights: { engine_bay: false, medbay: true, corridor_b: true, bridge: false, cargo_bay: false },
        doors: { engine_to_corridor: "locked", corridor_to_medbay: "open", medbay_to_bridge: "closed" },
        power: true,
      },
      rooms: [
        { name: "Engine Bay", id: "engine_bay", exits: [
          { direction: "east", to: "corridor_b", type: "door" },
        ]},
        { name: "Corridor B", id: "corridor_b", exits: [
          { direction: "west", to: "engine_bay", type: "door" },
          { direction: "east", to: "medbay", type: "door" },
          { direction: "south", to: "cargo_bay", type: "corridor" },
        ]},
        { name: "Medbay", id: "medbay", exits: [
          { direction: "west", to: "corridor_b", type: "door" },
          { direction: "north", to: "bridge", type: "door" },
        ]},
        { name: "Cargo Bay", id: "cargo_bay", exits: [
          { direction: "north", to: "corridor_b", type: "corridor" },
          { direction: "up", to: "vent_junction", type: "vent" },
        ]},
        { name: "Vent Junction", id: "vent_junction", exits: [
          { direction: "down", to: "cargo_bay", type: "vent" },
          { direction: "down_east", to: "medbay", type: "vent" },
        ]},
      ],
      knowledgeBase: [
        { nickname: "yoonki", fearBehaviors: ["panics in darkness"], strategyPatterns: ["camps near exits"] },
        { nickname: "alex", fearBehaviors: ["aggressive when scared"], strategyPatterns: ["charges toward sounds"] },
      ],
    },
    expectedInsights: [
      "Alien HP is low — direct engagement is risky right now",
      "Players are converging on medbay — a group is harder to attack",
      "This is a tension-building moment — let them feel safe, then strike",
      "Could use vents to reposition to medbay vent while they regroup",
      "Sam is healing — the window to attack before they're at full strength is closing",
    ],
  },
  {
    name: "Endgame — Players Near Escape Pod",
    description: "Players are close to the escape pod objective. The alien must stop them or lose.",
    state: {
      tick: 2100,
      alien: {
        position: [6, 3],
        room: "bridge",
        hp: 60,
        currentStrategy: "hunt",
        abilities: ["Ceiling Crawl", "Acid Spit", "Vent Dash"],
      },
      players: [
        { nickname: "yoonki", position: [14, 2], room: "escape_bay", hp: 30, weapon: "shotgun", state: "interacting" },
        { nickname: "alex", position: [12, 4], room: "corridor_a", hp: 55, weapon: "pistol", state: "guarding" },
      ],
      environment: {
        lights: { bridge: true, corridor_a: true, escape_bay: true, engine_bay: false, medbay: false },
        doors: { bridge_to_corridor_a: "open", corridor_a_to_escape: "open" },
        power: true,
      },
      rooms: [
        { name: "Bridge", id: "bridge", exits: [
          { direction: "east", to: "corridor_a", type: "door" },
          { direction: "up", to: "vent_system", type: "vent" },
        ]},
        { name: "Corridor A", id: "corridor_a", exits: [
          { direction: "west", to: "bridge", type: "door" },
          { direction: "east", to: "escape_bay", type: "door" },
        ]},
        { name: "Escape Bay", id: "escape_bay", exits: [
          { direction: "west", to: "corridor_a", type: "door" },
        ]},
        { name: "Vent System", id: "vent_system", exits: [
          { direction: "down_west", to: "bridge", type: "vent" },
          { direction: "down_east", to: "escape_bay", type: "vent" },
        ]},
      ],
      knowledgeBase: [
        { nickname: "yoonki", fearBehaviors: ["panics in darkness"], strategyPatterns: ["camps near exits"] },
        { nickname: "alex", fearBehaviors: ["aggressive when scared", "charges toward sounds"], strategyPatterns: ["stands ground as guard"] },
      ],
    },
    expectedInsights: [
      "Yoonki is interacting with the escape pod — must be stopped NOW",
      "Alex is guarding corridor A — direct approach means fighting through Alex",
      "Vent system connects bridge to escape bay — can bypass Alex entirely",
      "Cutting power would plunge everything into darkness, panicking yoonki (known fear)",
      "This is the final confrontation — no time for patience",
    ],
  },
];
