import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';

import { openTraining } from '../../src/training/workout';
import { upperStarter } from '../../src/training/routines';
import { controlCommits, openNodeDatabase } from './node-database';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'ultra-adapt-'));
  const path = join(directory, 'training.db');
  const control = controlCommits(await openNodeDatabase(path));
  let training = await openTraining(control.database);
  t.after(async () => { await training.close(); await rm(directory, { recursive: true, force: true }); });
  return { training, control, async reopen() {
    await training.close(); training = await openTraining(await openNodeDatabase(path)); return training;
  } };
}

test('an empty workout can select an offline exercise and recover it after reopen', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start();
  const id = training.getSnapshot().workout!.id;
  assert.equal(training.searchExercises('  BENCH (barbell) ')[0].id, 'bench-press-barbell');
  assert.deepEqual(training.searchExercises('no such exercise xyz'), []);
  await training.adaptWorkout(id, { type: 'add-exercise', catalogueId: 'bench-press-barbell' });
  const workout = (await reopen()).getSnapshot().workout!;
  assert.equal(workout.id, id);
  assert.equal(workout.exercises[0].exerciseId, 'bench-press-barbell');
  assert.deepEqual(workout.exercises[0].sets.map((set) => [set.load, set.reps, set.performed]), [['', '', false]]);
});

test('routine exercises and sets can be reordered, added, reset, replaced and removed without changing the routine', async (t) => {
  const { training, reopen } = await fixture(t);
  const routineBefore = structuredClone(upperStarter);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const [first, second, third] = workout.exercises;
  const [a, b] = first.sets;
  await training.editSet(a.id, { load: '40', reps: '6' });
  await training.setPerformed(a.id, true);
  await training.adaptWorkout(workout.id, { type: 'move-exercise', exerciseId: third.id, direction: -1 });
  await training.adaptWorkout(workout.id, { type: 'move-set', exerciseId: first.id, setId: b.id, direction: -1 });
  await training.adaptWorkout(workout.id, { type: 'add-set', exerciseId: first.id });
  let sets = training.getSnapshot().workout!.exercises[0].sets;
  assert.deepEqual(sets.map((set) => set.performed), [false, true, false]);
  const addedId = sets[2].id;
  await training.adaptWorkout(workout.id, { type: 'replace-set', exerciseId: first.id, setId: b.id });
  sets = training.getSnapshot().workout!.exercises[0].sets;
  assert.notEqual(sets[0].id, b.id);
  await training.adaptWorkout(workout.id, { type: 'remove-set', exerciseId: first.id, setId: addedId });
  await training.adaptWorkout(workout.id, { type: 'replace-exercise', exerciseId: second.id, catalogueId: 'bench-press-barbell' });
  await training.adaptWorkout(workout.id, { type: 'remove-exercise', exerciseId: third.id });
  const recovered = (await reopen()).getSnapshot().workout!;
  assert.deepEqual(recovered.exercises.map((exercise) => exercise.exerciseId), ['lat-pulldown', 'bench-press-barbell']);
  assert.deepEqual(recovered.exercises[0].sets.map((set) => [set.load, set.reps, set.performed]), [['', '', false], ['40', '6', true]]);
  assert.deepEqual(recovered.exercises[1].sets.map((set) => [set.load, set.reps, set.performed]), [['', '', false], ['', '', false]]);
  assert.deepEqual(upperStarter, routineBefore);
});

test('catalogue covers every training example and UPPER movement without custom exercises', async (t) => {
  const { training } = await fixture(t);
  const names = ['Bench Press (Barbell)', 'Bicep Curl (Cable)', 'Bulgarian Split Squat (Dumbbell)', 'Chest Dip', 'Chest Fly (Machine)',
    'Face Pull', 'Lat Pulldown (Cable)', 'Leg Extension (Machine)', 'Overhead Press (Barbell)', 'Preacher Curl (Machine)',
    'Pull Up (Assisted)', 'Seated Cable Row - V Grip (Cable)', 'Seated Leg Curl (Machine)', 'Single Arm Lateral Raise (Cable)',
    'Squat (Smith Machine)', 'Triceps Pushdown', 'Pull-up', 'Chest press machine', 'Rear delt reverse fly machine'];
  for (const name of names) assert.ok(training.searchExercises(name).length > 0, name);
});

test('unsupported entry modes cannot be accidentally logged as weighted sets', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start();
  const id = training.getSnapshot().workout!.id;
  await training.adaptWorkout(id, { type: 'add-exercise', catalogueId: 'assisted-pull-up' });
  const set = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.equal(await training.editSet(set.id, { load: '0', reps: '6' }), false);
  assert.equal(await training.setPerformed(set.id, true), false);
  const recovered = (await reopen()).getSnapshot().workout!.exercises[0];
  assert.equal(recovered.entryMode, 'assisted');
  assert.equal(recovered.sets[0].performed, false);
});

