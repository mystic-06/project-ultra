import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openTraining } from '../../src/training/workout';
import { upperStarter } from '../../src/training/routines';
import { openNodeDatabase } from './node-database';

test('an unchecked weighted entry survives reopening and can then be checked durably', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ultra-workout-'));
  const path = join(directory, 'training.db');
  t.after(() => rm(directory, { recursive: true, force: true }));
  let training = await openTraining(await openNodeDatabase(path));
  assert.equal(await training.start(upperStarter), true);
  const setId = training.getSnapshot().workout!.exercises[0].sets[0].id;
  assert.equal(await training.editSet(setId, { load: '40', reps: '6' }), true);
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].status, 'saved');
  await training.close();

  training = await openTraining(await openNodeDatabase(path));
  let row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.equal(training.getSnapshot().workout!.title, upperStarter.title);
  assert.deepEqual([row.load, row.reps, row.performed], ['40', '6', false]);
  assert.equal(await training.setPerformed(setId, true), true);
  await training.close();

  training = await openTraining(await openNodeDatabase(path));
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.deepEqual([row.load, row.reps, row.performed], ['40', '6', true]);
  await training.close();
});

test('old acknowledgements cannot mark newer input saved and rapid edits recover newest values', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  const firstCommit = control.holdNextCommit();
  const older = training.editSet(id, { load: '40', reps: '6' });
  await firstCommit.entered;
  const newer = training.editSet(id, { load: '45' });
  assert.equal(first(training).status, 'saving');
  const secondCommit = control.holdNextCommit();
  firstCommit.release();
  await older;
  await secondCommit.entered;
  assert.equal(first(training).load, '45');
  assert.equal(first(training).status, 'saving');
  secondCommit.release();
  await newer;
  assert.equal(first(training).status, 'saved');
  assert.equal(first(await reopen()).load, '45');
});

test('Retry saves the newest draft after repeated failures', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  await training.editSet(id, { load: '35', reps: '6' });
  control.failNextCommit();
  assert.equal(await training.editSet(id, { load: '40' }), false);
  assert.equal(first(training).status, 'failed');
  control.failNextCommit();
  assert.equal(await training.editSet(id, { load: '45' }), false);
  assert.equal(first(training).load, '45');
  assert.equal(await training.retrySet(id), true);
  assert.deepEqual([first(await reopen()).load, first(training).performed], ['45', false]);
});

import type { TestContext } from 'node:test';
import { controlCommits } from './node-database';
import type { Training } from '../../src/training/workout';

function first(training: Training) {
  return training.getSnapshot().workout!.exercises[0].sets[0];
}

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'ultra-workout-'));
  const path = join(directory, 'training.db');
  const control = controlCommits(await openNodeDatabase(path));
  const training = await openTraining(control.database);
  let current = training;
  t.after(async () => { await current.close(); await rm(directory, { recursive: true, force: true }); });
  return { training, control, path,
    async reopen() {
      await current.close();
      current = await openTraining(await openNodeDatabase(path));
      return current;
    },
  };
}

test('valid partial values save unchecked and incomplete text survives navigation without claiming Saved', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  assert.equal(await training.editSet(id, { load: '40' }), true);
  assert.equal(first(training).performed, false);
  const recovered = await reopen();
  assert.deepEqual([first(recovered).load, first(recovered).reps], ['40', '']);
  await recovered.editSet(id, { load: '40.' });
  assert.equal(first(recovered).load, '40.');
  assert.equal(first(recovered).status, 'editing');
  assert.equal(await recovered.setPerformed(id, true), false);
  assert.equal(first(recovered).performed, false);
});

