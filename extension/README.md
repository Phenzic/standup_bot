# Standup (VS Code / Cursor extension)

Watches what you actually worked on — git commits, files you edited, GitHub issues/PRs — and writes your daily stand-up with a **local** LLM. Review the draft, then copy it or post to Discord/Slack. Nothing leaves your machine except what you choose to send.

## Requirements

- [Ollama](https://ollama.com) running locally with a model pulled:
  ```bash
  ollama pull llama3.2
  ```
- (Optional) A GitHub token if you want closed issues / merged PRs included.

## Run it (development)

```bash
cd extension
npm install
npm run watch      # or: npm run compile
```

Then press **F5** in VS Code (or Cursor) to launch the Extension Development Host. In that window:

- **Cmd/Ctrl+Shift+P → "Standup: Generate Today's Update"** — gathers activity, generates the draft, opens the panel.
- **"Standup: Show Tracked Activity (debug)"** — dumps the raw gathered context so you can see what the model sees.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `standup.lookbackHours` | `24` | How far back to gather activity |
| `standup.ollama.url` | `http://localhost:11434` | Local Ollama server |
| `standup.ollama.model` | `llama3.2` | Model used to summarize |
| `standup.github.useBuiltInAuth` | `true` | Use the editor's GitHub sign-in — no PAT. Run "Standup: Connect GitHub" once |
| `standup.github.token` | `""` | Optional PAT, only if you'd rather not use built-in sign-in |
| `standup.github.repos` | `[]` | `owner/name` list; auto-detected from git `origin` if empty |
| `standup.cursor.enabled` | `true` | Include today's Cursor AI prompts as context (read locally, read-only) |
| `standup.format` | `done-next-blockers` | Stand-up shape |
| `standup.webhook.type` | `none` | `discord` \| `slack` \| `none` |
| `standup.webhook.url` | `""` | Incoming webhook URL (no bot/OAuth needed) |
| `standup.track.enabled` | `true` | Track which files you edit/save (local only) |
| `standup.reminder.enabled` | `true` | Daily local-time nudge to send your stand-up |
| `standup.reminder.time` | `16:00` | Reminder time (24h `HH:MM`, local). Set on first run. |

## Output format

The stand-up format is **fixed and opinionated** (like an editor's base prompt):
a friendly opener, then **Done / Next / Blockers** with one accomplishment per
bullet. When a point covers 3+ files, they're listed as an indented sub-bullet
list under the point — enforced deterministically in code, not left to the model.
The **Detail** dropdown in the panel (or `standup.detail`) controls granularity:
`concise` (3-4 points) / `standard` (5-7) / `elaborate` (6-9, every changed file
named). If the model under-splits, a single automatic repair pass rewrites it to
meet the minimum — real work is split, never padded.

The panel shows the draft in **Markdown** and **Plain text** tabs; each is
independently editable and copyable. GitHub issues/PRs are appended as a
**References** block with real links (built in code, so links are never
hallucinated).

## How it works

1. **Tracker** records save/edit events locally (one JSON file per day in the extension's global storage).
2. On generate, **gather** pulls commits (`git log`, your author email), GitHub issues/PRs (search API), and your tracked file touches for the window.
3. **summarize** sends that context to Ollama and gets a draft back.
4. The **panel** lets you edit, copy, or post via webhook.

## Not yet (deliberately)

- Cursor AI-chat capture (no public API)
- Browser activity (separate extension, deferred)
- Full Slack/Discord OAuth apps (webhooks cover the MVP)
- JetBrains (separate plugin)
