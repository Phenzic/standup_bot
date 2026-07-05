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
