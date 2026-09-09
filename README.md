# Strength Coach — Expo / React Native

The personal-training app in the "Warm Nocturne" direction, converted from the
SwiftUI version. Both sides are here: the trainer programmes and logs, the client
reads.

**This runs on your iPhone from Windows.** No Mac, no Xcode.

## Run it

```bash
npm install
```

```bash
npx expo install --fix
```

```bash
npx expo start
```

Install **Expo Go** from the App Store, then scan the QR code in the terminal
with your iPhone camera. Phone and PC must be on the same Wi-Fi — if the office
network blocks it, run `npx expo start --tunnel` instead.

`expo install --fix` is worth running once: it reconciles the native package
versions in `package.json` with whatever Expo SDK actually installs, which is the
usual cause of a red screen on first launch.

## Walk through it

The app opens on the **paywall**. Trainers pay; clients are free and get in with
a code their trainer sends them.

**As a coach:** pick a plan and tap *Subscribe with Apple* or *Continue with
email* — both complete the (mocked) purchase and drop you on the roster.

- *Clients* — filter Today / All / Flagged, search, tap **Marcus Webb**
- Client detail: their invite code, three stats, and Program / History / PRs
- History rows open the full session; solo sessions are badged **SOLO**
- **New workout** opens the builder — rename it, adjust weights with ± or by
  tapping the number to type, add sets, long-press a set to delete it, add
  exercises from the movement picker
- *Today* — tap the live session, then **Log set** repeatedly
- **+** on the roster invites someone and hands you their code
- *Settings* — subscription, day types, and **End subscription (demo)** to see
  the lapsed wall

**As a client:** *Enter your invite code* on the paywall. Seeded codes:

| Client | Code |
|---|---|
| Marcus Webb | `MW7K2Q` |
| Priya Nair | `PN4XB9` |
| Dara Okonkwo | `DK3TJ7` |
| Sofia Lindqvist | `SL8FR2` |
| Tom Brennan | `TB5NC4` |
| Amara Kone | `AK9HD6` |

- *Today* — read-only during a coached session. Tap an exercise to see its sets;
  the trainer logs them and this updates live
- *Progress* — movement chips switch the series; tap the chart to inspect a session
- *History* — a month calendar of completed sessions. Tap any trained day for the
  full record
- *Profile* — units, appearance, and the account-deletion flow

**The core loop:** log sets as the coach, sign out, sign back in with that
client's code, and Today reflects what you logged. Same objects, one store.

**Training solo:** from any completed session, **Repeat this session** starts a
copy the client owns and logs themselves — weights and reps adjustable, starting
from what they actually lifted. Finishing puts it on their calendar with a hollow
bar and in the trainer's history badged SOLO.

## Structure

Expo Router, file-based.

| Path | What it is |
|---|---|
| `app/_layout.tsx` | Root stack, providers, modal declarations |
| `app/index.tsx` | The gate: paywall, or a redirect into the right half |
| `app/(trainer)/` | Tabs: clients, today, library, settings |
| `app/(trainer)/clients/` | Nested stack so client detail keeps the tab bar |
| `app/(client)/` | Tabs: today, progress, history, profile |
| `app/(client)/history/` | Nested stack so a past session keeps the tab bar |
| `app/builder/[id].tsx` | Workout builder (modal) |
| `app/session/[id].tsx` | Live session (full-screen modal) |
| `app/solo/[id].tsx` | The client's own logging screen (full-screen modal) |
| `app/invite.tsx`, `join.tsx`, `delete-account.tsx` | Invite codes and compliance flows |
| `src/purchases.ts` | Purchase service interface + the mock behind it |
| `src/models.ts` | Types and derived helpers |
| `src/store.tsx` | The shared store, mutations, analytics |
| `src/sampleData.ts` | Seed data — delete when a backend arrives |
| `src/theme.ts` | Palette (both schemes), metrics |
| `src/components/Paywall.tsx` | The paywall, first-run and lapsed |
| `src/components/SessionDetail.tsx` | One session, shared by both sides |
| `src/confirm.ts` | Yes/no dialogs that also work on web |
| `src/components/` | UI kit, charts, calendar, shared settings screen |

## What changed from the SwiftUI version

Same architecture, different primitives:

| SwiftUI | Here |
|---|---|
| `@Observable AppStore` | React context + `useState` (`src/store.tsx`) |
| `NavigationStack` / `TabView` | Expo Router `Stack` / `Tabs` |
| `Color.adaptive(light:dark:)` | `usePalette()` resolving `useColorScheme` |
| Swift Charts | `react-native-svg`, hand-drawn (`src/components/charts.tsx`) |
| SF Symbols | Ionicons via `@expo/vector-icons` |
| `.sheet` / `.fullScreenCover` | Router `presentation: 'modal'` / `'fullScreenModal'` |
| Safe-area spacers | `SafeAreaView` + the tab bar's own insets |

Behaviour that carried over unchanged:

- **The trainer logs; the client reads.** Client screens have no write path into
  the store — expanding an exercise is their only interaction.
- **The live-session cursor is derived, not stored.** It recomputes the first
  unlogged set on every render, so logging advances the screen on its own and
  there is no second copy of "where we are" to drift.
- **Units are per client.** `client.unit` drives formatting and the stepper
  increment (2.5 kg / 5 lb) everywhere.
- **Account deletion is real** (guideline 5.1.1v): typed confirmation, then it
  actually clears the client and their workouts.

## Before this could ship

- **Purchases are mocked.** `src/purchases.ts` implements the same shape
  RevenueCat exposes (`getOfferings` / `purchase` / `restore` / `cached`), so
  swapping in `react-native-purchases` is that one file and no screen changes.
  **Its `restore()` succeeds unconditionally** — deliberate, because nothing is
  persisted and there would otherwise be no way back into the trainer app after a
  reload. Shipping that would give the app away for free. App Store guideline
  3.1.1 also requires real IAP for a digital subscription.
- **No backend.** Everything is in memory and resets when you reload the bundle.
  Trainer and client only sync because they are the same app instance. After a
  reload, *Restore purchases* is the way back in.
- **Invite codes are not single-use.** With no device or account identity,
  "consumed" would just lock a client out of their own second phone. The trainer
  gets control through *Issue a new code* instead.
- **Sign in with Apple is a stand-in.** The real
  `expo-apple-authentication` button needs a development build — it does not work
  in Expo Go. The button here follows the same visual contract.
- **The font is not bundled.** The design uses Bricolage Grotesque; this falls
  back to the system face. Add it with `expo-font` and set `type.family` in
  `src/theme.ts`.
- **Sample data is invented.** Names, weights and dates are all made up, and
  there is one trainer — `TRAINER_NAME` in `src/sampleData.ts`.
- **The calendar shows one session per day.** A solo and a coached session on the
  same date means only the newer appears in the month grid.
- Rest is hard-coded to 90s.
## Honest caveat

Written on Windows with no simulator, so it has been verified in a browser
against the Metro web target rather than on a device. `npx tsc --noEmit` passes
and both the iOS and web bundles build; expect to fix a small thing or two the
first time it runs on real hardware.
