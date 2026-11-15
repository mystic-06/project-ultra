# Basic workout verification

Issue: [#1](https://github.com/mystic-06/project-ultra/issues/1). Persistence decisions: [ADR 0001](adr/0001-workout-persistence-and-sqlite-testing.md).

Use Node 22.22.1 (`.nvmrc`). `npm test` compiles the training tests with `tsconfig.test.json` and uses `node:test` in one process. Each test owns a separate temporary SQLite file. The test adapter uses Node's real SQLite; the workout module, SQL, and migrations are shared with the app. Delays and failures are injected at commit without replacing SQLite. A child-process test exits after acknowledgement without closing storage, then verifies recovery through a fresh workout module. The runner needs permission to launch child processes. Node 22's SQLite module emits an experimental warning.

For a focused test, compile with `npx tsc -p tsconfig.test.json`, then run `node --experimental-test-isolation=none --test --test-name-pattern='failed check' .test-build/tests/training/workout.test.js`. Run `npx tsc --noEmit` and `npx expo lint` for application checks.

The first slice supplies a three-exercise, seven-set weighted subset of UPPER: lat pulldown, chest press machine, and overhead press barbell. It is labelled as a starter, not the complete prescription. Routine authoring, bodyweight/L/R modes, equipment, previous-result lookup, rest, finish/history, and backup are later slices. The active workout remains resumable; this slice does not offer a destructive replacement action.

## Physical Android walkthrough — required, not yet verified

1. Launch in airplane mode after installing a compatible development build. Confirm Home, Manrope typography, and the supplied routine work offline.
2. Start the routine. Confirm the set number, target, warm-up label, blank Previous, kg input, reps input, and check remain distinct. Verify combined/displayed load hints.
3. Enter `40` kg and `6` reps without checking. Wait for Saved. Go Home, resume, then force-stop and reopen. Confirm `40 × 6`, unchecked.
4. Check the set. Wait for Saved. Force-stop and reopen. Confirm the same values and check. Change valid values and confirm the check remains.
5. Clear required reps, leave the field, wait for Saved, and reopen. Confirm the load remains and the set is unfinished. Incomplete text such as `40.` should survive in-app navigation and never claim Saved; relaunch recovery of incomplete text is not guaranteed.
6. With the keyboard open, verify load → reps focus order, scrolling to the last exercise, and access to the focused row's target and check. Verify 48-point check/input targets, screen-reader labels, and larger text. Check Android back returns Home without ending the workout.
7. Verify rapid edits settle on the newest values. Automated tests cover delayed/failed commits, Retry, atomic start/check, and concurrent starts; use a development-only persistence fault injection if visually checking failure feedback on device.

Android production-adapter and physical keyboard evidence cannot be replaced by the Node suite. Record device/build details and results when this walkthrough is performed.

Implementation verification on 2026-11-15: all 13 Node SQLite integration tests passed, application and test TypeScript checks passed, Expo lint passed, and an Android production bundle exported successfully. No Android device or `adb` was available, so production-adapter runtime and physical keyboard verification remain outstanding.

## Browser development

`metro.config.js` enables SQLite WASM assets and cross-origin isolation headers for the development server. Production web hosting also needs `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin`. Browser SQLite is an additional development surface; the release target is Android.
