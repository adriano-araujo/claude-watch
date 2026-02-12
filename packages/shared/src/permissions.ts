import type { PermissionDecision, PermissionRules } from "./types.js";

/**
 * Tools that the hook should never intercept — exit 0 immediately.
 * Includes all CC built-in tools that don't pose risk or that CC
 * manages via its own permission system (acceptEdits, etc.).
 */
export const ALWAYS_ALLOWED_TOOLS = new Set([
  // Read-only tools
  "Read",
  "Glob",
  "Grep",
  "Task",
  "TaskOutput",
  "WebSearch",
  "WebFetch",
  "ListMcpResourcesTool",
  "ReadMcpResourceTool",
  // UI/planning tools
  "AskUserQuestion",
  "EnterPlanMode",
  "ExitPlanMode",
  // Task management
  "TaskCreate",
  "TaskGet",
  "TaskUpdate",
  "TaskList",
  // File editing — CC handles permissions for these internally
  "Edit",
  "Write",
  "NotebookEdit",
  // Multi-file tools
  "MultiEdit",
  // Agent tools
  "Skill",
  "TeamCreate",
  "TeamDelete",
  "SendMessage",
  "TaskStop",
]);

/**
 * Convert a CC permission pattern to a regex.
 *
 * Patterns can be:
 * - "ToolName" → exact match on tool name
 * - "ToolName(arg:*)" → legacy colon syntax, matches ToolName with arg prefix
 * - "ToolName(arg *)" → space syntax, matches ToolName with arg prefix
 * - "prefix__*" → wildcard suffix on tool name
 *
 * Examples:
 *   "Bash(npm:*)" → matches Bash with command starting with "npm"
 *   "Bash(npm *)" → matches Bash with command starting with "npm "
 *   "Bash(git:*)" → matches Bash with command starting with "git"
 *   "mcp__docx-editor__*" → matches any tool starting with "mcp__docx-editor__"
 *   "WebSearch" → matches WebSearch exactly
 */
function patternToMatcher(
  pattern: string
): (toolName: string, toolInput: Record<string, unknown>) => boolean {
  // Pattern with argument constraint: ToolName(argPattern)
  const parenMatch = pattern.match(/^([^(]+)\((.+)\)$/);
  if (parenMatch) {
    const targetTool = parenMatch[1];
    let argPattern = parenMatch[2];

    // Convert legacy colon syntax: "npm:*" → "npm *"
    // But preserve the matching: "npm:*" should match "npm" prefix
    const isLegacyColon = argPattern.includes(":*");
    if (isLegacyColon) {
      argPattern = argPattern.replace(/:?\*$/, "");
    } else {
      argPattern = argPattern.replace(/\s?\*$/, "");
    }

    return (toolName: string, toolInput: Record<string, unknown>) => {
      if (toolName !== targetTool) return false;

      // For Bash, check the "command" field
      // For other tools, check all string values
      const valuesToCheck: string[] = [];
      if (toolName === "Bash" && typeof toolInput.command === "string") {
        valuesToCheck.push(toolInput.command);
      } else {
        for (const val of Object.values(toolInput)) {
          if (typeof val === "string") valuesToCheck.push(val);
        }
      }

      return valuesToCheck.some((val) => val.startsWith(argPattern));
    };
  }

  // Wildcard suffix: "mcp__docx-editor__*"
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return (toolName: string) => toolName.startsWith(prefix);
  }

  // Exact tool name match: "WebSearch"
  return (toolName: string) => toolName === pattern;
}

/**
 * Check if a tool call matches any permission rule.
 *
 * Evaluation order: deny → allow → unknown
 * This matches CC's own permission resolution logic.
 */
export function checkPermission(
  rules: PermissionRules,
  toolName: string,
  toolInput: Record<string, unknown>
): PermissionDecision {
  // Check deny first
  for (const pattern of rules.deny) {
    const matcher = patternToMatcher(pattern);
    if (matcher(toolName, toolInput)) {
      return "deny";
    }
  }

  // Check allow
  for (const pattern of rules.allow) {
    const matcher = patternToMatcher(pattern);
    if (matcher(toolName, toolInput)) {
      return "allow";
    }
  }

  // No match
  return "unknown";
}
