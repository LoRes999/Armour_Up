const expoPreset = require('jest-expo/jest-preset');

/**
 * Unit tests only — the store, the models, and the persistence layer.
 *
 * There are deliberately no component or navigation tests. The screens are thin
 * and change often; the logic underneath them is what breaks silently, and it
 * is what a reader of a failing test can actually act on.
 *
 * The preset's own setupFiles are spread rather than replaced — dropping them
 * takes the React Native environment with it.
 */
module.exports = {
  ...expoPreset,
  setupFiles: [...(expoPreset.setupFiles ?? []), '<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: [...(expoPreset.setupFilesAfterEnv ?? []), '<rootDir>/jest.after-env.js'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  // functions/ has its own dependencies. Its pure modules (the notification
  // planner) are tested here; its node_modules and build output are not ours.
  modulePathIgnorePatterns: ['<rootDir>/functions/node_modules', '<rootDir>/functions/lib'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/sampleData.ts', '!src/movementLibrary.ts'],
};
