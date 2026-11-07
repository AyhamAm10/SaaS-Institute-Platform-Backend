import { CacheStore } from './cache-store';

/**
 * In-memory CacheStore for unit tests (no Redis needed).
 * Not registered in the application module.
 */
export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(keys: string[]): Promise<void> {
    keys.forEach((k) => this.entries.delete(k));
  }

  async incr(key: string): Promise<number> {
    const next = Number((await this.get(key)) ?? 0) + 1;
    this.entries.set(key, {
      value: String(next),
      expiresAt: Number.POSITIVE_INFINITY,
    });
    return next;
  }
}
