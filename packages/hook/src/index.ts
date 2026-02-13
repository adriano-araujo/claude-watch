#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HookInput, HookOutput, HookResponse, PermissionRules } from "@claude-watch/shared";
import { ALWAYS_ALLOWED_TOOLS, checkPermission } from "@claude-watch/shared";

const DAEMON_PORT = process.env.CLAUDE_WATCH_PORT || "3200";
const DAEMON_URL = `http://localhost:${DAEMON_PORT}`;
const REMOTE_MODE_FILE = join(homedir(), ".claude-watch", "remote-mode");

function writeOutput(decision: "allow" | "deny" | "ask", reason: string): void {
  const output: HookOutput = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(output));
}

function isRemoteModeActive(): boolean {
  return existsSync(REMOTE_MODE_FILE);
}

function readSettingsPermissions(): PermissionRules {
  const defaultRules: PermissionRules = { allow: [], deny: [] };

  try {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    const raw = readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;

    const permissions = settings.permissions as
      | { allow?: string[]; deny?: string[] }
      | undefined;

    if (!permissions) return defaultRules;

    return {
      allow: Array.isArray(permissions.allow) ? permissions.allow : [],
      deny: Array.isArray(permissions.deny) ? permissions.deny : [],
    };
  } catch {
    return defaultRules;
  }
}

async function consultDaemon(input: HookInput): Promise<void> {
  try {
    const response = await fetch(`${DAEMON_URL}/hooks/pre-tool-use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: input.session_id,
        tool_name: input.tool_name,
        tool_input: input.tool_input,
        cwd: input.cwd,
      }),
    });

    if (!response.ok) {
      writeOutput("ask", `Daemon returned HTTP ${response.status}, falling back to terminal`);
      return;
    }

    const data = (await response.json()) as HookResponse;
    writeOutput(data.decision, data.reason ?? "Decision from claude-remote daemon");
  } catch {
    writeOutput("ask", "Daemon unreachable, falling back to terminal");
  }
}

async function main(): Promise<void> {
  // 1. If remote mode is not active, don't interfere at all
  if (!isRemoteModeActive()) {
    process.exit(0);
  }

  // 2. Read hook input from stdin
  let rawInput: string;
  try {
    rawInput = readFileSync(0, "utf-8");
  } catch {
    writeOutput("ask", "Failed to read stdin");
    process.exit(0);
  }

  let input: HookInput;
  try {
    input = JSON.parse(rawInput) as HookInput;
  } catch {
    writeOutput("ask", "Failed to parse stdin JSON");
    process.exit(0);
  }

  // 3. Always-allowed tools — exit immediately
  if (ALWAYS_ALLOWED_TOOLS.has(input.tool_name)) {
    process.exit(0);
  }

  // 4. Read CC permissions from settings.json
  const rules = readSettingsPermissions();

  // 5. Check permission
  const decision = checkPermission(rules, input.tool_name, input.tool_input);

  switch (decision) {
    case "allow":
      process.exit(0);
      break;

    case "deny":
      writeOutput("deny", "Denied by CC permissions");
      break;

    case "ask":
      // Remote mode active — send to phone instead of terminal
      await consultDaemon(input);
      break;

    case "unknown":
      await consultDaemon(input);
      break;
  }
}

main().catch(() => {
  writeOutput("ask", "Unexpected error in hook");
  process.exit(0);
});
