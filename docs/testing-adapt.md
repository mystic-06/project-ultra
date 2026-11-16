# Offline exercise selection and workout adaptation

Issue [#5](https://github.com/mystic-06/project-ultra/issues/5). Review baseline: `26e638b9d68fb8f94086fe13a211cab4982baf85`.

The source and coverage prerequisite is recorded in [catalogue.md](catalogue.md). A curated 19-record catalogue and its source license are bundled locally. Search matches all query words against names, equipment and aliases, ignoring case and punctuation. All UPPER movements and all 16 recent-example names are covered without custom exercises. No runtime catalogue fetch is required.

Home supports the supplied routine or Start empty workout. Both use the existing one-active-workout choice and discard confirmation. In the workout, Add exercise opens the searchable picker with a no-results state. Arrange exercises and sets reveals move-up/down, remove, exercise replacement, and set reset controls. Set reset replaces a row with a new blank row retaining its plan/type. Exercise replacement similarly retains the old planned set rows but clears results and checks. New exercises start with one blank normal set; newly added sets have no prescribed target (represented by targetMin/targetMax = 0). Remove, reset and replacement require explicit confirmation. Cancelling leaves the workout intact.

Structural actions use the same public training module, queue and SQLite transaction boundary as entry saves. They wait for prior saves, block further changes while committing, preserve IDs/values/checks for surviving rows, and publish the changed workout only after commit. Position swaps use temporary negative positions within the transaction to avoid uniqueness collisions. Failed actions roll back and remain available for retry by repeating the action. Raw incomplete text on surviving rows stays in memory; structural moves do not rewrite it into storage or replace it with an older saved value. Removed IDs are not reused. Stale workout/row IDs cannot affect later workouts.

Migration 3 adds the snapshotted entry mode, defaulting existing weighted starter records to weighted. Unilateral, bodyweight and assisted entries can be selected and arranged; their logging remains disabled with a message until issues #7, #9 and #10 supply the respective entry paths. This avoids recording those movements under an incorrect weighted convention. No fractions or effective loads are invented here.

## Automated evidence

Run `npm test`, `npx tsc --noEmit`, and `npx expo lint` using Node 22.22.1. Nine public-module tests in `tests/training/adapt.test.ts` exercise isolated real SQLite and fresh-module reopening: catalogue coverage/no-results, empty start/add, all structural operations, routine independence, unavailable entry modes, rollback preserving raw drafts/checks, ordering behind a queued check, acknowledgement timing, stale IDs, removing everything/rebuilding, and late input/blur events. The existing durability, process-exit, Home and finish tests remain enabled.

## Android walkthrough — pending

1. In airplane mode, Start empty workout. Confirm it is resumable with no exercises. Open Add exercise; search `bench barbell`, mixed case, an export name, and a nonexistent name. Verify useful results and a clear no-results message.
2. Add Bench press, log/check a set and wait for Saved. Add another exercise. Enable Arrange, move the exercises and sets up/down, add sets, reset a row, remove a set, and remove an exercise. Test Cancel and Confirm for each destructive action.
3. Replace a checked exercise from the picker. Cancel once, then confirm. The replacement must retain the planned set targets/types but have blank unchecked results. The old result must never appear attached to the new movement.
4. Return Home, Resume, then relaunch and Resume again. Verify exercise/set order, IDs through behavior, entries and checks. Finish a workout with performed work; inspect completed details and exercise previews on Home. Start the original routine again and verify it remains unchanged.
5. Start empty while another workout is active. Exercise Resume and both discard confirmation steps. Cancelling must preserve the original; confirmation must create an empty active workout.
6. Select a bodyweight, assisted or unilateral entry and verify its unavailable logging message. Arrange/remove it; do not treat it as a weighted bilateral result.
7. Enter incomplete load text (`40.`), rearrange the exercise or another set and verify the raw text remains. Relaunch should recover only the earlier acknowledged load. Inject a failed structural commit at the development persistence seam; verify the old workout remains, then repeat the action successfully.
8. Check Android Back, search keyboard behavior, large text, touch comfort, scroll reachability and screen-reader labels on a small device. Host SQLite tests and production export do not prove native interaction or production-adapter recovery.
