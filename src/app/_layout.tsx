import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';

import { pulse } from '@/components/training/pulse';
import { ResumeWorkoutBar } from '@/components/training/resume-bar';
import { TrainingProvider } from '@/training/provider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Manrope: require('../../assets/fonts/Manrope.ttf') });
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;

  return <ThemeProvider value={DarkTheme}>
    <TrainingProvider>
      <View style={{ flex: 1, backgroundColor: pulse.background }}>
        <Stack screenOptions={{ headerStyle: { backgroundColor: pulse.background }, headerTintColor: pulse.text, contentStyle: { backgroundColor: pulse.background } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="workout" options={{ title: 'Workout', headerBackTitle: 'Home' }} />
        </Stack>
        <ResumeWorkoutBar />
      </View>
    </TrainingProvider>
  </ThemeProvider>;
}
