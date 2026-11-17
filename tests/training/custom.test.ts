import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openTraining } from '../../src/training/workout';
import { controlCommits, openNodeDatabase } from './node-database';

test('custom catalogue drafts and archival survive reopening', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-'));
  const path = join(dir, 'training.db');
  let training = await openTraining(await openNodeDatabase(path));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const draft = JSON.stringify({ id: 'custom-1', name: '  My pull  ', equipment: 'cable', entryMode: 'unilateral-bodyweight', bodyParts: ['back'], fraction: '0.7' });
  const initialLease = await training.beginCustomDraft(draft);
  await training.saveCustomDraft(draft, initialLease);
  await training.close(); training = await openTraining(await openNodeDatabase(path));
  assert.equal(training.getSnapshot().customDraft, draft);
  const resumedLease = await training.beginCustomDraft(draft);
  await training.commitCustomDraft(draft, resumedLease);
  assert.equal(training.searchExercises('my pull')[0].entryMode, 'unilateral-bodyweight');
  await training.archiveCustomExercise('custom-1', true);
  await training.close(); training = await openTraining(await openNodeDatabase(path));
  assert.equal(training.searchExercises('my pull').length, 0);
  assert.equal(training.getSnapshot().customExercises[0].archived, true);
});

test('custom selections retain measurement and equipment definitions after editing and archiving', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-snapshot-'));
  const path = join(dir, 'training.db');
  let training = await openTraining(await openNodeDatabase(path));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const draft = { id: 'custom-one', name: 'Single pull', equipment: 'cable', entryMode: 'unilateral-assisted', bodyParts: ['back'], fraction: '' };
  await training.commitCustomDraft(JSON.stringify(draft), await training.beginCustomDraft(JSON.stringify(draft)));
  const selected = training.searchExercises('single pull').find((item) => item.id === draft.id)!;
  await training.saveRoutine({ id: 'plan', title: 'Plan', exercises: [{ exerciseId: selected.id, name: selected.name, equipmentCategory: selected.equipment, entryMode: selected.entryMode, loadConvention: selected.loadConvention, sets: [{ type: 'normal', targetMin: 5, targetMax: 8 }] }] });
  const edited = JSON.stringify({ ...draft, equipment: 'dumbbell', entryMode: 'bodyweight', fraction: '0.7', fractionChanged: true });
  await training.commitCustomDraft(edited, await training.beginCustomDraft(edited));
  await training.archiveCustomExercise(draft.id, true);
  await training.start(training.getSnapshot().routines.find((r) => r.id === 'plan')!);
  let exercise = training.getSnapshot().workout!.exercises[0];
  assert.equal(exercise.entryMode, 'unilateral-assisted');
  assert.equal(exercise.equipmentCategory, 'cable');
  await training.editSet(exercise.sets[0].id, { assistance: '5', repsLeft: '3', repsRight: '4' });
  assert.equal(await training.setPerformed(exercise.sets[0].id, true), true);
  await training.close(); training = await openTraining(await openNodeDatabase(path));
  exercise = training.getSnapshot().workout!.exercises[0];
  assert.equal(exercise.entryMode, 'unilateral-assisted');
  assert.equal(exercise.equipmentCategory, 'cable');
  assert.equal(exercise.sets[0].performed, true);
});

test('custom exercises can be selected in an active workout', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-select-'));
  const path = join(dir, 'training.db');
  let training = await openTraining(await openNodeDatabase(path));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const draft = JSON.stringify({ id: 'custom-one', name: 'Custom squat', equipment: 'bodyweight', entryMode: 'unilateral-bodyweight', bodyParts: ['quads'], fraction: '0.7' });
  await training.commitCustomDraft(draft, await training.beginCustomDraft(draft));
  await training.start();
  await training.adaptWorkout(training.getSnapshot().workout!.id, { type: 'add-exercise', catalogueId: 'custom-one' });
  let exercise = training.getSnapshot().workout!.exercises[0];
  assert.equal(exercise.bodyweightFraction, 0.7);
  await training.editSet(exercise.sets[0].id, { repsLeft: '4', repsRight: '5' });
  assert.equal(await training.setPerformed(exercise.sets[0].id, true), true);
  await training.close(); training = await openTraining(await openNodeDatabase(path));
  exercise = training.getSnapshot().workout!.exercises[0];
  assert.equal(exercise.entryMode, 'unilateral-bodyweight');
  assert.equal(exercise.sets[0].performed, true);
});

