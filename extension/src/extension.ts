import * as vscode from "vscode";
import { Store } from "./store";
import { Tracker } from "./tracker";
import { cfg } from "./config";
import { gatherContext, contextToText } from "./gather";
import { generateStandup, OllamaError } from "./summarize";
import { StandupPanel } from "./standupPanel";

let store: Store;
let tracker: Tracker | undefined;

export function activate(context: vscode.ExtensionContext) {
  store = new Store(context);

  if (cfg().trackEnabled) {
    tracker = new Tracker(store);
    tracker.start();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("standup.generate", () => runGenerate()),
    vscode.commands.registerCommand("standup.showActivity", () => runShowActivity()),
  );
}

async function runGenerate(): Promise<void> {
  const panel = StandupPanel.show(() => void runGenerate());
  panel.setLoading("Gathering your activity…");
  try {
    const ctx = await gatherContext(store);
    if (!ctx.commits.length && !ctx.github.length && !ctx.touches.length) {
      panel.setError(
        "No activity found in the last " +
          cfg().lookbackHours +
          "h. Commit some work, or increase standup.lookbackHours.",
      );
      return;
    }
    panel.setLoading("Writing your stand-up with the local model…");
    const draft = await generateStandup(ctx);
    panel.setDraft(draft);
  } catch (e: any) {
    const msg = e instanceof OllamaError ? e.message : `Something went wrong: ${e.message ?? e}`;
    panel.setError(msg);
  }
}

async function runShowActivity(): Promise<void> {
  const ctx = await gatherContext(store);
  const doc = await vscode.workspace.openTextDocument({
    content:
      `# Standup activity (last ${cfg().lookbackHours}h)\n` +
      `# ${ctx.since.toISOString()} → ${ctx.until.toISOString()}\n\n` +
      contextToText(ctx),
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc);
}

export function deactivate() {
  tracker?.dispose();
  store?.flush();
}