test('failed checks roll back, can retry, and valid corrections preserve performed status', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  await training.editSet(id, { load: '40', reps: '6' });
  control.failNextCommit();
  assert.equal(await training.setPerformed(id, true), false);
  assert.equal(first(training).performed, false);
  assert.equal(first(training).status, 'failed');
  assert.equal(await training.retrySet(id), true);
  assert.equal(first(training).performed, true);
  await training.editSet(id, { load: '42.50', reps: '7' });
  assert.equal(first(training).performed, true);
  assert.deepEqual([first(await reopen()).load, first(training).reps], ['42.50', '7']);
});

test('checking during a pending save keeps the check when a newer edit follows', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  const hold = control.holdNextCommit();
  const edit = training.editSet(id, { load: '40', reps: '6' });
  await hold.entered;
  const check = training.setPerformed(id, true);
  const correction = training.editSet(id, { reps: '7' });
  hold.release();
  await Promise.all([edit, check, correction]);
  const row = first(await reopen());
  assert.deepEqual([row.load, row.reps, row.performed], ['40', '7', true]);
});

test('clearing required reps unchecks a set without blur and retains its load', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  await training.editSet(id, { load: '40', reps: '6' });
  await training.setPerformed(id, true);
  await training.editSet(id, { reps: '' });
  assert.equal(first(training).performed, false);
  const row = first(await reopen());
  assert.deepEqual([row.load, row.reps, row.performed], ['40', '', false]);
});

test('a failed check remains unchecked after reopening', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  await training.editSet(id, { load: '40', reps: '6' });
  control.failNextCommit();
  await training.setPerformed(id, true);
  assert.equal(first(await reopen()).performed, false);
});

test('concurrent starts cannot replace the active workout or create two active workouts', async (t) => {
  const { training, path, reopen } = await fixture(t);
  const other = await openTraining(await openNodeDatabase(path));
  t.after(() => other.close());
  const results = await Promise.allSettled([
    training.start(upperStarter),
    other.start({ ...upperStarter, id: 'another-plan', title: 'Another plan' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled' && result.value).length, 1);
  const winner = results[0].status === 'fulfilled' && results[0].value ? upperStarter.title : 'Another plan';
  assert.equal((await reopen()).getSnapshot().workout!.title, winner);
});

test('a failed start rolls back the entire routine snapshot and can be retried', async (t) => {
  const { training, control, reopen } = await fixture(t);
  control.failNextCommit();
  await assert.rejects(training.start(upperStarter));
  assert.equal(training.getSnapshot().workout, null);
  const recovered = await reopen();
  assert.equal(recovered.getSnapshot().workout, null);
  assert.equal(await recovered.start(upperStarter), true);
  assert.equal(recovered.getSnapshot().workout!.exercises.length, 3);
});

test('acknowledged checked values survive a process exit without closing storage', async (t) => {
  const { training, path, reopen } = await fixture(t);
  await training.close();
  // Child intentionally exits after acknowledgement, without Training.close().
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, [join(__dirname, 'acknowledge-and-exit.js'), path], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /acknowledged/);
  const row = first(await reopen());
  assert.deepEqual([row.load, row.reps, row.performed], ['40', '6', true]);
});

test('published snapshots stay stable while the next input is being saved', async (t) => {
  const { training } = await fixture(t);
  await training.start(upperStarter);
  const before = training.getSnapshot();
  await training.editSet(first(training).id, { load: '40', reps: '6' });
  assert.deepEqual([before.workout!.exercises[0].sets[0].load, before.workout!.exercises[0].sets[0].reps], ['', '']);
});

test('explicit uncheck works while incomplete text is being edited', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  await training.editSet(id, { load: '40', reps: '6' });
  await training.setPerformed(id, true);
  await training.editSet(id, { load: '40.' });
  assert.equal(await training.setPerformed(id, false), true);
  assert.equal(first(training).performed, false);
  assert.equal(first(training).load, '40.');
  assert.equal(first(training).status, 'editing');
  const row = first(await reopen());
  assert.deepEqual([row.load, row.reps, row.performed], ['40', '6', false]);
});

test('clearing reps during a pending check saves it unfinished without blur', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  await training.editSet(id, { load: '40', reps: '6' });
  const hold = control.holdNextCommit();
  const check = training.setPerformed(id, true);
  await hold.entered;
  const clear = training.editSet(id, { reps: '' });
  hold.release();
  await check;
  await clear;
  assert.equal(first(training).status, 'saved');
  assert.equal(first(training).reps, '');
  assert.equal(first(training).performed, false);
  const row = first(await reopen());
  assert.deepEqual([row.load, row.reps, row.performed], ['40', '', false]);
});

test('a newer edit made during a failing write remains available for Retry', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  await training.editSet(id, { load: '35', reps: '6' });
  const hold = control.holdNextCommit({ fail: true });
  const older = training.editSet(id, { load: '40' });
  await hold.entered;
  const newer = training.editSet(id, { load: '45' });
  control.failNextCommit();
  hold.release();
  assert.equal(await older, false);
  assert.equal(first(training).load, '45');
  assert.equal(await newer, false);
  assert.equal(first(training).status, 'failed');
  assert.equal(await training.retrySet(id), true);
  assert.equal(first(await reopen()).load, '45');
});

