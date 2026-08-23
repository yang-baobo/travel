import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { borderRadius, shadow, spacing } from '../../theme/spacing';
import { useBlindBoxStore } from '../../store/useBlindBoxStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { buildBlindBoxPreferences } from '../../utils/blindBoxPreferences';
import type { BlindBoxContentCategory, BlindBoxPriority } from '../../types/blindBox';

const CONTENTS: Array<{ key: BlindBoxContentCategory; label: string }> = [
  { key: 'attraction', label: '景点' },
  { key: 'food', label: '美食' },
  { key: 'shopping', label: '购物' },
  { key: 'experience', label: '体验' },
  { key: 'rest', label: '休息' },
];
const PRIORITIES: Array<{ key: BlindBoxPriority; label: string }> = [
  { key: 'none', label: '不安排' },
  { key: 'low', label: '较少' },
  { key: 'normal', label: '正常' },
  { key: 'priority', label: '优先' },
];

export default function TripProfileScreen() {
  const navigation = useNavigation<any>();
  const setupStatus = useBlindBoxStore(state => state.setupStatus);
  const profileVersion = useBlindBoxStore(state => state.profileVersion);
  const confirmedProfile = useBlindBoxStore(state => state.confirmedProfile);
  const profile = useBlindBoxStore(state => state.draftProfile);
  const updateDraft = useBlindBoxStore(state => state.updateDraft);
  const setPriority = useBlindBoxStore(state => state.setContentPriority);
  const confirmProfile = useBlindBoxStore(state => state.confirmProfile);
  const selectedCategories = usePreferenceStore(state => state.selectedCategories);
  const cuisinePrefs = usePreferenceStore(state => state.cuisinePrefs);
  const hotelAmenityPrefs = usePreferenceStore(state => state.hotelAmenityPrefs);
  const fatigueLevel = usePreferenceStore(state => state.transportRule.fatigueLevel);
  const platformPreferences = buildBlindBoxPreferences({ selectedCategories, cuisinePrefs, hotelAmenityPrefs, fatigueLevel });

  const confirm = () => {
    if (profile.totalTripBudget <= 0) {
      Alert.alert('请先完成预算设置', '总体旅行预算已在「偏好设置 → 盲盒安全设置」中维护，请前往设置并保存。');
      return;
    }
    confirmProfile();
    Alert.alert('盲盒设置已保存', '盲盒会始终遵守偏好设置中的安全限制。', [
      { text: '知道了', onPress: () => navigation.goBack() },
    ]);
  };

  const goPreference = () => {
    try {
      const parent = navigation.getParent?.();
      if (parent) {
        parent.navigate('探索', { screen: 'Preference' });
        return;
      }
      navigation.navigate('Preference');
    } catch {
      navigation.navigate('Preference');
    }
  };

  const hard = profile.hardConstraints;
  const safetySummary = [
    `总预算 ¥${profile.totalTripBudget}`,
    `每天步行≤${hard.maxWalkingMinutesPerDay}分钟`,
    hard.dietaryAllergies.length ? `避开${hard.dietaryAllergies.join('、')}` : '',
    hard.forbidden.length ? `不接受${hard.forbidden.join('、')}` : '',
    hard.noNightActivity ? '不安排夜间活动' : '',
    hard.mobilityLimitations.length ? `行动限制：${hard.mobilityLimitations.join('、')}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="shield-checkmark" size={27} color="#FFF" /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>盲盒内容设置</Text>
          <Text style={styles.heroText}>预算与安全限制已并入偏好设置；这里只决定盲盒里各类内容的优先级。</Text>
        </View>
        <View style={[styles.statusBadge, setupStatus === 'confirmed' && styles.statusConfirmed]}>
          <Text style={styles.statusText}>
            {setupStatus === 'confirmed' ? `已确认 v${profileVersion}` : confirmedProfile ? '有未确认修改' : '待确认'}
          </Text>
        </View>
      </View>

      <Section title="已连接原偏好设置" subtitle="盲盒会自动读取原页面的兴趣、餐饮、住宿和节奏偏好。">
        {platformPreferences.length ? (
          <View style={styles.chipWrap}>
            {platformPreferences.map(item => (
              <View key={item} style={[styles.chip, styles.chipActive]}>
                <Text style={[styles.chipText, styles.chipTextActive]}>{item}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyPreference}>原偏好尚未设置。盲盒仍会遵守安全限制，但个性化程度会降低。</Text>
        )}
      </Section>

      <Section title="内容优先级" subtitle="“不安排”是强制排除，不会被惊喜模式突破。">
        {CONTENTS.map(content => (
          <View key={content.key} style={styles.priorityRow}>
            <Text style={styles.priorityLabel}>{content.label}</Text>
            <View style={styles.priorityOptions}>
              {PRIORITIES.map(option => {
                const active = profile.contentPriorities[content.key] === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.priorityButton, active && styles.priorityButtonActive, option.key === 'none' && active && styles.noneActive]}
                    onPress={() => setPriority(content.key, option.key)}
                  >
                    <Text style={[styles.priorityText, active && styles.priorityTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </Section>

      <Section title="其他要求">
        <TextInput
          value={profile.otherRequirements}
          onChangeText={value => updateDraft({ otherRequirements: value })}
          placeholder="还有什么需要平台长期记住？"
          placeholderTextColor={colors.disabled}
          multiline
          style={[styles.input, styles.multiline]}
        />
      </Section>

      <TouchableOpacity style={styles.safetyCard} onPress={goPreference}>
        <View style={styles.safetyCardHeader}>
          <Ionicons name="shield-outline" size={19} color={colors.primary} />
          <Text style={styles.safetyCardTitle}>盲盒安全设置（在偏好设置中维护）</Text>
          <Ionicons name="chevron-forward" size={17} color={colors.textSecondary} />
        </View>
        <Text style={styles.safetyCardText}>{safetySummary}</Text>
        <Text style={styles.safetyCardHint}>点击前往「偏好设置 → 盲盒安全设置」修改预算、过敏、雷点与行动限制。</Text>
      </TouchableOpacity>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>确认摘要</Text>
        <Text style={styles.summaryText}>
          北京 · 总预算 ¥{profile.totalTripBudget} · 每天步行≤{hard.maxWalkingMinutesPerDay}分钟
          {hard.dietaryAllergies.length ? ` · 避开${hard.dietaryAllergies.join('、')}` : ''}
          {hard.noNightActivity ? ' · 不安排夜间活动' : ''}
        </Text>
      </View>

      <TouchableOpacity style={styles.confirmButton} onPress={confirm}>
        <Ionicons name="checkmark-circle" size={20} color="#FFF" />
        <Text style={styles.confirmText}>确认并保存盲盒设置</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  hero: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#172554', borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3157D5' },
  heroCopy: { flex: 1, marginLeft: spacing.md },
  heroTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  heroText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 18, marginTop: 4 },
  statusBadge: { backgroundColor: '#F59E0B', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  statusConfirmed: { backgroundColor: '#16A34A' },
  statusText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  section: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.light },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionBody: { marginTop: spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: colors.background },
  chipActive: { borderColor: colors.primary, backgroundColor: '#EAF1FF' },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  emptyPreference: { color: colors.textSecondary, fontSize: 12, lineHeight: 19 },
  input: { marginTop: spacing.sm, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, color: colors.textPrimary, backgroundColor: colors.background },
  multiline: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  priorityRow: { marginBottom: spacing.md },
  priorityLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  priorityOptions: { flexDirection: 'row', gap: 6 },
  priorityButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: borderRadius.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  priorityButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  noneActive: { backgroundColor: colors.priceRed, borderColor: colors.priceRed },
  priorityText: { color: colors.textSecondary, fontSize: 11 },
  priorityTextActive: { color: '#FFF', fontWeight: '700' },
  safetyCard: { backgroundColor: '#EAF1FF', borderRadius: borderRadius.lg, padding: spacing.lg, marginVertical: spacing.sm },
  safetyCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  safetyCardTitle: { flex: 1, color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  safetyCardText: { color: colors.textPrimary, fontSize: 12, lineHeight: 19, marginTop: spacing.sm },
  safetyCardHint: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: spacing.sm },
  summary: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  summaryText: { color: colors.textSecondary, fontSize: 12, lineHeight: 20, marginTop: 5 },
  confirmButton: { height: 52, borderRadius: borderRadius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  confirmText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
