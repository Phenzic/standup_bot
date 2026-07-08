import { StandupContext } from "./types";

// Builds a References block with REAL links, deterministically — the model
// never sees raw URLs, so it can't mangle or hallucinate them.
export function buildReferences(ctx: StandupContext): string {
  if (ctx.github.length === 0) {
    return "";
  }
  const prs = ctx.github.filter((g) => g.kind === "pr");
  const issues = ctx.github.filter((g) => g.kind === "issue");
  const lines: string[] = ["", "**References**"];
  for (const p of prs) {
    lines.push(`- Merged PR [#${p.number}](${p.url}) — ${p.title}`);
  }
  for (const i of issues) {
    lines.push(`- Closed issue [#${i.number}](${i.url}) — ${i.title}`);
  }
  return lines.join("\n");
}

// Deterministic formatting the model half-obeys when asked: any top-level
// bullet ending in an inline run of 3+ file paths ("...: a.md, b.md, c.md")
// is rewritten with the paths as indented sub-bullets, one per line.
export function enforceSublists(md: string): string {
  const PATHISH = /[\w@][\w.\/-]*\.\w{1,6}/;
  return md
    .split("\n")
    .map((line) => {
      const m = line.match(/^- (.+?):\s*(.+?)\.?\s*$/);
      if (!m) {
        return line;
      }
      const parts = m[2].split(/,\s*(?:and\s+)?/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 3 || !parts.every((p) => PATHISH.test(p) && !p.includes(" "))) {
        return line;
      }
      return [`- ${m[1]}:`, ...parts.map((p) => `  - ${p}`)].join("\n");
    })
    .join("\n");
}

// Convert a markdown stand-up into readable plain text: unwrap links to
// "text (url)", drop bold markers and heading hashes, normalize bullets.
export function toPlainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // [text](url) -> text (url)
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** -> bold
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // # heading -> heading
    .replace(/^\s*[-*]\s+/gm, "• ") // - item / * item -> • item
    .trim();
}
