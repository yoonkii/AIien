/**
 * Environment System — the ship as a weapon.
 * Applies Director's environmental actions to game state.
 */

import type { GameState, DirectorDecision } from "../game/GameState";
import type { Room } from "../game/TileMap";

/** Find room by ID or by name (fuzzy match for Gemini's output) */
function findRoom(state: GameState, roomRef: string): Room | null {
  // Try exact ID match first
  const byId = state.map.rooms.find((r) => r.id === roomRef);
  if (byId) return byId;

  // Try case-insensitive name match
  const lower = roomRef.toLowerCase().replace(/[^a-z]/g, "");
  return state.map.rooms.find((r) => r.name.toLowerCase().replace(/[^a-z]/g, "") === lower) ?? null;
}

/** Apply environment actions from a Director decision */
export function applyEnvironmentActions(state: GameState, decision: DirectorDecision) {
  for (const action of decision.environmentActions) {
    switch (action.actionType) {
      case "lights": {
        const room = findRoom(state, action.room);
        if (!room) {
          console.warn(`[Env] Unknown room: ${action.room}`);
          break;
        }
        state.environment.lights.set(room.id, action.value === "on");
        break;
      }
      case "door": {
        const room = findRoom(state, action.room);
        if (!room) {
          console.warn(`[Env] Unknown room for door: ${action.room}`);
          break;
        }
        // Apply to all door exits of this room
        for (const exit of room.exits) {
          if (exit.type === "door") {
            const key = `${exit.pos[0]},${exit.pos[1]}`;
            const val = action.value as "open" | "closed" | "locked";
            if (["open", "closed", "locked"].includes(val)) {
              state.environment.doors.set(key, val);
            }
          }
        }
        break;
      }
      case "power": {
        state.environment.power = action.value === "on";
        // When power is off, all lights go off
        if (!state.environment.power) {
          for (const room of state.map.rooms) {
            state.environment.lights.set(room.id, false);
          }
        }
        break;
      }
    }
  }
}
