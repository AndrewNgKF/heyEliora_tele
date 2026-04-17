import { bot } from "../src/bot/index.js";
import { createServer } from "../src/bot/server.js";
import { initDb } from "../src/db/index.js";

// Vercel serverless adapter — reuses the same Express app from src/
// Needed because Vercel cannot do app.listen(), it needs a handler(req, res)

await initDb();

const app = createServer(bot);

await bot.api.setWebhook(`${process.env.WEBHOOK_URL}/webhook`, {
  secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
});

export default app;
