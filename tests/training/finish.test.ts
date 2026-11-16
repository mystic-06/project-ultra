import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';

import { openTraining, summarizeWorkout } from '../../src/training/workout';
import { upperStarter } from '../../src/training/routines';
import { controlCommits, openNodeDatabase } from './node-database';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'ultra-finish-'));
  const path = join(directory, 'training.db');
  const control = controlCommits(await openNodeDatabase(path));
  let training = await openTraining(control.database);
  t.after(async () => { await training.close(); await rm(directory, { recursive: true, force: true }); });
  return { training, control, async reopen() {
    await training.close();
    training = await openTraining(await openNodeDatabase(path));
    return training;
  } };
}

test('finish preserves results and unfinished entries after reopening without changing the routine', async (t) => {
  const { training, reopen } = await fixture(t);
  const routineBefore = structuredClone(upperStarter);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const [performed, unchecked] = workout.exercises[0].sets;
  await training.editSet(performed.id, { load: '40', reps: '6' });
  await training.setPerformed(performed.id, true);
  await training.editSet(unchecked.id, { load: '35', reps: '8' });
  assert.deepEqual(summarizeWorkout(training.getSnapshot().workout!), { performed: 1, unfinished: 1, untouched: 5 });
  await training.finishWorkout(workout.id);
  assert.equal(training.getSnapshot().workout, null);
  const recovered = await reopen();
  assert.equal(recovered.getSnapshot().workout, null);
  const [summary] = recovered.getSnapshot().history;
  assert.equal(summary.id, workout.id);
  assert.equal(summary.performedSetCount, 1);
  assert.ok(summary.completedAt >= workout.startedAt);
  const details = (await recovered.getCompletedWorkout(workout.id))!;
  assert.deepEqual(summarizeWorkout(details), { performed: 1, unfinished: 1, untouched: 5 });
  assert.deepEqual(details.exercises[0].sets.slice(0, 2).map(({ load, reps, performed }) => [load, reps, performed]),
    [['40', '6', true], ['35', '8', false]]);
  assert.deepEqual(upperStarter, routineBefore);
  await recovered.start(upperStarter);
  assert.equal(recovered.getSnapshot().workout!.exercises[0].sets[0].load, '');
  assert.equal(recovered.getSnapshot().history.length, 1);
});

test('zero performed sets cannot finish and confirmed discard removes the active workout without history', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  await training.editSet(workout.exercises[0].sets[0].id, { load: '40', reps: '6' });
  await assert.rejects(training.finishWorkout(workout.id), /No performed sets/);
  assert.equal(training.getSnapshot().workout!.id, workout.id);
  control.failNextCommit();
  await assert.rejects(training.discardWorkout(workout.id));
  assert.equal(training.getSnapshot().workout!.id, workout.id);
  await training.discardWorkout(workout.id);
  const recovered = await reopen();
  assert.equal(recovered.getSnapshot().workout, null);
  assert.deepEqual(recovered.getSnapshot().history, []);
  assert.equal(await recovered.getCompletedWorkout(workout.id), null);
});

test('a failed finish leaves the checked workout resumable and retry creates one history record', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const id = workout.exercises[0].sets[0].id;
  await training.editSet(id, { load: '40', reps: '6' });
  await training.setPerformed(id, true);
  control.failNextCommit();
  await assert.rejects(training.finishWorkout(workout.id));
  assert.equal(training.getSnapshot().workout!.id, workout.id);
  assert.equal(training.getSnapshot().isEnding, false);
  assert.deepEqual(training.getSnapshot().history, []);
  const recovered = await reopen();
  assert.equal(recovered.getSnapshot().workout!.exercises[0].sets[0].performed, true);
  assert.equal(await recovered.getCompletedWorkout(workout.id), null);
  await recovered.finishWorkout(workout.id);
  assert.equal(recovered.getSnapshot().history.length, 1);
  await assert.rejects(recovered.finishWorkout(workout.id));
  assert.equal(recovered.getSnapshot().history.length, 1);
});

test('finish waits for queued checks and only clears Resume after committing', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const id = workout.exercises[0].sets[0].id;
  await training.editSet(id, { load: '40', reps: '6' });
  const pendingCheck = control.holdNextCommit();
  const check = training.setPerformed(id, true);
  await pendingCheck.entered;
  const finishing = training.finishWorkout(workout.id);
  assert.equal(training.getSnapshot().isEnding, true);
  const pendingFinish = control.holdNextCommit();
  pendingCheck.release();
  await check;
  await pendingFinish.entered;
  assert.equal(training.getSnapshot().workout!.id, workout.id);
  assert.deepEqual(training.getSnapshot().history, []);
  // Input controls cannot introduce an unacknowledged draft during the finish commit.
  assert.equal(await training.editSet(id, { load: '45' }), false);
  pendingFinish.release();
  await finishing;
  const recovered = await reopen();
  const details = (await recovered.getCompletedWorkout(workout.id))!;
  assert.deepEqual([details.exercises[0].sets[0].load, details.exercises[0].sets[0].performed], ['40', true]);
  assert.equal(recovered.getSnapshot().workout, null);
});

test('failed or invalid latest input blocks finishing until corrected and retried', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const id = workout.exercises[0].sets[0].id;
  await training.editSet(id, { load: '40', reps: '6' });
  await training.setPerformed(id, true);
  await training.editSet(id, { load: '40.' });
  await assert.rejects(training.finishWorkout(workout.id), /Save or correct/);
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].load, '40.');
  control.failNextCommit();
  await training.editSet(id, { load: '45' });
  await assert.rejects(training.finishWorkout(workout.id), /Save or correct/);
  await training.retryFailedSaves();
  await assert.rejects(training.finishWorkout(workout.id), /No performed sets/);
  await training.setPerformed(id, true);
  await training.finishWorkout(workout.id);
  const details = (await (await reopen()).getCompletedWorkout(workout.id))!;
  assert.equal(details.exercises[0].sets[0].load, '45');
});

test('stale finish and discard confirmations cannot remove a replacement workout', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  const originalId = training.getSnapshot().workout!.id;
  await training.replaceActiveWorkout(upperStarter, originalId);
  const replacementId = training.getSnapshot().workout!.id;
  await assert.rejects(training.finishWorkout(originalId));
  await assert.rejects(training.discardWorkout(originalId));
  const recovered = await reopen();
  assert.equal(recovered.getSnapshot().workout!.id, replacementId);
  assert.deepEqual(recovered.getSnapshot().history, []);
});

test('review can correct a forgotten check while partial entries remain Unfinished in completed history', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const [forgotten, partial] = workout.exercises[0].sets;
  await training.editSet(forgotten.id, { load: '40', reps: '6' });
  await training.editSet(partial.id, { load: '35' });
  assert.deepEqual(summarizeWorkout(training.getSnapshot().workout!), { performed: 0, unfinished: 2, untouched: 5 });
  await training.setPerformed(forgotten.id, true);
  await training.finishWorkout(workout.id);
  const recovered = await reopen();
  const details = (await recovered.getCompletedWorkout(workout.id))!;
  assert.deepEqual(summarizeWorkout(details), { performed: 1, unfinished: 1, untouched: 5 });
  assert.deepEqual([details.exercises[0].sets[1].load, details.exercises[0].sets[1].reps], ['35', '']);
});
