import { catalogueExercise, searchExercises, bodyParts, entryModes, exerciseDefinition, isUnilateral, isBodyweight, isAssisted, type CustomExercise, type CatalogueExercise, type EntryMode } from './catalogue';
import { changeWorkout, persistWorkoutStructure, type WorkoutChange } from './workout-changes';
import type { TrainingDatabase } from './database';
import { backupColumns, validateBackup, type BackupTable, type BackupV1 } from './backup-schema';
import { migrate } from './migrations';
import { routineFromDraft, upperStarter, validateRoutine, type Routine } from './routines';
export type { BackupV1 } from './backup-schema';

export type LoadUnit = 'kg' | 'lb';

/** Convert from the recorded measurement, never from a rounded display value. */
export function formatLoad(value: string, from: LoadUnit, to: LoadUnit): string {
  if (value === '') return '';
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) return value;
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? 0) - fraction.length;
  let numerator = BigInt(match[1] + fraction);
  let denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  if (from !== to) {
    if (from === 'lb') { numerator *= 45359237n; denominator *= 100000000n; }
    else { numerator *= 100000000n; denominator *= 45359237n; }
  }
  const cents = (numerator * 100n * 2n + denominator) / (denominator * 2n);
  const whole = cents / 100n;
  const decimals = (cents % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return decimals ? `${whole}.${decimals}` : String(whole);
}

export function formatAssistance(value: string): string { return value === '' ? '' : `−${value.replace(/^[−-]+/, '')}`; }

export type SaveStatus = 'editing' | 'saving' | 'saved' | 'failed';
export interface EquipmentSetup { id: string; label: string | null; gym: string | null; ratio: string | null; archived: boolean }
export interface PreviousResult { reference: string; entryMode: EntryMode; loadConvention: string; bodyweightLoad: string | null; originalBodyweightLoad: number | null; bodyweightUnit: LoadUnit; type: SetEntry['type']; load: string; originalLoad: string; loadUnit: LoadUnit; assistance: string; originalAssistance: string; assistanceUnit: LoadUnit; reps: string; repsLeft: string; repsRight: string; rpe: string }
export interface SetEntry {
  previous?: PreviousResult;
  equipmentSetupId: string | null;
  bodyweight: string | null; bodyweightUnit: LoadUnit; bodyweightFraction: number | null; bodyweightLoad: number | null;
  id: string;
  type: 'normal' | 'warmup' | 'drop';
  targetMin: number;
  targetMax: number;
  load: string;
  originalLoad: string;
  assistance: string;
  originalAssistance: string;
  assistanceUnit: LoadUnit;
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
  exercises: { id: string; exerciseId: string; equipmentCategory: string; equipmentSetupId: string | null; entryMode: EntryMode; bodyweight: string | null; bodyweightUnit: LoadUnit; bodyweightFraction: number | null; name: string; loadConvention: string; restSeconds?: number; sets: SetEntry[] }[];
}
export interface CompletedWorkout extends Workout { completedAt: number }
export interface WorkoutSummary {
  exerciseNames: string[];
  id: string; title: string; startedAt: number; completedAt: number; performedSetCount: number;
}
export function setResultState(set: SetEntry): 'performed' | 'unfinished' | 'untouched' {
  return set.performed ? 'performed' : set.load !== '' || set.assistance !== '' || set.reps !== '' || set.repsLeft !== '' || set.repsRight !== '' || set.rpe !== '' ? 'unfinished' : 'untouched';
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
  customExercises: CustomExercise[]; customDraft: string | null;
  bodyweightSettings: BodyweightSettings;
  routines: Routine[]; routineDraft: string | null;
  loadUnit: LoadUnit; restSettings: RestSettings; restDeadline: number | null;
  equipmentSetups: EquipmentSetup[]; workout: Workout | null; history: WorkoutSummary[]; isEnding: boolean; isAdapting: boolean;
  saveStatus: SaveStatus; hasIncompleteInput: boolean;
}

export interface WeeklyActivity { startedAt: number; endsAt: number; completedCount: number }

export interface Training {
  exportBackup(): Promise<BackupV1>;
  restoreBackup(backup: unknown): Promise<void>;
  beginCustomDraft(data: string): Promise<string>;
  saveCustomDraft(data: string, lease: string): Promise<void>;
  discardCustomDraft(lease: string): Promise<void>;
  releaseCustomDraft(lease: string): Promise<void>;
  commitCustomDraft(data: string, lease: string): Promise<void>;
  archiveCustomExercise(id: string, archived: boolean): Promise<void>;
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
  getAvailableExercise(id: string): CatalogueExercise | CustomExercise;
  adaptWorkout(expectedWorkoutId: string, change: WorkoutChange): Promise<void>;
  start(routine?: Routine): Promise<boolean>;
  replaceActiveWorkout(routine: Routine, expectedWorkoutId: string): Promise<boolean>;
  editSet(id: string, patch: Partial<Pick<SetEntry, 'load' | 'assistance' | 'reps' | 'repsLeft' | 'repsRight' | 'rpe' | 'type'>>): Promise<boolean>;
  copyPrevious(id: string, overwrite: boolean, expected?: { reference: string; revision: number }): Promise<boolean>;
  setPerformed(id: string, performed: boolean): Promise<boolean>;
  retrySet(id: string): Promise<boolean>;
  retryFailedSaves(): Promise<boolean>;
  blurSet(id: string): Promise<boolean>;
  finishWorkout(expectedWorkoutId: string): Promise<void>;
  discardWorkout(expectedWorkoutId: string): Promise<void>;
  getCompletedWorkout(id: string): Promise<CompletedWorkout | null>;
  editCompletedSetDraft(draft: CompletedWorkout, id: string, patch: Partial<Pick<SetEntry, 'load' | 'assistance' | 'reps' | 'repsLeft' | 'repsRight' | 'rpe' | 'type' | 'performed' | 'equipmentSetupId'>>, unit: LoadUnit): CompletedWorkout;
  saveCompletedWorkout(baseline: CompletedWorkout, draft: CompletedWorkout, unit: LoadUnit): Promise<CompletedWorkout>;
  deleteCompletedWorkout(id: string): Promise<void>;
  close(): Promise<void>;
}

function isValidLoad(load: string) {
  return load === '' || (/^\d+(?:\.\d{1,2})?$/.test(load) && Number.isFinite(Number(load)));
}

function validDisplayedLoad(value: string, original: string, unit: LoadUnit, displayUnit: LoadUnit, rawInvalid = false) {
  return !rawInvalid && (isValidLoad(value) || (original !== '' && isValidLoad(original) && value === formatLoad(original, unit, displayUnit)));
}

