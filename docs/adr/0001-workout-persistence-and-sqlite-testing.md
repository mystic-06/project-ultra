---
status: accepted
---

# Workout persistence, save ordering, and SQLite testing

Approved by the owner on 2026-11-15 for [issue #1](https://github.com/mystic-06/project-ultra/issues/1). Keep validation, save ordering, transactions, and persistence behind one workout module whose public training actions and read operations serve both screens and tests. Use asynchronous `expo-sqlite`, parameterized SQL, and numbered migrations; use explicit SQL for the first slice rather than the installed Drizzle Expo adapter, which currently executes statements and transactions synchronously.

The module owns its connection and serializes all database access, including reads during transactions. Enable foreign keys on that connection and use ordinary async transactions with no overlapping access outside the module. SDK 58's exclusive transactions use another connection that does not inherit foreign-key settings; ordinary transactions can capture overlapping queries, making sole connection ownership essential. See the [SDK 58 SQLite documentation](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/#executing-queries-within-an-async-transaction).

Persist valid unchecked entries separately from performed status. Keep incomplete raw input in module-owned memory across in-app navigation; recovery of incomplete text after process death is not guaranteed. Starting a routine creates an independent workout snapshot. Enforce one active workout with a database constraint.

Use both an ordered queue and increasing edit revisions. Each edit updates the visible draft immediately; valid edits queue without debounce or coalescing in the first slice. A commit acknowledges only its revision, and Saved appears only when the current persistable revision is acknowledged. Incomplete input remains distinguishable from saved values. Failure retains the latest draft; Retry submits the latest values rather than replaying an obsolete failed payload. Thus `40 kg → 45 kg → Retry` must recover 45 kg, and completion of the 40 kg save cannot label 45 kg as saved.

A check captures and validates the values visible at the tap, then commits those values and performed status together in its queued transaction. Later valid edits retain the check; ordinary autosave payloads cannot overwrite performed status. Finish and replacement use the same queue, become visible only after commit, and preserve the prior committed workout on failure.

Use `node:test` with file-backed `node:sqlite`, a temporary database per test, and the same workout module, SQL, and migrations as production. Only the low-level SQLite adapter changes. Construct a fresh module when reopening storage. Pin the test runner version: Node 22.22.1 was verified to open SQLite during review, but reports the SQLite module as experimental. Host SQLite does not prove Expo integration; verify the core reopen scenario through the production adapter on Android and check Pulse keyboard, focus, and save feedback on a physical device. Native mocks from `jest-expo` are not durability evidence. See the [Node test runner](https://nodejs.org/api/test.html), [Node SQLite](https://nodejs.org/api/sqlite.html), and [Expo testing guide](https://docs.expo.dev/develop/unit-testing/).

Issue #1 must demonstrate unchecked and checked recovery after reopening, newest-value recovery under rapid edits, failure followed by a newer edit and Retry, failed checks retaining unchecked status, and concurrent starts preserving the single active workout. Include a subprocess exit/reopen test after acknowledgement so evidence does not depend on graceful shutdown. Exercise failures and delays only at the persistence seam while retaining real SQLite.

These decisions settle issue #1's three pre-implementation questions. They do not approve the remaining release proposals. Approval of these decisions is separate from authorization to implement a ticket.
