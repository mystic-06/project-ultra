# Daily training Home

Issue [#4](https://github.com/mystic-06/project-ultra/issues/4). Review baseline: `13fa28c9f98b667e51b69703c9ebe54cbb6298ed`.

Home shows a short greeting that rotates by local date, then Resume for an active workout or the supplied routine and Start otherwise. Weekly activity follows the primary action. An active workout still leaves routine access available with the existing Resume/discard-and-start safeguards. Recent cards retain title, local start date, elapsed duration, performed-set count, and up to three exercise names from the workout snapshot. Cards open the existing completed results. A virtualized list keeps long histories from mounting every card. Empty history shows encouragement while keeping Start available above it.

Weekly activity counts **completion timestamps** within the current local Monday midnight through the following Monday midnight (exclusive). A workout started Sunday and completed Monday belongs to the new week. Calendar arithmetic respects daylight-saving changes; UTC week boundaries and fixed 168-hour intervals are not used. Home refreshes at local midnight and when the app returns to the foreground, including after changing the device time zone. The clock is injectable at the module boundary for tests. No database migration or dependency is added.

## Automated verification

Run `npm test`, `npx tsc --noEmit`, and `npx expo lint`. The public training-module tests in `tests/training/home.test.ts` use real file-backed SQLite, a controlled clock, and fresh-module reopen. They cover Monday/Sunday boundaries, adjacent weeks, overnight completion, exclusion of active/discarded/failed workouts, and durable ordered exercise names, duration, and performed totals. Run the compiled Home test with `TZ=Asia/Kolkata` and `TZ=America/New_York` to exercise local boundaries and both daylight-saving transitions.

## Android walkthrough — pending

1. With empty history, confirm a short greeting, Start and the routine appear before the week and empty-history message. Starting must work offline.
2. Log a set and return Home. Resume must be the primary action and retain save feedback. Weekly activity must exclude the active workout. Start another workout must retain the existing resume/discard confirmation flow.
3. Finish with a performed set and an unchecked entered set. Home must clear Resume, increase this week's count by one, and show title, date, duration, performed-only total, and exercise previews. Tap the card to inspect the existing recorded results; relaunch and repeat.
4. Discard a workout and verify no weekly increase or recent card. Repeat after a simulated failed finish at the development persistence adapter: only a successful retry may increase the count.
5. Keep Home open across Sunday midnight, then test background/foreground across that boundary and after changing the device time zone. Verify the displayed Monday–Sunday range and count refresh without relaunch.
6. On a small Android device with large text and a screen reader, inspect wrapping, card labels, scroll comfort, and Start/Resume reachability. Exercise names may truncate to two lines; the details page retains the full workout.

Host tests and a production export do not establish physical-device rendering or production Expo SQLite runtime behavior.
