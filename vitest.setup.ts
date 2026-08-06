// happy-dom's localStorage doesn't support clear() in version 20.11.1
// Create a wrapper with full Storage interface support
import { vi } from 'vitest';

class StoragePolyfill implements Storage {
  private data: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.data).length;
  }

  clear(): void {
    this.data = {};
  }

  getItem(key: string): string | null {
    return this.data[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.data[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.data[key];
  }

  key(index: number): string | null {
    const keys = Object.keys(this.data);
    return keys[index] ?? null;
  }
}

vi.stubGlobal('localStorage', new StoragePolyfill());
