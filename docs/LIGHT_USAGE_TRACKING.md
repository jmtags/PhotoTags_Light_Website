# PhotoTags LRB usage tracking

The website admin's **PhotoTags Light → Usage** tab shows app opens, unique installations, online installations, daily activity, operating systems, camera labels and printer queues/profiles. This is separate from all APK records and APIs.

## Production setup

1. Deploy the updated booth, existing Light service and website admin from their current repositories. No additional Vercel project or environment variable is needed.
2. In the existing Supabase project's SQL Editor, review and run `supabase/migrations/202611120004_light_usage_tracking.sql`. It requires the existing Light licensing and one-day trial migrations. The same SQL is included in `supabase/one_time_supabase_setup.sql` for a new database; do not rerun the full setup on production.
3. Open the updated booth online. Sign into the website admin, select **PhotoTags Light → Usage**, and refresh. Before the migration, this tab displays a setup message and licensing continues to work.

## Meaning of the counts

- **App opens:** one new document load, including a reload, deduplicated by a visit UUID. Heartbeats and retries do not add opens. This tracks the booth, not views of the marketing website.
- **Unique installations:** the booth's existing browser/app installation identities, not individual people or physical machines. Separate browsers or cleared app storage can create separate installations.
- **Online now:** a nonblocked installation whose visible app reported within five minutes. It sends a heartbeat approximately every minute while visible and online. Closing an app ages out of this count; offline use cannot be measured live.
- **Active today / last 30 days:** installations with at least one report in the period. Dates use Asia/Manila. Counts start when tracking is enabled; there is no historical backfill.
- **Equipment:** last reported browser camera label/resolution and chosen printer queue/output profile. Camera labels require the app's existing camera permission. Printer queues can be renamed and do not prove the physical printer model, connection health or successful output. Opening Settings alone does not ask for camera access.

## Isolation and data

Reports use the existing installation's signed proof with a separate `usage` action, rate limit and server-side allowlist. Admin reads require the existing admin password. Only service-role calls can access the three new RLS-protected `light_usage_*` tables and their functions. An unavailable tracker does not block the booth or modify license/payment state.

Stored fields are the installation ID, visit ID, timestamps, daily counts, OS, browser/version, desktop/tablet/mobile classification, installed-app state, kiosk/settings mode, last camera label/resolution/facing direction, and printer queue/profile. Reports contain no photos, PINs, raw camera device IDs, MAC addresses, receipt emails or persisted IP addresses. The booth's About section and activation terms disclose this reporting. Camera labels and printer queue names are supplied by the browser/local software and may themselves contain user-assigned names.

The admin refreshes every 30 seconds while visible and online, searches device details and paginates 50 installations at a time. Aggregates cover all usage records. Raw visit deduplication and daily data currently have no automatic retention deletion; choose a retention policy before adding a cleanup job, since deleting visit IDs during an open session can allow a retry to count again.

## Validation

`npm test` tests signed reports, deduplication, normalization, blocking, authorization, aggregates, search/pagination, RLS and migration idempotency in an isolated database. `node scripts/check-light-integration.cjs` exercises the real browser hook, fake camera/printer, SQL-backed API, admin table and accessibility alongside the existing licensing checks. No live payment or production SQL is needed for these checks.
