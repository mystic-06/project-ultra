import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openTraining } from '../../src/training/workout';
import { decodeRoutineDraft, upperStarter } from '../../src/training/routines';
import { controlCommits, openNodeDatabase } from './node-database';

test('export captures acknowledged training, drafts, and archived equipment in one versioned file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-backup-'));
  let training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const setup = await training.createEquipmentSetup({ label: 'Cable', gym: null, ratio: '2' });
  await training.saveRoutineDraft('{"unfinished":');
  const lease = await training.beginCustomDraft('{"id":"custom-draft","name":""}');
  await training.saveCustomDraft('{"id":"custom-draft","name":""}', lease);
  await training.start(upperStarter);
  const exercise = training.getSnapshot().workout!.exercises[0];
  await training.selectEquipmentSetup(exercise.id, setup.id);
  await training.archiveEquipmentSetup(setup.id, true);
  const set = exercise.sets[0];
  await training.editSet(set.id, { load: '20', reps: '5' });
  await training.setPerformed(set.id, true);
  const unchecked = exercise.sets[1];
  await training.editSet(unchecked.id, { load: '10', reps: '3' });
  await training.editSet(unchecked.id, { load: '10.' });
  const backup = await training.exportBackup();
  assert.equal(backup.version, 1);
  assert.equal(backup.data.routine_draft[0].data, '{"unfinished":');
  assert.equal(backup.data.custom_draft[0].data, '{"id":"custom-draft","name":""}');
  assert.equal(backup.data.equipment_setups[0].archived, 1);
  assert.equal(backup.data.equipment_last_selection[0].setup_id, setup.id);
  assert.equal(backup.data.workout_sets.find(row => row.id === set.id)?.performed, 1);
  assert.equal(backup.data.workout_sets.find(row => row.id === unchecked.id)?.load, '10');
  assert.equal(backup.data.workout_sets.find(row => row.id === unchecked.id)?.performed, 0);
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[1].load, '10.');
  await training.close(); training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].performed, true);
});

test('export preserves deleted starter and custom exercise ordering across reopen', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-backup-empty-'));
  let training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  await training.deleteRoutine(upperStarter.id);
  const custom = JSON.stringify({ id: 'custom-z', name: 'Pull', equipment: 'cable', entryMode: 'weighted', bodyParts: ['back'], fraction: '' });
  await training.commitCustomDraft(custom, await training.beginCustomDraft(custom));
  await training.archiveCustomExercise('custom-z', true);
  await training.close(); training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  const backup = await training.exportBackup();
  assert.deepEqual(backup.data.routines, []);
  assert.equal(backup.data.routine_seed[0].id, 1);
  assert.equal(JSON.parse(backup.data.custom_exercises[0].data as string).archived, true);
});

