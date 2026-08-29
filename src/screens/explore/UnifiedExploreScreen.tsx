import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { borderRadius, shadow, spacing } from '../../theme/spacing';
import { searchTravelPlaces } from '../../services/travelDataService';
import { travelHotelService } from '../../services/travelData/hotel/TravelHotelService';
import { buildHotelSearchParams, formatHotelReferencePrice } from '../../services/travelData/hotel/hotelUiModel';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import type { ExploreStackParamList } from '../../types';
import type { TravelPlace } from '../../types/travel';
import type { TravelHotel } from '../../types/hotel';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'ExploreMain'>;
type Route = RouteProp<ExploreStackParamList, 'ExploreMain'>;
type ExploreTab = 'attractions' | 'hotels' | 'restaurants';

const TABS: Array<{ key: ExploreTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'attractions', label: '景点', icon: 'compass-outline' },
  { key: 'hotels', label: '酒店', icon: 'bed-outline' },
  { key: 'restaurants', label: '餐饮', icon: 'restaurant-outline' },
];

export default function UnifiedExploreScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const preference = usePreferenceStore();
  const [tab, setTab] = useState<ExploreTab>(route.params?.tab || 'attractions');
  const [keyword, setKeyword] = useState('');
  const [places, setPlaces] = useState<TravelPlace[]>([]);
  const [hotels, setHotels] = useState<TravelHotel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [requestNonce, setRequestNonce] = useState(0);

  const load = useCallback(async (nextTab: ExploreTab, nextKeyword: string, nextPage: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      if (nextTab === 'hotels') {
        const params = buildHotelSearchParams({
          destination: preference.selectedCity || '北京',
          checkInDate: preference.travelStartDate,
          checkOutDate: preference.travelReturnDate,
          maxReferencePrice: preference.hotelPriceRange.max > 0 ? preference.hotelPriceRange.max : null,
          starFilter: 'any',
          keyword: nextKeyword,
          sortBy: 'none',
        });
        const response = await travelHotelService.search(params);
        setHotels(response.hotels);
        setPlaces([]);
        setHasMore(false);
        setPage(1);
      } else {
        const category = nextTab === 'restaurants' ? 'restaurant' : 'attraction';
        const response = await searchTravelPlaces(category, nextKeyword, nextPage, 20);
        setPlaces(current => append ? [...current, ...response.items] : response.items);
        setHotels([]);
        setHasMore(response.hasMore);
        setPage(response.page);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '真实数据暂时不可用，请稍后重试。');
      if (!append) {
        setPlaces([]);
        setHotels([]);
      }
    } finally {
      setLoading(false);
    }
  }, [preference.hotelPriceRange.max, preference.selectedCity, preference.travelReturnDate, preference.travelStartDate]);

  useEffect(() => {
    void load(tab, keyword, 1, false);
  }, [load, requestNonce, tab]); // keyword changes only on submit

  const submitSearch = () => {
    setPage(1);
    setRequestNonce(value => value + 1);
  };

  const switchTab = (nextTab: ExploreTab) => {
    setTab(nextTab);
    setPage(1);
    setKeyword('');
  };

  const title = useMemo(() => TABS.find(item => item.key === tab)?.label || '探索', [tab]);
  const dataCount = tab === 'hotels' ? hotels.length : places.length;
  const listData: Array<TravelHotel | TravelPlace> = tab === 'hotels' ? hotels : places;

  useEffect(() => {
    const requestedTab = route.params?.tab;
    if (requestedTab && requestedTab !== tab) setTab(requestedTab);
  }, [route.params?.tab, tab]);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>EXPLORE BEIJING</Text>
        <Text style={styles.title}>发现真实北京</Text>
        <Text style={styles.subtitle}>景点、酒店和餐饮，来自已接入的数据源。</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map(item => (
          <Pressable
            key={item.key}
            onPress={() => switchTab(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item.key }}
            style={({ pressed }) => [styles.tab, tab === item.key && styles.tabActive, pressed && styles.pressed]}
          >
            <Ionicons name={item.icon} size={18} color={tab === item.key ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={submitSearch}
          placeholder={tab === 'hotels' ? '搜索酒店或商圈' : tab === 'restaurants' ? '搜索餐厅或菜系' : '搜索景点或博物馆'}
          placeholderTextColor={colors.disabled}
          returnKeyType="search"
          style={styles.input}
          accessibilityLabel={`搜索${title}`}
        />
        <Pressable onPress={submitSearch} style={styles.searchButton} accessibilityLabel={`搜索${title}`}>
          <Text style={styles.searchButtonText}>搜索</Text>
        </Pressable>
      </View>

      {error && dataCount === 0 ? (
        <View style={styles.state}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.disabled} />
          <Text style={styles.stateTitle}>真实数据暂时不可用</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable onPress={submitSearch} style={styles.retryButton}><Text style={styles.retryText}>重新加载</Text></Pressable>
        </View>
      ) : (
        <FlatList<TravelHotel | TravelPlace>
          data={listData}
          keyExtractor={item => `${tab}-${item.id}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => tab === 'hotels'
            ? <HotelCard hotel={item as TravelHotel} onPress={() => navigation.navigate('HotelList')} />
            : <PlaceCard place={item as TravelPlace} onPress={() => navigation.navigate('LivePlaceDetail', { placeId: item.id, source: 'amap', category: (item as TravelPlace).category === 'restaurant' ? 'restaurant' : 'attraction' })} />}
          ListHeaderComponent={<Text style={styles.resultTitle}>{keyword ? `“${keyword}”的${title}` : `北京${title}`}</Text>}
          ListEmptyComponent={!loading ? <View style={styles.empty}><Text style={styles.emptyText}>暂无可展示的真实数据</Text></View> : null}
          ListFooterComponent={(
            <View style={styles.footer}>
              {loading ? <ActivityIndicator color={colors.primary} /> : hasMore ? (
                <Pressable onPress={() => void load(tab, keyword, page + 1, true)} style={styles.moreButton}>
                  <Text style={styles.moreText}>加载更多</Text>
                </Pressable>
              ) : dataCount > 0 ? <Text style={styles.endText}>已加载当前可用结果</Text> : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

function PlaceCard({ place, onPress }: { place: TravelPlace; onPress: () => void }) {
  const photo = place.photoUrls[0];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <View style={[styles.photo, styles.photoFallback]}><Ionicons name="image-outline" size={28} color={colors.primaryLight} /></View>}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>{place.typeName || place.district || '北京地点'}</Text>
        <Text style={styles.cardAddress} numberOfLines={1}>{place.address || place.district || '地址暂未提供'}</Text>
        <View style={styles.cardMeta}>
          {place.rating != null ? <Text style={styles.rating}>★ {place.rating.toFixed(1)}</Text> : null}
          {place.cost != null ? <Text style={styles.cost}>参考消费 ¥{Math.round(place.cost)}</Text> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.disabled} />
    </Pressable>
  );
}

function HotelCard({ hotel, onPress }: { hotel: TravelHotel; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {hotel.imageUrl ? <Image source={{ uri: hotel.imageUrl }} style={styles.photo} /> : <View style={[styles.photo, styles.photoFallback]}><Ionicons name="bed-outline" size={28} color={colors.primaryLight} /></View>}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{hotel.name}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>{hotel.starLabel || (hotel.star ? `${hotel.star}星` : '酒店')}</Text>
        <Text style={styles.cardAddress} numberOfLines={1}>{hotel.address || hotel.district || '地址暂未提供'}</Text>
        <View style={styles.cardMeta}>
          {hotel.rating != null ? <Text style={styles.rating}>★ {hotel.rating.toFixed(1)}</Text> : null}
          <Text style={styles.cost}>{formatHotelReferencePrice(hotel)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.disabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg, backgroundColor: colors.surface },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { marginTop: 6, color: colors.textPrimary, fontSize: 27, fontWeight: '900' },
  subtitle: { marginTop: 7, color: colors.textSecondary, fontSize: 13 },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 11, borderRadius: borderRadius.full },
  tabActive: { backgroundColor: `${colors.primary}15` },
  tabText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, margin: spacing.lg, paddingHorizontal: spacing.md, height: 46, borderRadius: borderRadius.md, backgroundColor: colors.surface, ...shadow.light },
  input: { flex: 1, color: colors.textPrimary, fontSize: 14 },
  searchButton: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: borderRadius.sm, backgroundColor: colors.primary },
  searchButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  resultTitle: { marginBottom: spacing.md, color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', minHeight: 112, marginBottom: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg, backgroundColor: colors.surface, ...shadow.light },
  photo: { width: 92, height: 92, borderRadius: borderRadius.md, backgroundColor: colors.background },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, alignSelf: 'stretch', marginLeft: spacing.md, justifyContent: 'center' },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  cardSub: { marginTop: 5, color: colors.primary, fontSize: 12, fontWeight: '600' },
  cardAddress: { marginTop: 5, color: colors.textSecondary, fontSize: 12 },
  cardMeta: { flexDirection: 'row', gap: spacing.md, marginTop: 7 },
  rating: { color: '#B7791F', fontSize: 12, fontWeight: '700' },
  cost: { color: colors.priceRed, fontSize: 12, fontWeight: '700' },
  state: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 80 },
  stateTitle: { marginTop: spacing.md, color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  stateText: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  retryButton: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: borderRadius.full, backgroundColor: colors.primary },
  retryText: { color: '#FFF', fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 70 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  footer: { alignItems: 'center', paddingVertical: spacing.lg },
  moreButton: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: borderRadius.full, backgroundColor: `${colors.primary}15` },
  moreText: { color: colors.primary, fontWeight: '700' },
  endText: { color: colors.textSecondary, fontSize: 12 },
  pressed: { opacity: 0.72 },
});
