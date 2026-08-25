import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PLANNER_MODE_COPY } from '../../data/beijingHomeUi';
import type { PlannerMode } from '../../data/beijingHomeUi';

interface PlannerModeSelectorProps {
  visible: boolean;
  value: PlannerMode;
  onChange: (value: PlannerMode) => void;
  onClose: () => void;
}

export default function PlannerModeSelector({ visible, value, onChange, onClose }: PlannerModeSelectorProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.overlay} />
        <View style={styles.picker}>
          <View style={styles.handle} />
          <Text style={styles.pickerTitle}>选择规划方式</Text>
          {(Object.keys(PLANNER_MODE_COPY) as PlannerMode[]).map(mode => (
            <Pressable
              key={mode}
              onPress={() => {
                onChange(mode);
                onClose();
              }}
              style={[styles.modeItem, value === mode && styles.modeItemActive]}
            >
              <View style={[styles.modeIcon, value === mode && styles.modeIconActive]}>
                <Ionicons name={PLANNER_MODE_COPY[mode].icon as any} size={20} color={value === mode ? '#FFF' : '#0E9F93'} />
              </View>
              <View style={styles.modeCopy}>
                <Text style={[styles.modeLabel, value === mode && styles.modeLabelActive]}>{PLANNER_MODE_COPY[mode].label}</Text>
                <Text style={styles.modeDescription}>{PLANNER_MODE_COPY[mode].description}</Text>
              </View>
              {value === mode && <Ionicons name="checkmark-circle" size={22} color="#0E9F93" />}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,32,28,0.5)' },
  picker: {
    maxHeight: '70%',
    backgroundColor: '#FFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D5E1DD', alignSelf: 'center', marginBottom: 18 },
  pickerTitle: { color: '#0F2B27', fontSize: 18, fontWeight: '900', marginBottom: 16 },
  modeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: '#F4F8F6',
  },
  modeItemActive: { backgroundColor: '#E6F8F4', borderWidth: 1, borderColor: '#0E9F93' },
  modeIcon: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,159,147,0.12)',
  },
  modeIconActive: { backgroundColor: '#0E9F93' },
  modeCopy: { flex: 1, marginLeft: 14 },
  modeLabel: { color: '#0F2B27', fontSize: 15, fontWeight: '800' },
  modeLabelActive: { color: '#0A7A70' },
  modeDescription: { color: '#82938F', fontSize: 11, marginTop: 3 },
});
