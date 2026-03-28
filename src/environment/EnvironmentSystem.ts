/**
 * Environment System — the ship as a weapon.
 * Applies Director's environmental actions to game state.
 *
 * Adapted for platformer: doors toggle between solid/passable tiles.
 */

import type { GameState, DirectorDecision } from "../game/GameState";
import { findRoom } from "../game/TileMap";

/** Apply environment actions from a Director decision */
export function applyEnvironmentActions(state: GameState, decision: DirectorDecision) {
  for (const action of decision.environmentActions) {
    switch (action.actionType) {
      case "lights": {
        const room = findRoom(state.map, action.room);
        if (!room) {
          console.warn(`[Env] Unknown room: ${action.room}`);
          break;
        }
        state.environment.lights.set(room.id, action.value === "on");
        break;
      }
      case "door": {
        const room = findRoom(state.map, action.room);
        if (!room) {
          console.warn(`[Env] Unknown room for door: ${action.room}`);
          break;
        }
        // Find all door tiles in this room and update their state
        for (let y = room.y; y < room.y + room.height; y++) {
          for (let x = room.x; x < room.x + room.width; x++) {
            if (state.map.tiles[y]?.[x] === 5) {
              const key = `${x},${y}`;
              const val = action.value as "open" | "closed" | "locked";
              if (["open", "closed", "locked"].includes(val)) {
                state.environment.doors.set(key, val);
              }
            }
          }
        }
        break;
      }
      case "power": {
        state.environment.power = action.value === "on";
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
