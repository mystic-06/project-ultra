import { createContext, useContext, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pulse, pulseStyles as styles } from '@/components/training/pulse';
import { useTraining } from '@/training/provider';
import { RoutineValidationError, type Routine, type RoutineDraft as Draft, type RoutineDraftExercise as DraftExercise, type RoutineDraftSet as DraftSet } from '@/training/routines';

const toDraft = (routine: Routine): Draft => ({ ...routine, exercises: routine.exercises.map((e) => ({ ...e, rest: e.restSeconds?.toString() ?? '', sets: e.sets.map((s) => ({ type: s.type, min: String(s.targetMin), max: String(s.targetMax) })) })) });
const newSet = (): DraftSet => ({ type: 'normal', min: '8', max: '10' });
function move<T>(items: T[], index: number, direction: number) {
  const next = [...items], destination = index + direction;
  if (destination >= 0 && destination < items.length) [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
const BusyContext = createContext<{ busy: boolean; lock: { current: boolean } }>({ busy: false, lock: { current: false } });
function Button({ title, onPress }: { title: string; onPress: () => void }) {
  const { busy, lock } = useContext(BusyContext);
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} onPress={() => { if (!lock.current) onPress(); }} style={local.button}><Text style={local.buttonText}>{title}</Text></Pressable>;
}
function Input({ label, value, onChange, numeric = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; disabled?: boolean }) {
  const { lock } = useContext(BusyContext);
  return <View style={local.field}><Text style={styles.muted}>{label}</Text><TextInput editable={!disabled} accessibilityLabel={label} value={value} onChangeText={(next) => { if (!lock.current) onChange(next); }} keyboardType={numeric ? 'number-pad' : 'default'} style={local.input} /></View>;
}
export default function RoutinesScreen() {
  const { training, routines, routineDraft } = useTraining();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [confirm, setConfirm] = useState<'discard' | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  function update(next: Draft) {
    if (busyRef.current) return;
    setDraft(next); setError(null);
    void training.saveRoutineDraft(JSON.stringify(next)).catch(() => setError('Could not save this draft. Make another edit or retry before leaving.'));
  }
  function open(routine?: Routine) {
    if (routineDraft) { setError('Resume or discard the existing draft first.'); return; }
    update(routine ? toDraft(routine) : { id: `routine-${Date.now()}-${Math.random().toString(36).slice(2)}`, title: '', exercises: [] });
  }
  function changeExercise(index: number, change: (exercise: DraftExercise) => DraftExercise) {
    if (!draft) return;
    update({ ...draft, exercises: draft.exercises.map((e, i) => i === index ? change(e) : e) });
  }
  async function save() {
    if (!draft || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await training.commitRoutineDraft(JSON.stringify(draft));
      setDraft(null); setError(null);
    } catch (error) {
      setError(error instanceof RoutineValidationError ? error.message : 'Could not save the routine. Your draft is kept; try again.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function discard() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await training.discardRoutineDraft(); setDraft(null); setConfirm(null); setError(null); }
    catch { setError('Could not discard the draft. Try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function remove(id: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await training.deleteRoutine(id); setConfirm(null); setError(null); }
    catch { setError('Could not delete the routine. Try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <BusyContext.Provider value={{ busy, lock: busyRef }}><SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
    <ScrollView pointerEvents={busy ? 'none' : 'auto'} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.muted}>Saved routines are available on Home. Changes apply to future workouts.</Text>
      {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      {routineDraft ? <View style={styles.card}><Text style={styles.heading}>Unfinished routine</Text><Text style={styles.muted}>Your interrupted draft is available.</Text>
        <Button title="Resume draft" onPress={() => { try { setDraft(JSON.parse(routineDraft) as Draft); setError(null); } catch { setError('The draft could not be opened.'); } }} />
        <Button title="Discard draft…" onPress={() => setConfirm('discard')} />
      </View> : <Button title="Create routine" onPress={() => open()} />}
      {routines.map((routine) => <View key={routine.id} style={styles.card}>
        <Text style={styles.heading}>{routine.title}</Text><Text style={styles.muted}>{routine.exercises.length} exercises</Text>
        <View style={local.row}><Button title="Edit" onPress={() => open(routine)} /><Button title="Delete…" onPress={() => setConfirm(routine.id)} /></View>
      </View>)}
      {confirm && !draft && <View style={styles.card}><Text style={styles.heading}>{confirm === 'discard' ? 'Discard this draft?' : 'Delete this routine?'}</Text><Text style={styles.muted}>{confirm === 'discard' ? 'Unsaved edits will be lost.' : 'Existing workouts are kept.'}</Text><Button title={confirm === 'discard' ? 'Confirm discard' : 'Confirm deletion'} onPress={() => void (confirm === 'discard' ? discard() : remove(confirm))} /><Button title="Keep" onPress={() => setConfirm(null)} /></View>}
    </ScrollView>
    <Modal visible={draft !== null || busy} animationType="slide" onRequestClose={() => { if (!busyRef.current) setConfirm('discard'); }}>
      <SafeAreaView style={styles.screen}>
        {confirm === 'discard' && <View pointerEvents={busy ? 'none' : 'auto'} style={styles.card}><Text style={styles.heading}>Discard unsaved edits?</Text><Text style={styles.muted}>Your saved routine will stay as it was.</Text><Button title="Confirm discard" onPress={() => void discard()} /><Button title="Keep editing" onPress={() => setConfirm(null)} /></View>}
        <ScrollView pointerEvents={busy ? 'none' : 'auto'} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.title}>Edit routine</Text>
        {error && <><Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>{draft && <Button title="Retry saving draft" onPress={() => update(draft)} />}</>}
        {draft && <>
          <Input disabled={busy} label="Routine name" value={draft.title} onChange={(title) => update({ ...draft, title })} />
          {draft.exercises.map((exercise, i) => <View key={`${exercise.exerciseId}-${i}`} style={styles.card}>
            <Text style={styles.heading}>{exercise.name}</Text>
            <View style={local.row}><Button title="Move up" onPress={() => update({ ...draft, exercises: move(draft.exercises, i, -1) })} /><Button title="Move down" onPress={() => update({ ...draft, exercises: move(draft.exercises, i, 1) })} /><Button title="Remove" onPress={() => update({ ...draft, exercises: draft.exercises.filter((_, index) => index !== i) })} /></View>
            <Input disabled={busy} label="Rest override (seconds; blank uses default)" value={exercise.rest} numeric onChange={(rest) => changeExercise(i, (e) => ({ ...e, rest }))} />
            {exercise.sets.map((set, j) => <View key={j} style={local.set}>
              <Text style={styles.text}>Set {j + 1} · {set.type}</Text>
              <Button title="Change set type" onPress={() => changeExercise(i, (e) => ({ ...e, sets: e.sets.map((s, k) => k === j ? { ...s, type: s.type === 'normal' ? 'warmup' : s.type === 'warmup' ? 'drop' : 'normal' } : s) }))} />
              <View style={local.row}><Input disabled={busy} label={`Set ${j + 1} min reps`} value={set.min} numeric onChange={(min) => changeExercise(i, (e) => ({ ...e, sets: e.sets.map((s, k) => k === j ? { ...s, min } : s) }))} /><Input disabled={busy} label={`Set ${j + 1} max reps`} value={set.max} numeric onChange={(max) => changeExercise(i, (e) => ({ ...e, sets: e.sets.map((s, k) => k === j ? { ...s, max } : s) }))} /></View>
              <View style={local.row}><Button title="Set up" onPress={() => changeExercise(i, (e) => ({ ...e, sets: move(e.sets, j, -1) }))} /><Button title="Set down" onPress={() => changeExercise(i, (e) => ({ ...e, sets: move(e.sets, j, 1) }))} /><Button title="Remove set" onPress={() => changeExercise(i, (e) => ({ ...e, sets: e.sets.filter((_, k) => k !== j) }))} /></View>
            </View>)}
            <Button title="Add set" onPress={() => changeExercise(i, (e) => ({ ...e, sets: [...e.sets, newSet()] }))} />
          </View>)}
          <Button title={selecting ? 'Close exercise search' : 'Add exercise'} onPress={() => setSelecting(!selecting)} />
          {selecting && <View style={styles.card}><Input disabled={busy} label="Search exercises" value={query} onChange={setQuery} />{training.searchExercises(query).map((exercise) => <Button key={exercise.id} title={exercise.name} onPress={() => { update({ ...draft, exercises: [...draft.exercises, { exerciseId: exercise.id, name: exercise.name, loadConvention: exercise.loadConvention, entryMode: exercise.entryMode, rest: '', sets: [newSet()] }] }); setSelecting(false); setQuery(''); }} />)}</View>}
          <Button title={busy ? 'Saving…' : 'Save routine'} onPress={() => void save()} />
          <Button title="Cancel" onPress={() => setConfirm('discard')} />
        </>}
      </ScrollView></SafeAreaView>
    </Modal>
  </SafeAreaView></BusyContext.Provider>;
}
const local = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', borderRadius: 8, backgroundColor: '#34414B', marginVertical: 3 },
  buttonText: { color: pulse.text, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  field: { flexGrow: 1, gap: 5 }, input: { color: pulse.text, borderWidth: 1, borderColor: '#647481', borderRadius: 8, padding: 10, minHeight: 48, fontSize: 16 },
  set: { gap: 6, borderTopWidth: 1, borderTopColor: '#647481', paddingTop: 10 },
});
