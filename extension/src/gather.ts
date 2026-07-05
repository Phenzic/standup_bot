import { Store } from "./store";
import { cfg } from "./config";
import { collectCommits } from "./git";
import { collectGitHub, githubToken } from "./github";
import { collectCursorPrompts } from "./cursor";
import { ActivityEvent, FileTouch, StandupContext } from "./types";

function aggregateTouches(events: ActivityEvent[]): FileTouch[] {
  const map = new Map<string, FileTouch>();
  for (const ev of events) {
    const key = `${ev.project}::${ev.file}`;
    const t = map.get(key) ?? {
      file: ev.file,
      project: ev.project,
      lang: ev.lang,
      saves: 0,
      edits: 0,
      lastTs: ev.ts,
    };
    if (ev.type === "save") {
      t.saves++;
    } else {
      t.edits++;
    }
    if (ev.ts > t.lastTs) {
      t.lastTs = ev.ts;
    }
    map.set(key, t);
  }
  // Most-touched first.
  return [...map.values()].sort(
    (a, b) => b.saves + b.edits - (a.saves + a.edits),
  );
}

// Pull together everything for the stand-up window.
export async function gatherContext(store: Store): Promise<StandupContext> {
  const c = cfg();
  const until = new Date();
  const since = new Date(until.getTime() - c.lookbackHours * 3600_000);

  const token = await githubToken(false);
  const [commits, github, cursorPrompts] = await Promise.all([
    collectCommits(since, until),
    collectGitHub(token, c.githubRepos, since),
    c.cursorEnabled ? collectCursorPrompts(since, until) : Promise.resolve([]),
  ]);

  const touches = aggregateTouches(store.readRange(since, until));

  return { since, until, commits, touches, github, cursorPrompts };
}

// Render the gathered context as a compact text block for the model / debug view.
export function contextToText(ctx: StandupContext): string {
  const lines: string[] = [];

  if (ctx.commits.length) {
    lines.push("## Git commits");
    for (const cm of ctx.commits) {
      lines.push(`- [${cm.repo}] ${cm.subject}${cm.body ? ` — ${cm.body.replace(/\s+/g, " ").slice(0, 200)}` : ""}`);
    }
    lines.push("");
  }

  if (ctx.github.length) {
    lines.push("## GitHub");
    for (const g of ctx.github) {
      const tag = g.kind === "pr" ? "merged PR" : "closed issue";
      lines.push(`- [${g.repo}] ${tag} #${g.number}: ${g.title}`);
    }
    lines.push("");
  }

  if (ctx.cursorPrompts.length) {
    lines.push("## AI prompts I gave my assistant today (shows intent / in-progress work)");
    for (const p of ctx.cursorPrompts) {
      lines.push(`- ${p.text}`);
    }
    lines.push("");
  }

  if (ctx.touches.length) {
    lines.push("## Files worked on (not necessarily committed)");
    for (const t of ctx.touches.slice(0, 25)) {
      lines.push(`- [${t.project}] ${t.file} (${t.lang}, ${t.saves} saves)`);
    }
    lines.push("");
  }

  if (lines.length === 0) {
    lines.push("(No tracked activity in this window.)");
  }
  return lines.join("\n");
}
