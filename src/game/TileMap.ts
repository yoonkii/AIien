/**
 * Tile-based map representation with A* pathfinding.
 *
 * COORDINATE SYSTEM:
 *   (0,0) is top-left. X increases right, Y increases down.
 *   Each room is a rectangle of tiles placed at an offset in the global grid.
 *
 * TILE TYPES:
 *   0 = void (impassable, outside ship)
 *   1 = floor (walkable)
 *   2 = wall (impassable)
 *   3 = door (walkable when open, impassable when locked)
 *   4 = vent (alien-only passage)
 */

export type TileType = 0 | 1 | 2 | 3 | 4;

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  exits: RoomExit[];
}

export interface RoomExit {
  direction: string;
  toRoomId: string;
  type: "corridor" | "vent" | "door";
  pos: [number, number];
}

export interface TileMap {
  width: number;
  height: number;
  tiles: TileType[][];
  rooms: Room[];
}

export function getRoomAt(map: TileMap, x: number, y: number): Room | null {
  for (const room of map.rooms) {
    if (x >= room.x && x < room.x + room.width && y >= room.y && y < room.y + room.height) {
      return room;
    }
  }
  return null;
}

/**
 * A* pathfinding on the tile grid.
 * Returns array of [x,y] from start to end (inclusive), or null if no path.
 */
export function findPath(
  map: TileMap,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  canUseVents: boolean,
  doorStates: Map<string, "open" | "closed" | "locked">
): [number, number][] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  const parseKey = (k: string): [number, number] => {
    const [x, y] = k.split(",").map(Number);
    return [x, y];
  };

  function isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
    const tile = map.tiles[y][x];
    if (tile === 0 || tile === 2) return false;
    if (tile === 4) return canUseVents;
    if (tile === 3) return doorStates.get(key(x, y)) !== "locked";
    return true;
  }

  const startKey = key(startX, startY);
  const endKey = key(endX, endY);
  const h = (x: number, y: number) => Math.abs(x - endX) + Math.abs(y - endY);

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const openSet = new Set<string>();
  const closedSet = new Set<string>();

  gScore.set(startKey, 0);
  fScore.set(startKey, h(startX, startY));
  openSet.add(startKey);

  const dirs: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];

  while (openSet.size > 0) {
    // Find lowest fScore in openSet
    let currentKey = "";
    let currentF = Infinity;
    for (const k of openSet) {
      const f = fScore.get(k) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        currentKey = k;
      }
    }

    if (currentKey === endKey) {
      // Reconstruct path
      const path: [number, number][] = [];
      let k: string | undefined = endKey;
      while (k) {
        path.unshift(parseKey(k));
        k = cameFrom.get(k);
      }
      return path;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);
    const [cx, cy] = parseKey(currentKey);

    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nk = key(nx, ny);

      if (closedSet.has(nk) || !isWalkable(nx, ny)) continue;

      // Diagonal: check that both adjacent cardinal tiles are walkable (no corner cutting)
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(cx + dx, cy) || !isWalkable(cx, cy + dy)) continue;
      }

      const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + moveCost;

      if (tentativeG >= (gScore.get(nk) ?? Infinity)) continue;

      cameFrom.set(nk, currentKey);
      gScore.set(nk, tentativeG);
      fScore.set(nk, tentativeG + h(nx, ny));
      openSet.add(nk);
    }
  }

  return null;
}
