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
  `ALTER TABLE workouts ADD COLUMN completed_at INTEGER;`,
  `ALTER TABLE workout_exercises ADD COLUMN entry_mode TEXT NOT NULL DEFAULT 'weighted';`,
  `CREATE TABLE equipment_setups (id TEXT PRIMARY KEY NOT NULL, label TEXT, gym TEXT, ratio TEXT, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)));
   CREATE TABLE equipment_last_selection (exercise_id TEXT PRIMARY KEY NOT NULL, setup_id TEXT REFERENCES equipment_setups(id));
   ALTER TABLE workout_exercises ADD COLUMN equipment_setup_id TEXT REFERENCES equipment_setups(id);
   ALTER TABLE workout_sets ADD COLUMN equipment_setup_id TEXT REFERENCES equipment_setups(id);`,
  `ALTER TABLE workout_exercises ADD COLUMN rest_seconds INTEGER;
  ALTER TABLE workouts ADD COLUMN rest_deadline INTEGER;
  CREATE TABLE rest_settings (id INTEGER PRIMARY KEY CHECK(id = 1), automatic INTEGER NOT NULL, default_seconds INTEGER NOT NULL);
  INSERT INTO rest_settings VALUES (1, 1, 90);`,
  `  CREATE TABLE routines (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
  CREATE TABLE routine_seed (id INTEGER PRIMARY KEY CHECK(id = 1));
  CREATE TABLE routine_draft (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);
  CREATE TABLE workout_sets_new (
    id TEXT PRIMARY KEY NOT NULL,
    workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('normal', 'warmup', 'drop')),
    target_min INTEGER NOT NULL, target_max INTEGER NOT NULL,
    load TEXT, reps INTEGER CHECK(reps IS NULL OR reps > 0),
    performed INTEGER NOT NULL DEFAULT 0 CHECK(performed IN (0, 1)),
    equipment_setup_id TEXT REFERENCES equipment_setups(id),
    CHECK(performed = 0 OR (load IS NOT NULL AND reps IS NOT NULL)),
    UNIQUE(workout_exercise_id, position)
  );
  INSERT INTO workout_sets_new SELECT * FROM workout_sets;
  DROP TABLE workout_sets;
  ALTER TABLE workout_sets_new RENAME TO workout_sets;`,
  `ALTER TABLE workout_sets ADD COLUMN load_unit TEXT NOT NULL DEFAULT 'kg' CHECK(load_unit IN ('kg', 'lb'));
  CREATE TABLE load_settings (id INTEGER PRIMARY KEY CHECK(id = 1), unit TEXT NOT NULL CHECK(unit IN ('kg', 'lb')));
  INSERT INTO load_settings VALUES (1, 'kg');`,
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