test('a draft has one editor and late writes cannot resurrect it', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-lease-'));
  const path = join(dir, 'training.db');
  let training = await openTraining(await openNodeDatabase(path));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const data = JSON.stringify({ id: 'custom-one', name: 'Press', equipment: 'barbell', entryMode: 'weighted', bodyParts: ['chest'], fraction: '' });
  const lease = await training.beginCustomDraft(data);
  await assert.rejects(training.beginCustomDraft(data), /another custom draft/i);
  const closing = training.discardCustomDraft(lease);
  await assert.rejects(training.saveCustomDraft(data, lease), /closed/);
  await closing;
  await assert.rejects(training.saveCustomDraft(data, lease), /closed/);
  await training.close(); training = await openTraining(await openNodeDatabase(path));
  assert.equal(training.getSnapshot().customDraft, null);
});

test('equipment definition controls remembered setup and current catalogue selection', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-equipment-'));
  const training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const save = async (draft: object) => { const raw = JSON.stringify(draft); await training.commitCustomDraft(raw, await training.beginCustomDraft(raw)); };
  const draft = { id: 'custom-machine', name: 'Press', equipment: 'cable', entryMode: 'unilateral', bodyParts: ['chest'], fraction: '' };
  await save(draft);
  assert.equal(training.getAvailableExercise(draft.id).loadConvention, 'Displayed machine/cable load');
  await training.start();
  let workout = training.getSnapshot().workout!;
  await training.adaptWorkout(workout.id, { type: 'add-exercise', catalogueId: draft.id });
  let exercise = training.getSnapshot().workout!.exercises[0];
  const setup = await training.createEquipmentSetup({ label: 'Cable', gym: null, ratio: null });
  await training.selectEquipmentSetup(exercise.id, setup.id);
  await training.discardWorkout(workout.id);
  await save({ ...draft, equipment: 'dumbbell' });
  assert.equal(training.getAvailableExercise(draft.id).loadConvention, 'Working-side external load');
  await training.start(); workout = training.getSnapshot().workout!;
  await training.adaptWorkout(workout.id, { type: 'add-exercise', catalogueId: draft.id });
  exercise = training.getSnapshot().workout!.exercises[0];
  assert.equal(exercise.equipmentSetupId, null);
  await training.archiveCustomExercise(draft.id, true);
  assert.throws(() => training.getAvailableExercise(draft.id), /archived/);
});

test('a stale draft retains the latest fraction and old workout edits do not change a new non-bodyweight definition', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-fraction-'));
  const training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const save = async (draft: object) => { const raw = JSON.stringify(draft); await training.commitCustomDraft(raw, await training.beginCustomDraft(raw)); };
  const draft = { id: 'custom-bw', name: 'Squat', equipment: 'bodyweight', entryMode: 'bodyweight', bodyParts: ['quads'], fraction: '0.00000001' };
  await save(draft);
  await training.start();
  await training.adaptWorkout(training.getSnapshot().workout!.id, { type: 'add-exercise', catalogueId: draft.id });
  const id = training.getSnapshot().workout!.exercises[0].id;
  const stale = JSON.stringify({ ...draft, name: 'Squat edited', fraction: '1e-8', fractionChanged: false });
  const lease = await training.beginCustomDraft(stale);
  await training.setExerciseFraction(id, 0.6);
  await training.commitCustomDraft(stale, lease);
  assert.equal(training.getSnapshot().customExercises[0].fraction, 0.6);
  await save({ ...draft, entryMode: 'weighted', equipment: 'barbell', fraction: '', fractionChanged: true });
  await training.setExerciseFraction(id, 0.3);
  assert.equal(training.getSnapshot().customExercises[0].fraction, null);
});

test('custom mutations do not depend on a fallible catalogue read after commit', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-read-'));
  const base = await openNodeDatabase(join(dir, 'training.db'));
  let failCatalogueReads = false;
  const training = await openTraining({ ...base, async all<T>(sql: string, parameters: (string | number | null)[] = []) {
    if (failCatalogueReads && sql.includes('FROM custom_exercises')) throw new Error('Read failure');
    return base.all<T>(sql, parameters);
  } });
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const raw = JSON.stringify({ id: 'custom-read', name: 'Row', equipment: 'cable', entryMode: 'weighted', bodyParts: ['back'], fraction: '' });
  const lease = await training.beginCustomDraft(raw);
  failCatalogueReads = true;
  await training.commitCustomDraft(raw, lease);
  assert.equal(training.getSnapshot().customExercises[0].name, 'Row');
  await training.archiveCustomExercise('custom-read', true);
  assert.equal(training.getSnapshot().customExercises[0].archived, true);
});

