#!/usr/bin/env node

/**
 * claude-remote setup script
 * Adds the claude-remote-hook to ~/.claude/settings.json
 */

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CLAUDE_DIR = join(homedir(), ".claude");
const SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");
const BACKUP_PATH = join(CLAUDE_DIR, "settings.backup.json");

const HOOK_ENTRY = {
  matcher: ".*",
  hooks: [
    {
      type: "command",
      command: "claude-remote-hook",
      timeout: 300,
    },
  ],
};

function isClaudeRemoteHook(entry) {
  return entry?.hooks?.some(
    (h) => h.type === "command" && h.command === "claude-remote-hook"
  );
}

async function main() {
  console.log("claude-remote setup");
  console.log("===================\n");

  // Read existing settings
  let settings;
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    settings = JSON.parse(raw);
    console.log(`[OK] Found settings at ${SETTINGS_PATH}`);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(`[!] No settings.json found at ${SETTINGS_PATH}`);
      console.log("    Creating new settings file...");
      settings = {};
    } else {
      console.error(`[ERROR] Failed to read settings.json: ${err.message}`);
      process.exit(1);
    }
  }

  // Create backup
  try {
    await copyFile(SETTINGS_PATH, BACKUP_PATH);
    console.log(`[OK] Backup created at ${BACKUP_PATH}`);
  } catch {
    // No file to backup (new install), that's fine
    console.log("[--] No existing file to backup (new install)");
  }

  // Ensure hooks.PreToolUse array exists
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!Array.isArray(settings.hooks.PreToolUse)) {
    settings.hooks.PreToolUse = [];
  }

  // Check if hook already present
  const alreadyInstalled = settings.hooks.PreToolUse.some(isClaudeRemoteHook);

  if (alreadyInstalled) {
    console.log("\n[OK] claude-remote-hook is already configured. Nothing to do.");
    return;
  }

  // Add hook entry at the end of PreToolUse array
  settings.hooks.PreToolUse.push(HOOK_ENTRY);

  // Save updated settings
  try {
    await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");
    console.log(`\n[OK] Hook added to ${SETTINGS_PATH}`);
  } catch (err) {
    console.error(`\n[ERROR] Failed to write settings.json: ${err.message}`);
    process.exit(1);
  }

  console.log("\nSetup complete! The claude-remote-hook will intercept tool calls");
  console.log("that are not covered by your allow/deny rules in settings.json.");
  console.log("\nMake sure the daemon is running: npm run dev:daemon");
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
