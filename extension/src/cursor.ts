import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { CursorPrompt } from "./types";

const pexec = promisify(execFile);

// Cursor's local chat DB. Cursor is a VS Code fork; prompts live as "bubbles"
// in cursorDiskKV (type 1 = user prompt). Read-only + immutable so a running
// Cursor is never affected. macOS path today; other platforms handled later.
function cursorDbPath(): string | null {
  const candidates = [
    path.join(os.homedir(), "Library/Application Support/Cursor/User/globalStorage/state.vscdb"),
    path.join(os.homedir(), ".config/Cursor/User/globalStorage/state.vscdb"),
    path.join(os.homedir(), "AppData/Roaming/Cursor/User/globalStorage/state.vscdb"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

// The user prompts issued to Cursor's AI within [since, until]. Empty if Cursor
// isn't installed, sqlite3 is unavailable, or nothing matches — never throws.
export async function collectCursorPrompts(since: Date, until: Date): Promise<CursorPrompt[]> {
  const db = cursorDbPath();
  if (!db) {
    return [];
  }
  const sql =
    "SELECT json_extract(value,'$.createdAt') AS ts, json_extract(value,'$.text') AS text " +
    "FROM cursorDiskKV " +
    "WHERE key LIKE 'bubbleId:%' " +
    "AND json_extract(value,'$.type')=1 " +
    "AND json_extract(value,'$.text') <> '' " +
    `AND json_extract(value,'$.createdAt') >= '${since.toISOString()}' ` +
    `AND json_extract(value,'$.createdAt') <= '${until.toISOString()}' ` +
    "ORDER BY ts DESC LIMIT 60";

  try {
    const { stdout } = await pexec(
      "sqlite3",
      ["-readonly", `file:${db}?immutable=1`, "-json", sql],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    if (!stdout.trim()) {
      return [];
    }
    const rows = JSON.parse(stdout) as Array<{ ts: string; text: string }>;
    return rows
      .map((r) => ({ ts: r.ts, text: (r.text ?? "").replace(/\s+/g, " ").trim().slice(0, 280) }))
      .filter((p) => p.text.length > 0);
  } catch (e) {
    console.error("[standup] cursor prompt read failed:", e);
    return [];
  }
}
