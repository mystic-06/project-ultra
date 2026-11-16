# Failed saves and active-workout replacement

Issue: [#2](https://github.com/mystic-06/project-ultra/issues/2). The public workout interface, real SQLite tests, and durability guarantees follow [ADR 0001](adr/0001-workout-persistence-and-sqlite-testing.md).

Home shows the active workout and its save status before the supplied routine. Routine access stays available while training is active. Starting again offers Resume or Discard and start; discard opens a second confirmation naming the current and selected workouts. Cancel, Android Back on either dialog, and Resume do not issue a replacement command. A confirmed replacement commits deletion of the old workout and insertion of the new snapshot in one transaction; only then does the visible workout change. Failure retains the original workout and incomplete draft, with Resume and Retry available.

Completeness and durability are separate: a missing required field shows Incomplete set while typing, with values saved when valid partial values are durable; raw text such as `40.` shows Incomplete input · not saved. An invalid check does not change an existing save acknowledgement.

Every route except Home and Workout has a compact Resume bar; Home has its own Resume card. Both expose workout-wide pending/failed/incomplete/saved status, and failed saves offer Retry of the latest input. The workout screen keeps per-set feedback. Back navigation never finishes or discards training. Incomplete numeric text remains in the root provider's workout module across navigation. Only acknowledged values are guaranteed after relaunch.

## Automated verification

Run `npm test` with Node 22.22.1. The same workout module, SQL, and migrations run against temporary file-backed Node SQLite. Persistence failures/delays are injected at commit. Tests cover durable fresh replacement, cancellation-safe second starts, rollback preserving checked results and raw text, stale confirmations, rejection of late old-workout saves after successful replacement, edits during failed replacement, aggregate save feedback, and latest-value Retry. Existing tests cover stale acknowledgements, incomplete text, and reopening after process exit. Also run `npx tsc --noEmit` and `npx expo lint`.

## Android walkthrough — not yet verified by the agent

1. Start training, enter `40` kg and `6` reps, check, and wait for Saved. Return Home with both the header Back control and Android Back. Resume must restore the same set and check.
2. Enter incomplete load text such as `40.`. Return Home, confirm Incomplete input · not saved, and Resume. The exact raw text should remain. Relaunch is only guaranteed to recover the earlier acknowledged `40 × 6` result.
3. Open another existing route (for example `/explore` through a development deep link). Confirm the compact Resume bar appears above the bottom safe area and opens the active workout. This is a check of the shared layout; future screens inherit the same control.
4. On Home, press Start workout while active. Confirm Resume current workout, Discard and start…, and Cancel are available. Exercise Resume and Cancel; verify values, check, and incomplete text remain. Android Back should cancel the dialog without replacing anything.
5. Choose Discard and start…, inspect the separate confirmation, then cancel it or press Android Back. Verify the original is still resumable. Repeat and confirm replacement. A fresh workout with blank entries and unchecked sets should appear; relaunch must resume the new workout.
6. With large text enabled and on a small screen, verify all confirmation content and actions are reachable, screen-reader labels are useful, and the Resume bar does not cover screen content or system controls.
7. Automated tests verify failed replacement/Retry and delayed acknowledgements. To inspect their visual states on Android, inject failures/delays only at the development persistence adapter. A failure must retain the old workout and latest input, expose Retry, and never show Saved for an uncommitted edit. There is no production fault toggle.

For offline cold-launch verification, use an installed preview/release APK with bundled JavaScript. Expo Go and development builds normally load code from Metro and do not by themselves establish standalone offline startup. See the [Expo development-build guide](https://docs.expo.dev/develop/development-builds/introduction/).

Verification on 2026-11-16: all 22 Node SQLite tests, application/test TypeScript checks, Expo lint, and Android production export passed. No physical Android or production-adapter runtime result is claimed. The optional browser check could not launch Chromium with the available system runtime.
