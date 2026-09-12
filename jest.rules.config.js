/**
 * Security-rules tests. They run against the Firestore emulator, which
 * `npm run test:rules` starts and stops around them, so they are kept out of
 * the everyday `npm test`: that one needs no Java and no emulator.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/rules-tests/**/*.test.ts'],
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  testTimeout: 20000,
};
