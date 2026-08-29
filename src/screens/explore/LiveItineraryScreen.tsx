import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { borderRadius, shadow, spacing } from '../../theme/spacing';
import { useLiveTravelStore } from '../../store/useLiveTravelStore';
import { useRouteStore } from '../../store/useRouteStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useTripStore } from '../../store/useTripStore';
import { useElderlyMode } from '../../theme/ElderlyModeContext';
import { hydrateSelectedHotelGeography } from '../../services/travelData/hotel/HotelGeoService';
import { fetchAmapRouteSegment } from '../../utils/amapService';
import { isSameTripHotelContext } from '../../domain/tripHotel';
import { assessPlaceAccessibility, LIMITED_MOBILITY_DEFAULTS, mobilityExplanation } from '../../services/mobilityPolicy';
import type { ExploreStackParamList } from '../../types';
import type { TripHotelContext } from '../../types/hotel';
import type { TravelPlace, TravelRouteEndpoint, TravelRouteSegment } from '../../types/travel';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'LiveItinerary'>;
type SegmentResult = { segment: TravelRouteSegment | null; error?: string };

const CATEGORY_LABEL = { attraction: '景点', hotel: '酒店', restaurant: '餐饮' } as const;
const MODE_LABEL = { transit: '公交 / 地铁', driving: '驾车 / 打车', walking: '步行' } as const;
const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240];
const MAX_DAYS = 15;

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToClock(mins: number): string {
  const clamped = Math.min(Math.max(mins, 0), 24 * 60 - 1);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分`;
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateRangeDays(start: string, end: string): number {
  const diff = Math.round(
    (new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000,
  ) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}

function formatDayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAY_NAMES[d.getDay()]}`;
}

interface DayPlanNode {
  key: string;
  place: TravelPlace | null; // null => hotel anchor
  endpoint: TravelRouteEndpoint;
  isHotelAnchor: boolean;
}

interface DaySchedulePlace {
  node: DayPlanNode;
  startTime: string;
  endTime: string;
  transitMinutes: number | null; // to next node
  restAfterMinutes: number;
}

