import { Injectable, inject, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { AuthService } from './auth.service';

export type SSEEvent =
  | { type: 'init'; sessions: SessionData[] }
  | { type: 'session_update'; session: SessionData }
  | { type: 'approval_request'; sessionId: string; approval: PendingApprovalData }
  | { type: 'approval_resolved'; sessionId: string; approvalId: string; decision: string }
  | { type: 'heartbeat'; timestamp: number };

export interface SessionData {
  id: string;
  status: 'working' | 'waiting_approval' | 'idle' | 'error';
  cwd: string;
  lastActivity: number;
  pending?: PendingApprovalData;
}

export interface PendingApprovalData {
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class SseService implements OnDestroy {
  private auth = inject(AuthService);
  private eventSource: EventSource | null = null;
  private events$ = new Subject<SSEEvent>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  readonly events: Observable<SSEEvent> = this.events$.asObservable();

  connect(): void {
    if (this.eventSource) {
      return;
    }

    const token = this.auth.getToken();
    if (!token) {
      return;
    }

    const loc = window.location;
    const base = loc.port === '4500' ? `${loc.protocol}//${loc.hostname}:3100` : loc.origin;
    const url = `${base}/sessions/events?token=${encodeURIComponent(token)}`;
    this.eventSource = new EventSource(url);

    const eventTypes = ['init', 'session_update', 'approval_request', 'approval_resolved', 'heartbeat'] as const;
    for (const type of eventTypes) {
      this.eventSource.addEventListener(type, (event) => {
        try {
          const data: SSEEvent = JSON.parse((event as MessageEvent).data);
          this.events$.next(data);

          if (data.type === 'approval_request') {
            this.showNotification(data);
          }
        } catch {
          // Ignore malformed events
        }
      });
    }

    this.eventSource.onerror = () => {
      this.disconnect();
      // Reconnect after 3 seconds
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.events$.complete();
  }

  private async showNotification(data: {
    sessionId: string;
    approval: PendingApprovalData;
  }): Promise<void> {
    if (typeof Notification === 'undefined') return;

    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
      new Notification('Claude Watch - Approval Required', {
        body: `${data.approval.toolName} in session ${data.sessionId.substring(0, 8)}`,
        tag: data.approval.approvalId,
        requireInteraction: true,
      });
    }
  }
}