test('a confirmed replacement starts a fresh routine snapshot and survives reopening', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  const original = training.getSnapshot().workout!;
  await training.editSet(first(training).id, { load: '40', reps: '6' });
  await training.setPerformed(first(training).id, true);
  const selected = { ...upperStarter, id: 'selected-routine', title: 'Selected routine' };
  assert.equal(await training.replaceActiveWorkout(selected, original.id), true);
  const replacement = training.getSnapshot().workout!;
  assert.notEqual(replacement.id, original.id);
  assert.equal(replacement.title, 'Selected routine');
  assert.deepEqual([first(training).load, first(training).reps, first(training).performed], ['', '', false]);
  assert.equal((await reopen()).getSnapshot().workout!.id, replacement.id);
});

test('save feedback and Retry remain available away from the set row and use the latest values', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  const hold = control.holdNextCommit({ fail: true });
  const saving = training.editSet(id, { load: '40', reps: '6' });
  await hold.entered;
  assert.equal(training.getSnapshot().saveStatus, 'saving');
  hold.release();
  await saving;
  assert.equal(training.getSnapshot().saveStatus, 'failed');
  control.failNextCommit();
  await training.editSet(id, { load: '45' });
  assert.equal(await training.retryFailedSaves(), true);
  assert.equal(training.getSnapshot().saveStatus, 'saved');
  assert.equal(first(await reopen()).load, '45');
});

test('a failed replacement preserves the original workout, checks, and incomplete text for retry', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  await training.editSet(id, { load: '40', reps: '6' });
  await training.setPerformed(id, true);
  await training.editSet(id, { load: '40.' });
  const original = training.getSnapshot();
  control.failNextCommit();
  await assert.rejects(training.replaceActiveWorkout({ ...upperStarter, title: 'Replacement' }, original.workout!.id));
  assert.deepEqual(training.getSnapshot(), original);
  const recovered = await reopen();
  assert.equal(recovered.getSnapshot().workout!.id, original.workout!.id);
  assert.deepEqual([first(recovered).load, first(recovered).reps, first(recovered).performed], ['40', '6', true]);
  assert.equal(await recovered.replaceActiveWorkout(upperStarter, original.workout!.id), true);
});

test('edits queued for the discarded workout cannot acknowledge a save after replacement', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const original = training.getSnapshot().workout!;
  const id = first(training).id;
  const hold = control.holdNextCommit();
  const replace = training.replaceActiveWorkout(upperStarter, original.id);
  await hold.entered;
  const lateEdit = training.editSet(id, { load: '45', reps: '7' });
  hold.release();
  assert.equal(await replace, true);
  assert.equal(await lateEdit, false);
  const recovered = await reopen();
  assert.notEqual(recovered.getSnapshot().workout!.id, original.id);
  assert.deepEqual([first(recovered).load, first(recovered).reps, first(recovered).performed], ['', '', false]);
});

