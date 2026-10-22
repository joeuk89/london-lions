# PWA offline reliability: iOS Safari and Android Chrome

Researched 2026-10-22 against WebKit, Apple, Chrome, web.dev, MDN and GitHub primary sources. Question: for a static GitHub Pages site installed to the home screen (manifest plus a service worker caching HTML and images with the Cache Storage API), how reliably are cached pages still there offline hours later and weeks later?

## Summary

- **Installed home-screen web apps on iOS are exempt from the 7-day storage wipe.** WebKit's tracking-prevention policy says the first-party domain of a home screen web app is skipped during the 7-day cleanup, and its data is isolated from Safari. The same site opened in a Safari tab is not exempt.
- **iOS quota is generous for an installed app:** up to 60% of disk per origin, same as in Safari. Eviction is least-recently-used and only under disk pressure or when overall WebKit usage passes 80% of disk. WebKit grants persistent storage by heuristic, and being a home screen web app is the example it gives.
- **Android Chrome grants persistent storage silently to installed PWAs.** Persisted origins are not evicted under storage pressure. Quota is up to 60% of disk per origin.
- **No platform gives a background refresh path you can rely on.** iOS has no Background Sync, no Periodic Background Sync, and no Background Fetch. Web Push on iOS runs the service worker but must show a visible notification every time or the subscription is revoked. Android Chrome's Periodic Background Sync runs on an engagement-based schedule the developer does not control. The dependable design is to cache on open and tell users to open the app once on the morning of the game.
- **UK users are unaffected by the EU episode.** Apple proposed removing home screen web apps in the EU in the iOS 17.4 beta and reversed it before release. It was never scoped to the UK.
- **GitHub Pages project sites work with service workers**, with two things to get right: put the service worker at the project root so its default scope is `/repo-name/`, and use relative or `/repo-name/`-prefixed paths in the manifest and cache list. GitHub Pages sends `cache-control: max-age=600` and offers no custom headers.

## 1. iOS Safari (iOS 17, 18, 26)

### 1.1 The 7-day script-writable-storage cap and home screen apps

WebKit's Intelligent Tracking Prevention deletes all script-writable storage for a site "after 7 days of no user interaction with the website". The storage types listed are cookies created in JavaScript, IndexedDB, LocalStorage, media keys, SessionStorage, and "Service Worker registrations and cache". User interaction means a click, tap or keyboard entry; scrolling does not count. The same page states that the first-party domain of a home screen web app is exempt from the 7-day cap, and that a home screen web app's website data is kept isolated from Safari, so Safari's ITP classification does not affect it. Source: WebKit, "Tracking Prevention in WebKit", <https://webkit.org/tracking-prevention/> (undated policy page, read 2026-10-22).

The original announcement said the cap counts "seven days of Safari use" (days Safari was actually used, not calendar days), that home screen web apps "have their own counter of days of use" which resets on actual use of the web app, and: "We do not expect the first-party in such a web application to have its website data deleted." Source: WebKit blog, "Full Third-Party Cookie Blocking and More", 2020-03-24, <https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/>.

web.dev's storage overview repeats the exemption: the seven-day cap on IndexedDB, service worker registration and Cache API "does not apply to installed PWAs". Source: web.dev, "Storage for the web", updated 2024-09-23, <https://web.dev/articles/storage-for-the-web>.

Practical consequence: a user who installs the app and then does not open it for three weeks keeps the cache. A user who only bookmarks or visits the site in a Safari tab and does not tap anything on it for seven days of Safari use loses the service worker and its cache.

### 1.2 Quota and eviction (Safari 17 onwards)

WebKit's storage policy from Safari 17 / iOS 17:

| Rule | Value |
| --- | --- |
| Per-origin quota in a browser app | up to 60% of total disk space |
| Per-origin quota in other apps' web views | up to 15% of total disk space |
| Overall WebKit quota in a browser app | up to 80% of total disk space |
| Home Screen web apps | same origin and overall quotas as a browser app |

Eviction happens when the overall quota is exceeded, when the system is under storage pressure, or when ITP decides the site has not been used for some time. Eviction is per origin in least-recently-used order, where "last use" is the last user interaction or last storage operation. Origins with an active page or in persistent mode may be excluded. Sites request persistent mode with `navigator.storage.persist()`; WebKit grants it "based on heuristics, such as whether the site is opened as a Home Screen Web App". Source: WebKit blog, "Updates to Storage Policy", 2023-08-10, <https://webkit.org/blog/14403/updates-to-storage-policy/>.

