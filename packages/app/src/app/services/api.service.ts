import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import type { SessionData } from './sse.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private auth = inject(AuthService);

  private get baseUrl(): string {
    // In production, daemon serves the PWA (same origin).
    // In dev, Angular runs on a different port — point to daemon directly.
    const loc = window.location;
    if (loc.port === '4500') {
      return `${loc.protocol}//${loc.hostname}:3200`;
    }
    return loc.origin;
  }

  private get headers(): Record<string, string> {
    const token = this.auth.getToken();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  }

  async pair(pin: string): Promise<{ token: string; deviceId: string }> {
    const res = await fetch(`${this.baseUrl}/auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Pairing failed (${res.status})`);
    }

    return res.json();
  }

  async respond(
    sessionId: string,
    approvalId: string,
    decision: 'allow' | 'deny',
  ): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/respond`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ approvalId, decision }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Respond failed (${res.status})`);
    }
  }

  async getRemoteMode(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/hooks/remote-mode`, {
      headers: this.headers,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.remoteMode;
  }

  async setRemoteMode(enabled: boolean): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/hooks/remote-mode`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.remoteMode;
  }

  async getSessions(): Promise<SessionData[]> {
    const res = await fetch(`${this.baseUrl}/sessions`, {
      headers: this.headers,
    });
    if (!res.ok) return [];
    return res.json();
  }

  async stopSession(sessionId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/stop`,
      {
        method: 'POST',
        headers: this.headers,
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Stop failed (${res.status})`);
    }
  }
}
