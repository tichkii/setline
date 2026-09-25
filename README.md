# Setline

A phone-first, offline-capable workout tracker. No account, subscriptions, or hosted workout database. Each device has its own data.

## Features

- Exercises, reps, weights, warmups, drop sets, and linked supersets.
- First-run setup for kg/lb, rest time, training days, and appearance; existing users retain their data and settings.
- Light/dark appearance, four accent colors, and bundled Space Grotesk/Manrope fonts that work offline.
- A dedicated routine editor: create, rename, reorder, set targets, and link supersets without starting a workout. Edits do not alter active or completed workouts.
- Exercise browsing grouped by muscle, custom exercises, and muscle filters for routines and workout history.
- Edit a custom exercise's name or muscle group from its exercise menu, the exercise picker, or Settings > Manage custom exercises. Existing sets, routines, history, and records keep the same exercise ID; built-in exercises stay fixed.
- Optional 1–5 workout ratings at completion, editable later in history and included in backups and CSV.
- Autosaved active session, live m:ss / h:mm:ss elapsed time, rest countdown, notes, workout history, and quick exercise history.
- Decimal weights accept a dot or comma, including quarter-weight plates.
- Share workouts and selected-period statistics as lightweight PNG cards generated on the device, with share-text/copy/save fallbacks.
- Share one or all routines as portable files, or copy/paste routine import codes. Imports add routines without replacing existing history, settings, or an active workout.
- Verified offline readiness, cached fonts and sharing tools, and a loading recovery screen for interrupted connections.
- Personal records, estimated 1RM, volume and session statistics, and exercise charts.
- GitHub-style activity calendar: total minutes per day determine the shade in your accent color. Under 30, 30–59, 60–89, and 90+ minutes progress from light to dark. Multiple sessions add together.
- A dated weekly training schedule distinguishes missed sessions from rest days and preserves past plans.
- JSON backup/restore and spreadsheet-friendly CSV export.
- Installable on an iPhone Home Screen with offline assets and device-local IndexedDB storage.

## Run locally

Requires Node.js 20 or newer; no package installation.

```sh
node dev-server.mjs
```

Open the printed localhost URL. This is a static app: deploy the contents of `dist/` on an HTTPS static host. The included Sites manifest points to that directory.

## Verify and release

```sh
node --test
node release.mjs
```

Run `release.mjs` after every asset change. It derives the service-worker cache name from the assets and worker logic. Each update downloads a complete new cache before it can activate; HTTP cache revalidation and reload-mode precaching prevent stale assets from carrying into a release. The same update lifecycle runs locally and in production.

Setline checks for updates when opened, brought to the foreground, or reconnected, with automatic checks throttled to once per minute. Settings also has Check for updates. When a version is ready, Update now saves the current workout before activating it and reloading. Unsaved routine edits, invalid set input, or failed local saves block that action. Other open tabs get an update notice without a forced reload. Offline logging continues with the previously cached version when a new download fails.

Existing users upgrading from version 2.1 or earlier must open online, then fully close all Setline windows and reopen once to receive the new update controls. Future versions can use the update button. Do not delete the Home Screen app or clear website data to update. The app cannot check for updates while iOS has suspended or closed it.

## Cloudflare Pages

Production address: https://setline-ep2.pages.dev/

The `setline` Pages project uses `tichkii/setline` with these settings:

- Production branch: `main`, with automatic deployments enabled.
- Framework preset: None.
- Build command: `node --test && node release.mjs`.
- Build output directory: `dist`.
- Root directory: repository root (leave blank).

Keep the Cloudflare GitHub app authorized for this repository so pushes can trigger builds. The build runs the core tests and versions the offline cache before publishing the app. No database, environment secrets, or paid services are required.

When moving from a different hosting address, export a full JSON backup in the old app and restore it at the new address. Local workout data does not move automatically between website addresses. Install the new address on your iPhone Home Screen, then restore there if the installed app has separate storage. Keep the backup until you have checked your history.

## iPhone installation

Open the hosted link in Safari, choose Share → Add to Home Screen, keep Open as Web App enabled if offered, then Add. Open the installed app online once so its files can cache before going offline. Install before logging; Safari and installed-app data can be separate. JSON backup/restore moves your history between them.

## Sharing and offline use

Use Share workout in a saved session, Share stats in Progress, or Share routines on the workout screen. Routine sharing opens a checkbox selector for one, several, or all routines; Change selection keeps the current choices. Share dialogs present one primary action, with file and text alternatives under More options. PNG cards are rendered locally with Canvas and bundled fonts, without a server, screenshot library, or network request. Notes are excluded from shared summaries. Native file sharing is feature-detected; Save image, text sharing, copying, and a selectable text fallback remain available. iPhone native share-sheet behavior still needs physical-device verification.

Routine sharing exports only selected routine templates and their exercises. Import accepts the JSON download, the plain-text shared file, or pasted code. It previews names before adding, validates a 5 MB versioned package, keeps kg canonical, and generates fresh IDs. Duplicate imports intentionally add another copy rather than replace existing routines. This is separate from full-backup restore.

In Settings, Prepare offline access verifies that the complete app is cached. Connect once to prepare it before leaving coverage. Workouts, history, timers, image generation, and routine import then work locally. Save images/files to send later when a sharing destination needs connectivity. The first-ever visit still requires a connection; clearing browser storage removes the offline cache and local log.

## Data and calculation rules

All workout data is stored on the device using IndexedDB. Writes use a revision check within the same transaction to prevent two tabs silently replacing each other's changes. A conflicting tab shows an instruction to export and reload. Workouts and backups are never sent to an application server. The hosting provider still serves app assets and may retain ordinary request logs.

Canonical weights are kilograms; kg/lb toggles only change the display. Records use completed normal working sets. Estimated 1RM uses Epley for 1–12 reps (one rep uses its actual weight). Volume includes normal and drop sets, excludes warmups, and uses external load only. Bodyweight exercises can use 0 added weight. Only checked sets are saved when finishing. A surviving drop set without a valid parent is promoted to a normal set.

Calendar dates use the device's local time zone and assign each session to its start day. Duration uses elapsed start-to-finish time, including rests. Today is never marked missed. Schedule changes apply from their saved date, preserving earlier schedules.

JSON backups include exercises, routines, workout history, any active draft, and settings. Restore validates the entire file before replacing data and asks for confirmation. CSV exports completed sets for analysis; it is not a full backup format.

Schema version 2 includes appearance preferences, setup status, and nullable workout ratings. Version 1 backups migrate automatically; historical workouts remain unrated. Unknown future versions are rejected. Old app versions cannot load version 2 data, preventing them from silently removing new fields. Routine edits remain separate until Save routine; leaving an edited routine asks before discarding changes.

The two Latin variable fonts are self-hosted under the SIL Open Font License; license texts and source URLs are included in `dist/fonts/`.

## Limitations

- Apple Health integration needs a native iPhone app and is not available in this web version.
- Device-local data is not automatically synced or backed up. Clearing website data or losing the device can erase it. Export JSON backups regularly.
- Rest timers recover from screen locking, but background alarms are not supported.
- Existing RepCount data is not imported directly; restore accepts Setline JSON backups.
- Mobile viewport behavior and offline reload were checked in a desktop browser; a physical iPhone is still needed to verify Safari installation and native share-sheet behavior.
