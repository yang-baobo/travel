import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { borderRadius, shadow, spacing } from '../../theme/spacing';
import { generateBlindBox } from '../../services/blindBoxService';
import { useBlindBoxStore } from '../../store/useBlindBoxStore';
import { useLiveTravelStore } from '../../store/useLiveTravelStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { buildBlindBoxPreferences } from '../../utils/blindBoxPreferences';
import { blindBoxCandidateToTravelPlace, type BlindBoxControls, type BlindBoxSuccessResult } from '../../types/blindBox';

const DEFAULT_CONTROLS: BlindBoxControls = {
  timeSlot: { start: '15:00', end: '17:00' },
  type: 'preference',
  budgetTotal: 100,
  maxDetourMinutes: 20,
  revealImmediately: false,
};

type DayItemLike = { id: string; name: string; latitude: number | null; longitude: number | null; startTime: string; endTime: string };
function toMinutes(value: string): number { const [hour, minute] = value.split(':').map(Number); return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : -1; }
function formatDate(date: string): string { const value = new Date(`${date}T12:00:00`); return `${value.getMonth() + 1}月${value.getDate()}日`; }
function getSlotContext(items: DayItemLike[], start: string, end: string) {
  const startMin = toMinutes(start); const endMin = toMinutes(end);
  const sorted = [...items].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  return { previous: [...sorted].reverse().find(item => toMinutes(item.endTime) <= startMin) ?? null, next: sorted.find(item => toMinutes(item.startTime) >= endMin) ?? null, conflict: sorted.find(item => startMin < toMinutes(item.endTime) && endMin > toMinutes(item.startTime)) ?? null };
}
function findRecommendedSlotOld(items: DayItemLike[]): { start: string; end: string } | null {
  const sorted = [...items].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const windows = [{ start: 9 * 60, end: 19 * 60 }, ...sorted.map((item, index) => ({ start: toMinutes(item.endTime) + 10, end: toMinutes(sorted[index + 1]?.startTime ?? '19:00') - 10 }))];
  const slot = windows.find(window => window.end - window.start >= 90);
  return slot ? { start: `${String(Math.floor(slot.start / 60)).padStart(2, '0')}:${String(slot.start % 60).padStart(2, '0')}`, end: `${String(Math.floor((slot.start + 120) / 60)).padStart(2, '0')}:${String((slot.start + 120) % 60).padStart(2, '0')}` } : null;
}

function findRecommendedSlot(items: DayItemLike[]): { start: string; end: string } | null {
  const sorted = [...items].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  let cursor = 9 * 60;
  for (const item of sorted) {
    const start = toMinutes(item.startTime);
    if (start - cursor >= 90) return clockSlot(cursor, cursor + 120);
    cursor = Math.max(cursor, toMinutes(item.endTime) + 10);
  }
  return 19 * 60 - cursor >= 90 ? clockSlot(cursor, cursor + 120) : null;
}

function clockSlot(start: number, end: number): { start: string; end: string } { return { start: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`, end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` }; }

