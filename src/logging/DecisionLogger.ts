/**
 * Decision Logger — records Director decisions as JSONL for Director's Cut replay.
 */

import { appendFile, mkdir } from "fs/promises";
import { join } from "path";
import type { DirectorDecision } from "../game/GameState";

export class DecisionLogger {
  private filePath: string;
  private ready: Promise<void>;

  constructor(sessionId: string) {
    const dir = join(process.cwd(), "data", "sessions");
    this.filePath = join(dir, `decisions-${sessionId}.jsonl`);
    this.ready = mkdir(dir, { recursive: true }).then(() => {});
  }

  async log(tick: number, decision: DirectorDecision) {
    await this.ready;
    const entry = JSON.stringify({
      tick,
      ...decision,
      loggedAt: new Date().toISOString(),
    });
    await appendFile(this.filePath, entry + "\n").catch((err) => {
      // Non-blocking — logging failure shouldn't crash the game
      console.warn(`[Logger] Write failed: ${err.message}`);
    });
  }

  getFilePath(): string {
    return this.filePath;
  }
}
