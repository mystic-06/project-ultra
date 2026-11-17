import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openTraining } from '../../src/training/workout';
import { upperStarter } from '../../src/training/routines';
import { controlCommits, openNodeDatabase } from './node-database';

test('history corrections refresh references, preserve current entries, and survive reopening', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'db');
  let training = await openTraining(await openNodeDatabase(path));
  await training.start(upperStarter);
  let row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '45', reps: '7' });
  await training.setPerformed(row.id, true);
  const id = training.getSnapshot().workout!.id;
  await training.finishWorkout(id);
  await training.start(upperStarter);
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '50', reps: '8' });
  const baseline = (await training.getCompletedWorkout(id))!;
  const draft = structuredClone(baseline);
  draft.exercises[0].sets[0].load = '46';
  await training.saveCompletedWorkout(baseline, draft, 'kg');
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.deepEqual([row.previous?.load, row.load, row.reps], ['46', '50', '8']);
  await assert.rejects(training.saveCompletedWorkout(baseline, draft, 'kg'));
  await training.close();
  training = await openTraining(await openNodeDatabase(path));
  assert.equal((await training.getCompletedWorkout(id))!.exercises[0].sets[0].load, '46');
  await training.deleteCompletedWorkout(id);
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].previous, undefined);
  await training.close();
});

test('failed correction and deletion roll back and remain retryable', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-history-failure-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const controlled = controlCommits(await openNodeDatabase(join(dir, 'db')));
  const training = await openTraining(controlled.database);
  await training.start(upperStarter);
  const row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '40', reps: '6' });
  await training.setPerformed(row.id, true);
  const id = training.getSnapshot().workout!.id;
  await training.finishWorkout(id);
  const baseline = (await training.getCompletedWorkout(id))!;
  const draft = structuredClone(baseline);
  draft.exercises[0].sets[0].load = '41';
  controlled.failNextCommit();
  await assert.rejects(training.saveCompletedWorkout(baseline, draft, 'kg'));
  assert.equal((await training.getCompletedWorkout(id))!.exercises[0].sets[0].load, '40');
  assert.equal(draft.exercises[0].sets[0].load, '41');
  await training.saveCompletedWorkout(baseline, draft, 'kg');
  controlled.failNextCommit();
  await assert.rejects(training.deleteCompletedWorkout(id));
  assert.equal((await training.getCompletedWorkout(id))!.exercises[0].sets[0].load, '41');
  await training.deleteCompletedWorkout(id);
  assert.equal(await training.getCompletedWorkout(id), null);
  await training.close();
});

test('history draft invalid edits uncheck immediately and need an explicit valid recheck', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-history-draft-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const training = await openTraining(await openNodeDatabase(join(dir, 'db')));
  await training.start(upperStarter);
  const row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '40', reps: '6' });
  await training.setPerformed(row.id, true);
  const id = training.getSnapshot().workout!.id;
  await training.finishWorkout(id);
  const baseline = (await training.getCompletedWorkout(id))!;
  let draft = training.editCompletedSetDraft(baseline, row.id, { reps: '' }, 'kg');
  assert.equal(draft.exercises[0].sets[0].performed, false);
  draft = training.editCompletedSetDraft(draft, row.id, { performed: true }, 'kg');
  assert.equal(draft.exercises[0].sets[0].performed, false);
  draft = training.editCompletedSetDraft(draft, row.id, { reps: '8' }, 'kg');
  assert.equal(draft.exercises[0].sets[0].performed, false);
  draft = training.editCompletedSetDraft(draft, row.id, { performed: true }, 'kg');
  assert.equal(draft.exercises[0].sets[0].performed, true);
  assert.equal((await training.getCompletedWorkout(id))!.exercises[0].sets[0].reps, '6');
  await training.saveCompletedWorkout(baseline, draft, 'kg');
  assert.equal((await training.getCompletedWorkout(id))!.exercises[0].sets[0].reps, '8');
  await training.close();
});

test('history rejects changes to fields unavailable for the measurement mode', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-history-hidden-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const training = await openTraining(await openNodeDatabase(join(dir, 'db')));
  await training.start(upperStarter);
  const row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '40', reps: '6' });
  await training.setPerformed(row.id, true);
  const id = training.getSnapshot().workout!.id;
  await training.finishWorkout(id);
  const baseline = (await training.getCompletedWorkout(id))!;
  for (const patch of [{ assistance: '3' }, { repsLeft: '3' }, { repsRight: '3' }]) {
    const forged = structuredClone(baseline);
    Object.assign(forged.exercises[0].sets[0], patch);
    await assert.rejects(training.saveCompletedWorkout(baseline, forged, 'kg'), /measurement is unavailable/);
  }
  assert.equal((await training.getCompletedWorkout(id))!.exercises[0].sets[0].load, '40');
  await training.close();
});
