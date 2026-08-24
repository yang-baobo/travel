import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { PLANNER_MODE_COPY, PlannerMode } from '../../data/beijingHomeMock';

export default function PlannerModeSelector({ value, onChange }: { value: PlannerMode; onChange: (value: PlannerMode) => void }) {
  return <View style={styles.list}>{(Object.keys(PLANNER_MODE_COPY) as PlannerMode[]).map(mode => {
    const item = PLANNER_MODE_COPY[mode]; const active = mode === value;
    return <Pressable key={mode} onPress={() => onChange(mode)} style={[styles.item, active && styles.itemActive]}>
      <View style={[styles.icon, active && styles.iconActive]}><Ionicons name={item.icon as any} size={17} color={active ? '#FFF' : colors.primary} /></View>
      <View style={styles.copy}><Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text><Text style={styles.description}>{item.description}</Text></View>
      <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
    </Pressable>;
  })}</View>;
}

const styles = StyleSheet.create({
  list: { gap: 8 }, item: { flexDirection: 'row', alignItems: 'center', minHeight: 64, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: '#E2EBE8', backgroundColor: '#FFF' }, itemActive: { borderColor: colors.primary, backgroundColor: '#F1FBF9' }, icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF6F3' }, iconActive: { backgroundColor: colors.primary }, copy: { flex: 1, marginLeft: 10 }, label: { color: '#0F2B27', fontWeight: '800', fontSize: 13 }, labelActive: { color: colors.primaryDark }, description: { color: '#71827F', fontSize: 11, marginTop: 3 }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#B7C8C4', alignItems: 'center', justifyContent: 'center' }, radioActive: { borderColor: colors.primary }, radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
});