test('restore replaces acknowledged data atomically and does not resume a timer', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-'));
  const source = await openTraining(await openNodeDatabase(join(dir, 'source.db')), () => 1000);
  let target = await openTraining(await openNodeDatabase(join(dir, 'target.db')), () => 1000);
  t.after(async () => { await source.close(); await target.close(); await rm(dir, { recursive: true, force: true }); });
  await source.setLoadUnit('lb');
  const setup = await source.createEquipmentSetup({ label: 'Cable', gym: 'Gym', ratio: '0.5' });
  await source.start(upperStarter);
  const historicalId = source.getSnapshot().workout!.id;
  await source.selectEquipmentSetup(source.getSnapshot().workout!.exercises[0].id, setup.id);
  const historicalSet = source.getSnapshot().workout!.exercises[0].sets[0];
  await source.editSet(historicalSet.id, { load: '30', reps: '4' });
  await source.setPerformed(historicalSet.id, true);
  await source.finishWorkout(historicalId);
  await source.start(upperStarter);
  await source.selectEquipmentSetup(source.getSnapshot().workout!.exercises[0].id, setup.id);
  await source.archiveEquipmentSetup(setup.id, true);
  const set = source.getSnapshot().workout!.exercises[0].sets[0];
  await source.editSet(set.id, { load: '20', reps: '5' });
  await source.setPerformed(set.id, true);
  const unchecked = source.getSnapshot().workout!.exercises[0].sets[1];
  await source.editSet(unchecked.id, { load: '15', reps: '3' });
  await source.startRest(90);
  await source.saveRoutineDraft('{"unfinished":');
  const backup = await source.exportBackup();
  await target.restoreBackup(backup);
  assert.equal(target.getSnapshot().workout!.exercises[0].sets[0].performed, true);
  assert.equal(target.getSnapshot().routineDraft, '{"unfinished":');
  assert.equal(target.getSnapshot().loadUnit, 'lb');
  assert.equal(target.getSnapshot().equipmentSetups[0].archived, true);
  assert.equal(target.getSnapshot().workout!.exercises[0].sets[1].load, '15');
  assert.equal(target.getSnapshot().workout!.exercises[0].sets[1].performed, false);
  assert.equal(target.getSnapshot().restDeadline, null);
  await target.close();
  target = await openTraining(await openNodeDatabase(join(dir, 'target.db')), () => 1000);
  const active = target.getSnapshot().workout!.exercises[0];
  assert.equal(active.equipmentSetupId, setup.id);
  assert.deepEqual(active.sets.map(s => [s.load, s.performed, s.equipmentSetupId]), [['20', true, setup.id], ['15', false, setup.id]]);
  const historical = await target.getCompletedWorkout(historicalId);
  assert.equal(historical!.exercises[0].equipmentSetupId, setup.id);
  assert.deepEqual([historical!.exercises[0].sets[0].load, historical!.exercises[0].sets[0].performed, historical!.exercises[0].sets[0].equipmentSetupId], ['30', true, setup.id]);
  assert.equal(target.getSnapshot().restDeadline, null);
});


test('invalid files and failed transaction leave the existing workout and raw draft intact', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-failure-'));
  const controlled = controlCommits(await openNodeDatabase(join(dir, 'training.db')));
  let training = await openTraining(controlled.database);
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  await training.start(upperStarter);
  const set = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(set.id, { load: '10.' });
  const backup = await training.exportBackup();
  await assert.rejects(training.restoreBackup({ ...backup, version: 99 }));
  const invalid = structuredClone(backup);
  invalid.data.workout_sets[0].workout_exercise_id = 'missing';
  await assert.rejects(training.restoreBackup(invalid));
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].load, '10.');
  controlled.failNextCommit();
  await assert.rejects(training.restoreBackup(backup));
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].load, '10.');
  await training.close();
  training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  assert.equal(training.getSnapshot().workout!.id, backup.data.workouts[0].id);
});


test('a timer request during restore cannot start after replacement', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-timer-'));
  const controlled = controlCommits(await openNodeDatabase(join(dir, 'training.db')));
  const training = await openTraining(controlled.database, () => 1000);
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  await training.start(upperStarter);
  const backup = await training.exportBackup();
  const hold = controlled.holdNextCommit();
  const restoring = training.restoreBackup(backup);
  await hold.entered;
  await assert.rejects(training.startRest(30));
  hold.release();
  await restoring;
  assert.equal(training.getSnapshot().restDeadline, null);
});

test('unplanned workout and added sets with no targets round-trip', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-unplanned-'));
  const source = await openTraining(await openNodeDatabase(join(dir, 'source.db')));
  const target = await openTraining(await openNodeDatabase(join(dir, 'target.db')));
  t.after(async () => { await source.close(); await target.close(); await rm(dir, { recursive: true, force: true }); });
  await source.start({ id: 'unplanned', title: 'Workout', exercises: [] });
  const id = source.getSnapshot().workout!.id;
  await source.adaptWorkout(id, { type: 'add-exercise', catalogueId: 'lat-pulldown' });
  const exercise = source.getSnapshot().workout!.exercises[0];
  await source.adaptWorkout(id, { type: 'add-set', exerciseId: exercise.id });
  await target.restoreBackup(await source.exportBackup());
  assert.deepEqual(target.getSnapshot().workout!.exercises[0].sets.map(s => [s.targetMin, s.targetMax]), [[0, 0], [0, 0]]);
});