test('history corrections use archived custom measurement and equipment snapshots', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-history-'));
  const path = join(dir, 'training.db');
  let training = await openTraining(await openNodeDatabase(path));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const save = async (draft: object) => { const raw = JSON.stringify(draft); await training.commitCustomDraft(raw, await training.beginCustomDraft(raw)); };
  const assisted = { id: 'custom-assisted', name: 'Assisted pull', equipment: 'cable', entryMode: 'unilateral-assisted', bodyParts: ['back'], fraction: '' };
  const bodyweight = { id: 'custom-bodyweight', name: 'Single squat', equipment: 'bodyweight', entryMode: 'unilateral-bodyweight', bodyParts: ['quads'], fraction: '' };
  await save(assisted); await save(bodyweight);
  const routine = { id: 'custom-history', title: 'Custom', exercises: [assisted, bodyweight].map((item) => {
    const selected = training.getAvailableExercise(item.id);
    return { exerciseId: selected.id, name: selected.name, equipmentCategory: selected.equipment, entryMode: selected.entryMode, loadConvention: selected.loadConvention, sets: [{ type: 'normal' as const, targetMin: 5, targetMax: 8 }] };
  }) };
  const setup = await training.createEquipmentSetup({ label: 'Cable', gym: null, ratio: null });
  await training.start(routine);
  let exercises = training.getSnapshot().workout!.exercises;
  await training.editSet(exercises[0].sets[0].id, { assistance: '5', repsLeft: '3', repsRight: '4' });
  await training.setPerformed(exercises[0].sets[0].id, true);
  await training.editSet(exercises[1].sets[0].id, { repsLeft: '5', repsRight: '6' });
  await training.setPerformed(exercises[1].sets[0].id, true);
  const id = training.getSnapshot().workout!.id;
  await training.finishWorkout(id);
  await save({ ...assisted, equipment: 'dumbbell', entryMode: 'weighted' });
  await training.archiveCustomExercise(assisted.id, true); await training.archiveCustomExercise(bodyweight.id, true);
  await training.start(routine);
  exercises = training.getSnapshot().workout!.exercises;
  await training.selectEquipmentSetup(exercises[0].id, setup.id);
  await training.editSet(exercises[0].sets[0].id, { assistance: '10', repsLeft: '2' });
  const baseline = (await training.getCompletedWorkout(id))!;
  let draft = training.editCompletedSetDraft(baseline, baseline.exercises[0].sets[0].id, { assistance: '0', repsLeft: '7', equipmentSetupId: setup.id }, 'kg');
  draft = training.editCompletedSetDraft(draft, baseline.exercises[1].sets[0].id, { assistance: '2', repsRight: '8' }, 'kg');
  await training.saveCompletedWorkout(baseline, draft, 'kg');
  exercises = training.getSnapshot().workout!.exercises;
  assert.deepEqual([exercises[0].sets[0].previous?.assistance, exercises[0].sets[0].previous?.repsLeft, exercises[0].sets[0].assistance], ['0', '7', '10']);
  assert.deepEqual([exercises[1].sets[0].previous?.assistance, exercises[1].sets[0].previous?.repsRight], ['2', '8']);
  await training.close(); training = await openTraining(await openNodeDatabase(path));
  const saved = (await training.getCompletedWorkout(id))!;
  assert.equal(saved.exercises[0].equipmentCategory, 'cable');
  assert.deepEqual([saved.exercises[0].sets[0].assistance, saved.exercises[0].sets[0].repsLeft, saved.exercises[0].sets[0].equipmentSetupId], ['0', '7', setup.id]);
  assert.deepEqual([saved.exercises[1].sets[0].assistance, saved.exercises[1].sets[0].repsRight], ['2', '8']);
});

test('releasing an editor while its failed save is pending leaves its draft resumable', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-pending-'));
  const controlled = controlCommits(await openNodeDatabase(join(dir, 'training.db')));
  const training = await openTraining(controlled.database);
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const raw = JSON.stringify({ id: 'custom-pending', name: 'Press', equipment: 'barbell', entryMode: 'weighted', bodyParts: ['chest'], fraction: '' });
  const lease = await training.beginCustomDraft(raw);
  const gate = controlled.holdNextCommit({ fail: true });
  const pending = training.commitCustomDraft(raw, lease);
  await gate.entered;
  const release = training.releaseCustomDraft(lease);
  gate.release();
  await assert.rejects(pending, /Simulated/);
  await release;
  const resumed = await training.beginCustomDraft(raw);
  await training.discardCustomDraft(resumed);
});

