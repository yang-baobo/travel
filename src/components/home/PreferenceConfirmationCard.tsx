import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

export default function PreferenceConfirmationCard({ visible, preference, onAction }: { visible: boolean; preference: string; onAction: (action: 'once' | 'save' | 'edit' | 'ignore') => void }) {
  if (!visible) return null;
  return <View style={styles.card}><View style={styles.titleRow}><View style={styles.icon}><Ionicons name="sparkles" size={16} color="#FFF" /></View><View style={styles.copy}><Text style={styles.title}>我听到你的偏好</Text><Text style={styles.preference}>“{preference}”</Text></View></View><Text style={styles.hint}>这次行程要怎么使用？</Text><View style={styles.actions}><Pressable style={styles.action} onPress={() => onAction('once')}><Text style={styles.actionText}>仅本次使用</Text></Pressable><Pressable style={styles.action} onPress={() => onAction('save')}><Text style={styles.actionText}>保存为长期偏好</Text></Pressable><Pressable style={styles.textAction} onPress={() => onAction('edit')}><Text style={styles.textActionText}>修改</Text></Pressable><Pressable style={styles.textAction} onPress={() => onAction('ignore')}><Text style={styles.textActionText}>忽略</Text></Pressable></View></View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: '#F1FBF9', borderWidth: 1, borderColor: '#C7E9E2' }, titleRow: { flexDirection: 'row', alignItems: 'center' }, icon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, marginLeft: 10 }, title: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' }, preference: { color: '#304641', fontSize: 13, fontWeight: '700', marginTop: 2 }, hint: { color: '#71827F', fontSize: 11, marginTop: 12 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, action: { borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#BFE2DA', paddingHorizontal: 10, paddingVertical: 7 }, actionText: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' }, textAction: { paddingHorizontal: 8, paddingVertical: 7 }, textActionText: { color: '#71827F', fontSize: 11, fontWeight: '700' },
});
