# Verification

Checked on 24 September 2026, including the version 2.2 in-app update flow.

## Automated checks

`node --test`: all 63 tests passed.

Coverage includes full JSON round trips; surviving drop sets when their parent is unchecked; warmup/drop-set volume and PR rules; canonical kg preservation across unit changes; invalid backup rejection; bodyweight sets; superset cleanup; duration-based calendar shades; historical training schedules; CSV escaping; and recalculation after deleting a workout.

Additional coverage: version 1 migration with active draft preservation, setup and appearance round trips, unsupported schema/preference rejection, rating range validation and CSV export, routine editing isolation, duplicate exercise IDs, canonical template weights, empty routine rejection, superset/drop templates, and legacy schedule baselines.

Version 2.1 adds decimal-dot/comma parsing, fractional kg/lb round trips, elapsed-time hour boundaries and resumed sessions; routine bundle privacy, validation, ID collisions, additive imports and size/count limits; and offline cache completeness, failed-install retention, cache isolation, navigation fallback, missing-script errors, readiness timeouts and waiting-worker handling.

Version 2.2 covers reload-mode precaching; explicit activation only after cache completeness; deterministic versioning including worker changes; awaiting a successful save before activation; first-install handling; another-tab activation; downloaded updates while offline; install/check/activation deadlines and retries; and throttled foreground/reconnect checks.

## Version 2.2 browser checks

- Served two release versions on a separate localhost origin with production security headers at a 390 × 844 viewport.
- Confirmed the first install showed up-to-date status without an update prompt. Deployed the second version while the first stayed open, then used Check for updates to display Update ready.
- Logged and checked 22,75 kg × 8. An invalid second weight blocked Update now. Removing that invalid row cleared the blocker.
- Renamed an unsaved routine; Update now left it open and asked to save. Saved the routine, applied the update, and confirmed the release marker changed.
- After the update reload, the active workout still contained 22.75 kg × 8, checked, with 182 kg volume and the continuing elapsed timer. The update banner disappeared and Settings reported up to date.
- Stopped the local server and confirmed no listener remained. Check for updates reported a recoverable failure. Reloaded from cache and continued the same workout with its saved set and timer intact.
- No application console errors during the successful upgrade. Physical iOS Home Screen lifecycle testing remains outstanding.

## Version 2.1 browser checks

- Used a separate localhost origin with the production Content-Security-Policy headers and a 390 × 844 viewport.
- Completed 22,75 kg × 8 and 17.25 kg × 10, rated 4/5 and saved. Summary showed 354.5 kg; share text and image preserved both fractional weights.
- Generated an 83 KB workout PNG and a 75 KB stats PNG from the on-device canvas. Inspected both previews; no external image or font requests are required. Share text excludes private notes.
- Shared one routine and all four local test routines. The single package contained one routine and only its referenced exercises, without workout history.
- Rejected an invalid routine format, previewed a valid copied import code, and added it alongside existing routines while retaining workout history.
- Saved a 62,5 kg target in the routine editor. Logged 27,25 lb × 5 in an active session; display showed 27.25 lb and 136.25 lb volume. Invalid 27..25 input reset both completion state and the live totals to zero until corrected.
- Live elapsed time advanced in seconds and survived a reload; completed summaries continue to use minutes.
- Confirmed offline readiness, stopped the local server, verified its port was unavailable, and reloaded. The active workout, 27.25 lb weight, checked set, elapsed timer and bundled fonts remained available.
- With the server still stopped, generated a stats card and imported a routine without changing the active workout.
- No application console errors. Native iPhone share-sheet and final Files/Photos saving still need physical-device verification; the in-app browser did not expose a download event for the Save image action. Preview/long-press and text/code fallbacks remain available.

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
