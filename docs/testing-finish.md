# Finish review and completed results

Issue [#3](https://github.com/mystic-06/project-ultra/issues/3), implemented against review baseline `47f6432035edf917d9bb8bbca633b293e051900f`. Persistence and tests follow [ADR 0001](adr/0001-workout-persistence-and-sqlite-testing.md).

Workout → Review and finish separates Performed, Unfinished (entered unchecked), and Not entered sets. The review allows explicit check corrections; Keep training returns to numeric entry. A finished workout retains unchecked and untouched rows, while totals include performed rows only. Unsaved invalid text or failed saves must be corrected/retried before finishing, so completion cannot silently replace the visible draft with older saved values. Valid saved partial entries may finish as Unfinished.

With no performed sets, the review offers Keep training and Discard workout. Discard requires a separate Confirm discard workout action; Cancel discard, Back, and Keep training preserve the workout. Finish and discard are serialized with earlier saves. While committing, new edits and duplicate completion actions are blocked. A failure leaves the active workout and latest input available for retry. A successful transaction clears Resume, and finish opens the completed details. Home provides links to completed workouts with date, duration, and performed-set count. The routine remains unchanged.

Migration 2 adds a nullable completion timestamp without replacing existing training data. History summaries and detail reads use the same module-owned database queue. Completed history is read-only in this ticket; history editing is separate release work.

## Automated evidence

With Node 22.22.1, run `npm test`, `npx tsc --noEmit`, and `npx expo lint`. The new `tests/training/finish.test.ts` exercises public training actions/read operations against temporary file-backed SQLite. It covers finish/reopen, unchanged routines, unfinished and untouched totals, zero-performance rejection and confirmed discard, discard/finish rollback, retry without duplicate history, queued checks before finish, acknowledgement timing, protection against edits during completion, failed/invalid input, stale confirmations, and forgotten-check correction. Existing process-exit and save-ordering tests remain enabled.

## Physical Android walkthrough — pending

1. Start the supplied routine offline. Enter and check `40 kg × 6` in one row, enter `35 kg × 8` without checking another, and leave the rest untouched. Open Review and finish. Verify all three groups, counts, and load conventions.
2. Mark the unchecked row performed in review, wait for Saved, then uncheck it. Keep training and confirm the values and checks remain. Use Android Back as well.
3. Finish with one performed row. Confirm the results page shows one performed set, the entered unchecked row under Unfinished, and the untouched rows under Not entered. Home must have no Resume card. Open the history item, relaunch, and open it again. Start the same routine and verify blank entries.
4. Start another workout with entered unchecked values but no checks. Open review and verify Keep training and Discard. Cancel the discard confirmation and test Android Back. Confirm discard on a separate attempt; verify no history item is added and Resume disappears only after the commit.
5. Enter incomplete text such as `40.` and navigate to review. Verify the raw text survives Keep training and finish is unavailable until corrected. Saved partial input such as load-only should be preserved as Unfinished when another row is performed.
6. Using failures/delays only at the development persistence adapter, verify failed finish/discard retains Resume and entries; Retry completes once. During a delayed commit, navigation must not allow new numeric edits to alter the result being committed.
7. On a small screen with large text and a screen reader, verify all groups, check actions, errors, and final actions remain reachable. Check production-adapter recovery on a device; host SQLite tests do not prove native integration.