test('a second start leaves saved results and incomplete input intact until replacement is confirmed', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  await training.editSet(first(training).id, { load: '40', reps: '6' });
  await training.setPerformed(first(training).id, true);
  await training.editSet(first(training).id, { load: '40.' });
  const original = training.getSnapshot();
  assert.equal(await training.start({ ...upperStarter, title: 'Another routine' }), false);
  assert.deepEqual(training.getSnapshot(), original);
  // Resume or Cancel in the choice UI issues no replacement command.
  assert.equal(first(training).load, '40.');
  const recovered = await reopen();
  assert.equal(recovered.getSnapshot().workout!.id, original.workout!.id);
  assert.deepEqual([first(recovered).load, first(recovered).reps, first(recovered).performed], ['40', '6', true]);
});

test('a confirmation for an older workout cannot discard its replacement', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  const originalId = training.getSnapshot().workout!.id;
  await training.replaceActiveWorkout({ ...upperStarter, title: 'First replacement' }, originalId);
  const replacementId = training.getSnapshot().workout!.id;
  await assert.rejects(training.replaceActiveWorkout({ ...upperStarter, title: 'Stale request' }, originalId));
  assert.equal(training.getSnapshot().workout!.id, replacementId);
  assert.equal((await reopen()).getSnapshot().workout!.title, 'First replacement');
});

test('failed replacement leaves edits queued during the attempt attached to the original workout', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const originalId = training.getSnapshot().workout!.id;
  const id = first(training).id;
  const hold = control.holdNextCommit({ fail: true });
  const replace = training.replaceActiveWorkout(upperStarter, originalId);
  const rejected = assert.rejects(replace);
  await hold.entered;
  const edit = training.editSet(id, { load: '45', reps: '7' });
  hold.release();
  await rejected;
  assert.equal(await edit, true);
  const recovered = await reopen();
  assert.equal(recovered.getSnapshot().workout!.id, originalId);
  assert.deepEqual([first(recovered).load, first(recovered).reps], ['45', '7']);
});

test('an incomplete decimal remains unsaved on blur after older and other-row writes finish', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  await training.editSet(id, { load: '40', reps: '6' });
  const hold = control.holdNextCommit();
  const older = training.editSet(id, { load: '45' });
  await hold.entered;
  await training.editSet(id, { load: '45.' });
  await training.blurSet(id);
  assert.equal(training.getSnapshot().saveStatus, 'editing');
  hold.release();
  await older;
  const other = training.getSnapshot().workout!.exercises[0].sets[1];
  await training.editSet(other.id, { load: '50', reps: '7' });
  assert.deepEqual([first(training).load, first(training).status, training.getSnapshot().saveStatus], ['45.', 'editing', 'editing']);
  const recovered = await reopen();
  assert.deepEqual([first(recovered).load, first(recovered).reps], ['45', '6']);
});

test('incomplete entries are identified before checking without misreporting saved values as unsaved', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const id = first(training).id;
  const hold = control.holdNextCommit();
  const saving = training.editSet(id, { load: '40' });
  await hold.entered;
  assert.equal(await training.setPerformed(id, true), false);
  assert.equal(first(training).status, 'saving');
  hold.release();
  await saving;
  assert.equal(first(training).inputState, 'incomplete');
  assert.equal(training.getSnapshot().hasIncompleteInput, true);
  assert.equal(first(training).status, 'saved');
  assert.equal(await training.setPerformed(id, true), false);
  assert.equal(first(training).status, 'saved');
  const recovered = await reopen();
  assert.deepEqual([first(recovered).load, first(recovered).reps, first(recovered).performed], ['40', '', false]);
  assert.equal(first(recovered).inputState, 'incomplete');
});
