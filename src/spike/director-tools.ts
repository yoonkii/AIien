/**
 * Director function calling tools for Gemini.
 * These define the alien Director's action space.
 */
import type { FunctionDeclaration } from "@google/generative-ai";

export const directorTools: FunctionDeclaration[] = [
  {
    name: "director_decision",
    description:
      "Submit the Director's complete decision for this tick. This is the ONLY tool you should call. It bundles strategy, environment actions, vocalization, and inner monologue into one decision. You MUST call this tool exactly once per turn.",
    parameters: {
      type: "object" as const,
      properties: {
        strategy: {
          type: "string",
          enum: ["hunt", "stalk", "ambush", "patrol", "retreat", "terrorize"],
          description:
            "The alien's high-level hunting strategy. hunt=aggressive pursuit, stalk=follow at distance, ambush=wait at chokepoint, patrol=sweep rooms, retreat=flee to vent, terrorize=environmental manipulation only",
        },
        target_player: {
          type: "string",
          description:
            "Nickname of the player to focus on. Required for hunt/stalk/ambush. Leave empty for patrol/retreat/terrorize.",
        },
        environment_actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action_type: {
                type: "string",
                enum: ["lights", "door", "power"],
                description: "lights=toggle room lighting, door=lock/unlock/open, power=ship-wide power",
              },
              room: {
                type: "string",
                description: "Which room to affect",
              },
              value: {
                type: "string",
                description: "For lights: 'on'/'off'. For doors: 'open'/'closed'/'locked'. For power: 'on'/'off'.",
              },
            },
            required: ["action_type", "room", "value"],
          },
          description: "Environmental manipulations to execute this tick. Can be empty array.",
        },
        vocalize: {
          type: "string",
          enum: ["hiss", "screech", "silence", "none"],
          description: "Sound to produce. 'none' for no vocalization.",
        },
        inner_monologue: {
          type: "string",
          description: "The alien's inner thought, in-character. Visible to spectators only. Express personality.",
        },
        reasoning: {
          type: "string",
          description: "Brief tactical reasoning for this decision. Why this strategy? Why these environment changes?",
        },
      },
      required: ["strategy", "inner_monologue", "reasoning"],
    },
  },
];
