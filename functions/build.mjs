import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
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

/**
 * Writes functions.yaml, the list of functions and their triggers.
 *
 * The Firebase CLI normally starts the code and fetches this list over HTTP.
 * On this Windows setup that fetch never completes — the list is served in
 * about a second, but the CLI times out waiting for it — which stops both the
 * emulator and `firebase deploy`. The CLI reads a saved functions.yaml first
 * when there is one, so the build asks for the list itself, the same way, and
 * saves it.
 */
async function writeManifest() {
  const port = 8100 + Math.floor(Math.random() * 800);
  const child = spawn(
    process.execPath,
    ['node_modules/firebase-functions/lib/bin/firebase-functions.js', '.'],
    {
      env: {
        ...process.env,
        PORT: String(port),
        FUNCTIONS_CONTROL_API: 'true',
        GCLOUD_PROJECT: process.env.GCLOUD_PROJECT ?? 'demo-strength-coach',
      },
      stdio: 'ignore',
    }
  );
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const response = await fetch(`http://127.0.0.1:${port}/__/functions.yaml`);
        if (response.ok) {
          await writeFile('functions.yaml', await response.text());
          console.log('  functions.yaml written');
          return;
        }
      } catch {
        // Not listening yet.
      }
    }
    throw new Error('Could not read the list of functions from the bundle.');
  } finally {
    child.kill();
  }
}

await writeManifest();
