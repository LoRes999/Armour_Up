/**
 * AsyncStorage is a native module, so it has to be mocked before anything
 * imports the store. The package vendors an in-memory implementation but does
 * not register it; that is this file's whole job.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
