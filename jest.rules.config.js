const fs = require('node:fs');
const path = require('node:path');

/**
 * Tests that need the Firebase emulators: the security rules, and the Cloud
 * Functions that write to Firestore and Auth (functions/src/**\/*.emulator.ts).
 * `npm run test:rules` starts the emulators and stops them around these, so
 * they are kept out of the everyday `npm test`: that one needs no Java and no
 * emulator.
 *
 * The files share one emulator, and the rules tests clear it before each case,
 * so the script runs them one file at a time (--runInBand).
 */

/**
 * Packages in functions/node_modules published only as ES modules. Jest loads
 * CommonJS, and firebase-admin's sign-in code pulls in some of these (jose,
 * first), so they are compiled like our own code. Read from disk rather than
 * listed by hand, so an upgrade that adds one does not break the run.
 */
function esModulePackages(root) {
  const names = [];
  if (!fs.existsSync(root)) return names;
  for (const entry of fs.readdirSync(root)) {
    const dirs = entry.startsWith('@')
      ? fs.readdirSync(path.join(root, entry)).map((name) => `${entry}/${name}`)
      : [entry];
    for (const name of dirs) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, name, 'package.json'), 'utf8'));
        if (pkg.type === 'module') names.push(name);
      } catch {
        // Not a package (e.g. .bin); nothing to compile.
      }
    }
  }
  return names;
}

const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compiled = esModulePackages(path.join(__dirname, 'functions', 'node_modules')).map(escape);

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/rules-tests/**/*.test.ts', '<rootDir>/functions/src/**/*.emulator.ts'],
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  transformIgnorePatterns: compiled.length
    ? [`[\\\\/]node_modules[\\\\/](?!(${compiled.join('|')})[\\\\/])`]
    : ['[\\\\/]node_modules[\\\\/]'],
  testTimeout: 20000,
};
