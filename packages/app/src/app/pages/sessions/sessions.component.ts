import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { SseService, SessionData } from '../../services/sse.service';

@Component({
  selector: 'app-sessions',
  standalone: true,
  template: `
    <div class="sessions-page">
      @if (!auth.isPaired()) {
        <div class="unpaired-notice">
          <p>Not paired with daemon yet.</p>
          <button class="btn btn-primary" (click)="goToPair()">Pair Device</button>
        </div>
      } @else {
        <div class="top-bar">
          <div class="connection-status" [class.connected]="connected()">
            {{ connected() ? 'Connected' : 'Connecting...' }}
          </div>
          <button
            class="remote-toggle"
            [class.active]="remoteMode()"
            (click)="toggleRemoteMode()"
          >
            <span class="toggle-dot"></span>
            <span class="toggle-label">{{ remoteMode() ? 'Remote ON' : 'Remote OFF' }}</span>
          </button>
        </div>

        @if (remoteMode()) {
          <div class="remote-banner">
            Approval requests are being intercepted. Approve from here.
          </div>
        }

        @if (sessions().length === 0) {
          <div class="empty-state">
            <p>No active sessions</p>
            <p class="hint">Start a Claude Code session to see it here</p>
          </div>
        } @else {
          <div class="session-list">
            @for (session of sessions(); track session.id) {
              <div
                class="session-card"
                [class.waiting]="session.status === 'waiting_approval'"
                (click)="onSessionClick(session)"
              >
                <div class="session-header">
                  <span class="session-id">{{ session.id.substring(0, 8) }}</span>
                  <span class="status-badge" [attr.data-status]="session.status">
                    {{ statusLabel(session.status) }}
                  </span>
                </div>
                <div class="session-cwd">{{ session.cwd }}</div>
                @if (session.pending) {
                  <div class="pending-info">
                    <span class="tool-name">{{ session.pending.toolName }}</span>
                    <span class="pending-label">needs approval</span>
                  </div>
                }
                <div class="session-time">
                  {{ timeAgo(session.lastActivity) }}
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .sessions-page {
      max-width: 600px;
      margin: 0 auto;
    }
    .unpaired-notice {
      text-align: center;
      padding: 40px 20px;
    }
    .unpaired-notice p {
      margin-bottom: 20px;
      color: var(--text-secondary);
    }
    .top-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .connection-status {
      flex: 1;
      text-align: center;
      padding: 8px;
      border-radius: var(--radius);
      background: var(--bg-card);
      color: var(--accent-orange);
      font-size: 0.85rem;
    }
    .connection-status.connected {
      color: var(--accent-green);
    }
    .remote-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: var(--radius);
      background: var(--bg-card);
      border: 2px solid var(--border-color);
      color: var(--text-secondary);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .remote-toggle.active {
      border-color: var(--accent-orange);
      color: var(--accent-orange);
      background: rgba(255, 159, 67, 0.1);
    }
    .toggle-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent-gray);
      transition: background 0.2s;
    }
    .remote-toggle.active .toggle-dot {
      background: var(--accent-orange);
      box-shadow: 0 0 8px rgba(255, 159, 67, 0.5);
    }
    .remote-banner {
      background: rgba(255, 159, 67, 0.1);
      border: 1px solid var(--accent-orange);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 16px;
      font-size: 0.85rem;
      color: var(--accent-orange);
      text-align: center;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
    }
    .empty-state p {
      color: var(--text-secondary);
    }
    .empty-state .hint {
      margin-top: 8px;
      font-size: 0.85rem;
      color: var(--accent-gray);
    }
    .session-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .session-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 16px;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    .session-card:active {
      border-color: var(--accent-blue);
    }
    .session-card.waiting {
      border-color: var(--accent-orange);
    }
    .session-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .session-id {
      font-family: monospace;
      font-size: 0.95rem;
      font-weight: 600;
    }
    .status-badge {
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-badge[data-status="working"] {
      background: rgba(74, 158, 255, 0.15);
      color: var(--accent-blue);
    }
    .status-badge[data-status="waiting_approval"] {
      background: rgba(255, 159, 67, 0.15);
      color: var(--accent-orange);
    }
    .status-badge[data-status="idle"] {
      background: rgba(99, 110, 114, 0.15);
      color: var(--accent-gray);
    }
    .status-badge[data-status="error"] {
      background: rgba(231, 76, 60, 0.15);
      color: var(--accent-red);
    }
    .session-cwd {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pending-info {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .tool-name {
      font-family: monospace;
      font-size: 0.85rem;
      color: var(--accent-orange);
      font-weight: 600;
    }
    .pending-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    .session-time {
      font-size: 0.75rem;
      color: var(--accent-gray);
    }
    .btn {
      padding: 14px 28px;
      border-radius: var(--radius);
      font-size: 1rem;
      font-weight: 600;
    }
    .btn-primary {
      background: var(--accent-blue);
      color: white;
    }
  `],
})
export class SessionsComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private sse = inject(SseService);
  private router = inject(Router);
  private sub: Subscription | null = null;

  sessions = signal<SessionData[]>([]);
  connected = signal(false);
  remoteMode = signal(false);

  async ngOnInit(): Promise<void> {
    if (!this.auth.isPaired()) return;

    // Load remote mode state
    this.remoteMode.set(await this.api.getRemoteMode());

    this.sse.connect();
    this.sub = this.sse.events.subscribe((event) => {
      this.connected.set(true);

      switch (event.type) {
        case 'init':
          this.sessions.set(event.sessions);
          break;
        case 'session_update':
          this.sessions.update((list) => {
            const idx = list.findIndex((s) => s.id === event.session.id);
            if (idx >= 0) {
              const copy = [...list];
              copy[idx] = event.session;
              return copy;
            }
            return [...list, event.session];
          });
          break;
        case 'approval_request':
          this.sessions.update((list) => {
            const idx = list.findIndex((s) => s.id === event.sessionId);
            if (idx >= 0) {
              const copy = [...list];
              copy[idx] = {
                ...copy[idx],
                status: 'waiting_approval',
                pending: event.approval,
              };
              return copy;
            }
            return list;
          });
          break;
        case 'approval_resolved':
          this.sessions.update((list) => {
            const idx = list.findIndex((s) => s.id === event.sessionId);
            if (idx >= 0) {
              const copy = [...list];
              copy[idx] = {
                ...copy[idx],
                status: 'working',
                pending: undefined,
              };
              return copy;
            }
            return list;
          });
          break;
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async toggleRemoteMode(): Promise<void> {
    const newState = !this.remoteMode();
    const result = await this.api.setRemoteMode(newState);
    this.remoteMode.set(result);
  }

  goToPair(): void {
    this.router.navigate(['/pair']);
  }

  onSessionClick(session: SessionData): void {
    if (session.status === 'waiting_approval') {
      this.router.navigate(['/approval', session.id]);
    }
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'working': return 'Working';
      case 'waiting_approval': return 'Waiting';
      case 'idle': return 'Idle';
      case 'error': return 'Error';
      default: return status;
    }
  }

  timeAgo(ts: number): string {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
}
