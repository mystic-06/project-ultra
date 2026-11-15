import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pulseStyles as styles } from '@/components/training/pulse';
import { useTraining } from '@/training/provider';
import { upperStarter } from '@/training/routines';

export default function HomeScreen() {
  const { training, workout } = useTraining();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setStarting(true);
    setError(false);
    try {
      await training.start(upperStarter);
      router.push('/workout');
    } catch {
      setError(true);
    } finally {
      setStarting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.muted}>PROJECT ULTRA</Text>
        <Text style={styles.title}>Ready when you are.</Text>
        <Text style={styles.muted}>Your training, at your pace.</Text>
        {workout ? <View style={styles.card}>
          <Text style={styles.muted}>ACTIVE WORKOUT</Text>
          <Text style={styles.heading}>{workout.title}</Text>
          <Text style={styles.muted}>
            {workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.performed).length} sets performed
          </Text>
          <Link href="/workout" asChild>
            <Pressable accessibilityRole="button" style={styles.button}>
              <Text style={styles.buttonText}>Resume workout</Text>
            </Pressable>
          </Link>
        </View> : <View style={styles.card}>
          <Text style={styles.muted}>YOUR ROUTINE</Text>
          <Text style={styles.heading}>{upperStarter.title}</Text>
          <Text style={styles.muted}>3 exercises · 7 sets</Text>
          <Text style={styles.muted}>Lat pulldown · Chest press · Overhead press</Text>
          <Text style={styles.muted}>A weighted subset of UPPER to get started.</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: starting }}
            disabled={starting} onPress={start} style={[styles.button, starting && { opacity: 0.6 }]}>
            <Text style={styles.buttonText}>{starting ? 'Starting…' : 'Start workout'}</Text>
          </Pressable>
          {error && <Text accessibilityLiveRegion="polite" style={styles.error}>Could not start. Your saved data is unchanged. Try again.</Text>}
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
}
