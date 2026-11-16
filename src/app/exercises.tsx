import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pulse, pulseStyles as styles } from '@/components/training/pulse';
import { useTraining } from '@/training/provider';
import type { CatalogueExercise } from '@/training/catalogue';

export default function ExercisePicker() {
  const { workoutId, replaceId } = useLocalSearchParams<{ workoutId: string; replaceId?: string }>();
  const { training, workout, isAdapting, isEnding } = useTraining();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CatalogueExercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = isAdapting || isEnding;
  const results = training.searchExercises(query);
  const current = workout?.exercises.find((exercise) => exercise.id === replaceId);

  async function choose(item: CatalogueExercise) {
    setError(null);
    try {
      await training.adaptWorkout(workoutId, replaceId
        ? { type: 'replace-exercise', exerciseId: replaceId, catalogueId: item.id }
        : { type: 'add-exercise', catalogueId: item.id });
      router.back();
    } catch {
      setError('Could not change the workout. Your previous exercises are kept. Try again.');
    }
  }

  return <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
    <FlatList data={results} keyExtractor={(exercise) => exercise.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={{ gap: 16 }}>
        <Text style={styles.title}>{replaceId ? 'Replace exercise' : 'Add exercise'}</Text>
        <Text style={styles.muted}>Search your offline catalogue. New exercises start with a blank set.</Text>
        <TextInput accessibilityLabel="Search exercises" value={query} onChangeText={(text) => { setQuery(text); setSelected(null); }}
          placeholder="Name or equipment" placeholderTextColor={pulse.secondary} autoCorrect={false}
          style={{ minHeight: 48, backgroundColor: pulse.input, padding: 14, borderRadius: 10, color: pulse.text, fontSize: 16 }} />
        {workout?.id !== workoutId ? <Text style={styles.error}>This workout is no longer active. Return to your workout.</Text> : null}
        {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        {selected && <View style={styles.card}>
          <Text style={styles.heading}>Replace {current?.name} with {selected.name}?</Text>
          <Text style={styles.muted}>This removes the old exercise’s entries and checks. Planned set targets remain; the new results start blank.</Text>
          <Pressable disabled={busy} style={styles.button} accessibilityRole="button" onPress={() => void choose(selected)}>
            <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Confirm replacement'}</Text>
          </Pressable>
          <Pressable disabled={busy} style={styles.button} accessibilityRole="button" onPress={() => setSelected(null)}><Text style={styles.buttonText}>Cancel replacement</Text></Pressable>
        </View>}
      </View>}
      ListEmptyComponent={<Text accessibilityLiveRegion="polite" style={styles.text}>No exercises found. Try another name or equipment.</Text>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" disabled={busy || workout?.id !== workoutId}
        onPress={() => replaceId ? setSelected(item) : void choose(item)} style={styles.card}>
        <Text style={styles.heading}>{item.name}</Text>
        <Text style={styles.muted}>{item.equipment} · {item.entryMode === 'weighted' ? item.loadConvention : `${item.entryMode} entry not available yet`}</Text>
      </Pressable>} />
  </SafeAreaView>;
}
