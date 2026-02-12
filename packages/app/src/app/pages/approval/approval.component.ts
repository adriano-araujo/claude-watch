import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { SseService, SessionData } from '../../services/sse.service';

@Component({
  selector: 'app-approval',
  standalone: true,
  template: `
    <div class="approval-page">
      @if (loading()) {
        <p class="loading">Loading...</p>
      } @else if (!session()) {
        <p class="not-found">Session not found or no pending approval.</p>
        <button class="btn btn-secondary" (click)="goBack()">Back</button>
      } @else {
        <div class="approval-card">
          <div class="section-label">Session</div>
          <div class="session-id">{{ session()!.id.substring(0, 12) }}</div>
          <div class="session-cwd">{{ session()!.cwd }}</div>

          @if (session()!.pending) {
            <div class="divider"></div>

            <div class="section-label">Tool</div>
            <div class="tool-name">{{ session()!.pending!.toolName }}</div>

            <div class="section-label">Input</div>
            <pre class="tool-input">{{ formatInput(session()!.pending!.toolInput) }}</pre>

            <div class="actions">
              <button
                class="btn btn-approve"
                [disabled]="responding()"
                (click)="respond('allow')"
              >
                Approve
              </button>
              <button
                class="btn btn-deny"
                [disabled]="responding()"
                (click)="respond('deny')"
              >
                Deny
              </button>
            </div>

            @if (error()) {
              <p class="error-msg">{{ error() }}</p>
            }
          } @else {
            <p class="resolved">No pending approval for this session.</p>
          }
        </div>

        <button class="btn btn-secondary back-btn" (click)="goBack()">Back to Sessions</button>
      }
    </div>
  `,
  styles: [`
    .approval-page {
      max-width: 600px;
      margin: 0 auto;
    }
    .loading, .not-found, .resolved {
      text-align: center;
      padding: 40px;
      color: var(--text-secondary);
    }
    .approval-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 20px;
    }
    .section-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--accent-gray);
      margin-top: 16px;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .section-label:first-child {
      margin-top: 0;
    }
    .session-id {
      font-family: monospace;
      font-size: 1rem;
      font-weight: 600;
    }
    .session-cwd {
      font-size: 0.85rem;
      color: var(--text-secondary);
      margin-top: 4px;
    }
    .divider {
      height: 1px;
      background: var(--border-color);
      margin: 16px 0;
    }
    .tool-name {
      font-family: monospace;
      font-size: 1.1rem;
      color: var(--accent-orange);
      font-weight: 600;
    }
    .tool-input {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
      font-size: 0.8rem;
      color: var(--text-secondary);
      overflow-x: auto;
      max-height: 300px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .btn {
      padding: 16px 24px;
      border-radius: var(--radius);
      font-size: 1.1rem;
      font-weight: 700;
      flex: 1;
      transition: opacity 0.2s;
    }
    .btn:disabled {
      opacity: 0.5;
    }
    .btn-approve {
      background: var(--accent-green);
      color: white;
    }
    .btn-approve:active {
      background: #27ae60;
    }
    .btn-deny {
      background: var(--accent-red);
      color: white;
    }
    .btn-deny:active {
      background: #c0392b;
    }
    .btn-secondary {
      background: var(--bg-secondary);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
    }
    .back-btn {
      display: block;
      width: 100%;
      margin-top: 16px;
      text-align: center;
    }
    .error-msg {
      margin-top: 12px;
      color: var(--accent-red);
      font-size: 0.85rem;
      text-align: center;
    }
  `],
})
export class ApprovalComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private sse = inject(SseService);
  private sub: Subscription | null = null;

  session = signal<SessionData | null>(null);
  loading = signal(true);
  responding = signal(false);
  error = signal('');

  async ngOnInit(): Promise<void> {
    const sessionId = this.route.snapshot.paramMap.get('sessionId');
    if (!sessionId) {
      this.loading.set(false);
      return;
    }

    // Fetch current state via REST API
    const sessions = await this.api.getSessions();
    const found = sessions.find((s) => s.id === sessionId);
    if (found) {
      this.session.set(found);
    }
    this.loading.set(false);

    // Also listen for live updates via SSE
    this.sub = this.sse.events.subscribe((event) => {
      if (event.type === 'session_update' && event.session.id === sessionId) {
        this.session.set(event.session);
      } else if (event.type === 'approval_resolved' && event.sessionId === sessionId) {
        this.session.update((s) =>
          s ? { ...s, status: 'working', pending: undefined } : s,
        );
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async respond(decision: 'allow' | 'deny'): Promise<void> {
    const s = this.session();
    if (!s?.pending) return;

    this.responding.set(true);
    this.error.set('');

    try {
      await this.api.respond(s.id, s.pending.approvalId, decision);
      this.router.navigate(['/']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      this.responding.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  formatInput(input: Record<string, unknown>): string {
    return JSON.stringify(input, null, 2);
  }
}
