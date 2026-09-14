import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { Client, Workout } from '../../src/models';
import { db } from './admin';
import { wallClock } from './localTime';
import { type ClientContext, DEFAULT_PREFS, type Recipient, SEND_AT, type TrainerContext } from './planner';
import { timeZoneOr } from './admin';

/** Firestore documents as the app's models. */

const META = ['updatedAt', 'updatedBy', 'deleted', 'trainerId', 'uid'];

function toModel<T>(doc: QueryDocumentSnapshot<DocumentData>): T {
  const data: Record<string, unknown> = { id: doc.id };
  for (const [key, value] of Object.entries(doc.data())) if (!META.includes(key)) data[key] = value;
  return data as T;
}

export function recipientFrom(uid: string, data: DocumentData | undefined): Recipient | null {
  if (!data) return null;
  return {
    uid,
    timeZone: timeZoneOr(data.timezone),
    prefs: { ...DEFAULT_PREFS, ...(data.notificationPrefs ?? {}) },
  };
}

export async function recipient(uid: string): Promise<Recipient | null> {
  const snapshot = await db.doc(`users/${uid}`).get();
  return recipientFrom(uid, snapshot.data());
}

export async function clientWorkouts(trainerId: string, clientId: string): Promise<Workout[]> {
  const snapshot = await db.collection(`trainers/${trainerId}/workouts`).where('clientId', '==', clientId).get();
  return snapshot.docs.filter((doc) => doc.get('deleted') !== true).map((doc) => toModel<Workout>(doc));
}

/** The local hours at which any scheduled message can go out. */
const SEND_HOURS = new Set<number>(Object.values(SEND_AT).map((slot) => slot.hour));

/**
 * The coaches with somebody for whom it is a send hour right now, with their
 * rosters. Everyone else is skipped without reading their data, which keeps a
 * run every half hour cheap.
 */
export async function loadDueTrainers(now: Date): Promise<TrainerContext[]> {
  const users = await db.collection('users').get();
  const due = new Set<string>();
  const accounts = new Map<string, DocumentData>();
  for (const doc of users.docs) {
    const data = doc.data();
    accounts.set(doc.id, data);
    const hour = wallClock(now, timeZoneOr(data.timezone)).hour;
    if (!SEND_HOURS.has(hour)) continue;
    if (data.role === 'trainer') due.add(doc.id);
    if (data.role === 'client' && typeof data.trainerId === 'string') due.add(data.trainerId);
  }

  const contexts: TrainerContext[] = [];
  for (const trainerId of due) {
    const account = recipientFrom(trainerId, accounts.get(trainerId));
    if (!account) continue;
    const [coach, clients, workouts] = await Promise.all([
      db.doc(`trainers/${trainerId}`).get(),
      db.collection(`trainers/${trainerId}/clients`).get(),
      db.collection(`trainers/${trainerId}/workouts`).get(),
    ]);
    const live = workouts.docs.filter((doc) => doc.get('deleted') !== true).map((doc) => toModel<Workout>(doc));
    const roster: ClientContext[] = clients.docs
      .filter((doc) => doc.get('deleted') !== true)
      .map((doc) => {
        const uid = doc.get('uid');
        const linked = typeof uid === 'string' ? recipientFrom(uid, accounts.get(uid)) : null;
        const client = toModel<Client>(doc);
        return {
          client,
          account: linked ?? undefined,
          workouts: live.filter((w) => w.clientId === client.id),
        };
      });
    contexts.push({
      // The coach record's name, as the app and every instant message use; the
      // profile's own copy could disagree with it.
      name: String(coach.get('name') ?? accounts.get(trainerId)?.displayName ?? ''),
      account,
      clients: roster,
    });
  }
  return contexts;
}
