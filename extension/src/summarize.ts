import { cfg } from "./config";
import { StandupContext } from "./types";
import { contextToText } from "./gather";
import { enforceSublists } from "./format";

// Each detail level compiles to MEASURABLE constraints (point counts, sentence
// budgets, specificity rules) — vague adjectives like "be detailed" don't
// steer small local models reliably; numbers do.
const DETAIL_LEVELS: Record<string, { rules: string[]; predict: number }> = {
  concise: {
    rules: [
      "- Write 3-4 Done bullets MAXIMUM, one short sentence each (under ~18 words).",
      "- NO sub-bullet file lists. Outcomes only — no filenames unless a point is meaningless without one.",
    ],
    predict: 400,
  },
  standard: {
    rules: [
      "- Write 5-7 Done bullets, each 1-2 sentences. COUNT your Done bullets before finishing: if fewer than 5, split the biggest themes apart (per file-group, per fix, per branch) until you reach at least 5. Do NOT pad with invented work — split real work instead.",
      "- Name the key specifics per bullet: main files/pages, issue/PR numbers. For 3+ files use a sub-bullet list of the most important ones (up to ~6).",
    ],
    predict: 900,
  },
  elaborate: {
    rules: [
      "- Write 6-9 Done bullets, each 2-4 sentences of substance, like a thorough work log. COUNT your Done bullets before finishing: if fewer than 6, split themes apart (per file-group, per fix, per branch) until you reach at least 6. Do NOT pad with invented work — split real work instead.",
      "- EVERY file listed under 'files:' in the activity must appear BY NAME in some sub-bullet list, under a point explaining what changed in those files and why. Never summarize file lists away as 'multiple documents' or 'various sections'.",
      "- Include concrete details from commit bodies: exact headings, filenames, field names, URLs. But never invent details that are not in the activity.",
    ],
    predict: 1600,
  },
};

// The one, fixed output format. A structural template (not an example with
// fake content) so nothing anchors length and no facts can bleed in.
function baseTemplate(): string {
  const yesterday = cfg().format === "yesterday-today-blockers";
  const done = yesterday ? "Yesterday" : "Done";
  const next = yesterday ? "Today" : "Next";
  return [
    "Hey team, here's what I worked on today:",
    "",
    `**${done}**`,
    "- <one accomplishment per bullet: WHAT changed and WHY, past tense, plain English>",
    "- <when a bullet covers 3 or more files/pages, do NOT run them inline in the sentence — state the change on the bullet line ending with a colon, then list each file as an indented sub-bullet:>",
    "  - <path/one.md>",
    "  - <path/two.md>",
    "  - <path/three.md>",
    "",
    `**${next}**`,
    "- <1-3 bullets: what I'll do next>",
    "",
    "**Blockers**",
    "- <blockers, or exactly: None>",
  ].join("\n");
}

function buildPrompt(ctx: StandupContext): string {
  const level = DETAIL_LEVELS[cfg().detail] ?? DETAIL_LEVELS.concise;
  return [
    "You are writing YOUR OWN developer daily stand-up update, in first person.",
    "",
    "OUTPUT FORMAT — follow this template exactly. Text in <angle brackets> describes what goes there; everything else is literal:",
    "--- TEMPLATE ---",
    baseTemplate(),
    "--- END TEMPLATE ---",
    "",
    "Rules:",
    "- Write in natural, plain English. Clean, clear, easy to pick up and understand.",
    "- NEVER use conventional-commit prefixes. Rewrite them as normal sentences:",
    "  'feat(auth): add password reset flow' -> 'Added a password reset flow'.",
    "  Strip every 'feat/fix/chore/docs/refactor/perf/test(scope):' marker.",
    "- GROUP related commits and files into themes. Do not drop whole areas of work.",
    "- FILE LISTS: never write more than two file paths inline in a sentence. Three or more files always become an indented sub-bullet list under the point, one file per line.",
    "- Use ONLY the activity below. Never invent work, filenames, or example titles.",
    "- Anything marked 'merged PR' or 'closed issue' is ALREADY FINISHED — report it as done, never as a next step.",
    "- Commits and closed issues/PRs are proof of COMPLETED work — prioritize them. The 'AI prompts' are what I was trying to do; use them to add context or to infer in-progress work and a sensible 'Next', but don't report a prompt as finished work unless a commit/PR backs it.",
    "- If there is no clear 'Next', infer one from in-progress (uncommitted) files, or write a brief honest placeholder.",
    "- Do NOT add a references or links section — that is appended separately.",
    "",
    "ACTIVITY:",
    contextToText(ctx),
    "",
    "HARD REQUIREMENTS for this stand-up (these override everything above):",
    ...level.rules,
    "",
    "Output only the stand-up, nothing else.",
  ].join("\n");
}

