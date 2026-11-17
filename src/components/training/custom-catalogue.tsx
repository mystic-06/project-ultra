/* eslint-disable react-hooks/refs -- Refs are read only in event handlers and effect cleanup; button creates event handlers. */
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bodyParts, isAssisted, isBodyweight, isUnilateral, type CustomExercise, type EntryMode } from '@/training/catalogue';
import { useTraining } from '@/training/provider';
import { pulse, pulseStyles as styles } from './pulse';

type Draft = { id: string; name: string; equipment: string; entryMode: EntryMode; bodyParts: string[]; fraction: string; fractionChanged?: boolean };
const newId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const button = (title: string, onPress: () => void) => <Pressable accessibilityRole="button" style={styles.button} onPress={onPress}><Text style={styles.buttonText}>{title}</Text></Pressable>;
const mode = (unilateral: boolean, load: string): EntryMode => load === 'bodyweight' ? unilateral ? 'unilateral-bodyweight' : 'bodyweight' : load === 'assisted' ? unilateral ? 'unilateral-assisted' : 'assisted' : unilateral ? 'unilateral' : 'weighted';

export function CustomCatalogue({ onSaved }: { onSaved?: (item: CustomExercise) => void }) {
  const { training, customDraft, customExercises } = useTraining();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const lease = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (lease.current) void training.releaseCustomDraft(lease.current); }; }, [training]);
  function update(next: Draft) { if (lock.current || !lease.current) return; setDraft(next); setError(''); void training.saveCustomDraft(JSON.stringify(next), lease.current).catch(() => { if (mounted.current) setError('Draft could not be saved. Edit again to retry.'); }); }
  async function begin(next: Draft, saved?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { const acquired = await training.beginCustomDraft(saved ?? JSON.stringify(next)); if (!mounted.current) { void training.releaseCustomDraft(acquired); return; } lease.current = acquired; setDraft(next); setError(''); }
    catch { if (mounted.current) setError('Another draft is open or this draft could not be saved.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function open(item?: CustomExercise) {
    if (customDraft) { setError('Resume or discard the existing draft first.'); return; }
    void begin(item ? { id: item.id, name: item.name, equipment: item.equipment, entryMode: item.entryMode, bodyParts: item.bodyParts, fraction: item.fraction?.toString() ?? '', fractionChanged: false } : { id: newId(), name: '', equipment: 'other', entryMode: 'weighted', bodyParts: [], fraction: '', fractionChanged: false });
  }
  async function discard() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const active = lease.current ?? (customDraft ? await training.beginCustomDraft(customDraft) : null);
      if (!active) throw new Error();
      lease.current = active; await training.discardCustomDraft(active); lease.current = null;
      if (mounted.current) { setDraft(null); setConfirm(false); setError(''); }
    } catch {
      if (!draft && lease.current) { await training.releaseCustomDraft(lease.current); lease.current = null; }
      if (mounted.current) setError('Could not discard draft.');
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function save() {
    if (!draft || !lease.current || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await training.commitCustomDraft(JSON.stringify(draft), lease.current); lease.current = null;
      if (mounted.current) { const item = training.getSnapshot().customExercises.find((entry) => entry.id === draft.id); if (item) onSaved?.(item); setDraft(null); setError(''); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Could not save exercise.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View pointerEvents={busy || confirm ? 'none' : 'auto'}>{customDraft ? <View style={styles.card}><Text style={styles.heading}>Unfinished custom exercise</Text>{button('Resume draft', () => { try { void begin(JSON.parse(customDraft), customDraft); } catch { setError('Could not open draft.'); } })}{button('Discard draft…', () => setConfirm(true))}</View> : button('Create exercise', () => open())}</View>
    <View pointerEvents={busy || confirm ? 'none' : 'auto'}>{customExercises.map((item) => <View key={item.id} style={styles.card}><Text style={styles.heading}>{item.name}{item.archived ? ' · archived' : ''}</Text>{button('Edit', () => open(item))}{button(item.archived ? 'Restore' : 'Archive', () => { void training.archiveCustomExercise(item.id, !item.archived).catch(() => setError('Could not change archive status.')); })}</View>)}</View>
    <Modal visible={confirm && !draft} transparent onRequestClose={() => setConfirm(false)}><SafeAreaView style={styles.screen}><View pointerEvents={busy ? 'none' : 'auto'} style={styles.card}><Text style={styles.heading}>Discard this draft?</Text>{error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}{button('Confirm discard', () => void discard())}{button('Keep draft', () => setConfirm(false))}</View></SafeAreaView></Modal>
    <Modal visible={draft !== null} animationType="slide" onRequestClose={() => { if (!lock.current) setConfirm(true); }}><SafeAreaView style={styles.screen}>{confirm && <View pointerEvents={busy ? 'none' : 'auto'} style={styles.card}><Text style={styles.heading}>Discard unsaved edits?</Text>{error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}{button('Confirm discard', () => void discard())}{button('Keep editing', () => setConfirm(false))}</View>}<ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" pointerEvents={busy || confirm ? 'none' : 'auto'}>
      <Text style={styles.title}>Custom exercise</Text>{error ? <Text style={styles.error}>{error}</Text> : null}
      {draft && <><Text style={styles.muted}>Name</Text><TextInput accessibilityLabel="Exercise name" value={draft.name} onChangeText={(name) => update({ ...draft, name })} style={{ color: pulse.text, backgroundColor: pulse.input, padding: 14, minHeight: 48 }} />
      <Text style={styles.heading}>Equipment · {draft.equipment}</Text>{['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'].map((equipment) => <View key={equipment}>{button(equipment, () => update({ ...draft, equipment }))}</View>)}
      <Text style={styles.heading}>Reps · {isUnilateral(draft.entryMode) ? 'L/R' : 'Bilateral'}</Text>{['Bilateral', 'L/R'].map((label) => <View key={label}>{button(label, () => update({ ...draft, entryMode: mode(label === 'L/R', isBodyweight(draft.entryMode) ? 'bodyweight' : isAssisted(draft.entryMode) ? 'assisted' : 'external') }))}</View>)}
      <Text style={styles.heading}>Load · {isBodyweight(draft.entryMode) ? 'Bodyweight' : isAssisted(draft.entryMode) ? 'Assisted' : 'External'}</Text>{['external', 'bodyweight', 'assisted'].map((load) => <View key={load}>{button(load, () => update({ ...draft, entryMode: mode(isUnilateral(draft.entryMode), load) }))}</View>)}
      {isBodyweight(draft.entryMode) && <><Text style={styles.muted}>Bodyweight fraction (0–1; optional)</Text><TextInput accessibilityLabel="Bodyweight fraction" value={draft.fraction} onChangeText={(fraction) => update({ ...draft, fraction, fractionChanged: true })} keyboardType="decimal-pad" style={{ color: pulse.text, backgroundColor: pulse.input, padding: 14, minHeight: 48 }} /></>}
      <Text style={styles.heading}>Body parts</Text>{bodyParts.map((part) => <View key={part}>{button(`${draft.bodyParts.includes(part) ? '✓ ' : ''}${part}`, () => update({ ...draft, bodyParts: draft.bodyParts.includes(part) ? draft.bodyParts.filter((p) => p !== part) : [...draft.bodyParts, part] }))}</View>)}
      {button('Save exercise', () => void save())}{button('Cancel', () => setConfirm(true))}</>}
    </ScrollView></SafeAreaView></Modal>
  </View>;
}
