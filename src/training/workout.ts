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
  inputState: 'empty' | 'incomplete' | 'ready';
  error: string | null;
}
export interface Workout {
  id: string;
  title: string;
  startedAt: number;
  exercises: { id: string; name: string; loadConvention: string; sets: SetEntry[] }[];
}
export interface CompletedWorkout extends Workout { completedAt: number }
export interface WorkoutSummary {
  id: string; title: string; startedAt: number; completedAt: number; performedSetCount: number;
}
export function setResultState(set: SetEntry): 'performed' | 'unfinished' | 'untouched' {
  return set.performed ? 'performed' : set.load !== '' || set.reps !== '' ? 'unfinished' : 'untouched';
}
export function summarizeWorkout(workout: Workout) {
  const counts = { performed: 0, unfinished: 0, untouched: 0 };
  workout.exercises.forEach((exercise) => exercise.sets.forEach((set) => { counts[setResultState(set)]++; }));
  return counts;
}
export interface TrainingSnapshot {
  workout: Workout | null; history: WorkoutSummary[]; isEnding: boolean;
  saveStatus: SaveStatus; hasIncompleteInput: boolean;
}

export interface Training {
  getSnapshot(): TrainingSnapshot;
  subscribe(listener: () => void): () => void;
  start(routine: Routine): Promise<boolean>;
  replaceActiveWorkout(routine: Routine, expectedWorkoutId: string): Promise<boolean>;
  editSet(id: string, patch: Partial<Pick<SetEntry, 'load' | 'reps'>>): Promise<boolean>;
  setPerformed(id: string, performed: boolean): Promise<boolean>;
  retrySet(id: string): Promise<boolean>;
  retryFailedSaves(): Promise<boolean>;
  blurSet(id: string): Promise<boolean>;
  finishWorkout(expectedWorkoutId: string): Promise<void>;
  discardWorkout(expectedWorkoutId: string): Promise<void>;
  getCompletedWorkout(id: string): Promise<CompletedWorkout | null>;
  close(): Promise<void>;
}

function inspectInput(load: string, reps: string) {
  const validLoad = load === '' || (/^\d+(?:\.\d{1,2})?$/.test(load) && Number.isFinite(Number(load)));
  const validReps = reps === '' || (/^\d+$/.test(reps) && Number.isSafeInteger(Number(reps)) && Number(reps) > 0);
  const inputValid = validLoad && validReps;
  const complete = inputValid && load !== '' && reps !== '';
  const inputState: SetEntry['inputState'] = load === '' && reps === '' ? 'empty' : complete ? 'ready' : 'incomplete';
  return { inputValid, complete, inputState };
}

export function openTraining(database: TrainingDatabase): Promise<Training> {
  return TrainingModule.open(database);
}

