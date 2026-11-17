import { Link, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pulse, pulseStyles as styles } from '@/components/training/pulse';
import { isAssisted, isBodyweight, isUnilateral } from '@/training/catalogue';
import { equipmentName } from '@/components/training/equipment-selector';
import { WorkoutResults } from '@/components/training/workout-results';
import { useTraining } from '@/training/provider';
import { summarizeWorkout, type CompletedWorkout, type SetEntry, type LoadUnit } from '@/training/workout';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HistoryDetail key={id} id={id} />;
}

function HistoryDetail({ id }: { id: string }) {
  const { training, loadUnit, equipmentSetups } = useTraining();
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [draft, setDraft] = useState<CompletedWorkout | null>(null);
  const [unit, setUnit] = useState<LoadUnit>(loadUnit);
  const [workoutUnit, setWorkoutUnit] = useState<LoadUnit>(loadUnit);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const [prompt, setPrompt] = useState<'discard' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [equipmentRow, setEquipmentRow] = useState<string | null>(null);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(workout);
  usePreventRemove(dirty || busy, ({ repeat }) => { if (!busyRef.current && !prompt) { pendingNavigation.current = repeat; Keyboard.dismiss(); setEquipmentRow(null); setPrompt('discard'); } });
  const update = (id: string, patch: Parameters<typeof training.editCompletedSetDraft>[2]) => setDraft((current) => current && training.editCompletedSetDraft(current, id, patch, unit));
  const action = async (fn: () => Promise<void>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Please try again.'); } finally { busyRef.current = false; setBusy(false); } };
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    training.getCompletedWorkout(id).then((result) => {
      if (!disposed) { setWorkout(result); setWorkoutUnit(training.getSnapshot().loadUnit); setState('ready'); }
    }).catch(() => { if (!disposed) setState('failed'); });
    return () => { disposed = true; };
  }, [training, id, attempt]);

  return <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {state === 'loading' ? <Text style={styles.text}>Opening workout…</Text> : state === 'failed' ? <>
        <Text style={styles.error}>Could not open this workout.</Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setState('loading'); setAttempt(attempt + 1); }}><Text style={styles.buttonText}>Retry</Text></Pressable>
      </> : !workout ? <Text style={styles.heading}>Workout not found</Text> : <>
        <Text style={styles.muted}>COMPLETED WORKOUT</Text>
        <Text style={styles.title}>{workout.title}</Text>
        <Text style={styles.muted}>{new Date(workout.startedAt).toLocaleString()} · {Math.max(0, Math.round((workout.completedAt - workout.startedAt) / 60000))} min</Text>
        <Text style={styles.text}>{summarizeWorkout(workout).performed} performed sets</Text>
        {!prompt && (draft ? <>
          <Text style={styles.muted}>Editing in {unit}. Changes are saved only when you choose Save.</Text>
          {draft.exercises.map((exercise) => <View key={exercise.id} style={styles.card}>
            <Text style={styles.heading}>{exercise.name}</Text>
            {exercise.sets.map((set, index) => <View key={set.id} style={{ gap: 8 }}>
              <Text style={styles.text}>Set {index + 1} · {set.type}</Text>
              {(['normal', 'warmup', 'drop'] as const).map((type) => <Pressable key={type} disabled={busy} accessibilityRole="button" style={styles.button} onPress={() => update(set.id, { type })}><Text style={styles.buttonText}>{type === set.type ? '✓ ' : ''}{type}</Text></Pressable>)}
              {([[isAssisted(exercise.entryMode) ? 'assistance' : 'load', isAssisted(exercise.entryMode) ? `Assistance (${unit})` : `Load (${unit})`], ...(isBodyweight(exercise.entryMode) ? [['assistance', `Assistance (${unit})`]] : []), ...(isUnilateral(exercise.entryMode) ? [['repsLeft', 'Left reps'], ['repsRight', 'Right reps']] : [['reps', 'Reps']]), ['rpe', 'RPE']] as [keyof SetEntry, string][]).map(([field, label]) => <View key={field} style={{ gap: 4 }}><Text style={styles.muted}>{label}</Text><TextInput accessibilityLabel={`${exercise.name} set ${index + 1} ${label}`} editable={!busy} keyboardType="decimal-pad" value={String(set[field] ?? '')} onChangeText={(value) => update(set.id, { [field]: value })} style={{ minHeight: 48, backgroundColor: pulse.input, color: pulse.text, borderRadius: 8, padding: 10 }} /></View>)}
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.performed, disabled: busy }} accessibilityLabel={`${exercise.name}, set ${index + 1}, performed`} disabled={busy} style={styles.button} onPress={() => update(set.id, { performed: !set.performed })}><Text style={styles.buttonText}>{set.performed ? '✓ Performed' : 'Mark performed'}</Text></Pressable>
              {!!set.error && <Text accessibilityLiveRegion="polite" style={styles.error}>{exercise.name}, set {index + 1}: {set.error}</Text>}
              {['machine', 'cable'].includes(exercise.equipmentCategory) && <><Text style={styles.muted}>Equipment: {equipmentName(set.equipmentSetupId, equipmentSetups)}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Change equipment for ${exercise.name}, set ${index + 1}`} disabled={busy} style={styles.button} onPress={() => setEquipmentRow(equipmentRow === set.id ? null : set.id)}><Text style={styles.buttonText}>Change equipment</Text></Pressable>{equipmentRow === set.id && <>{[{ id: null, label: 'No setup' }, ...equipmentSetups.filter((item) => !item.archived).map((item) => ({ id: item.id, label: equipmentName(item.id, equipmentSetups) }))].map((item) => <Pressable key={item.id ?? 'none'} accessibilityRole="button" accessibilityLabel={`${exercise.name}, set ${index + 1}: ${item.label}`} disabled={busy} style={styles.button} onPress={() => { update(set.id, { equipmentSetupId: item.id }); setEquipmentRow(null); }}><Text style={styles.buttonText}>{item.label}</Text></Pressable>)}</>}</>}
            </View>)}
          </View>)}
          <Pressable disabled={busy} style={styles.button} onPress={() => void action(async () => { const saved = await training.saveCompletedWorkout(workout, draft, unit); setWorkout(saved); setWorkoutUnit(training.getSnapshot().loadUnit); setDraft(null); setPrompt(null); setEquipmentRow(null); })}><Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save'}</Text></Pressable>
          <Pressable disabled={busy} style={styles.button} onPress={() => { setError(''); if (dirty) { pendingNavigation.current = null; Keyboard.dismiss(); setEquipmentRow(null); setPrompt('discard'); } else { setDraft(null); setPrompt(null); setEquipmentRow(null); } }}><Text style={styles.buttonText}>Cancel</Text></Pressable>
        </> : <><WorkoutResults workout={workout} />
          <Pressable disabled={busy} style={styles.button} onPress={() => { setUnit(workoutUnit); setDraft(JSON.parse(JSON.stringify(workout))); setPrompt(null); setError(''); }}><Text style={styles.buttonText}>Edit workout</Text></Pressable>
          <Pressable disabled={busy} style={styles.button} onPress={() => { setPrompt('delete'); setError(''); }}><Text style={styles.buttonText}>Delete workout</Text></Pressable></>)}
        {prompt && <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>{prompt === 'discard' ? 'Discard your changes?' : 'Delete this workout?'}</Text><Text style={styles.muted}>{prompt === 'discard' ? 'Your corrections will be lost.' : 'This permanently removes the completed workout.'}</Text><Pressable disabled={busy} style={styles.button} onPress={() => { if (prompt === 'discard') { setDraft(null); setPrompt(null); setEquipmentRow(null); const repeat = pendingNavigation.current; pendingNavigation.current = null; repeat?.(); } else void action(async () => { await training.deleteCompletedWorkout(id); setPrompt(null); setWorkout(null); }); }}><Text style={styles.buttonText}>{prompt === 'discard' ? 'Discard changes' : 'Confirm delete'}</Text></Pressable><Pressable disabled={busy} style={styles.button} onPress={() => { pendingNavigation.current = null; setPrompt(null); }}><Text style={styles.buttonText}>Keep workout</Text></Pressable></View>}
        {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      </>}
      {!draft && !busy && !prompt && <Link href="/" style={styles.text}>Back to Home</Link>}
    </ScrollView>
  </SafeAreaView>;
}
