# App Review notes

Paste the block below into **App Store Connect → App Review Information → Notes**, once the
bracketed parts are filled in. Type the demo logins into the **Sign-in required** fields next to
it. Without working demo accounts the app is very likely to be rejected, because a reviewer
cannot otherwise reach either side of it.

## Why this is needed

ArmourUp Fitness has two sides. A coach subscribes and builds programs; their clients join free
with a six-character invite code the coach gives them. Both sides need an account, so a reviewer
needs a ready-made coach and client.

## The text to paste

> **Sign-in is required.** Two demo accounts are provided. To try creating or deleting an account,
> please make a new one rather than using these, so they keep working for later reviews.
>
> **Coach:** [coach demo email] / [password]. This account has complimentary coaching access, so
> no purchase is needed, and a roster of demo clients with training history.
>
> **Client:** [client demo email] / [password]. This is one of the coach's clients,
> [client name].
>
> **Coach side.** Sign in as the coach. Clients → tap a client to see their Program, History and
> PRs. Tap a workout to edit it in the builder, or tap "New workout" to build one. Today → tap a
> session to log it set by set.
>
> **Client side.** Sign out (Settings → Sign out), then sign in as the client. Today shows what
> their coach has sent; Progress charts each lift; History shows every finished session, and
> "Repeat this session" logs one on their own.
>
> **Subscribing.** Create a new coach account from the welcome screen; the paywall appears with
> monthly and yearly plans. Purchases use the sandbox. "Restore purchases" and "Redeem a code" are
> under Subscribe, and Settings → Manage subscription opens Apple's subscription settings.
>
> **Invite codes.** Signed in as the coach, Clients → + creates an invitation with a six-character
> code. A client enters it from the welcome screen's invite-code button, then creates their
> account.
>
> **Deleting an account.** Settings (coach) or Profile (client) → Delete account. It deletes the
> account and its data from our servers immediately. It is also offered on the paywall and on the
> setup screens, for accounts that have not subscribed or finished setting up.

## Fill in before submitting

- [ ] Create the demo coach and client accounts in the TestFlight build, and give the roster
      some training history.
- [ ] In RevenueCat → Customers, find the demo coach → **Grant promotional entitlement** →
      `coach`, lifetime.
- [ ] A sandbox tester (App Store Connect → Users and Access → Sandbox → Test Accounts).
- [ ] Privacy Policy and Support URLs in the listing (see `docs/app-store-listing.md`).
- [ ] App Privacy, answered for the cloud version: **data is collected** and linked to the person,
      used only for app functionality, and never for tracking or advertising.
      - Contact info: name and email address.
      - User content: training data (workouts, sets, notes, custom movements).
      - Identifiers: the account's user ID.
      - Purchases: subscription status (through RevenueCat and Apple).
      - Push tokens are used only to deliver notifications.
      Check each answer against `docs/privacy.md` before submitting.
