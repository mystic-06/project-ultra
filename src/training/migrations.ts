import type { TrainingDatabase } from './database';

const migrations = [
  `CREATE TABLE workouts (
    id TEXT PRIMARY KEY NOT NULL,
    routine_id TEXT NOT NULL,
    title TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    active INTEGER NOT NULL CHECK (active IN (0, 1))
  );
  CREATE UNIQUE INDEX one_active_workout ON workouts(active) WHERE active = 1;
  CREATE TABLE workout_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL,
    name TEXT NOT NULL,
    load_convention TEXT NOT NULL,
    position INTEGER NOT NULL,
    UNIQUE(workout_id, position)
  );
  CREATE TABLE workout_sets (
    id TEXT PRIMARY KEY NOT NULL,
    workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('normal', 'warmup')),
    target_min INTEGER NOT NULL,
    target_max INTEGER NOT NULL,
    load TEXT,
    reps INTEGER CHECK(reps IS NULL OR reps > 0),
    performed INTEGER NOT NULL DEFAULT 0 CHECK(performed IN (0, 1)),
    CHECK(performed = 0 OR (load IS NOT NULL AND reps IS NOT NULL)),
    UNIQUE(workout_exercise_id, position)
  );`,
];

export async function migrate(database: TrainingDatabase) {
  await database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL;');
  await database.exec('BEGIN IMMEDIATE');
  try {
    const [{ user_version: version }] = await database.all<{ user_version: number }>('PRAGMA user_version');
    if (version > migrations.length) throw new Error('This training database needs a newer app version.');
    for (let index = version; index < migrations.length; index++) {
      await database.exec(migrations[index]);
      await database.exec(`PRAGMA user_version = ${index + 1}`);
    }
    await database.exec('COMMIT');
  } catch (error) {
    await database.exec('ROLLBACK');
    throw error;
  }
}
