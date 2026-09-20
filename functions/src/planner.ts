import {
  type Client,
  type Workout,
  type WeightUnit,
  formatIn,
  loggedSets,
  topLoggedWeight,
  totalSets,
} from '../../src/models';
import type { NotificationGroup, NotificationPrefs } from '../../src/notificationPrefs';
import {
  addDays,
  daysBetween,
  formatDay,
  formatTime,
  localDate,
  mondayOf,
  wallClock,
  weekStreakIn,
} from './localTime';

/**
 * Who gets which notification, and when. Pure: given the people, their
 * sessions and the time, it returns the messages. The Cloud Functions only
 * load the data and deliver what this returns, so every timing rule is tested
 * with fixed clocks instead of by waiting for a Sunday.
 *
 * Wording is the draft from the design review and is Ryan's to change.
 */

// The switches are defined once, in the app, and shared with the server.
export { DEFAULT_PREFS } from '../../src/notificationPrefs';
export type { NotificationGroup, NotificationPrefs } from '../../src/notificationPrefs';

export type MessageKind =
  | 'reminder'
  | 'schedule'
  | 'streak'
  | 'inactive'
  | 'recap'
  | 'assigned'
  | 'left'
  | 'finished'
  | 'joined';

export interface Recipient {
  uid: string;
  timeZone: string;
  prefs: NotificationPrefs;
}

export interface Message {
  uid: string;
  kind: MessageKind;
  group: NotificationGroup;
  title: string;
  body: string;
  /** The screen a tap opens. */
  route: string;
  /** Unique per person for this message, so a retried run can never send it twice. */
  dedupeKey: string;
  /** Motivation and recap messages share a once-a-day limit, keyed here. */
  capKey?: string;
}

export interface ClientContext {
  client: Client;
  /** Missing until they have joined with their code: nobody to notify yet. */
  account?: Recipient;
  /** Their workouts, deleted ones already left out. */
  workouts: Workout[];
}

export interface TrainerContext {
  name: string;
  account: Recipient;
  clients: ClientContext[];
}

/** Local times the scheduled messages go out. Monday is weekday 0. */
export const SEND_AT = {
  reminder: { hour: 7 },
  schedule: { hour: 7 },
  inactive: { hour: 9 },
  recap: { weekday: 0, hour: 8 },
  streak: { weekday: 6, hour: 17 },
} as const;

