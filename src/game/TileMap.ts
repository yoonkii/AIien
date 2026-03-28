/**
 * TileMap — platformer tile system with collision queries.
 *
 * TILE TYPES (side-scrolling perspective):
 *   0 = EMPTY — air, background, no collision
 *   1 = SOLID — floor, wall, ceiling
 *   2 = WALL  — hull/structural solid (visually different)
 *   3 = PLATFORM — one-way platform (land on top, pass through from below/sides)
 *   4 = VENT  — alien-only passage (solid for players)
 *   5 = DOOR  — togglable solid/passable (controlled by Director)
 *   6 = HAZARD — pass through but deals damage on contact
 */

import { TILE_SIZE, TileType } from "./Physics";
import type { LevelMap, RoomInfo } from "./GameState";

// ── Coordinate Conversion ───────────────────────────────────────

export function worldToTile(px: number): number {
  return Math.floor(px / TILE_SIZE);
}

export function tileToWorld(t: number): number {
  return t * TILE_SIZE;
}

// ── Tile Queries ────────────────────────────────────────────────

/** Get the tile value at a world pixel coordinate */
export function getTileAtWorld(
  map: LevelMap,
  px: number,
  py: number
): number {
  const tx = worldToTile(px);
  const ty = worldToTile(py);
  return getTile(map, tx, ty);
}

/** Get the tile value at tile coordinates */
export function getTile(map: LevelMap, tx: number, ty: number): number {
  if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) {
    return TileType.SOLID; // out of bounds = solid
  }
  return map.tiles[ty]?.[tx] ?? TileType.SOLID;
}

/** Set a tile value at tile coordinates */
export function setTile(
  map: LevelMap,
  tx: number,
  ty: number,
  value: number
): void {
  if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return;
  if (map.tiles[ty]) {
    map.tiles[ty]![tx] = value;
  }
}

/** Get all tiles overlapping a pixel-space rectangle */
export function getTilesInRect(
  map: LevelMap,
  x: number,
  y: number,
  width: number,
  height: number
): { tx: number; ty: number; tile: number }[] {
  const result: { tx: number; ty: number; tile: number }[] = [];
  const left = worldToTile(x);
  const right = worldToTile(x + width - 1);
  const top = worldToTile(y);
  const bottom = worldToTile(y + height - 1);

  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      result.push({ tx, ty, tile: getTile(map, tx, ty) });
    }
  }
  return result;
}

// ── Room Queries ────────────────────────────────────────────────

/** Find which room contains a world pixel position */
export function getRoomAtWorld(
  map: LevelMap,
  px: number,
  py: number
): RoomInfo | null {
  const tx = worldToTile(px);
  const ty = worldToTile(py);
  for (const room of map.rooms) {
    if (
      tx >= room.x &&
      tx < room.x + room.width &&
      ty >= room.y &&
      ty < room.y + room.height
    ) {
      return room;
    }
  }
  return null;
}

/** Find a room by its ID */
export function getRoomById(map: LevelMap, id: string): RoomInfo | null {
  return map.rooms.find((r) => r.id === id) ?? null;
}

/** Find room by name (fuzzy match for Gemini output) */
export function findRoom(map: LevelMap, roomRef: string): RoomInfo | null {
  // Exact ID match
  const byId = map.rooms.find((r) => r.id === roomRef);
  if (byId) return byId;

  // Case-insensitive name match
  const lower = roomRef.toLowerCase().replace(/[^a-z]/g, "");
  return (
    map.rooms.find(
      (r) => r.name.toLowerCase().replace(/[^a-z]/g, "") === lower
    ) ?? null
  );
}

// ── A* Pathfinding (tile-level for AI navigation) ───────────────

interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

/**
 * A* pathfinding on tile grid — used by alien AI for high-level navigation.
 * Returns path as array of tile coordinates, or null if no path found.
 */
export function findPath(
  map: LevelMap,
  startTX: number,
  startTY: number,
  endTX: number,
  endTY: number,
  isAlien: boolean,
  doorStates?: Map<string, string>
): [number, number][] | null {
  // Clamp to map bounds
  startTX = Math.max(0, Math.min(map.width - 1, startTX));
  startTY = Math.max(0, Math.min(map.height - 1, startTY));
  endTX = Math.max(0, Math.min(map.width - 1, endTX));
  endTY = Math.max(0, Math.min(map.height - 1, endTY));

  const key = (x: number, y: number) => `${x},${y}`;
  const open: PathNode[] = [];
  const closed = new Set<string>();

  const start: PathNode = {
    x: startTX,
    y: startTY,
    g: 0,
    h: Math.abs(endTX - startTX) + Math.abs(endTY - startTY),
    f: 0,
    parent: null,
  };
  start.f = start.g + start.h;
  open.push(start);

  const isWalkable = (tx: number, ty: number): boolean => {
    if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return false;
    const tile = getTile(map, tx, ty);
    if (tile === TileType.EMPTY || tile === TileType.PLATFORM || tile === TileType.HAZARD) return true;
    if (tile === TileType.VENT && isAlien) return true;
    if (tile === TileType.DOOR) {
      const state = doorStates?.get(`${tx},${ty}`);
      return state === "open";
    }
    return false;
  };

  let iterations = 0;
  const maxIterations = 2000;

  while (open.length > 0 && iterations < maxIterations) {
    iterations++;

    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIdx]!.f) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0]!;

    if (current.x === endTX && current.y === endTY) {
      const path: [number, number][] = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift([node.x, node.y]);
        node = node.parent;
      }
      return path;
    }

    closed.add(key(current.x, current.y));

    const dirs: [number, number][] = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];

    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (closed.has(key(nx, ny))) continue;
      if (!isWalkable(nx, ny)) continue;

      const g = current.g + 1;
      const h = Math.abs(endTX - nx) + Math.abs(endTY - ny);

      const existing = open.find((n) => n.x === nx && n.y === ny);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + h;
          existing.parent = current;
        }
      } else {
        open.push({ x: nx, y: ny, g, h, f: g + h, parent: current });
      }
    }
  }

  return null;
}
