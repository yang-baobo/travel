import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { categories } from '../../data/categories';
import type { PlanningSession } from '../../types/planning';

const PACE_LABEL = { relaxed: '轻松游', standard: '标准节奏', packed: '紧凑游' } as const;
const TRANSPORT_LABEL = { transit: '公交地铁', driving: '驾车 / 打车', walking: '步行为主', any: 'AI 混合交通' } as const;

function joinValues(values: Array<string | null | undefined>, fallback = '无'): string {
  const result = values.map(value => value?.trim()).filter(Boolean) as string[];
  return result.length ? Array.from(new Set(result)).join('、') : fallback;
}

export default function PlanningConfirmationCard({ session, busy, onConfirm }: {
  session: PlanningSession;
  busy: boolean;
  onConfirm: () => Promise<void>;
}) {
  const request = session.request;
  const rows = useMemo(() => {
    const categoryNames = request.preferenceSnapshot.selectedCategories.map(
      id => categories.find(item => item.id === id)?.name || id,
    );
    const mustVisit = [
      ...(request.mustVisitCandidates || []).map(item => item.name),
      ...(request.unresolvedPlaceMentions || []).filter(item => item.intent === 'must_visit').map(item => item.name),
      ...request.candidates.map(item => item.name),
    ];
    const avoided = (request.unresolvedPlaceMentions || [])
      .filter(item => ['avoid', 'remove', 'replace'].includes(item.intent))
      .map(item => item.name);
    const constraints = [
      ...request.hardConstraints.dietaryAllergies.map(item => `${item}过敏`),
      ...request.hardConstraints.forbidden.map(item => `不要${item}`),
      ...request.hardConstraints.mobilityLimitations,
      request.hardConstraints.noNightActivity ? '不安排夜间活动' : null,
      `每天步行最多 ${request.hardConstraints.maxWalkingMinutesPerDay} 分钟`,
      `单段步行最多 ${request.hardConstraints.maxWalkingMinutesPerSegment} 分钟`,
    ];
    const meals = [
      request.preferenceSnapshot.needHotel ? `需要酒店 · ${request.preferenceSnapshot.hotelLevel || '档次灵活'}` : '不需要酒店',
      request.preferenceSnapshot.needLunch ? '安排午餐' : '午餐自理',
      request.preferenceSnapshot.needDinner ? '安排晚餐' : '晚餐自理',
    ];
    const transport = request.transportPlan
      ? `${TRANSPORT_LABEL[request.transportPlan.primary]}优先${request.transportPlan.fallback ? `，过远改用${TRANSPORT_LABEL[request.transportPlan.fallback]}` : ''}`
      : TRANSPORT_LABEL[request.preferenceSnapshot.transportPreference];
    return [
      { icon: 'calendar-outline', label: '日期与时间', value: `${request.preferenceSnapshot.travelStartDate} 出发 · ${request.days}天${Math.max(0, request.days - 1)}晚 · 每天 ${request.preferenceSnapshot.dailyStartTime}-${request.preferenceSnapshot.dailyEndTime}` },
      { icon: 'people-outline', label: '同行与节奏', value: `${request.people}人 · ${PACE_LABEL[request.pace]}` },
      { icon: 'wallet-outline', label: '总预算', value: request.totalBudget === null ? '预算灵活' : `¥${request.totalBudget}` },
      { icon: 'sparkles-outline', label: '偏好', value: joinValues([...categoryNames, ...request.preferenceSnapshot.cuisines], '由 AI 结合已保存偏好推荐') },
      { icon: 'navigate-outline', label: '交通', value: transport },
      { icon: 'bed-outline', label: '住宿与用餐', value: meals.join(' · ') },
      { icon: 'location-outline', label: '想去的地点', value: joinValues(mustVisit, '由 AI 推荐真实景点') },
      { icon: 'remove-circle-outline', label: '排除地点', value: joinValues(avoided, '无') },
      { icon: 'shield-checkmark-outline', label: '硬性限制', value: joinValues(constraints, '无特殊限制') },
    ];
  }, [request]);

  return (
    <View style={styles.card} testID="planning-confirmation-card">
      <LinearGradient colors={['#0B514A', '#08786E']} style={styles.header}>
        <View style={styles.headerIcon}><Ionicons name="checkmark-done" size={21} color="#0B746A" /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>FINAL CHECK</Text>
          <Text style={styles.title}>请确认这份路线需求</Text>
          <Text style={styles.subtitle}>确认后才会查询真实景点、酒店、餐厅和交通，并在新的完整页面展开路线。</Text>
        </View>
      </LinearGradient>

      <View style={styles.rows}>
        {rows.map(row => (
          <View key={row.label} style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name={row.icon as any} size={17} color="#0E9287" /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {(request.derivedConstraints || []).length > 0 ? (
        <View style={styles.inferenceSection} testID="planning-derived-constraints">
          <View style={styles.inferenceHeading}>
            <Ionicons name="sparkles-outline" size={17} color="#0B7B72" />
            <View style={styles.inferenceCopy}>
              <Text style={styles.inferenceTitle}>AI 根据你的描述推导</Text>
              <Text style={styles.inferenceHint}>这些是可修改的安全建议，不会绕过你的硬性限制。</Text>
            </View>
          </View>
          {(request.derivedConstraints || []).map(item => (
            <View key={item.id} style={styles.inferenceItem}>
              <View style={[styles.inferenceDot, item.severity === 'hard' && styles.inferenceDotHard]} />
              <View style={styles.inferenceItemCopy}>
                <Text style={styles.inferenceItemText}>{item.explanation}</Text>
                <Text style={styles.inferenceEvidence}>依据：“{item.sourceText}” · 置信度 {Math.round(item.confidence * 100)}%</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={16} color="#8B6A29" />
        <Text style={styles.noteText}>真实价格、营业时间和交通会在确认后查询；缺少可靠数据时会明确提示，不会用模拟内容补位。</Text>
      </View>

      <Pressable onPress={() => void onConfirm()} disabled={busy} style={({ pressed }) => [styles.confirmButton, pressed && !busy && styles.pressed, busy && styles.disabled]} testID="confirm-and-generate-route">
        {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="map" size={18} color="#FFF" />}
        <Text style={styles.confirmText}>{busy ? '正在生成完整路线…' : '确认并生成完整路线'}</Text>
        {!busy ? <Ionicons name="arrow-forward" size={18} color="#FFF" /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, borderRadius: 27, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D9E7E3', shadowColor: '#0C4B44', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 18 },
  headerIcon: { width: 46, height: 46, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9F5EF' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#7EE1D1', fontSize: 8, fontWeight: '900', letterSpacing: 1.35 },
  title: { color: '#FFF', fontSize: 19, fontWeight: '900', marginTop: 4 },
  subtitle: { color: 'rgba(255,255,255,0.70)', fontSize: 10, lineHeight: 16, marginTop: 5 },
  rows: { paddingHorizontal: 17, paddingTop: 11 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4ECE9' },
  rowIcon: { width: 34, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF7F4' },
  rowCopy: { flex: 1 },
  rowLabel: { color: '#6D817C', fontSize: 9, fontWeight: '800' },
  rowValue: { color: '#173C36', fontSize: 12, lineHeight: 18, fontWeight: '800', marginTop: 3 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, margin: 16, marginBottom: 12, padding: 12, borderRadius: 16, backgroundColor: '#FFF8E8' },
  noteText: { flex: 1, color: '#86652A', fontSize: 9, lineHeight: 15 },
  inferenceSection: { marginHorizontal: 16, marginBottom: 14, padding: 13, borderRadius: 17, backgroundColor: '#EFF9F6', borderWidth: 1, borderColor: '#D2ECE6' },
  inferenceHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  inferenceCopy: { flex: 1 },
  inferenceTitle: { color: '#15534B', fontSize: 11, fontWeight: '900' },
  inferenceHint: { color: '#72908A', fontSize: 9, lineHeight: 14, marginTop: 2 },
  inferenceItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D5EBE6' },
  inferenceDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5, backgroundColor: '#0E9F93' },
  inferenceDotHard: { backgroundColor: '#D16A5E' },
  inferenceItemCopy: { flex: 1 },
  inferenceItemText: { color: '#27544D', fontSize: 10, lineHeight: 15, fontWeight: '800' },
  inferenceEvidence: { color: '#78918B', fontSize: 8, lineHeight: 13, marginTop: 2 },
  confirmButton: { minHeight: 54, marginHorizontal: 16, marginBottom: 17, paddingHorizontal: 18, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#0E9F93' },
  confirmText: { flex: 1, color: '#FFF', textAlign: 'center', fontSize: 13, fontWeight: '900' },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.94 },
  disabled: { opacity: 0.55 },
});
