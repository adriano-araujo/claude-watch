import { writeFile, unlink, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { FastifyInstance } from "fastify";
import type { HookRequest, HookResponse } from "@claude-watch/shared";
import type { PendingStore } from "../services/pending-store.js";
import type { SessionManager } from "../services/session-manager.js";

const CONFIG_DIR = join(homedir(), ".claude-watch");
const REMOTE_MODE_FILE = join(CONFIG_DIR, "remote-mode");

export function registerHookRoutes(
  app: FastifyInstance,
  pendingStore: PendingStore,
  sessionManager: SessionManager,
): void {
  // Toggle remote mode on/off
  app.post<{ Body: { enabled: boolean } }>("/hooks/remote-mode", async (request) => {
    const { enabled } = request.body;

    if (enabled) {
      await mkdir(CONFIG_DIR, { recursive: true });
      await writeFile(REMOTE_MODE_FILE, String(Date.now()), "utf-8");
    } else {
      try {
        await unlink(REMOTE_MODE_FILE);
      } catch {
        // File didn't exist — that's fine
      }
    }

    return { remoteMode: enabled };
  });

  // Get remote mode status
  app.get("/hooks/remote-mode", async () => {
    try {
      await readFile(REMOTE_MODE_FILE, "utf-8");
      return { remoteMode: true };
    } catch {
      return { remoteMode: false };
    }
  });

  // Remote mode: receive tool call and block until phone responds
  app.post<{ Body: HookRequest }>("/hooks/pre-tool-use", async (request) => {
    const { session_id, tool_name, tool_input, cwd } = request.body;

    sessionManager.upsert(session_id, { cwd, status: "working" });

    const { approvalId, promise } = pendingStore.create(session_id, tool_name, tool_input);

    const approval = {
      approvalId,
      toolName: tool_name,
      toolInput: tool_input,
      timestamp: Date.now(),
    };

    sessionManager.setPending(session_id, approval);

    const result = await promise;

    sessionManager.clearPending(session_id, approvalId, result.decision);

    const response: HookResponse = {
      decision: result.decision,
      reason: result.reason,
    };

    return response;
  });
}
