import { randomInt, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".claude-watch");
const DEVICES_FILE = join(CONFIG_DIR, "devices.json");
const PIN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface StoredDevice {
  deviceId: string;
  token: string;
  createdAt: number;
}

interface DevicesFile {
  devices: StoredDevice[];
}

export class AuthService {
  private currentPin: string | null = null;
  private pinExpiry: number = 0;
  private devices: StoredDevice[] = [];
  private loaded = false;

  async init(): Promise<void> {
    await this.loadDevices();
    this.regeneratePin();
  }

  regeneratePin(): string {
    this.currentPin = String(randomInt(100_000, 1_000_000));
    this.pinExpiry = Date.now() + PIN_EXPIRY_MS;
    return this.currentPin;
  }

  showPin(): void {
    if (!this.currentPin || Date.now() > this.pinExpiry) {
      this.regeneratePin();
    }
    console.log(`\n  Pairing PIN: ${this.currentPin}`);
    console.log(`  Expires in 5 minutes\n`);
  }

  async validatePin(pin: string): Promise<{ token: string; deviceId: string } | null> {
    if (!this.currentPin || Date.now() > this.pinExpiry) {
      return null;
    }

    if (pin !== this.currentPin) {
      return null;
    }

    // PIN used — invalidate it
    this.currentPin = null;

    const deviceId = randomUUID();
    const token = randomUUID();

    this.devices.push({ deviceId, token, createdAt: Date.now() });
    await this.saveDevices();

    // Generate new PIN for future pairings
    this.regeneratePin();

    return { token, deviceId };
  }

  isValidToken(token: string): boolean {
    return this.devices.some((d) => d.token === token);
  }

  hasDevices(): boolean {
    return this.devices.length > 0;
  }

  private async loadDevices(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(DEVICES_FILE, "utf-8");
      const data: DevicesFile = JSON.parse(raw);
      this.devices = data.devices ?? [];
    } catch {
      this.devices = [];
    }
    this.loaded = true;
  }

  private async saveDevices(): Promise<void> {
    await mkdir(CONFIG_DIR, { recursive: true });
    const data: DevicesFile = { devices: this.devices };
    await writeFile(DEVICES_FILE, JSON.stringify(data, null, 2), "utf-8");
  }
}
