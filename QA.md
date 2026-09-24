# Verification

Checked on 24 September 2026, including the version 2 feature update.

## Automated checks

`node --test core.test.mjs`: all 21 tests passed.

Coverage includes full JSON round trips; surviving drop sets when their parent is unchecked; warmup/drop-set volume and PR rules; canonical kg preservation across unit changes; invalid backup rejection; bodyweight sets; superset cleanup; duration-based calendar shades; historical training schedules; CSV escaping; and recalculation after deleting a workout.

Additional coverage: version 1 migration with active draft preservation, setup and appearance round trips, unsupported schema/preference rejection, rating range validation and CSV export, routine editing isolation, duplicate exercise IDs, canonical template weights, empty routine rejection, superset/drop templates, and legacy schedule baselines.

## Version 2 browser checks

- Completed first-time setup with pounds, light mode, cobalt accent, Manrope, and Monday/Thursday training days.
- Created a two-exercise routine using the Chest and Back categories, entered weight/repetition targets, linked a superset, and added a drop set.
- Started the routine, completed 135 lb × 8 and 95 lb × 8 sets, rated the session 4/5, and saved it. History showed one session and 1,840 lb volume.
- Reloaded and confirmed the rating, weight unit, appearance, and routine persisted. Edited the saved rating to 5/5.
- Repeated the workout, changed bench repetitions to 6, and completed the set. Edited the original routine to 140 lb and renamed it; the active workout remained 135 lb × 6, checked. Cancelling another routine edit also preserved the draft.
- Entered an invalid negative routine weight and added a set. Confirmed the negative value and its field-specific validation message remained visible; Save stayed in the editor until correction.
- Reordered routine exercises and visually inspected the editor at 390 × 844. Inspected dark/rose appearance at 320 × 740 without horizontal overflow.
- Stopped the local server and reloaded the release candidate. The active workout, 5/5 history rating, muscle filters, and preferences worked offline. FontFaceSet reported two loaded fonts and both font checks passed.
- Browser console reported no application errors. Temporary test data remained on a separate local origin, outside deployed assets.

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
