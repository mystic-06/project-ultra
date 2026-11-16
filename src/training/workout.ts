import { catalogueExercise, searchExercises, type CatalogueExercise, type EntryMode } from './catalogue';
import { changeWorkout, persistWorkoutStructure, type WorkoutChange } from './workout-changes';
import type { TrainingDatabase } from './database';
import { migrate } from './migrations';
import { routineFromDraft, upperStarter, validateRoutine, type Routine } from './routines';

export type LoadUnit = 'kg' | 'lb';

/** Convert from the recorded measurement, never from a rounded display value. */
export function formatLoad(value: string, from: LoadUnit, to: LoadUnit): string {
  if (value === '') return '';
  const number = Number(value);
  const converted = from === to ? number : from === 'lb' ? number * 0.45359237 : number / 0.45359237;
  return Number(converted.toFixed(2)).toString();
}

export type SaveStatus = 'editing' | 'saving' | 'saved' | 'failed';
export interface EquipmentSetup { id: string; label: string | null; gym: string | null; ratio: string | null; archived: boolean }
export interface SetEntry {
  equipmentSetupId: string | null;
  bodyweight: string | null; bodyweightUnit: LoadUnit; bodyweightFraction: number | null; bodyweightLoad: number | null;
  id: string;
  type: 'normal' | 'warmup' | 'drop';
  targetMin: number;
  targetMax: number;
  load: string;
  originalLoad: string;
  loadUnit: LoadUnit;
  reps: string;
  repsLeft: string;
  repsRight: string;
  rpe: string;
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
  bodyweight: string | null;
  bodyweightUnit: LoadUnit;
  exercises: { id: string; exerciseId: string; equipmentSetupId: string | null; entryMode: EntryMode; bodyweight: string | null; bodyweightUnit: LoadUnit; bodyweightFraction: number | null; name: string; loadConvention: string; restSeconds?: number; sets: SetEntry[] }[];
}
export interface CompletedWorkout extends Workout { completedAt: number }
export interface WorkoutSummary {
  exerciseNames: string[];
  id: string; title: string; startedAt: number; completedAt: number; performedSetCount: number;
}
export function setResultState(set: SetEntry): 'performed' | 'unfinished' | 'untouched' {
  return set.performed ? 'performed' : set.load !== '' || set.reps !== '' || set.repsLeft !== '' || set.repsRight !== '' || set.rpe !== '' ? 'unfinished' : 'untouched';
}
export function summarizeWorkout(workout: Workout) {
  const counts = { performed: 0, unfinished: 0, untouched: 0 };
  workout.exercises.forEach((exercise) => exercise.sets.forEach((set) => { counts[setResultState(set)]++; }));
  return counts;
}
export interface RestSettings { automatic: boolean; defaultSeconds: number }
export interface RestTimer { state: 'idle' | 'running' | 'finished'; deadline: number | null; remainingSeconds: number }

export interface BodyweightSettings { bodyweight: string | null; bodyweightUnit?: LoadUnit; writeback: boolean; setupComplete: boolean }

export interface TrainingSnapshot {
  bodyweightSettings: BodyweightSettings;
  routines: Routine[]; routineDraft: string | null;
  loadUnit: LoadUnit; restSettings: RestSettings; restDeadline: number | null;
  equipmentSetups: EquipmentSetup[]; workout: Workout | null; history: WorkoutSummary[]; isEnding: boolean; isAdapting: boolean;
  saveStatus: SaveStatus; hasIncompleteInput: boolean;
}

export interface WeeklyActivity { startedAt: number; endsAt: number; completedCount: number }

export interface Training {
  setBodyweightSettings(settings: Partial<BodyweightSettings>): Promise<void>;
  setBodyweightDetails(exerciseId: string, details: { bodyweight?: string | null; fraction?: number | null }): Promise<void>;
  setWorkoutBodyweight(exerciseId: string, bodyweight: string | null): Promise<void>;
  setExerciseFraction(exerciseId: string, fraction: number | null): Promise<void>;
  createEquipmentSetup(input: Pick<EquipmentSetup, 'label' | 'gym' | 'ratio'>): Promise<EquipmentSetup>;
  archiveEquipmentSetup(id: string, archived: boolean): Promise<void>;
  selectEquipmentSetup(exerciseId: string, setupId: string | null): Promise<void>;
  correctSetEquipment(setId: string, setupId: string | null): Promise<void>;
  saveRoutineDraft(data: string): Promise<void>;
  discardRoutineDraft(): Promise<void>;
  saveRoutine(routine: Routine): Promise<void>;
  commitRoutineDraft(data: string): Promise<void>;
  deleteRoutine(id: string): Promise<void>;
  getWeeklyActivity(at?: number): WeeklyActivity;
  getRestTimer(): RestTimer;
  setLoadUnit(unit: LoadUnit): Promise<void>;
  setRestSettings(settings: RestSettings): Promise<void>;
  startRest(seconds: number): Promise<void>;
  adjustRest(seconds: number): Promise<void>;
  skipRest(): Promise<void>;
  getSnapshot(): TrainingSnapshot;
  subscribe(listener: () => void): () => void;
  searchExercises(query?: string): CatalogueExercise[];
  adaptWorkout(expectedWorkoutId: string, change: WorkoutChange): Promise<void>;
  start(routine?: Routine): Promise<boolean>;
  replaceActiveWorkout(routine: Routine, expectedWorkoutId: string): Promise<boolean>;
  editSet(id: string, patch: Partial<Pick<SetEntry, 'load' | 'reps' | 'repsLeft' | 'repsRight' | 'rpe' | 'type'>>): Promise<boolean>;
  setPerformed(id: string, performed: boolean): Promise<boolean>;
  retrySet(id: string): Promise<boolean>;
  retryFailedSaves(): Promise<boolean>;
  blurSet(id: string): Promise<boolean>;
  finishWorkout(expectedWorkoutId: string): Promise<void>;
  discardWorkout(expectedWorkoutId: string): Promise<void>;
  getCompletedWorkout(id: string): Promise<CompletedWorkout | null>;
  close(): Promise<void>;
}

