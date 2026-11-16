import { Pressable, Text, View } from 'react-native';

import { useTraining } from '@/training/provider';
import { catalogueExercise } from '@/training/catalogue';
import { equipmentName } from './equipment-selector';
import { pulseStyles as styles } from './pulse';
import { formatAssistance, formatLoad, setResultState, type Workout } from '@/training/workout';

export function WorkoutResults({ workout, onCheck, disabled = false }: {
  workout: Workout; onCheck?: (id: string, performed: boolean) => void; disabled?: boolean;
}) {
  const { equipmentSetups, loadUnit } = useTraining();
  return <>{(['performed', 'unfinished', 'untouched'] as const).map((state) => <View key={state} style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>
      {state === 'performed' ? 'Performed' : state === 'unfinished' ? 'Unfinished' : 'Not entered'}
    </Text>
    {state === 'unfinished' && <Text style={styles.muted}>Entered, unchecked · excluded from performed totals.</Text>}
    {!workout.exercises.some((exercise) => exercise.sets.some((set) => setResultState(set) === state)) && <Text style={styles.muted}>None</Text>}
    {workout.exercises.map((exercise) => <View key={exercise.id}>
      {exercise.sets.map((set, index) => setResultState(set) !== state ? null : <View key={set.id} style={{ gap: 8, paddingVertical: 8 }}>
        <Text style={styles.text}>{exercise.name} · Set {index + 1}{set.type === 'warmup' ? ' · Warm-up' : set.type === 'drop' ? ' · Drop set' : ''}</Text>
        <Text style={styles.muted}>{exercise.entryMode === 'bodyweight' ? 'Added load: ' : exercise.entryMode === 'assisted' ? 'Assistance: ' : ''}{exercise.entryMode === 'assisted' ? formatAssistance(onCheck ? set.assistance : formatLoad(set.originalAssistance, set.assistanceUnit, loadUnit)) || '—' : (onCheck ? set.load : formatLoad(set.originalLoad, set.loadUnit, loadUnit)) || '—'} {loadUnit} × {exercise.entryMode === 'unilateral' ? `${set.repsLeft || '—'} / ${set.repsRight || '—'}` : set.reps || '—'} reps{set.rpe ? ` · RPE ${set.rpe}` : ''}</Text>
        {exercise.entryMode === 'bodyweight' && set.assistance !== '' && <Text style={styles.muted}>Assistance: {formatAssistance(onCheck ? set.assistance : formatLoad(set.originalAssistance, set.assistanceUnit, loadUnit))} {loadUnit}</Text>}
        {exercise.entryMode === 'bodyweight' && <Text style={styles.muted}>Bodyweight: {set.bodyweight === null ? '—' : formatLoad(set.bodyweight, set.bodyweightUnit, loadUnit)} {loadUnit} · Fraction: {set.bodyweightFraction ?? '—'} · Calculated: {set.bodyweightLoad === null ? '—' : formatLoad(String(set.bodyweightLoad), set.bodyweightUnit, loadUnit)} {loadUnit}</Text>}
        {exercise.entryMode !== 'assisted' && <Text style={styles.muted}>{exercise.loadConvention}</Text>}
        {['machine', 'cable'].includes(catalogueExercise(exercise.exerciseId).equipment) && <Text style={styles.muted}>Equipment: {equipmentName(set.equipmentSetupId, equipmentSetups)}</Text>}
        {onCheck && state !== 'untouched' && <Pressable accessibilityRole="checkbox"
          accessibilityLabel={`${exercise.name}, set ${index + 1}, performed`} accessibilityState={{ checked: set.performed, disabled }}
          disabled={disabled} style={styles.button} onPress={() => onCheck(set.id, !set.performed)}>
          <Text style={styles.buttonText}>{set.performed ? '✓ Performed · Uncheck' : 'Mark performed'}</Text>
        </Pressable>}
        {onCheck && set.error && <Text style={styles.error}>{set.error}</Text>}
      </View>)}
    </View>)}
  </View>)}</>;
}
