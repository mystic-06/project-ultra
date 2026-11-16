export interface Routine {
  id: string;
  title: string;
  exercises: {
    exerciseId: string;
    name: string;
    loadConvention: string;
    entryMode?: import('./catalogue').EntryMode;
    restSeconds?: number;
    sets: { type: 'normal' | 'warmup' | 'drop'; targetMin: number; targetMax: number }[];
  }[];
}

export type RoutineDraftSet = { type: 'normal' | 'warmup' | 'drop'; min: string; max: string };
export type RoutineDraftExercise = Omit<Routine['exercises'][number], 'sets' | 'restSeconds'> & { rest: string; sets: RoutineDraftSet[] };
export type RoutineDraft = { id: string; title: string; exercises: RoutineDraftExercise[] };

export class RoutineValidationError extends Error {
  constructor() { super('Add a name and exercise, and enter valid rep ranges and rest seconds (1–86400).'); }
}

/** Validation belongs to the training boundary, including for callers with a constructed Routine. */
export function validateRoutine(routine: Routine): Routine {
  if (!routine || typeof routine.id !== 'string' || !routine.id.trim() || typeof routine.title !== 'string' || !routine.title.trim() ||
      !Array.isArray(routine.exercises) || !routine.exercises.length || routine.exercises.some((e) =>
        !e || typeof e.exerciseId !== 'string' || !e.exerciseId.trim() || typeof e.name !== 'string' || !e.name.trim() ||
        typeof e.loadConvention !== 'string' || (e.entryMode !== undefined && !['weighted', 'unilateral', 'bodyweight', 'assisted'].includes(e.entryMode)) ||
        !Array.isArray(e.sets) || !e.sets.length || (e.restSeconds !== undefined && (!Number.isSafeInteger(e.restSeconds) || e.restSeconds < 1 || e.restSeconds > 86400)) ||
        e.sets.some((set) => !set || !['normal', 'warmup', 'drop'].includes(set.type) || !Number.isSafeInteger(set.targetMin) || !Number.isSafeInteger(set.targetMax) || set.targetMin < 1 || set.targetMax < set.targetMin))) {
    throw new RoutineValidationError();
  }
  return { ...routine, title: routine.title.trim() };
}

/** Convert the raw, recoverable input only when the user explicitly saves. */
export function routineFromDraft(data: string): Routine {
  try {
    const draft = JSON.parse(data) as RoutineDraft;
    const number = (value: string) => typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
    return validateRoutine({ id: draft.id, title: draft.title, exercises: draft.exercises.map((e) => ({
      exerciseId: e.exerciseId, name: e.name, loadConvention: e.loadConvention, entryMode: e.entryMode,
      restSeconds: e.rest === '' ? undefined : number(e.rest),
      sets: e.sets.map((set) => ({ type: set.type, targetMin: number(set.min), targetMax: number(set.max) })),
    })) });
  } catch {
    throw new RoutineValidationError();
  }
}

// Weighted bilateral subset of the owner's UPPER prescription. Other modes follow later.
export const upperStarter: Routine = {
  id: 'upper-weighted-starter',
  title: 'UPPER · weighted starter',
  exercises: [
    {
      exerciseId: 'lat-pulldown', name: 'Lat pulldown', loadConvention: 'Displayed machine load',
      sets: Array.from({ length: 2 }, () => ({ type: 'normal', targetMin: 5, targetMax: 7 })),
    },
    {
      exerciseId: 'chest-press-machine', name: 'Chest press · machine', loadConvention: 'Displayed machine load',
      sets: Array.from({ length: 2 }, () => ({ type: 'normal', targetMin: 7, targetMax: 9 })),
    },
    {
      exerciseId: 'overhead-press-barbell', name: 'Overhead press · barbell', loadConvention: 'Combined load, including the bar',
      sets: [
        { type: 'warmup', targetMin: 4, targetMax: 6 },
        { type: 'normal', targetMin: 4, targetMax: 6 },
        { type: 'normal', targetMin: 4, targetMax: 6 },
      ],
    },
  ],
};
