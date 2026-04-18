import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock job processors before importing server
const mockProcessDueMessages = vi
  .fn()
  .mockResolvedValue({ sent: 2, failed: 0 });
const mockProcessNudges = vi.fn().mockResolvedValue({ evaluated: 5, sent: 1 });

vi.mock("../../src/jobs/sender.js", () => ({
  processDueMessages: mockProcessDueMessages,
}));

vi.mock("../../src/jobs/nudges.js", () => ({
  processNudges: mockProcessNudges,
}));

const { createServer } = await import("../../src/bot/server.js");

/** Minimal mock bot for the server */
const mockBot = {
  handleUpdate: vi.fn().mockResolvedValue(undefined),
};

/** Helper: make a request to the Express app */
async function request(app, method, path, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}${path}`;
      const opts = {
        method,
        headers: { "Content-Type": "application/json", ...headers },
      };
      if (body) opts.body = JSON.stringify(body);
      fetch(url, opts)
        .then(async (res) => {
          let data;
          const text = await res.text();
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
          resolve({ status: res.status, data });
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

describe("GET /health", () => {
  it("returns { status: ok }", async () => {
    const app = createServer(mockBot);
    const res = await request(app, "GET", "/health");
    expect(res.status).toBe(200);
    expect(res.data.status).toBe("ok");
  });
});

describe("POST /cron/deliver", () => {
  it("rejects without cron secret", async () => {
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/cron/deliver");
    expect(res.status).toBe(401);
    expect(res.data.ok).toBe(false);
  });

  it("accepts with valid cron secret", async () => {
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/cron/deliver", {
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(res.data.sent).toBe(2);
  });
});

describe("POST /cron/nudges", () => {
  it("rejects without cron secret", async () => {
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/cron/nudges");
    expect(res.status).toBe(401);
  });

  it("accepts with valid cron secret", async () => {
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/cron/nudges", {
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(res.data.evaluated).toBe(5);
  });
});

describe("POST /webhook", () => {
  beforeEach(() => {
    mockBot.handleUpdate.mockClear();
  });

  it("rejects when TELEGRAM_WEBHOOK_SECRET is not set", async () => {
    const original = process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/webhook", {
      body: { update_id: 1 },
    });
    expect(res.status).toBe(500);
    process.env.TELEGRAM_WEBHOOK_SECRET = original;
  });

  it("rejects with wrong secret token", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "real-secret";
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/webhook", {
      body: { update_id: 1 },
      headers: { "x-telegram-bot-api-secret-token": "wrong-secret" },
    });
    expect(res.status).toBe(401);
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  it("accepts with correct secret token", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "real-secret";
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/webhook", {
      body: { update_id: 1, message: { text: "hi" } },
      headers: { "x-telegram-bot-api-secret-token": "real-secret" },
    });
    expect(res.status).toBe(200);
    expect(mockBot.handleUpdate).toHaveBeenCalledWith({
      update_id: 1,
      message: { text: "hi" },
    });
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  it("returns 500 when handleUpdate throws", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "real-secret";
    mockBot.handleUpdate.mockRejectedValueOnce(new Error("bot crashed"));
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/webhook", {
      body: { update_id: 99 },
      headers: { "x-telegram-bot-api-secret-token": "real-secret" },
    });
    expect(res.status).toBe(500);
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });
});

describe("GET /", () => {
  it("serves the landing page", async () => {
    const app = createServer(mockBot);
    const res = await request(app, "GET", "/");
    expect(res.status).toBe(200);
    expect(res.data).toContain("Eliora");
  });
});

describe("cron error handling", () => {
  it("returns 500 when processDueMessages throws", async () => {
    mockProcessDueMessages.mockRejectedValueOnce(new Error("db down"));
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/cron/deliver", {
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    expect(res.status).toBe(500);
    expect(res.data.ok).toBe(false);
    expect(res.data.error).toBe("internal_error");
  });

  it("returns 500 when processNudges throws", async () => {
    mockProcessNudges.mockRejectedValueOnce(new Error("nudge fail"));
    const app = createServer(mockBot);
    const res = await request(app, "POST", "/cron/nudges", {
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    expect(res.status).toBe(500);
    expect(res.data.ok).toBe(false);
    expect(res.data.error).toBe("internal_error");
  });
});