function inspectInput(set: Pick<SetEntry, 'load' | 'originalLoad' | 'loadUnit' | 'assistance' | 'originalAssistance' | 'assistanceUnit' | 'reps' | 'repsLeft' | 'repsRight' | 'rpe'>, mode: EntryMode, displayUnit: LoadUnit, invalid?: Set<'load' | 'assistance'>) {
  const { load, assistance, reps, repsLeft, repsRight, rpe } = set;
  const validLoad = validDisplayedLoad(load, set.originalLoad, set.loadUnit, displayUnit, invalid?.has('load'));
  const whole = (value: string) => value === '' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)));
  const validReps = isUnilateral(mode) ? whole(repsLeft) && whole(repsRight) : whole(reps) && (reps === '' || Number(reps) > 0);
  const validRpe = rpe === '' || (/^\d+(?:\.\d)?$/.test(rpe) && Number(rpe) >= 1 && Number(rpe) <= 10 && Number(rpe) * 2 % 1 === 0);
  const inputValid = validLoad && validDisplayedLoad(assistance, set.originalAssistance, set.assistanceUnit, displayUnit, invalid?.has('assistance')) && validReps && validRpe;
  const hasReps = isUnilateral(mode) ? Number(repsLeft) > 0 || Number(repsRight) > 0 : reps !== '';
  const complete = inputValid && (isBodyweight(mode) || (isAssisted(mode) ? assistance !== '' : load !== '')) && hasReps;
  const empty = load === '' && assistance === '' && (isUnilateral(mode) ? repsLeft === '' && repsRight === '' : reps === '') && rpe === '';
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
  private snapshot: TrainingSnapshot = { customExercises: [], customDraft: null, bodyweightSettings: this.bodyweightSettings, routines: [], routineDraft: null, loadUnit: 'kg', equipmentSetups: [], restSettings: { automatic: true, defaultSeconds: 90 }, restDeadline: null, workout: null, history: [], isEnding: false, isAdapting: false, saveStatus: 'saved', hasIncompleteInput: false };
  private loadUnit: LoadUnit = 'kg';
  private history: WorkoutSummary[] = [];
  private invalidMeasurements = new Map<string, Set<'load' | 'assistance'>>();
  private previousByPair = new Map<string, PreviousResult[]>();
  private previousGeneration = 0;
  private restSettings: RestSettings = { automatic: true, defaultSeconds: 90 };
  private restDeadline: number | null = null;
  private equipmentSetups: EquipmentSetup[] = [];
  private customExercises: CustomExercise[] = [];
  private customDraft: string | null = null;
  private customLease: string | null = null;
  private customClosing = false;
  private customReleasePending = false;
  private customLeaseId: string | null = null;
  private customLeaseCounter = 0;
  private routines: Routine[] = [];
  private routineDraft: string | null = null;
  private isEnding = false;
  private isAdapting = false;
  private listeners = new Set<() => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  private restoring = false;
  private closing?: Promise<void>;
  private retryIntent = new Map<string, boolean | undefined>();
  private invalidatedChecks = new Set<string>();

  private constructor(private database: TrainingDatabase, private now: () => number) {}

  static async open(database: TrainingDatabase, now: () => number) {
    try {
      await migrate(database);
      const training = new TrainingModule(database, now);
      await training.loadCustom();
      await training.load();
      await training.loadEquipment();
      // Seed once; deleting the starter must remain effective after reopening.
      await training.transaction(async () => {
        await training.database.run("INSERT OR IGNORE INTO routines(id, data) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM routine_seed)", [upperStarter.id, JSON.stringify(upperStarter)]);
        await training.database.run("INSERT OR IGNORE INTO routine_seed(id) VALUES (1)", []);
      });
      await training.loadRoutines();
      training.history = await training.readHistory();
      training.previousByPair = await training.readPreviousProjection(training.workout);
      training.publish();
      return training;
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  private async loadCustom() {
    const rows = await this.database.all<{ data: string }>('SELECT data FROM custom_exercises ORDER BY rowid');
    this.customExercises = rows.map((row) => JSON.parse(row.data) as CustomExercise);
    const [draft] = await this.database.all<{ data: string }>('SELECT data FROM custom_draft WHERE id = 1');
    this.customDraft = draft?.data ?? null;
  }
  beginCustomDraft(data: string): Promise<string> {
    if (this.restoring) return Promise.reject(new Error('Restore is in progress.'));
    if (this.customLease || (this.customDraft !== null && this.customDraft !== data)) return Promise.reject(new Error('Another custom draft is open.'));
    let id: string;
    try { id = JSON.parse(data).id; if (typeof id !== 'string' || !id.startsWith('custom-')) throw new Error(); } catch { return Promise.reject(new Error('Invalid custom draft.')); }
    const lease = String(++this.customLeaseCounter);
    this.customLease = lease; this.customLeaseId = id;
    return this.enqueue(async () => {
      await this.database.run('INSERT OR REPLACE INTO custom_draft(id, data) VALUES (1, ?)', [data]);
      this.customDraft = data; this.publish(); return lease;
    }).catch((error) => { if (this.customLease === lease) this.customLease = null; throw error; });
  }
  saveCustomDraft(data: string, lease: string): Promise<void> {
    if (this.customLease !== lease || this.customClosing || this.customReleasePending) return Promise.reject(new Error('This custom draft is closed.'));
    try { if (JSON.parse(data).id !== this.customLeaseId) throw new Error(); } catch { return Promise.reject(new Error('Invalid custom draft identity.')); }
    return this.enqueue(async () => { await this.database.run('INSERT OR REPLACE INTO custom_draft(id, data) VALUES (1, ?)', [data]); this.customDraft = data; this.publish(); });
  }
  releaseCustomDraft(lease: string): Promise<void> {
    if (this.customLease !== lease || this.customReleasePending) return Promise.resolve();
    this.customReleasePending = true;
    return this.enqueue(async () => { if (this.customLease === lease) this.customLease = null; }).finally(() => { this.customReleasePending = false; });
  }
  discardCustomDraft(lease: string): Promise<void> {
    if (this.customLease !== lease || this.customClosing || this.customReleasePending) return Promise.reject(new Error('This custom draft is closed.'));
    this.customClosing = true;
    return this.enqueue(async () => { await this.database.run('DELETE FROM custom_draft WHERE id = 1', []); this.customDraft = null; this.customLease = null; this.publish(); }).finally(() => { this.customClosing = false; });
  }
  commitCustomDraft(data: string, lease: string): Promise<void> {
    if (this.customLease !== lease || this.customClosing || this.customReleasePending) return Promise.reject(new Error('This custom draft is closed.'));
    let item: CustomExercise;
    try {
      const d = JSON.parse(data);
      if (!d || d.id !== this.customLeaseId || typeof d.id !== 'string' || !d.id.startsWith('custom-') || typeof d.name !== 'string' || !d.name.trim() ||
          !['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'].includes(d.equipment) || !entryModes.includes(d.entryMode) ||
          !Array.isArray(d.bodyParts) || !d.bodyParts.length || d.bodyParts.some((part: string) => !bodyParts.includes(part as typeof bodyParts[number])) ||
          (isBodyweight(d.entryMode) && d.fraction !== '' && (typeof d.fraction !== 'string' || !/^\d+(?:\.\d+)?(?:e-\d+)?$/i.test(d.fraction) || !Number.isFinite(Number(d.fraction)) || Number(d.fraction) > 1))) throw new Error();
      item = { id: d.id, name: d.name.trim(), equipment: d.equipment, entryMode: d.entryMode, bodyParts: [...new Set<string>(d.bodyParts)], fraction: isBodyweight(d.entryMode) && d.fraction !== '' ? Number(d.fraction) : null, archived: false, sourceId: null, aliases: [], loadConvention: isBodyweight(d.entryMode) ? 'Bodyweight' : isAssisted(d.entryMode) ? 'Assistance' : ['machine', 'cable'].includes(d.equipment) ? 'Displayed machine/cable load' : isUnilateral(d.entryMode) ? 'Working-side external load' : d.equipment === 'barbell' ? 'Combined external load, including the bar' : 'Combined external load' };
    } catch { return Promise.reject(new Error('Enter a name, equipment, measurement modes, body parts, and a fraction from 0 to 1.')); }
    this.customClosing = true;
    return this.enqueue(async () => {
      const existing = this.customExercises.find((entry) => entry.id === item.id);
      const d = JSON.parse(data);
      if (existing && d.fractionChanged !== true && isBodyweight(item.entryMode)) item.fraction = existing.fraction;
      if (existing?.archived) item.archived = true;
      await this.transaction(async () => {
        await this.database.run('INSERT INTO custom_exercises(id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', [item.id, JSON.stringify(item)]);
        await this.database.run('INSERT INTO exercise_fractions(exercise_id, fraction) VALUES (?, ?) ON CONFLICT(exercise_id) DO UPDATE SET fraction = excluded.fraction', [item.id, item.fraction]);
        await this.database.run('DELETE FROM custom_draft WHERE id = 1', []);
      });
      this.customExercises = existing ? this.customExercises.map((entry) => entry.id === item.id ? item : entry) : [...this.customExercises, item];
      this.customDraft = null; this.customLease = null; this.publish();
    }).finally(() => { this.customClosing = false; });
  }
  archiveCustomExercise(id: string, archived: boolean): Promise<void> {
    return this.enqueue(async () => {
      const item = this.customExercises.find((entry) => entry.id === id);
      if (!item) throw new Error('Custom exercise not found.');
      await this.database.run('UPDATE custom_exercises SET data = ? WHERE id = ?', [JSON.stringify({ ...item, archived }), id]);
      this.customExercises = this.customExercises.map((entry) => entry.id === id ? { ...entry, archived } : entry); this.publish();
    });
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
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change.'));
    this.isAdapting = true; this.publish();
    return this.enqueue(async () => {
      const exercise = this.workout?.exercises.find((item) => item.id === exerciseId);
      if (!exercise || !isBodyweight(exercise.entryMode)) throw new Error('Bodyweight exercise not found.');
      const workout = this.workout!;
      const weight = bodyweight === undefined ? workout.bodyweight : bodyweight;
      const unit = enteredUnit ?? workout.bodyweightUnit;
      const targets = bodyweight === undefined ? [exercise] : workout.exercises.filter((item) => isBodyweight(item.entryMode));
      const custom = this.customExercises.find((item) => item.id === exercise.exerciseId);
      const updateDefault = !custom || isBodyweight(custom.entryMode);
      await this.transaction(async () => {
        if (bodyweight !== undefined) await this.database.run('UPDATE workouts SET bodyweight = ?, bodyweight_unit = ? WHERE id = ?', [weight, unit, workout.id]);
        for (const target of targets) {
          const share = target.id === exercise.id && fraction !== undefined ? fraction : target.bodyweightFraction;
          const calculated = weight !== null && share !== null ? Number(weight) * share : null;
          await this.database.run('UPDATE workout_exercises SET bodyweight = ?, bodyweight_unit = ?, bodyweight_fraction = ? WHERE id = ?', [weight, unit, share, target.id]);
          await this.database.run('UPDATE workout_sets SET bodyweight = ?, bodyweight_unit = ?, bodyweight_fraction = ?, bodyweight_load = ? WHERE workout_exercise_id = ?', [weight, unit, share, calculated, target.id]);
        }
        if (fraction !== undefined && updateDefault) {
          await this.database.run('INSERT INTO exercise_fractions(exercise_id, fraction) VALUES (?, ?) ON CONFLICT(exercise_id) DO UPDATE SET fraction = excluded.fraction', [exercise.exerciseId, fraction]);
          if (custom) await this.database.run('UPDATE custom_exercises SET data = ? WHERE id = ?', [JSON.stringify({ ...custom, fraction }), custom.id]);
        }
        if (bodyweight !== undefined && this.bodyweightSettings.writeback) await this.database.run('UPDATE bodyweight_settings SET bodyweight = ?, bodyweight_unit = ? WHERE id = 1', [weight, unit]);
      });
      if (fraction !== undefined && custom && updateDefault) this.customExercises = this.customExercises.map((item) => item.id === custom.id ? { ...item, fraction } : item);
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
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change.'));
    const rows = this.workout?.exercises.flatMap((exercise) => exercise.sets) ?? [];
    if (rows.some((row) => !validDisplayedLoad(row.load, row.originalLoad, row.loadUnit, this.loadUnit, this.invalidMeasurements.get(row.id)?.has('load')) || !validDisplayedLoad(row.assistance, row.originalAssistance, row.assistanceUnit, this.loadUnit, this.invalidMeasurements.get(row.id)?.has('assistance')))) return Promise.reject(new Error('Complete or clear the unfinished load before changing units.'));
    this.isAdapting = true; this.publish();
    return this.enqueue(async () => {
      await this.transaction(() => this.database.run('UPDATE load_settings SET unit = ? WHERE id = 1', [unit]));
      this.loadUnit = unit;
      this.previousGeneration++;
      for (const row of rows) { row.load = formatLoad(row.originalLoad, row.loadUnit, unit); row.assistance = formatLoad(row.originalAssistance, row.assistanceUnit, unit); }
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

  private pairKey(exerciseId: string, setupId: string | null) { return JSON.stringify([exerciseId, setupId]); }

  /** Read only the latest matching workout for pairs present in the active workout.
   * Call inside the mutation transaction so lookup failures roll back the change. */
  private async readPreviousProjection(workout: Workout | null, reuse?: Map<string, PreviousResult[]>): Promise<Map<string, PreviousResult[]>> {
    const projection = new Map<string, PreviousResult[]>();
    for (const exercise of workout?.exercises ?? []) for (const set of exercise.sets) {
      const key = this.pairKey(exercise.exerciseId, set.equipmentSetupId);
      if (projection.has(key)) continue;
      if (reuse?.has(key)) { projection.set(key, reuse.get(key)!); continue; }
      const [latest] = await this.database.all<{ id: string }>(`SELECT w.id FROM workout_exercises e
        JOIN workout_sets s ON s.workout_exercise_id = e.id
        JOIN workouts w ON w.id = e.workout_id
        WHERE e.exercise_id = ? AND s.equipment_setup_id IS ? AND w.active = 0 AND w.completed_at IS NOT NULL
        ORDER BY w.completed_at DESC, w.id DESC LIMIT 1`, [exercise.exerciseId, set.equipmentSetupId]);
      if (!latest) { projection.set(key, []); continue; }
      const rows = await this.database.all<{ id: string; entry_mode: EntryMode; load_convention: string; bodyweight_load: number | null; bodyweight_unit: LoadUnit; type: SetEntry['type']; load: string | null; load_unit: LoadUnit; assistance: string | null; assistance_unit: LoadUnit; reps: number | null; reps_left: number | null; reps_right: number | null; rpe: string | null }>(`SELECT s.id, e.entry_mode, e.load_convention, s.bodyweight_load, s.bodyweight_unit, s.type, s.load, s.load_unit, s.assistance, s.assistance_unit, s.reps, s.reps_left, s.reps_right, s.rpe
        FROM workout_exercises e JOIN workout_sets s ON s.workout_exercise_id = e.id
        WHERE e.workout_id = ? AND e.exercise_id = ? AND s.equipment_setup_id IS ? AND s.performed = 1
        ORDER BY e.position, s.position`, [latest.id, exercise.exerciseId, set.equipmentSetupId]);
      projection.set(key, rows.map((row) => ({ reference: row.id, entryMode: row.entry_mode, loadConvention: row.load_convention, bodyweightLoad: null, originalBodyweightLoad: row.bodyweight_load, bodyweightUnit: row.bodyweight_unit, type: row.type, originalLoad: row.load ?? '', loadUnit: row.load_unit, load: '', originalAssistance: row.assistance ?? '', assistanceUnit: row.assistance_unit, assistance: '', reps: row.reps?.toString() ?? '', repsLeft: row.reps_left?.toString() ?? '', repsRight: row.reps_right?.toString() ?? '', rpe: row.rpe ?? '' })));
    }
    return projection;
  }

  private previousResults(): Map<string, PreviousResult> {
    const results = new Map<string, PreviousResult>();
    const occurrences = new Map<string, number>();
    for (const exercise of this.workout?.exercises ?? []) for (const set of exercise.sets) {
      const pair = this.pairKey(exercise.exerciseId, set.equipmentSetupId);
      const key = JSON.stringify([pair, set.type]);
      const index = occurrences.get(key) ?? 0;
      occurrences.set(key, index + 1);
      const previous = this.previousByPair.get(pair)?.filter((item) => item.type === set.type)[index];
      if (previous) results.set(set.id, { ...previous, reference: `${this.previousGeneration}:${previous.reference}`, load: formatLoad(previous.originalLoad, previous.loadUnit, this.loadUnit), assistance: formatLoad(previous.originalAssistance, previous.assistanceUnit, this.loadUnit), bodyweightLoad: previous.originalBodyweightLoad === null ? null : formatLoad(String(previous.originalBodyweightLoad), previous.bodyweightUnit, this.loadUnit) });
    }
    return results;
  }

  private publish() {
    const previous = this.previousResults();
    const rows = this.workout?.exercises.flatMap((exercise) => exercise.sets) ?? [];
    const saveStatus = this.isAdapting ? 'saving' : (['failed', 'saving', 'editing'] as const)
      .find((status) => rows.some((row) => row.status === status)) ?? 'saved';
    this.snapshot = { customExercises: JSON.parse(JSON.stringify(this.customExercises)), customDraft: this.customDraft, bodyweightSettings: { ...this.bodyweightSettings }, loadUnit: this.loadUnit, routines: JSON.parse(JSON.stringify(this.routines)), routineDraft: this.routineDraft, equipmentSetups: this.equipmentSetups.map((setup) => ({ ...setup })), restSettings: { ...this.restSettings }, restDeadline: this.restDeadline, history: this.history.map((entry) => ({ ...entry, exerciseNames: [...entry.exerciseNames] })), isEnding: this.isEnding, isAdapting: this.isAdapting, saveStatus, hasIncompleteInput: rows.some((row) => row.inputState === 'incomplete'), workout: this.workout ? {
      ...this.workout,
      exercises: this.workout.exercises.map((exercise) => ({
        ...exercise, sets: exercise.sets.map((set) => ({ ...set, previous: previous.get(set.id) })),
      })),
    } : null };
    // A subscriber cannot change whether an already committed operation succeeded.
    this.listeners.forEach((listener) => { try { listener(); } catch { /* Notify other subscribers. */ } });
  }

  exportBackup(): Promise<BackupV1> {
    return this.enqueue(async () => {
      // Fixed version-one projection: future database migrations cannot silently change the file format.
      const order: Partial<Record<BackupTable, string>> = {
        workouts: 'id', workout_exercises: 'id', workout_sets: 'id', equipment_setups: 'rowid',
        equipment_last_selection: 'exercise_id', custom_equipment_last_selection: 'exercise_id, equipment_category',
        routines: 'rowid', exercise_fractions: 'exercise_id', custom_exercises: 'rowid',
      };
      const data = {} as BackupV1['data'];
      for (const table of Object.keys(backupColumns) as BackupTable[]) {
        const columns = backupColumns[table].split(' ').join(', ');
        data[table] = await this.database.all(`SELECT ${columns} FROM ${table}${order[table] ? ` ORDER BY ${order[table]}` : ''}`);
      }
      return { version: 1, data };
    });
  }

  restoreBackup(input: unknown): Promise<void> {
    // Copy immediately so callers cannot mutate a file while it waits on the queue.
    let backup: BackupV1;
    try {
      const source = validateBackup(input);
      const data = {} as BackupV1['data'];
      for (const table of Object.keys(backupColumns) as BackupTable[]) {
        const columns = backupColumns[table].split(' ');
        data[table] = source.data[table].map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
      }
      backup = validateBackup({ version: 1, data });
    } catch { return Promise.reject(new Error('Invalid or unsupported backup.')); }
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current operation.'));
    const result = this.enqueue(async () => {
      const staged = new TrainingModule(this.database, this.now);
      await this.transaction(async () => {
        const remove: BackupTable[] = ['workout_sets', 'workout_exercises', 'workouts', 'equipment_last_selection', 'custom_equipment_last_selection', 'equipment_setups', 'rest_settings', 'routines', 'routine_seed', 'routine_draft', 'load_settings', 'bodyweight_settings', 'exercise_fractions', 'custom_exercises', 'custom_draft'];
        for (const table of remove) await this.database.run(`DELETE FROM ${table}`, []);
        const insert: BackupTable[] = ['equipment_setups', 'workouts', 'workout_exercises', 'workout_sets', 'equipment_last_selection', 'custom_equipment_last_selection', 'rest_settings', 'routines', 'routine_seed', 'routine_draft', 'load_settings', 'bodyweight_settings', 'exercise_fractions', 'custom_exercises', 'custom_draft'];
        for (const table of insert) {
          const columns = backupColumns[table].split(' ');
          const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
          for (const row of backup.data[table]) await this.database.run(sql, columns.map(column => row[column]));
        }
        await staged.loadCustom(); await staged.load(); await staged.loadEquipment(); await staged.loadRoutines();
        staged.history = await staged.readHistory();
        staged.previousByPair = await staged.readPreviousProjection(staged.workout);
        // Materialize all derived state while rollback is still possible.
        staged.publish();
      });
      this.workout = staged.workout; this.loadUnit = staged.loadUnit; this.restSettings = staged.restSettings; this.restDeadline = null;
      this.bodyweightSettings = staged.bodyweightSettings; this.equipmentSetups = staged.equipmentSetups; this.customExercises = staged.customExercises; this.customDraft = staged.customDraft;
      this.routines = staged.routines; this.routineDraft = staged.routineDraft; this.history = staged.history; this.previousByPair = staged.previousByPair;
      this.previousGeneration++; this.customLease = null; this.customLeaseId = null;
      this.invalidMeasurements.clear(); this.retryIntent.clear(); this.invalidatedChecks.clear(); this.uncheckRevision.clear(); this.pendingChecks.clear(); this.pendingUnchecks.clear();
      this.publish();
    });
    this.restoring = true;
    return result.finally(() => { this.restoring = false; });
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Training storage is closed.'));
    if (this.restoring) return Promise.reject(new Error('Restore is in progress.'));
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
    const exercises = await this.database.all<{ id: string; exercise_id: string; equipment_setup_id: string | null; equipment_category: string | null; entry_mode: EntryMode; name: string; load_convention: string; rest_seconds: number | null; bodyweight: string | null; bodyweight_unit: LoadUnit; bodyweight_fraction: number | null }>(
      'SELECT id, exercise_id, equipment_setup_id, equipment_category, entry_mode, name, load_convention, rest_seconds, bodyweight, bodyweight_unit, bodyweight_fraction FROM workout_exercises WHERE workout_id = ? ORDER BY position', [workout.id]);
    const entries = [];
    for (const exercise of exercises) {
      const sets = await this.database.all<{
        id: string; type: SetEntry['type']; target_min: number; target_max: number;
        load: string | null; load_unit: LoadUnit; assistance: string | null; assistance_unit: LoadUnit; reps: number | null; reps_left: number | null; reps_right: number | null; rpe: string | null; performed: number; equipment_setup_id: string | null; bodyweight: string | null; bodyweight_unit: LoadUnit; bodyweight_fraction: number | null; bodyweight_load: number | null;
      }>('SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position', [exercise.id]);
      entries.push({ id: exercise.id, exerciseId: exercise.exercise_id, equipmentSetupId: exercise.equipment_setup_id, equipmentCategory: exercise.equipment_category ?? this.equipmentFor(exercise.exercise_id), entryMode: exercise.entry_mode, bodyweight: exercise.bodyweight, bodyweightUnit: exercise.bodyweight_unit, bodyweightFraction: exercise.bodyweight_fraction, name: exercise.name, loadConvention: exercise.load_convention, restSeconds: exercise.rest_seconds ?? undefined,
        sets: sets.map((set): SetEntry => ({ id: set.id, equipmentSetupId: set.equipment_setup_id, bodyweight: set.bodyweight, bodyweightUnit: set.bodyweight_unit, bodyweightFraction: set.bodyweight_fraction, bodyweightLoad: set.bodyweight_load, type: set.type, targetMin: set.target_min,
          targetMax: set.target_max, originalAssistance: set.assistance ?? '', assistanceUnit: set.assistance_unit, assistance: formatLoad(set.assistance ?? '', set.assistance_unit, this.loadUnit), originalLoad: set.load ?? '', loadUnit: set.load_unit, load: formatLoad(set.load ?? '', set.load_unit, this.loadUnit), reps: set.reps?.toString() ?? '', repsLeft: set.reps_left?.toString() ?? '', repsRight: set.reps_right?.toString() ?? '', rpe: set.rpe ?? '',
          performed: set.performed === 1, revision: 0, status: 'saved',
          inputState: inspectInput({ assistance: set.assistance ?? '', originalAssistance: set.assistance ?? '', assistanceUnit: set.assistance_unit, originalLoad: set.load ?? '', loadUnit: set.load_unit, load: set.load ?? '', reps: set.reps?.toString() ?? '', repsLeft: set.reps_left?.toString() ?? '', repsRight: set.reps_right?.toString() ?? '', rpe: set.rpe ?? '' }, exercise.entry_mode, this.loadUnit).inputState, error: null })) });
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

  editCompletedSetDraft(draft: CompletedWorkout, id: string, patch: Partial<Pick<SetEntry, 'load' | 'assistance' | 'reps' | 'repsLeft' | 'repsRight' | 'rpe' | 'type' | 'performed' | 'equipmentSetupId'>>, unit: LoadUnit): CompletedWorkout {
    const next = JSON.parse(JSON.stringify(draft)) as CompletedWorkout;
    const exercise = next.exercises.find((item) => item.sets.some((set) => set.id === id));
    const row = exercise?.sets.find((set) => set.id === id);
    if (!exercise || !row) throw new Error('Set not found.');
    if ((patch.assistance !== undefined && !(isAssisted(exercise.entryMode) || isBodyweight(exercise.entryMode))) || (patch.load !== undefined && isAssisted(exercise.entryMode)) || (isUnilateral(exercise.entryMode) ? patch.reps !== undefined : patch.repsLeft !== undefined || patch.repsRight !== undefined)) throw new Error('Measurement is unavailable for this exercise.');
    Object.assign(row, patch);
    const invalid = new Set<'load' | 'assistance'>();
    for (const field of ['load', 'assistance'] as const) if (patch[field] !== undefined) {
      if (!isValidLoad(patch[field])) invalid.add(field);
      else if (field === 'load') { row.originalLoad = patch.load!; row.loadUnit = unit; }
      else { row.originalAssistance = patch.assistance!; row.assistanceUnit = unit; }
    }
    const input = inspectInput(row, exercise.entryMode, unit, invalid);
    if (!input.complete) row.performed = false;
    row.inputState = input.inputState;
    row.error = !input.inputValid ? 'Enter valid values.' : patch.performed === true && !input.complete ? 'Complete the required values before marking performed.' : null;
    return next;
  }

  saveCompletedWorkout(baseline: CompletedWorkout, draft: CompletedWorkout, unit: LoadUnit): Promise<CompletedWorkout> {
    // Capture the complete submission before it enters the shared database queue.
    const original = JSON.parse(JSON.stringify(baseline)) as CompletedWorkout;
    const submitted = JSON.parse(JSON.stringify(draft)) as CompletedWorkout;
    return this.enqueue(async () => {
      const result = await this.transaction(async () => {
        const [header] = await this.database.all<{ id: string; title: string; started_at: number; completed_at: number; bodyweight: string | null; bodyweight_unit: LoadUnit }>(
          'SELECT id, title, started_at, completed_at, bodyweight, bodyweight_unit FROM workouts WHERE id = ? AND active = 0 AND completed_at IS NOT NULL', [original.id]);
        if (!header || submitted.id !== original.id) throw new Error('This workout is no longer available.');
        const current = { ...await this.readWorkout(header), completedAt: header.completed_at };
        const fields = (set: SetEntry) => [set.id, set.type, set.originalLoad, set.loadUnit, set.originalAssistance, set.assistanceUnit, set.reps, set.repsLeft, set.repsRight, set.rpe, set.performed, set.equipmentSetupId];
        const baseRows = original.exercises.flatMap((e) => e.sets);
        const currentRows = current.exercises.flatMap((e) => e.sets);
        const draftRows = submitted.exercises.flatMap((e) => e.sets);
        if (JSON.stringify(baseRows.map(fields)) !== JSON.stringify(currentRows.map(fields)) || draftRows.length !== currentRows.length || draftRows.some((s, i) => s.id !== currentRows[i].id)) throw new Error('This workout changed. Reopen it before saving.');
        for (const [i, row] of draftRows.entries()) {
          const base = baseRows[i];
          const exercise = current.exercises.find((e) => e.sets.some((s) => s.id === row.id))!;
          if (row.type !== 'normal' && row.type !== 'warmup' && row.type !== 'drop') throw new Error('Invalid set type.');
          if (row.equipmentSetupId !== base.equipmentSetupId) {
            if (!['machine', 'cable'].includes(exercise.equipmentCategory)) throw new Error('Equipment applies only to machines and cables.');
            this.validateEquipment(row.equipmentSetupId);
          }
          if ((!(isAssisted(exercise.entryMode) || isBodyweight(exercise.entryMode)) && row.assistance !== base.assistance) || (isAssisted(exercise.entryMode) && row.load !== base.load) || (isUnilateral(exercise.entryMode) ? row.reps !== base.reps : row.repsLeft !== base.repsLeft || row.repsRight !== base.repsRight)) throw new Error(`${exercise.name}, set ${exercise.sets.findIndex((s) => s.id === row.id) + 1}: measurement is unavailable for this exercise.`);
          const changedLoad = row.load !== base.load;
          const changedAssistance = row.assistance !== base.assistance;
          const value = { ...row, originalLoad: changedLoad ? row.load : base.originalLoad, loadUnit: changedLoad ? unit : base.loadUnit, originalAssistance: changedAssistance ? row.assistance : base.originalAssistance, assistanceUnit: changedAssistance ? unit : base.assistanceUnit };
          const valid = inspectInput(value, exercise.entryMode, unit);
          if (!valid.inputValid || (row.performed && !valid.complete)) throw new Error(`${exercise.name}, set ${exercise.sets.findIndex((s) => s.id === row.id) + 1}: enter valid values${row.performed ? ' and complete required fields' : ''}.`);
          await this.database.run('UPDATE workout_sets SET load = ?, load_unit = ?, assistance = ?, assistance_unit = ?, reps = ?, reps_left = ?, reps_right = ?, rpe = ?, type = ?, performed = ?, equipment_setup_id = ? WHERE id = ?',
            [value.originalLoad || null, value.loadUnit, value.originalAssistance || null, value.assistanceUnit, row.reps === '' ? null : Number(row.reps), row.repsLeft === '' ? null : Number(row.repsLeft), row.repsRight === '' ? null : Number(row.repsRight), row.rpe || null, row.type, row.performed ? 1 : 0, row.equipmentSetupId, row.id]);
        }
        const saved = { ...await this.readWorkout(header), completedAt: header.completed_at };
        return { saved, history: await this.readHistory(), projection: await this.readPreviousProjection(this.workout) };
      });
      this.history = result.history; this.previousByPair = result.projection; this.previousGeneration++; this.publish();
      return result.saved;
    });
  }

  deleteCompletedWorkout(id: string): Promise<void> {
    return this.enqueue(async () => {
      const result = await this.transaction(async () => {
        const [existing] = await this.database.all<{ id: string }>('SELECT id FROM workouts WHERE id = ? AND active = 0 AND completed_at IS NOT NULL', [id]);
        if (!existing) throw new Error('This workout is no longer available.');
        await this.database.run('DELETE FROM workouts WHERE id = ?', [id]);
        return { history: await this.readHistory(), projection: await this.readPreviousProjection(this.workout) };
      });
      this.history = result.history; this.previousByPair = result.projection; this.previousGeneration++; this.publish();
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
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.reject(new Error('A workout is already being saved.'));
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
      this.previousByPair.clear();
      this.previousGeneration++;
      this.workout = null;
      this.restDeadline = null;
      this.retryIntent.clear();
      this.invalidMeasurements.clear();
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
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change.'));
    this.isAdapting = true; this.publish();
    return this.enqueue(async () => {
      const exercise = this.workout?.exercises.find((item) => item.id === exerciseId);
      if (!exercise || !['machine', 'cable'].includes(exercise.equipmentCategory)) throw new Error('Equipment is unavailable for this exercise.');
      this.validateEquipment(setupId);
      const next = JSON.parse(JSON.stringify(this.workout)) as Workout;
      const nextExercise = next.exercises.find((item) => item.id === exerciseId)!;
      nextExercise.equipmentSetupId = setupId;
      nextExercise.sets.forEach((set) => { if (!set.performed) set.equipmentSetupId = setupId; });
      const projection = await this.transaction(async () => {
        await this.database.run('UPDATE workout_exercises SET equipment_setup_id = ? WHERE id = ?', [setupId, exerciseId]);
        await this.database.run('UPDATE workout_sets SET equipment_setup_id = ? WHERE workout_exercise_id = ? AND performed = 0', [setupId, exerciseId]);
        if (exercise.exerciseId.startsWith('custom-')) await this.database.run('INSERT INTO custom_equipment_last_selection(exercise_id, equipment_category, setup_id) VALUES (?, ?, ?) ON CONFLICT(exercise_id, equipment_category) DO UPDATE SET setup_id = excluded.setup_id', [exercise.exerciseId, exercise.equipmentCategory, setupId]);
        else await this.database.run('INSERT INTO equipment_last_selection(exercise_id, setup_id) VALUES (?, ?) ON CONFLICT(exercise_id) DO UPDATE SET setup_id = excluded.setup_id', [exercise.exerciseId, setupId]);
        return this.readPreviousProjection(next, this.previousByPair);
      });
      exercise.equipmentSetupId = setupId;
      exercise.sets.forEach((set) => { if (!set.performed) set.equipmentSetupId = setupId; });
      this.previousByPair = projection; this.previousGeneration++;
    }).finally(() => { this.isAdapting = false; this.publish(); });
  }

  correctSetEquipment(setId: string, setupId: string | null): Promise<void> {
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change.'));
    this.isAdapting = true; this.publish();
    return this.enqueue(async () => {
      const exercise = this.workout?.exercises.find((item) => item.sets.some((set) => set.id === setId));
      const set = exercise?.sets.find((item) => item.id === setId);
      if (!exercise || !set || !set.performed || !['machine', 'cable'].includes(exercise.equipmentCategory)) throw new Error('Checked set not found.');
      this.validateEquipment(setupId);
      const next = JSON.parse(JSON.stringify(this.workout)) as Workout;
      next.exercises.flatMap((item) => item.sets).find((item) => item.id === setId)!.equipmentSetupId = setupId;
      const projection = await this.transaction(async () => {
        await this.database.run('UPDATE workout_sets SET equipment_setup_id = ? WHERE id = ?', [setupId, setId]);
        return this.readPreviousProjection(next, this.previousByPair);
      });
      set.equipmentSetupId = setupId;
      this.previousByPair = projection; this.previousGeneration++;
    }).finally(() => { this.isAdapting = false; this.publish(); });
  }

  private lookupExercise = (id: string): CatalogueExercise => this.customExercises.find((item) => item.id === id) ?? catalogueExercise(id);
  private equipmentFor(id: string): string { try { return this.lookupExercise(id).equipment; } catch { return 'other'; } }

  getAvailableExercise = (id: string): CatalogueExercise | CustomExercise => {
    const item = this.lookupExercise(id);
    if ('archived' in item && item.archived) throw new Error('Exercise is archived.');
    return JSON.parse(JSON.stringify(item));
  };

  searchExercises = (query = '') => searchExercises(query, this.customExercises);

  private async rememberedSetup(exerciseId: string, category: string): Promise<string | null> {
    if (!['machine', 'cable'].includes(category)) return null;
    const query = exerciseId.startsWith('custom-')
      ? 'SELECT l.setup_id FROM custom_equipment_last_selection l LEFT JOIN equipment_setups s ON s.id = l.setup_id WHERE l.exercise_id = ? AND l.equipment_category = ? AND (l.setup_id IS NULL OR s.archived = 0)'
      : 'SELECT l.setup_id FROM equipment_last_selection l LEFT JOIN equipment_setups s ON s.id = l.setup_id WHERE l.exercise_id = ? AND (l.setup_id IS NULL OR s.archived = 0)';
    const [selection] = await this.database.all<{ setup_id: string | null }>(query, exerciseId.startsWith('custom-') ? [exerciseId, category] : [exerciseId]);
    return selection?.setup_id ?? null;
  }

  adaptWorkout(expectedWorkoutId: string, change: WorkoutChange): Promise<void> {
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.reject(new Error('Wait for the current workout change to finish.'));
    this.isAdapting = true;
    this.publish();
    return this.enqueue(async () => {
      if (this.workout?.id !== expectedWorkoutId) throw new Error('The active workout changed.');
      const previous = this.workout;
      const next = await this.transaction(async () => {
        const [active] = await this.database.all<{ id: string }>('SELECT id FROM workouts WHERE active = 1');
        if (active?.id !== expectedWorkoutId) throw new Error('The active workout changed.');
        if (change.type === 'replace-exercise' && change.expectedDefinition !== undefined && exerciseDefinition(this.getAvailableExercise(change.catalogueId)) !== change.expectedDefinition) throw new Error('Exercise definition changed. Choose it again.');
        const result = await changeWorkout(previous, change, async () => {
          const [{ id }] = await this.database.all<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
          return id;
        }, this.getAvailableExercise);
        for (const exercise of result.exercises) {
          if (!previous.exercises.some((item) => item.id === exercise.id)) {
            exercise.equipmentSetupId = await this.rememberedSetup(exercise.exerciseId, exercise.equipmentCategory);
            if (isBodyweight(exercise.entryMode)) {
              const [fraction] = await this.database.all<{ fraction: number | null }>('SELECT fraction FROM exercise_fractions WHERE exercise_id = ?', [exercise.exerciseId]);
              exercise.bodyweight = previous.bodyweight; exercise.bodyweightUnit = previous.bodyweightUnit; exercise.bodyweightFraction = fraction?.fraction ?? null;
              exercise.sets.forEach((set) => { set.bodyweight = exercise.bodyweight; set.bodyweightUnit = exercise.bodyweightUnit; set.bodyweightFraction = exercise.bodyweightFraction; set.bodyweightLoad = exercise.bodyweight !== null && exercise.bodyweightFraction !== null ? Number(exercise.bodyweight) * exercise.bodyweightFraction : null; });
            }
            exercise.sets.forEach((set) => { set.equipmentSetupId = exercise.equipmentSetupId; });
          }
        }
        await persistWorkoutStructure(this.database, previous, result);
        return { workout: result, projection: await this.readPreviousProjection(result, this.previousByPair) };
      });
      this.workout = next.workout;
      this.previousByPair = next.projection; this.previousGeneration++;
      const remaining = new Set(next.workout.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id)));
      for (const id of this.retryIntent.keys()) if (!remaining.has(id)) this.retryIntent.delete(id);
      for (const id of this.invalidMeasurements.keys()) if (!remaining.has(id)) this.invalidMeasurements.delete(id);
    }).finally(() => { this.isAdapting = false; this.publish(); });
  }

  start(routine: Routine = { id: 'unplanned', title: 'Workout', exercises: [] }): Promise<boolean> {
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.resolve(false);
    return this.enqueue(async () => {
      if (this.workout) return false;
      const result = await this.transaction(async () => { const workout = await this.insertWorkout(routine); return { workout, projection: await this.readPreviousProjection(workout) }; });
      this.workout = result.workout;
      this.previousByPair = result.projection; this.previousGeneration++;
      this.publish();
      return true;
    });
  }

  /** Caller must obtain explicit discard confirmation for this exact active workout. */
  replaceActiveWorkout(routine: Routine, expectedWorkoutId: string): Promise<boolean> {
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.resolve(false);
    return this.enqueue(async () => {
      if (this.workout?.id !== expectedWorkoutId) {
        throw new Error('The active workout changed. Resume it before trying again.');
      }
      const workout = await this.transaction(async () => {
        const [active] = await this.database.all<{ id: string }>('SELECT id FROM workouts WHERE active = 1');
        if (active?.id !== expectedWorkoutId) throw new Error('The active workout changed.');
        await this.database.run('DELETE FROM workouts WHERE id = ? AND active = 1', [expectedWorkoutId]);
        const workout = await this.insertWorkout(routine);
        return { workout, projection: await this.readPreviousProjection(workout) };
      });
      this.workout = workout.workout;
      this.previousByPair = workout.projection; this.previousGeneration++;
      this.restDeadline = null;
      this.retryIntent.clear();
      this.invalidMeasurements.clear();
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
      await this.database.run('INSERT INTO workout_exercises(id, workout_id, exercise_id, name, load_convention, position, entry_mode, rest_seconds, equipment_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [exerciseId, id, exercise.exerciseId, exercise.name, exercise.loadConvention, position, exercise.entryMode ?? 'weighted', exercise.restSeconds ?? null, exercise.equipmentCategory ?? this.equipmentFor(exercise.exerciseId)]);
      const equipmentSetupId = await this.rememberedSetup(exercise.exerciseId, exercise.equipmentCategory ?? this.equipmentFor(exercise.exerciseId));
      await this.database.run('UPDATE workout_exercises SET equipment_setup_id = ? WHERE id = ?', [equipmentSetupId, exerciseId]);
      const [fraction] = await this.database.all<{ fraction: number | null }>('SELECT fraction FROM exercise_fractions WHERE exercise_id = ?', [exercise.exerciseId]);
      const bodyweight = isBodyweight(exercise.entryMode ?? 'weighted') ? this.bodyweightSettings.bodyweight : null;
      const bodyweightUnit = this.bodyweightSettings.bodyweightUnit ?? 'kg';
      const bodyweightFraction = isBodyweight(exercise.entryMode ?? 'weighted') ? exercise.bodyweightFraction !== undefined ? exercise.bodyweightFraction : fraction?.fraction ?? null : null;
      await this.database.run('UPDATE workout_exercises SET bodyweight = ?, bodyweight_unit = ?, bodyweight_fraction = ? WHERE id = ?', [bodyweight, bodyweightUnit, bodyweightFraction, exerciseId]);
      const sets: SetEntry[] = [];
      for (const [setPosition, set] of exercise.sets.entries()) {
        const setId = `${exerciseId}:${setPosition}`;
        await this.database.run('INSERT INTO workout_sets(id, workout_exercise_id, position, type, target_min, target_max) VALUES (?, ?, ?, ?, ?, ?)',
          [setId, exerciseId, setPosition, set.type, set.targetMin, set.targetMax]);
        await this.database.run('UPDATE workout_sets SET equipment_setup_id = ? WHERE id = ?', [equipmentSetupId, setId]);
        sets.push({ id: setId, equipmentSetupId, bodyweight, bodyweightUnit, bodyweightFraction, bodyweightLoad: bodyweight !== null && bodyweightFraction !== null ? Number(bodyweight) * bodyweightFraction : null, type: set.type, targetMin: set.targetMin, targetMax: set.targetMax,
          load: '', originalLoad: '', loadUnit: 'kg', assistance: '', originalAssistance: '', assistanceUnit: 'kg', reps: '', repsLeft: '', repsRight: '', rpe: '', performed: false, revision: 0, status: 'saved', inputState: 'empty', error: null });
      }
      await this.database.run('UPDATE workout_sets SET bodyweight = ?, bodyweight_unit = ?, bodyweight_fraction = ?, bodyweight_load = ? WHERE workout_exercise_id = ?', [bodyweight, bodyweightUnit, bodyweightFraction, bodyweight !== null && bodyweightFraction !== null ? Number(bodyweight) * bodyweightFraction : null, exerciseId]);
      exercises.push({ id: exerciseId, exerciseId: exercise.exerciseId, equipmentCategory: exercise.equipmentCategory ?? this.equipmentFor(exercise.exerciseId), equipmentSetupId, entryMode: exercise.entryMode ?? 'weighted', bodyweight, bodyweightUnit, bodyweightFraction, name: exercise.name, loadConvention: exercise.loadConvention, restSeconds: exercise.restSeconds, sets });
    }
    return { id, title: routine.title, startedAt, bodyweight: this.bodyweightSettings.bodyweight, bodyweightUnit: this.bodyweightSettings.bodyweightUnit ?? 'kg', exercises };
  }

  private row(id: string) {
    if (this.closed) throw new Error('Training storage is closed.');
    const row = this.workout?.exercises.flatMap((exercise) => exercise.sets).find((set) => set.id === id);
    return row;
  }

  editSet(id: string, patch: Partial<Pick<SetEntry, 'load' | 'assistance' | 'reps' | 'repsLeft' | 'repsRight' | 'rpe' | 'type'>>) {
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.resolve(false);
    const row = this.row(id);
    if (!row) return Promise.resolve(false);
    if (!this.supportsEntry(row)) return Promise.resolve(false);
    const mode = this.entryMode(row);
    if ((patch.assistance !== undefined && !(isAssisted(mode) || isBodyweight(mode))) || (patch.load !== undefined && isAssisted(mode))) return Promise.resolve(false);
    if (patch.type !== undefined && patch.type !== row.type) this.previousGeneration++;
    const invalid = this.invalidMeasurements.get(id) ?? new Set<'load' | 'assistance'>();
    for (const field of ['load', 'assistance'] as const) if (patch[field] !== undefined) {
      if (isValidLoad(patch[field])) invalid.delete(field); else invalid.add(field);
    }
    if (invalid.size) this.invalidMeasurements.set(id, invalid);
    else this.invalidMeasurements.delete(id);
    Object.assign(row, patch);
    if (patch.load !== undefined && isValidLoad(patch.load)) {
      row.originalLoad = patch.load;
      row.loadUnit = this.loadUnit;
    }
    if (patch.assistance !== undefined && isValidLoad(patch.assistance)) {
      row.originalAssistance = patch.assistance;
      row.assistanceUnit = this.loadUnit;
    }
    const input = inspectInput(row, this.entryMode(row), this.loadUnit, this.invalidMeasurements.get(row.id));
    row.inputState = input.inputState;
    return this.save(row, !input.complete && (row.performed || this.pendingChecks.has(id)) ? false : undefined);
  }

  copyPrevious(id: string, overwrite: boolean, expected?: { reference: string; revision: number }) {
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.resolve(false);
    const row = this.row(id);
    const previous = this.previousResults().get(id);
    if (!row || !previous || !this.supportsEntry(row)) return Promise.resolve(false);
    const exercise = this.workout?.exercises.find((item) => item.sets.some((set) => set.id === id));
    if (!exercise || previous.entryMode !== exercise.entryMode || previous.loadConvention !== exercise.loadConvention) {
      row.error = 'Previous result uses a different measurement definition and cannot be copied.'; this.publish(); return Promise.resolve(false);
    }
    if (overwrite && (!expected || expected.reference !== previous.reference || expected.revision !== row.revision)) { row.error = 'The set or previous result changed. Review it before copying.'; this.publish(); return Promise.resolve(false); }
    if (!overwrite && (row.load !== '' || row.assistance !== '' || row.reps !== '' || row.repsLeft !== '' || row.repsRight !== '')) return Promise.resolve(false);
    const copied = { ...row, load: previous.load, originalLoad: previous.originalLoad, loadUnit: previous.loadUnit, assistance: previous.assistance, originalAssistance: previous.originalAssistance, assistanceUnit: previous.assistanceUnit, reps: previous.reps, repsLeft: previous.repsLeft, repsRight: previous.repsRight };
    const input = inspectInput(copied, this.entryMode(row), this.loadUnit);
    if (!input.complete && (row.performed || this.pendingChecks.has(id))) {
      row.error = 'Previous values cannot complete this checked set. Enter compatible values first.';
      this.publish();
      return Promise.resolve(false);
    }
    this.invalidMeasurements.delete(id);
    Object.assign(row, copied);
    row.inputState = input.inputState;
    return this.save(row);
  }

  setPerformed(id: string, performed: boolean) {
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.resolve(false);
    const row = this.row(id);
    return row ? this.save(row, performed) : Promise.resolve(false);
  }

  retrySet(id: string) {
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.resolve(false);
    const row = this.row(id);
    return row ? this.save(row, this.retryIntent.get(id)) : Promise.resolve(false);
  }

  async retryFailedSaves() {
    const rows = this.workout?.exercises.flatMap((exercise) => exercise.sets) ?? [];
    const results = await Promise.all(rows.filter((row) => row.status === 'failed').map((row) => this.retrySet(row.id)));
    return results.every(Boolean);
  }

  blurSet(id: string) {
    if (this.restoring || this.isEnding || this.isAdapting) return Promise.resolve(false);
    const row = this.row(id);
    if (!row) return Promise.resolve(false);
    if (!inspectInput(row, this.entryMode(row), this.loadUnit, this.invalidMeasurements.get(row.id)).complete && (row.performed || this.pendingChecks.has(id))) return this.save(row, false);
    if (inspectInput(row, this.entryMode(row), this.loadUnit, this.invalidMeasurements.get(row.id)).inputValid) { row.load = formatLoad(row.originalLoad, row.loadUnit, this.loadUnit); row.assistance = formatLoad(row.originalAssistance, row.assistanceUnit, this.loadUnit); this.publish(); }
    return Promise.resolve(false);
  }

  private entryMode(row: SetEntry): EntryMode {
    return this.workout?.exercises.find((exercise) => exercise.sets.some((set) => set.id === row.id))?.entryMode ?? 'weighted';
  }

  private supportsEntry(row: SetEntry) {
    if (entryModes.includes(this.entryMode(row))) return true;
    row.error = 'Logging for this entry mode is not available yet.';
    this.publish();
    return false;
  }

  private save(row: SetEntry, performed?: boolean): Promise<boolean> {
    if (!this.supportsEntry(row)) return Promise.resolve(false);
    const workoutId = this.workout?.id;
    const { originalLoad, loadUnit, originalAssistance, assistanceUnit, reps, repsLeft, repsRight, rpe, type } = row;
    const { inputValid, complete } = inspectInput(row, this.entryMode(row), this.loadUnit, this.invalidMeasurements.get(row.id));
    // Checking validates performance; it must not invalidate an existing save acknowledgement.
    if (performed === true && (!inputValid || !complete)) {
      row.error = 'Enter nonnegative load and assistance (up to two decimals), valid reps, and optional RPE from 1 to 10 in half steps.';
      this.publish();
      return Promise.resolve(false);
    }
    const revision = ++row.revision;
    if (performed === false) { this.uncheckRevision.set(row.id, revision); this.pendingUnchecks.set(row.id, revision); row.performed = false; }
    if (performed === true) this.pendingChecks.set(row.id, (this.pendingChecks.get(row.id) ?? 0) + 1);
    this.retryIntent.set(row.id, performed);
    if (!inputValid && performed !== false) {
      row.status = 'editing';
      row.error = 'Enter nonnegative load and assistance (up to two decimals), valid reps, and optional RPE from 1 to 10 in half steps.';
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
            await this.database.run('UPDATE workout_sets SET load = ?, load_unit = ?, assistance = ?, assistance_unit = ?, reps = ?, reps_left = ?, reps_right = ?, rpe = ?, type = ? WHERE id = ?',
              [originalLoad === '' ? null : originalLoad, loadUnit, originalAssistance === '' ? null : originalAssistance, assistanceUnit, reps === '' ? null : Number(reps), repsLeft === '' ? null : Number(repsLeft), repsRight === '' ? null : Number(repsRight), rpe === '' ? null : rpe, type, row.id]);
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
