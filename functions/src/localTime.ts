import type { Streak } from '../../src/rewards';

/**
 * Clock and calendar arithmetic in somebody else's time zone.
 *
 * The functions run in UTC, and a reminder "at 7 AM" means 7 AM where that
 * person lives. Everything here goes through Intl with an explicit zone, and
 * calendar dates are plain YYYY-MM-DD strings, so nothing depends on the time
 * zone of the machine the code happens to run on — the server's or a test
 * runner's.
 */

/** A moment as a wall clock in one time zone shows it. */
export interface WallClock {
  /** YYYY-MM-DD */
  date: string;
  hour: number;
  minute: number;
  /** 0 = Monday … 6 = Sunday, like the app's calendar. */
  weekday: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function wallClock(instant: Date, timeZone: string): WallClock {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

const toUtc = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

/** A calendar date moved by whole days. */
export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** The Monday of the week a local date falls in. */
export function mondayOf(clock: WallClock): string {
  return addDays(clock.date, -clock.weekday);
}

/** The local calendar date of an ISO timestamp. */
export function localDate(iso: string, timeZone: string): string | null {
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? null : wallClock(when, timeZone).date;
}

/** "6:00 PM" */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso))
    .replace(/ /g, ' ');
}

/** "Sun, Sep 13" — the way the app writes dates. */
export function formatDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(iso)
  );
}

/**
 * The app's weekly streak (src/rewards.ts weekStreak), counted in the
 * person's own time zone. Same rules: Monday-to-Sunday weeks, only a whole
 * week without a session breaks it, and the current week never does.
 */
export function weekStreakIn(completedDates: readonly string[], now: Date, timeZone: string): Streak {
  const current = mondayOf(wallClock(now, timeZone));
  const trained = new Set<string>();
  for (const iso of completedDates) {
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) continue;
    const monday = mondayOf(wallClock(when, timeZone));
    // YYYY-MM-DD compares correctly as text. A future week has not happened yet.
    if (monday <= current) trained.add(monday);
  }

  let cursor = current;
  const thisWeek = trained.has(cursor);
  if (!thisWeek) cursor = addDays(cursor, -7);

  let weeks = 0;
  while (trained.has(cursor)) {
    weeks += 1;
    cursor = addDays(cursor, -7);
  }
  return { weeks, atRisk: !thisWeek && weeks > 0 };
}
