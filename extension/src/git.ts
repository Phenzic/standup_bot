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
  const RS = "\x1e"; // record start
  const US = "\x1f"; // field sep
  const GS = "\x1d"; // header/files sep
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
    // RS opens each record and GS closes the header, so the --name-only file
    // list that git prints after the header can be split off unambiguously.
    const args = [
      "log",
      "--name-only",
      `--since=${since.toISOString()}`,
      `--until=${until.toISOString()}`,
      `--pretty=format:${RS}%H${US}%aI${US}%s${US}%b${GS}`,
    ];
    if (author) {
      args.push(`--author=${author}`);
    }

    try {
      const stdout = await git(cwd, args);
      for (const rec of stdout.split(RS)) {
        if (!rec.trim()) {
          continue;
        }
        const [header, filesBlob = ""] = rec.split(GS);
        const [hash, date, subject, body = ""] = header.split(US);
        if (!hash?.trim()) {
          continue;
        }
        const files = filesBlob
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean);
        out.push({
          hash: hash.trim().slice(0, 8),
          date: date ?? "",
          subject: subject ?? "",
          body: body.trim(),
          repo: slug,
          files,
        });
      }
    } catch (e) {
      console.error(`[standup] git log failed in ${cwd}:`, e);
    }
  }
  return out;
}
