import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openTraining } from '../../src/training/workout';
import { upperStarter } from '../../src/training/routines';
import { controlCommits, openNodeDatabase } from './node-database';

test('routine drafts recover, save beyond four, and edits and deletion preserve workout snapshots', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-routine-'));
  const path = join(dir, 'training.db');
  let training = await openTraining(await openNodeDatabase(path));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const reopen = async () => { await training.close(); training = await openTraining(await openNodeDatabase(path)); };
  const draft = { ...upperStarter, id: 'one', title: 'One', exercises: [{ ...upperStarter.exercises[0], restSeconds: 75, sets: [{ type: 'warmup' as const, targetMin: 3, targetMax: 5 }] }] };
  await training.saveRoutineDraft(JSON.stringify(draft));
  await reopen();
  assert.deepEqual(JSON.parse(training.getSnapshot().routineDraft!), draft);
  for (let n = 0; n < 5; n++) await training.saveRoutine({ ...draft, id: `routine-${n}`, title: `Routine ${n}` });
  assert.equal(training.getSnapshot().routines.length, 6);
  const original = training.getSnapshot().routines.find((r) => r.id === 'routine-0')!;
  await training.start(original);
  const workout = training.getSnapshot().workout!;
  await training.saveRoutine({ ...original, title: 'Changed', exercises: [upperStarter.exercises[1]] });
  await training.deleteRoutine(original.id);
  await reopen();
  assert.equal(training.getSnapshot().workout!.title, 'Routine 0');
  assert.equal(training.getSnapshot().workout!.exercises[0].restSeconds, 75);
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].type, 'warmup');
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].targetMax, 5);
  assert.equal(training.getSnapshot().routines.some((r) => r.id === original.id), false);
});

test('each of five routines starts with its ordered prescription, and a completed record survives deletion', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-plans-'));
  const path = join(dir, 'training.db');
  let training = await openTraining(await openNodeDatabase(path));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const plan = { ...upperStarter, exercises: [upperStarter.exercises[2], { ...upperStarter.exercises[0], restSeconds: 95, sets: [{ type: 'drop' as const, targetMin: 8, targetMax: 12 }] }] };
  for (let n = 0; n < 5; n++) await training.saveRoutine({ ...plan, id: `plan-${n}`, title: `Plan ${n}` });
  let completed = '';
  for (let n = 0; n < 5; n++) {
    const routine = training.getSnapshot().routines.find((item) => item.id === `plan-${n}`)!;
    assert.equal(await training.start(routine), true);
    const workout = training.getSnapshot().workout!;
    assert.deepEqual(workout.exercises.map((item) => item.exerciseId), ['overhead-press-barbell', 'lat-pulldown']);
    assert.deepEqual(workout.exercises[0].sets.map((set) => [set.type, set.targetMin, set.targetMax]), [['warmup', 4, 6], ['normal', 4, 6], ['normal', 4, 6]]);
    assert.equal(workout.exercises[1].restSeconds, 95);
    assert.equal(workout.exercises[1].sets[0].type, 'drop');
    if (n === 0) {
      const set = workout.exercises[0].sets[0];
      await training.editSet(set.id, { load: '20', reps: '5' });
      await training.setPerformed(set.id, true);
      await training.finishWorkout(workout.id); completed = workout.id;
    } else await training.discardWorkout(workout.id);
  }
  await training.deleteRoutine('plan-0');
  await training.close(); training = await openTraining(await openNodeDatabase(path));
  assert.equal((await training.getCompletedWorkout(completed))!.exercises[1].restSeconds, 95);
  assert.equal(training.getSnapshot().history[0].title, 'Plan 0');
});


test('committing a raw routine draft validates it, preserves invalid input, and saves converted targets', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-routine-draft-'));
  const path = join(dir, 'training.db');
  let training = await openTraining(await openNodeDatabase(path));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const draft = { id: 'draft', title: '  Pull  ', exercises: [{ exerciseId: 'lat-pulldown', name: 'Lat pulldown', loadConvention: 'Machine', entryMode: 'weighted', rest: '75', sets: [{ type: 'drop', min: '8', max: '' }] }] };
  await training.saveRoutineDraft(JSON.stringify(draft));
  await assert.rejects(training.commitRoutineDraft(JSON.stringify(draft)), /valid rep ranges/);
  await assert.rejects(training.commitRoutineDraft(JSON.stringify({ ...draft, exercises: [] })), /exercise/);
  assert.equal(training.getSnapshot().routineDraft, JSON.stringify(draft));
  draft.exercises[0].sets[0].max = '12';
  await training.commitRoutineDraft(JSON.stringify(draft));
  await training.close(); training = await openTraining(await openNodeDatabase(path));
  assert.equal(training.getSnapshot().routineDraft, null);
  const saved = training.getSnapshot().routines.find((routine) => routine.id === 'draft')!;
  assert.equal(saved.title, 'Pull');
  assert.equal(saved.exercises[0].restSeconds, 75);
  assert.deepEqual(saved.exercises[0].sets, [{ type: 'drop', targetMin: 8, targetMax: 12 }]);
  await assert.rejects(training.saveRoutine({ ...saved, exercises: [] }), /exercise/);
});

test('rest override accepts only the timer range and every saved plan can start', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-routine-rest-'));
  const training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const exercise = upperStarter.exercises[0];
  for (const restSeconds of [0, 86401, 1.5]) {
    await assert.rejects(training.saveRoutine({ id: 'invalid', title: 'Invalid', exercises: [{ ...exercise, restSeconds }] }), /rest seconds/);
    const draft = { id: 'invalid', title: 'Invalid', exercises: [{ ...exercise, rest: String(restSeconds), sets: [{ type: 'normal', min: '3', max: '5' }] }] };
    await assert.rejects(training.commitRoutineDraft(JSON.stringify(draft)), /rest seconds/);
  }
  for (const restSeconds of [undefined, 1, 86400]) {
    await training.saveRoutine({ id: 'valid', title: 'Valid', exercises: [{ ...exercise, restSeconds }] });
    assert.equal(await training.start(training.getSnapshot().routines.find((item) => item.id === 'valid')!), true);
    const workout = training.getSnapshot().workout!;
    assert.equal(workout.exercises[0].restSeconds, restSeconds);
    await training.discardWorkout(workout.id);
  }
});


test('a failed routine commit keeps the last saved draft for recovery and retry', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-routine-fail-'));
  const path = join(dir, 'training.db');
  const control = controlCommits(await openNodeDatabase(path));
  let training = await openTraining(control.database);
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const draft = JSON.stringify({ id: 'recover', title: 'Recover', exercises: [{ exerciseId: 'lat-pulldown', name: 'Lat pulldown', loadConvention: 'Machine', rest: '', sets: [{ type: 'normal', min: '5', max: '7' }] }] });
  await training.saveRoutineDraft(draft);
  control.failNextCommit();
  await assert.rejects(training.commitRoutineDraft(draft));
  assert.equal(training.getSnapshot().routineDraft, draft);
  assert.equal(training.getSnapshot().routines.some((routine) => routine.id === 'recover'), false);
  await training.close(); training = await openTraining(await openNodeDatabase(path));
  assert.equal(training.getSnapshot().routineDraft, draft);
  await training.commitRoutineDraft(draft);
  assert.equal(training.getSnapshot().routineDraft, null);
  assert.equal(training.getSnapshot().routines.some((routine) => routine.id === 'recover'), true);
});
