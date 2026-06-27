# Standup

A local-first dev tool that watches what you worked on — git commits, files you edited, GitHub issues/PRs — and generates your daily stand-up update with a local LLM. Drafts it for you to review, then posts to Discord/Slack with one click.

Built for developers and docs engineers who find writing stand-ups a chore. Privacy-first: your activity stays on your machine and is summarized by a local model (Ollama). Nothing leaves your computer unless you choose to post it.

## Why

Existing stand-up bots (Geekbot, DailyBot, Steady) still make *you* type the update. This one reads your work and writes the first draft.

## Structure

- `extension/` — the VS Code / Cursor / VSCodium extension (the MVP)
- _(planned)_ `website/` — tracking dashboard
- _(planned)_ hosted/team features

## Status

Early MVP. Local-first, single-user, open source. See [`extension/README.md`](extension/README.md) to run it.

## License

MIT
