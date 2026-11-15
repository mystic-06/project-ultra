import { StyleSheet } from 'react-native';

export const pulse = {
  background: '#161C22', surface: '#212B34', input: '#2D3944', text: '#F2F5EE',
  secondary: '#AEBDC7', accent: '#D8F58B', onAccent: '#233016', border: '#3D4A55', error: '#FFB4AB',
};

export const pulseStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: pulse.background },
  content: { padding: 20, gap: 20, width: '100%', maxWidth: 600, alignSelf: 'center' },
  title: { color: pulse.text, fontFamily: 'Manrope', fontWeight: '800', fontSize: 30 },
  heading: { color: pulse.text, fontFamily: 'Manrope', fontWeight: '700', fontSize: 20 },
  text: { color: pulse.text, fontFamily: 'Manrope', fontSize: 16 },
  muted: { color: pulse.secondary, fontFamily: 'Manrope', fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: pulse.surface, padding: 20, borderRadius: 12, gap: 16 },
  button: { backgroundColor: pulse.accent, borderRadius: 10, padding: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: pulse.onAccent, fontFamily: 'Manrope', fontSize: 16, fontWeight: '800' },
  error: { color: pulse.error, fontFamily: 'Manrope', fontSize: 14, lineHeight: 21 },
});
