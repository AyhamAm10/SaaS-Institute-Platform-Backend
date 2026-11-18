import { jest } from '@jest/globals';

/**
 * The scenario clock. Only `Date` is faked: timers, promises and I/O stay real,
 * so Prisma and HTTP keep working while "now" is exactly what the test says.
 * The time stays frozen until the next `setClock`.
 *
 * Note: columns filled by the database itself (`@default(now())`, e.g. createdAt)
 * use the real database time, not this clock.
 */
const REAL_TIMERS = [
  'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval',
  'clearInterval', 'setTimeout', 'clearTimeout',
] as const;

/** Damascus is UTC+3 all year (no daylight saving since 2022). */
export const INSTITUTE_OFFSET = '+03:00';

/** `'2026-11-18 08:16'` or `'2026-11-18 08:16:30'` in the institute's local time -> UTC instant. */
export function localInstant(local: string): Date {
  const [date, time = '00:00'] = local.split(' ');
  const full = time.length === 5 ? `${time}:00` : time;
  const at = new Date(`${date}T${full}${INSTITUTE_OFFSET}`);
  if (Number.isNaN(at.getTime())) throw new Error(`Bad local time: ${local}`);
  return at;
}

/** Freezes "now" at a local institute time. Every scenario sets it explicitly. */
export function setClock(local: string): Date {
  const at = localInstant(local);
  jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: at });
  return at;
}

/** Back to the machine clock (end of a file). */
export function realClock(): void {
  jest.useRealTimers();
}
