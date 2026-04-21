// ── Tiers ──────────────────────────────────────────────

/** Absolute hard cap per user per day, regardless of tier */
export const HARD_DAILY_CAP = parseInt(process.env.HARD_DAILY_CAP || "200", 10);

/** Free-tier onboarding boost: extra headroom for the first N days */
export const FREE_TRIAL_DAYS = 7;
export const FREE_TRIAL_DAILY_LIMIT = 15;

/** @type {Record<string, { dailyLimit: number, model: string, maxTokens: number }>} */
export const TIERS = {
  free: {
    dailyLimit: parseInt(process.env.FREE_DAILY_LIMIT || "3", 10),
    model: process.env.FREE_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: 512,
  },
  lite: {
    dailyLimit: parseInt(process.env.LITE_DAILY_LIMIT || "5", 10),
    model: process.env.LITE_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: 1024,
  },
  pro: {
    dailyLimit: parseInt(process.env.PRO_DAILY_LIMIT || "15", 10),
    model: process.env.PRO_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: 1024,
  },
};

/** Default tier for new users */
export const DEFAULT_TIER = "free";

/**
 * Get config for a tier, falling back to free if unknown
 * @param {string} tier
 * @returns {{ dailyLimit: number, model: string, maxTokens: number }}
 */
export function getTierConfig(tier) {
  return TIERS[tier] || TIERS.free;
}

// ── LLM ────────────────────────────────────────────────

/** Max conversation messages sent to the LLM */
export const MAX_HISTORY = 10;

/** Max tool-call round trips per chat() invocation */
export const MAX_TOOL_STEPS = 3;

/** Timezone picker options: [label, IANA timezone] */
export const TIMEZONE_OPTIONS = [
  ["🇺🇸 New York", "America/New_York"],
  ["🇺🇸 Chicago", "America/Chicago"],
  ["🇺🇸 Denver", "America/Denver"],
  ["🇺🇸 LA", "America/Los_Angeles"],
  ["🇬🇧 London", "Europe/London"],
  ["🇪🇺 Paris", "Europe/Paris"],
  ["🇮🇳 India", "Asia/Kolkata"],
  ["🇸🇬 Singapore", "Asia/Singapore"],
  ["🇯🇵 Tokyo", "Asia/Tokyo"],
  ["🇦🇺 Sydney", "Australia/Sydney"],
];

/** Shared howto / capabilities text */
export const HOWTO_TEXT =
  `*Just talk to me like you would a friend.*\n\n` +
  `Tell me what you're working on — I'll help you turn it into a clear vision and track your progress automatically.\n\n` +
  `I pick up on your and habits and style as we talk — no setup needed.\n\n` +
  `/ will get you a menu of things I can do` +
  ` \n\n Or just start chatting and we'll figure it out together!`;

/** Shared secret for cron endpoint authentication */
export const CRON_SECRET = process.env.CRON_SECRET || "";

// ── Nudges ─────────────────────────────────────────────

/** Inactivity thresholds in days per nudge frequency level */
export const NUDGE_THRESHOLDS = {
  daily: 1,
  every_3_days: 3,
  weekly: 7,
};

/** Number of user messages between summary refreshes */
export const SUMMARY_INTERVAL = 5;

/** Telegram command menu entries */
export const COMMANDS = [
  { command: "start", description: "Start here" },
  { command: "goals", description: "View your goals" },
  { command: "whatsup", description: "Accountability check-in" },
  { command: "reminders", description: "View active reminders" },
  { command: "mydata", description: "See everything Eliora knows about you" },
  { command: "feedback", description: "Send feedback to the team" },
  { command: "forget", description: "Clear conversation history" },
];
