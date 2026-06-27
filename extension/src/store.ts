import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ActivityEvent } from "./types";

// Local, on-disk activity log. One JSON file per day under the extension's
// global storage dir. Nothing here ever leaves the machine.
export class Store {
  private dir: string;
  private buffer: ActivityEvent[] = [];
  private flushTimer: NodeJS.Timeout | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.dir = path.join(context.globalStorageUri.fsPath, "activity");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private fileFor(dateKey: string): string {
    return path.join(this.dir, `activity-${dateKey}.json`);
  }

  private static dateKey(d: Date): string {
    // Local YYYY-MM-DD so a "day" matches the user's wall clock.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Queue an event; flushed to disk on a short debounce.
  add(ev: ActivityEvent): void {
    this.buffer.push(ev);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 3000);
    }
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.buffer.length === 0) {
      return;
    }
    const pending = this.buffer;
    this.buffer = [];

    // Group by day in case a flush straddles midnight.
    const byDay = new Map<string, ActivityEvent[]>();
    for (const ev of pending) {
      const key = Store.dateKey(new Date(ev.ts));
      const arr = byDay.get(key) ?? [];
      arr.push(ev);
      byDay.set(key, arr);
    }
    for (const [key, evs] of byDay) {
      const file = this.fileFor(key);
      const existing = this.readFile(file);
      existing.push(...evs);
      try {
        fs.writeFileSync(file, JSON.stringify(existing), "utf8");
      } catch (e) {
        console.error("[standup] failed to write activity:", e);
      }
    }
  }

  private readFile(file: string): ActivityEvent[] {
    try {
      if (!fs.existsSync(file)) {
        return [];
      }
      return JSON.parse(fs.readFileSync(file, "utf8")) as ActivityEvent[];
    } catch {
      return [];
    }
  }

  // All events between two dates (inclusive of the days they fall in).
  readRange(since: Date, until: Date): ActivityEvent[] {
    this.flush();
    const out: ActivityEvent[] = [];
    const cursor = new Date(since);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= until) {
      const evs = this.readFile(this.fileFor(Store.dateKey(cursor)));
      for (const ev of evs) {
        const t = new Date(ev.ts);
        if (t >= since && t <= until) {
          out.push(ev);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }
}
