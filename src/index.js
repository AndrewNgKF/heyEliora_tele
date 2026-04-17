import "dotenv/config";
import { bot } from "./bot/index.js";
import { createServer } from "./bot/server.js";
import { initDb } from "./db/index.js";

await initDb();

const app = createServer(bot);

// Register webhook if URL is configured
if (process.env.WEBHOOK_URL) {
  await bot.api.setWebhook(`${process.env.WEBHOOK_URL}/webhook`, {
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
  });
  console.log(`[eliora] webhook set to ${process.env.WEBHOOK_URL}/webhook`);
}

// Local dev: start server or polling (Vercel handles its own invocation)
if (!process.env.VERCEL) {
  if (process.env.WEBHOOK_URL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () =>
      console.log(`[eliora] webhook server running on port ${PORT}`),
    );
  } else {
    await bot.api.deleteWebhook();
    console.log("[eliora] starting in long polling mode...");
    bot.start({
      onStart: () => console.log("[eliora] bot is running"),
    });
  }
}

export default app;
