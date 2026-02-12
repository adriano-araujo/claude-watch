import { nanoid } from "nanoid";

export interface PendingResult {
  decision: "allow" | "deny" | "ask";
  reason?: string;
}

interface PendingEntry {
  resolve: (result: PendingResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const TIMEOUT_MS = 295_000; // 295s, just under CC's 300s hook timeout

export class PendingStore {
  private pending = new Map<string, PendingEntry>();

  create(
    _sessionId: string,
    _toolName: string,
    _toolInput: Record<string, unknown>,
  ): { approvalId: string; promise: Promise<PendingResult> } {
    const approvalId = nanoid();

    const promise = new Promise<PendingResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(approvalId);
        resolve({ decision: "ask", reason: "Timeout — escalated to local terminal" });
      }, TIMEOUT_MS);

      this.pending.set(approvalId, { resolve, timer });
    });

    return { approvalId, promise };
  }

  resolve(approvalId: string, decision: "allow" | "deny", reason?: string): boolean {
    const entry = this.pending.get(approvalId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(approvalId);
    entry.resolve({ decision, reason });
    return true;
  }

  get size(): number {
    return this.pending.size;
  }
}
