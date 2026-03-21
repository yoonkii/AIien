/**
 * Knowledge Base — per-player profiles that persist across sessions.
 * The alien remembers your nickname from last time.
 *
 * Schema: { nickname, gamesPlayed, lastSeen, fearBehaviors[], strategyPatterns[], weapons[] }
 * Write trigger: end of each session
 * Read: loaded at session start, injected into Director API request
 * Storage: JSON files in data/players/{nickname}.json
 * TTL: 30 days
 */

import { readFile, writeFile, mkdir, readdir, stat, unlink } from "fs/promises";
import { join } from "path";

export interface PlayerProfile {
  nickname: string;
  gamesPlayed: number;
  lastSeen: string; // ISO date
  fearBehaviors: string[];
  strategyPatterns: string[];
  weapons: string[];
}

const PLAYERS_DIR = join(process.cwd(), "data", "players");
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class KnowledgeBase {
  private profiles = new Map<string, PlayerProfile>();
  private ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    await mkdir(PLAYERS_DIR, { recursive: true });
    await this.loadAll();
    await this.cleanStale();
  }

  private filePath(nickname: string): string {
    // Sanitize nickname for filesystem
    const safe = nickname.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
    return join(PLAYERS_DIR, `${safe}.json`);
  }

  private async loadAll() {
    try {
      const files = await readdir(PLAYERS_DIR);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = await readFile(join(PLAYERS_DIR, file), "utf-8");
          const profile: PlayerProfile = JSON.parse(data);
          if (profile.nickname) {
            this.profiles.set(profile.nickname, profile);
          }
        } catch {
          // Skip corrupted files
        }
      }
      if (this.profiles.size > 0) {
        console.log(`[KB] Loaded ${this.profiles.size} player profiles`);
      }
    } catch {
      // Directory might not exist yet
    }
  }

  private async cleanStale() {
    const now = Date.now();
    for (const [nickname, profile] of this.profiles) {
      const lastSeen = new Date(profile.lastSeen).getTime();
      if (now - lastSeen > TTL_MS) {
        this.profiles.delete(nickname);
        try {
          await unlink(this.filePath(nickname));
          console.log(`[KB] Cleaned stale profile: ${nickname}`);
        } catch { /* ignore */ }
      }
    }
  }

  /** Get profile for a player (returns null for first-time players) */
  async getProfile(nickname: string): Promise<PlayerProfile | null> {
    await this.ready;
    return this.profiles.get(nickname) ?? null;
  }

  /** Get profiles for all players in a session (for Director API) */
  async getProfilesForSession(nicknames: string[]): Promise<PlayerProfile[]> {
    await this.ready;
    return nicknames
      .map((n) => this.profiles.get(n))
      .filter((p): p is PlayerProfile => p != null);
  }

  /** Record session results for a player */
  async recordSession(
    nickname: string,
    data: {
      weaponsUsed: string[];
      newFearBehaviors: string[];
      newStrategyPatterns: string[];
    }
  ) {
    await this.ready;

    const existing = this.profiles.get(nickname);
    const profile: PlayerProfile = existing
      ? { ...existing }
      : {
          nickname,
          gamesPlayed: 0,
          lastSeen: new Date().toISOString(),
          fearBehaviors: [],
          strategyPatterns: [],
          weapons: [],
        };

    profile.gamesPlayed++;
    profile.lastSeen = new Date().toISOString();

    // Merge new observations (deduplicate, keep last 10)
    profile.fearBehaviors = dedupe([...profile.fearBehaviors, ...data.newFearBehaviors]).slice(-10);
    profile.strategyPatterns = dedupe([...profile.strategyPatterns, ...data.newStrategyPatterns]).slice(-10);
    profile.weapons = dedupe([...profile.weapons, ...data.weaponsUsed]).slice(-5);

    this.profiles.set(nickname, profile);

    // Persist to disk
    try {
      await writeFile(this.filePath(nickname), JSON.stringify(profile, null, 2));
    } catch (err) {
      console.warn(`[KB] Failed to save profile for ${nickname}: ${err}`);
    }
  }
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
