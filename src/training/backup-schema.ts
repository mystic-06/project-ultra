import { bodyParts, entryModes, isAssisted, isBodyweight, isUnilateral, type EntryMode } from './catalogue';
import { decodeRoutineDraft, validateRoutine, type Routine } from './routines';
import type { SqlValue } from './database';

// Version-one identifiers are application-owned constants, never supplied by the file.
export const backupColumns = {
  workouts: 'id routine_id title started_at active completed_at bodyweight bodyweight_unit',
  workout_exercises: 'id workout_id exercise_id name load_convention position entry_mode equipment_setup_id rest_seconds bodyweight bodyweight_unit bodyweight_fraction equipment_category',
  workout_sets: 'id workout_exercise_id position type target_min target_max load load_unit reps reps_left reps_right rpe performed equipment_setup_id bodyweight bodyweight_unit bodyweight_fraction bodyweight_load assistance assistance_unit',
  equipment_setups: 'id label gym ratio archived',
  equipment_last_selection: 'exercise_id setup_id',
  custom_equipment_last_selection: 'exercise_id equipment_category setup_id',
  rest_settings: 'id automatic default_seconds',
  routines: 'id data', routine_seed: 'id', routine_draft: 'id data',
  load_settings: 'id unit', bodyweight_settings: 'id bodyweight bodyweight_unit writeback setup_complete',
  exercise_fractions: 'exercise_id fraction', custom_exercises: 'id data', custom_draft: 'id data',
} as const;
export type BackupTable = keyof typeof backupColumns;
export interface BackupV1 { version: 1; data: Record<BackupTable, Record<string, SqlValue>[]> }

const fail = (): never => { throw new Error('Invalid or unsupported backup.'); };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const str = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown) => str(value) && value.trim().length > 0;
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value);
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const nullable = (value: unknown, valid: (v: unknown) => boolean) => value === null || valid(value);
const unit = (value: unknown) => value === 'kg' || value === 'lb';
const flag = (value: unknown) => value === 0 || value === 1;
const fraction = (value: unknown) => nullable(value, v => number(v) && (v as number) >= 0 && (v as number) <= 1);
const measurement = (value: unknown) => nullable(value, v => str(v) && /^\d+(?:\.\d{1,2})?$/.test(v) && Number.isFinite(Number(v)));
const positiveMeasurement = (value: unknown) => measurement(value) && (value === null || Number(value) > 0);
const unique = (rows: Record<string, SqlValue>[], columns: string[]) => new Set(rows.map(row => JSON.stringify(columns.map(c => row[c])))).size === rows.length;

