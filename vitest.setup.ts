// Node 25's native global localStorage shadows the happy-dom environment's storage wiring,
// leaving localStorage.clear undefined. Patch Storage.prototype so methods are inherited
// and vi.spyOn(Storage.prototype, ...) intercepts all calls.
import { vi } from 'vitest';

const data: Record<string, string> = {};

// Patch Storage.prototype with implementations that use the shared data object.
// This ensures vi.spyOn(Storage.prototype.getItem, ...) intercepts all calls.
const originalKey = Storage.prototype.key;
const originalGetItem = Storage.prototype.getItem;
const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
const originalClear = Storage.prototype.clear;

Storage.prototype.key = function (index: number): string | null {
  const keys = Object.keys(data);
  return keys[index] ?? null;
};

Storage.prototype.getItem = function (key: string): string | null {
  return data[key] ?? null;
};

Storage.prototype.setItem = function (key: string, value: string): void {
  data[key] = String(value);
};

Storage.prototype.removeItem = function (key: string): void {
  delete data[key];
};

Storage.prototype.clear = function (): void {
  for (const key of Object.keys(data)) {
    delete data[key];
  }
};

vi.stubGlobal('localStorage', Object.create(Storage.prototype));