test('custom machine and cable setups remain separate across edits and saved routines', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-setup-categories-'));
  const training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const save = async (draft: object) => { const raw = JSON.stringify(draft); await training.commitCustomDraft(raw, await training.beginCustomDraft(raw)); };
  const draft = { id: 'custom-row', name: 'Row', equipment: 'cable', entryMode: 'weighted', bodyParts: ['back'], fraction: '' };
  await save(draft);
  const cable = await training.createEquipmentSetup({ label: 'Cable', gym: null, ratio: null });
  const machine = await training.createEquipmentSetup({ label: 'Machine', gym: null, ratio: null });
  const plan = (category: string) => ({ id: category, title: category, exercises: [{ exerciseId: draft.id, name: 'Row', equipmentCategory: category, entryMode: 'weighted' as const, loadConvention: 'Displayed machine/cable load', sets: [{ type: 'normal' as const, targetMin: 5, targetMax: 8 }] }] });
  await training.start(plan('cable'));
  let workout = training.getSnapshot().workout!;
  await training.selectEquipmentSetup(workout.exercises[0].id, cable.id);
  await training.discardWorkout(workout.id);
  await save({ ...draft, equipment: 'machine' });
  await training.start(plan('machine')); workout = training.getSnapshot().workout!;
  assert.equal(workout.exercises[0].equipmentSetupId, null);
  await training.selectEquipmentSetup(workout.exercises[0].id, machine.id);
  await training.discardWorkout(workout.id);
  await training.start(plan('cable')); workout = training.getSnapshot().workout!;
  assert.equal(workout.exercises[0].equipmentSetupId, cable.id);
  await training.discardWorkout(workout.id);
  await training.start(plan('machine')); workout = training.getSnapshot().workout!;
  assert.equal(workout.exercises[0].equipmentSetupId, machine.id);
});

test('stale replacement is rejected and search results cannot mutate catalogue body parts', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-replace-'));
  const training = await openTraining(await openNodeDatabase(join(dir, 'training.db')));
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const save = async (draft: object) => { const raw = JSON.stringify(draft); await training.commitCustomDraft(raw, await training.beginCustomDraft(raw)); };
  const draft = { id: 'custom-replace', name: 'Row', equipment: 'cable', entryMode: 'weighted', bodyParts: ['back'], fraction: '' };
  await save(draft);
  const item = training.getAvailableExercise(draft.id);
  const { exerciseDefinition } = await import('../../src/training/catalogue');
  const expected = exerciseDefinition(item);
  const found = training.searchExercises('row').find((result) => result.id === draft.id)! as typeof item & { bodyParts: string[] };
  found.bodyParts.push('chest');
  assert.deepEqual(training.getSnapshot().customExercises[0].bodyParts, ['back']);
  await training.start();
  let workout = training.getSnapshot().workout!;
  await training.adaptWorkout(workout.id, { type: 'add-exercise', catalogueId: 'lat-pulldown' });
  workout = training.getSnapshot().workout!;
  await save({ ...draft, name: 'Changed row' });
  await assert.rejects(training.adaptWorkout(workout.id, { type: 'replace-exercise', exerciseId: workout.exercises[0].id, catalogueId: draft.id, expectedDefinition: expected }), /definition changed/);
  assert.equal(training.getSnapshot().workout!.exercises[0].exerciseId, 'lat-pulldown');
});

test('releasing an editor during a failed discard permits recovery', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-custom-discard-fail-'));
  const base = await openNodeDatabase(join(dir, 'training.db'));
  let failDelete = false;
  let arrived!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { arrived = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const training = await openTraining({ ...base, async run(sql, parameters) {
    if (failDelete && sql === 'DELETE FROM custom_draft WHERE id = 1') { arrived(); await held; throw new Error('Discard failed'); }
    return base.run(sql, parameters);
  } });
  t.after(async () => { await training.close(); await rm(dir, { recursive: true, force: true }); });
  const raw = JSON.stringify({ id: 'custom-pending', name: 'Press', equipment: 'barbell', entryMode: 'weighted', bodyParts: ['chest'], fraction: '' });
  const lease = await training.beginCustomDraft(raw);
  failDelete = true;
  const pending = training.discardCustomDraft(lease);
  await entered;
  const relinquished = training.releaseCustomDraft(lease);
  release();
  await assert.rejects(pending, /Discard failed/);
  await relinquished;
  failDelete = false;
  const resumed = await training.beginCustomDraft(raw);
  await training.discardCustomDraft(resumed);
});
