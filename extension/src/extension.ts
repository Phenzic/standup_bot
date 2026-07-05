import * as vscode from "vscode";
import { Store } from "./store";
import { Tracker } from "./tracker";
import { State } from "./state";
import { Reminder } from "./reminder";
import { cfg } from "./config";
import { gatherContext, contextToText } from "./gather";
import { generateStandup, OllamaError } from "./summarize";
import { githubToken } from "./github";
import { buildReferences } from "./format";
import { StandupPanel } from "./standupPanel";

let store: Store;
let state: State;
let tracker: Tracker | undefined;
let reminder: Reminder | undefined;

export function activate(context: vscode.ExtensionContext) {
  store = new Store(context);
  state = new State(context);

  if (cfg().trackEnabled) {
    tracker = new Tracker(store);
    tracker.start();
  }

  reminder = new Reminder(state, () => void runGenerate());
  void reminder.ensureSetup().then(() => reminder?.start());

  context.subscriptions.push(
    vscode.commands.registerCommand("standup.generate", () => runGenerate()),
    vscode.commands.registerCommand("standup.showActivity", () => runShowActivity()),
    vscode.commands.registerCommand("standup.setReminderTime", () =>
      reminder?.pickTime("What time should Standup remind you daily? (24h, local)"),
    ),
    vscode.commands.registerCommand("standup.resetStyle", async () => {
      await state.resetStyle();
      vscode.window.showInformationMessage("Draft style reset to the default.");
    }),
    vscode.commands.registerCommand("standup.connectGitHub", async () => {
      const token = await githubToken(true);
      vscode.window.showInformationMessage(
        token ? "GitHub connected — issues & PRs will be included." : "GitHub sign-in was cancelled.",
      );
    }),
  );
}

async function runGenerate(): Promise<void> {
  const panel = StandupPanel.show(
    () => void runGenerate(),
    (s) => void state.setStyle(s),
  );
  panel.setLoading("Gathering your activity…");
  try {
    const ctx = await gatherContext(store);
    if (!ctx.commits.length && !ctx.github.length && !ctx.touches.length && !ctx.cursorPrompts.length) {
      panel.setError(
        `No activity found in the last ${cfg().lookbackHours}h. Commit some work, or increase standup.lookbackHours.`,
      );
      return;
    }
    panel.setLoading("Writing your stand-up with the local model…");
    const draft = await generateStandup(ctx, state.getStyle());
    const markdown = draft + buildReferences(ctx);
    panel.setDraft({
      markdown,
      style: state.getStyle(),
      summary: {
        commits: ctx.commits.length,
        files: ctx.touches.length,
        github: ctx.github.length,
      },
    });
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
  reminder?.dispose();
  store?.flush();
}
