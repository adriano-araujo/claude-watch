// ── Hook I/O ──

export interface HookInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
  permission_mode: string;
}

export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow" | "deny" | "ask";
    permissionDecisionReason: string;
  };
}

// ── Sessions ──

export type SessionStatus =
  | "working"
  | "waiting_approval"
  | "idle"
  | "error";

export interface Session {
  id: string;
  status: SessionStatus;
  cwd: string;
  lastActivity: number;
  pending?: PendingApproval;
}

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: number;
}

// ── SSE Events ──

export type SSEEvent =
  | { type: "init"; sessions: Session[] }
  | { type: "session_update"; session: Session }
  | { type: "approval_request"; sessionId: string; approval: PendingApproval }
  | { type: "approval_resolved"; sessionId: string; approvalId: string; decision: string }
  | { type: "heartbeat"; timestamp: number };

// ── Auth ──

export interface PairRequest {
  pin: string;
}

export interface PairResponse {
  token: string;
  deviceId: string;
}

// ── Daemon API ──

export interface HookRequest {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
}

export interface HookResponse {
  decision: "allow" | "deny" | "ask";
  reason?: string;
}

export interface RespondRequest {
  approvalId: string;
  decision: "allow" | "deny";
  reason?: string;
}

// ── Permissions ──

export type PermissionDecision = "allow" | "deny" | "ask" | "unknown";

export interface PermissionRules {
  allow: string[];
  deny: string[];
}