test('concurrent edits do not alter a draft during a failed restore', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-edit-'));
  const controlled = controlCommits(await openNodeDatabase(join(dir, 'training.db')));
  const training = await openTraining(controlled.database);
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  await training.start(upperStarter);
  const set = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(set.id, { load: '10.' });
  const backup = await training.exportBackup();
  const hold = controlled.holdNextCommit({ fail: true });
  const restoring = training.restoreBackup(backup);
  await hold.entered;
  assert.equal(await training.editSet(set.id, { load: '20' }), false);
  assert.equal(await training.setPerformed(set.id, true), false);
  hold.release();
  await assert.rejects(restoring);
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].load, '10.');
});

test('process interruption during replacement recovers the original acknowledged workout', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-interrupt-'));
  const path = join(dir, 'training.db');
  let training = await openTraining(await openNodeDatabase(path));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  await training.start(upperStarter);
  const set = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(set.id, { load: '40', reps: '6' });
  await training.setPerformed(set.id, true);
  await training.close();
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, [join(__dirname, 'interrupt-restore.js'), path], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /interrupted after deletion/);
  training = await openTraining(await openNodeDatabase(path));
  const recovered = training.getSnapshot().workout!.exercises[0].sets[0];
  assert.deepEqual([recovered.load, recovered.reps, recovered.performed], ['40', '6', true]);
});

test('failure while inserting replacement rolls back before publication', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-insert-'));
  const database = await openNodeDatabase(join(dir, 'training.db'));
  let failInsert = false;
  const training = await openTraining({ ...database, async run(sql, parameters) {
    if (failInsert && sql.startsWith('INSERT INTO workout_exercises ')) { failInsert = false; throw new Error('Simulated insertion failure'); }
    await database.run(sql, parameters);
  } });
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  await training.start(upperStarter);
  const set = training.getSnapshot().workout!.exercises[0].sets[0];
  await training.editSet(set.id, { load: '12.' });
  const backup = await training.exportBackup();
  failInsert = true;
  await assert.rejects(training.restoreBackup(backup));
  assert.equal(training.getSnapshot().workout!.exercises[0].sets[0].load, '12.');
  assert.deepEqual(await training.exportBackup(), backup);
});

test('legacy rest overrides restore without changing saved routine or workout values', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-legacy-rest-'));
  const source = await openTraining(await openNodeDatabase(join(dir, 'source.db')));
  const target = await openTraining(await openNodeDatabase(join(dir, 'target.db')));
  t.after(async () => { await source.close(); await target.close(); await rm(dir, { recursive: true, force: true }); });
  await source.start(upperStarter);
  const backup = await source.exportBackup();
  const routine = JSON.parse(backup.data.routines[0].data as string);
  routine.exercises[0].restSeconds = 0;
  routine.exercises[1].restSeconds = 90000;
  backup.data.routines[0].data = JSON.stringify(routine);
  backup.data.workout_exercises[0].rest_seconds = 0;
  backup.data.workout_exercises[1].rest_seconds = 90000;
  await target.restoreBackup(backup);
  assert.deepEqual((await target.exportBackup()).data.routines, backup.data.routines);
  assert.deepEqual((await target.exportBackup()).data.workout_exercises, backup.data.workout_exercises);
});

