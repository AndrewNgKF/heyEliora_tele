import crypto from "crypto";
import express from "express";
import { webhookCallback } from "grammy";
import { CRON_SECRET } from "../config/CONSTANTS.js";
import { processDueReminders } from "../jobs/reminders.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, "../web");

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");

  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Creates an Express server with the grammY webhook handler
 * @param {import("grammy").Bot} bot
 */
export function createServer(bot) {
  const app = express();
  const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

  app.use(express.static(WEB_DIR));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(WEB_DIR, "index.html"));
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/cron/reminders", express.json(), async (req, res) => {
    const authHeader = req.get("x-cron-secret");

    if (!CRON_SECRET || !safeEqual(authHeader, CRON_SECRET)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    try {
      const result = await processDueReminders(bot);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[eliora] cron/reminders error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  app.use(
    "/webhook",
    webhookCallback(bot, "express", {
      secretToken: telegramWebhookSecret || undefined,
    }),
  );

  return app;
}
