import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { PARAMETER_OPTIONS, PlannerParams } from '../../data/beijingHomeMock';

type Key = keyof PlannerParams;
const LABELS: Record<Key, string> = { days: '旅行天数', people: '出行人数', budget: '预计预算', pace: '旅行节奏' };

export default function PlannerParameterPicker({ field, value, onClose, onChange }: { field: Key | null; value: PlannerParams; onClose: () => void; onChange: (field: Key, value: string) => void }) {
  return <Modal visible={field !== null} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.overlay} onPress={onClose}><Pressable style={styles.sheet} onPress={() => undefined}>
    <View style={styles.handle} />{field && <><View style={styles.header}><Text style={styles.title}>{LABELS[field]}</Text><Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={22} color="#71827F" /></Pressable></View><View style={styles.options}>{PARAMETER_OPTIONS[field].map(option => { const active = value[field] === option; return <Pressable key={option} onPress={() => { onChange(field, option); onClose(); }} style={[styles.option, active && styles.optionActive]}><Text style={[styles.optionText, active && styles.optionTextActive]}>{option}</Text>{active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}</Pressable>; })}</View></>}</Pressable></Pressable></Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(7,35,31,0.38)', justifyContent: 'flex-end' }, sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34 }, handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: '#CBD8D4', marginBottom: 18 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: '#0F2B27', fontSize: 18, fontWeight: '800' }, options: { gap: 9, marginTop: 18 }, option: { minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: '#E3EBE8', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, optionActive: { borderColor: colors.primary, backgroundColor: '#F1FBF9' }, optionText: { color: '#304641', fontSize: 14, fontWeight: '600' }, optionTextActive: { color: colors.primaryDark, fontWeight: '800' },
});
