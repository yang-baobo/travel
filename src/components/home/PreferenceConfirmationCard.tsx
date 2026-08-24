import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

export default function PreferenceConfirmationCard({
  visible,
  preference,
  onAction,
  onPreferenceChange,
  large = false,
}: {
  visible: boolean;
  preference: string;
  onAction: (action: 'once' | 'save' | 'edit' | 'ignore') => void;
  onPreferenceChange?: (value: string) => void;
  large?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(preference);
  if (!visible) return null;
  const finishEdit = () => { if (draft.trim()) onPreferenceChange?.(draft.trim()); setEditing(false); onAction('edit'); };
  return <View style={[styles.card, large && styles.cardLarge]}>
    <View style={styles.titleRow}><View style={styles.icon}><Ionicons name="sparkles" size={16} color="#FFF" /></View><View style={styles.copy}><Text style={[styles.title, large && styles.largeText]}>我听到你的偏好</Text>{editing ? <TextInput autoFocus value={draft} onChangeText={setDraft} style={styles.editor} returnKeyType="done" onSubmitEditing={finishEdit} /> : <Text style={[styles.preference, large && styles.largeText]}>“{preference}”</Text>}</View></View>
    <Text style={[styles.hint, large && styles.largeText]}>{editing ? '可以改成更准确的说法，再确认。' : '这次行程要怎么使用？'}</Text>
    <View style={styles.actions}>
      <Pressable style={styles.action} onPress={() => onAction('once')}><Text style={styles.actionText}>仅本次使用</Text></Pressable>
      <Pressable style={styles.action} onPress={() => onAction('save')}><Text style={styles.actionText}>保存为长期偏好</Text></Pressable>
      <Pressable style={styles.textAction} onPress={() => editing ? finishEdit() : setEditing(true)}><Text style={styles.textActionText}>{editing ? '确认修改' : '修改'}</Text></Pressable>
      <Pressable style={styles.textAction} onPress={() => onAction('ignore')}><Text style={styles.textActionText}>忽略</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: '#F1FBF9', borderWidth: 1, borderColor: '#C7E9E2' }, cardLarge: { padding: 18 }, titleRow: { flexDirection: 'row', alignItems: 'center' }, icon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, marginLeft: 10 }, title: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' }, preference: { color: '#304641', fontSize: 13, fontWeight: '700', marginTop: 2 }, hint: { color: '#71827F', fontSize: 11, marginTop: 12 }, largeText: { fontSize: 14 }, editor: { minHeight: 38, marginTop: 4, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#FFF', color: '#304641', fontSize: 13 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, action: { minHeight: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#BFE2DA', paddingHorizontal: 10, paddingVertical: 7 }, actionText: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' }, textAction: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 7 }, textActionText: { color: '#71827F', fontSize: 11, fontWeight: '700' },
});
