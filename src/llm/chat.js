import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { saveMessage, getHistory } from "../db/queries.js";

const SYSTEM_PROMPT = `You are Eliora, a personal AI assistant who lives in Telegram. 
You are warm, direct, and genuinely helpful — like a sharp friend who happens to be incredibly organized.
Keep responses concise unless asked for detail. Be conversational, not corporate.
You remember context from the current conversation and use it naturally.`;

const MAX_HISTORY = 20;

/**
 * Chat with Eliora
 * @param {string} userId
 * @param {string} message
 * @returns {Promise<string>}
 */
export async function chat(userId, message) {
  // Save user message to DB
  await saveMessage(userId, "user", message);

  // Load recent history from DB
  const history = await getHistory(userId, MAX_HISTORY);

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages: history,
  });

  // Save assistant reply to DB
  await saveMessage(userId, "assistant", text);

  return text;
}
