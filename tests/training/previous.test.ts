import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openTraining } from '../../src/training/workout';
import { upperStarter } from '../../src/training/routines';
import { openNodeDatabase } from './node-database';

test('previous performed results survive reopening and copy only on request', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'db');
  let training = await openTraining(await openNodeDatabase(path));
  await training.start(upperStarter);
  let row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '45', reps: '7', rpe: '8.5' });
  await training.setPerformed(row.id, true);
  await training.finishWorkout(training.getSnapshot().workout!.id);
  await training.start(upperStarter);
  await training.close();
  training = await openTraining(await openNodeDatabase(path));
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.deepEqual([row.previous?.load, row.previous?.reps, row.previous?.rpe, row.load], ['45', '7', '8.5', '']);
  await training.editSet(row.id, { rpe: '9' });
  assert.equal(await training.copyPrevious(row.id, false), true);
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.deepEqual([row.load, row.reps, row.rpe, row.performed], ['45', '7', '9', false]);
  await training.editSet(row.id, { load: '50' });
  assert.equal(await training.copyPrevious(row.id, false), false);
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].load, '50');
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.equal(await training.copyPrevious(row.id, true, { reference: row.previous!.reference, revision: row.revision }), true);
  await training.close();
});

test('matching uses the latest workout and type order across repeated exercises without older fallback', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let now = 0;
  const training = await openTraining(await openNodeDatabase(join(dir, 'db')), () => ++now);
  const exercise = upperStarter.exercises[0];
  const routine = { id: 'repeat', title: 'Repeat', exercises: [exercise, exercise] };
  await training.start(routine);
  let rows = training.getSnapshot().workout!.exercises.flatMap((entry) => entry.sets);
  for (const [index, row] of rows.entries()) {
    await training.editSet(row.id, { load: String(10 + index), reps: '5' });
    await training.setPerformed(row.id, true);
  }
  await training.finishWorkout(training.getSnapshot().workout!.id);
  await training.start(routine);
  rows = training.getSnapshot().workout!.exercises.flatMap((entry) => entry.sets);
  assert.deepEqual(rows.map((row) => row.previous?.load), ['10', '11', '12', '13']);
  await training.editSet(rows[0].id, { type: 'warmup', load: '30', reps: '6' });
  await training.setPerformed(rows[0].id, true);
  await training.finishWorkout(training.getSnapshot().workout!.id);
  await training.start(routine);
  rows = training.getSnapshot().workout!.exercises.flatMap((entry) => entry.sets);
  assert.deepEqual(rows.map((row) => row.previous), [undefined, undefined, undefined, undefined]);
  await training.editSet(rows[1].id, { type: 'warmup' });
  rows = training.getSnapshot().workout!.exercises.flatMap((entry) => entry.sets);
  assert.equal(rows[1].previous?.load, '30');
  await training.close();
});

test('equipment matching stays separate and copied original measurements survive unit changes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'db');
  let now = 0;
  let training = await openTraining(await openNodeDatabase(path), () => ++now);
  const setupA = await training.createEquipmentSetup({ label: 'A', gym: null, ratio: null });
  const setupB = await training.createEquipmentSetup({ label: 'B', gym: null, ratio: null });
  await training.start(upperStarter);
  let exercise = training.getSnapshot().workout!.exercises[0];
  await training.selectEquipmentSetup(exercise.id, setupA.id);
  await training.setLoadUnit('lb');
  await training.editSet(exercise.sets[0].id, { load: '100', reps: '6' });
  await training.setPerformed(exercise.sets[0].id, true);
  await training.selectEquipmentSetup(exercise.id, setupB.id);
  await training.editSet(exercise.sets[1].id, { load: '60', reps: '9' });
  await training.setPerformed(exercise.sets[1].id, true);
  await training.finishWorkout(training.getSnapshot().workout!.id);
  await training.setLoadUnit('kg');
  await training.start(upperStarter);
  exercise = training.getSnapshot().workout!.exercises[0];
  assert.equal(exercise.sets[0].previous?.load, '27.22');
  await training.selectEquipmentSetup(exercise.id, setupA.id);
  exercise = training.getSnapshot().workout!.exercises[0];
  assert.equal(exercise.sets[0].previous?.load, '45.36');
  assert.equal(exercise.sets[1].previous, undefined);
  await training.copyPrevious(exercise.sets[0].id, false);
  await training.close();
  training = await openTraining(await openNodeDatabase(path), () => ++now);
  await training.setLoadUnit('lb');
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].load, '100');
  await training.close();
});

test('incompatible previous values do not overwrite a checked set', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const training = await openTraining(await openNodeDatabase(join(dir, 'db')));
  const base = upperStarter.exercises[0];
  await training.start({ id: 'old', title: 'Old', exercises: [base] });
  let row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '40', reps: '6' });
  await training.setPerformed(row.id, true);
  await training.finishWorkout(training.getSnapshot().workout!.id);
  await training.start({ id: 'new', title: 'New', exercises: [{ ...base, entryMode: 'unilateral' }] });
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '50', repsLeft: '5', repsRight: '4', rpe: '9' });
  await training.setPerformed(row.id, true);
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.equal(await training.copyPrevious(row.id, true, { reference: row.previous!.reference, revision: row.revision }), false);
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.deepEqual([row.load, row.repsLeft, row.repsRight, row.rpe, row.performed], ['50', '5', '4', '9', true]);
  assert.match(row.error!, /different measurement/);
  await training.close();
});