class TrainingModule implements Training {
  private workout: Workout | null = null;
  private snapshot: TrainingSnapshot = { workout: null, history: [], isEnding: false, saveStatus: 'saved', hasIncompleteInput: false };
  private history: WorkoutSummary[] = [];
  private isEnding = false;
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
      training.history = await training.readHistory();
      training.publish();
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
    const rows = this.workout?.exercises.flatMap((exercise) => exercise.sets) ?? [];
    const saveStatus = (['failed', 'saving', 'editing'] as const)
      .find((status) => rows.some((row) => row.status === status)) ?? 'saved';
    this.snapshot = { history: this.history.map((entry) => ({ ...entry })), isEnding: this.isEnding, saveStatus, hasIncompleteInput: rows.some((row) => row.inputState === 'incomplete'), workout: this.workout ? {
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

  private async transaction<T>(action: () => Promise<T>): Promise<T> {
    await this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = await action();
      await this.database.exec('COMMIT');
      return result;
    } catch (error) {
      await this.database.exec('ROLLBACK');
      throw error;
    }
  }

  /** Initial hydration only; subsequent reads use the module-owned draft. */
  private async load() {
    const [workout] = await this.database.all<{ id: string; title: string; started_at: number }>(
      'SELECT id, title, started_at FROM workouts WHERE active = 1');
    if (workout) this.workout = await this.readWorkout(workout);
  }

  private async readWorkout(workout: { id: string; title: string; started_at: number }): Promise<Workout> {
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
          performed: set.performed === 1, revision: 0, status: 'saved',
          inputState: inspectInput(set.load ?? '', set.reps?.toString() ?? '').inputState, error: null })) });
    }
    return { id: workout.id, title: workout.title, startedAt: workout.started_at, exercises: entries };
  }

  private readHistory() {
    return this.database.all<WorkoutSummary>(`SELECT w.id, w.title, w.started_at AS startedAt,
      w.completed_at AS completedAt, COUNT(CASE WHEN s.performed = 1 THEN 1 END) AS performedSetCount
      FROM workouts w
      LEFT JOIN workout_exercises e ON e.workout_id = w.id
      LEFT JOIN workout_sets s ON s.workout_exercise_id = e.id
      WHERE w.active = 0 AND w.completed_at IS NOT NULL
      GROUP BY w.id ORDER BY w.completed_at DESC, w.id DESC`);
  }

  getCompletedWorkout(id: string): Promise<CompletedWorkout | null> {
    return this.enqueue(async () => {
      const [workout] = await this.database.all<{ id: string; title: string; started_at: number; completed_at: number }>(
        'SELECT id, title, started_at, completed_at FROM workouts WHERE id = ? AND active = 0 AND completed_at IS NOT NULL', [id]);
      return workout ? { ...await this.readWorkout(workout), completedAt: workout.completed_at } : null;
    });
  }

  finishWorkout(expectedWorkoutId: string): Promise<void> {
    return this.endWorkout(expectedWorkoutId, false);
  }

  /** Caller must obtain explicit discard confirmation for this exact active workout. */
  discardWorkout(expectedWorkoutId: string): Promise<void> {
    return this.endWorkout(expectedWorkoutId, true);
  }

  private endWorkout(expectedWorkoutId: string, discard: boolean): Promise<void> {
    if (this.isEnding) return Promise.reject(new Error('A workout is already being saved.'));
    this.isEnding = true;
    this.publish();
    return this.enqueue(async () => {
      if (this.workout?.id !== expectedWorkoutId) throw new Error('The active workout changed.');
      const workout = this.workout;
      if (!discard) {
        const rows = workout.exercises.flatMap((exercise) => exercise.sets);
        if (rows.some((row) => row.status !== 'saved')) throw new Error('Save or correct your latest entries before finishing.');
        if (!rows.some((row) => row.performed)) throw new Error('No performed sets. Keep training or discard this workout.');
      }
      const completedAt = Date.now();
      await this.transaction(async () => {
        const [active] = await this.database.all<{ id: string }>('SELECT id FROM workouts WHERE active = 1');
        if (active?.id !== expectedWorkoutId) throw new Error('The active workout changed.');
        if (discard) await this.database.run('DELETE FROM workouts WHERE id = ? AND active = 1', [expectedWorkoutId]);
        else await this.database.run('UPDATE workouts SET active = 0, completed_at = ? WHERE id = ? AND active = 1', [completedAt, expectedWorkoutId]);
      });
      if (!discard) this.history = [{ id: workout.id, title: workout.title, startedAt: workout.startedAt,
        completedAt, performedSetCount: summarizeWorkout(workout).performed }, ...this.history];
      this.workout = null;
      this.retryIntent.clear();
    }).finally(() => { this.isEnding = false; this.publish(); });
  }

  start(routine: Routine): Promise<boolean> {
    if (this.isEnding) return Promise.resolve(false);
    return this.enqueue(async () => {
      if (this.workout) return false;
      const workout = await this.transaction(() => this.insertWorkout(routine));
      this.workout = workout;
      this.publish();
      return true;
    });
  }

  /** Caller must obtain explicit discard confirmation for this exact active workout. */
  replaceActiveWorkout(routine: Routine, expectedWorkoutId: string): Promise<boolean> {
    if (this.isEnding) return Promise.resolve(false);
    return this.enqueue(async () => {
      if (this.workout?.id !== expectedWorkoutId) {
        throw new Error('The active workout changed. Resume it before trying again.');
      }
      const workout = await this.transaction(async () => {
        const [active] = await this.database.all<{ id: string }>('SELECT id FROM workouts WHERE active = 1');
        if (active?.id !== expectedWorkoutId) throw new Error('The active workout changed.');
        await this.database.run('DELETE FROM workouts WHERE id = ? AND active = 1', [expectedWorkoutId]);
        return this.insertWorkout(routine);
      });
      this.workout = workout;
      this.retryIntent.clear();
      this.publish();
      return true;
    });
  }

  private async insertWorkout(routine: Routine): Promise<Workout> {
    const [{ id }] = await this.database.all<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
    const startedAt = Date.now();
    await this.database.run('INSERT INTO workouts(id, routine_id, title, started_at, active) VALUES (?, ?, ?, ?, 1)',
      [id, routine.id, routine.title, startedAt]);
    const exercises: Workout['exercises'] = [];
    for (const [position, exercise] of routine.exercises.entries()) {
      const exerciseId = `${id}:${position}`;
      await this.database.run('INSERT INTO workout_exercises(id, workout_id, exercise_id, name, load_convention, position) VALUES (?, ?, ?, ?, ?, ?)',
        [exerciseId, id, exercise.exerciseId, exercise.name, exercise.loadConvention, position]);
      const sets: SetEntry[] = [];
      for (const [setPosition, set] of exercise.sets.entries()) {
        const setId = `${exerciseId}:${setPosition}`;
        await this.database.run('INSERT INTO workout_sets(id, workout_exercise_id, position, type, target_min, target_max) VALUES (?, ?, ?, ?, ?, ?)',
          [setId, exerciseId, setPosition, set.type, set.targetMin, set.targetMax]);
        sets.push({ id: setId, type: set.type, targetMin: set.targetMin, targetMax: set.targetMax,
          load: '', reps: '', performed: false, revision: 0, status: 'saved', inputState: 'empty', error: null });
      }
      exercises.push({ id: exerciseId, name: exercise.name, loadConvention: exercise.loadConvention, sets });
    }
    return { id, title: routine.title, startedAt, exercises };
  }

  private row(id: string) {
    if (this.closed) throw new Error('Training storage is closed.');
    const row = this.workout?.exercises.flatMap((exercise) => exercise.sets).find((set) => set.id === id);
    if (!row) throw new Error('Set not found in the active workout.');
    return row;
  }

  editSet(id: string, patch: Partial<Pick<SetEntry, 'load' | 'reps'>>) {
    if (this.isEnding) return Promise.resolve(false);
    const row = this.row(id);
    Object.assign(row, patch);
    row.inputState = inspectInput(row.load, row.reps).inputState;
    return this.save(row, patch.reps === '' ? false : undefined);
  }

  setPerformed(id: string, performed: boolean) {
    if (this.isEnding) return Promise.resolve(false);
    return this.save(this.row(id), performed);
  }

  retrySet(id: string) {
    if (this.isEnding) return Promise.resolve(false);
    return this.save(this.row(id), this.retryIntent.get(id));
  }

  async retryFailedSaves() {
    const rows = this.workout?.exercises.flatMap((exercise) => exercise.sets) ?? [];
    const results = await Promise.all(rows.filter((row) => row.status === 'failed').map((row) => this.retrySet(row.id)));
    return results.every(Boolean);
  }

  blurSet(id: string) {
    if (this.isEnding) return Promise.resolve(false);
    const row = this.row(id);
    if (row.reps === '' || row.load === '') return this.save(row, false);
    return Promise.resolve(false);
  }

  private save(row: SetEntry, performed?: boolean): Promise<boolean> {
    const workoutId = this.workout?.id;
    const { load, reps } = row;
    const { inputValid, complete } = inspectInput(load, reps);
    // Checking validates performance; it must not invalidate an existing save acknowledgement.
    if (performed === true && (!inputValid || !complete)) {
      row.error = 'Enter a nonnegative load (up to 2 decimals) and positive whole reps.';
      this.publish();
      return Promise.resolve(false);
    }
    const revision = ++row.revision;
    this.retryIntent.set(row.id, performed);
    if (!inputValid && performed !== false) {
      row.status = 'editing';
      row.error = 'Enter a nonnegative load (up to 2 decimals) and positive whole reps.';
      this.publish();
      return Promise.resolve(false);
    }
    row.status = 'saving';
    row.error = null;
    this.publish();
    return this.enqueue(async () => {
      if (this.workout?.id !== workoutId) return false;
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