function isValidLoad(load: string) {
  return load === '' || (/^\d+(?:\.\d{1,2})?$/.test(load) && Number.isFinite(Number(load)));
}

function inspectInput(set: Pick<SetEntry, 'load' | 'reps' | 'repsLeft' | 'repsRight' | 'rpe'>, mode: EntryMode) {
  const { load, reps, repsLeft, repsRight, rpe } = set;
  const validLoad = isValidLoad(load);
  const whole = (value: string) => value === '' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)));
  const validReps = mode === 'unilateral' ? whole(repsLeft) && whole(repsRight) : whole(reps) && (reps === '' || Number(reps) > 0);
  const validRpe = rpe === '' || (/^\d+(?:\.\d)?$/.test(rpe) && Number(rpe) >= 1 && Number(rpe) <= 10 && Number(rpe) * 2 % 1 === 0);
  const inputValid = validLoad && validReps && validRpe;
  const hasReps = mode === 'unilateral' ? Number(repsLeft) > 0 || Number(repsRight) > 0 : reps !== '';
  const complete = inputValid && (mode === 'bodyweight' || load !== '') && hasReps;
  const empty = load === '' && (mode === 'unilateral' ? repsLeft === '' && repsRight === '' : reps === '') && rpe === '';
  const inputState: SetEntry['inputState'] = empty ? 'empty' : complete ? 'ready' : 'incomplete';
  return { inputValid, complete, inputState };
}

function validBodyweight(value: string) { return /^\d+(?:\.\d{1,2})?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 0; }

export function openTraining(database: TrainingDatabase, now: () => number = Date.now): Promise<Training> {
  return TrainingModule.open(database, now);
}

class TrainingModule implements Training {
  private workout: Workout | null = null;
  private uncheckRevision = new Map<string, number>();
  private pendingChecks = new Map<string, number>();
  private pendingUnchecks = new Map<string, number>();
  private bodyweightSettings: BodyweightSettings = { bodyweight: null, bodyweightUnit: 'kg', writeback: false, setupComplete: false };
  private snapshot: TrainingSnapshot = { bodyweightSettings: this.bodyweightSettings, routines: [], routineDraft: null, loadUnit: 'kg', equipmentSetups: [], restSettings: { automatic: true, defaultSeconds: 90 }, restDeadline: null, workout: null, history: [], isEnding: false, isAdapting: false, saveStatus: 'saved', hasIncompleteInput: false };
  private loadUnit: LoadUnit = 'kg';
  private history: WorkoutSummary[] = [];
  private restSettings: RestSettings = { automatic: true, defaultSeconds: 90 };
  private restDeadline: number | null = null;
  private equipmentSetups: EquipmentSetup[] = [];
  private routines: Routine[] = [];
  private routineDraft: string | null = null;
  private isEnding = false;
  private isAdapting = false;
  private listeners = new Set<() => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  private closing?: Promise<void>;
  private retryIntent = new Map<string, boolean | undefined>();
  private invalidatedChecks = new Set<string>();

  private constructor(private database: TrainingDatabase, private now: () => number) {}