Safari 17.4 release notes list under Storage: "Fixed cases where website data is unexpectedly evicted." Source: Apple, Safari 17.4 Release Notes, released 2024-03-05, <https://developer.apple.com/documentation/safari-release-notes/safari-17_4-release-notes>. Treat this as the floor: iOS 17.4 or later is the version where WebKit considers the eviction behaviour correct.

A programme of HTML pages and images is megabytes, not gigabytes, so quota is not the risk. The risk is LRU eviction under disk pressure on a nearly full phone, which persistent mode mitigates. Call `navigator.storage.persist()` on first launch of the installed app.

### 1.3 Does the service worker survive 2 to 3 weeks unopened?

Nothing in the WebKit material gives a time-based expiry for an installed home screen app's service worker registration. The only time-based removal WebKit documents is the ITP 7-day cap, and installed home screen apps are exempt from it (section 1.1). The remaining eviction triggers are disk pressure and the 80% overall cap (section 1.2). So yes, with the caveat that there is no written guarantee, only an exemption from the one documented timer plus LRU eviction under pressure.

The service worker spec marks a registration "stale" when its last update check was more than 86400 seconds ago, which only means the browser will re-check the script on the next navigation. It does not remove the registration. Source: W3C Service Workers spec, <https://w3c.github.io/ServiceWorker/> (read 2026-10-22).

### 1.4 iOS 17.4 and the EU, and what it means for the UK

Apple's DMA support page, in the version live in early March 2024, said: "Previously, Apple announced plans to remove the Home Screen web apps capability in the EU as part of our efforts to comply with the DMA. ... We have received requests to continue to offer support for Home Screen web apps in iOS, therefore we will continue to offer the existing Home Screen web apps capability in the EU. ... Developers and users who may have been impacted by the removal of Home Screen web apps in the beta release of iOS in the EU can expect the return of the existing functionality for Home Screen web apps with the availability of iOS 17.4 in early March." Source: Apple Developer, "Update on apps distributed in the European Union", snapshot of 2024-03-05 via the Internet Archive, <https://web.archive.org/web/20240305id_/https://developer.apple.com/support/dma-and-apps-in-the-eu/>. The current version of that page no longer carries the section (read 2026-10-22, <https://developer.apple.com/support/dma-and-apps-in-the-eu/>).

The removal was only ever proposed for the EU and only existed in a beta. The UK is outside the DMA's scope, so UK devices were never in the affected set, and the feature shipped everywhere in iOS 17.4.

### 1.5 iOS 26

Safari 26 (released 2025-09-15, for iOS 26) added "support for any website to become a web app on iOS or iPadOS" and fixed "the 'Add to Home Screen' flow failing to load webpage data, preventing users from making new Home Screen web apps". Source: Apple, Safari 26.0 Release Notes, <https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes>. Apple's iPhone User Guide for the Add to Home Screen sheet now shows an "Open as Web App" choice "to use the website as if it's an app". Source: Apple Support, "Bookmark a website in Safari on iPhone", section "Add a website icon to your Home Screen", <https://support.apple.com/guide/iphone/bookmark-favorite-webpages-iph42ab2f3a7/ios> (read 2026-10-22, page covers iOS 26 and 27).

Keep `"display": "standalone"` in the manifest anyway: WebKit's rule since iOS 16.4 is that a manifest with display standalone or fullscreen makes the icon open as a home screen web app rather than a bookmark, "no matter which browser added the website to the Home Screen". Source: WebKit blog, "Web Push for Web Apps on iOS and iPadOS", 2023-02-16, <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>.

## 2. Android Chrome

### 2.1 Persistent storage is granted automatically to installed PWAs

Chrome decides `navigator.storage.persist()` without a prompt. "If a site is considered important, the persistent storage permission is automatically granted, otherwise it is silently denied." The heuristics are site engagement, whether the site has been installed or bookmarked, and whether it has notification permission. A denied request can be retried later. With persistence granted, Chrome will not evict Cache API, IndexedDB, service workers, cookies, Local Storage or File System data under pressure; only the user clearing site data removes it. Source: web.dev, "Persistent storage", updated 2020-05-12, <https://web.dev/articles/persistent-storage>.

So: call `navigator.storage.persist()` on first launch of the installed app. It is granted because the app is installed.

### 2.2 Quota and eviction

Chromium browsers may use up to 80% of total disk, and a single origin up to 60%. When the browser runs out of space it clears all site data from the least-recently-used origin, then the next, until under the limit. Default storage is best-effort and may be evicted; persistent storage "is not automatically cleared when storage is low". Source: web.dev, "Storage for the web", updated 2024-09-23, <https://web.dev/articles/storage-for-the-web>.

There is no Chrome equivalent of the Safari 7-day timer. Chrome does not expire service worker registrations on inactivity; the 86400-second "stale" rule in the spec only triggers an update check (section 1.3).

