import type { TrainingDatabase } from './database';
import { catalogueExercise } from './catalogue';
import type { SetEntry, Workout } from './workout';

export type WorkoutChange =
  | { type: 'add-exercise'; catalogueId: string }
  | { type: 'replace-exercise'; exerciseId: string; catalogueId: string }
  | { type: 'remove-exercise'; exerciseId: string }
  | { type: 'move-exercise'; exerciseId: string; direction: -1 | 1 }
  | { type: 'add-set'; exerciseId: string }
  | { type: 'remove-set' | 'replace-set'; exerciseId: string; setId: string }
  | { type: 'move-set'; exerciseId: string; setId: string; direction: -1 | 1 };

function blankSet(id: string, template?: SetEntry): SetEntry {
  return { id, equipmentSetupId: template?.equipmentSetupId ?? null, type: template?.type ?? 'normal', targetMin: template?.targetMin ?? 0, targetMax: template?.targetMax ?? 0,
    load: '', originalLoad: '', loadUnit: 'kg', reps: '', repsLeft: '', repsRight: '', rpe: '', performed: false, revision: 0, status: 'saved', inputState: 'empty', error: null };
}

function move<T>(entries: T[], index: number, direction: -1 | 1) {
  if (direction !== -1 && direction !== 1) throw new Error('Invalid move direction.');
  const destination = index + direction;
  if (destination < 0 || destination >= entries.length) return;
  [entries[index], entries[destination]] = [entries[destination], entries[index]];
}

export async function changeWorkout(workout: Workout, change: WorkoutChange, nextId: () => Promise<string>): Promise<Workout> {
  const exercises = workout.exercises.map((exercise) => ({ ...exercise, sets: [...exercise.sets] }));
  async function createExercise(catalogueId: string, templates?: SetEntry[]): Promise<Workout['exercises'][number]> {
    const item = catalogueExercise(catalogueId);
    const sets = [];
    for (const template of templates ?? [undefined]) sets.push(blankSet(await nextId(), template));
    return { id: await nextId(), exerciseId: item.id, equipmentSetupId: null, name: item.name, loadConvention: item.loadConvention, entryMode: item.entryMode, sets };
  }
  if (change.type === 'add-exercise') exercises.push(await createExercise(change.catalogueId));
  else {
    const index = exercises.findIndex((entry) => entry.id === change.exerciseId);
    if (index < 0) throw new Error('Exercise is no longer in this workout.');
    const exercise = exercises[index];
    switch (change.type) {
      case 'remove-exercise': exercises.splice(index, 1); break;
      case 'replace-exercise': exercises[index] = await createExercise(change.catalogueId, exercise.sets); break;
      case 'move-exercise': move(exercises, index, change.direction); break;
      case 'add-set': exercise.sets.push({ ...blankSet(await nextId()), equipmentSetupId: exercise.equipmentSetupId }); break;
      default: {
        const setIndex = exercise.sets.findIndex((set) => set.id === change.setId);
        if (setIndex < 0) throw new Error('Set is no longer in this exercise.');
        if (change.type === 'remove-set') exercise.sets.splice(setIndex, 1);
        else if (change.type === 'replace-set') exercise.sets[setIndex] = { ...blankSet(await nextId(), exercise.sets[setIndex]), equipmentSetupId: exercise.equipmentSetupId };
        else if (change.type === 'move-set') move(exercise.sets, setIndex, change.direction);
      }
    }
  }
  return { ...workout, exercises };
}

/** Only topology changes here: surviving rows keep their acknowledged values and raw in-memory drafts. */
export async function persistWorkoutStructure(database: TrainingDatabase, previous: Workout, next: Workout) {
  for (const exercise of previous.exercises) {
    const retained = next.exercises.find((entry) => entry.id === exercise.id);
    if (!retained) await database.run('DELETE FROM workout_exercises WHERE id = ?', [exercise.id]);
    else for (const set of exercise.sets) {
      if (!retained.sets.some((entry) => entry.id === set.id)) await database.run('DELETE FROM workout_sets WHERE id = ?', [set.id]);
    }
  }
  // Free the positive positions before swaps to preserve uniqueness throughout the transaction.
  await database.run('UPDATE workout_exercises SET position = -position - 1 WHERE workout_id = ?', [previous.id]);
  for (const [position, exercise] of next.exercises.entries()) {
    if (previous.exercises.some((entry) => entry.id === exercise.id)) {
      await database.run('UPDATE workout_exercises SET position = ? WHERE id = ?', [position, exercise.id]);
    } else {
      await database.run('INSERT INTO workout_exercises(id, workout_id, exercise_id, name, load_convention, entry_mode, position, equipment_setup_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [exercise.id, next.id, exercise.exerciseId, exercise.name, exercise.loadConvention, exercise.entryMode, position, exercise.equipmentSetupId]);
    }
    await database.run('UPDATE workout_sets SET position = -position - 1 WHERE workout_exercise_id = ?', [exercise.id]);
    const old = previous.exercises.find((entry) => entry.id === exercise.id);
    for (const [setPosition, set] of exercise.sets.entries()) {
      if (old?.sets.some((entry) => entry.id === set.id)) await database.run('UPDATE workout_sets SET position = ? WHERE id = ?', [setPosition, set.id]);
      else await database.run('INSERT INTO workout_sets(id, workout_exercise_id, position, type, target_min, target_max, equipment_setup_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [set.id, exercise.id, setPosition, set.type, set.targetMin, set.targetMax, set.equipmentSetupId]);
    }
  }
}
