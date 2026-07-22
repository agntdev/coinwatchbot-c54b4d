// Injectable clock seam for testable time-based behavior.
// Route every schedule, cutoff, "today", expiry, and late/on-time decision
// through now() instead of calling new Date() / Date.now() inline.

export type ClockFn = () => Date;

let clock: ClockFn = () => new Date();

/** Get the current time (injectable for tests). */
export function now(): Date {
  return clock();
}

/** Override the clock (test-only). */
export function setClock(fn: ClockFn): void {
  clock = fn;
}

/** Reset to real time (test cleanup). */
export function resetClock(): void {
  clock = () => new Date();
}
