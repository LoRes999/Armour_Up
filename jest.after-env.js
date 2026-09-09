// The vendored mock is plain CommonJS (module.exports = asMock) with no
// __esModule marker, so it arrives here unwrapped even though app code imports
// it as a default. Take whichever shape turns up.
const mocked = require('@react-native-async-storage/async-storage');
const AsyncStorage = mocked.default ?? mocked;

/**
 * The mock keeps one module-level store for the whole file. Without this, a
 * test that saves a roster hydrates the *next* test's provider, and suites pass
 * or fail depending on the order they happen to run in.
 */
beforeEach(async () => {
  await AsyncStorage.clear();
});
