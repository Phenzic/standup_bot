// Shared data shapes used across the extension.

export interface ActivityEvent {
  ts: string; // ISO timestamp
  type: "save" | "edit";
  file: string; // workspace-relative path
  lang: string; // VS Code languageId
  project: string; // workspace folder name
}

export interface Commit {
  hash: string;
  date: string; // ISO
  subject: string;
  body: string;
  repo: string;
  files: string[]; // paths changed in this commit
}

export interface GitHubItem {
  kind: "issue" | "pr";
  number: number;
  title: string;
  url: string;
  repo: string;
  closedAt: string;
}

export interface FileTouch {
  file: string;
  project: string;
  lang: string;
  saves: number;
  edits: number;
  lastTs: string;
}

export interface CursorPrompt {
  ts: string; // ISO
  text: string;
}

// Everything gathered for one stand-up generation.
export interface StandupContext {
  since: Date;
  until: Date;
  commits: Commit[];
  touches: FileTouch[];
  github: GitHubItem[];
  cursorPrompts: CursorPrompt[];
}
