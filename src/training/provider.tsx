import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { openExpoDatabase } from './expo-database';
import { openTraining, type Training } from './workout';

const TrainingContext = createContext<Training | null>(null);

export function TrainingProvider({ children }: { children: ReactNode }) {
  const [training, setTraining] = useState<Training | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let opened: Training | undefined;
    openExpoDatabase().then(openTraining).then((value) => {
      opened = value;
      if (disposed) void value.close();
      else setTraining(value);
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; if (opened) void opened.close(); };
  }, [attempt]);

  if (!training) return (
    <View style={styles.loading}>
      {error ? <>
        <Text style={styles.text}>Your training data could not be opened.</Text>
        <Pressable accessibilityRole="button" style={styles.retry} onPress={() => { setError(false); setAttempt(attempt + 1); }}>
          <Text style={styles.text}>Retry</Text>
        </Pressable>
      </> : <ActivityIndicator accessibilityLabel="Opening your training log" color="#D8F58B" />}
    </View>
  );
  return <TrainingContext.Provider value={training}>{children}</TrainingContext.Provider>;
}

export function useTraining() {
  const training = useContext(TrainingContext);
  if (!training) throw new Error('TrainingProvider is required.');
  const snapshot = useSyncExternalStore(training.subscribe, training.getSnapshot, training.getSnapshot);
  return { training, ...snapshot };
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#161C22', justifyContent: 'center', alignItems: 'center', gap: 20, padding: 24 },
  text: { color: '#F2F5EE', fontSize: 16 },
  retry: { padding: 16, backgroundColor: '#2D3944', borderRadius: 10 },
});
