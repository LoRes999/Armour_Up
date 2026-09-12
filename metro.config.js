const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Expo's defaults, minus the parts of this repository that are not the app.
 *
 * functions/ is the Cloud Functions package: its own node_modules, and a build
 * that rewrites lib/ and functions.yaml. Metro watches the whole project, so
 * every functions build pushed a live refresh to connected phones — one left
 * Expo Go stuck on "Refreshing…" mid-test. rules-tests/ runs in Node against
 * the Firestore emulator and is never part of the app.
 *
 * The patterns are anchored to this project's own folders. A bare "functions"
 * pattern would also block node_modules/firebase/functions, which the app uses.
 */

const config = getDefaultConfig(__dirname);

const escape = (text) => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
const projectFolder = (name) =>
  new RegExp(`^${escape(path.join(__dirname, name))}[\\\\/].*`);

const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  projectFolder('functions'),
  projectFolder('rules-tests'),
];

module.exports = config;
