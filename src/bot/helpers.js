import { getRecentProgress } from "../db/queries.js";
import { chat } from "../llm/chat.js";

/**
 * Format goals as a numbered list with baseline/target.
 * Used by /goals command and action:goals callback.
 * @param {Array<{id: string, goal: string, baseline?: string, target?: string}>} goals
 * @returns {string}
 */
export function formatGoalList(goals) {
  return goals
    .map((g, i) => {
      let line = `${i + 1}. ${g.goal} (id:${g.id})`;
      if (g.baseline || g.target) {
        const parts = [];
        if (g.baseline) parts.push(`from: ${g.baseline}`);
        if (g.target) parts.push(`target: ${g.target}`);
        line += `\n   📊 ${parts.join(" → ")}`;
      }
      return line;
    })
    .join("\n");
}

/**
 * Run a full accountability check-in: format goals + entries, call LLM.
 * Used by /whatsup command and action:whatsup callback.
 * @param {string} userId
 * @param {Array<{goal: string, baseline?: string, target?: string}>} goals
 * @returns {Promise<string>} The LLM's check-in reply
 */
export async function performCheckIn(userId, goals) {
  const goalList = goals
    .map((g) => {
      let line = `- ${g.goal}`;
      if (g.baseline) line += ` (baseline: ${g.baseline})`;
      if (g.target) line += ` (target: ${g.target})`;
      return line;
    })
    .join("\n");

  const entries = await getRecentProgress(userId, 10);
  const entryContext =
    entries.length > 0
      ? `\n\nRecent activity:\n${entries.map((e) => `- [${e.created_at}] (${e.goal}) ${e.content}`).join("\n")}`
      : "\n\nNo progress entries logged yet.";

  const { text } = await chat(
    userId,
    `[SYSTEM CHECK-IN] Give me a quick accountability check-in. Here are my goals:\n${goalList}${entryContext}\n\nBased on my recent activity and our conversations, how am I tracking? Be honest — call me out if I'm drifting.`,
  );
  return text;
}
