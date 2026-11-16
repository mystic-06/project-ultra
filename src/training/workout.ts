import type { TrainingDatabase } from './database';
import { migrate } from './migrations';
import type { Routine } from './routines';

export type SaveStatus = 'editing' | 'saving' | 'saved' | 'failed';
export interface SetEntry {
  id: string;
  type: 'normal' | 'warmup';
  targetMin: number;
  targetMax: number;
  load: string;
  reps: string;
  performed: boolean;
  revision: number;
  status: SaveStatus;
  error: string | null;
}
export interface Workout {
  id: string;
  title: string;
  startedAt: number;
  exercises: { id: string; name: string; loadConvention: string; sets: SetEntry[] }[];
}
export interface TrainingSnapshot { workout: Workout | null }

export interface Training {
  getSnapshot(): TrainingSnapshot;
  subscribe(listener: () => void): () => void;
  start(routine: Routine): Promise<boolean>;
  editSet(id: string, patch: Partial<Pick<SetEntry, 'load' | 'reps'>>): Promise<boolean>;
  setPerformed(id: string, performed: boolean): Promise<boolean>;
  retrySet(id: string): Promise<boolean>;
  blurSet(id: string): Promise<boolean>;
  close(): Promise<void>;
}

export function openTraining(database: TrainingDatabase): Promise<Training> {
  return TrainingModule.open(database);
}

class TrainingModule implements Training {
  private workout: Workout | null = null;
  private snapshot: TrainingSnapshot = { workout: null };
  private listeners = new Set<() => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  private closing?: Promise<void>;
  private retryIntent = new Map<string, boolean | undefined>();

  private constructor(private database: TrainingDatabase) {}

