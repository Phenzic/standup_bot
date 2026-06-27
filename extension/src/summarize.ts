import { cfg } from "./config";
import { StandupContext } from "./types";
import { contextToText } from "./gather";

const FORMATS: Record<string, string> = {
  "done-next-blockers":
    "**Done** (what I completed)\n**Next** (what I'll do next)\n**Blockers** (anything in my way, or 'None')",
  "yesterday-today-blockers":
    "**Yesterday**\n**Today**\n**Blockers** (or 'None')",
};

function buildPrompt(ctx: StandupContext): string {
  const c = cfg();
  const shape = FORMATS[c.format] ?? FORMATS["done-next-blockers"];
  return [
    "You are a developer writing your own concise daily stand-up update.",
    "Summarize the activity below into this exact format:",
    "",
    shape,
    "",
    "Rules:",
    "- Be specific but brief — bullet points, no fluff, first person.",
    "- Group related commits/files into a single accomplishment.",
    "- Only use the activity given. Do NOT invent tasks.",
    "- If there is no clear 'Next', infer a reasonable next step from in-progress (uncommitted) files, or write 'TBD'.",
    "- Output only the stand-up. No preamble, no explanation.",
    "",
    "ACTIVITY:",
    contextToText(ctx),
  ].join("\n");
}

export class OllamaError extends Error {}

// Calls the local Ollama server. Throws OllamaError with a friendly message
// if it can't be reached or the model is missing.
export async function generateStandup(ctx: StandupContext): Promise<string> {
  const c = cfg();
  let res: Response;
  try {
    res = await fetch(`${c.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: c.ollamaModel,
        prompt: buildPrompt(ctx),
        stream: false,
        options: { temperature: 0.3 },
      }),
    });
  } catch {
    throw new OllamaError(
      `Couldn't reach Ollama at ${c.ollamaUrl}. Is it running? Start it with \`ollama serve\` and make sure you've pulled a model (\`ollama pull ${c.ollamaModel}\`).`,
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