export class OllamaError extends Error {}

// Calls the local Ollama server with the style-guided prompt. Throws
// OllamaError with a friendly message if it can't be reached / model missing.
async function callOllama(prompt: string, predict: number): Promise<string> {
  const c = cfg();
  let res: Response;
  try {
    res = await fetch(`${c.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: c.ollamaModel,
        prompt,
        stream: false,
        options: { temperature: 0.4, num_ctx: 8192, num_predict: predict },
      }),
    });
  } catch {
    throw new OllamaError(
      `Couldn't reach Ollama at ${c.ollamaUrl}. Is it running? Start it with \`brew services start ollama\` and make sure you've pulled a model (\`ollama pull ${c.ollamaModel}\`).`,
    );
  }

  if (res.status === 404) {
    throw new OllamaError(
      `Model "${c.ollamaModel}" not found in Ollama. Run \`ollama pull ${c.ollamaModel}\`, or change "standup.ollama.model" in settings.`,
    );
  }
  if (!res.ok) {
    throw new OllamaError(`Ollama returned ${res.status} ${res.statusText}.`);
  }

  const data = (await res.json()) as { response?: string };
  const text = (data.response ?? "").trim();
  if (!text) {
    throw new OllamaError("Ollama returned an empty response.");
  }
  return text;
}

// Top-level bullets in the first (Done/Yesterday) section.
function countDoneBullets(text: string): number {
  const lines = text.split("\n");
  let inDone = false;
  let count = 0;
  for (const line of lines) {
    if (/^\*\*/.test(line.trim())) {
      if (inDone) {
        break;
      }
      inDone = true;
      continue;
    }
    if (inDone && /^- /.test(line)) {
      count++;
    }
  }
  return count;
}

const MIN_BULLETS: Record<string, number> = { concise: 0, standard: 5, elaborate: 6 };

export async function generateStandup(ctx: StandupContext): Promise<string> {
  const c = cfg();
  const level = DETAIL_LEVELS[c.detail] ?? DETAIL_LEVELS.concise;
  const prompt = buildPrompt(ctx);

  let text = await callOllama(prompt, level.predict);

  // One self-repair pass: models often under-split into 2-3 bullets no matter
  // what the rules say. Only retry when the activity actually has enough
  // distinct items to honestly support the minimum — never force padding.
  const min = MIN_BULLETS[c.detail] ?? 0;
  const distinctItems =
    ctx.commits.length + ctx.github.length + (ctx.touches.length > 0 ? 1 : 0);
  if (min > 0 && countDoneBullets(text) < min && distinctItems >= min) {
    const repair = [
      prompt,
      "",
      "Your previous draft:",
      text,
      "",
      `That draft has only ${countDoneBullets(text)} bullets in the first section; the requirement is at least ${min}.`,
      `Rewrite the stand-up, splitting themes apart (per file-group, per fix, per branch, per page-set) until the first section has at least ${min} bullets.`,
      "Do NOT invent work — split real work instead. Keep the same template.",
      "Output only the stand-up, nothing else.",
    ].join("\n");
    try {
      text = await callOllama(repair, level.predict);
    } catch {
      /* keep the first draft if the repair call fails */
    }
  }

  return enforceSublists(text);
}
