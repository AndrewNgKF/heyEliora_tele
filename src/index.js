import "dotenv/config";
import { bot } from "./bot/index.js";
import { createServer } from "./bot/server.js";
import { initDb } from "./db/index.js";

const PORT = process.env.PORT || 3000;

async function main() {
  // Initialize database tables
  await initDb();

  const useWebhook = !!process.env.WEBHOOK_URL;

  if (useWebhook) {
    const app = createServer(bot);
    app.listen(PORT, () => {
      console.log(`[eliora] webhook server running on port ${PORT}`);
    });
    await bot.api.setWebhook(`${process.env.WEBHOOK_URL}/webhook`);
    console.log(`[eliora] webhook set to ${process.env.WEBHOOK_URL}/webhook`);
  } else {
    // Long polling — good for local dev
    console.log("[eliora] starting in long polling mode...");
    bot.start({
      onStart: () => console.log("[eliora] bot is running"),
    });
  }
}

main().catch(console.error);
