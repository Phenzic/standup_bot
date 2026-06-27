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
| `standup.github.token` | `""` | Optional GitHub PAT (issues/PRs) |
| `standup.github.repos` | `[]` | `owner/name` list; auto-detected from git `origin` if empty |
| `standup.format` | `done-next-blockers` | Stand-up shape |
| `standup.webhook.type` | `none` | `discord` \| `slack` \| `none` |
| `standup.webhook.url` | `""` | Incoming webhook URL (no bot/OAuth needed) |
| `standup.track.enabled` | `true` | Track which files you edit/save (local only) |

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