  static async open(database: TrainingDatabase) {
    try {
      await migrate(database);
      const training = new TrainingModule(database);
      await training.load();
      return training;
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish() {
    this.snapshot = { workout: this.workout ? {
      ...this.workout,
      exercises: this.workout.exercises.map((exercise) => ({
        ...exercise, sets: exercise.sets.map((set) => ({ ...set })),
      })),
    } : null };
    this.listeners.forEach((listener) => listener());
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Training storage is closed.'));
    const result = this.tail.then(action);
    this.tail = result.catch(() => {});
    return result;
  }

  private async transaction(action: () => Promise<void>) {
    await this.database.exec('BEGIN IMMEDIATE');
    try {
      await action();
      await this.database.exec('COMMIT');
    } catch (error) {
      await this.database.exec('ROLLBACK');
      throw error;
    }
  }

  /** Initial hydration only; subsequent reads use the module-owned draft. */
  private async load() {
    const [workout] = await this.database.all<{ id: string; title: string; started_at: number }>(
      'SELECT id, title, started_at FROM workouts WHERE active = 1');
    if (!workout) return;
    const exercises = await this.database.all<{ id: string; name: string; load_convention: string }>(
      'SELECT id, name, load_convention FROM workout_exercises WHERE workout_id = ? ORDER BY position', [workout.id]);
    const entries = [];
    for (const exercise of exercises) {
      const sets = await this.database.all<{
        id: string; type: SetEntry['type']; target_min: number; target_max: number;
        load: string | null; reps: number | null; performed: number;
      }>('SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position', [exercise.id]);
      entries.push({ id: exercise.id, name: exercise.name, loadConvention: exercise.load_convention,
        sets: sets.map((set): SetEntry => ({ id: set.id, type: set.type, targetMin: set.target_min,
          targetMax: set.target_max, load: set.load ?? '', reps: set.reps?.toString() ?? '',
          performed: set.performed === 1, revision: 0, status: 'saved', error: null })) });
    }
    this.workout = { id: workout.id, title: workout.title, startedAt: workout.started_at, exercises: entries };
    this.publish();
  }

  start(routine: Routine): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.workout) return false;
      await this.transaction(async () => {
        const [{ id }] = await this.database.all<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
        await this.database.run('INSERT INTO workouts(id, routine_id, title, started_at, active) VALUES (?, ?, ?, ?, 1)',
          [id, routine.id, routine.title, Date.now()]);
        for (const [position, exercise] of routine.exercises.entries()) {
          const exerciseId = `${id}:${position}`;
          await this.database.run('INSERT INTO workout_exercises(id, workout_id, exercise_id, name, load_convention, position) VALUES (?, ?, ?, ?, ?, ?)',
            [exerciseId, id, exercise.exerciseId, exercise.name, exercise.loadConvention, position]);
          for (const [setPosition, set] of exercise.sets.entries()) {
            await this.database.run('INSERT INTO workout_sets(id, workout_exercise_id, position, type, target_min, target_max) VALUES (?, ?, ?, ?, ?, ?)',
              [`${exerciseId}:${setPosition}`, exerciseId, setPosition, set.type, set.targetMin, set.targetMax]);
          }
        }
      });
      await this.load();
      return true;
    });
  }

  private row(id: string) {
    if (this.closed) throw new Error('Training storage is closed.');
    const row = this.workout?.exercises.flatMap((exercise) => exercise.sets).find((set) => set.id === id);
    if (!row) throw new Error('Set not found in the active workout.');
    return row;
  }

  editSet(id: string, patch: Partial<Pick<SetEntry, 'load' | 'reps'>>) {
    const row = this.row(id);
    Object.assign(row, patch);
    return this.save(row, patch.reps === '' ? false : undefined);
  }

  setPerformed(id: string, performed: boolean) {
    return this.save(this.row(id), performed);
  }

  retrySet(id: string) {
    return this.save(this.row(id), this.retryIntent.get(id));
  }

  blurSet(id: string) {
    const row = this.row(id);
    if (row.reps === '' || row.load === '') return this.save(row, false);
    return Promise.resolve(false);
  }

  private save(row: SetEntry, performed?: boolean): Promise<boolean> {
    const revision = ++row.revision;
    this.retryIntent.set(row.id, performed);
    const { load, reps } = row;
    const validLoad = load === '' || (/^\d+(?:\.\d{1,2})?$/.test(load) && Number.isFinite(Number(load)));
    const validReps = reps === '' || (/^\d+$/.test(reps) && Number.isSafeInteger(Number(reps)) && Number(reps) > 0);
    const complete = load !== '' && reps !== '';
    const inputValid = validLoad && validReps;
    if ((!inputValid && performed !== false) || (performed === true && !complete)) {
      row.status = 'editing';
      row.error = 'Enter a nonnegative load (up to 2 decimals) and positive whole reps.';
      this.publish();
      return Promise.resolve(false);
    }
    row.status = 'saving';
    row.error = null;
    this.publish();
    return this.enqueue(async () => {
      // Earlier queued checks/unchecks may have changed confirmation since this edit.
      if (performed === undefined && row.performed && !complete) {
        if (row.revision === revision) {
          row.status = 'editing';
          row.error = 'Leave the field to mark this incomplete set unfinished.';
        }
        this.publish();
        return false;
      }
      try {
        await this.transaction(async () => {
          // Clear confirmation first so an intentionally emptied field satisfies the invariant.
          if (performed === false) {
            await this.database.run('UPDATE workout_sets SET performed = 0 WHERE id = ?', [row.id]);
          }
          if (inputValid) {
            await this.database.run('UPDATE workout_sets SET load = ?, reps = ? WHERE id = ?',
              [load === '' ? null : load, reps === '' ? null : Number(reps), row.id]);
          }
          if (performed !== undefined) {
            await this.database.run('UPDATE workout_sets SET performed = ? WHERE id = ?', [performed ? 1 : 0, row.id]);
          }
        });
        if (performed !== undefined) row.performed = performed;
        if (row.revision === revision) {
          row.status = inputValid ? 'saved' : 'editing';
          row.error = inputValid ? null : 'Incomplete input is kept here but is not saved.';
        }
        this.publish();
        return true;
      } catch {
        if (row.revision === revision) { row.status = 'failed'; row.error = 'Could not save. Your latest input is kept here. Retry to save it.'; }
        this.publish();
        return false;
      }
    });
  }

  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = this.tail.then(() => this.database.close());
    return this.closing;
  }
}
