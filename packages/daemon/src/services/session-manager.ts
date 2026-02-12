import type { ServerResponse } from "node:http";
import type { Session, PendingApproval, SSEEvent } from "@claude-watch/shared";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

export class SessionManager {
  private sessions = new Map<string, Session>();
  private listeners = new Set<ServerResponse>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  upsert(id: string, data: Partial<Omit<Session, "id">>): Session {
    const existing = this.sessions.get(id);
    const session: Session = existing
      ? { ...existing, ...data, lastActivity: Date.now() }
      : {
          id,
          status: data.status ?? "idle",
          cwd: data.cwd ?? "",
          lastActivity: Date.now(),
          pending: data.pending,
        };

    this.sessions.set(id, session);
    this.broadcast({ type: "session_update", session });
    return session;
  }

  setPending(id: string, approval: PendingApproval): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.status = "waiting_approval";
    session.pending = approval;
    session.lastActivity = Date.now();
    this.broadcast({ type: "session_update", session });
    this.broadcast({
      type: "approval_request",
      sessionId: id,
      approval,
    });
  }

  clearPending(id: string, approvalId: string, decision: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.status = "idle";
    session.pending = undefined;
    session.lastActivity = Date.now();
    this.broadcast({ type: "session_update", session });
    this.broadcast({
      type: "approval_resolved",
      sessionId: id,
      approvalId,
      decision,
    });
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  broadcast(event: SSEEvent): void {
    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of this.listeners) {
      try {
        res.write(data);
      } catch {
        this.listeners.delete(res);
      }
    }
  }

  addListener(res: ServerResponse): void {
    this.listeners.add(res);
  }

  removeListener(res: ServerResponse): void {
    this.listeners.delete(res);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.status !== "waiting_approval" && now - session.lastActivity > IDLE_TIMEOUT_MS) {
        this.sessions.delete(id);
        this.broadcast({
          type: "session_update",
          session: { ...session, status: "idle" },
        });
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.listeners.clear();
  }
}
