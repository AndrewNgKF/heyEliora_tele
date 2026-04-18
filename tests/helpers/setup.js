import { vi } from "vitest";

// Prevent env-var checks in src/db/index.js from throwing during tests
process.env.TURSO_URL = "file::memory:";
process.env.TURSO_TOKEN = "test";
process.env.CRON_SECRET = "test-cron-secret";
