import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { Commit } from "./types";

const pexec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pexec("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

async function isRepo(cwd: string): Promise<boolean> {
  try {
    const out = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return out.trim() === "true";
  } catch {
    return false;
  }
}

// owner/name parsed from `git remote get-url origin`, or null.
export async function repoSlug(cwd: string): Promise<string | null> {
  try {
    const url = (await git(cwd, ["remote", "get-url", "origin"])).trim();
    const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
}

// Commits authored by the local git user across all workspace git repos,
// within [since, until].
export async function collectCommits(since: Date, until: Date): Promise<Commit[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const US = "\x1f"; // field sep
  const RS = "\x1e"; // record sep
  const out: Commit[] = [];

  for (const folder of folders) {
    const cwd = folder.uri.fsPath;
    if (!(await isRepo(cwd))) {
      continue;
    }

    let author = "";
    try {
      author = (await git(cwd, ["config", "user.email"])).trim();
    } catch {
      /* no configured email — fall through to all commits */
    }

    const slug = (await repoSlug(cwd)) ?? folder.name;
    const args = [
      "log",
      `--since=${since.toISOString()}`,
      `--until=${until.toISOString()}`,
      `--pretty=format:%H${US}%aI${US}%s${US}%b${RS}`,
    ];
    if (author) {
      args.push(`--author=${author}`);
    }

    try {
      const stdout = await git(cwd, args);
      for (const rec of stdout.split(RS)) {
        const line = rec.trim();
        if (!line) {
          continue;
        }
        const [hash, date, subject, body = ""] = line.split(US);
        out.push({
          hash: (hash ?? "").slice(0, 8),
          date: date ?? "",
          subject: subject ?? "",
          body: body.trim(),
          repo: slug,
        });
      }
    } catch (e) {
      console.error(`[standup] git log failed in ${cwd}:`, e);
    }
  }
  return out;
}
