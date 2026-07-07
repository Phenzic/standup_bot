import { cfg } from "./config";
import { StandupContext } from "./types";
import { contextToText } from "./gather";

// Each detail level compiles to MEASURABLE constraints (point counts, sentence
// budgets, specificity rules) — vague adjectives like "be detailed" don't
// steer small local models reliably; numbers do.
const DETAIL_LEVELS: Record<string, { rules: string[]; predict: number }> = {
  concise: {
    rules: [
      "- LENGTH: write 3-4 points maximum, ONE short sentence each (under ~18 words).",
      "- Report outcomes only. No filenames, endpoints, or field lists unless a point is meaningless without one.",
    ],
    predict: 400,
  },
  standard: {
    rules: [
      "- LENGTH: write 5-7 points, each 1-2 sentences.",
      "- Name the key specifics per point: the main files/pages/endpoints touched and issue/PR numbers. Skip exhaustive lists.",
    ],
    predict: 900,
  },
  elaborate: {
    rules: [
      "- LENGTH: write 5-8 substantial points, each 2-4 sentences, like a thorough work log.",
      "- Be exhaustive with specifics: enumerate the files, pages, assets, fields, and URLs involved (e.g. 'Fixed broken image paths across six pages: a, b, c...'). Every piece of activity below must be traceable to a point.",
    ],
    predict: 1600,
  },
};

function buildPrompt(ctx: StandupContext, style: string): string {
  const level = DETAIL_LEVELS[cfg().detail] ?? DETAIL_LEVELS.standard;
  return [
    "You are writing YOUR OWN developer daily stand-up update, in first person.",
    "",
    "Match the VOICE, TONE, and STRUCTURE of this example. It is FICTIONAL — imitate its style only. Never copy its facts, claims, or phrases (e.g. never say something is 'covered by tests' unless the activity says so):",
    "--- STYLE EXAMPLE ---",
    style,
    "--- END STYLE EXAMPLE ---",
    "",
    "Rules:",
    "- Write in natural, plain English prose.",
    "- NEVER use conventional-commit prefixes. Rewrite them as normal sentences:",
    "  'feat(auth): add password reset flow' -> 'Added a password reset flow'.",
    "  'fix(api): return 404 for missing ids' -> 'Fixed the API to return 404 for missing ids'.",
    "  Strip every 'feat/fix/chore/docs/refactor/perf/test(scope):' marker.",
    "- GROUP related commits and files into themes. Do not drop whole areas of work.",
    ...level.rules,
    "- Follow the section shape of the example (e.g. Done / Next / Blockers) if it has one.",
    "- Use ONLY the activity below. Never invent work.",
    "- Anything marked 'merged PR' or 'closed issue' is ALREADY FINISHED — report it as done, never as a next step.",
    "- Commits and closed issues/PRs are proof of COMPLETED work — prioritize them. The 'AI prompts' are what I was trying to do; use them to add context or to infer in-progress work and a sensible 'Next', but don't report a prompt as finished work unless a commit/PR backs it.",
    "- If there is no clear 'Next', infer one from in-progress (uncommitted) files, or write a brief honest placeholder.",
    "- Do NOT add a references or links section — that is appended separately.",
    "",
    "Output only the stand-up, nothing else.",
    "",
    "ACTIVITY:",
    contextToText(ctx),
  ].join("\n");
}

export class OllamaError extends Error {}

// Calls the local Ollama server with the style-guided prompt. Throws
// OllamaError with a friendly message if it can't be reached / model missing.
export async function generateStandup(ctx: StandupContext, style: string): Promise<string> {
  const c = cfg();
  const level = DETAIL_LEVELS[c.detail] ?? DETAIL_LEVELS.standard;
  let res: Response;
  try {
    res = await fetch(`${c.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: c.ollamaModel,
        prompt: buildPrompt(ctx, style),
        stream: false,
        options: { temperature: 0.4, num_ctx: 8192, num_predict: level.predict },
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
