# Verification

Checked on 24 September 2026 before the first release.

## Automated checks

`node --test core.test.mjs`: all 12 tests passed.

Coverage includes full JSON round trips; surviving drop sets when their parent is unchecked; warmup/drop-set volume and PR rules; canonical kg preservation across unit changes; invalid backup rejection; bodyweight sets; superset cleanup; duration-based calendar shades; historical training schedules; CSV escaping; and recalculation after deleting a workout.

## Browser checks

- Logged an 80 kg × 8 working set, a 50 kg × 10 drop set, and a 60 kg × 8 row; linked the two exercises as a superset.
- Reloaded the active workout and confirmed the 80 kg set and completion state survived.
- Finished the session: exactly one history entry, 3 working sets, and 1,620 kg of volume.
- Confirmed bench-press records: 80 kg heaviest working set and 101.3 kg estimated 1RM.
- Stopped the local HTTP server, reloaded from the offline cache, and continued using history and progress.
- Switched to pounds offline: 176.4 lb heaviest bench set, 223.4 lb estimated 1RM, and 3,571.5 lb total volume.
- Visually inspected the Progress screen at a 390 × 844 viewport, including the duration-based activity grid and fixed bottom navigation.
- Verified the two optional WebMCP tools register correctly. Valid calls showed the same exercise history as the UI; invalid inputs failed without changing the saved workout count.

The test log used a separate localhost origin from the user's preview. It is not bundled into the application or deployment.

## Device checks still needed

No physical iPhone was available. Safari installation, share-sheet downloads, storage retention under iOS storage pressure, and the on-screen keyboard should be checked on the user's phone. The app explains its backup requirement and absence of Apple Health and background timer alerts.