/** Nothing is sent from 9 PM to 7 AM in the recipient's own time zone. */
export function isQuiet(hour: number): boolean {
  return hour >= 21 || hour < 7;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function listNames(names: readonly string[], max = 2): string {
  if (names.length <= max) return names.join(' and ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

const completed = (workouts: readonly Workout[]) => workouts.filter((w) => w.status === 'completed');

/**
 * Movements where this session's top set beat every earlier session. A
 * movement done for the first time is not a record: there was nothing to beat.
 */
export function recordsSet(
  session: Workout,
  earlier: readonly Workout[]
): { movementName: string; weight: number }[] {
  const best = new Map<string, number>();
  for (const workout of completed(earlier)) {
    if (workout.id === session.id) continue;
    for (const exercise of workout.exercises) {
      const top = topLoggedWeight(exercise);
      if (top !== undefined) best.set(exercise.movementName, Math.max(best.get(exercise.movementName) ?? 0, top));
    }
  }
  const records: { movementName: string; weight: number }[] = [];
  for (const exercise of session.exercises) {
    const top = topLoggedWeight(exercise);
    const prior = best.get(exercise.movementName);
    if (top !== undefined && prior !== undefined && top > prior) {
      records.push({ movementName: exercise.movementName, weight: top });
    }
  }
  return records;
}

/** Records set in the given sessions, each against everything before it. */
function recordsIn(sessions: readonly Workout[], history: readonly Workout[]): number {
  return sessions.reduce((count, session) => {
    const before = history.filter((w) => w.date < session.date);
    return count + recordsSet(session, before).length;
  }, 0);
}

function inWeek(workouts: readonly Workout[], monday: string, timeZone: string): Workout[] {
  const sunday = addDays(monday, 6);
  return completed(workouts).filter((w) => {
    const date = localDate(w.date, timeZone);
    return date !== null && date >= monday && date <= sunday;
  });
}

// MARK: - Scheduled messages

/**
 * Every scheduled message due now. Each coach and each client is planned on
 * their own: the rules don't check a document's shape, and one malformed
 * workout used to throw here and stop the run for everyone, every run. A
 * person whose data can't be planned is reported through `onError` and skipped.
 */
export function planScheduled(
  now: Date,
  trainers: readonly TrainerContext[],
  onError: (error: unknown, uid: string) => void = () => {}
): Message[] {
  const messages: Message[] = [];
  const plan = (uid: string, work: () => Message[]) => {
    try {
      messages.push(...work());
    } catch (error) {
      onError(error, uid);
    }
  };
  for (const trainer of trainers) {
    plan(trainer.account.uid, () => forTrainer(now, trainer));
    for (const context of trainer.clients) {
      const account = context.account;
      if (account) plan(account.uid, () => forClient(now, context, account, trainer.name));
    }
  }
  return messages;
}

function forClient(now: Date, context: ClientContext, account: Recipient, trainerName: string): Message[] {
  const { timeZone, prefs, uid } = account;
  const clock = wallClock(now, timeZone);
  const messages: Message[] = [];
  const history = completed(context.workouts);

  if (prefs.reminders && clock.hour === SEND_AT.reminder.hour) {
    // The same two conditions the client's own Today uses (store.tsx's
    // sentWorkoutFor): sent by their coach, and with something in it. Without
    // them a coach's unsent draft woke the client with "Bench Day today — 0
    // exercises, 0 sets", and the app they opened said "Rest day."
    const today = context.workouts
      .filter((w) => w.loggedBy === 'trainer' && w.status !== 'completed')
      .filter((w) => w.assignedAt !== undefined && w.exercises.length > 0)
      .filter((w) => localDate(w.date, timeZone) === clock.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const next = today[0];
    if (next) {
      messages.push({
        uid,
        kind: 'reminder',
        group: 'reminders',
        title: `${next.name} today`,
        body: `${formatTime(next.date, timeZone)} with ${firstName(trainerName)}. ${plural(
          next.exercises.length,
          'exercise'
        )}, ${plural(totalSets(next), 'set')}.`,
        route: '/(client)',
        dedupeKey: `reminder:${clock.date}`,
      });
    }
  }

  if (
    prefs.motivation &&
    clock.weekday === SEND_AT.streak.weekday &&
    clock.hour === SEND_AT.streak.hour
  ) {
    const streak = weekStreakIn(history.map((w) => w.date), now, timeZone);
    if (streak.atRisk && streak.weeks >= 2) {
      messages.push({
        uid,
        kind: 'streak',
        group: 'motivation',
        title: `Your ${streak.weeks}-week streak ends tonight`,
        body: 'One session before midnight keeps it going.',
        route: '/(client)',
        dedupeKey: `streak:${clock.date}`,
        capKey: `cap:${clock.date}`,
      });
    }
  }

  if (prefs.recap && clock.weekday === SEND_AT.recap.weekday && clock.hour === SEND_AT.recap.hour) {
    const lastMonday = addDays(mondayOf(clock), -7);
    const week = inWeek(history, lastMonday, timeZone);
    if (week.length > 0) {
      const sets = week.reduce((total, w) => total + loggedSets(w), 0);
      const records = recordsIn(week, history);
      const streak = weekStreakIn(history.map((w) => w.date), now, timeZone);
      const streakLine = `your streak is ${plural(streak.weeks, 'week')}`;
      messages.push({
        uid,
        kind: 'recap',
        group: 'recap',
        title: `Your week: ${plural(week.length, 'session')}, ${plural(sets, 'set')}`,
        body:
          records > 0
            ? `${plural(records, 'new record')}, and ${streakLine}.`
            : `${streakLine.charAt(0).toUpperCase()}${streakLine.slice(1)}.`,
        route: '/(client)/history',
        dedupeKey: `recap:${lastMonday}`,
        capKey: `cap:${clock.date}`,
      });
    }
  }

  return messages;
}

function forTrainer(now: Date, trainer: TrainerContext): Message[] {
  const { timeZone, prefs, uid } = trainer.account;
  const clock = wallClock(now, timeZone);
  const messages: Message[] = [];

  if (prefs.reminders && clock.hour === SEND_AT.schedule.hour) {
    const today = trainer.clients
      .flatMap(({ client, workouts }) =>
        workouts
          // A coach sees what they have built for today whether or not they
          // have sent it (store.tsx's isTodaysSession), so no assignedAt here
          // — but an empty draft is not a session on either side, and counting
          // it named a client whose card the coach then could not find.
          .filter((w) => w.loggedBy === 'trainer' && w.status !== 'completed')
          .filter((w) => w.exercises.length > 0)
          .filter((w) => localDate(w.date, timeZone) === clock.date)
          .map((w) => ({ name: firstName(client.name), date: w.date }))
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    if (today.length > 0) {
      const shown = today.slice(0, 3).map((s) => `${s.name} ${formatTime(s.date, timeZone)}`);
      const rest = today.length - shown.length;
      messages.push({
        uid,
        kind: 'schedule',
        group: 'reminders',
        title: `${plural(today.length, 'session')} today`,
        body: `${shown.join(', ')}${rest > 0 ? `, and ${rest} more` : ''}.`,
        route: '/(trainer)/today',
        dedupeKey: `schedule:${clock.date}`,
      });
    }
  }

  if (prefs.motivation && clock.hour === SEND_AT.inactive.hour) {
    // Named on the day they reach a week without training, and every week
    // after — not every single morning, which would teach a coach to ignore it.
    const quiet = trainer.clients
      .filter((context) => context.account)
      .map(({ client, workouts }) => {
        const last = completed(workouts).sort((a, b) => b.date.localeCompare(a.date))[0];
        const lastDate = last ? localDate(last.date, timeZone) : null;
        return { client, last, gap: lastDate ? daysBetween(lastDate, clock.date) : null };
      })
      .filter((entry): entry is { client: Client; last: Workout; gap: number } =>
        entry.gap !== null && entry.gap >= 7 && entry.gap % 7 === 0
      )
      .sort((a, b) => b.gap - a.gap);

    if (quiet.length > 0) {
      const [first] = quiet;
      const names = quiet.map((entry) => firstName(entry.client.name));
      messages.push({
        uid,
        kind: 'inactive',
        group: 'motivation',
        title:
          quiet.length === 1
            ? `${names[0]} hasn't trained in ${first.gap} days`
            : `${listNames(names)} haven't trained in over a week`,
        body:
          quiet.length === 1
            ? `The last session was ${first.last.name} on ${formatDay(first.last.date, timeZone)}.`
            : 'A quick message might be all it takes.',
        route: quiet.length === 1 ? `/(trainer)/clients/${first.client.id}` : '/(trainer)/clients',
        dedupeKey: `inactive:${clock.date}`,
        capKey: `cap:${clock.date}`,
      });
    }
  }

  if (prefs.recap && clock.weekday === SEND_AT.recap.weekday && clock.hour === SEND_AT.recap.hour) {
    const lastMonday = addDays(mondayOf(clock), -7);
    const joined = trainer.clients.filter((context) => context.account);
    let sessions = 0;
    let records = 0;
    const idle: string[] = [];
    for (const { client, workouts } of trainer.clients) {
      const week = inWeek(workouts, lastMonday, timeZone);
      sessions += week.length;
      records += recordsIn(week, completed(workouts));
      if (week.length === 0 && joined.some((context) => context.client.id === client.id)) {
        idle.push(firstName(client.name));
      }
    }
    if (sessions > 0 || idle.length > 0) {
      const idleLine = idle.length > 0 ? ` ${listNames(idle)} didn't train.` : '';
      messages.push({
        uid,
        kind: 'recap',
        group: 'recap',
        title: `Last week: ${plural(sessions, 'session')} coached`,
        body: `${plural(records, 'new client record')}.${idleLine}`,
        route: '/(trainer)/clients',
        dedupeKey: `recap:${lastMonday}`,
        capKey: `cap:${clock.date}`,
      });
    }
  }

  return messages;
}

// MARK: - Instant alerts

/** The client's trainer sent them a session. */
export function assignedMessage(input: {
  recipient: Recipient;
  workout: Workout;
  trainerName: string;
  now: Date;
}): Message | null {
  const { recipient, workout, trainerName, now } = input;
  if (!recipient.prefs.activity || isQuiet(wallClock(now, recipient.timeZone).hour)) return null;
  const today = wallClock(now, recipient.timeZone).date;
  const day = localDate(workout.date, recipient.timeZone);
  const when =
    day === today ? 'today' : day === addDays(today, 1) ? 'tomorrow' : formatDay(workout.date, recipient.timeZone);
  return {
    uid: recipient.uid,
    kind: 'assigned',
    group: 'activity',
    title: `New workout from ${firstName(trainerName)}`,
    body: `${workout.name}, ${when}. Tap to see it.`,
    route: '/(client)',
    dedupeKey: `assigned:${workout.id}`,
  };
}

/** A client finished a session on their own. */
export function finishedMessage(input: {
  recipient: Recipient;
  clientName: string;
  workout: Workout;
  records: readonly { movementName: string; weight: number }[];
  unit: WeightUnit;
  now: Date;
}): Message | null {
  const { recipient, clientName, workout, records, unit, now } = input;
  if (!recipient.prefs.activity || isQuiet(wallClock(now, recipient.timeZone).hour)) return null;
  const minutes = workout.durationMinutes ? ` in ${plural(workout.durationMinutes, 'minute')}` : '';
  const [record] = records;
  const recordLine =
    records.length === 1 && record
      ? `, and a new ${record.movementName} record: ${formatIn(record.weight, unit)} ${unit}.`
      : records.length > 1
        ? `, and ${records.length} new records.`
        : '.';
  return {
    uid: recipient.uid,
    kind: 'finished',
    group: 'activity',
    title: `${firstName(clientName)} finished ${workout.name}`,
    body: `${plural(loggedSets(workout), 'set')}${minutes}${recordLine}`,
    route: `/(trainer)/clients/session/${workout.id}`,
    dedupeKey: `finished:${workout.id}`,
  };
}

/** A client redeemed their invite code. */
export function joinedMessage(input: { recipient: Recipient; client: Client; now: Date }): Message | null {
  const { recipient, client, now } = input;
  if (!recipient.prefs.activity || isQuiet(wallClock(now, recipient.timeZone).hour)) return null;
  return {
    uid: recipient.uid,
    kind: 'joined',
    group: 'activity',
    title: `${firstName(client.name)} joined`,
    body: 'They used their code and can see their program now.',
    route: `/(trainer)/clients/${client.id}`,
    dedupeKey: `joined:${client.id}`,
  };
}

/** A client deleted their account. Wording Ryan's, 2026-09-13. */
export function leftMessage(input: {
  recipient: Recipient;
  clientName: string;
  clientId: string;
  now: Date;
}): Message | null {
  const { recipient, clientName, clientId, now } = input;
  if (!recipient.prefs.activity || isQuiet(wallClock(now, recipient.timeZone).hour)) return null;
  return {
    uid: recipient.uid,
    kind: 'left',
    group: 'activity',
    title: `${firstName(clientName)} deleted their account`,
    body: 'Their programs and history have been removed.',
    // Their own page went with them.
    route: '/(trainer)/clients',
    dedupeKey: `left:${clientId}`,
  };
}
