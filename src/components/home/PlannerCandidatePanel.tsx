import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CANDIDATE_CATEGORY_COPY } from '../../data/beijingHomeUi';
import type { PlannerCandidate, CandidateCategory, PlannerMode } from '../../data/beijingHomeUi';

type CandidateState = 'selected' | 'suggested' | 'ignored';

interface PlannerCandidatePanelProps {
  candidates: PlannerCandidate[];
  mode: PlannerMode;
  selectedIds: string[];
  suggestedIds: string[];
  ignoredIds: string[];
  onToggle: (candidate: PlannerCandidate) => void;
  onSuggestion: (candidate: PlannerCandidate, action: 'accept' | 'replace' | 'ignore') => void;
  autoPlanIds?: string[];
  onAutoReplace?: (candidate: PlannerCandidate) => void;
  elderlyMode?: boolean;
}

export default function PlannerCandidatePanel({
  candidates,
  mode,
  selectedIds,
  suggestedIds,
  ignoredIds,
  onToggle,
  onSuggestion,
  autoPlanIds = [],
  onAutoReplace,
  elderlyMode = false,
}: PlannerCandidatePanelProps) {
  const [category, setCategory] = useState<CandidateCategory>('attraction');
  const activeCandidates = candidates.filter(candidate => !ignoredIds.includes(candidate.id));
  const filteredCandidates = activeCandidates.filter(candidate => candidate.category === category);
  const selected = activeCandidates.filter(candidate => selectedIds.includes(candidate.id));
  const suggestions = activeCandidates.filter(candidate => suggestedIds.includes(candidate.id));
  const autoCandidates = activeCandidates.filter(candidate => autoPlanIds.includes(candidate.id));

  return (
    <View style={styles.wrap}>
      <View style={styles.panelHeader}>
        <View>
          <Text style={[styles.eyebrow, elderlyMode && styles.large]}>PLANNER PICKS</Text>
          <Text style={[styles.title, elderlyMode && styles.largeTitle]}>
            {mode === 'self' ? '先挑几处想去的地方' : mode === 'complete' ? '告诉我你已经想好什么' : 'AI 会先给你一份可能的答案'}
          </Text>
        </View>
        <View style={styles.count}>
          <Text style={styles.countText}>{selected.length}</Text>
          <Text style={styles.countLabel}>已选</Text>
        </View>
      </View>

      {mode === 'auto' ? (
        <>
          <AutoPlanHint />
          {autoCandidates.length > 0 && (
            <View style={styles.autoPlan}>
              <Text style={styles.selectedLabel}>AI候选方案 · 可移除或替换</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
                {autoCandidates.map(candidate => (
                  <View key={candidate.id}>
                    <CandidateCard candidate={candidate} state={selectedIds.includes(candidate.id) ? 'selected' : undefined} onPress={() => onToggle(candidate)} />
                    {onAutoReplace ? (
                      <Pressable onPress={() => onAutoReplace(candidate)} style={styles.autoReplace}>
                        <Ionicons name="refresh" size={13} color="#0E7A70" />
                        <Text style={styles.autoReplaceText}>换一个</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {(Object.keys(CANDIDATE_CATEGORY_COPY) as CandidateCategory[]).map((item: CandidateCategory) => (
              <Pressable key={item} onPress={() => setCategory(item)} style={[styles.tab, category === item && styles.tabActive]}>
                <Text style={[styles.tabText, category === item && styles.tabTextActive]}>{CANDIDATE_CATEGORY_COPY[item]}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {filteredCandidates.map((candidate: PlannerCandidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                state={selectedIds.includes(candidate.id) ? 'selected' : undefined}
                onPress={() => onToggle(candidate)}
              />
            ))}
          </ScrollView>
          {filteredCandidates.length === 0 ? (
            <Text style={styles.emptyText}>
              {category === 'attraction' ? '实时景点正在加载，稍后再试。' : '这个分类请先通过下方真实服务入口选择。'}
            </Text>
          ) : null}
          {mode === 'complete' && suggestions.length > 0 && (
            <View style={styles.suggestionBlock}>
              <View style={styles.suggestionTitle}>
                <Ionicons name="sparkles" size={15} color="#A26B1D" />
                <Text style={styles.suggestionTitleText}>AI 补全建议</Text>
                <Text style={styles.suggestionHint}>缺少的内容，我先替你留了几个位置</Text>
              </View>
              {suggestions.map((candidate: PlannerCandidate) => (
                <SuggestionRow key={candidate.id} candidate={candidate} state={selectedIds.includes(candidate.id) ? 'selected' : 'suggested'} onAction={(action: 'accept' | 'replace' | 'ignore') => onSuggestion(candidate, action)} />
              ))}
            </View>
          )}
          {selected.length > 0 && (
            <View style={styles.selectedRow}>
              <Text style={styles.selectedLabel}>你的选择</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {selected.map((item: PlannerCandidate) => (
                  <View key={item.id} style={styles.selectedChip}>
                    <Text style={styles.selectedChipText}>{item.name}</Text>
                    <Pressable onPress={() => onToggle(item)} hitSlop={8}>
                      <Ionicons name="close" size={13} color="#0E7C72" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function AutoPlanHint() {
  return (
    <View style={styles.autoHint}>
      <LinearGradient colors={['#EAF8F4', '#FFF8E7']} style={styles.autoGradient}>
        <View style={styles.autoIcon}>
          <Ionicons name="sparkles" size={21} color="#C38A25" />
        </View>
        <View style={styles.autoCopy}>
          <Text style={styles.autoTitle}>从一句话开始</Text>
          <Text style={styles.autoText}>输入"想带父母慢慢逛北京"，确认偏好后，AI 会根据天数、预算和节奏换一套方案。</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function CandidateCard({ candidate, state, onPress }: { candidate: PlannerCandidate; state?: CandidateState; onPress: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, state === 'selected' && styles.cardSelected, pressed && styles.pressed]}>
      <View style={styles.cardImageWrap}>
        {broken || !candidate.imageUrl ? (
          <LinearGradient colors={candidate.fallbackColors} style={styles.cardImage}>
            <Ionicons name="image-outline" size={23} color="rgba(255,255,255,0.75)" />
          </LinearGradient>
        ) : (
          <Image source={{ uri: candidate.imageUrl }} onError={() => setBroken(true)} style={styles.cardImage} />
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.category}>{candidate.categoryLabel}</Text>
          {state === 'selected' && <Ionicons name="checkmark-circle" size={18} color="#0E9F93" />}
        </View>
        <Text style={styles.cardName} numberOfLines={1}>{candidate.name}</Text>
        <Text style={styles.cardDetail} numberOfLines={2}>{candidate.detail}</Text>
        <Text style={styles.cardAction}>{state === 'selected' ? '已加入 · 点击移除' : '加入行程候选'}</Text>
      </View>
    </Pressable>
  );
}

function SuggestionRow({ candidate, state, onAction }: { candidate: PlannerCandidate; state: CandidateState; onAction: (action: 'accept' | 'replace' | 'ignore') => void }) {
  return (
    <View style={[styles.suggestionRow, state === 'selected' && styles.suggestionAccepted]}>
      <View style={styles.suggestionIcon}>
        <Ionicons name="sparkles" size={15} color="#A26B1D" />
      </View>
      <View style={styles.suggestionCopy}>
        <View style={styles.suggestionNameLine}>
          <Text style={styles.suggestionName}>{candidate.name}</Text>
          <Text style={styles.aiTag}>AI补全</Text>
        </View>
        <Text style={styles.suggestionReason}>{candidate.reason}</Text>
      </View>
      {state === 'selected' ? (
        <Pressable onPress={() => onAction('ignore')} style={styles.smallAction}>
          <Text style={styles.smallActionText}>移除</Text>
        </Pressable>
      ) : (
        <View style={styles.suggestionActions}>
          <Pressable onPress={() => onAction('accept')} style={styles.acceptAction}>
            <Text style={styles.acceptText}>接受</Text>
          </Pressable>
          <Pressable onPress={() => onAction('replace')} style={styles.replaceAction}>
            <Text style={styles.replaceText}>替换</Text>
          </Pressable>
          <Pressable onPress={() => onAction('ignore')} hitSlop={8}>
            <Text style={styles.ignoreText}>忽略</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 15, padding: 14, borderRadius: 20, backgroundColor: '#F8FBFA', borderWidth: 1, borderColor: '#DFECE8' },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { color: '#0E9F93', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#0F2B27', fontSize: 15, fontWeight: '900', marginTop: 4 },
  large: { fontSize: 13 },
  largeTitle: { fontSize: 18 },
  count: { minWidth: 46, paddingVertical: 6, borderRadius: 13, backgroundColor: '#E4F5F0', alignItems: 'center' },
  countText: { color: '#0A7A70', fontSize: 16, fontWeight: '900' },
  countLabel: { color: '#66827B', fontSize: 9, marginTop: 1 },
  tabs: { gap: 7, paddingVertical: 13 },
  tab: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DFEAE7' },
  tabActive: { backgroundColor: '#0E9F93', borderColor: '#0E9F93' },
  tabText: { color: '#66827B', fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: '#FFF' },
  cards: { gap: 10, paddingRight: 8 },
  card: { width: 166, minHeight: 216, overflow: 'hidden', borderRadius: 17, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5EFEC' },
  cardSelected: { borderColor: '#0E9F93', borderWidth: 2 },
  pressed: { transform: [{ scale: 0.98 }] },
  cardImageWrap: { height: 98, backgroundColor: '#DDEAE6' },
  cardImage: { width: '100%', height: '100%' },
  cardBody: { padding: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { color: '#A26B1D', fontSize: 9, fontWeight: '800' },
  cardName: { color: '#0F2B27', fontSize: 13, fontWeight: '900', marginTop: 5 },
  cardDetail: { color: '#71827F', fontSize: 10, lineHeight: 15, marginTop: 4 },
  cardAction: { color: '#0E9F93', fontSize: 10, fontWeight: '800', marginTop: 9 },
  suggestionBlock: { marginTop: 13, padding: 11, borderRadius: 15, backgroundColor: '#FFF9E9', borderWidth: 1, borderColor: '#F0DEAD' },
  suggestionTitle: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  suggestionTitleText: { color: '#8A5D19', fontSize: 12, fontWeight: '900' },
  suggestionHint: { color: '#A88652', flex: 1, minWidth: 170, fontSize: 10 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1E5C5' },
  suggestionAccepted: { opacity: 0.82 },
  suggestionIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7E8BC' },
  suggestionCopy: { flex: 1, marginLeft: 8 },
  suggestionNameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  suggestionName: { color: '#5D421A', fontSize: 12, fontWeight: '800' },
  aiTag: { color: '#A26B1D', fontSize: 9, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: '#F7E8BC' },
  suggestionReason: { color: '#987A48', fontSize: 10, lineHeight: 15, marginTop: 2 },
  suggestionActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 5 },
  acceptAction: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, backgroundColor: '#B98425' },
  acceptText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  replaceAction: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#D8B56D' },
  replaceText: { color: '#8A5D19', fontSize: 10, fontWeight: '700' },
  ignoreText: { color: '#A88652', fontSize: 10 },
  smallAction: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, backgroundColor: '#F7E8BC' },
  smallActionText: { color: '#8A5D19', fontSize: 10, fontWeight: '800' },
  selectedRow: { marginTop: 12 },
  selectedLabel: { color: '#66827B', fontSize: 10, fontWeight: '800', marginBottom: 6 },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: '#DFF4EE' },
  selectedChipText: { color: '#0A7A70', fontSize: 10, fontWeight: '700' },
  autoHint: { marginTop: 13, overflow: 'hidden', borderRadius: 15 },
  autoGradient: { minHeight: 88, padding: 14, flexDirection: 'row', alignItems: 'center' },
  autoIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)' },
  autoCopy: { flex: 1, marginLeft: 11 },
  autoTitle: { color: '#0F2B27', fontSize: 13, fontWeight: '900' },
  autoText: { color: '#66827B', fontSize: 10, lineHeight: 16, marginTop: 4 },
  autoPlan: { marginTop: 13 },
  autoReplace: { minHeight: 35, marginTop: 5, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#E0F3EE' },
  autoReplaceText: { color: '#0E7A70', fontSize: 10, fontWeight: '800' },
  emptyText: { color: '#71827F', fontSize: 11, lineHeight: 17, paddingVertical: 12 },
});
