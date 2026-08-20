import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { borderRadius, shadow, spacing } from '../../theme/spacing';
import { useLiveTravelStore } from '../../store/useLiveTravelStore';
import { fetchTravelRoutes } from '../../services/travelDataService';
import type { ExploreStackParamList } from '../../types';
import type { TravelRoutesResponse } from '../../types/travel';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'LiveItinerary'>;
type SegmentResult = { key: string; route: TravelRoutesResponse | null; error?: string };

const CATEGORY_LABEL = { attraction: '景点', hotel: '酒店', restaurant: '餐饮' } as const;

export default function LiveItineraryScreen() {
  const navigation = useNavigation<Navigation>();
  const itinerary = useLiveTravelStore(state => state.itinerary);
  const remove = useLiveTravelStore(state => state.removeFromItinerary);
  const move = useLiveTravelStore(state => state.moveItineraryItem);
  const [segments, setSegments] = useState<SegmentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const signature = useMemo(() => itinerary.map(item => item.id).join('|'), [itinerary]);

  useEffect(() => {
    let active = true;
    if (itinerary.length < 2) {
      setSegments([]);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    const requests = itinerary.slice(0, -1).map(async (from, index): Promise<SegmentResult> => {
      const to = itinerary[index + 1];
      const key = `${from.id}-${to.id}`;
      try {
        const route = await fetchTravelRoutes(
          from.location.longitude,
          from.location.latitude,
          to.location.longitude,
          to.location.latitude,
        );
        return { key, route };
      } catch (error) {
        return { key, route: null, error: error instanceof Error ? error.message : '路线加载失败' };
      }
    });
    Promise.all(requests).then(result => {
      if (!active) return;
      setSegments(result);
      setLoading(false);
    });
    return () => { active = false; };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  if (itinerary.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}><Ionicons name="map-outline" size={48} color={colors.primary} /></View>
        <Text style={styles.emptyTitle}>路线还是空的</Text>
        <Text style={styles.emptyText}>先从真实景点、酒店或餐厅中加入两个地点，系统就会计算它们之间的交通。</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('LivePlaces', { category: 'attraction' })}>
          <Text style={styles.primaryButtonText}>去添加地点</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <View style={styles.introTitleRow}>
            <Ionicons name="bus-outline" size={20} color={colors.primary} />
            <Text style={styles.introTitle}>北京实时交通</Text>
            {loading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          <Text style={styles.introText}>每次调整地点顺序后，都会重新从高德获取相邻地点间的公交、驾车和步行数据。</Text>
        </View>

        {itinerary.map((place, index) => {
          const segment = segments[index];
          return (
            <View key={place.id}>
              <View style={styles.stopCard}>
                <View style={styles.order}><Text style={styles.orderText}>{index + 1}</Text></View>
                <View style={styles.stopCopy}>
                  <Text style={styles.stopName}>{place.name}</Text>
                  <Text style={styles.stopMeta}>{CATEGORY_LABEL[place.category]} · {place.district || '北京'}</Text>
                </View>
                <View style={styles.orderActions}>
                  <TouchableOpacity disabled={index === 0} onPress={() => move(place.id, -1)} style={styles.iconButton}>
                    <Ionicons name="arrow-up" size={17} color={index === 0 ? colors.disabled : colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity disabled={index === itinerary.length - 1} onPress={() => move(place.id, 1)} style={styles.iconButton}>
                    <Ionicons name="arrow-down" size={17} color={index === itinerary.length - 1 ? colors.disabled : colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(place.id)} style={styles.iconButton}>
                    <Ionicons name="close" size={18} color={colors.priceRed} />
                  </TouchableOpacity>
                </View>
              </View>

              {index < itinerary.length - 1 && (
                <View style={styles.segmentWrap}>
                  <View style={styles.line} />
                  <RouteSegment segment={segment} loading={loading && !segment} />
                </View>
              )}
            </View>
          );
        })}

        <TouchableOpacity style={styles.addMore} onPress={() => navigation.navigate('LivePlaces', { category: 'attraction' })}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.addMoreText}>继续添加真实地点</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function RouteSegment({ segment, loading }: { segment?: SegmentResult; loading: boolean }) {
  if (loading) {
    return <View style={styles.routeCard}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.loadingText}>正在获取交通方案…</Text></View>;
  }
  if (!segment?.route) {
    return <View style={[styles.routeCard, styles.routeError]}><Ionicons name="alert-circle-outline" size={18} color={colors.priceRed} /><Text style={styles.routeErrorText}>{segment?.error || '暂无可用路线'}</Text></View>;
  }
  const { transit, driving, walking } = segment.route;
  return (
    <View style={styles.routeCard}>
      {transit ? (
        <View style={styles.mainRoute}>
          <View style={styles.modeTitleRow}>
            <Ionicons name="subway-outline" size={19} color={colors.primary} />
            <Text style={styles.modeTitle}>公交 / 地铁</Text>
            <Text style={styles.routeTime}>{transit.time} 分钟</Text>
          </View>
          <Text style={styles.transitDetail}>{transit.detail}</Text>
          <View style={styles.routeMetaRow}>
            <Text style={styles.routeMeta}>{transit.distance} 公里</Text>
            <Text style={styles.routeMeta}>{transit.transfers} 次换乘</Text>
            <Text style={styles.routeMeta}>步行约 {transit.walkToStationMin || 0} 分钟</Text>
            {transit.price > 0 && <Text style={styles.routeMeta}>约 ¥{transit.price}</Text>}
          </View>
        </View>
      ) : <Text style={styles.unavailable}>该路段暂无公共交通方案</Text>}
      <View style={styles.alternatives}>
        {driving && <Text style={styles.alternative}>驾车 {driving.time} 分钟 · {driving.distance} 公里</Text>}
        {walking && <Text style={styles.alternative}>步行 {walking.time} 分钟 · {walking.distance} 公里</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },
  intro: { backgroundColor: '#EAF1FF', borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.xl },
  introTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  introTitle: { flex: 1, color: colors.primaryDark, fontSize: 16, fontWeight: '700' },
  introText: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  stopCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, ...shadow.light },
  order: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  orderText: { color: '#FFF', fontWeight: '800' },
  stopCopy: { flex: 1, marginLeft: spacing.md },
  stopName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  stopMeta: { marginTop: 4, color: colors.textSecondary, fontSize: 11 },
  orderActions: { flexDirection: 'row' },
  iconButton: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  segmentWrap: { flexDirection: 'row', marginVertical: spacing.sm, marginLeft: 15 },
  line: { width: 2, backgroundColor: colors.primaryLight, marginRight: spacing.md, borderRadius: 2 },
  routeCard: { flex: 1, minHeight: 64, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, justifyContent: 'center' },
  mainRoute: { width: '100%' },
  modeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  routeTime: { marginLeft: 'auto', color: colors.primary, fontSize: 14, fontWeight: '800' },
  transitDetail: { marginTop: 7, color: colors.textPrimary, fontSize: 12, lineHeight: 18 },
  routeMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 6 },
  routeMeta: { color: colors.textSecondary, fontSize: 10 },
  alternatives: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 4 },
  alternative: { color: colors.textSecondary, fontSize: 11 },
  unavailable: { color: colors.warningYellow, fontSize: 12 },
  loadingText: { marginTop: spacing.xs, color: colors.textSecondary, fontSize: 11, textAlign: 'center' },
  routeError: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routeErrorText: { flex: 1, color: colors.priceRed, fontSize: 11 },
  addMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl, padding: spacing.lg, borderRadius: borderRadius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },
  addMoreText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, backgroundColor: colors.background },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF1FF' },
  emptyTitle: { marginTop: spacing.xl, color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  emptyText: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  primaryButton: { marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 12, paddingHorizontal: spacing.xxl },
  primaryButtonText: { color: '#FFF', fontWeight: '700' },
});