/** Validate the complete logical file without trusting SQLite's type coercion. */
export function validateBackup(value: unknown): BackupV1 {
  if (!object(value) || !exact(value, ['version', 'data']) || value.version !== 1 || !object(value.data) || !exact(value.data, Object.keys(backupColumns))) return fail();
  const data = value.data as Record<string, unknown>;
  for (const [table, list] of Object.entries(backupColumns)) {
    const rows = data[table]; const columns = list.split(' ');
    if (!Array.isArray(rows) || rows.some(row => !object(row) || !exact(row, columns) || Object.values(row).some(v => v !== null && !str(v) && !number(v)))) return fail();
  }
  const result = value as unknown as BackupV1; const d = result.data;
  for (const table of Object.keys(backupColumns) as BackupTable[]) {
    const key = table === 'equipment_last_selection' || table === 'exercise_fractions' ? ['exercise_id'] : table === 'custom_equipment_last_selection' ? ['exercise_id', 'equipment_category'] : ['id'];
    if (!unique(d[table], key)) return fail();
  }
  for (const table of ['rest_settings', 'load_settings', 'bodyweight_settings', 'routine_seed'] as const) if (d[table].length !== 1 || d[table][0].id !== 1) return fail();
  for (const table of ['routine_draft', 'custom_draft'] as const) if (d[table].length > 1 || d[table].some(r => r.id !== 1 || !str(r.data))) return fail();
  if (d.rest_settings.some(r => !flag(r.automatic) || !integer(r.default_seconds) || (r.default_seconds as number) < 1 || (r.default_seconds as number) > 86400) || d.load_settings.some(r => !unit(r.unit)) || d.bodyweight_settings.some(r => !positiveMeasurement(r.bodyweight) || !unit(r.bodyweight_unit) || !flag(r.writeback) || !flag(r.setup_complete))) return fail();
  if (d.equipment_setups.some(r => !nonempty(r.id) || !nullable(r.label, str) || !nullable(r.gym, str) || !nullable(r.ratio, str) || !flag(r.archived))) return fail();
  const setups = new Set(d.equipment_setups.map(r => r.id));
  const setupRef = (id: SqlValue) => id === null || setups.has(id);
  if (d.equipment_last_selection.some(r => !nonempty(r.exercise_id) || !setupRef(r.setup_id)) || d.custom_equipment_last_selection.some(r => !nonempty(r.exercise_id) || !nonempty(r.equipment_category) || !setupRef(r.setup_id)) || d.exercise_fractions.some(r => !nonempty(r.exercise_id) || !fraction(r.fraction))) return fail();
  for (const r of d.routine_draft) {
    try { decodeRoutineDraft(r.data as string); } catch (error) {
      // Old versions acknowledged arbitrary raw text. Keep syntactically incomplete drafts recoverable for discard.
      if (!(error instanceof SyntaxError)) return fail();
    }
  }
  try {
    for (const r of d.routines) {
      if (!nonempty(r.id) || !str(r.data)) return fail();
      const routine = JSON.parse(r.data) as Routine;
      if (!routine || !Array.isArray(routine.exercises) || routine.exercises.some(e => !e || (e.restSeconds !== undefined && (!integer(e.restSeconds) || e.restSeconds < 0)))) return fail();
      // Older releases allowed any nonnegative safe integer override. Validate
      // the remaining routine with today's rules without changing stored JSON.
      validateRoutine({ ...routine, exercises: routine.exercises.map(e => ({ ...e, restSeconds: undefined })) });
      if (routine.id !== r.id || routine.exercises.some(e => (e.equipmentCategory !== undefined && !str(e.equipmentCategory)) || (e.bodyweightFraction !== undefined && !fraction(e.bodyweightFraction)))) return fail();
    }
    for (const r of d.custom_draft) {
      const draft: unknown = JSON.parse(r.data as string);
      if (!object(draft) || !str(draft.id) || !draft.id.startsWith('custom-') || !str(draft.name) || !str(draft.equipment) || !entryModes.includes(draft.entryMode as never) || !Array.isArray(draft.bodyParts) || !draft.bodyParts.every(str) || !str(draft.fraction) || (draft.fractionChanged !== undefined && typeof draft.fractionChanged !== 'boolean')) return fail();
    }
    for (const r of d.custom_exercises) {
      if (!str(r.id) || !r.id.startsWith('custom-') || !str(r.data)) return fail(); const x: unknown = JSON.parse(r.data);
      if (!object(x) || x.id !== r.id || !nonempty(x.name) || !nonempty(x.equipment) || !entryModes.includes(x.entryMode as never) || !str(x.loadConvention) || !(x.sourceId === null || str(x.sourceId)) || !Array.isArray(x.aliases) || !x.aliases.every(str) || !Array.isArray(x.bodyParts) || !x.bodyParts.length || !x.bodyParts.every(part => bodyParts.includes(part as never)) || !fraction(x.fraction) || typeof x.archived !== 'boolean') return fail();
    }
  } catch { return fail(); }
  if (d.workouts.filter(r => r.active === 1).length > 1 || d.workouts.some(r => !nonempty(r.id) || !nonempty(r.routine_id) || !str(r.title) || !integer(r.started_at) || !flag(r.active) || !(r.active === 1 ? r.completed_at === null : nullable(r.completed_at, integer)) || !positiveMeasurement(r.bodyweight) || !unit(r.bodyweight_unit))) return fail();
  const workouts = new Set(d.workouts.map(r => r.id));
  if (!unique(d.workout_exercises, ['workout_id', 'position']) || d.workout_exercises.some(r => !nonempty(r.id) || !workouts.has(r.workout_id) || !nonempty(r.exercise_id) || !str(r.name) || !str(r.load_convention) || !integer(r.position) || (r.position as number) < 0 || !entryModes.includes(r.entry_mode as never) || !setupRef(r.equipment_setup_id) || !nullable(r.rest_seconds, v => integer(v) && (v as number) >= 0) || !positiveMeasurement(r.bodyweight) || !unit(r.bodyweight_unit) || !fraction(r.bodyweight_fraction) || !nullable(r.equipment_category, str))) return fail();
  const exercises = new Map(d.workout_exercises.map(r => [r.id, r]));
  if (!unique(d.workout_sets, ['workout_exercise_id', 'position']) || d.workout_sets.some(r => !nonempty(r.id) || !exercises.has(r.workout_exercise_id) || !integer(r.position) || (r.position as number) < 0 || !['normal', 'warmup', 'drop'].includes(r.type as string) || !integer(r.target_min) || !integer(r.target_max) || (r.target_min as number) < 0 || (r.target_max as number) < (r.target_min as number) || (r.target_min === 0 && r.target_max !== 0) || !measurement(r.load) || !unit(r.load_unit) || !measurement(r.assistance) || !unit(r.assistance_unit) || !nullable(r.reps, v => integer(v) && (v as number) > 0) || !nullable(r.reps_left, v => integer(v) && (v as number) >= 0) || !nullable(r.reps_right, v => integer(v) && (v as number) >= 0) || !nullable(r.rpe, v => str(v) && /^\d+(?:\.\d)?$/.test(v) && Number(v) >= 1 && Number(v) <= 10 && Number(v) * 2 % 1 === 0) || !flag(r.performed) || !setupRef(r.equipment_setup_id) || !positiveMeasurement(r.bodyweight) || !unit(r.bodyweight_unit) || !fraction(r.bodyweight_fraction) || !nullable(r.bodyweight_load, v => number(v) && (v as number) >= 0))) return fail();
  for (const row of d.workout_sets) {
    if (row.performed !== 1) continue;
    const mode = exercises.get(row.workout_exercise_id)!.entry_mode as EntryMode;
    const repsComplete = isUnilateral(mode) ? (Number(row.reps_left) > 0 || Number(row.reps_right) > 0) : row.reps !== null;
    const loadComplete = isBodyweight(mode) || (isAssisted(mode) ? row.assistance !== null : row.load !== null);
    if (!repsComplete || !loadComplete) return fail();
  }
  return result;
}