export default function LiveItineraryScreen() {
  const navigation = useNavigation<Navigation>();
  const currentTrip = useTripStore(state => state.currentTrip);
  const legacyItinerary = useLiveTravelStore(state => state.itinerary);
  const legacyItemMeta = useLiveTravelStore(state => state.itemMeta);
  const legacyRemove = useLiveTravelStore(state => state.removeFromItinerary);
  const legacyMove = useLiveTravelStore(state => state.moveItineraryItem);
  const legacySetPlaceDay = useLiveTravelStore(state => state.setPlaceDay);
  const legacySetPlaceDuration = useLiveTravelStore(state => state.setPlaceDuration);
  const tripRemove = useTripStore(state => state.removePlace);
  const tripMove = useTripStore(state => state.movePlace);
  const tripSetPlaceDay = useTripStore(state => state.setPlaceDay);
  const tripSetPlaceDuration = useTripStore(state => state.setPlaceDuration);
  const tripSetSchedule = useTripStore(state => state.setTripSchedule);
  const selectedHotel = useRouteStore(state => state.selectedHotel);
  const selectedHotelContext = useRouteStore(state => state.selectedHotelContext);
  const reconcileSelectedHotelContext = useRouteStore(state => state.reconcileSelectedHotelContext);
  const preference = usePreferenceStore();
  const { scaleFont } = useElderlyMode();
  const [segments, setSegments] = useState<Record<string, SegmentResult>>({});
  const [loading, setLoading] = useState(false);
  const [showTripSetup, setShowTripSetup] = useState(false);
  const [durationEditId, setDurationEditId] = useState<string | null>(null);

  const itinerary = useMemo(
    () => currentTrip ? currentTrip.days.flatMap(day => day.stops.map(stop => stop.place)) : legacyItinerary,
    [currentTrip, legacyItinerary],
  );
  const itemMeta = useMemo(() => currentTrip
    ? Object.fromEntries(currentTrip.days.flatMap(day => day.stops.map(stop => [stop.place.id, {
        day: day.day,
        durationMinutes: stop.durationMinutes,
      }])))
    : legacyItemMeta,
  [currentTrip, legacyItemMeta]);
  const remove = useCallback((placeId: string) => currentTrip ? tripRemove(placeId) : legacyRemove(placeId), [currentTrip, legacyRemove, tripRemove]);
  const move = useCallback((placeId: string, direction: -1 | 1) => currentTrip ? tripMove(placeId, direction) : legacyMove(placeId, direction), [currentTrip, legacyMove, tripMove]);
  const setPlaceDay = useCallback((placeId: string, day: number) => currentTrip ? tripSetPlaceDay(placeId, day) : legacySetPlaceDay(placeId, day), [currentTrip, legacySetPlaceDay, tripSetPlaceDay]);
  const setPlaceDuration = useCallback((placeId: string, minutes: number) => currentTrip ? tripSetPlaceDuration(placeId, minutes) : legacySetPlaceDuration(placeId, minutes), [currentTrip, legacySetPlaceDuration, tripSetPlaceDuration]);

  const travelStartDate = currentTrip?.request.preferenceSnapshot.travelStartDate || preference.travelStartDate;
  const travelReturnDate = currentTrip?.request.preferenceSnapshot.travelReturnDate || preference.travelReturnDate;
  const travelDays = currentTrip?.request.days || Math.max(1, dateRangeDays(travelStartDate, travelReturnDate));
  const dailyStartTime = currentTrip?.request.preferenceSnapshot.dailyStartTime || preference.dailyStartTime;
  const dailyEndTime = currentTrip?.request.preferenceSnapshot.dailyEndTime || preference.dailyEndTime;
  // Derived mobility constraints may promote door-to-door driving even when the
  // original preference was left as "any". Keep the itinerary route lookup in
  // sync with the structured planning request rather than the raw preference.
  const transportPreference = currentTrip?.request.transportPlan?.primary
    || currentTrip?.request.preferenceSnapshot.transportPreference
    || preference.transportPref;
  const transportRule = currentTrip?.request.preferenceSnapshot.transportRule || preference.transportRule;
  const travelDates = useMemo(
    () => Array.from({ length: travelDays }, (_, i) => addDaysISO(travelStartDate, i)),
    [travelStartDate, travelDays],
  );
  const dayTimeWindows = useMemo(() => Object.fromEntries(travelDates.map((_, index) => {
    const day = index + 1;
    const constraint = currentTrip?.request.dayConstraints?.find(item => item.day === day);
    return [day, {
      start: constraint?.startTime || dailyStartTime || '09:00',
      end: constraint?.endTime || dailyEndTime || '19:00',
    }];
  })), [currentTrip?.request.dayConstraints, dailyEndTime, dailyStartTime, travelDates]);

  const tripContext = useMemo<TripHotelContext>(() => ({
    destination: currentTrip?.city || preference.selectedCity,
    checkInDate: travelStartDate,
    checkOutDate: travelReturnDate,
  }), [currentTrip?.city, preference.selectedCity, travelReturnDate, travelStartDate]);
  const activeHotel = currentTrip?.hotel || (selectedHotel && isSameTripHotelContext(selectedHotelContext, tripContext)
    ? selectedHotel
    : null);
  const verifiedHotelEndpoint = useMemo<TravelRouteEndpoint | null>(() => {
    if (
      !activeHotel
      || !activeHotel.coordinateVerified
      || activeHotel.coordinateSource !== 'amap'
      || activeHotel.latitude === null
      || activeHotel.longitude === null
    ) return null;
    return {
      id: activeHotel.id,
      name: activeHotel.name,
      location: { latitude: activeHotel.latitude, longitude: activeHotel.longitude },
    };
  }, [activeHotel]);

  useEffect(() => {
    if (!currentTrip) reconcileSelectedHotelContext(tripContext);
  }, [currentTrip, reconcileSelectedHotelContext, tripContext]);

  useEffect(() => {
    if (!currentTrip && activeHotel && activeHotel.geoStatus === 'unresolved') {
      void hydrateSelectedHotelGeography(activeHotel.id, tripContext);
    }
  }, [activeHotel?.id, activeHotel?.geoStatus, currentTrip, tripContext]); // eslint-disable-line react-hooks/exhaustive-deps

  // 每天的节点链：[酒店锚点] + 当天地点 + [酒店锚点]
  const dayPlans = useMemo(() => {
    return travelDates.map((date, dayIndex) => {
      const day = dayIndex + 1;
      const lastDay = travelDates.length;
      // 天数被调小时，把超出范围的天数回落到最后一天，避免地点"消失"
      const places = itinerary.filter(place => {
        const assigned = Math.min(itemMeta[place.id]?.day ?? 1, lastDay);
        return assigned === day;
      });
      const nodes: DayPlanNode[] = [];
      if (verifiedHotelEndpoint) {
        nodes.push({
          key: `d${day}-hotel-start`,
          place: null,
          endpoint: verifiedHotelEndpoint,
          isHotelAnchor: true,
        });
      }
      places.forEach(place => nodes.push({
        key: `d${day}-${place.id}`,
        place,
        endpoint: { id: place.id, name: place.name, location: place.location },
        isHotelAnchor: false,
      }));
      // 有安排的日子以返回酒店收尾（固定住宿时每天从酒店出发再返回）
      if (verifiedHotelEndpoint && nodes.length > 1) {
        nodes.push({
          key: `d${day}-hotel-end`,
          place: null,
          endpoint: verifiedHotelEndpoint,
          isHotelAnchor: true,
        });
      }
      return { day, date, places, nodes };
    });
  }, [itinerary, itemMeta, travelDates, verifiedHotelEndpoint]);

  const signature = useMemo(() => dayPlans.map(plan => (
    `${plan.day}:` + plan.nodes.map(node => node.endpoint.id).join('>')
  )).join('|'), [dayPlans]);

  useEffect(() => {
    let active = true;
    const pairs: Array<{ key: string; from: TravelRouteEndpoint; to: TravelRouteEndpoint }> = [];
    dayPlans.forEach(plan => {
      plan.nodes.slice(0, -1).forEach((node, index) => {
        const next = plan.nodes[index + 1];
        pairs.push({ key: `${plan.day}-${index}`, from: node.endpoint, to: next.endpoint });
      });
    });
    if (pairs.length === 0) {
      setSegments({});
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setSegments({});
    Promise.all(pairs.map(async pair => {
      try {
        const segment = await fetchAmapRouteSegment(
          pair.from,
          pair.to,
          transportPreference,
          transportRule,
        );
        return { key: pair.key, segment };
      } catch (error) {
        return { key: pair.key, segment: null, error: error instanceof Error ? error.message : '路线加载失败' };
      }
    })).then(results => {
      if (!active) return;
      const map: Record<string, SegmentResult> = {};
      results.forEach(result => { map[result.key] = { segment: result.segment, error: result.error }; });
      setSegments(map);
      setLoading(false);
    });
    return () => { active = false; };
  }, [signature, transportPreference, transportRule.defaultMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const mobilityActive = Boolean(currentTrip?.request.hardConstraints.mobilityLimitations.length
    || currentTrip?.request.preferenceSnapshot.elderlyMode
    || (currentTrip?.request.derivedConstraints || []).some(item => ['limited_mobility', 'elderly_companions', 'low_walking'].includes(item.type)));
  const mobilityNotes = useMemo(() => currentTrip ? mobilityExplanation(currentTrip.request) : [], [currentTrip]);

  // 计算每天时间轴：每个地点的到达/离开时间
  const daySchedules = useMemo(() => {
    return dayPlans.map(plan => {
      const startMinute = timeToMinutes(dayTimeWindows[plan.day]?.start || '09:00');
      let cursor = startMinute;
      const entries: DaySchedulePlace[] = [];
      plan.nodes.forEach((node, index) => {
        const duration = node.place ? (itemMeta[node.place.id]?.durationMinutes ?? 120) : 0;
        const startTime = cursor;
        const endTime = cursor + duration;
        const nextKey = `${plan.day}-${index}`;
        const nextSegment = segments[nextKey];
        const transitMinutes = nextSegment?.segment?.status === 'available'
          ? nextSegment.segment.durationMinutes
          : null;
        const restAfterMinutes = mobilityActive && node.place && index < plan.nodes.length - 1
          ? LIMITED_MOBILITY_DEFAULTS.minimumRestMinutes
          : 0;
        entries.push({ node, startTime: minutesToClock(startTime), endTime: minutesToClock(endTime), transitMinutes, restAfterMinutes });
        cursor = endTime + restAfterMinutes + (transitMinutes ?? 0);
      });
      return { plan, entries, dayEndMinute: cursor };
    });
  }, [dayPlans, dayTimeWindows, itemMeta, mobilityActive, segments]);

  const tripOverview = useMemo(() => ({
    stops: itinerary.length,
    plannedTravelMinutes: currentTrip?.days.reduce((sum, day) => sum + day.travelMinutes, 0)
      || Object.values(segments).reduce((sum, item) => sum + (item.segment?.durationMinutes || 0), 0),
    knownCost: currentTrip?.knownCostTotal ?? null,
  }), [currentTrip, itinerary.length, segments]);

  const walkingMinutesByDay = useMemo(() => Object.fromEntries(dayPlans.map(plan => [
    plan.day,
    plan.nodes.slice(0, -1).reduce((sum, _, index) => {
      const segment = segments[`${plan.day}-${index}`]?.segment;
      return sum + (segment?.mode === 'walking' ? segment.durationMinutes || 0 : 0);
    }, 0),
  ])), [dayPlans, segments]);

  const dayAssignCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    itinerary.forEach(place => {
      const day = Math.min(itemMeta[place.id]?.day ?? 1, travelDays);
      counts[day] = (counts[day] || 0) + 1;
    });
    return counts;
  }, [itinerary, itemMeta, travelDays]);

  const applyTripSetup = (startDate: string, days: number) => {
    if (currentTrip) {
      tripSetSchedule(startDate, days);
      return;
    }
    preference.setTravelStartDate(startDate);
    preference.setTravelReturnDate(addDaysISO(startDate, days - 1));
    preference.setTravelDays(days);
    // 天数减少时，把超出范围的天数回落到最后一天
    itinerary.forEach(place => {
      const day = itemMeta[place.id]?.day ?? 1;
      if (day > days) setPlaceDay(place.id, days);
    });
  };

  if (itinerary.length === 0 && !activeHotel) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}><Ionicons name="map-outline" size={48} color={colors.primary} /></View>
        <Text style={[styles.emptyTitle, { fontSize: scaleFont(20) }]}>路线还是空的</Text>
        <Text style={styles.emptyText}>先从真实景点、酒店或餐厅中加入两个地点，系统就会按天安排并计算它们之间的交通。</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('LivePlaces', { category: 'attraction' })}>
          <Text style={styles.primaryButtonText}>去添加地点</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#073E38', '#0A645A', '#0E8B7F']} style={styles.hero}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} style={styles.heroBack}>
            <Ionicons name="arrow-back" size={20} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>YOUR COMPLETE BEIJING JOURNEY</Text>
            <Text style={styles.heroTitle}>{currentTrip?.title || '北京完整行程'}</Text>
            <Text style={styles.heroSubtitle}>从每天出发到返回酒店，地点时间与每段真实交通都在这里展开。</Text>
          </View>
        </View>
        <View style={styles.heroMetrics}>
          <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{travelDays}</Text><Text style={styles.heroMetricLabel}>天</Text></View>
          <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{tripOverview.stops}</Text><Text style={styles.heroMetricLabel}>地点</Text></View>
          <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{tripOverview.plannedTravelMinutes}</Text><Text style={styles.heroMetricLabel}>交通分钟</Text></View>
          <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{tripOverview.knownCost === null ? '待核实' : `¥${Math.round(tripOverview.knownCost)}`}</Text><Text style={styles.heroMetricLabel}>已知费用</Text></View>
        </View>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 出行天数 / 日期设置 */}
        <View style={styles.tripSetupCard}>
          <View style={styles.tripSetupHeader}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <View style={styles.tripSetupCopy}>
              <Text style={[styles.tripSetupTitle, { fontSize: scaleFont(15) }]}>
                {formatDayDate(travelStartDate)} 出发 · 共{travelDays}天{Math.max(0, travelDays - 1)}晚
              </Text>
              <Text style={styles.tripSetupText}>
                默认每天 {dailyStartTime || '09:00'}-{dailyEndTime || '19:00'}；有单日要求时按当天设置执行
              </Text>
            </View>
            <TouchableOpacity style={styles.tripSetupBtn} onPress={() => setShowTripSetup(true)}>
              <Ionicons name="create-outline" size={15} color={colors.primary} />
              <Text style={styles.tripSetupBtnText}>调整</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }}>
            {travelDates.map((date, index) => {
              const count = dayAssignCounts[index + 1] || 0;
              return (
                <View key={date} style={[styles.dayChip, count > 0 && styles.dayChipActive]}>
                  <Text style={[styles.dayChipDay, count > 0 && styles.dayChipDayActive, { fontSize: scaleFont(11) }]}>第{index + 1}天</Text>
                  <Text style={[styles.dayChipDate, count > 0 && styles.dayChipDateActive, { fontSize: scaleFont(12) }]}>
                    {formatDayDate(date)}
                  </Text>
                  <Text style={[styles.dayChipCount, count > 0 && styles.dayChipCountActive]}>
                    {count > 0 ? `${count}个地点` : '自由安排'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {activeHotel && (
          <View style={styles.hotelStayCard}>
            <View style={styles.hotelStayIcon}><Ionicons name="bed-outline" size={21} color="#FFF" /></View>
            <View style={styles.hotelStayCopy}>
              <Text style={styles.hotelStayEyebrow}>YOUR HOTEL · 每天路线锚点</Text>
              <Text style={styles.hotelStayName}>{activeHotel.name}</Text>
              <Text style={styles.hotelStayMeta}>{activeHotel.address || activeHotel.district || '北京'} · {activeHotel.checkInDate} 入住 / {activeHotel.checkOutDate} 退房</Text>
              <Text style={styles.hotelStayMeta}>{activeHotel.rating !== null ? `评分 ${activeHotel.rating}` : '评分暂无'} · {activeHotel.referencePrice !== null ? `参考价 ¥${activeHotel.referencePrice}` : '价格待查询'}</Text>
            </View>
          </View>
        )}

        {mobilityActive && mobilityNotes.length > 0 && (
          <View style={styles.mobilityPlanCard} testID="mobility-plan-summary">
            <Ionicons name="walk-outline" size={19} color="#0B7B72" />
            <View style={{ flex: 1 }}>
              <Text style={styles.mobilityPlanTitle}>已按行动便利模式安排</Text>
              {mobilityNotes.map((note, index) => <Text key={`${note}-${index}`} style={styles.mobilityPlanText}>• {note}</Text>)}
            </View>
          </View>
        )}

        {activeHotel && (
          <View style={styles.geoStatusRow} testID="selected-hotel-geo-status">
            <Ionicons
              name={activeHotel.geoStatus === 'verified' ? 'checkmark-circle-outline' : 'location-outline'}
              size={15}
              color={activeHotel.geoStatus === 'verified' ? colors.successGreen : colors.warningYellow}
            />
            <Text style={styles.geoStatusText}>
              {activeHotel.geoStatus === 'verified'
                ? `${activeHotel.name} · 高德坐标已核验，每天从酒店出发`
                : activeHotel.geoStatus === 'resolving'
                  ? `${activeHotel.name} · 正在核验位置…`
                  : activeHotel.geoStatus === 'ambiguous'
                    ? `${activeHotel.name} · 高德结果有歧义，首尾程暂不可算`
                    : activeHotel.geoStatus === 'not_found'
                      ? `${activeHotel.name} · 未找到可信位置，酒店首尾程暂不可算`
                      : `${activeHotel.name} · 位置核验失败，酒店首尾程暂不可算`}
            </Text>
            {['ambiguous', 'not_found', 'error'].includes(activeHotel.geoStatus) && (
              <TouchableOpacity onPress={() => void hydrateSelectedHotelGeography(activeHotel.id, tripContext)}>
                <Text style={styles.retryGeoText}>重试</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {currentTrip?.warnings.length ? (
          <View style={styles.tripWarningCard}>
            <Ionicons name="information-circle-outline" size={18} color="#9A6A21" />
            <View style={{ flex: 1 }}>
              <Text style={styles.tripWarningTitle}>需要你留意</Text>
              {currentTrip.warnings.map((warning, index) => <Text key={`${warning}-${index}`} style={styles.tripWarningText}>• {warning}</Text>)}
            </View>
          </View>
        ) : null}

        {daySchedules.map(({ plan, entries, dayEndMinute }) => {
          const dayWindow = dayTimeWindows[plan.day] || { start: dailyStartTime || '09:00', end: dailyEndTime || '19:00' };
          const endLimit = timeToMinutes(dayWindow.end);
          const overflow = plan.places.length > 0 && dayEndMinute > endLimit;
          return (
            <View key={plan.day} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <View style={styles.dayBadge}><Text style={[styles.dayBadgeText, { fontSize: scaleFont(12) }]}>第{plan.day}天</Text></View>
                <Text style={[styles.dayHeaderText, { fontSize: scaleFont(14) }]}>{formatDayDate(plan.date)}</Text>
                {plan.places.length > 0 && (
                  <Text style={styles.dayHeaderMeta}>
                    {dayWindow.start} - {minutesToClock(dayEndMinute)} · 步行{walkingMinutesByDay[plan.day] || 0}分钟
                  </Text>
                )}
                {loading && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
              {overflow && (
                <View style={styles.overflowNote}>
                  <Ionicons name="time-outline" size={14} color={colors.warningYellow} />
                  <Text style={styles.overflowText}>
                    当天安排已超过 {dayWindow.end}，建议缩短游玩时长或把地点移到其他天
                  </Text>
                </View>
              )}

              {plan.places.length === 0 && (
                <View style={styles.freeDayCard}>
                  <Ionicons name="sunny-outline" size={20} color={colors.textSecondary} />
                  <Text style={styles.freeDayText}>这一天暂无安排，可从地点列表加入，或留给旅行盲盒</Text>
                </View>
              )}

              {entries.map((entry, index) => {
                const { node } = entry;
                const nextEntry = entries[index + 1];
                const segmentKey = `${plan.day}-${index}`;
                return (
                  <View key={node.key}>
                    {node.isHotelAnchor ? (
                      <View style={styles.hotelAnchorCard}>
                        <View style={styles.hotelAnchorIcon}>
                          <Ionicons name="bed-outline" size={16} color="#FFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.hotelAnchorTitle, { fontSize: scaleFont(13) }]}>{node.endpoint.name}</Text>
                          <Text style={styles.hotelAnchorText}>
                            {index === 0 ? `${entry.startTime} 从酒店出发` : `${entry.startTime} 返回酒店`}
                          </Text>
                        </View>
                      </View>
                    ) : node.place ? (
                      <PlaceCard
                        place={node.place}
                        entry={entry}
                        orderNumber={index - (entries[0]?.node.isHotelAnchor ? 1 : 0) + 1}
                        durationMinutes={itemMeta[node.place.id]?.durationMinutes ?? 120}
                        day={Math.min(itemMeta[node.place.id]?.day ?? 1, travelDays)}
                        travelDays={travelDays}
                        isFirstInDay={index <= (entries[0]?.node.isHotelAnchor ? 1 : 0)}
                        isLastInDay={index >= plan.nodes.length - (entries[plan.nodes.length - 1]?.node.isHotelAnchor ? 2 : 1)}
                        onEditDuration={() => setDurationEditId(node.place!.id)}
                        onSetDay={setPlaceDay}
                        onMove={move}
                        onRemove={remove}
                      />
                    ) : null}

                    {entry.restAfterMinutes > 0 && (
                      <View style={styles.restPill}>
                        <Ionicons name="cafe-outline" size={14} color="#9A6A21" />
                        <Text style={styles.restPillText}>建议休息 {entry.restAfterMinutes} 分钟</Text>
                      </View>
                    )}

                    {nextEntry && (
                      <View style={styles.segmentWrap}>
                        <View style={styles.line} />
                        <RouteSegment
                          result={segments[segmentKey]}
                          loading={loading && !segments[segmentKey]}
                          originName={node.endpoint.name}
                          destinationName={nextEntry.node.endpoint.name}
                          departAt={entry.endTime}
                          arriveAt={nextEntry.startTime}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <TouchableOpacity style={styles.addMore} onPress={() => navigation.navigate('LivePlaces', { category: 'attraction' })}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.addMoreText, { fontSize: scaleFont(14) }]}>继续添加真实地点</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.blindBoxButton} onPress={() => navigation.navigate('BlindBox')}>
          <Ionicons name="gift-outline" size={20} color="#FFF" />
          <View style={styles.blindBoxButtonCopy}>
            <Text style={[styles.blindBoxButtonTitle, { fontSize: scaleFont(14) }]}>给某一天加一个旅行盲盒</Text>
            <Text style={[styles.blindBoxButtonText, { fontSize: scaleFont(10) }]}>生成后会标注具体游玩日期与时间段</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </ScrollView>

      {/* 行程日期/天数设置弹窗 */}
      <TripSetupModal
        visible={showTripSetup}
        startDate={travelStartDate}
        days={travelDays}
        onClose={() => setShowTripSetup(false)}
        onApply={applyTripSetup}
      />

      {/* 游玩时长编辑弹窗 */}
      <Modal visible={durationEditId !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDurationEditId(null)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>游玩时长</Text>
            <Text style={styles.modalSubtitle}>调整后当天时间轴会自动重算</Text>
            <View style={styles.durationGrid}>
              {DURATION_OPTIONS.map(minutes => (
                <TouchableOpacity
                  key={minutes}
                  style={[
                    styles.durationChip,
                    durationEditId
                      && (itemMeta[durationEditId]?.durationMinutes ?? 120) === minutes
                      && styles.durationChipActive,
                  ]}
                  onPress={() => {
                    if (durationEditId) setPlaceDuration(durationEditId, minutes);
                    setDurationEditId(null);
                  }}
                >
                  <Text style={[
                    styles.durationChipText,
                    durationEditId
                      && (itemMeta[durationEditId]?.durationMinutes ?? 120) === minutes
                      && styles.durationChipTextActive,
                  ]}>
                    {formatDuration(minutes)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setDurationEditId(null)}>
              <Text style={styles.modalCloseText}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function PlaceCard({ place, entry, orderNumber, durationMinutes, day, travelDays, isFirstInDay, isLastInDay, onEditDuration, onSetDay, onMove, onRemove }: {
  place: TravelPlace;
  entry: DaySchedulePlace;
  orderNumber: number;
  durationMinutes: number;
  day: number;
  travelDays: number;
  isFirstInDay: boolean;
  isLastInDay: boolean;
  onEditDuration: () => void;
  onSetDay: (placeId: string, day: number) => void;
  onMove: (placeId: string, direction: -1 | 1) => void;
  onRemove: (placeId: string) => void;
}) {
  const { scaleFont } = useElderlyMode();
  const isBlindBox = place.tags.includes('旅行盲盒');
  const accessibility = assessPlaceAccessibility(place);
  return (
    <View style={styles.stopCard}>
      <View style={styles.order}>
        <Text style={styles.orderText}>{orderNumber}</Text>
      </View>
      <View style={styles.stopCopy}>
        <View style={styles.stopTitleRow}>
          <Text style={[styles.stopName, { fontSize: scaleFont(15) }]} numberOfLines={1}>{place.name}</Text>
          {isBlindBox && <View style={styles.blindBadge}><Text style={styles.blindBadgeText}>盲盒</Text></View>}
        </View>
        <Text style={styles.stopMeta}>
          {CATEGORY_LABEL[place.category]} · {place.district || '北京'}
        </Text>
        <Text style={[styles.accessibilityText, accessibility.status === 'limited' && styles.accessibilityLimited]}>
          {accessibility.status === 'verified'
            ? '行动便利信息：公开字段有无障碍/接驳线索'
            : accessibility.status === 'limited'
              ? '行动提示：可能包含较多步行、坡道或台阶'
              : '行动信息：景区内部步行与无障碍条件待核实'}
        </Text>
        <TouchableOpacity style={styles.timeRow} onPress={onEditDuration}>
          <Ionicons name="time-outline" size={14} color={colors.primary} />
          <Text style={styles.timeText}>
            {entry.startTime} - {entry.endTime} · 游玩{formatDuration(durationMinutes)}
          </Text>
          <Ionicons name="chevron-forward" size={13} color={colors.disabled} />
        </TouchableOpacity>
        <View style={styles.dayControlRow}>
          <TouchableOpacity
            style={styles.dayControlBtn}
            disabled={day <= 1}
            onPress={() => onSetDay(place.id, day - 1)}
          >
            <Ionicons name="chevron-back" size={13} color={day > 1 ? colors.primary : colors.disabled} />
            <Text style={[styles.dayControlText, day <= 1 && { color: colors.disabled }]}>前一天</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dayControlBtn}
            disabled={day >= travelDays}
            onPress={() => onSetDay(place.id, day + 1)}
          >
            <Text style={[styles.dayControlText, day >= travelDays && { color: colors.disabled }]}>后一天</Text>
            <Ionicons name="chevron-forward" size={13} color={day < travelDays ? colors.primary : colors.disabled} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.orderActions}>
        <TouchableOpacity disabled={isFirstInDay} onPress={() => onMove(place.id, -1)} style={styles.iconButton}>
          <Ionicons name="arrow-up" size={17} color={isFirstInDay ? colors.disabled : colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity disabled={isLastInDay} onPress={() => onMove(place.id, 1)} style={styles.iconButton}>
          <Ionicons name="arrow-down" size={17} color={isLastInDay ? colors.disabled : colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onRemove(place.id)} style={styles.iconButton}>
          <Ionicons name="close" size={18} color={colors.priceRed} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TripSetupModal({ visible, startDate, days, onClose, onApply }: {
  visible: boolean;
  startDate: string;
  days: number;
  onClose: () => void;
  onApply: (startDate: string, days: number) => void;
}) {
  const [selectedStart, setSelectedStart] = useState(startDate);
  const [selectedDays, setSelectedDays] = useState(days);

  useEffect(() => {
    if (visible) {
      setSelectedStart(startDate);
      setSelectedDays(days);
    }
  }, [visible, startDate, days]);

  const dateOptions = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    });
  }, []);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>出行日期与天数</Text>
          <Text style={styles.modalSubtitle}>天数会决定行程分成几天，返程日期自动计算</Text>
          <Text style={styles.modalLabel}>出发日期</Text>
          <ScrollView style={{ maxHeight: 200, flexGrow: 0 }} showsVerticalScrollIndicator>
            {dateOptions.map(date => (
              <TouchableOpacity
                key={date}
                style={[styles.dateOption, selectedStart === date && styles.dateOptionActive]}
                onPress={() => setSelectedStart(date)}
              >
                <Text style={[styles.dateOptionText, selectedStart === date && { color: '#FFF', fontWeight: '700' }]}>
                  {formatDayDate(date)}
                </Text>
                {selectedStart === date && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={[styles.modalLabel, { marginTop: spacing.md }]}>旅行天数</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              disabled={selectedDays <= 1}
              onPress={() => setSelectedDays(v => Math.max(1, v - 1))}
            >
              <Ionicons name="remove" size={18} color={selectedDays <= 1 ? colors.disabled : colors.primary} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{selectedDays}天{selectedDays - 1}晚</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              disabled={selectedDays >= MAX_DAYS}
              onPress={() => setSelectedDays(v => Math.min(MAX_DAYS, v + 1))}
            >
              <Ionicons name="add" size={18} color={selectedDays >= MAX_DAYS ? colors.disabled : colors.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.modalApplyBtn}
            onPress={() => {
              onApply(selectedStart, selectedDays);
              onClose();
            }}
          >
            <Text style={styles.modalApplyText}>保存行程设置</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>取消</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function RouteSegment({ result, loading, originName, destinationName, departAt, arriveAt }: {
  result?: SegmentResult;
  loading: boolean;
  originName: string;
  destinationName: string;
  departAt: string;
  arriveAt: string;
}) {
  const { scaleFont } = useElderlyMode();
  if (loading) {
    return <View style={styles.routeCard}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.loadingText}>{originName} → {destinationName} · 正在获取交通方案…</Text></View>;
  }
  if (!result?.segment || result.segment.status !== 'available' || result.segment.durationMinutes === null) {
    return <View style={[styles.routeCard, styles.routeError]}><Ionicons name="alert-circle-outline" size={18} color={colors.priceRed} /><View style={{ flex: 1 }}><Text style={styles.routeEndpoint}>{originName} → {destinationName}</Text><Text style={styles.routeErrorText}>{result?.error || '暂无可用路线'}</Text></View></View>;
  }
  const route = result.segment;
  return (
    <View style={styles.routeCard}>
      <View style={styles.mainRoute}>
        <Text style={styles.routeEndpoint}>{originName} → {destinationName}</Text>
        <Text style={styles.routeClock}>{departAt} 出发 · {arriveAt} 到达</Text>
        <View style={styles.modeTitleRow}>
          <Ionicons name={route.mode === 'transit' ? 'subway-outline' : route.mode === 'walking' ? 'walk-outline' : 'car-outline'} size={19} color={colors.primary} />
          <Text style={[styles.modeTitle, { fontSize: scaleFont(13) }]}>{MODE_LABEL[route.mode]}</Text>
          <Text style={[styles.routeTime, { fontSize: scaleFont(14) }]}>{route.durationMinutes} 分钟</Text>
        </View>
        {route.detail && <Text style={styles.transitDetail}>{route.detail}</Text>}
        <View style={styles.routeMetaRow}>
          <Text style={styles.routeMeta}>{((route.distanceMeters || 0) / 1000).toFixed(1)} 公里</Text>
          {route.price !== null && route.price > 0 && <Text style={styles.routeMeta}>约 ¥{route.price}</Text>}
          <Text style={styles.routeMeta}>高德 · 非估算</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22, overflow: 'hidden' },
  heroTopRow: { width: '100%', maxWidth: 980, alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  heroBack: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: '#77DDCD', fontSize: 8, fontWeight: '900', letterSpacing: 1.35 },
  heroTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', marginTop: 5 },
  heroSubtitle: { color: 'rgba(255,255,255,0.70)', fontSize: 11, lineHeight: 17, marginTop: 5 },
  heroMetrics: { width: '100%', maxWidth: 980, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  heroMetric: { minWidth: 76, flexGrow: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroMetricValue: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  heroMetricLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 8, marginTop: 3 },
  content: { width: '100%', maxWidth: 980, alignSelf: 'center', padding: spacing.lg, paddingBottom: 40 },
  tripSetupCard: { backgroundColor: '#E6F5F1', borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md },
  tripSetupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tripSetupCopy: { flex: 1 },
  tripSetupTitle: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  tripSetupText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 3 },
  tripSetupBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surface, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  tripSetupBtnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  dayChip: { minWidth: 92, marginRight: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  dayChipActive: { borderColor: colors.primary, backgroundColor: colors.surface },
  dayChipDay: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  dayChipDayActive: { color: colors.primary },
  dayChipDate: { color: colors.textPrimary, fontSize: 12, fontWeight: '800', marginTop: 2 },
  dayChipDateActive: { color: colors.primaryDark },
  dayChipCount: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  dayChipCountActive: { color: colors.primary },
  hotelStayCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 22, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DCE8E4', marginBottom: spacing.sm, ...shadow.light },
  hotelStayIcon: { width: 46, height: 46, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.hotel },
  hotelStayCopy: { flex: 1 },
  hotelStayEyebrow: { color: colors.hotel, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  hotelStayName: { color: colors.textPrimary, fontSize: 15, fontWeight: '900', marginTop: 3 },
  hotelStayMeta: { color: colors.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 3 },
  mobilityPlanCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 14, borderRadius: 18, backgroundColor: '#EFF9F6', borderWidth: 1, borderColor: '#D1ECE6', marginBottom: spacing.md },
  mobilityPlanTitle: { color: '#15534B', fontSize: 11, fontWeight: '900', marginBottom: 3 },
  mobilityPlanText: { color: '#5B7C75', fontSize: 9, lineHeight: 15 },
  geoStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
  geoStatusText: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  retryGeoText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  tripWarningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 13, borderRadius: 17, backgroundColor: '#FFF8E8', borderWidth: 1, borderColor: '#F1D9A3', marginBottom: spacing.md },
  tripWarningTitle: { color: '#845B1F', fontSize: 11, fontWeight: '900' },
  tripWarningText: { color: '#8A6A39', fontSize: 10, lineHeight: 16, marginTop: 3 },
  daySection: { marginBottom: spacing.lg },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  dayBadge: { backgroundColor: colors.primary, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: 4 },
  dayBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  dayHeaderText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 },
  dayHeaderMeta: { color: colors.textSecondary, fontSize: 11 },
  overflowNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF7ED', borderRadius: borderRadius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  overflowText: { flex: 1, color: '#9A3412', fontSize: 11, lineHeight: 16 },
  restPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 34, marginVertical: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFF8E8' },
  restPillText: { color: '#946B28', fontSize: 9, fontWeight: '800' },
  freeDayCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.md, backgroundColor: colors.surface },
  freeDayText: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 17 },
  stopCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, ...shadow.light },
  order: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  orderText: { color: '#FFF', fontWeight: '800' },
  stopCopy: { flex: 1, marginLeft: spacing.md },
  stopTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stopName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', flex: 1 },
  blindBadge: { backgroundColor: '#EDE9FE', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  blindBadgeText: { color: '#6E58A5', fontSize: 10, fontWeight: '800' },
  stopMeta: { marginTop: 3, color: colors.textSecondary, fontSize: 11 },
  accessibilityText: { color: '#6C8A83', fontSize: 9, lineHeight: 14, marginTop: 5 },
  accessibilityLimited: { color: '#A16139' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, backgroundColor: colors.background, borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 5, alignSelf: 'flex-start' },
  timeText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  dayControlRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  dayControlBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: colors.surface },
  dayControlText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  orderActions: { flexDirection: 'column', justifyContent: 'center' },
  iconButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  hotelAnchorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: `${colors.hotel}18`, borderRadius: borderRadius.md, padding: spacing.md },
  hotelAnchorIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.hotel },
  hotelAnchorTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  hotelAnchorText: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  segmentWrap: { flexDirection: 'row', marginVertical: spacing.sm, marginLeft: 15 },
  line: { width: 2, backgroundColor: colors.primaryLight, marginRight: spacing.md, borderRadius: 2 },
  routeCard: { flex: 1, minHeight: 64, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, justifyContent: 'center' },
  mainRoute: { width: '100%' },
  routeEndpoint: { color: colors.textPrimary, fontSize: 11, fontWeight: '800', lineHeight: 16 },
  routeClock: { color: colors.primary, fontSize: 10, fontWeight: '700', marginTop: 3, marginBottom: 8 },
  modeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  routeTime: { marginLeft: 'auto', color: colors.primary, fontSize: 14, fontWeight: '800' },
  transitDetail: { marginTop: 7, color: colors.textPrimary, fontSize: 12, lineHeight: 18 },
  routeMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 6 },
  routeMeta: { color: colors.textSecondary, fontSize: 10 },
  loadingText: { marginTop: spacing.xs, color: colors.textSecondary, fontSize: 11, textAlign: 'center' },
  routeError: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routeErrorText: { flex: 1, color: colors.priceRed, fontSize: 11 },
  addMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl, padding: spacing.lg, borderRadius: borderRadius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },
  addMoreText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  blindBoxButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.lg, borderRadius: borderRadius.md, backgroundColor: '#463B63' },
  blindBoxButtonCopy: { flex: 1 },
  blindBoxButtonTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  blindBoxButtonText: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, backgroundColor: colors.background },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6F5F1' },
  emptyTitle: { marginTop: spacing.xl, color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  emptyText: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  primaryButton: { marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 12, paddingHorizontal: spacing.xxl },
  primaryButtonText: { color: '#FFF', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFF', borderRadius: borderRadius.lg, padding: spacing.xl, width: '84%', maxWidth: 380 },
  modalTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  modalSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 4, marginBottom: spacing.md },
  modalLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: spacing.sm },
  dateOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md, marginBottom: 4 },
  dateOptionActive: { backgroundColor: colors.primary },
  dateOptionText: { color: colors.textPrimary, fontSize: 14 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  stepperBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', minWidth: 90, textAlign: 'center' },
  modalApplyBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.lg },
  modalApplyText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  modalClose: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  modalCloseText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  durationChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  durationChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  durationChipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '500' },
  durationChipTextActive: { color: '#FFF', fontWeight: '700' },
});
