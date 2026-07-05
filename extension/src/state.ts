import * as vscode from "vscode";

// The default draft "style profile". This is the example the local model
// imitates — plain prose, grouped by theme, conversational, no commit prefixes.
// Users can replace it from the panel to match their own voice.
export const DEFAULT_STYLE = `Hey team, here's what I worked on today:

Reworked the authentication flow — added a password reset endpoint and fixed a bug where expired refresh tokens were still being accepted. Both paths are now covered by tests.

Cleaned up the tasks API: added due-date filtering to the list endpoint, paginated the results, and made missing task ids return a proper 404. Closed the related issue as part of this.

Refactored the shared date-formatting logic into a single utility so the API and workers stop duplicating it.

Next: review and merge the open PRs, then run the full test suite.

No blockers.`;

// Small typed wrapper over globalState for the things that don't belong in
// user-editable settings (multi-line style text, first-run flag, reminder log).
export class State {
  constructor(private ctx: vscode.ExtensionContext) {}

  getStyle(): string {
    return this.ctx.globalState.get<string>("style", DEFAULT_STYLE);
  }
  setStyle(s: string): Thenable<void> {
    return this.ctx.globalState.update("style", s.trim() || DEFAULT_STYLE);
  }
  resetStyle(): Thenable<void> {
    return this.ctx.globalState.update("style", undefined);
  }

  isSetupDone(): boolean {
    return this.ctx.globalState.get<boolean>("setupDone", false);
  }
  setSetupDone(): Thenable<void> {
    return this.ctx.globalState.update("setupDone", true);
  }

  getLastReminderYmd(): string {
    return this.ctx.globalState.get<string>("lastReminderYmd", "");
  }
  setLastReminderYmd(ymd: string): Thenable<void> {
    return this.ctx.globalState.update("lastReminderYmd", ymd);
  }
}