export default function BlindBoxScreen() {
  const navigation = useNavigation<any>();
  const setupStatus = useBlindBoxStore(state => state.setupStatus);
  const profileVersion = useBlindBoxStore(state => state.profileVersion);
  const profile = useBlindBoxStore(state => state.confirmedProfile);
  const result = useBlindBoxStore(state => state.result);
  const revealed = useBlindBoxStore(state => state.revealed);
  const setResult = useBlindBoxStore(state => state.setResult);
  const reveal = useBlindBoxStore(state => state.reveal);
  const itinerary = useLiveTravelStore(state => state.itinerary);
  const currentTrip = useLiveTravelStore(state => state.currentTrip);
  const tripDays = useLiveTravelStore(state => state.tripDays);
  const insertBlindBoxIntoDay = useLiveTravelStore(state => state.insertBlindBoxIntoDay);
  const addToItinerary = useLiveTravelStore(state => state.addToItinerary);
  const selectedCategories = usePreferenceStore(state => state.selectedCategories);
  const cuisinePrefs = usePreferenceStore(state => state.cuisinePrefs);
  const hotelAmenityPrefs = usePreferenceStore(state => state.hotelAmenityPrefs);
  const fatigueLevel = usePreferenceStore(state => state.transportRule.fatigueLevel);
  const platformPreferences = useMemo(() => buildBlindBoxPreferences({
    selectedCategories,
    cuisinePrefs,
    hotelAmenityPrefs,
    fatigueLevel,
  }), [selectedCategories, cuisinePrefs, hotelAmenityPrefs, fatigueLevel]);

  const goPreferenceSetup = () => {
    try {
      const parent = navigation.getParent?.();
      if (parent) {
        parent.navigate('探索', { screen: 'Preference' });
        return;
      }
      navigation.navigate('Preference');
    } catch {
      navigation.navigate('TripProfile');
    }
  };

  const [controls, setControls] = useState(DEFAULT_CONTROLS);
  const [loading, setLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const route = useRoute<any>();
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(route.params?.dayNumber ?? 1);
  const selectedDay = tripDays.find(day => day.dayNumber === selectedDayNumber) ?? tripDays[0];
  const dayItems = selectedDay?.items ?? [];
  const recommendedSlot = useMemo(() => findRecommendedSlot(dayItems), [dayItems]);
  const slotContext = useMemo(() => getSlotContext(dayItems, controls.timeSlot.start, controls.timeSlot.end), [dayItems, controls.timeSlot]);
  const selectedDayPlaces = useMemo(() => itinerary.filter(place => dayItems.some(item => item.id === place.id)), [dayItems, itinerary]);
  const routeSummaryOld = useMemo(() => (
    itinerary.length >= 2 ? `${itinerary.length} 个地点，偏航会自动寻找最顺路的插入位置` : `${itinerary.length} 个地点`
  ), [itinerary.length]);
  const routeSummary = `${dayItems.length} 个地点 · ${slotContext.previous?.name ?? '当天起点'} → ${slotContext.next?.name ?? '当天结束'}`;

  const confirmDefaultProfile = useBlindBoxStore(state => state.confirmProfile);

  useEffect(() => {
    if (tripDays.length > 0 && !tripDays.some(day => day.dayNumber === selectedDayNumber)) setSelectedDayNumber(tripDays[0].dayNumber);
  }, [selectedDayNumber, tripDays]);
  useEffect(() => {
    if (recommendedSlot && controls.timeSlot.start === DEFAULT_CONTROLS.timeSlot.start && controls.timeSlot.end === DEFAULT_CONTROLS.timeSlot.end) setControls(state => ({ ...state, timeSlot: recommendedSlot }));
  }, [controls.timeSlot.end, controls.timeSlot.start, recommendedSlot]);
  useEffect(() => {
    if (recommendedSlot) setControls(state => ({ ...state, timeSlot: recommendedSlot }));
  }, [selectedDayNumber]);

  if (!profile) {
    return (
      <View style={styles.setupEmpty}>
        <View style={styles.lockIcon}><Ionicons name="shield-outline" size={44} color={colors.primary} /></View>
        <Text style={styles.emptyTitle}>先完成盲盒安全设置</Text>
        <Text style={styles.emptyText}>安全设置已并入偏好设置：预算、过敏、雷点和行动限制一次性配好，兴趣会自动沿用原偏好。</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={goPreferenceSetup}>
          <Text style={styles.primaryButtonText}>去偏好设置</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => confirmDefaultProfile()}>
          <Text style={styles.secondaryButtonText}>使用安全默认值开启</Text>
        </TouchableOpacity>
        <Text style={styles.defaultHint}>默认值：总预算 ¥3000 · 每天步行≤120分钟 · 单段≤30分钟 · 不含夜间限制</Text>
      </View>
    );
  }

  if (!currentTrip || tripDays.length === 0) {
    return <View style={styles.setupEmpty}><View style={styles.lockIcon}><Ionicons name="map-outline" size={44} color={colors.primary} /></View><Text style={styles.emptyTitle}>请先创建一条行程，再使用时间段盲盒。</Text><Text style={styles.emptyText}>盲盒需要读取具体日期、当天地点和可插入空档。</Text><TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('LiveItinerary')}><Text style={styles.primaryButtonText}>去创建行程</Text></TouchableOpacity></View>;
  }

  const runGenerationOld = async (replace = false) => {
    if (!/^\d{2}:\d{2}$/.test(controls.timeSlot.start) || !/^\d{2}:\d{2}$/.test(controls.timeSlot.end)) {
      Alert.alert('时间格式不正确', '请按照 15:00 这样的格式填写。');
      return;
    }
    if (controls.type === 'detour' && itinerary.length < 2) {
      Alert.alert('路线信息不足', '偏航盲盒需要当前路线中至少有两个地点。你也可以先使用偏好盲盒。');
      return;
    }
    setLoading(true);
    try {
      const excluded = replace && result?.status === 'success'
        ? [result.system_payload.selected_candidate_id]
        : [];
      const next = await generateBlindBox({
        ...profile,
        preferences: platformPreferences,
      }, controls, itinerary, excluded);
      setResult(next);
    } catch (error) {
      Alert.alert('盲盒生成失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const runGeneration = async (replace = false) => {
    if (loading || !currentTrip || !selectedDay) return;
    const start = toMinutes(controls.timeSlot.start); const end = toMinutes(controls.timeSlot.end);
    if (start < 0 || end < 0 || start >= end) { setGenerationError('时间段无效：开始时间必须早于结束时间。'); return; }
    if (end - start < 90) { setGenerationError('时间段至少需要90分钟，才能预留交通、体验和缓冲。'); return; }
    if (slotContext.conflict) { setGenerationError(`时间冲突：${slotContext.conflict.name} 已占用 ${slotContext.conflict.startTime}-${slotContext.conflict.endTime}。`); return; }
    if (profile.hardConstraints.noNightActivity && end > 19 * 60) { setGenerationError('当前旅行设置不接受夜间活动，盲盒必须在19:00前结束。'); return; }
    setLoading(true); setGenerationError(null);
    try {
      const excluded = replace && result?.status === 'success' ? [result.system_payload.selected_candidate_id] : [];
      const context = {
        tripId: currentTrip.id,
        selectedDayId: selectedDay.id,
        visitDate: selectedDay.date,
        previousStop: slotContext.previous && slotContext.previous.latitude !== null && slotContext.previous.longitude !== null ? { id: slotContext.previous.id, name: slotContext.previous.name, lat: slotContext.previous.latitude, lng: slotContext.previous.longitude } : null,
        nextStop: slotContext.next && slotContext.next.latitude !== null && slotContext.next.longitude !== null ? { id: slotContext.next.id, name: slotContext.next.name, lat: slotContext.next.latitude, lng: slotContext.next.longitude } : null,
        candidatePlaces: dayItems.filter(item => item.latitude !== null && item.longitude !== null).map(item => ({ item_id: item.id, type: item.category, name: item.name, lat: item.latitude as number, lng: item.longitude as number })),
      };
      const next = await generateBlindBox({ ...profile, preferences: platformPreferences }, { ...controls, timeSlot: { start: controls.timeSlot.start, end: controls.timeSlot.end } }, selectedDayPlaces, excluded, context);
      setResult(next);
    } catch (error) { setGenerationError(error instanceof Error ? error.message : '盲盒生成失败，请稍后重试。'); }
    finally { setLoading(false); }
  };

  const addSelectedOld = () => {
    if (result?.status !== 'success') return;
    const candidatePlace = blindBoxCandidateToTravelPlace(result.system_payload.selected_candidate);
    // 盲盒默认安排到最后一个有安排的行程日，保持整体连贯。
    const lastDay = itinerary.length > 0
      ? Math.max(...itinerary.map(place => {
          const meta = useLiveTravelStore.getState().itemMeta[place.id];
          return meta?.day ?? 1;
        }))
      : 1;
    addToItinerary(candidatePlace, { day: lastDay, durationMinutes: 90 });
    Alert.alert('已加入实时路线', `已安排到第${lastDay}天，路线页面会重新计算相邻地点的高德交通方案。`, [
      { text: '继续浏览', style: 'cancel' },
      { text: '查看行程', onPress: () => navigation.navigate('LiveItinerary') },
    ]);
  };

  const addSelected = () => {
    if (result?.status !== 'success' || !currentTrip || !selectedDay) return;
    const candidate = result.system_payload.selected_candidate;
    try {
      insertBlindBoxIntoDay({
        tripId: currentTrip.id,
        dayId: selectedDay.id,
        insertAfterItemId: slotContext.previous?.id ?? null,
        insertBeforeItemId: slotContext.next?.id ?? null,
        item: { category: candidate.category === 'food' ? 'restaurant' : candidate.category === 'shopping' || candidate.category === 'rest' ? 'attraction' : candidate.category, name: candidate.name, address: candidate.address, latitude: candidate.lat, longitude: candidate.lng, startTime: controls.timeSlot.start, endTime: controls.timeSlot.end, duration: 90, price: candidate.price ?? 0, source: controls.type === 'preference' ? 'blind_box_preference' : 'blind_box_detour' },
      });
      Alert.alert('已插入行程', `已加入 DAY ${selectedDay.dayNumber}，路线将只重新计算当天地点。`, [{ text: '继续浏览', style: 'cancel' }, { text: '查看行程', onPress: () => navigation.navigate('LiveItinerary', { dayNumber: selectedDay.dayNumber }) }]);
    } catch (error) { setGenerationError(error instanceof Error ? error.message : '插入失败，请重试。'); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.profileStrip}>
        <View style={styles.profileIcon}><Ionicons name="checkmark" size={18} color="#FFF" /></View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileTitle}>已读取盲盒安全设置 v{profileVersion}{setupStatus === 'draft' ? '（草稿修改尚未生效）' : ''}</Text>
          <Text style={styles.profileText}>总预算 ¥{profile.totalTripBudget} · 单段步行≤{profile.hardConstraints.maxWalkingMinutesPerSegment}分钟 · 原偏好：{platformPreferences.slice(0, 3).join('、') || '尚未设置'}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('TripProfile')}><Text style={styles.editText}>编辑</Text></TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={styles.sparkle}><Ionicons name="sparkles" size={28} color="#FFF" /></View>
        <Text style={styles.heroTitle}>给 AI 一段时间，收下一份有边界的惊喜</Text>
        <Text style={styles.heroText}>你只需要设置这一次的探索意愿。安全、预算和行动限制由后台自动合并。</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>选择插入日期</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayOptions}>
          {tripDays.map(day => <TouchableOpacity key={day.id} onPress={() => setSelectedDayNumber(day.dayNumber)} style={[styles.dayOption, selectedDay?.id === day.id && styles.dayOptionActive]}><Text style={styles.dayOptionDay}>DAY {day.dayNumber} · {formatDate(day.date)}</Text><Text style={styles.dayOptionTitle}>{day.title}</Text><Text style={styles.dayOptionMeta}>已安排{day.items.length}项 · {findRecommendedSlot(day.items) ? '存在可插入空档' : '暂无空档'}</Text></TouchableOpacity>)}
        </ScrollView>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>交给 AI 的时间段</Text>
        <View style={styles.timeRow}>
          <TextInput
            value={controls.timeSlot.start}
            onChangeText={value => setControls(state => ({ ...state, timeSlot: { ...state.timeSlot, start: value } }))}
            placeholder="15:00"
            style={styles.timeInput}
          />
          <Text style={styles.timeDash}>至</Text>
          <TextInput
            value={controls.timeSlot.end}
            onChangeText={value => setControls(state => ({ ...state, timeSlot: { ...state.timeSlot, end: value } }))}
            placeholder="17:00"
            style={styles.timeInput}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>盲盒类型</Text>
        <View style={styles.typeRow}>
          <TypeOption
            active={controls.type === 'preference'}
            icon="heart-outline"
            title="偏好盲盒"
            subtitle="更懂你，也留一点新鲜感"
            onPress={() => setControls(state => ({ ...state, type: 'preference' }))}
          />
          <TypeOption
            active={controls.type === 'detour'}
            icon="navigate-outline"
            title="偏航盲盒"
            subtitle="在当前路线旁值得绕一点路"
            onPress={() => setControls(state => ({ ...state, type: 'detour' }))}
          />
        </View>
        <View style={styles.routeContext}>
          <Ionicons name="map-outline" size={16} color={colors.primary} />
          <Text style={styles.routeContextText}>当前实时路线：{routeSummary}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>本次边界</Text>
        <View style={styles.twoFields}>
          <NumberInput
            label="本次最多花费"
            prefix="¥"
            value={controls.budgetTotal}
            onChange={value => setControls(state => ({ ...state, budgetTotal: value }))}
          />
          <NumberInput
            label="最多绕路"
            suffix="分钟"
            value={controls.maxDetourMinutes}
            onChange={value => setControls(state => ({ ...state, maxDetourMinutes: value }))}
          />
        </View>
        <View style={styles.revealRow}>
          <View style={styles.revealCopy}>
            <Text style={styles.revealTitle}>立即揭晓具体地点</Text>
            <Text style={styles.revealHint}>关闭后先展示时间、费用、体力和安全信息</Text>
          </View>
          <Switch
            value={controls.revealImmediately}
            onValueChange={value => setControls(state => ({ ...state, revealImmediately: value }))}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={controls.revealImmediately ? colors.primary : '#FFF'}
          />
        </View>
      </View>

      <View style={styles.slotSummary}><Text style={styles.slotSummaryText}>{recommendedSlot ? `推荐空档：${recommendedSlot.start}—${recommendedSlot.end}` : '当前日期暂未找到90分钟可插入空档'}</Text><Text style={styles.slotSummaryText}>{routeSummary}</Text>{generationError && <><Text style={styles.generationError}>{generationError}</Text><TouchableOpacity onPress={() => void runGeneration(false)}><Text style={styles.generationError}>重新生成</Text></TouchableOpacity></>}</View>
      <TouchableOpacity style={[styles.generateButton, loading && styles.buttonDisabled]} disabled={loading} onPress={() => void runGeneration(false)}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Ionicons name="gift-outline" size={21} color="#FFF" />}
        <Text style={styles.generateText}>{loading ? '正在筛选真实地点和路线…' : '生成旅行盲盒'}</Text>
      </TouchableOpacity>

      {result ? (
        <View style={styles.resultWrap}>
          {result.status === 'success' ? (
            <SuccessCard
              result={result}
              revealed={revealed}
              onReveal={reveal}
              onReplace={() => void runGeneration(true)}
              onAdd={addSelected}
            />
          ) : result.status === 'no_feasible_option' ? (
            <View style={[styles.resultCard, styles.noOptionCard]}>
              <Ionicons name="shield-checkmark-outline" size={30} color={colors.warningYellow} />
              <Text style={styles.noOptionTitle}>没有为了惊喜而突破限制</Text>
              {result.failure_reasons.map(reason => <Text key={reason} style={styles.reasonItem}>• {reason}</Text>)}
              <Text style={styles.adjustTitle}>可以尝试</Text>
              {result.minimal_adjustments.map(item => <Text key={item} style={styles.adjustItem}>• {item}</Text>)}
            </View>
          ) : (
            <View style={[styles.resultCard, styles.noOptionCard]}>
              <Text style={styles.noOptionTitle}>盲盒安全设置还不完整</Text>
              <Text style={styles.reasonItem}>{result.message}</Text>
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

function TypeOption({ active, icon, title, subtitle, onPress }: { active: boolean; icon: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.typeOption, active && styles.typeActive]} onPress={onPress}>
      <Ionicons name={icon as any} size={22} color={active ? colors.primary : colors.textSecondary} />
      <Text style={[styles.typeTitle, active && styles.typeTitleActive]}>{title}</Text>
      <Text style={styles.typeSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function NumberInput({ label, value, onChange, prefix, suffix }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string }) {
  return (
    <View style={styles.numberField}>
      <Text style={styles.numberLabel}>{label}</Text>
      <View style={styles.numberInputRow}>
        {prefix ? <Text style={styles.numberAffix}>{prefix}</Text> : null}
        <TextInput
          value={String(value)}
          onChangeText={text => onChange(Math.max(0, Number(text.replace(/\D/g, '')) || 0))}
          keyboardType="number-pad"
          style={styles.numberInput}
        />
        {suffix ? <Text style={styles.numberAffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function SuccessCard({ result, revealed, onReveal, onReplace, onAdd }: {
  result: BlindBoxSuccessResult;
  revealed: boolean;
  onReveal: () => void;
  onReplace: () => void;
  onAdd: () => void;
}) {
  const card = result.public_card;
  const candidate = result.system_payload.selected_candidate;
  const photo = candidate.photo_urls[0];
  return (
    <View style={styles.resultCard}>
      {revealed && photo ? <Image source={{ uri: photo }} style={styles.resultPhoto} /> : (
        <View style={styles.hiddenVisual}>
          <Ionicons name={revealed ? 'location' : 'gift'} size={42} color="#FFF" />
          {!revealed ? <Text style={styles.hiddenText}>目的地还藏在盒子里</Text> : null}
        </View>
      )}
      <View style={styles.resultBody}>
        <View style={styles.resultHeader}>
          <View style={styles.blindBadge}><Text style={styles.blindBadgeText}>盲盒项目</Text></View>
          {result.system_payload.needs_verification ? <Text style={styles.verifyBadge}>含待核实数据</Text> : null}
        </View>
        <Text style={styles.resultTitle}>{revealed ? candidate.name : card.title}</Text>
        {revealed ? <Text style={styles.resultAddress}>{candidate.address || candidate.district}</Text> : <Text style={styles.resultAddress}>{card.area_hint}</Text>}

        <View style={styles.factGrid}>
          <Fact icon="time-outline" text={card.time} />
          <Fact icon="wallet-outline" text={card.budget} />
          <Fact icon="walk-outline" text={card.walking} />
          <Fact icon="navigate-outline" text={card.detour} />
        </View>
        <View style={styles.reasonBox}>
          <Ionicons name="sparkles-outline" size={17} color={colors.primary} />
          <Text style={styles.reasonText}>{card.reason}</Text>
        </View>

        {card.safety_notes.map(note => <Notice key={note} icon="warning-outline" text={note} danger />)}
        {card.data_warnings.map(note => <Notice key={note} icon="information-circle-outline" text={note} />)}

        {!revealed ? (
          <TouchableOpacity style={styles.revealButton} onPress={onReveal}>
            <Ionicons name="eye-outline" size={19} color="#FFF" />
            <Text style={styles.revealButtonText}>现在揭晓</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.addButton} onPress={onAdd}>
              <Ionicons name="add-circle-outline" size={19} color="#FFF" />
              <Text style={styles.revealButtonText}>加入我的实时路线</Text>
            </TouchableOpacity>
            {!!candidate.source_url && (
              <TouchableOpacity style={styles.mapButton} onPress={() => void Linking.openURL(candidate.source_url)}>
                <Ionicons name="map-outline" size={18} color={colors.primary} />
                <Text style={styles.mapButtonText}>在高德查看地点</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <TouchableOpacity style={styles.replaceButton} onPress={onReplace}>
          <Ionicons name="refresh-outline" size={18} color={colors.primary} />
          <Text style={styles.replaceText}>换一个（保留全部硬性限制）</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Fact({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon as any} size={16} color={colors.primary} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

function Notice({ icon, text, danger = false }: { icon: string; text: string; danger?: boolean }) {
  return (
    <View style={[styles.notice, danger && styles.noticeDanger]}>
      <Ionicons name={icon as any} size={16} color={danger ? colors.priceRed : colors.warningYellow} />
      <Text style={[styles.noticeText, danger && styles.noticeDangerText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 56 },
  profileStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF1FF', borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
  profileIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successGreen },
  profileCopy: { flex: 1, marginLeft: spacing.sm },
  profileTitle: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  profileText: { color: colors.textSecondary, fontSize: 10, marginTop: 3 },
  editText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  hero: { backgroundColor: '#172554', borderRadius: borderRadius.lg, padding: spacing.xl, marginBottom: spacing.md },
  sparkle: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED', marginBottom: spacing.md },
  heroTitle: { color: '#FFF', fontSize: 22, fontWeight: '900', lineHeight: 30 },
  heroText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 19, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.light },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: spacing.md }, dayOptions: { gap: spacing.sm }, dayOption: { width: 190, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, backgroundColor: colors.background }, dayOptionActive: { borderColor: colors.primary, backgroundColor: '#EAF1FF' }, dayOptionDay: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' }, dayOptionTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', marginTop: 5 }, dayOptionMeta: { color: colors.textSecondary, fontSize: 10, marginTop: 5 }, slotSummary: { padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: '#F4F7FF', marginTop: spacing.sm }, slotSummaryText: { color: colors.textSecondary, fontSize: 11, lineHeight: 18 }, generationError: { color: colors.priceRed, fontSize: 11, lineHeight: 18, marginTop: 5 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  timeInput: { flex: 1, height: 48, textAlign: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, backgroundColor: colors.background, color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  timeDash: { color: colors.textSecondary, fontSize: 13 },
  typeRow: { flexDirection: 'row', gap: spacing.md },
  typeOption: { flex: 1, minHeight: 116, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, backgroundColor: colors.background },
  typeActive: { borderColor: colors.primary, backgroundColor: '#EAF1FF' },
  typeTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800', marginTop: spacing.sm },
  typeTitleActive: { color: colors.primaryDark },
  typeSubtitle: { color: colors.textSecondary, fontSize: 10, lineHeight: 16, marginTop: 4 },
  routeContext: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  routeContextText: { flex: 1, color: colors.textSecondary, fontSize: 11 },
  twoFields: { flexDirection: 'row', gap: spacing.md },
  numberField: { flex: 1 },
  numberLabel: { color: colors.textSecondary, fontSize: 11, marginBottom: 6 },
  numberInputRow: { flexDirection: 'row', alignItems: 'center', height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, backgroundColor: colors.background },
  numberInput: { flex: 1, color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  numberAffix: { color: colors.textSecondary, fontSize: 12 },
  revealRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  revealCopy: { flex: 1 },
  revealTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  revealHint: { color: colors.textSecondary, fontSize: 10, marginTop: 3 },
  generateButton: { height: 54, borderRadius: borderRadius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: '#7C3AED', marginVertical: spacing.sm },
  buttonDisabled: { opacity: 0.65 },
  generateText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  resultWrap: { marginTop: spacing.lg },
  resultCard: { overflow: 'hidden', borderRadius: borderRadius.lg, backgroundColor: colors.surface, ...shadow.medium },
  resultPhoto: { width: '100%', height: 190, backgroundColor: colors.border },
  hiddenVisual: { height: 160, backgroundColor: '#312E81', alignItems: 'center', justifyContent: 'center' },
  hiddenText: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: spacing.sm },
  resultBody: { padding: spacing.lg },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blindBadge: { borderRadius: 99, backgroundColor: '#EDE9FE', paddingHorizontal: 9, paddingVertical: 5 },
  blindBadgeText: { color: '#6D28D9', fontSize: 10, fontWeight: '800' },
  verifyBadge: { color: colors.warningYellow, fontSize: 10, fontWeight: '700' },
  resultTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', marginTop: spacing.md },
  resultAddress: { color: colors.textSecondary, fontSize: 12, marginTop: 5 },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  fact: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, padding: spacing.sm, borderRadius: borderRadius.sm, backgroundColor: colors.background },
  factText: { flex: 1, color: colors.textPrimary, fontSize: 10 },
  reasonBox: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: '#EAF1FF', marginTop: spacing.md },
  reasonText: { flex: 1, color: colors.textPrimary, fontSize: 11, lineHeight: 18 },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, marginTop: spacing.sm, borderRadius: borderRadius.sm, backgroundColor: '#FFF7ED' },
  noticeDanger: { backgroundColor: '#FFF1F2' },
  noticeText: { flex: 1, color: '#9A3412', fontSize: 10, lineHeight: 16 },
  noticeDangerText: { color: '#9F1239' },
  revealButton: { height: 48, borderRadius: borderRadius.md, backgroundColor: '#7C3AED', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  addButton: { height: 48, borderRadius: borderRadius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  revealButtonText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  mapButton: { height: 44, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  mapButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  replaceButton: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  replaceText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  noOptionCard: { padding: spacing.xl, alignItems: 'flex-start' },
  noOptionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: spacing.md, marginBottom: spacing.sm },
  reasonItem: { color: colors.textPrimary, fontSize: 12, lineHeight: 20 },
  adjustTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: '800', marginTop: spacing.lg, marginBottom: 4 },
  adjustItem: { color: colors.textSecondary, fontSize: 11, lineHeight: 18 },
  setupEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, backgroundColor: colors.background },
  lockIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF1FF' },
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', marginTop: spacing.xl },
  emptyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
  primaryButton: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 13, paddingHorizontal: spacing.xxl, marginTop: spacing.xl },
  primaryButtonText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  secondaryButton: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 12, paddingHorizontal: spacing.xxl, marginTop: spacing.md },
  secondaryButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  defaultHint: { color: colors.textSecondary, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: spacing.lg },
});
