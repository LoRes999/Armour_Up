# App Review notes

Paste the block below into **App Store Connect → App Review Information →
Notes**, and the equivalent field in the Play Console. Without it the app is
very likely to be rejected as incomplete, because a reviewer cannot otherwise
reach the client half of it.

## Why this is needed

Strength Coach has two sides. A coach subscribes and builds programmes; their
clients join free with a six-character invite code the coach gives them.

Everything is stored on the device — there is no server and no account system.
So a reviewer has nobody to receive an invite code *from*. The app ships with a
sample roster for exactly this reason, and the notes have to tell the reviewer
it exists and where.

## The text to paste

> **No account or login is required.** This app has no server and no user
> accounts; all data is stored locally on the device.
>
> **Coach side.** Launch the app and tap "Subscribe with Apple" to start the
> subscription flow. Use the sandbox tester account below.
>
> **Client side.** Because there is no server, a client normally receives a
> six-character invite code directly from their coach. To see this half of the
> app:
>
> 1. Settings tab (bottom right) → scroll to SAMPLE DATA → **Load sample data**.
>    This populates a demo roster of six clients with training history.
> 2. Settings → ACCOUNT → **Sign out**.
> 3. On the paywall, tap **Enter your invite code**.
> 4. Enter the code **MW7K2Q** and tap **Accept invitation**.
>
> You are now signed in as the client Marcus Webb and can see the programme,
> logging, history calendar and progress charts from the client's side. Return
> to the coach side with Settings → Sign out → **Sign back in as coach**.
>
> **Deleting the account** is under Settings → ACCOUNT → Delete account, which
> removes all data from the device immediately.
>
> **Sample data** can be removed again from Settings → SAMPLE DATA → Remove
> sample data.

## Fill in before submitting

- [ ] A sandbox tester account for the subscription (App Store Connect → Users
      and Access → Sandbox Testers), added to the notes above.
- [ ] Confirm `MW7K2Q` is still the first sample client's invite code. It is
      hardcoded in `src/sampleData.ts`; if the seed changes, this changes.
- [ ] Privacy Policy URL in the listing (see `docs/privacy.md` and
      `src/legal.ts`).
- [ ] App Privacy questionnaire: **Data Not Collected** is accurate today — the
      app makes no network requests at all. Re-answer it honestly the moment a
      backend is added.
