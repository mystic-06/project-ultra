import { useEffect, useRef, useState } from 'react';
import { router, usePreventRemove } from 'expo-router';
import type { BackupV1 } from '@/training/backup-schema';
import { pickBackupFile } from '@/training/pick-backup';
import { Platform, Pressable, ScrollView, Switch, Text, TextInput, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BodyweightSettings } from '@/components/training/bodyweight-settings';
import { pulse, pulseStyles } from '@/components/training/pulse';
import { useTraining } from '@/training/provider';
import { exportBackupFile } from '@/training/export-backup';

export default function SettingsScreen() {
  const { training, restSettings, loadUnit } = useTraining();
  const [operation, setOperation] = useState<'select' | 'export' | 'restore' | null>(null);
  const operationLock = useRef(false);
  const restoredLock = useRef(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [selectedBackup, setSelectedBackup] = useState<BackupV1 | null>(null);
  const [restoreSucceeded, setRestoreSucceeded] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');
  useEffect(() => { if (restoreSucceeded && !operation) router.dismissTo({ pathname: '/', params: { restored: '1' } }); }, [restoreSucceeded, operation]);
  usePreventRemove(operation !== null, () => setBackupMessage('Please wait for the backup operation to finish.'));
  function beginOperation(next: 'select' | 'export' | 'restore') {
    if (operationLock.current || restoredLock.current) return false;
    operationLock.current = true; setOperation(next); return true;
  }
  function endOperation() { operationLock.current = false; setOperation(null); }
  async function pickBackup() {
    if (!beginOperation('select')) return;
    setRestoreMessage('');
    try {
      const result = await pickBackupFile();
      if (result.status === 'cancelled') setRestoreMessage('Backup selection cancelled.');
      else if (result.status === 'failed') setRestoreMessage('Could not read a valid, supported backup. Current data was not changed.');
      else setSelectedBackup(result.backup);
    } finally { endOperation(); }
  }
  async function restoreBackup() {
    if (!selectedBackup || !beginOperation('restore')) return;
    setRestoreMessage('');
    try { await training.restoreBackup(selectedBackup); restoredLock.current = true; setSelectedBackup(null); setRestoreSucceeded(true); }
    catch { setRestoreMessage('Restore failed. Current data was not changed.'); }
    finally { endOperation(); }
  }
  async function exportBackup() {
    if (!beginOperation('export')) return;
    setBackupMessage('');
    try {
      const result = await exportBackupFile(training);
      const messages = {
        success: 'Backup exported to the selected folder.',
        cancelled: 'Export cancelled.',
        failed: 'Export failed. Please try again.',
        partial: 'Export failed. A partial backup may remain in the selected folder; please delete it.',
        busy: 'Another backup export is in progress.',
      };
      setBackupMessage(messages[result]);
    } finally { endOperation(); }
  }
  const busy = operation !== null || restoreSucceeded;
  const [unitError, setUnitError] = useState('');
  const [seconds, setSeconds] = useState(String(restSettings.defaultSeconds));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save(automatic: boolean, defaultSeconds: number) {
    try { await training.setRestSettings({ automatic, defaultSeconds }); setError(''); setMessage('Saved'); }
    catch { setMessage(''); setError('Could not save. Enter 1–86400 whole seconds and try again.'); }
  }
  return <SafeAreaView style={pulseStyles.screen} edges={['left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={pulseStyles.content} keyboardShouldPersistTaps="handled">
      <View style={pulseStyles.card}>
        <Text style={pulseStyles.heading}>Backup</Text>
        <Text style={pulseStyles.muted}>Save a copy of your training data to a folder you choose.</Text>
        {Platform.OS === 'android' ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={pulseStyles.button} onPress={() => void exportBackup()}><Text style={pulseStyles.buttonText}>{operation === 'export' ? 'Exporting…' : 'Export backup'}</Text></Pressable> : <Text style={pulseStyles.muted}>Backup export is available on Android.</Text>}
        {!selectedBackup && backupMessage ? <Text accessibilityLiveRegion="polite" style={pulseStyles.muted}>{backupMessage}</Text> : null}
        {Platform.OS === 'android' && !selectedBackup ? <Pressable accessibilityRole="button" disabled={busy} style={pulseStyles.button} onPress={() => void pickBackup()}><Text style={pulseStyles.buttonText}>Select backup to restore</Text></Pressable> : null}
        {selectedBackup ? <View style={pulseStyles.card}>
          <Text style={pulseStyles.heading}>Replace current data?</Text>
          <Text style={pulseStyles.text}>Restoring replaces your current training, history, settings and saved drafts. Export a copy first if you want to keep them.</Text>
          <Pressable accessibilityRole="button" disabled={busy} style={pulseStyles.button} onPress={() => void exportBackup()}><Text style={pulseStyles.buttonText}>Export current data first</Text></Pressable>
          {backupMessage ? <Text accessibilityLiveRegion="polite" style={pulseStyles.muted}>{backupMessage}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} style={pulseStyles.button} onPress={() => void restoreBackup()}><Text style={pulseStyles.buttonText}>{operation === 'restore' ? 'Restoring…' : 'Restore and replace data'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} style={pulseStyles.button} onPress={() => { setSelectedBackup(null); setRestoreMessage('Restore cancelled.'); }}><Text style={pulseStyles.buttonText}>Cancel</Text></Pressable>
        </View> : null}
        {restoreMessage ? <Text accessibilityLiveRegion="polite" style={pulseStyles.muted}>{restoreMessage}</Text> : null}
      </View>
      <View pointerEvents={busy ? 'none' : 'auto'} accessibilityElementsHidden={busy} importantForAccessibility={busy ? 'no-hide-descendants' : 'auto'}>
      <BodyweightSettings />
      <View style={pulseStyles.card}>
        <Text style={pulseStyles.heading}>Load unit</Text>
        <Text style={pulseStyles.muted}>Choose how loads are displayed and entered.</Text>
        <View style={styles.row}>{(['kg', 'lb'] as const).map((unit) => <Pressable key={unit} accessibilityRole="radio" accessibilityState={{ checked: loadUnit === unit }} style={pulseStyles.button} onPress={() => {
          void training.setLoadUnit(unit).then(() => { setUnitError(''); }).catch((reason: unknown) => { setUnitError(reason instanceof Error && reason.message.startsWith('Complete or clear') ? reason.message : 'Could not save the unit. Try again.'); });
        }}><Text style={pulseStyles.buttonText}>{unit === loadUnit ? '✓ ' : ''}{unit}</Text></Pressable>)}</View>
        {unitError ? <Text accessibilityLiveRegion="polite" style={pulseStyles.error}>{unitError}</Text> : null}
      </View>
      <View style={pulseStyles.card}>
        <Text style={pulseStyles.heading}>Rest timer</Text>
        <View style={styles.row}><Text style={[pulseStyles.text, styles.label]}>Start automatically after a check</Text>
          <Switch accessibilityLabel="Start rest automatically" value={restSettings.automatic} onValueChange={(value) => void save(value, restSettings.defaultSeconds)} />
        </View>
        <Text style={pulseStyles.text}>Default automatic rest (seconds)</Text>
        <TextInput accessibilityLabel="Default automatic rest in seconds" keyboardType="number-pad" value={seconds} onChangeText={(value) => { setSeconds(value); setMessage(''); }} style={styles.input} />
        <Pressable accessibilityRole="button" style={pulseStyles.button} onPress={() => void save(restSettings.automatic, Number(seconds))}><Text style={pulseStyles.buttonText}>Save duration</Text></Pressable>
        <Text style={pulseStyles.muted}>Routine exercises can override this duration. Manual rest is set in your workout.</Text>
        {error ? <Text accessibilityLiveRegion="polite" style={pulseStyles.error}>{error}</Text> : <Text accessibilityLiveRegion="polite" style={pulseStyles.muted}>{message}</Text>}
      </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { flex: 1 },
  input: { minHeight: 48, color: pulse.text, backgroundColor: pulse.input, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
});
