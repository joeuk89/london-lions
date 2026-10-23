# Chrome for Android: one installed web app per origin

Resolves the research question in [issue #19](https://github.com/joeuk89/london-lions/issues/19). Researched on 2026-10-23 from Chromium source, Gerrit, the Chromium issue tracker and Chromium Dash.

## Summary

- **It is a known regression, already fixed.** Chromium bug [568841400](https://issues.chromium.org/issues/568841400), "\"This app is already installed\" shown when installing a second PWA on the same origin", describes exactly what we saw. A second report, [572287931](https://issues.chromium.org/issues/572287931), was closed as its duplicate.
- **The cause** is a Chrome 154 change that made the install sheet ask "is any WebAPK installed on this origin?" instead of "does an installed WebAPK's scope cover this URL?". Manifest `id` and `scope` play no part in that check.
- **The fix lands in Chrome 157** (first build 157.0.8103.13) and in 158 and later. It was not merged to 155 or 156.
- **No manifest setting avoids it** on 154 to 156. Two things should work: a separate origin per app (a custom domain per GitHub Pages repo), or an in-page install button driven by `beforeinstallprompt`, whose check is scope-aware. The second is inferred from source, not tested on a device.
- **No new bug report is needed.** If the problem persists on Chrome 157, comment on 568841400 instead.

## What the sources say

### The change that caused it (Chrome 154)

Commit [bee74a32d432](https://github.com/chromium/chromium/commit/bee74a32d43288cd6bbe53fb8295e84554e05e7c), "[WebApk/TWA] Streamline install behavior on Android with desktop" ([Gerrit 8257064](https://chromium-review.googlesource.com/c/chromium/src/+/8257064), first in 154.0.8017.0 per [Chromium Dash](https://chromiumdash.appspot.com/commit/bee74a32d43288cd6bbe53fb8295e84554e05e7c)). Its message says it uses "WebAppRegistry.getOriginsWithInstalledApp() as the source of truth for identifying if the url being visited belongs to an installed app". The goal was to match desktop: once a site is installed, the menu offers "Open <App>".

On the Chrome 155 branch (`refs/branch-heads/8059`), [`WebappRegistry.isAppInstalledForUrl`](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8059/chrome/android/java/src/org/chromium/chrome/browser/webapps/WebappRegistry.java) reduces the URL to its origin and returns true if any WebAPK's scope has that origin:

```java
Origin origin = Origin.create(url.getSpec());
...
if (hasAtLeastOneWebApkForOrigin(origin)) {
    return true;
}
```

[`AppInstallMenuHandler.doUniversalInstall`](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8059/chrome/android/java/src/org/chromium/chrome/browser/webapps/AppInstallMenuHandler.java) passes that result as `webAppInstalled` to the Universal Install bottom sheet, which then shows "This app is already installed".

### The bug and the fix

Commit [2e165cdb08d7](https://github.com/chromium/chromium/commit/2e165cdb08d714941e3573a18b719bfdad78ff66), "[WebApk] Make install detection scope-aware for same-origin PWAs" ([Gerrit 8556881](https://chromium-review.googlesource.com/c/chromium/src/+/8556881)), landed on main on 2026-10-13 with `Fixed: 568841400`. Its message describes our symptoms word for word:

> with PWA A (scope /apps/pwa-a/) installed, visiting PWA B (scope /apps/pwa-b/) on the same origin shows "This app is already installed" in the Universal Install sheet, and tapping Open fails with "Could not open app" because no WebAPK actually covers that URL.

It also says the launch side (`findWebApkWithManifestId`, `WebApkValidator.queryFirstWebApkPackage`) was scope-aware all along, and that before Chrome 154 install detection "used PackageManager URL resolution against the WebAPK intent filter (pathPrefix = scope path), which was scope-granular". So the origin-only match was not an intended product change. The fix makes `isAppInstalledForUrl` match only a WebAPK whose stored scope contains the URL (`hasInstalledWebApkForUrl`, using `UrlUtilities.isUrlWithinScope`).

Bug 568841400 is public, component `UI>Browser>WebAppInstalls`, filed 2026-10-02, and its tracker data shows it as fixed. Bug 572287931, "PWA / WebAPK installation fails for multiple apps on the same domain with different subpaths", is marked a duplicate of it.

### Which versions get the fix

- Main: first in 158.0.8105.0 ([Chromium Dash](https://chromiumdash.appspot.com/commit/2e165cdb08d714941e3573a18b719bfdad78ff66)). It missed the M157 branch point (main position 1717887 against 1717349).
- M157: merged to `refs/branch-heads/8103` on 2026-10-15 as [Gerrit 8583262](https://chromium-review.googlesource.com/c/chromium/src/+/8583262). First in 157.0.8103.13 ([Chromium Dash](https://chromiumdash.appspot.com/commit/c03f0d53c25479724f322283cdeadcbf47e5b3e3)).
- M155 (8059) and M156 (8078): the branch heads still use the origin-only check, and Gerrit shows no merge of the fix to either.
- Chromium Dash's [M157 schedule](https://chromiumdash.appspot.com/fetch_milestone_schedule?mstone=157) gives a stable date of 2026-11-03. Its Android Stable release feed already lists 157.0.8103.14 on 2026-10-22, probably the early-stable rollout to a small share of users.

### Manifest `id` does not help

Chrome's docs say the manifest `id` gives an app its identity ([developer.chrome.com](https://developer.chrome.com/blog/pwa-manifest-id)), and Chromium's [identifiers doc](https://chromium.googlesource.com/chromium/src/+/main/components/webapps/docs/identifiers.md) separates manifest id from origin. The 155 check above reads neither the `id` nor the path of the scope, so no manifest value changes its answer.

### Separate origins on GitHub Pages

GitHub's docs say a project site uses the account's custom domain by default, and "You can override the default custom domain by adding a custom domain to the individual repository" ([GitHub Docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)). A subdomain per repo (for example `lions.example.com`) is a separate origin, so the origin-only check cannot confuse it with another app.

## Inference (not confirmed by a source or a device test)

- **The page's own install prompt should still work on 155.** The banner pipeline asks [`WebappsClientAndroid::DoesNewWebAppConflictWithExistingInstallation`](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/8059/chrome/browser/webapps/webapps_client_android.cc), which calls `IsWebApkInstalled(start_url)`. That goes through PackageManager URL resolution, which the fix's commit message calls scope-granular. So on 155 and 156, an in-page "Install" button that calls the saved `beforeinstallprompt` event's `prompt()` should install the second app, while Chrome's own menu sheet refuses. A third-party project, [different-thinking/rolltop#144](https://github.com/different-thinking/rolltop/pull/144), reached the same conclusion from source and shipped that workaround, but also says it had not tested it on a device.
- **Why apps installed before the update kept working**: the bug is in the install-time check only. Existing WebAPKs launch through the scope-aware path, so they were never affected.
- **Why "Open" fails**: the sheet thinks an app covers the URL, but the launch code finds none whose scope contains it, so it reports that it cannot find the app.

## What to do

1. Wait for Chrome 157 (early stable now, full stable from about 2026-11-03), then retry installing Voice Coach and Plate Pool beside Lions.
2. Until then, either uninstall the other app first, or test an in-page install button using `beforeinstallprompt`.
3. If the move to separate origins is still wanted for other reasons, a custom subdomain per repo does it. This bug alone does not justify it once 157 ships.

## Bug report

None needed: the bug is filed, fixed and merged to 157. If it reproduces on 157.0.8103.13 or later, add a comment to [568841400](https://issues.chromium.org/issues/568841400) (a starred, fixed bug gets reopened faster than a new one gets triaged):

> Still reproduces on Chrome 157.0.8103.NN, Android 17, Pixel 10 Pro.
>
> 1. Install https://joeuk89.github.io/london-lions/ from the Chrome menu (manifest `id` and `scope` `/london-lions/`).
> 2. Open https://joeuk89.github.io/voice-coach/ (scope `/voice-coach/`, distinct `id`).
> 3. Chrome menu > Install app.
>
> Expected: the install sheet offers to install Voice Coach.
> Actual: "This app is already installed / Click to open the app instead"; Open shows "could not find app". `chrome://webapks` lists only the Lions WebAPK. `adb logcat | grep Finsky` shows no hand-off to Play. Uninstalling Lions lets Voice Coach install.
