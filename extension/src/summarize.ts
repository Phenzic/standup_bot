import { cfg } from "./config";
import { StandupContext } from "./types";
import { contextToText } from "./gather";

function buildPrompt(ctx: StandupContext, style: string): string {
  return [
    "You are writing YOUR OWN developer daily stand-up update, in first person.",
    "",
    "Match the VOICE, TONE, and STRUCTURE of this example. Imitate its style — do NOT copy its content:",
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
    "- GROUP related commits and files into themes — but be COMPREHENSIVE. Account for EVERY commit and every closed issue/PR below. Do not drop work or collapse unrelated changes into one vague line. Prefer a few extra bullets over losing detail.",
    "- Under each theme, mention the specific things done (endpoints, files, fixes) so the reader sees the actual scope of the day.",
    "- Follow the section shape of the example (e.g. Done / Next / Blockers) if it has one.",
    "- Use ONLY the activity below. Never invent work.",
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
  let res: Response;
  try {
    res = await fetch(`${c.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: c.ollamaModel,
        prompt: buildPrompt(ctx, style),
        stream: false,
        options: { temperature: 0.4, num_ctx: 8192, num_predict: 1024 },
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
