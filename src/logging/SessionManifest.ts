/**
 * Session Manifest — captures complete session config for reproducibility.
 * Inspired by budok-ai's MatchManifest pattern.
 *
 * Written once at session start. Enables bug reproduction,
 * balancing analysis, and replay correlation.
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { AlienCard } from "../ai/AlienCard";

export interface SessionManifestData {
  sessionId: string;
  startedAt: string;
  seed: number | undefined;
  useProceduralShip: boolean;
  alienCard: AlienCard;
  alienGenerated: boolean;
  players: string[];
  modelVersion: string;
  directorIntervalTicks: number;
  gameTimeoutTicks: number;
  spectatorPort: number;
  version: string;
}

export class SessionManifest {
  private filePath: string;

  constructor(sessionId: string) {
    this.filePath = join(process.cwd(), "data", "sessions", `manifest-${sessionId}.json`);
  }

  async write(data: SessionManifestData): Promise<void> {
    const dir = join(process.cwd(), "data", "sessions");
    await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2) + "\n");
    console.log(`[Manifest] Session manifest saved: ${this.filePath}`);
  }

  getFilePath(): string {
    return this.filePath;
  }
}
