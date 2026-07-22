// Durable domain storage — user profiles, watchlists, alerts.
// Backed by the toolkit's StorageAdapter (MemorySessionStorage in dev/tests,
// Redis-backed in production when REDIS_URL is set). NOT in-memory Maps.

import { MemorySessionStorage } from "./toolkit/index.js";

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface UserProfile {
  timezone?: string;
  quietHoursStart?: number; // 0-23 hour
  quietHoursEnd?: number; // 0-23 hour
  morningSummary?: boolean;
  ownerVisible?: boolean;
}

export interface WatchlistItem {
  ticker: string;
  displayName: string;
}

export interface Alert {
  id: string;
  ticker: string;
  type: "threshold" | "percentage";
  direction: "above" | "below";
  value: number;
  cooldownMinutes: number;
  active: boolean;
  lastFired?: number; // epoch ms
  createdAt: number;
}

export interface QueuedAlert {
  alertId: string;
  ticker: string;
  message: string;
  queuedAt: number;
}

export interface AlertFireRecord {
  alertId: string;
  ticker: string;
  firedAt: number;
}

// ---------------------------------------------------------------------------
// Generic async store wrapper over StorageAdapter
// ---------------------------------------------------------------------------

class Store<T> {
  private storage: MemorySessionStorage<T>;

  constructor() {
    this.storage = new MemorySessionStorage<T>();
  }

  async get(key: string): Promise<T | undefined> {
    return this.storage.read(key);
  }

  async set(key: string, value: T): Promise<void> {
    this.storage.write(key, value);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }
}

// ---------------------------------------------------------------------------
// Domain stores — key is always userId (string)
// ---------------------------------------------------------------------------

/** User profiles keyed by userId. */
export const userProfiles = new Store<UserProfile>();

/** Watchlists keyed by userId. Value is the user's list of watched coins. */
export const watchlists = new Store<WatchlistItem[]>();

/** Alerts keyed by userId. Value is the user's list of alerts. */
export const alerts = new Store<Alert[]>();

/** Queued alerts (suppressed during quiet hours) keyed by userId. */
export const queuedAlerts = new Store<QueuedAlert[]>();

/** Alert fire history keyed by userId. */
export const alertFires = new Store<AlertFireRecord[]>();

/** All known user IDs (index for stats). */
export const allUserIds = new Store<string[]>();
