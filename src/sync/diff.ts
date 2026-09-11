import { isSample, restrictToScope } from './policy';
import {
  COLLECTIONS,
  type Fields,
  type OutboxEntry,
  REMOVE,
  type SyncScope,
  type SyncedData,
  listOf,
} from './types';

/**
 * Finds what changed by comparing the store before and after, rather than by
 * having each of the store's forty-odd mutations announce itself. A mutation
 * nobody remembered to wire up would otherwise edit the screen and never reach
 * the cloud — silently, and only for that one action.
 */

/** Structural equality for the plain JSON the models are made of. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, index) => sameValue(item, other[index]));
  }
  const left = a as Fields;
  const right = b as Fields;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameValue(left[key], right[key])) return false;
  }
  return true;
}

/**
 * The top-level fields of `next` that differ from `prev`. A field that is gone
 * (or now undefined) comes back as REMOVE, so the cloud copy loses it too —
 * clearing a workout's day type has to clear it everywhere.
 */
export function changedFields(prev: Fields | undefined, next: Fields): Fields {
  const changes: Fields = {};
  for (const [key, value] of Object.entries(next)) {
    if (key === 'id' || value === undefined) continue;
    if (!prev || !sameValue(prev[key], value)) changes[key] = value;
  }
  if (prev) {
    for (const [key, value] of Object.entries(prev)) {
      if (key === 'id' || value === undefined) continue;
      if (next[key] === undefined) changes[key] = REMOVE;
    }
  }
  return changes;
}

/** Every difference between two versions of the store, before any policy applies. */
export function diffData(
  prev: SyncedData,
  next: SyncedData
): { entry: OutboxEntry; entity: { id: string } }[] {
  const out: { entry: OutboxEntry; entity: { id: string } }[] = [];
  for (const collection of COLLECTIONS) {
    const before = listOf(prev, collection);
    const after = listOf(next, collection);
    // The store replaces only what a mutation touched, so an untouched entity
    // is the very same object and the comparison below can be skipped.
    if (before === after) continue;

    const previous = new Map(before.map((entity) => [entity.id, entity]));
    for (const entity of after) {
      const old = previous.get(entity.id);
      previous.delete(entity.id);
      if (old === entity) continue;
      const fields = changedFields(old as Fields | undefined, entity as unknown as Fields);
      if (Object.keys(fields).length === 0) continue;
      out.push({ entry: { collection, id: entity.id, op: 'upsert', fields, rev: 0 }, entity });
    }
    // Whatever is left was removed.
    for (const [id, entity] of previous) {
      out.push({ entry: { collection, id, op: 'delete', fields: {}, rev: 0 }, entity });
    }
  }
  return out;
}

/** What this account should upload for a change to the store. */
export function planUploads(scope: SyncScope, prev: SyncedData, next: SyncedData): OutboxEntry[] {
  const entries: OutboxEntry[] = [];
  for (const { entry, entity } of diffData(prev, next)) {
    if (isSample(entry.collection, entity)) continue;
    const allowed = restrictToScope(scope, entry, entity);
    if (allowed) entries.push(allowed);
  }
  return entries;
}
