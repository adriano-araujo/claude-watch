import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";

import { PendingStore } from "./services/pending-store.js";
import { SessionManager } from "./services/session-manager.js";
import { AuthService } from "./services/auth-service.js";

import { registerHookRoutes } from "./routes/hooks.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerRespondRoutes } from "./routes/respond.js";
import { registerAuthRoutes } from "./routes/auth.js";

const PORT = parseInt(process.env["CLAUDE_WATCH_PORT"] ?? "3200", 10);
const __dirname = dirname(fileURLToPath(import.meta.url));
// In production: daemon/dist/server.js → ../../app/dist/browser
const STATIC_ROOT = join(__dirname, "..", "..", "app", "dist", "browser");

const app = Fastify({ logger: true });

// Services
const pendingStore = new PendingStore();
const sessionManager = new SessionManager();
const authService = new AuthService();

// CORS — allow all origins for dev
await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

// Auth hook
app.addHook("onRequest", async (request, reply) => {
  const url = request.url;

  // Only require auth for API routes
  const isApiRoute = url.startsWith("/sessions") || url.startsWith("/hooks/");
  if (!isApiRoute || url === "/hooks/pre-tool-use" || url === "/auth/pair") {
    return;
  }

  // Skip auth if no devices registered yet (first-time setup)
  if (!authService.hasDevices()) {
    return;
  }

  // Check Authorization header or query param
  const authHeader = request.headers.authorization;
  const queryToken = (request.query as Record<string, string>)["token"];

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : queryToken;

  if (!token || !authService.isValidToken(token)) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
});

// Routes
registerHookRoutes(app, pendingStore, sessionManager);
registerSessionRoutes(app, sessionManager);
registerRespondRoutes(app, pendingStore);
registerAuthRoutes(app, authService);

// Serve Angular PWA static files (production)
if (existsSync(STATIC_ROOT)) {
  await app.register(fastifyStatic, {
    root: STATIC_ROOT,
    wildcard: false,
  });

  // SPA fallback: serve index.html for any unmatched route
  app.setNotFoundHandler((_request, reply) => {
    return reply.sendFile("index.html");
  });
}

// Startup
async function start(): Promise<void> {
  await authService.init();

  await app.listen({ port: PORT, host: "0.0.0.0" });

  console.log(`\n  claude-watch daemon listening on http://0.0.0.0:${PORT}`);
  if (existsSync(STATIC_ROOT)) {
    console.log(`  Serving PWA from ${STATIC_ROOT}`);
  }
  authService.showPin();
}

start().catch((err) => {
  console.error("Failed to start daemon:", err);
  process.exit(1);
});