test('failed structural saves retain unchecked raw drafts; retry moves them without rewriting acknowledged values', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const [first, second] = workout.exercises;
  const set = first.sets[0];
  await training.editSet(set.id, { load: '40', reps: '6' });
  await training.setPerformed(set.id, true);
  await training.editSet(set.id, { load: '40.' });
  const before = training.getSnapshot().workout;
  control.failNextCommit();
  await assert.rejects(training.adaptWorkout(workout.id, { type: 'remove-exercise', exerciseId: first.id }));
  assert.deepEqual(training.getSnapshot().workout, before);
  await training.adaptWorkout(workout.id, { type: 'move-exercise', exerciseId: second.id, direction: -1 });
  const moved = training.getSnapshot().workout!.exercises[1].sets[0];
  assert.deepEqual([moved.id, moved.load, moved.performed, moved.status], [set.id, '40.', false, 'editing']);
  const recovered = (await reopen()).getSnapshot().workout!.exercises[1].sets[0];
  assert.deepEqual([recovered.id, recovered.load, recovered.performed], [set.id, '40', false]);
});

test('adaptation waits for queued checks and does not publish topology before commit', async (t) => {
  const { training, control, reopen } = await fixture(t);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const [first, second] = workout.exercises;
  await training.editSet(first.sets[0].id, { load: '40', reps: '6' });
  const holdCheck = control.holdNextCommit();
  const checking = training.setPerformed(first.sets[0].id, true);
  await holdCheck.entered;
  const change = training.adaptWorkout(workout.id, { type: 'move-exercise', exerciseId: second.id, direction: -1 });
  const holdChange = control.holdNextCommit();
  holdCheck.release();
  await checking;
  await holdChange.entered;
  assert.equal(training.getSnapshot().isAdapting, true);
  assert.equal(training.getSnapshot().workout!.exercises[0].id, first.id);
  assert.equal(await training.editSet(first.sets[0].id, { load: '45' }), false);
  holdChange.release();
  await change;
  const recovered = (await reopen()).getSnapshot().workout!.exercises[1];
  assert.deepEqual([recovered.sets[0].load, recovered.sets[0].performed], ['40', true]);
});

test('removed IDs are never reused and stale changes cannot alter a replacement workout', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const first = workout.exercises[0];
  await training.adaptWorkout(workout.id, { type: 'remove-exercise', exerciseId: first.id });
  await training.adaptWorkout(workout.id, { type: 'add-exercise', catalogueId: 'lat-pulldown' });
  const added = training.getSnapshot().workout!.exercises[2];
  assert.notEqual(added.id, first.id);
  await assert.rejects(training.adaptWorkout(workout.id, { type: 'remove-exercise', exerciseId: first.id }));
  await training.replaceActiveWorkout(upperStarter, workout.id);
  await assert.rejects(training.adaptWorkout(workout.id, { type: 'remove-exercise', exerciseId: added.id }));
  const recovered = (await reopen()).getSnapshot().workout!;
  assert.notEqual(recovered.id, workout.id);
  assert.equal(recovered.exercises.length, 3);
});

test('all sets and exercises may be removed and an empty workout can be rebuilt', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start();
  const id = training.getSnapshot().workout!.id;
  await training.adaptWorkout(id, { type: 'add-exercise', catalogueId: 'bench-press-barbell' });
  let exercise = training.getSnapshot().workout!.exercises[0];
  await training.adaptWorkout(id, { type: 'remove-set', exerciseId: exercise.id, setId: exercise.sets[0].id });
  assert.equal(training.getSnapshot().workout!.exercises[0].sets.length, 0);
  await training.adaptWorkout(id, { type: 'add-set', exerciseId: exercise.id });
  await training.adaptWorkout(id, { type: 'remove-exercise', exerciseId: exercise.id });
  await training.adaptWorkout(id, { type: 'add-exercise', catalogueId: 'bench-press-barbell' });
  exercise = (await reopen()).getSnapshot().workout!.exercises[0];
  assert.equal(exercise.sets.length, 1);
  assert.equal(exercise.sets[0].load, '');
});

test('late input events for removed sets cannot save or check another row', async (t) => {
  const { training, reopen } = await fixture(t);
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const exercise = workout.exercises[0];
  const id = exercise.sets[0].id;
  await training.adaptWorkout(workout.id, { type: 'remove-set', exerciseId: exercise.id, setId: id });
  assert.equal(await training.blurSet(id), false);
  assert.equal(await training.editSet(id, { load: '45', reps: '6' }), false);
  assert.equal(await training.setPerformed(id, true), false);
  assert.equal((await reopen()).getSnapshot().workout!.exercises[0].sets[0].load, '');
});
