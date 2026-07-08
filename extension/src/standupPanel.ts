import * as vscode from "vscode";
import { cfg } from "./config";
import { postToWebhook } from "./post";
import { DetailLevel, State } from "./state";

export interface DraftPayload {
  markdown: string;
  summary: { commits: number; files: number; github: number };
}

// Singleton webview: shows the draft in Markdown + Plain-text tabs, an activity
// summary, and a collapsible style editor.
export class StandupPanel {
  private static current: StandupPanel | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  static show(onRegenerate: () => void, state: State): StandupPanel {
    if (StandupPanel.current) {
      StandupPanel.current.onRegenerate = onRegenerate;
      StandupPanel.current.state = state;
      StandupPanel.current.syncDetail();
      StandupPanel.current.panel.reveal();
      return StandupPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      "standup",
      "Stand-up",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    StandupPanel.current = new StandupPanel(panel, onRegenerate, state);
    return StandupPanel.current;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private onRegenerate: () => void,
    private state: State,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.html();
    this.syncDetail();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((msg) => this.handle(msg), null, this.disposables);
  }

  setLoading(label: string): void {
    this.panel.webview.postMessage({ kind: "loading", label });
  }

  setDraft(p: DraftPayload): void {
    const c = cfg();
    this.panel.webview.postMessage({
      kind: "draft",
      markdown: p.markdown,
      summary: p.summary,
      detail: c.detail,
      target: c.webhookType === "none" ? "" : c.webhookType,
    });
  }

  setError(message: string): void {
    this.panel.webview.postMessage({ kind: "error", message });
  }

  private syncDetail(): void {
    this.panel.webview.postMessage({ kind: "init", detail: cfg().detail });
  }

  private async handle(msg: any): Promise<void> {
    switch (msg.kind) {
      case "copy":
        await vscode.env.clipboard.writeText(msg.text ?? "");
        vscode.window.showInformationMessage(`Copied ${msg.label ?? "text"} to clipboard.`);
        break;
      case "regenerate":
        this.onRegenerate();
        break;
      case "setDetail": {
        const detail = msg.detail as DetailLevel;
        await this.state.setDetail(detail);
        await vscode.workspace
          .getConfiguration("standup")
          .update("detail", detail, vscode.ConfigurationTarget.Global);
        this.onRegenerate();
        break;
      }
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
    const detail = cfg().detail;
    const sel = (v: string) => (detail === v ? " selected" : "");
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  :root { --gap: 12px; }
  body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  h1 { font-size: 15px; margin: 0; font-weight: 600; }
  #meta { font-size: 12px; opacity: 0.7; }
  .tabs { display: flex; gap: 4px; margin: var(--gap) 0 8px; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3)); }
  .tab {
    background: none; border: none; border-bottom: 2px solid transparent; color: var(--vscode-foreground);
    padding: 6px 12px; cursor: pointer; font-size: 13px; opacity: 0.7;
  }
  .tab.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder, var(--vscode-button-background)); }
  textarea {
    width: 100%; box-sizing: border-box; min-height: 300px; resize: vertical;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; line-height: 1.5;
    color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 6px; padding: 12px;
  }
  .pane { display: none; }
  .pane.active { display: block; }
  .row { margin-top: var(--gap); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  button.action {
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
    border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
  }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.action:hover { opacity: 0.9; }
  #status { margin-top: 10px; min-height: 16px; font-size: 12px; opacity: 0.85; }
  .err { color: var(--vscode-errorForeground); white-space: pre-wrap; }
  .hint { font-size: 12px; opacity: 0.65; margin: 6px 0 0; }
</style>
</head>
<body>
  <header>
    <h1>Daily stand-up</h1>
    <span id="meta"></span>
  </header>

  <div class="tabs">
    <button class="tab active" data-pane="md">Markdown</button>
    <button class="tab" data-pane="txt">Plain text</button>
  </div>

  <div id="pane-md" class="pane active">
    <textarea id="md" placeholder="Generating…"></textarea>
  </div>
  <div id="pane-txt" class="pane">
    <textarea id="txt" placeholder="Plain-text version appears here."></textarea>
    <p class="hint">Auto-derived from the Markdown tab. Edit here freely — copying this tab copies what you see.</p>
  </div>

  <div class="row">
    <button class="action" id="copy">Copy</button>
    <button class="action secondary" id="send" style="display:none">Send</button>
    <button class="action secondary" id="regen">Regenerate</button>
    <label style="font-size:12px;opacity:.8;margin-left:auto">Detail
      <select id="detail" style="margin-left:4px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);border-radius:4px;padding:4px 6px">
        <option value="concise"${sel("concise")}>Concise · 3–4 points</option>
        <option value="standard"${sel("standard")}>Standard · 5–7 points</option>
        <option value="elaborate"${sel("elaborate")}>Elaborate · full work log</option>
      </select>
    </label>
  </div>
  <div id="status"></div>

<script>
  const vscode = acquireVsCodeApi();
  const md = document.getElementById('md');
  const txt = document.getElementById('txt');
  const status = document.getElementById('status');
  const meta = document.getElementById('meta');
  const sendBtn = document.getElementById('send');
  let activePane = 'md';
  let txtEdited = false;

  // Mirror of format.ts toPlainText — keep in sync.
  function toPlainText(s) {
    return s
      .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '$1 ($2)')
      .replace(/\\*\\*([^*]+)\\*\\*/g, '$1')
      .replace(/^\\s{0,3}#{1,6}\\s+/gm, '')
      .replace(/^\\s*[-*]\\s+/gm, '• ')
      .trim();
  }

  function syncPlain() { if (!txtEdited) txt.value = toPlainText(md.value); }
  md.addEventListener('input', syncPlain);
  txt.addEventListener('input', () => { txtEdited = true; });

  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    activePane = t.dataset.pane;
    document.getElementById('pane-' + activePane).classList.add('active');
  });

  function activeText() { return activePane === 'txt' ? txt.value : md.value; }

  document.getElementById('copy').onclick = () =>
    vscode.postMessage({ kind: 'copy', text: activeText(), label: activePane === 'txt' ? 'plain text' : 'markdown' });
  document.getElementById('regen').onclick = () => vscode.postMessage({ kind: 'regenerate' });
  document.getElementById('detail').onchange = (e) =>
    vscode.postMessage({ kind: 'setDetail', detail: e.target.value });
  sendBtn.onclick = () => vscode.postMessage({ kind: 'send', text: activeText() });

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.kind === 'loading') {
      md.value = ''; txt.value = ''; txtEdited = false;
      md.placeholder = m.label; status.textContent = m.label; status.className = '';
    } else if (m.kind === 'init' || m.kind === 'draft') {
      if (m.kind === 'draft') {
        txtEdited = false;
        md.value = m.markdown; syncPlain();
        const s = m.summary || {};
        meta.textContent = [
          s.commits ? s.commits + ' commits' : '',
          s.files ? s.files + ' files' : '',
          s.github ? s.github + ' GitHub items' : ''
        ].filter(Boolean).join(' · ');
        status.textContent = 'Review and edit, then copy or send.'; status.className = '';
        if (m.target) { sendBtn.style.display = 'inline-block'; sendBtn.textContent = 'Send to ' + m.target; }
        else { sendBtn.style.display = 'none'; }
      }
      if (m.detail) document.getElementById('detail').value = m.detail;
    } else if (m.kind === 'error') {
      status.textContent = m.message; status.className = 'err';
    }
  });
</script>
</body>
</html>`;
  }
}
