import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-pair',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pair-page">
      <div class="pair-card">
        <h2>Pair Device</h2>
        <p class="instructions">
          Enter the 6-digit PIN shown on the daemon terminal.
        </p>

        <input
          type="text"
          class="pin-input"
          maxlength="6"
          inputmode="numeric"
          pattern="[0-9]*"
          placeholder="000000"
          [(ngModel)]="pin"
          [disabled]="pairing()"
          (keyup.enter)="doPair()"
        />

        <button
          class="btn btn-primary"
          [disabled]="pairing() || pin.length < 6"
          (click)="doPair()"
        >
          {{ pairing() ? 'Pairing...' : 'Pair' }}
        </button>

        @if (error()) {
          <p class="error-msg">{{ error() }}</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .pair-page {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
    }
    .pair-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 32px 24px;
      text-align: center;
      width: 100%;
      max-width: 360px;
    }
    .pair-card h2 {
      margin-bottom: 12px;
      font-size: 1.3rem;
    }
    .instructions {
      color: var(--text-secondary);
      font-size: 0.9rem;
      margin-bottom: 24px;
    }
    .pin-input {
      display: block;
      width: 100%;
      padding: 16px;
      font-size: 2rem;
      font-family: monospace;
      text-align: center;
      letter-spacing: 0.5em;
      background: var(--bg-primary);
      border: 2px solid var(--border-color);
      border-radius: var(--radius);
      color: var(--text-primary);
      margin-bottom: 20px;
      outline: none;
    }
    .pin-input:focus {
      border-color: var(--accent-blue);
    }
    .pin-input::placeholder {
      color: var(--accent-gray);
      opacity: 0.4;
    }
    .btn {
      width: 100%;
      padding: 16px;
      border-radius: var(--radius);
      font-size: 1.1rem;
      font-weight: 700;
      transition: opacity 0.2s;
    }
    .btn:disabled {
      opacity: 0.5;
    }
    .btn-primary {
      background: var(--accent-blue);
      color: white;
    }
    .btn-primary:active {
      background: #3a8eef;
    }
    .error-msg {
      margin-top: 16px;
      color: var(--accent-red);
      font-size: 0.85rem;
    }
  `],
})
export class PairComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  pin = '';
  pairing = signal(false);
  error = signal('');

  async doPair(): Promise<void> {
    if (this.pin.length < 6) return;

    this.pairing.set(true);
    this.error.set('');

    try {
      const result = await this.api.pair(this.pin);
      this.auth.saveCredentials(result.token, result.deviceId);
      this.requestNotificationPermission();
      this.router.navigate(['/']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Pairing failed');
    } finally {
      this.pairing.set(false);
    }
  }

  private requestNotificationPermission(): void {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }
}
