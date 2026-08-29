import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { PlanningSession, PlanningSessionStatus } from '../../types/planning';

const STATUS_COPY: Record<PlanningSessionStatus, string> = {
  idle: '等待开始',
  collecting: '正在补齐信息',
  understanding: '正在理解',
  needs_clarification: 'AI 需要确认',
  querying_places: '正在查询真实地点',
  calculating_transport: '正在计算交通',
  draft_ready: '路线草稿',
  committing: '正在确认路线',
  committed: '已写入正式行程',
  error: '规划遇到问题',
};

const PROVIDER_COPY = {
  remote_glm: 'GLM 远端理解',
  local_fallback: '本地规则降级',
  unavailable: 'AI 不可用',
} as const;

function StatusIcon({ status }: { status: PlanningSessionStatus }) {
  if (['understanding', 'querying_places', 'calculating_transport', 'committing'].includes(status)) {
    return <ActivityIndicator size="small" color="#69DCC8" />;
  }
  return <Ionicons name={status === 'error' ? 'alert-circle' : status === 'committed' ? 'checkmark-circle' : 'sparkles'} size={17} color={status === 'error' ? '#FFAAA4' : '#69DCC8'} />;
}

export default function PlanningWorkbench({
  session,
  onClarify,
  onReplace,
  onRetry,
  onCommit,
  showDraftDetails = true,
}: {
  session: PlanningSession;
  onClarify: (text: string) => Promise<void>;
  onReplace: () => Promise<void>;
  onRetry: () => Promise<void>;
  onCommit: () => unknown;
  showDraftDetails?: boolean;
}) {
  const [changeText, setChangeText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const draft = session.draft;
  const busy = ['understanding', 'querying_places', 'calculating_transport', 'committing'].includes(session.status);

  const submitChange = async () => {
    if (!changeText.trim() || busy) return;
    setLocalError(null);
    try {
      await onClarify(changeText.trim());
      setChangeText('');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '修改条件失败');
    }
  };

  const commit = () => {
    setLocalError(null);
    try {
      onCommit();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '确认路线失败');
    }
  };

  return (
    <View style={styles.shell} testID="home-planning-workbench">
      <LinearGradient colors={['#0D463F', '#082F2B']} style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.eyebrow}>LIVE AI PLANNING</Text>
            <Text style={styles.title}>{showDraftDetails ? (session.patchPreview ? '正式行程修改预览' : '北京路线工作台') : '路线生成需要调整'}</Text>
          </View>
          <View style={styles.statusPill}>
            <StatusIcon status={session.status} />
            <Text style={styles.statusText}>{STATUS_COPY[session.status]}</Text>
          </View>
        </View>
        <Text style={styles.contextText} numberOfLines={2}>{session.request.userInput || '等待你补充这趟旅行的重点'}</Text>
        {session.planIntent ? (
          <View style={styles.providerRow}>
            <Ionicons name={session.planIntent.provider === 'remote_glm' ? 'cloud-done-outline' : 'hardware-chip-outline'} size={14} color="#8DD8CB" />
            <Text style={styles.providerText}>
              {PROVIDER_COPY[session.planIntent.provider]}
              {session.planIntent.model ? ` · ${session.planIntent.model}` : ''}
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.body}>
        {session.status === 'needs_clarification' && session.planIntent ? (
          <View style={styles.clarificationCard} testID="planning-clarification">
            <Text style={styles.cardEyebrow}>AI 追问</Text>
            {session.planIntent.clarificationQuestions.map(question => (
              <Text key={question} style={styles.question}>• {question}</Text>
            ))}
          </View>
        ) : null}

        {draft && showDraftDetails ? (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryMetric}><Text style={styles.metricValue}>{draft.days.length}</Text><Text style={styles.metricLabel}>天路线</Text></View>
              <View style={styles.summaryMetric}><Text style={styles.metricValue}>{draft.days.reduce((sum, day) => sum + day.stops.length, 0)}</Text><Text style={styles.metricLabel}>真实地点</Text></View>
              <View style={styles.summaryMetric}><Text style={styles.metricValue}>¥{Math.round(draft.knownCostTotal)}</Text><Text style={styles.metricLabel}>{draft.costCoverage === 'complete' ? '已知总价' : '已知费用'}</Text></View>
            </View>

            {draft.hotel ? (
              <View style={styles.hotelRow}>
                <Ionicons name="bed-outline" size={18} color="#0E9F93" />
                <View style={{ flex: 1 }}><Text style={styles.hotelName}>{draft.hotel.name}</Text><Text style={styles.hotelMeta}>FlyAI 实时结果 · 高德坐标已核验</Text></View>
              </View>
            ) : null}

            <View style={styles.daysGrid} testID="planning-draft">
              {draft.days.map(day => (
                <View key={day.day} style={styles.dayCard}>
                  <View style={styles.dayHeader}><Text style={styles.dayIndex}>DAY {String(day.day).padStart(2, '0')}</Text><Text style={styles.dayDate}>{day.date}</Text></View>
                  {day.stops.length > 0 ? day.stops.map(stop => (
                    <View key={stop.id} style={styles.stopRow}>
                      <View style={styles.stopTime}><Text style={styles.stopTimeText}>{stop.arrivalTime}</Text><View style={styles.stopLine} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stopName}>{stop.place.name}</Text>
                        <Text style={styles.stopMeta}>{stop.place.category === 'restaurant' ? '高德餐厅' : '高德景点'} · {stop.endTime} 离开</Text>
                        {stop.transportToNext ? <Text style={styles.transportText}>下一程 {stop.transportToNext.durationMinutes} 分钟 · 高德{stop.transportToNext.mode}</Text> : null}
                      </View>
                    </View>
                  )) : <Text style={styles.emptyDay}>当天没有满足约束的可安排地点</Text>}
                </View>
              ))}
            </View>

            {draft.blockingIssues.length > 0 || draft.warnings.length > 0 || draft.uncertainties.length > 0 ? (
              <View style={styles.warningCard} testID="planning-warnings">
                <View style={styles.warningTitleRow}><Ionicons name="warning-outline" size={17} color="#B47B25" /><Text style={styles.warningTitle}>警告和不确定性</Text></View>
                {[...draft.blockingIssues, ...draft.warnings, ...draft.uncertainties].map((warning, index) => <Text key={`${warning}-${index}`} style={styles.warningText}>• {warning}</Text>)}
              </View>
            ) : null}

            {draft.unassignedPlaces.length > 0 ? (
              <View style={styles.unassignedCard}>
                <Text style={styles.cardEyebrow}>未能安排 · 原因已保留</Text>
                {draft.unassignedPlaces.slice(0, 6).map((item, index) => <Text key={`${item.sourceId}-${index}`} style={styles.unassignedText}>{item.name}：{item.reason}</Text>)}
              </View>
            ) : null}
          </>
        ) : null}

        {session.error || localError ? (
          <View style={styles.errorRow}><Ionicons name="alert-circle-outline" size={17} color="#C6534C" /><Text style={styles.errorText}>{localError || session.error}</Text></View>
        ) : null}

        <View style={styles.changeRow}>
          <TextInput
            value={changeText}
            onChangeText={setChangeText}
            placeholder={session.status === 'needs_clarification' ? '回答 AI 追问…' : '修改条件，例如：第二天少走路…'}
            placeholderTextColor="#8A9C98"
            style={styles.changeInput}
            editable={!busy}
            returnKeyType="send"
            onSubmitEditing={submitChange}
          />
          <Pressable onPress={submitChange} disabled={!changeText.trim() || busy} style={[styles.changeButton, (!changeText.trim() || busy) && styles.disabled]}>
            <Ionicons name="arrow-up" size={18} color="#FFF" />
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => void onRetry()} disabled={busy} style={[styles.secondaryButton, busy && styles.disabled]}><Ionicons name="refresh" size={16} color="#0A756C" /><Text style={styles.secondaryText}>重试</Text></Pressable>
          <Pressable onPress={() => void onReplace()} disabled={busy} style={[styles.secondaryButton, busy && styles.disabled]}><Ionicons name="shuffle" size={16} color="#0A756C" /><Text style={styles.secondaryText}>换一个</Text></Pressable>
          {draft && showDraftDetails ? (
            <Pressable onPress={commit} disabled={busy || draft.blockingIssues.length > 0} style={[styles.commitButton, (busy || draft.blockingIssues.length > 0) && styles.disabled]}>
              <Ionicons name="checkmark" size={17} color="#FFF" /><Text style={styles.commitText}>确认路线</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { marginTop: 26, borderRadius: 28, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDE8E4', shadowColor: '#092F2B', shadowOpacity: 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, elevation: 6 },
  header: { padding: 20 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: '#6FE0CD', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '900', marginTop: 5 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' },
  statusText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  contextText: { color: 'rgba(255,255,255,0.68)', fontSize: 12, lineHeight: 19, marginTop: 15 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  providerText: { color: '#8DD8CB', fontSize: 10, fontWeight: '700' },
  body: { padding: 18, gap: 14 },
  clarificationCard: { padding: 15, borderRadius: 18, backgroundColor: '#EAF7F4', borderWidth: 1, borderColor: '#CDEBE5' },
  cardEyebrow: { color: '#0E9F93', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 7 },
  question: { color: '#183D37', fontSize: 13, lineHeight: 21 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryMetric: { flex: 1, padding: 12, borderRadius: 17, backgroundColor: '#F1F6F4' },
  metricValue: { color: '#0F2B27', fontSize: 17, fontWeight: '900' },
  metricLabel: { color: '#70847F', fontSize: 9, marginTop: 3 },
  hotelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 17, backgroundColor: '#F7FAF9', borderWidth: 1, borderColor: '#E3EBE8' },
  hotelName: { color: '#173B35', fontSize: 13, fontWeight: '800' },
  hotelMeta: { color: '#71827E', fontSize: 9, marginTop: 3 },
  daysGrid: { gap: 10 },
  dayCard: { padding: 14, borderRadius: 19, backgroundColor: '#FBFCFC', borderWidth: 1, borderColor: '#E4ECE9' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
  dayIndex: { color: '#0E9F93', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  dayDate: { color: '#869590', fontSize: 9 },
  stopRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stopTime: { width: 42, alignItems: 'center' },
  stopTimeText: { color: '#0D756C', fontSize: 10, fontWeight: '800' },
  stopLine: { flex: 1, width: 1, marginTop: 5, backgroundColor: '#CFE3DE' },
  stopName: { color: '#173B35', fontSize: 13, fontWeight: '900' },
  stopMeta: { color: '#6D817C', fontSize: 9, marginTop: 3 },
  transportText: { color: '#0E8C80', fontSize: 9, marginTop: 5 },
  emptyDay: { color: '#80928D', fontSize: 11 },
  warningCard: { padding: 14, borderRadius: 17, backgroundColor: '#FFF8E8', borderWidth: 1, borderColor: '#F1D9A3' },
  warningTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  warningTitle: { color: '#865B1C', fontSize: 11, fontWeight: '900' },
  warningText: { color: '#8D6A35', fontSize: 10, lineHeight: 16, marginTop: 5 },
  unassignedCard: { padding: 14, borderRadius: 17, backgroundColor: '#F6F3F1' },
  unassignedText: { color: '#6F625C', fontSize: 10, lineHeight: 16, marginTop: 3 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 12, borderRadius: 15, backgroundColor: '#FFF0EF' },
  errorText: { flex: 1, color: '#A04640', fontSize: 11, lineHeight: 17 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  changeInput: { flex: 1, minHeight: 46, paddingHorizontal: 14, borderRadius: 18, color: '#173B35', backgroundColor: '#F0F5F3', outlineStyle: 'none' } as any,
  changeButton: { width: 46, height: 46, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E9F93' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#EAF6F3' },
  secondaryText: { color: '#0A756C', fontSize: 11, fontWeight: '800' },
  commitButton: { minHeight: 43, flex: 1, minWidth: 130, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#0E9F93' },
  commitText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