  static async open(database: TrainingDatabase, now: () => number) {
    try {
      await migrate(database);
      const training = new TrainingModule(database, now);
      await training.load();
      await training.loadEquipment();
      // Seed once; deleting the starter must remain effective after reopening.
      await training.transaction(async () => {
        await training.database.run("INSERT OR IGNORE INTO routines(id, data) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM routine_seed)", [upperStarter.id, JSON.stringify(upperStarter)]);
        await training.database.run("INSERT OR IGNORE INTO routine_seed(id) VALUES (1)", []);
      });
      await training.loadRoutines();
      training.history = await training.readHistory();
      training.publish();
      return training;
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  private async loadRoutines() {
    const rows = await this.database.all<{ data: string }>('SELECT data FROM routines ORDER BY rowid');
    this.routines = rows.map((row) => JSON.parse(row.data) as Routine);
    const [draft] = await this.database.all<{ data: string }>('SELECT data FROM routine_draft WHERE id = 1', []);
    this.routineDraft = draft?.data ?? null;
  }

  saveRoutineDraft(data: string): Promise<void> {
    return this.enqueue(async () => {
      await this.database.run('INSERT OR REPLACE INTO routine_draft(id, data) VALUES (1, ?)', [data]);
      this.routineDraft = data; this.publish();
    });
  }
  discardRoutineDraft(): Promise<void> {
    return this.enqueue(async () => {
      await this.database.run('DELETE FROM routine_draft WHERE id = 1', []);
      this.routineDraft = null; this.publish();
    });
  }
  commitRoutineDraft(data: string): Promise<void> {
    try { return this.saveRoutine(routineFromDraft(data)); }
    catch (error) { return Promise.reject(error); }
  }
  saveRoutine(routine: Routine): Promise<void> {
    let saved: string;
    try { saved = JSON.stringify(validateRoutine(routine)); }
    catch (error) { return Promise.reject(error); }
    return this.enqueue(async () => {
      await this.transaction(async () => {
        await this.database.run('INSERT INTO routines(id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', [routine.id, saved]);
        await this.database.run('DELETE FROM routine_draft WHERE id = 1', []);
      });
      await this.loadRoutines(); this.publish();
    });
  }
  deleteRoutine(id: string): Promise<void> {
    return this.enqueue(async () => {
      await this.database.run('DELETE FROM routines WHERE id = ?', [id]);
      await this.loadRoutines(); this.publish();
    });
  }


  setBodyweightSettings(settings: Partial<BodyweightSettings>): Promise<void> {
    if (settings.bodyweight != null && !validBodyweight(settings.bodyweight)) return Promise.reject(new Error('Enter a positive bodyweight with up to two decimals.'));
    const enteredUnit = settings.bodyweightUnit ?? this.loadUnit;
    return this.enqueue(async () => {
      const next = { ...this.bodyweightSettings, ...settings, bodyweightUnit: settings.bodyweight !== undefined ? enteredUnit : this.bodyweightSettings.bodyweightUnit };
      await this.database.run('UPDATE bodyweight_settings SET bodyweight = ?, bodyweight_unit = ?, writeback = ?, setup_complete = ? WHERE id = 1', [next.bodyweight, next.bodyweightUnit ?? 'kg', next.writeback ? 1 : 0, next.setupComplete ? 1 : 0]);
      this.bodyweightSettings = next; this.publish();
    });
  }

  setBodyweightDetails(exerciseId: string, details: { bodyweight?: string | null; fraction?: number | null }): Promise<void> {
    if (details.bodyweight != null && !validBodyweight(details.bodyweight)) return Promise.reject(new Error('Enter a positive bodyweight with up to two decimals.'));
    if (details.fraction != null && (!Number.isFinite(details.fraction) || details.fraction < 0 || details.fraction > 1)) return Promise.reject(new Error('Enter a fraction from 0 to 1.'));
    return this.updateBodyweightExercise(exerciseId, details.bodyweight, details.fraction, details.bodyweight === undefined ? undefined : this.loadUnit);
  }

  setWorkoutBodyweight(exerciseId: string, bodyweight: string | null): Promise<void> {
    if (bodyweight !== null && !validBodyweight(bodyweight)) return Promise.reject(new Error('Enter a positive bodyweight with up to two decimals.'));
    return this.updateBodyweightExercise(exerciseId, bodyweight, undefined, this.loadUnit);
  }
  setExerciseFraction(exerciseId: string, fraction: number | null): Promise<void> {
    if (fraction !== null && (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)) return Promise.reject(new Error('Enter a fraction from 0 to 1.'));
    return this.updateBodyweightExercise(exerciseId, undefined, fraction);
  }
  private updateBodyweightExercise(exerciseId: string, bodyweight: string | null | undefined, fraction: number | null | undefined, enteredUnit?: LoadUnit): Promise<void> {
    if (this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change.'));
    this.isAdapting = true; this.publish();
    return this.enqueue(async () => {
      const exercise = this.workout?.exercises.find((item) => item.id === exerciseId);
      if (!exercise || exercise.entryMode !== 'bodyweight') throw new Error('Bodyweight exercise not found.');
      const workout = this.workout!;
      const weight = bodyweight === undefined ? workout.bodyweight : bodyweight;
      const unit = enteredUnit ?? workout.bodyweightUnit;
      const targets = bodyweight === undefined ? [exercise] : workout.exercises.filter((item) => item.entryMode === 'bodyweight');
      await this.transaction(async () => {
        if (bodyweight !== undefined) await this.database.run('UPDATE workouts SET bodyweight = ?, bodyweight_unit = ? WHERE id = ?', [weight, unit, workout.id]);
        for (const target of targets) {
          const share = target.id === exercise.id && fraction !== undefined ? fraction : target.bodyweightFraction;
          const calculated = weight !== null && share !== null ? Number(weight) * share : null;
          await this.database.run('UPDATE workout_exercises SET bodyweight = ?, bodyweight_unit = ?, bodyweight_fraction = ? WHERE id = ?', [weight, unit, share, target.id]);
          await this.database.run('UPDATE workout_sets SET bodyweight = ?, bodyweight_unit = ?, bodyweight_fraction = ?, bodyweight_load = ? WHERE workout_exercise_id = ?', [weight, unit, share, calculated, target.id]);
        }
        if (fraction !== undefined) await this.database.run('INSERT INTO exercise_fractions(exercise_id, fraction) VALUES (?, ?) ON CONFLICT(exercise_id) DO UPDATE SET fraction = excluded.fraction', [exercise.exerciseId, fraction]);
        if (bodyweight !== undefined && this.bodyweightSettings.writeback) await this.database.run('UPDATE bodyweight_settings SET bodyweight = ?, bodyweight_unit = ? WHERE id = 1', [weight, unit]);
      });
      if (bodyweight !== undefined) { workout.bodyweight = weight; workout.bodyweightUnit = unit; }
      for (const target of targets) {
        const share = target.id === exercise.id && fraction !== undefined ? fraction : target.bodyweightFraction;
        const calculated = weight !== null && share !== null ? Number(weight) * share : null;
        target.bodyweight = weight; target.bodyweightUnit = unit; target.bodyweightFraction = share;
        target.sets.forEach((set) => { set.bodyweight = weight; set.bodyweightUnit = unit; set.bodyweightFraction = share; set.bodyweightLoad = calculated; });
      }
      if (bodyweight !== undefined && this.bodyweightSettings.writeback) { this.bodyweightSettings.bodyweight = weight; this.bodyweightSettings.bodyweightUnit = unit; }
    }).finally(() => { this.isAdapting = false; this.publish(); });
  }

  getWeeklyActivity(at = this.now()): WeeklyActivity {
    const date = new Date(at);
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 6) % 7);
    const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
    const startedAt = monday.getTime();
    const endsAt = nextMonday.getTime();
    return { startedAt, endsAt, completedCount: this.history.filter((entry) => entry.completedAt >= startedAt && entry.completedAt < endsAt).length };
  }

  getRestTimer(): RestTimer {
    const remainingSeconds = this.restDeadline === null ? 0 : Math.max(0, Math.ceil((this.restDeadline - this.now()) / 1000));
    return { deadline: this.restDeadline, remainingSeconds, state: this.restDeadline === null ? 'idle' : remainingSeconds ? 'running' : 'finished' };
  }

  setLoadUnit(unit: LoadUnit): Promise<void> {
    if (unit !== 'kg' && unit !== 'lb') return Promise.reject(new Error('Invalid load unit.'));
    if (this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change.'));
    const rows = this.workout?.exercises.flatMap((exercise) => exercise.sets) ?? [];
    if (rows.some((row) => !isValidLoad(row.load))) return Promise.reject(new Error('Complete or clear the unfinished load before changing units.'));
    this.isAdapting = true; this.publish();
    return this.enqueue(async () => {
      await this.transaction(() => this.database.run('UPDATE load_settings SET unit = ? WHERE id = 1', [unit]));
      this.loadUnit = unit;
      for (const row of rows) row.load = formatLoad(row.originalLoad, row.loadUnit, unit);
    }).finally(() => { this.isAdapting = false; this.publish(); });
  }

  setRestSettings(settings: RestSettings): Promise<void> {
    if (!Number.isSafeInteger(settings.defaultSeconds) || settings.defaultSeconds < 1 || settings.defaultSeconds > 86400) return Promise.reject(new Error('Enter a duration from 1 to 86400 seconds.'));
    return this.enqueue(async () => {
      await this.database.run('UPDATE rest_settings SET automatic = ?, default_seconds = ? WHERE id = 1', [settings.automatic ? 1 : 0, settings.defaultSeconds]);
      this.restSettings = { ...settings }; this.publish();
    });
  }

  startRest(seconds: number): Promise<void> {
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) return Promise.reject(new Error('Enter a duration from 1 to 86400 seconds.'));
    return this.setRestDeadline(() => this.now() + seconds * 1000);
  }
  adjustRest(seconds: number): Promise<void> {
    if (!Number.isSafeInteger(seconds) || seconds === 0 || Math.abs(seconds) > 86400) return Promise.reject(new Error('Invalid adjustment.'));
    return this.setRestDeadline(() => {
      if (this.restDeadline === null) throw new Error('Start rest first.');
      return Math.min(this.now() + 86400000, Math.max(this.now(), Math.max(this.now(), this.restDeadline) + seconds * 1000));
    });
  }
  skipRest(): Promise<void> { return this.setRestDeadline(() => null); }
  private setRestDeadline(calculate: () => number | null): Promise<void> {
    return this.enqueue(async () => {
      if (!this.workout) throw new Error('Start a workout first.');
      const deadline = calculate();
      await this.database.run('UPDATE workouts SET rest_deadline = ? WHERE id = ? AND active = 1', [deadline, this.workout.id]);
      this.restDeadline = deadline; this.publish();
    });
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish() {
    const rows = this.workout?.exercises.flatMap((exercise) => exercise.sets) ?? [];
    const saveStatus = this.isAdapting ? 'saving' : (['failed', 'saving', 'editing'] as const)
      .find((status) => rows.some((row) => row.status === status)) ?? 'saved';
    this.snapshot = { bodyweightSettings: { ...this.bodyweightSettings }, loadUnit: this.loadUnit, routines: JSON.parse(JSON.stringify(this.routines)), routineDraft: this.routineDraft, equipmentSetups: this.equipmentSetups.map((setup) => ({ ...setup })), restSettings: { ...this.restSettings }, restDeadline: this.restDeadline, history: this.history.map((entry) => ({ ...entry, exerciseNames: [...entry.exerciseNames] })), isEnding: this.isEnding, isAdapting: this.isAdapting, saveStatus, hasIncompleteInput: rows.some((row) => row.inputState === 'incomplete'), workout: this.workout ? {
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
    const [loadSettings] = await this.database.all<{ unit: LoadUnit }>('SELECT unit FROM load_settings WHERE id = 1');
    this.loadUnit = loadSettings.unit;
    const [workout] = await this.database.all<{ id: string; title: string; started_at: number; bodyweight: string | null; bodyweight_unit: LoadUnit }>(
      'SELECT id, title, started_at, bodyweight, bodyweight_unit FROM workouts WHERE active = 1');
    const [settings] = await this.database.all<{ automatic: number; default_seconds: number }>('SELECT automatic, default_seconds FROM rest_settings WHERE id = 1');
    this.restSettings = { automatic: settings.automatic === 1, defaultSeconds: settings.default_seconds };
    const [bodyweight] = await this.database.all<{ bodyweight: string | null; bodyweight_unit: LoadUnit; writeback: number; setup_complete: number }>('SELECT * FROM bodyweight_settings WHERE id = 1');
    this.bodyweightSettings = { bodyweight: bodyweight.bodyweight, bodyweightUnit: bodyweight.bodyweight_unit, writeback: bodyweight.writeback === 1, setupComplete: bodyweight.setup_complete === 1 };
    if (workout) {
      this.workout = await this.readWorkout(workout);
      const [timer] = await this.database.all<{ rest_deadline: number | null }>('SELECT rest_deadline FROM workouts WHERE id = ?', [workout.id]);
      this.restDeadline = timer.rest_deadline;
    }
  }

  private async readWorkout(workout: { id: string; title: string; started_at: number; bodyweight: string | null; bodyweight_unit: LoadUnit }): Promise<Workout> {
    const exercises = await this.database.all<{ id: string; exercise_id: string; equipment_setup_id: string | null; entry_mode: EntryMode; name: string; load_convention: string; rest_seconds: number | null; bodyweight: string | null; bodyweight_unit: LoadUnit; bodyweight_fraction: number | null }>(
      'SELECT id, exercise_id, equipment_setup_id, entry_mode, name, load_convention, rest_seconds, bodyweight, bodyweight_unit, bodyweight_fraction FROM workout_exercises WHERE workout_id = ? ORDER BY position', [workout.id]);
    const entries = [];
    for (const exercise of exercises) {
      const sets = await this.database.all<{
        id: string; type: SetEntry['type']; target_min: number; target_max: number;
        load: string | null; load_unit: LoadUnit; reps: number | null; reps_left: number | null; reps_right: number | null; rpe: string | null; performed: number; equipment_setup_id: string | null; bodyweight: string | null; bodyweight_unit: LoadUnit; bodyweight_fraction: number | null; bodyweight_load: number | null;
      }>('SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position', [exercise.id]);
      entries.push({ id: exercise.id, exerciseId: exercise.exercise_id, equipmentSetupId: exercise.equipment_setup_id, entryMode: exercise.entry_mode, bodyweight: exercise.bodyweight, bodyweightUnit: exercise.bodyweight_unit, bodyweightFraction: exercise.bodyweight_fraction, name: exercise.name, loadConvention: exercise.load_convention, restSeconds: exercise.rest_seconds ?? undefined,
        sets: sets.map((set): SetEntry => ({ id: set.id, equipmentSetupId: set.equipment_setup_id, bodyweight: set.bodyweight, bodyweightUnit: set.bodyweight_unit, bodyweightFraction: set.bodyweight_fraction, bodyweightLoad: set.bodyweight_load, type: set.type, targetMin: set.target_min,
          targetMax: set.target_max, originalLoad: set.load ?? '', loadUnit: set.load_unit, load: formatLoad(set.load ?? '', set.load_unit, this.loadUnit), reps: set.reps?.toString() ?? '', repsLeft: set.reps_left?.toString() ?? '', repsRight: set.reps_right?.toString() ?? '', rpe: set.rpe ?? '',
          performed: set.performed === 1, revision: 0, status: 'saved',
          inputState: inspectInput({ load: set.load ?? '', reps: set.reps?.toString() ?? '', repsLeft: set.reps_left?.toString() ?? '', repsRight: set.reps_right?.toString() ?? '', rpe: set.rpe ?? '' }, exercise.entry_mode).inputState, error: null })) });
    }
    return { id: workout.id, title: workout.title, startedAt: workout.started_at, bodyweight: workout.bodyweight, bodyweightUnit: workout.bodyweight_unit, exercises: entries };
  }

  private async readHistory() {
    const summaries = await this.database.all<Omit<WorkoutSummary, 'exerciseNames'>>(`SELECT w.id, w.title, w.started_at AS startedAt,
      w.completed_at AS completedAt, COUNT(CASE WHEN s.performed = 1 THEN 1 END) AS performedSetCount
      FROM workouts w
      LEFT JOIN workout_exercises e ON e.workout_id = w.id
      LEFT JOIN workout_sets s ON s.workout_exercise_id = e.id
      WHERE w.active = 0 AND w.completed_at IS NOT NULL
      GROUP BY w.id ORDER BY w.completed_at DESC, w.id DESC`);
    const exercises = await this.database.all<{ workout_id: string; name: string }>(
      `SELECT e.workout_id, e.name FROM workout_exercises e JOIN workouts w ON w.id = e.workout_id
       WHERE w.active = 0 AND w.completed_at IS NOT NULL ORDER BY e.workout_id, e.position`);
    const names = new Map<string, string[]>();
    for (const exercise of exercises) {
      const list = names.get(exercise.workout_id) ?? [];
      list.push(exercise.name);
      names.set(exercise.workout_id, list);
    }
    return summaries.map((summary) => ({ ...summary, exerciseNames: names.get(summary.id) ?? [] }));
  }

  getCompletedWorkout(id: string): Promise<CompletedWorkout | null> {
    return this.enqueue(async () => {
      const [workout] = await this.database.all<{ id: string; title: string; started_at: number; completed_at: number; bodyweight: string | null; bodyweight_unit: LoadUnit }>(
        'SELECT id, title, started_at, completed_at, bodyweight, bodyweight_unit FROM workouts WHERE id = ? AND active = 0 AND completed_at IS NOT NULL', [id]);
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
    if (this.isEnding || this.isAdapting) return Promise.reject(new Error('A workout is already being saved.'));
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
      const completedAt = this.now();
      await this.transaction(async () => {
        const [active] = await this.database.all<{ id: string }>('SELECT id FROM workouts WHERE active = 1');
        if (active?.id !== expectedWorkoutId) throw new Error('The active workout changed.');
        if (discard) await this.database.run('DELETE FROM workouts WHERE id = ? AND active = 1', [expectedWorkoutId]);
        else await this.database.run('UPDATE workouts SET active = 0, completed_at = ? WHERE id = ? AND active = 1', [completedAt, expectedWorkoutId]);
      });
      if (!discard) this.history = [{ id: workout.id, title: workout.title, startedAt: workout.startedAt,
        completedAt, exerciseNames: workout.exercises.map((exercise) => exercise.name), performedSetCount: summarizeWorkout(workout).performed }, ...this.history];
      this.workout = null;
      this.restDeadline = null;
      this.retryIntent.clear();
      this.invalidatedChecks.clear();
    }).finally(() => { this.isEnding = false; this.publish(); });
  }

  private async loadEquipment() {
    const rows = await this.database.all<{ id: string; label: string | null; gym: string | null; ratio: string | null; archived: number }>('SELECT * FROM equipment_setups ORDER BY rowid');
    this.equipmentSetups = rows.map((row) => ({ ...row, archived: row.archived === 1 }));
  }

  createEquipmentSetup(input: Pick<EquipmentSetup, 'label' | 'gym' | 'ratio'>): Promise<EquipmentSetup> {
    return this.enqueue(async () => {
      const clean = (value: string | null) => value?.trim() || null;
      const [{ id }] = await this.database.all<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
      let label = clean(input.label);
      if (label === null) {
        const used = new Set(this.equipmentSetups.map((item) => item.label?.toLowerCase()));
        let number = 1;
        while (used.has(`equipment ${number}`)) number++;
        label = `Equipment ${number}`;
      }
      const setup = { id, label, gym: clean(input.gym), ratio: clean(input.ratio), archived: false };
      await this.database.run('INSERT INTO equipment_setups(id, label, gym, ratio) VALUES (?, ?, ?, ?)', [id, setup.label, setup.gym, setup.ratio]);
      this.equipmentSetups.push(setup); this.publish(); return { ...setup };
    });
  }

  archiveEquipmentSetup(id: string, archived: boolean): Promise<void> {
    return this.enqueue(async () => {
      const setup = this.equipmentSetups.find((item) => item.id === id);
      if (!setup) throw new Error('Equipment setup not found.');
      await this.database.run('UPDATE equipment_setups SET archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
      setup.archived = archived; this.publish();
    });
  }

  private validateEquipment(setupId: string | null) {
    if (setupId !== null && !this.equipmentSetups.some((item) => item.id === setupId && !item.archived)) throw new Error('Equipment setup is unavailable.');
  }

  selectEquipmentSetup(exerciseId: string, setupId: string | null): Promise<void> {
    if (this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change.'));
    this.isAdapting = true; this.publish();
    return this.enqueue(async () => {
      const exercise = this.workout?.exercises.find((item) => item.id === exerciseId);
      if (!exercise || !['machine', 'cable'].includes(catalogueExercise(exercise.exerciseId).equipment)) throw new Error('Equipment is unavailable for this exercise.');
      this.validateEquipment(setupId);
      await this.transaction(async () => {
        await this.database.run('UPDATE workout_exercises SET equipment_setup_id = ? WHERE id = ?', [setupId, exerciseId]);
        await this.database.run('UPDATE workout_sets SET equipment_setup_id = ? WHERE workout_exercise_id = ? AND performed = 0', [setupId, exerciseId]);
        await this.database.run('INSERT INTO equipment_last_selection(exercise_id, setup_id) VALUES (?, ?) ON CONFLICT(exercise_id) DO UPDATE SET setup_id = excluded.setup_id', [exercise.exerciseId, setupId]);
      });
      exercise.equipmentSetupId = setupId;
      exercise.sets.forEach((set) => { if (!set.performed) set.equipmentSetupId = setupId; });
    }).finally(() => { this.isAdapting = false; this.publish(); });
  }

  correctSetEquipment(setId: string, setupId: string | null): Promise<void> {
    if (this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change.'));
    this.isAdapting = true; this.publish();
    return this.enqueue(async () => {
      const exercise = this.workout?.exercises.find((item) => item.sets.some((set) => set.id === setId));
      const set = exercise?.sets.find((item) => item.id === setId);
      if (!exercise || !set || !set.performed || !['machine', 'cable'].includes(catalogueExercise(exercise.exerciseId).equipment)) throw new Error('Checked set not found.');
      this.validateEquipment(setupId);
      await this.database.run('UPDATE workout_sets SET equipment_setup_id = ? WHERE id = ?', [setupId, setId]);
      set.equipmentSetupId = setupId;
    }).finally(() => { this.isAdapting = false; this.publish(); });
  }

  searchExercises = searchExercises;

  adaptWorkout(expectedWorkoutId: string, change: WorkoutChange): Promise<void> {
    if (this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change to finish.'));
    this.isAdapting = true;
    this.publish();
    return this.enqueue(async () => {
      if (this.workout?.id !== expectedWorkoutId) throw new Error('The active workout changed.');
      const previous = this.workout;
      const next = await this.transaction(async () => {
        const [active] = await this.database.all<{ id: string }>('SELECT id FROM workouts WHERE active = 1');
        if (active?.id !== expectedWorkoutId) throw new Error('The active workout changed.');
        const result = await changeWorkout(previous, change, async () => {
          const [{ id }] = await this.database.all<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
          return id;
        });
        for (const exercise of result.exercises) {
          if (!previous.exercises.some((item) => item.id === exercise.id)) {
            const [selection] = await this.database.all<{ setup_id: string | null }>('SELECT l.setup_id FROM equipment_last_selection l LEFT JOIN equipment_setups s ON s.id = l.setup_id WHERE l.exercise_id = ? AND (l.setup_id IS NULL OR s.archived = 0)', [exercise.exerciseId]);
            exercise.equipmentSetupId = selection?.setup_id ?? null;
            if (exercise.entryMode === 'bodyweight') {
              const [fraction] = await this.database.all<{ fraction: number | null }>('SELECT fraction FROM exercise_fractions WHERE exercise_id = ?', [exercise.exerciseId]);
              exercise.bodyweight = previous.bodyweight; exercise.bodyweightUnit = previous.bodyweightUnit; exercise.bodyweightFraction = fraction?.fraction ?? null;
              exercise.sets.forEach((set) => { set.bodyweight = exercise.bodyweight; set.bodyweightUnit = exercise.bodyweightUnit; set.bodyweightFraction = exercise.bodyweightFraction; set.bodyweightLoad = exercise.bodyweight !== null && exercise.bodyweightFraction !== null ? Number(exercise.bodyweight) * exercise.bodyweightFraction : null; });
            }
            exercise.sets.forEach((set) => { set.equipmentSetupId = exercise.equipmentSetupId; });
          }
        }
        await persistWorkoutStructure(this.database, previous, result);
        return result;
      });
      this.workout = next;
      const remaining = new Set(next.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id)));
      for (const id of this.retryIntent.keys()) if (!remaining.has(id)) this.retryIntent.delete(id);
    }).finally(() => { this.isAdapting = false; this.publish(); });
  }

  start(routine: Routine = { id: 'unplanned', title: 'Workout', exercises: [] }): Promise<boolean> {
    if (this.isEnding || this.isAdapting) return Promise.resolve(false);
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
    if (this.isEnding || this.isAdapting) return Promise.resolve(false);
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
      this.restDeadline = null;
      this.retryIntent.clear();
      this.invalidatedChecks.clear();
      this.publish();
      return true;
    });
  }

  private async insertWorkout(routine: Routine): Promise<Workout> {
    const [{ id }] = await this.database.all<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
    const startedAt = this.now();
    await this.database.run('INSERT INTO workouts(id, routine_id, title, started_at, active, bodyweight, bodyweight_unit) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [id, routine.id, routine.title, startedAt, this.bodyweightSettings.bodyweight, this.bodyweightSettings.bodyweightUnit ?? 'kg']);
    const exercises: Workout['exercises'] = [];
    for (const [position, exercise] of routine.exercises.entries()) {
      if (exercise.restSeconds !== undefined && (!Number.isSafeInteger(exercise.restSeconds) || exercise.restSeconds < 1 || exercise.restSeconds > 86400)) throw new Error('Invalid routine rest duration.');
      const exerciseId = `${id}:${position}`;
      await this.database.run('INSERT INTO workout_exercises(id, workout_id, exercise_id, name, load_convention, position, entry_mode, rest_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [exerciseId, id, exercise.exerciseId, exercise.name, exercise.loadConvention, position, exercise.entryMode ?? 'weighted', exercise.restSeconds ?? null]);
      const [selection] = await this.database.all<{ setup_id: string | null }>('SELECT l.setup_id FROM equipment_last_selection l LEFT JOIN equipment_setups s ON s.id = l.setup_id WHERE l.exercise_id = ? AND (l.setup_id IS NULL OR s.archived = 0)', [exercise.exerciseId]);
      const equipmentSetupId = selection?.setup_id ?? null;
      await this.database.run('UPDATE workout_exercises SET equipment_setup_id = ? WHERE id = ?', [equipmentSetupId, exerciseId]);
      const [fraction] = await this.database.all<{ fraction: number | null }>('SELECT fraction FROM exercise_fractions WHERE exercise_id = ?', [exercise.exerciseId]);
      const bodyweight = exercise.entryMode === 'bodyweight' ? this.bodyweightSettings.bodyweight : null;
      const bodyweightUnit = this.bodyweightSettings.bodyweightUnit ?? 'kg';
      const bodyweightFraction = exercise.entryMode === 'bodyweight' ? fraction?.fraction ?? null : null;
      await this.database.run('UPDATE workout_exercises SET bodyweight = ?, bodyweight_unit = ?, bodyweight_fraction = ? WHERE id = ?', [bodyweight, bodyweightUnit, bodyweightFraction, exerciseId]);
      const sets: SetEntry[] = [];
      for (const [setPosition, set] of exercise.sets.entries()) {
        const setId = `${exerciseId}:${setPosition}`;
        await this.database.run('INSERT INTO workout_sets(id, workout_exercise_id, position, type, target_min, target_max) VALUES (?, ?, ?, ?, ?, ?)',
          [setId, exerciseId, setPosition, set.type, set.targetMin, set.targetMax]);
        await this.database.run('UPDATE workout_sets SET equipment_setup_id = ? WHERE id = ?', [equipmentSetupId, setId]);
        sets.push({ id: setId, equipmentSetupId, bodyweight, bodyweightUnit, bodyweightFraction, bodyweightLoad: bodyweight !== null && bodyweightFraction !== null ? Number(bodyweight) * bodyweightFraction : null, type: set.type, targetMin: set.targetMin, targetMax: set.targetMax,
          load: '', originalLoad: '', loadUnit: 'kg', reps: '', repsLeft: '', repsRight: '', rpe: '', performed: false, revision: 0, status: 'saved', inputState: 'empty', error: null });
      }
      await this.database.run('UPDATE workout_sets SET bodyweight = ?, bodyweight_unit = ?, bodyweight_fraction = ?, bodyweight_load = ? WHERE workout_exercise_id = ?', [bodyweight, bodyweightUnit, bodyweightFraction, bodyweight !== null && bodyweightFraction !== null ? Number(bodyweight) * bodyweightFraction : null, exerciseId]);
      exercises.push({ id: exerciseId, exerciseId: exercise.exerciseId, equipmentSetupId, entryMode: exercise.entryMode ?? 'weighted', bodyweight, bodyweightUnit, bodyweightFraction, name: exercise.name, loadConvention: exercise.loadConvention, restSeconds: exercise.restSeconds, sets });
    }
    return { id, title: routine.title, startedAt, bodyweight: this.bodyweightSettings.bodyweight, bodyweightUnit: this.bodyweightSettings.bodyweightUnit ?? 'kg', exercises };
  }

  private row(id: string) {
    if (this.closed) throw new Error('Training storage is closed.');
    const row = this.workout?.exercises.flatMap((exercise) => exercise.sets).find((set) => set.id === id);
    return row;
  }

  editSet(id: string, patch: Partial<Pick<SetEntry, 'load' | 'reps' | 'repsLeft' | 'repsRight' | 'rpe' | 'type'>>) {
    if (this.isEnding || this.isAdapting) return Promise.resolve(false);
    const row = this.row(id);
    if (!row) return Promise.resolve(false);
    if (!this.supportsEntry(row)) return Promise.resolve(false);
    Object.assign(row, patch);
    if (patch.load !== undefined && isValidLoad(patch.load)) {
      row.originalLoad = patch.load;
      row.loadUnit = this.loadUnit;
    }
    const input = inspectInput(row, this.entryMode(row));
    row.inputState = input.inputState;
    return this.save(row, !input.complete && (row.performed || this.pendingChecks.has(id)) ? false : undefined);
  }

  setPerformed(id: string, performed: boolean) {
    if (this.isEnding || this.isAdapting) return Promise.resolve(false);
    const row = this.row(id);
    return row ? this.save(row, performed) : Promise.resolve(false);
  }

  retrySet(id: string) {
    if (this.isEnding || this.isAdapting) return Promise.resolve(false);
    const row = this.row(id);
    return row ? this.save(row, this.retryIntent.get(id)) : Promise.resolve(false);
  }

  async retryFailedSaves() {
    const rows = this.workout?.exercises.flatMap((exercise) => exercise.sets) ?? [];
    const results = await Promise.all(rows.filter((row) => row.status === 'failed').map((row) => this.retrySet(row.id)));
    return results.every(Boolean);
  }

  blurSet(id: string) {
    if (this.isEnding || this.isAdapting) return Promise.resolve(false);
    const row = this.row(id);
    if (!row) return Promise.resolve(false);
    if (!inspectInput(row, this.entryMode(row)).complete && (row.performed || this.pendingChecks.has(id))) return this.save(row, false);
    if (inspectInput(row, this.entryMode(row)).inputValid) { row.load = formatLoad(row.originalLoad, row.loadUnit, this.loadUnit); this.publish(); }
    return Promise.resolve(false);
  }

  private entryMode(row: SetEntry): EntryMode {
    return this.workout?.exercises.find((exercise) => exercise.sets.some((set) => set.id === row.id))?.entryMode ?? 'weighted';
  }

  private supportsEntry(row: SetEntry) {
    if (['weighted', 'unilateral', 'bodyweight'].includes(this.entryMode(row))) return true;
    row.error = 'Logging for this entry mode is not available yet.';
    this.publish();
    return false;
  }

  private save(row: SetEntry, performed?: boolean): Promise<boolean> {
    if (!this.supportsEntry(row)) return Promise.resolve(false);
    const workoutId = this.workout?.id;
    const { originalLoad, loadUnit, reps, repsLeft, repsRight, rpe, type } = row;
    const { inputValid, complete } = inspectInput(row, this.entryMode(row));
    // Checking validates performance; it must not invalidate an existing save acknowledgement.
    if (performed === true && (!inputValid || !complete)) {
      row.error = 'Enter a nonnegative load, valid reps, and optional RPE from 1 to 10 in half steps.';
      this.publish();
      return Promise.resolve(false);
    }
    const revision = ++row.revision;
    if (performed === false) { this.uncheckRevision.set(row.id, revision); this.pendingUnchecks.set(row.id, revision); row.performed = false; }
    if (performed === true) this.pendingChecks.set(row.id, (this.pendingChecks.get(row.id) ?? 0) + 1);
    this.retryIntent.set(row.id, performed);
    if (!inputValid && performed !== false) {
      row.status = 'editing';
      row.error = 'Enter a nonnegative load, valid reps, and optional RPE from 1 to 10 in half steps.';
      this.publish();
      return Promise.resolve(false);
    }
    row.status = 'saving';
    row.error = null;
    this.publish();
    return this.enqueue(async () => {
      if (this.workout?.id !== workoutId) {
        if (performed === true) this.releasePendingCheck(row.id);
        return false;
      }
      try {
        const exercise = this.workout?.exercises.find((entry) => entry.sets.some((set) => set.id === row.id));
        const deadline = performed === true && !row.performed && this.restSettings.automatic
          ? this.now() + (exercise?.restSeconds ?? this.restSettings.defaultSeconds) * 1000 : null;
        await this.transaction(async () => {
          if (deadline !== null) await this.database.run('UPDATE workouts SET rest_deadline = ? WHERE id = ? AND active = 1', [deadline, workoutId!]);
          // Clear confirmation first so an intentionally emptied field satisfies the invariant.
          if (performed === false || (this.pendingUnchecks.get(row.id) ?? Infinity) <= revision) {
            await this.database.run('UPDATE workout_sets SET performed = 0 WHERE id = ?', [row.id]);
          }
          if (inputValid) {
            await this.database.run('UPDATE workout_sets SET load = ?, load_unit = ?, reps = ?, reps_left = ?, reps_right = ?, rpe = ?, type = ? WHERE id = ?',
              [originalLoad === '' ? null : originalLoad, loadUnit, reps === '' ? null : Number(reps), repsLeft === '' ? null : Number(repsLeft), repsRight === '' ? null : Number(repsRight), rpe === '' ? null : rpe, type, row.id]);
          }
          if (performed !== undefined) {
            await this.database.run('UPDATE workout_sets SET performed = ? WHERE id = ?', [performed ? 1 : 0, row.id]);
          }
        });
        if ((this.pendingUnchecks.get(row.id) ?? Infinity) <= revision) this.pendingUnchecks.delete(row.id);
        if (performed === true) this.releasePendingCheck(row.id);
        if (deadline !== null) this.restDeadline = deadline;
        if (performed !== undefined && (performed === false || (this.uncheckRevision.get(row.id) ?? 0) <= revision)) row.performed = performed;
        if (row.revision === revision) {
          row.status = inputValid ? 'saved' : 'editing';
          row.error = inputValid ? null : 'Incomplete input is kept here but is not saved.';
        }
        this.publish();
        return true;
      } catch {
        if (performed === true) this.releasePendingCheck(row.id);
        if (row.revision === revision) { row.status = 'failed'; row.error = 'Could not save. Your latest input is kept here. Retry to save it.'; }
        this.publish();
        return false;
      }
    });
  }

  private releasePendingCheck(id: string) {
    const remaining = (this.pendingChecks.get(id) ?? 1) - 1;
    if (remaining > 0) this.pendingChecks.set(id, remaining);
    else this.pendingChecks.delete(id);
  }

  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = this.tail.then(() => this.database.close());
    return this.closing;
  }
}
