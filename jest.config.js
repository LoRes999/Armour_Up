/**
 * Unit tests only — the store, the models, and the persistence layer.
 *
 * There are deliberately no component or navigation tests. The screens are
 * thin and change often; the logic underneath them is what breaks silently,
 * and it is what a reader of a failing test can actually act on.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/sampleData.ts', '!src/movementLibrary.ts'],
};
