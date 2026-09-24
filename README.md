# Setline

A phone-first, offline-capable workout tracker. No account, subscriptions, or hosted workout database. Each device has its own data.

## Features

- Exercises, reps, weights, warmups, drop sets, and linked supersets.
- First-run setup for kg/lb, rest time, training days, and appearance; existing users retain their data and settings.
- Light/dark appearance, four accent colors, and bundled Space Grotesk/Manrope fonts that work offline.
- A dedicated routine editor: create, rename, reorder, set targets, and link supersets without starting a workout. Edits do not alter active or completed workouts.
- Exercise browsing grouped by muscle, custom exercises, and muscle filters for routines and workout history.
- Optional 1–5 workout ratings at completion, editable later in history and included in backups and CSV.
- Autosaved active session, rest countdown, notes, workout history, and quick exercise history.
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
node --test core.test.mjs
node release.mjs
```

Run `release.mjs` after every asset change. It derives the service-worker cache name from the asset contents. New production versions activate after the previous app windows are closed, preserving active sessions. Localhost updates activate immediately for development.

## iPhone installation

Open the hosted link in Safari, choose Share → Add to Home Screen, keep Open as Web App enabled if offered, then Add. Open the installed app online once so its files can cache before going offline. Install before logging; Safari and installed-app data can be separate. JSON backup/restore moves your history between them.

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
