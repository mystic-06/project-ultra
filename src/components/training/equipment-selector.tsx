import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { pulse, pulseStyles } from './pulse';
import { EditAction, EditActions } from './workout-edit-controls';
import type { EquipmentSetup, Training, Workout } from '@/training/workout';

export function equipmentName(id: string | null, setups: EquipmentSetup[]) {
  if (id === null) return 'No setup';
  const setup = setups.find((item) => item.id === id);
  return setup ? [setup.label || 'Unnamed setup', setup.gym, setup.ratio && `Ratio ${setup.ratio}`, setup.archived && 'Archived'].filter(Boolean).join(' · ') : 'Unknown setup';
}

export function EquipmentSelector({ training, exercise, setups, disabled }: { training: Training; exercise: Workout['exercises'][number]; setups: EquipmentSetup[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [gym, setGym] = useState('');
  const [ratio, setRatio] = useState('');
  const [error, setError] = useState('');
  const hasMixedEquipment = new Set(exercise.sets.map((set) => set.equipmentSetupId)).size > 1;
  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); } catch { setError('Could not save equipment. Please try again.'); }
  };
  const choose = (id: string | null) => run(async () => {
    if (correcting) await training.correctSetEquipment(correcting, id);
    else await training.selectEquipmentSetup(exercise.id, id);
    setCorrecting(null); setOpen(false);
  });
  return <View style={{ gap: 8 }}>
    <Text style={pulseStyles.text}>Equipment: {equipmentName(exercise.equipmentSetupId, setups)}</Text>
    <EditAction label={open ? 'Close equipment' : 'Change equipment'} disabled={disabled} onPress={() => { setCorrecting(null); setOpen(!open); }} />
    {hasMixedEquipment && <Text style={pulseStyles.muted}>Sets use different equipment.</Text>}
    {exercise.sets.map((set, index) => <View key={set.id}>
      {(set.performed || hasMixedEquipment) && <Text style={pulseStyles.muted}>Set {index + 1}: {equipmentName(set.equipmentSetupId, setups)}</Text>}
      {set.performed && <EditAction label={`Correct equipment for set ${index + 1}`} disabled={disabled} onPress={() => { setCorrecting(set.id); setOpen(true); }} />}
    </View>)}
    {open && <View style={pulseStyles.card}>
      <Text style={pulseStyles.heading}>{correcting ? 'Correct checked set equipment' : 'Choose equipment for unchecked sets'}</Text>
      <EditAction label="No setup" disabled={disabled} onPress={() => void choose(null)} />
      {setups.map((setup) => <View key={setup.id} style={{ gap: 4 }}>
        {!setup.archived && <EditAction label={equipmentName(setup.id, setups)} disabled={disabled} onPress={() => void choose(setup.id)} />}
        {setup.archived && <Text style={pulseStyles.muted}>{equipmentName(setup.id, setups)}</Text>}
        <EditAction label={`${setup.archived ? 'Restore' : 'Archive'} ${setup.label || 'unnamed setup'}`} disabled={disabled} onPress={() => void run(() => training.archiveEquipmentSetup(setup.id, !setup.archived))} />
      </View>)}
      <Text style={pulseStyles.heading}>New equipment setup</Text>
      <Text style={pulseStyles.muted}>All fields are optional. Leave ratio blank if unknown.</Text>
      {[[label, setLabel, 'Label'], [gym, setGym, 'Gym'], [ratio, setRatio, 'Ratio, e.g. 2:1']] .map(([value, setter, placeholder]) => <TextInput key={placeholder as string} value={value as string} onChangeText={setter as (value: string) => void} placeholder={placeholder as string} accessibilityLabel={placeholder as string} placeholderTextColor={pulse.secondary} style={{ color: pulse.text, backgroundColor: pulse.input, borderRadius: 8, minHeight: 48, padding: 10 }} />)}
      <EditActions><EditAction label="Create and select" disabled={disabled} onPress={() => void run(async () => {
        const setup = await training.createEquipmentSetup({ label, gym, ratio });
        if (correcting) await training.correctSetEquipment(correcting, setup.id); else await training.selectEquipmentSetup(exercise.id, setup.id);
        setLabel(''); setGym(''); setRatio(''); setCorrecting(null); setOpen(false);
      })} /></EditActions>
    </View>}
    {!!error && <Text accessibilityLiveRegion="polite" style={pulseStyles.error}>{error}</Text>}
  </View>;
}
