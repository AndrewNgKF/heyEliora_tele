import { bot } from "../src/bot/index.js";
import { createServer } from "../src/bot/server.js";
import { initDb } from "../src/db/index.js";

let appPromise;
let webhookInitPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      await initDb();
      return createServer(bot);
    })();
  }
  return appPromise;
}

async function ensureWebhook() {
  if (!process.env.WEBHOOK_URL) return;

  if (!webhookInitPromise) {
    webhookInitPromise = bot.api
      .setWebhook(`${process.env.WEBHOOK_URL}/webhook`, {
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
      })
      .catch((err) => {
        // Allow retry on next invocation if webhook setup fails.
        webhookInitPromise = undefined;
        throw err;
      });
  }

  await webhookInitPromise;
}

export default async function handler(req, res) {
  try {
    await ensureWebhook();
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error("[eliora] vercel handler error:", err);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
