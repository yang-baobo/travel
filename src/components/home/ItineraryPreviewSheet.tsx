import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PLANNER_MODE_COPY } from '../../data/beijingHomeUi';
import type { PlannerCandidate } from '../../data/beijingHomeUi';

interface ItineraryPreviewSheetProps {
  visible: boolean;
  days: string;
  selectedCandidates: PlannerCandidate[];
  modeLabel: string;
  onClose: () => void;
  onViewFull: () => void;
}

export default function ItineraryPreviewSheet({
  visible,
  days,
  selectedCandidates,
  modeLabel,
  onClose,
  onViewFull,
}: ItineraryPreviewSheetProps) {
  const [sheetTranslateY, setSheetTranslateY] = useState(0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <View style={styles.overlay} />
        <View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>PREVIEW</Text>
                <Text style={styles.title}>这是初步方案</Text>
                <Text style={styles.modeTag}>{modeLabel} · {days}</Text>
              </View>
              <Pressable onPress={onClose} style={styles.close}>
                <Ionicons name="close" size={20} color="#304641" />
              </Pressable>
            </View>

            {selectedCandidates.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>已选地点 · 可修改</Text>
                <View style={styles.candidateList}>
                  {selectedCandidates.map((candidate, index) => (
                    <View key={candidate.id} style={styles.candidateItem}>
                      <View style={styles.candidateIndex}>
                        <Text style={styles.candidateIndexText}>{index + 1}</Text>
                      </View>
                      <View style={styles.candidateCopy}>
                        <Text style={styles.candidateName}>{candidate.name}</Text>
                        <Text style={styles.candidateDetail}>{candidate.detail}</Text>
                      </View>
                      <Pressable style={styles.editButton}>
                        <Ionicons name="create-outline" size={15} color="#0E9F93" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="map-outline" size={36} color="#D0DDD9" />
                <Text style={styles.emptyText}>还未选择任何地点</Text>
                <Text style={styles.emptyHint}>返回上方选择想去的地方</Text>
              </View>
            )}

            <View style={styles.aiNote}>
              <Ionicons name="sparkles" size={18} color="#C38A25" />
              <View style={styles.aiNoteCopy}>
                <Text style={styles.aiNoteTitle}>AI 提示</Text>
                <Text style={styles.aiNoteText}>点击下方按钮后，AI 将生成详细路线、交通方式和时间安排。</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>继续修改</Text>
              </Pressable>
              <Pressable onPress={onViewFull} style={styles.primaryButton}>
                <Ionicons name="arrow-forward" size={17} color="#FFF" />
                <Text style={styles.primaryButtonText}>查看完整路线</Text>
              </Pressable>
            </View>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,32,28,0.5)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: '#FFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D5E1DD', alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { color: '#0E9F93', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#0F2B27', fontSize: 22, fontWeight: '900', marginTop: 5 },
  modeTag: { color: '#8B9D98', fontSize: 11, marginTop: 4 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F8F6' },
  sectionTitle: { color: '#0F2B27', fontSize: 14, fontWeight: '800', marginTop: 22, marginBottom: 10 },
  candidateList: { gap: 10 },
  candidateItem: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 16, backgroundColor: '#F4F8F6', borderWidth: 1, borderColor: '#E4EEEA' },
  candidateIndex: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E9F93' },
  candidateIndexText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  candidateCopy: { flex: 1, marginLeft: 12 },
  candidateName: { color: '#0F2B27', fontSize: 14, fontWeight: '800' },
  candidateDetail: { color: '#82938F', fontSize: 11, marginTop: 2 },
  editButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF8F6' },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#82938F', fontSize: 14, marginTop: 12, fontWeight: '700' },
  emptyHint: { color: '#ABB8B4', fontSize: 11, marginTop: 5 },
  aiNote: { flexDirection: 'row', marginTop: 18, padding: 14, borderRadius: 16, backgroundColor: '#FFF9E9', borderWidth: 1, borderColor: '#F0DEAD' },
  aiNoteCopy: { flex: 1, marginLeft: 10 },
  aiNoteTitle: { color: '#8A5D19', fontSize: 12, fontWeight: '900' },
  aiNoteText: { color: '#A88652', fontSize: 11, lineHeight: 17, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  secondaryButton: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D5E1DD' },
  secondaryButtonText: { color: '#8B9D98', fontWeight: '700' },
  primaryButton: { flex: 1, minHeight: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#0E9F93' },
  primaryButtonText: { color: '#FFF', fontWeight: '900' },
});