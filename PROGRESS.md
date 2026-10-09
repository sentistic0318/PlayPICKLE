# PlayPICKLE implementation

Updated 2026-10-09.

- [x] Existing project/reference inspection; original design system, logo, player/owner/admin navigation.
- [x] Supabase schema, Auth client, recovery links, profiles, storage and checked permissions.
- [x] Clubs, courts, opening hours, closures, reservations, cancellation and availability signals.
- [x] Doubles registration/acceptance, deadlines/capacity, byes, scheduling and verified advancement.
- [x] Points ledger, corrections, disputes, administration, in-app notifications and push worker code.
- [x] Local validation: 24 regression checks, lint, Expo compatibility, all-platform bundles and four browser smoke tests.
- [x] Create live PlayPICKLE project in Sen_Org, Singapore, at quoted $0/month.
- [x] Apply all four migrations; match local files to hosted migration versions.
- [x] Save real public Supabase connection values in Git-ignored .env.
- [x] Verify hosted Auth health, RLS on 23 tables, 15 Realtime tables, image buckets, owner writes and denied administrator escalation. Temporary hosted fixtures rolled back.
- [x] Confirm scoring: game to 11, win by 2. App records completed game scores, not individual serving turns/rallies.
- [ ] Save hosted Auth Site URL/redirect allowlist in dashboard (exact values in README).
- [ ] Create and verify the user's account, then bootstrap the first administrator.
- [ ] Confirm placement points and dispute rules (100/60/30/10 per partner, 48-hour reports, admin resolution are still proposals).
- [ ] Complete connected signup/reset/Storage/Realtime/role flows and independent-connection races.
- [ ] Configure EAS/native identifiers, deploy/schedule push worker with server secret, and test real devices.
- [ ] Address/review dependency advisories and hosted advisor findings before production.

Local PGlite serializes commands; its overlap/capacity tests are not multi-connection load tests. Native bundle exports are not installed-device validation. npm audit last reported 29 advisories (19 high, 10 moderate) after compatible fixes on 2026-10-06. Supabase advisor findings and intentional privileged operations are documented in README.

## Review fixes (2026-10-09, local only)

- [x] Complete deterministic tournament pagination in player and management screens, including withdrawn history.
- [x] Participant schedule exclusion across tournaments/courts, with rescheduling and cancellation handling.
- [x] Pending invitations separated from confirmed membership, atomic acceptance/capacity/deadline checks, and legacy conversion.
- [x] Device-scoped logout cleanup, registration-bound push jobs, claim/pre-send checks and stale receipt protection.
- [x] 38 client/database checks, four native Postgres concurrency scenarios, seven browser checks, lint and all-platform Expo exports.
- [x] Linux/EAS lockfile dry run and worker syntax check.
- [ ] Apply the three new migrations and deploy the updated push worker later; no live database changes were made for this review.
- [ ] Test the updated client on physical Android/iOS devices and verify real Expo delivery/receipts.

The real concurrency scenarios use independent connections to disposable PostgreSQL 18.4, not PGlite. Expo compatibility still reports five existing SDK patch updates; see [the full verification and rollout notes](docs/REVIEW_FIXES.md).
