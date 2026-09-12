import { build } from 'esbuild';

/**
 * Bundles the functions into one file. The app's pure modules (src/models.ts,
 * src/rewards.ts) are pulled in from the app itself, so the server counts
 * streaks and records with exactly the code the phone uses. Firebase's own
 * packages stay external and are installed by the deploy.
 */
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['firebase-admin', 'firebase-functions'],
  logLevel: 'info',
});