test('finish performs no fallible reads after committing completion', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'db');
  const db = await openNodeDatabase(path);
  let arm = false;
  let committed = false;
  const training = await openTraining({ ...db,
    async exec(sql) { await db.exec(sql); if (arm && sql === 'COMMIT') committed = true; },
    async all<T>(sql: string, params?: import('../../src/training/database').SqlValue[]) {
      if (committed) throw new Error('injected post-commit read failure');
      return db.all<T>(sql, params);
    },
  });
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const id = workout.exercises[0].sets[0].id;
  await training.editSet(id, { load: '10', reps: '5' });
  await training.setPerformed(id, true);
  arm = true;
  await training.finishWorkout(workout.id);
  assert.equal(training.getSnapshot().workout, null);
  assert.equal(training.getSnapshot().history[0].id, workout.id);
  await training.close();
  const reopened = await openTraining(await openNodeDatabase(path));
  assert.equal(reopened.getSnapshot().workout, null);
  assert.equal(reopened.getSnapshot().history[0].id, workout.id);
  await reopened.close();
});

test('equal completion timestamps choose the greatest workout id', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const training = await openTraining(await openNodeDatabase(join(dir, 'db')), () => 1234);
  const ids: string[] = [];
  for (const load of ['10', '20']) {
    await training.start(upperStarter);
    const workout = training.getSnapshot().workout!;
    ids.push(workout.id);
    await training.editSet(workout.exercises[0].sets[0].id, { load, reps: '5' });
    await training.setPerformed(workout.exercises[0].sets[0].id, true);
    await training.finishWorkout(workout.id);
  }
  await training.start(upperStarter);
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].previous?.load, ids[0] > ids[1] ? '10' : '20');
  await training.close();
});

test('overwrite confirmation becomes stale when the destination changes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const training = await openTraining(await openNodeDatabase(join(dir, 'db')));
  await training.start(upperStarter);
  let row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '10', reps: '5' });
  await training.setPerformed(row.id, true);
  await training.finishWorkout(training.getSnapshot().workout!.id);
  await training.start(upperStarter);
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '20', reps: '5' });
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  const confirmation = { reference: row.previous!.reference, revision: row.revision };
  await training.editSet(row.id, { load: '30' });
  assert.equal(await training.copyPrevious(row.id, true, confirmation), false);
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].load, '30');
  await training.close();
});

test('a projection read failure rolls back an equipment selection', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'db');
  const db = await openNodeDatabase(path);
  let fail = false;
  const training = await openTraining({ ...db, async all<T>(sql: string, params?: import('../../src/training/database').SqlValue[]) {
    if (fail && sql.includes('SELECT w.id FROM workout_exercises')) throw new Error('injected projection failure');
    return db.all<T>(sql, params);
  } });
  const setup = await training.createEquipmentSetup({ label: 'A', gym: null, ratio: null });
  await training.start(upperStarter);
  const exercise = training.getSnapshot().workout!.exercises[0];
  fail = true;
  await assert.rejects(training.selectEquipmentSetup(exercise.id, setup.id));
  assert.equal(training.getSnapshot().workout!.exercises[0].equipmentSetupId, null);
  fail = false;
  await training.close();
  const reopened = await openTraining(await openNodeDatabase(path));
  assert.equal(reopened.getSnapshot().workout!.exercises[0].equipmentSetupId, null);
  await reopened.close();
});

test('bodyweight references retain their calculated load while copy only changes added load and reps', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-bodyweight-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'db');
  let training = await openTraining(await openNodeDatabase(path));
  await training.setLoadUnit('lb');
  await training.start();
  const id = training.getSnapshot().workout!.id;
  await training.adaptWorkout(id, { type: 'add-exercise', catalogueId: 'pull-up' });
  let exercise = training.getSnapshot().workout!.exercises[0];
  await training.setWorkoutBodyweight(exercise.id, '180');
  await training.setExerciseFraction(exercise.id, 0.5);
  await training.editSet(exercise.sets[0].id, { load: '10', reps: '8' });
  await training.setPerformed(exercise.sets[0].id, true);
  await training.finishWorkout(id);
  await training.setLoadUnit('kg');
  await training.start();
  await training.adaptWorkout(training.getSnapshot().workout!.id, { type: 'add-exercise', catalogueId: 'pull-up' });
  exercise = training.getSnapshot().workout!.exercises[0];
  await training.setWorkoutBodyweight(exercise.id, '70');
  await training.setExerciseFraction(exercise.id, 0.7);
  let row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.equal(row.previous?.bodyweightLoad, '40.82');
  assert.equal(row.previous?.load, '4.54');
  assert.equal(await training.copyPrevious(row.id, false), true);
  await training.close();
  training = await openTraining(await openNodeDatabase(path));
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.deepEqual([row.load, row.reps, row.bodyweight, row.bodyweightFraction, row.bodyweightLoad], ['4.54', '8', '70', 0.7, 49]);
  await training.close();
});

test('copy refuses incompatible historical measurement definitions', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-previous-definition-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const training = await openTraining(await openNodeDatabase(join(dir, 'db')));
  const base = upperStarter.exercises[0];
  await training.start({ id: 'old', title: 'Old', exercises: [base] });
  let row = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(row.id, { load: '100', reps: '8' });
  await training.setPerformed(row.id, true);
  await training.finishWorkout(training.getSnapshot().workout!.id);
  await training.start({ id: 'new', title: 'New', exercises: [{ ...base, entryMode: 'bodyweight' }] });
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.equal(await training.copyPrevious(row.id, false), false);
  row = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.deepEqual([row.load, row.reps], ['', '']);
  assert.match(row.error!, /different measurement/);
  await training.close();
});
