import { cfg } from "./config";

// Posts text to a Discord or Slack incoming webhook. No bot or OAuth required.
export async function postToWebhook(text: string): Promise<void> {
  const c = cfg();
  if (c.webhookType === "none" || !c.webhookUrl) {
    throw new Error("No webhook configured. Set standup.webhook.type and standup.webhook.url in settings.");
  }
  // Discord caps content at 2000 chars; keep both safe.
  const body =
    c.webhookType === "discord"
      ? { content: text.slice(0, 1990) }
      : { text };

  const res = await fetch(c.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Webhook POST failed: ${res.status} ${res.statusText}`);
  }
}
