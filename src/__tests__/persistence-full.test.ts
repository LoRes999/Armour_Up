import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Snapshot, flushSnapshot, saveSnapshot } from '../persistence';

/**
 * A save that failed (storage full: in a browser, after a few photos) was
 * dropped without a word, and so was every save after it (D4). It says so now,
 * once a session rather than on every change.
 */
describe('a save that fails', () => {
  it('tells the person, once', async () => {
    const storage = AsyncStorage as unknown as Record<string, unknown>;
    const originalSet = storage.setItem;
    storage.setItem = async () => {
      throw new Error('QuotaExceededError');
    };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const snapshot = { version: 1 } as unknown as Snapshot;
    try {
      saveSnapshot(snapshot);
      await flushSnapshot();
      saveSnapshot(snapshot);
      await flushSnapshot();

      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert.mock.calls[0][0]).toBe("Your changes aren't being saved");
    } finally {
      storage.setItem = originalSet;
      alert.mockRestore();
    }
  });
});
