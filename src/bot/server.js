import crypto from "crypto";
import express from "express";
import { CRON_SECRET } from "../config/CONSTANTS.js";
import { processDueMessages } from "../jobs/sender.js";
import { processNudges } from "../jobs/nudges.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, "../web");

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");

  // Pad to equal length to avoid leaking secret length via timing
  const maxLen = Math.max(leftBuffer.length, rightBuffer.length, 1);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  a.set(leftBuffer);
  b.set(rightBuffer);

  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(a, b)
  );
}

/**
 * Express middleware that validates the x-cron-secret header.
 */
function requireCronAuth(req, res, next) {
  const authHeader = req.get("x-cron-secret");
  if (!CRON_SECRET || !safeEqual(authHeader, CRON_SECRET)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

/**
 * Creates an Express server with the grammY webhook handler
 * @param {import("grammy").Bot} bot
 */
export function createServer(bot) {
  const app = express();
  const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

  app.use(express.json());
  app.use(express.static(WEB_DIR, { acceptRanges: false }));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(WEB_DIR, "index.html"), { acceptRanges: false });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/cron/deliver", requireCronAuth, async (_req, res) => {
    try {
      const result = await processDueMessages(bot);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[eliora] cron/reminders error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  app.post("/cron/nudges", requireCronAuth, async (_req, res) => {
    try {
      const result = await processNudges();
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[eliora] cron/nudges error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  app.post("/webhook", async (req, res) => {
    try {
      if (!telegramWebhookSecret) {
        console.error(
          "[eliora] TELEGRAM_WEBHOOK_SECRET is not set — rejecting webhook",
        );
        return res.status(500).end();
      }
      const token = req.header("x-telegram-bot-api-secret-token");
      if (!safeEqual(token, telegramWebhookSecret)) {
        return res.status(401).end();
      }
      await bot.handleUpdate(req.body);
      res.status(200).end();
    } catch (err) {
      console.error("[eliora] webhook error:", err);
      res.status(500).end();
    }
  });

  return app;
}