## 3. Install UX

### 3.1 iOS Safari

Apple's steps, from the iPhone User Guide (page covers iOS 26 and 27, read 2026-10-22):

1. Open Safari and go to the website.
2. Tap the page menu button, then tap Share. (With the Bottom or Top tabs layout, tap the Share button directly.)
3. Scroll down the list of options and tap Add to Home Screen. If it is missing, scroll to the bottom, tap Edit Actions and add it.
4. Optionally choose Open as Web App.
5. Tap Add. "The icon appears only on the device where you add it."

Source: <https://support.apple.com/guide/iphone/bookmark-favorite-webpages-iph42ab2f3a7/ios>.

Since iOS 16.4, third-party browsers with the web-browser entitlement can also offer Add to Home Screen from their Share menu, and a site with display standalone becomes a home screen web app whichever browser added it. Source: WebKit blog, 2023-02-16, <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>.

### 3.2 Android Chrome

Google's steps: open Chrome, go to the site, tap More (the three dots to the right of the address bar), tap "Install and create shortcut", tap Install, then follow the on-screen instructions. Source: Google Chrome Help, "Use web apps", Android tab, <https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en> (read 2026-10-22; menu wording changes between Chrome versions).

For Chrome to treat the site as installable and offer the prompt, the site must be served over HTTPS and the manifest must have `name` or `short_name`, `icons` including 192px and 512px, `start_url`, `display` of standalone, fullscreen, minimal-ui or window-controls-overlay, and `prefer_related_applications` absent or false. Chrome also waits until the user has tapped the page at least once and spent 30 seconds on it before firing `beforeinstallprompt`. The page does not list a service worker as a requirement. Source: web.dev, "What does it take to be installable?", updated 2024-09-19, <https://web.dev/articles/install-criteria>.

### 3.3 Links opened from Gmail on iOS

No Google help page describing Gmail's in-app browser or its link-opening setting was found (searched support.google.com on 2026-10-22). Google's current pages cover only making Chrome the default browser and Gmail the default mail app, which need iOS 14 and iOS 18 respectively. Source: <https://support.google.com/accounts/answer/16262222?hl=en>. From use rather than documentation: the Gmail iOS app opens links in its own in-app browser by default, with a setting under Gmail Settings for which app opens web links. Treat that as unverified.

What is documented is that an in-app browser cannot install. Apple's `SFSafariViewController` offers Reader, AutoFill, content blocking, an action button for sharing, and "a button to open the page directly in Safari"; it does not offer Add to Home Screen, and the host app cannot see website data. Source: Apple Developer Documentation, SFSafariViewController, <https://developer.apple.com/documentation/safariservices/sfsafariviewcontroller> (read 2026-10-22). In-app browsers built on plain `WKWebView` (which is what a mail app's own browser is) only get Add to Home Screen if the host app holds the web-browser entitlement, which Gmail does not. Source: WebKit blog, 2023-02-16, <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>.

Instruction to give users: when the page opens inside Gmail, tap the Safari (compass) or "Open in Safari" button, then follow the Safari steps. Or copy the link and paste it into Safari.

## 4. Background refresh

Requirement: a programme generated at 08:00 should be on the phone before the user reaches the arena, ideally without them opening the app on wifi first.

### 4.1 Browser support, from MDN browser-compat-data (read 2026-10-22)

| API | Chrome Android | Safari iOS | Notes |
| --- | --- | --- | --- |
| Background Sync (`SyncManager`) | Chrome 49 | not supported | one-shot retry when connectivity returns |
| Periodic Background Sync (`PeriodicSyncManager`) | Chrome 80 | not supported | installed PWA only |
| Background Fetch (`BackgroundFetchManager`) | Chrome 74 | not supported | large downloads |
| Web Push (`PushManager`) | Chrome 42 | iOS 16.4, home-screen web apps only | |

Sources: <https://github.com/mdn/browser-compat-data/blob/main/api/SyncManager.json>, <https://github.com/mdn/browser-compat-data/blob/main/api/PeriodicSyncManager.json>, <https://github.com/mdn/browser-compat-data/blob/main/api/BackgroundFetchManager.json>, <https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json>. Chrome Android entries mirror desktop Chrome in the data.

### 4.2 iOS

