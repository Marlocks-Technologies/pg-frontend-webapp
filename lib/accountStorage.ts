let activeSub = '';

export function setActiveAccountSub(sub: string): void {
  activeSub = sub;
}

export function accountStorageKey(base: string): string {
  return activeSub ? `${base}:${activeSub}` : base;
}
