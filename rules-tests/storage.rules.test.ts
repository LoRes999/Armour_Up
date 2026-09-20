import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { type FirebaseStorage, deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

/**
 * storage.rules, against the real rules engine in the emulator.
 *
 * Movement photos are the only thing in Storage. They follow the same rule
 * their Firestore document does (firestore.rules, movements): the coach who
 * owns them writes, their clients read, nobody else sees them at all.
 */

let env: RulesTestEnvironment;

const COACH = 'u-coach';
const OTHER_COACH = 'u-other-coach';
const MARCUS = 'u-marcus';
const OTHER_CLIENT = 'u-other-client';

const storageOf = (context: { storage(): unknown }) => context.storage() as unknown as FirebaseStorage;
const coach = () => storageOf(env.authenticatedContext(COACH, { role: 'trainer' }));
const otherCoach = () => storageOf(env.authenticatedContext(OTHER_COACH, { role: 'trainer' }));
const marcus = () =>
  storageOf(env.authenticatedContext(MARCUS, { role: 'client', trainerId: COACH, clientId: 'c-marcus' }));
const otherClient = () =>
  storageOf(
    env.authenticatedContext(OTHER_CLIENT, { role: 'client', trainerId: OTHER_COACH, clientId: 'c-other' })
  );
const nobody = () => storageOf(env.unauthenticatedContext());

const PHOTO = `trainers/${COACH}/movements/m-1/front.jpg`;
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
const asJpeg = { contentType: 'image/jpeg' };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-strength-coach',
    storage: {
      rules: readFileSync(resolve(__dirname, '../storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(storageOf(context), PHOTO), jpeg(), asJpeg);
  });
});

describe('a movement photo', () => {
  it('is uploaded and removed by the coach it belongs to', async () => {
    await assertSucceeds(uploadBytes(ref(coach(), PHOTO), jpeg(), asJpeg));
    await assertSucceeds(deleteObject(ref(coach(), PHOTO)));
  });

  it('is readable by that coach and by their clients', async () => {
    await assertSucceeds(getBytes(ref(coach(), PHOTO)));
    await assertSucceeds(getBytes(ref(marcus(), PHOTO)));
  });

  it('is not writable by a client', async () => {
    await assertFails(uploadBytes(ref(marcus(), PHOTO), jpeg(), asJpeg));
    await assertFails(deleteObject(ref(marcus(), PHOTO)));
  });

  it('is invisible to another coach and to their clients', async () => {
    await assertFails(getBytes(ref(otherCoach(), PHOTO)));
    await assertFails(getBytes(ref(otherClient(), PHOTO)));
    await assertFails(uploadBytes(ref(otherCoach(), PHOTO), jpeg(), asJpeg));
  });

  it('is invisible to somebody who is not signed in', async () => {
    await assertFails(getBytes(ref(nobody(), PHOTO)));
    await assertFails(uploadBytes(ref(nobody(), PHOTO), jpeg(), asJpeg));
  });

  /**
   * A photo is resized to about 200 KB before it goes up. The cap is well
   * clear of that and is here so a bug, or somebody with the coach's token,
   * cannot fill the bucket — and so nothing but an image can be stored.
   */
  it('has to be an image, and a reasonably sized one', async () => {
    await assertFails(
      uploadBytes(ref(coach(), PHOTO), jpeg(), { contentType: 'application/pdf' })
    );
    await assertFails(
      uploadBytes(ref(coach(), PHOTO), new Uint8Array(3 * 1024 * 1024), asJpeg)
    );
  });

  it('keeps everything outside the movements folder out', async () => {
    await assertFails(uploadBytes(ref(coach(), `trainers/${COACH}/anything.jpg`), jpeg(), asJpeg));
  });
});
