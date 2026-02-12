import { Injectable, signal } from '@angular/core';

const TOKEN_KEY = 'claude-watch-token';
const DEVICE_ID_KEY = 'claude-watch-device-id';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _isPaired = signal(this.hasToken());

  readonly isPaired = this._isPaired.asReadonly();

  private hasToken(): boolean {
    return !!localStorage.getItem(TOKEN_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getDeviceId(): string | null {
    return localStorage.getItem(DEVICE_ID_KEY);
  }

  saveCredentials(token: string, deviceId: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    this._isPaired.set(true);
  }

  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    this._isPaired.set(false);
  }
}
