import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../services/session-manager.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function registerSessionRoutes(
  app: FastifyInstance,
  sessionManager: SessionManager,
): void {
  // List all sessions
  app.get("/sessions", async () => {
    return sessionManager.getAll();
  });

  // SSE stream
  app.get("/sessions/events", (request, reply) => {
    const raw = reply.raw;

    const origin = request.headers.origin ?? "*";
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    });

    // Send init event with current sessions
    const initEvent = {
      type: "init" as const,
      sessions: sessionManager.getAll(),
    };
    raw.write(`event: init\ndata: ${JSON.stringify(initEvent)}\n\n`);

    // Register as SSE listener
    sessionManager.addListener(raw);

    // Heartbeat
    const heartbeat = setInterval(() => {
      const event = { type: "heartbeat" as const, timestamp: Date.now() };
      try {
        raw.write(`event: heartbeat\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        clearInterval(heartbeat);
        sessionManager.removeListener(raw);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Cleanup on close
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      sessionManager.removeListener(raw);
    });

    // Don't let Fastify send a response — we're handling the raw stream
    return reply.hijack();
  });
}