Web Push works only for web apps added to the Home Screen, permission must be requested from a user gesture such as a Subscribe button, and the service worker handles push events in the background. Source: WebKit blog, 2023-02-16, <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>. Subscriptions must set `userVisibleOnly: true`, which is a promise to show a notification for every push; "Violations of the userVisibleOnly promise will result in a push subscription being revoked." Source: WebKit blog, "Meet Web Push", 2022-06-07, <https://webkit.org/blog/12945/meet-web-push/>. Declarative Web Push (Safari 18.4, released 2025-03-31) lets the browser show the notification without running JavaScript; an installed service worker still receives the `PushEvent` and can replace the notification, and "a privacy breaking silent push remains impossible". Sources: Apple, Safari 18.4 Release Notes, <https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes>; WebKit blog, "Meet Declarative Web Push", 2025-03-27, <https://webkit.org/blog/16535/meet-declarative-web-push/>.

So on iOS the only background execution path is push, and every push must produce a visible notification. A "Programme for tonight is ready" notification at 08:05 whose push handler pre-caches the pages is viable in principle, but it needs: a push server with VAPID keys (GitHub Pages cannot send pushes; something like a GitHub Action calling a push service would), the user granting notifications, and acceptance that if the handler's fetches fail the notification still shows and the cache is stale. WebKit gives no written guarantee that the handler's fetches complete before the worker is suspended.

### 4.3 Android Chrome

Periodic Background Sync fires only for an installed, standalone-launched PWA; whether and how often it fires depends on the site engagement score, must be above zero, and "if the user stops interacting with the app, syncs stop". The developer passes a `minInterval` but does not control timing, and syncs run only on networks the device has connected to before. Source: Chrome for Developers, "Richer offline experiences with the Periodic Background Sync API", updated 2025-08-19, <https://developer.chrome.com/docs/capabilities/periodic-background-sync>.

For a fan who opens the app on match days only, the engagement score will be low and syncs may be rare or absent. Web Push on Chrome does not revoke on silent handling, so a push-triggered pre-cache is the more dependable Android path, with the same push-server requirement as iOS.

### 4.4 Conclusion for the requirement

No platform offers a background refresh the site can rely on without a push server. Design for "cache on open": the service worker caches the programme the moment the app is opened, and the email or message that announces the programme tells the user to open the app once before leaving. Push-triggered pre-caching is a possible later addition, not a baseline.

## 5. GitHub Pages project-site gotchas

Project sites are served at `https://<owner>.github.io/<repositoryname>/`. Source: GitHub Docs, "About GitHub Pages", <https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages> (read 2026-10-22).

- **Scope.** A service worker's default scope is the directory containing the script, and a registration with a scope broader than the script's path fails unless the server sends a `Service-Worker-Allowed` header. Source: MDN, "Using Service Workers", <https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers>, and `ServiceWorkerContainer.register()`, <https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register> (read 2026-10-22). Put `sw.js` at the repository root so its scope is `/repo-name/`, and register it with a relative path (`./sw.js`) so the same code works on a custom domain later.
- **No custom headers.** GitHub Pages documents size, bandwidth and build limits only; there is no mechanism for response headers. Source: GitHub Docs, "Usage limits for GitHub Pages", <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits> (read 2026-10-22). Observed on 2026-10-22, a GitHub Pages response sends `cache-control: max-age=600`. A changed `sw.js` is therefore picked up within ten minutes at most, and browsers fetch the main service worker script from the network on update checks by default (`updateViaCache: "imports"`), so the HTTP cache does not delay it further.
- **Absolute paths break.** Every `start_url`, `scope` and icon path in the manifest, and every URL in the precache list, must include the `/repo-name/` prefix or be relative. A leading-slash path points at the owner's root site, which is a different scope.
- **Cache versioning.** The site has no server to invalidate caches, so name caches by build (for example a hash in the cache name) and delete old ones in the service worker's `activate` handler.

## Bottom line

**Same day (cached at 08:00 on wifi, needed at the arena that evening).** Reliable on both platforms. Nothing documented evicts a cache within hours short of the phone running out of disk. Call `navigator.storage.persist()` on first launch so even that case is covered on Android, and probably on iOS.

**Three weeks later, app not opened in between.**

- **iOS, installed to the Home Screen:** yes, with good confidence. WebKit states the home screen web app's domain is exempt from the 7-day cap and its data is isolated from Safari. Remaining risk is LRU eviction on a full phone. Treat iOS 17.4 as the minimum, since that is where WebKit fixed unexpected eviction.
- **iOS, not installed (Safari tab or bookmark):** no. The service worker and cache are wiped after seven days of Safari use without a tap on the site.
- **Android Chrome, installed:** yes. Persistent storage is granted silently to installed PWAs and persisted data is not evicted under pressure.
- **Android Chrome, not installed:** probably, but it is best-effort and the first to go when the phone fills up.

**Getting the new programme onto the phone without opening the app:** not available on iOS without a push server and a visible notification every time, and not dependable on Android via Periodic Background Sync for a low-engagement app. Plan on the user opening the app once after the programme is published, and tell them so in the announcement.
