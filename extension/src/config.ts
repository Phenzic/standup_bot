import * as vscode from "vscode";

// Thin typed wrapper over the extension's settings.
export function cfg() {
  const c = vscode.workspace.getConfiguration("standup");
  return {
    lookbackHours: c.get<number>("lookbackHours", 24),
    ollamaUrl: c.get<string>("ollama.url", "http://localhost:11434").replace(/\/+$/, ""),
    ollamaModel: c.get<string>("ollama.model", "llama3.2"),
    githubToken: c.get<string>("github.token", "").trim(),
    githubRepos: c.get<string[]>("github.repos", []),
    format: c.get<"done-next-blockers" | "yesterday-today-blockers">("format", "done-next-blockers"),
    webhookType: c.get<"none" | "discord" | "slack">("webhook.type", "none"),
    webhookUrl: c.get<string>("webhook.url", "").trim(),
    trackEnabled: c.get<boolean>("track.enabled", true),
  };
}
