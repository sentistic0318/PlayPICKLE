# Review fixes for commit 174fcf3

These changes are local. No hosted Supabase schema, data, accounts, functions, or configuration were changed during this work. Existing applied migrations are unchanged.

## Changes and affected files

- **Complete tournament data:** src/lib/api.js adds UUID keyset pagination, requesting pages until an empty page. src/lib/tournamentData.js loads all teams (including withdrawn/pending history) and matches, then sorts teams by creation time/ID and matches by round/position/ID. Both src/screens/Tournament.jsx and src/screens/management/TournamentPanel.jsx use that loader. No accepted-team limit is used to truncate history. A failed page produces an error rather than a partial bracket. Realtime/pull-to-refresh still refreshes the dataset; pagination is not a single transaction snapshot of concurrent registrations.
- **Participant scheduling:** 20261009142753_participant_schedule_conflicts.sql creates an internal RLS-protected participant reservation table with a GiST exclusion constraint over player and half-open time range. A match trigger maintains reservations on scheduling, rescheduling, status/participant changes and result correction. Tournament cancellation releases them. The unchanged schedule_match RPC retains permissions, court exclusion, opening hours and previous-round validation; the new trigger aborts the whole transaction with a clear player-unavailable error. The constraint checks concurrent transactions independently of application reads. Adjacent ranges are valid.
- **Invitations:** 20261009142757_confirmed_team_memberships.sql removes legacy unaccepted membership rows and makes team_members confirmed-only. A pending team's captain has explicitly chosen that team; partner_id records the outstanding invitation without reserving that partner. Only accepted teams consume capacity. Registration, acceptance, withdrawal and bracket generation retain a common tournament row lock. Acceptance rechecks both profiles/category, membership, capacity and the actual wall-clock deadline after acquiring that lock. The existing unique tournament/player constraint is retained. Bracket generation requires exactly two confirmed members and expires pending teams. The player screen lists all pending invitations separately so they never hide registration or the actual team.
- **Push ownership:** 20261009142802_push_device_ownership.sql adds token registration generations and snapshots them onto jobs. Registering, reassigning or deactivating a token invalidates pending, leased and receipt jobs from its previous registration. Claim and service-only pre-send validation require an active token, matching recipient/generation, and a current lease. Late stale enqueues are retired at claim time. Settlement checks the same ownership and uses consistent token-then-job lock order. Old receipts cannot disable another user's token. Existing retry/backoff and receipt processing remain.
- **Device logout:** src/lib/notifications.js caches only this device's Expo token, retrieves it without prompting as an upgrade fallback, and calls authenticated unregister_push_token. Profile.jsx calls signOutDevice. src/lib/signOut.js limits cleanup to eight seconds and still signs out locally when cleanup fails. The installed Supabase SDK's local-session clearing on server revocation failure is covered by regression tests. If an expired session cannot refresh, src/lib/supabase.js explicitly clears this project's auth keys and signOut.js runs SDK local cleanup again to emit SIGNED_OUT. Local scope leaves other devices signed in and their push registrations active.
- **Worker:** supabase/functions/push-dispatch/index.ts retains bearer-secret authorization and the service client; dispatch.js performs the final validation immediately before each Expo request. No worker operation was exposed to app/anonymous roles.

## Local verification commands

- npm test: original tests plus client, SQL, migration-upgrade, 128-team, invitation, scheduling and push regressions in disposable PGlite databases. These are sequential tests, not concurrency evidence.
- npm run test:postgres: starts a new native Postgres cluster bound to 127.0.0.1 with random credentials/port. It accepts no external database URL. Tests use independent connections and observe lock waits before releasing the first transaction, covering overlapping schedules, competing invitation acceptances, final capacity and enqueue/reassignment races. The server stops after testing; ignored fixture data is kept under test-results/postgres-review-* for inspection. This is targeted concurrency verification, not production load testing.
- npm run test:ui:review: exports a separate web fixture and intercepts its fake Supabase URL in Playwright. Checks both real screens with 128 accepted teams plus 110 withdrawn entries, all 127 matches, the final, the current player's last-page team, and registration alongside a pending invitation. It does not contact hosted Auth/Data API or provide production sample data.
- npm run lint; npm run check:expo; npm run export.
- npm run test:ui: existing smoke tests require a web export with Supabase variables unset.

