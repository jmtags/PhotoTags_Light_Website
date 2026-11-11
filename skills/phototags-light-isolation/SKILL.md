---
name: phototags-light-isolation
description: Implement PhotoTags Light booth licensing and website administration while preserving all Android APK licensing, payments, devices, and business functionality. Apply to Light changes in the booth and PhotoTags website.
---

# PhotoTags Light isolation

The user authorizes changes to the Light booth and website, but explicitly requires preserving the Android APK's current payment, licensing, and other functionality.

Treat the Android source at C:/codes/Android_PHOTOTAGS as read-only. In the website, do not change existing Android license/device/payment handlers, webhook behavior, database tables, RPCs, plans, trial rules, or defaults. Add Light-only tables/functions prefixed `light_`, a separate `/api/light` endpoint, Light-only payment fulfillment, and scoped frontend components. Deploy the Light API from `light-service/` as a separate Vercel project so the existing website's 12 root functions remain unchanged. Do not import APK payment/business/license helpers into the Light service. Existing Android records must not be migrated or relabeled for Light.

Minimal additive website entry points (imports, a new admin navigation section, a Light public route) are permitted. Preserve existing navigation, counters, handlers, and unrelated edits. Light records must never enter Android collections. A platform value or UI filter alone is insufficient isolation. Payment amount, currency, checkout identity, and product must be verified on the server; browser success redirects are not payment proof.

Use a persisted installation key, server-verified proof of possession, and signed time-limited offline permits. Describe these as installation licenses, not hardware/MAC licenses. Blocked or transferred installations must stop receiving permits; document that issued offline permits remain valid until expiry. Do not include registration keys or permits in photo-history exports.

Add a standalone Light migration and include its identical additive SQL in the website's one-time setup script. Validate migration transactions, activation limits, payment idempotency, signature/expiry validation, replay rejection, and isolation from APK records. Run the existing website regression suite and relevant booth checks before pushing. Never change Android code to make a Light test pass.

Preserve unrelated working-tree edits, using a worktree where useful. Follow the user's automatic-push preference for completed source changes. Code-change authorization does not authorize executing production migrations, creating live payment transactions, setting deployment secrets, or silently enabling paid enforcement on an existing deployment. Complete and validate reviewable source/configuration instructions first, then identify any remaining production setup explicitly.
