# PhotoTags website

For PhotoTags Light changes, apply [phototags-light-isolation](skills/phototags-light-isolation/SKILL.md). Keep existing APK licensing, payment, business and device behavior unchanged. New Light code belongs in separate Light files and database objects. Preserve unrelated local edits.

The Light website is maintained at `C:/codes/PhotoTags_Light_Website` and published to `https://github.com/jmtags/PhotoTags_Light_Website.git`, branch `main`. Verify the destination URL before pushing: this checkout may still share Git metadata with the Android website, so its remote named `origin` can point at the Android repository. Use the remote that matches the dedicated Light repository. QR payments belong inside this existing website's `light-service` directory and its existing Vercel deployment; do not create another project for QR support.