The native Postgres runner uses pinned development-only embedded-postgres and pg dependencies. Test auth/storage schemas simulate Supabase-owned schemas; they do not test the real Auth, Storage or Realtime services. Build/export checks do not replace installed Android/iOS testing.

## Applying later (not performed)

1. Review and back up the target environment using your normal migration procedure. Apply the three new migrations in filename order to staging first.
2. The participant migration backfills existing noncancelled scheduled/played matches and deliberately fails on existing overlapping participant schedules. Resolve those schedules explicitly before retrying; the migration does not silently move or cancel matches. Pending invitations remain visible and can be accepted after conversion.
3. Pause any old push worker while applying the ownership migration and deploying the updated push-dispatch function. Resume only with the new per-send validation. Older workers lack that last ownership check even if the database migration is present.
4. Release an updated client build to get full brackets, separate invitations and per-device logout. Existing APKs do not gain these client changes automatically.
5. Test on two physical devices: enable the same account on both; sign out of one and confirm only that token is inactive; switch the first device to another account and enable notifications; queue jobs before/after reassignment; verify inbox links and Expo receipt handling. Also test denied permissions, offline logout and recovery after reconnecting.

## Push limitations

A successful unregister prevents future claims/sends by the updated worker. Offline logout cannot guarantee server-side deactivation or session revocation: local sign-out still completes, but the server may retain the previous registration until a successful unregister or registration on that device. Enabling push after signing in establishes a new generation and discards stale jobs.

Database ownership validation and the external Expo HTTP request cannot be one atomic transaction. A very small race remains if logout/reassignment happens after the final check but while the request is in flight. Notifications already accepted by Expo/APNs/FCM or displayed by the OS cannot be recalled by unregistering. Lock-screen text remains generic; inbox access stays authenticated. No real Expo delivery or device receipt was verified by these local tests.

## Verified locally on 2026-10-09

- npm test: **38 passed**, including the original suite and expired-session/offline logout. Expected HTTP 503 messages in the latter test come from a stub transport, not the hosted service.
- npm run test:postgres: **4 multi-connection scenarios passed** (5 checks including the parent test) on disposable native **PostgreSQL 18.4, Windows x64**. Observed real lock waits for overlapping matches, competing acceptances and final-capacity acceptance. Also verified a late enqueue committed after token reassignment is rejected by claim and retired.
- npm run test:ui:review: **3 passed**, using only an intercepted fixture backend.
- npm run test:ui: **4 passed**, using an unconfigured export at 320, 390 and 768px plus the recovery-link case.
- npm run lint: **passed**.
- Expo SDK 57 Android, iOS and web exports: **passed** on the final code. This did not produce/install a signed APK or IPA.
- Linux x64 npm 10.9.8 ci dry run with dev dependencies and scripts disabled: **passed**. This verifies lockfile consistency, not a completed EAS build.
- Push worker TypeScript syntax parsing and shared dispatcher transport regressions: **passed**. Deno deployment/type checking and Expo receipt delivery were not performed.
- git diff --check: **passed**. The four previously applied migrations are unchanged.
- npm run check:expo: **reports existing patch mismatches**: expo 57.0.26 -> ~57.0.27, expo-constants 57.0.20 -> ~57.0.21, expo-linking 57.0.11 -> ~57.0.12, expo-notifications 57.0.21 -> ~57.0.22, expo-router 57.0.24 -> ~57.0.25. These unrelated versions were not upgraded.

No hosted service or physical-device results are claimed. The three new migrations, worker deployment and client release remain pending.