test('only a structurally resumable custom draft can be restored, preserving incomplete text', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-draft-shape-'));
  const training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const backup = await training.exportBackup();
  const draft = '{"id":"custom-example","name":"","equipment":"other","entryMode":"bodyweight","bodyParts":[],"fraction":"0."}';
  backup.data.custom_draft = [{ id: 1, data: draft }];
  await training.restoreBackup(backup);
  assert.equal(training.getSnapshot().customDraft, draft);
  const lease = await training.beginCustomDraft(draft);
  await training.discardCustomDraft(lease);
  for (const bad of ['{', '{"id":"custom-example"}', '{"id":"wrong","name":"","equipment":"other","entryMode":"weighted","bodyParts":[],"fraction":""}']) {
    backup.data.custom_draft = [{ id: 1, data: bad }];
    await assert.rejects(training.restoreBackup(backup));
    assert.equal(training.getSnapshot().customDraft, null);
  }
});

test('subscriber exceptions do not report a committed restore as failed', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-subscriber-'));
  const source = await openTraining(await openNodeDatabase(join(dir, 'source.db')));
  const target = await openTraining(await openNodeDatabase(join(dir, 'target.db')));
  t.after(async () => { await source.close(); await target.close(); await rm(dir, { recursive: true, force: true }); });
  await source.start(upperStarter);
  const backup = await source.exportBackup();
  let notified = false;
  target.subscribe(() => { throw new Error('Subscriber failure'); });
  target.subscribe(() => { notified = true; });
  await target.restoreBackup(backup);
  assert.equal(notified, true);
  assert.equal(target.getSnapshot().workout!.id, backup.data.workouts[0].id);
  assert.equal((await target.exportBackup()).data.workouts[0].id, backup.data.workouts[0].id);
});


test('routine draft restore preserves incomplete raw text and rejects unusable parsed shapes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-routine-draft-'));
  const training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const backup = await training.exportBackup();
  const raw = '{"id":"draft","title":"","exercises":[{"exerciseId":"lat-pulldown","name":"","loadConvention":"","rest":"1.","sets":[{"type":"normal","min":"","max":"9x"}]}]}';
  backup.data.routine_draft = [{ id: 1, data: raw }];
  await training.restoreBackup(backup);
  assert.equal(training.getSnapshot().routineDraft, raw);
  backup.data.routine_draft = [{ id: 1, data: '{}' }];
  await assert.rejects(training.restoreBackup(backup));
  const outOfRange = JSON.parse(raw);
  outOfRange.exercises[0].bodyweightFraction = 2;
  backup.data.routine_draft = [{ id: 1, data: JSON.stringify(outOfRange) }];
  await assert.rejects(training.restoreBackup(backup));
  assert.equal(training.getSnapshot().routineDraft, raw);
  backup.data.routine_draft = [{ id: 1, data: '{"unfinished":' }];
  await training.restoreBackup(backup);
  assert.equal(training.getSnapshot().routineDraft, '{"unfinished":');
  assert.throws(() => decodeRoutineDraft(training.getSnapshot().routineDraft!));
  await training.discardRoutineDraft();
  assert.equal(training.getSnapshot().routineDraft, null);
});

test('restore rejects non-finite scalar data instead of converting it to null', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-nonfinite-'));
  const training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const backup = await training.exportBackup();
  backup.data.bodyweight_settings[0].bodyweight = Infinity;
  await assert.rejects(training.restoreBackup(backup));
  assert.equal(training.getSnapshot().bodyweightSettings.bodyweight, null);
});


test('restore rejects custom catalogue IDs that could shadow built-in exercises', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-restore-custom-id-'));
  const training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const backup = await training.exportBackup();
  const custom = { id: 'lat-pulldown', name: 'Impostor', equipment: 'cable', entryMode: 'weighted', loadConvention: '', sourceId: null, aliases: [], bodyParts: ['back'], fraction: null, archived: false };
  backup.data.custom_exercises = [{ id: custom.id, data: JSON.stringify(custom) }];
  await assert.rejects(training.restoreBackup(backup));
  assert.deepEqual(training.getSnapshot().customExercises, []);
});
