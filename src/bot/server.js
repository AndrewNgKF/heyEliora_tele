import express from "express";
import { webhookCallback } from "grammy";

/**
 * Creates an Express server with the grammY webhook handler
 * @param {import("grammy").Bot} bot
 */
export function createServer(bot) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/webhook", webhookCallback(bot, "express"));

  return app;
}
