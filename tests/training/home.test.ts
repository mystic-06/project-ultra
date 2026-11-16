import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';

import { openTraining, type Training } from '../../src/training/workout';
import { upperStarter } from '../../src/training/routines';
import { controlCommits, openNodeDatabase } from './node-database';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'ultra-home-'));
  const path = join(directory, 'training.db');
  let now = new Date(2026, 10, 16, 12).getTime();
  const control = controlCommits(await openNodeDatabase(path));
  let training = await openTraining(control.database, () => now);
  t.after(async () => { await training.close(); await rm(directory, { recursive: true, force: true }); });
  return { training, control, at(date: Date) { now = date.getTime(); }, async reopen() {
    await training.close();
    training = await openTraining(await openNodeDatabase(path), () => now);
    return training;
  } };
}

async function performedWorkout(training: Training) {
  await training.start(upperStarter);
  const workout = training.getSnapshot().workout!;
  const id = workout.exercises[0].sets[0].id;
  await training.editSet(id, { load: '40', reps: '6' });
  await training.setPerformed(id, true);
  return workout.id;
}

test('weekly activity includes local Monday and Sunday completions and excludes adjacent weeks', async (t) => {
  const { training, at, reopen } = await fixture(t);
  for (const date of [new Date(2026, 10, 15, 23, 59, 59), new Date(2026, 10, 16),
    new Date(2026, 10, 22, 23, 59, 59, 999), new Date(2026, 10, 23)]) {
    at(date);
    await training.finishWorkout(await performedWorkout(training));
  }
  const monday = new Date(2026, 10, 16).getTime();
  const nextMonday = new Date(2026, 10, 23).getTime();
  assert.deepEqual(training.getWeeklyActivity(new Date(2026, 10, 22, 12).getTime()),
    { startedAt: monday, endsAt: nextMonday, completedCount: 2 });
  assert.equal((await reopen()).getWeeklyActivity(new Date(2026, 10, 16, 12).getTime()).completedCount, 2);
});

test('recent summaries retain ordered exercise previews and performed totals after reopening', async (t) => {
  const { training, at, reopen } = await fixture(t);
  at(new Date(2026, 10, 16, 10));
  const firstId = await performedWorkout(training);
  const secondSet = training.getSnapshot().workout!.exercises[0].sets[1];
  await training.editSet(secondSet.id, { load: '35', reps: '8' });
  at(new Date(2026, 10, 16, 11));
  await training.finishWorkout(firstId);
  at(new Date(2026, 10, 17, 10));
  const secondId = await performedWorkout(training);
  at(new Date(2026, 10, 17, 10, 30));
  await training.finishWorkout(secondId);
  const expected = ['Lat pulldown', 'Chest press · machine', 'Overhead press · barbell'];
  assert.deepEqual(training.getSnapshot().history.map((entry) => entry.exerciseNames), [expected, expected]);
  const recovered = (await reopen()).getSnapshot().history;
  assert.deepEqual(recovered.map((entry) => entry.id), [secondId, firstId]);
  assert.deepEqual(recovered[0].exerciseNames, expected);
  assert.deepEqual(recovered.map((entry) => [entry.completedAt - entry.startedAt, entry.performedSetCount]), [[1800000, 1], [3600000, 1]]);
});

test('empty, active, discarded and failed completions do not inflate weekly activity', async (t) => {
  const { training, control, at, reopen } = await fixture(t);
  assert.equal(training.getWeeklyActivity().completedCount, 0);
  const id = await performedWorkout(training);
  assert.equal(training.getWeeklyActivity().completedCount, 0);
  control.failNextCommit();
  await assert.rejects(training.finishWorkout(id));
  assert.equal(training.getWeeklyActivity().completedCount, 0);
  await training.discardWorkout(id);
  assert.equal(training.getWeeklyActivity().completedCount, 0);
  at(new Date(2026, 10, 15, 23, 50));
  const overnight = await performedWorkout(training);
  at(new Date(2026, 10, 16, 0, 10));
  await training.finishWorkout(overnight);
  assert.equal(training.getWeeklyActivity().completedCount, 1);
  assert.equal(training.getWeeklyActivity(new Date(2026, 10, 15, 23, 59).getTime()).completedCount, 0);
  assert.equal((await reopen()).getWeeklyActivity().completedCount, 1);
});

for (const [month, mondayDay, sundayDay, nextMondayDay] of [[2, 2, 8, 9], [9, 26, 32, 33]]) {
  test(`calendar weeks cover daylight-saving transition in month ${month + 1}`, async (t) => {
    const { training, at, reopen } = await fixture(t);
    at(new Date(2026, month, sundayDay, 23, 59));
    await training.finishWorkout(await performedWorkout(training));
    const now = new Date(2026, month, sundayDay, 12).getTime();
    assert.deepEqual(training.getWeeklyActivity(now), {
      startedAt: new Date(2026, month, mondayDay).getTime(),
      endsAt: new Date(2026, month, nextMondayDay).getTime(), completedCount: 1,
    });
    assert.equal((await reopen()).getWeeklyActivity(new Date(2026, month, nextMondayDay).getTime()).completedCount, 0);
  });
}
