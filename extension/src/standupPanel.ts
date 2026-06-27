import * as vscode from "vscode";
import { cfg } from "./config";
import { postToWebhook } from "./post";

// Singleton webview that shows the editable stand-up draft.
export class StandupPanel {
  private static current: StandupPanel | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  static show(onRegenerate: () => void): StandupPanel {
    if (StandupPanel.current) {
      StandupPanel.current.panel.reveal();
      StandupPanel.current.onRegenerate = onRegenerate;
      return StandupPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      "standup",
      "Stand-up",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    StandupPanel.current = new StandupPanel(panel, onRegenerate);
    return StandupPanel.current;
  }

  private constructor(panel: vscode.WebviewPanel, private onRegenerate: () => void) {
    this.panel = panel;
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handle(msg),
      null,
      this.disposables,
    );
  }

  setLoading(label: string): void {
    this.panel.webview.postMessage({ kind: "loading", label });
  }

  setDraft(text: string): void {
    const c = cfg();
    const target = c.webhookType === "none" ? "" : c.webhookType;
    this.panel.webview.postMessage({ kind: "draft", text, target });
  }

  setError(message: string): void {
    this.panel.webview.postMessage({ kind: "error", message });
  }

  private async handle(msg: any): Promise<void> {
    switch (msg.kind) {
      case "copy":
        await vscode.env.clipboard.writeText(msg.text ?? "");
        vscode.window.showInformationMessage("Stand-up copied to clipboard.");
        break;
      case "regenerate":
        this.onRegenerate();
        break;
      case "send":
        try {
          await postToWebhook(msg.text ?? "");
          vscode.window.showInformationMessage("Stand-up posted.");
        } catch (e: any) {
          vscode.window.showErrorMessage(`Post failed: ${e.message ?? e}`);
        }
        break;
    }
  }

  dispose(): void {
    StandupPanel.current = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }

  private html(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: var(--vscode-font-family); padding: 12px; color: var(--vscode-foreground); }
  h2 { margin: 0 0 8px; font-size: 14px; }
  textarea {
    width: 100%; box-sizing: border-box; min-height: 320px; resize: vertical;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 13px;
    color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; padding: 8px;
  }
  .row { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
  button {
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
    border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;
  }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  #status { margin-top: 8px; min-height: 18px; font-size: 12px; opacity: 0.85; }
  .err { color: var(--vscode-errorForeground); white-space: pre-wrap; }
</style>
</head>
<body>
  <h2>Daily stand-up</h2>
  <textarea id="draft" placeholder="Generating…"></textarea>
  <div class="row">
    <button id="copy">Copy</button>
    <button id="send" class="secondary" style="display:none">Send</button>
    <button id="regen" class="secondary">Regenerate</button>
  </div>
  <div id="status"></div>
<script>
  const vscode = acquireVsCodeApi();
  const draft = document.getElementById('draft');
  const status = document.getElementById('status');
  const sendBtn = document.getElementById('send');

  document.getElementById('copy').onclick = () => vscode.postMessage({ kind: 'copy', text: draft.value });
  document.getElementById('regen').onclick = () => vscode.postMessage({ kind: 'regenerate' });
  sendBtn.onclick = () => vscode.postMessage({ kind: 'send', text: draft.value });

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.kind === 'loading') { draft.value = ''; draft.placeholder = m.label; status.textContent = m.label; status.className = ''; }
    else if (m.kind === 'draft') {
      draft.value = m.text; status.textContent = 'Review and edit, then copy or send.'; status.className = '';
      if (m.target) { sendBtn.style.display = 'inline-block'; sendBtn.textContent = 'Send to ' + m.target; }
      else { sendBtn.style.display = 'none'; }
    }
    else if (m.kind === 'error') { status.textContent = m.message; status.className = 'err'; }
  });
</script>
</body>
</html>`;
  }
}
