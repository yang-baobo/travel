import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { TravelHotel, TripHotelContext } from '../../types/hotel';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useFavoriteStore } from '../../store/useFavoriteStore';
import { useRouteStore } from '../../store/useRouteStore';
import { isSameTripHotelContext } from '../../domain/tripHotel';
import { travelHotelService } from '../../services/travelData/hotel/TravelHotelService';
import { hydrateSelectedHotelGeography } from '../../services/travelData/hotel/HotelGeoService';
import {
  buildHotelCardViewModel,
  buildHotelSearchParams,
  getHotelContentState,
  getHotelSearchErrorMessage,
  HotelStarFilter,
  HotelUiSort,
} from '../../services/travelData/hotel/hotelUiModel';

const PRICE_OPTIONS: { label: string; value: number | null }[] = [
  { label: '不限', value: null },
  { label: '¥300内', value: 300 },
  { label: '¥500内', value: 500 },
  { label: '¥800内', value: 800 },
  { label: '¥1200内', value: 1200 },
  { label: '¥2000内', value: 2000 },
];

const STAR_OPTIONS: { label: string; value: HotelStarFilter }[] = [
  { label: '不限', value: 'any' },
  { label: '3星', value: '3' },
  { label: '4星', value: '4' },
  { label: '4～5星', value: '4-5' },
  { label: '5星', value: '5' },
];

const SORT_OPTIONS: { label: string; value: HotelUiSort }[] = [
  { label: '综合', value: 'none' },
  { label: '价格低→高', value: 'price_asc' },
  { label: '价格高→低', value: 'price_desc' },
];

const PRICE_DISCLAIMER = '价格为飞猪搜索参考价，实际价格与房型库存以飞猪预订页面为准。';

function initialMaxPrice(value: number): number | null {
  return Number.isFinite(value) && value > 0 && value < 100_000 ? value : null;
}

export default function HotelListScreen() {
  const preference = usePreferenceStore();
  const selectedHotel = useRouteStore(state => state.selectedHotel);
  const selectedHotelContext = useRouteStore(state => state.selectedHotelContext);
  const selectHotel = useRouteStore(state => state.selectHotel);
  const reconcileSelectedHotelContext = useRouteStore(state => state.reconcileSelectedHotelContext);
  const favoriteHotelIds = useFavoriteStore(state => state.favoriteHotelIds);
  const toggleFavoriteHotel = useFavoriteStore(state => state.toggleFavoriteHotel);

  const [hotels, setHotels] = useState<TravelHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(() => initialMaxPrice(preference.hotelPriceRange.max));
  const [starFilter, setStarFilter] = useState<HotelStarFilter>('any');
  const [sortBy, setSortBy] = useState<HotelUiSort>('none');
  const [showFilters, setShowFilters] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const latestRequestRef = useRef(0);
  // 用户在偏好设置里修改"每晚预算上限"后，进入本页时同步生效。
  const preferenceMaxPrice = preference.hotelPriceRange.max;
  useEffect(() => {
    setMaxPrice(initialMaxPrice(preferenceMaxPrice));
  }, [preferenceMaxPrice]);

  const tripContext = useMemo<TripHotelContext>(() => ({
    destination: preference.selectedCity,
    checkInDate: preference.travelStartDate,
    checkOutDate: preference.travelReturnDate,
  }), [preference.selectedCity, preference.travelReturnDate, preference.travelStartDate]);

  const selectedHotelId = selectedHotel && isSameTripHotelContext(selectedHotelContext, tripContext)
    ? selectedHotel.id
    : null;

  useEffect(() => {
    reconcileSelectedHotelContext(tripContext);
  }, [reconcileSelectedHotelContext, tripContext]);

  useEffect(() => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setErrorMessage(null);
      setHotels([]);
      const startedAt = Date.now();
      try {
        const params = buildHotelSearchParams({
          ...tripContext,
          maxReferencePrice: maxPrice,
          starFilter,
          keyword: searchText,
          sortBy,
        });
        const response = await travelHotelService.search(params);
        if (cancelled || requestId !== latestRequestRef.current) return;
        // 后端已做预算过滤；这里再按用户每晚预算区间兜底一次，
        // 确保推送结果始终落在偏好设置的预算范围内（缺参考价的保留）。
        const minPrice = preference.hotelPriceRange.min > 0 ? preference.hotelPriceRange.min : null;
        const filtered = response.hotels.filter(hotel => {
          if (hotel.referencePrice === null) return true;
          if (maxPrice !== null && hotel.referencePrice > maxPrice) return false;
          if (minPrice !== null && hotel.referencePrice < minPrice) return false;
          return true;
        });
        setHotels(filtered);
        if (__DEV__) {
          console.info(`[hotel-search] duration_ms=${Date.now() - startedAt} results=${response.hotels.length}`);
        }
      } catch (error) {
        if (cancelled || requestId !== latestRequestRef.current) return;
        setErrorMessage(getHotelSearchErrorMessage(error));
        if (__DEV__) console.warn(`[hotel-search] failed duration_ms=${Date.now() - startedAt}`);
      } finally {
        if (!cancelled && requestId === latestRequestRef.current) setLoading(false);
      }
    }, searchText.trim() ? 350 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [maxPrice, preference.hotelPriceRange, retryNonce, searchText, sortBy, starFilter, tripContext]);

  const handleBooking = useCallback(async (hotel: TravelHotel) => {
    if (!hotel.bookingUrl) return;
    try {
      const canOpen = await Linking.canOpenURL(hotel.bookingUrl);
      if (!canOpen) throw new Error('unsupported booking URL');
      await Linking.openURL(hotel.bookingUrl);
    } catch {
      Alert.alert('无法打开链接', '暂时无法打开飞猪详情，请稍后重试。');
    }
  }, []);

  const handleSelectHotel = useCallback((hotel: TravelHotel) => {
    selectHotel(hotel, tripContext);
    // Only the selected hotel is geocoded. The coordinator checks hotel.id and
    // request order before it is allowed to update the single Store owner.
    void hydrateSelectedHotelGeography(hotel.id, tripContext);
  }, [selectHotel, tripContext]);

  const contentState = getHotelContentState({
    loading,
    errorMessage,
    hotelCount: hotels.length,
  });
  const elderlyStyle = preference.elderlyMode ? styles.elderlyTouchTarget : undefined;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.tripStrip}>
        <Ionicons name="location-outline" size={17} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodySmall, { fontWeight: '700' }]}>{preference.selectedCity}实时酒店</Text>
          <Text style={typography.caption}>{preference.travelStartDate} 入住 · {preference.travelReturnDate} 退房</Text>
        </View>
        <View style={styles.sourceBadge}><Text style={styles.sourceBadgeText}>飞猪</Text></View>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, preference.elderlyMode && { fontSize: 17 }]}
          placeholder="搜索酒店名称或关键词…"
          placeholderTextColor={colors.disabled}
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
          accessibilityLabel="搜索实时酒店"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} accessibilityLabel="清空酒店搜索">
            <Ionicons name="close-circle" size={20} color={colors.disabled} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.filterButton, showFilters && styles.filterButtonActive, elderlyStyle]}
          onPress={() => setShowFilters(value => !value)}
          accessibilityLabel="酒店筛选"
        >
          <Ionicons name="options-outline" size={19} color={showFilters ? '#FFF' : colors.primary} />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterTitle}>每晚参考价上限（来自偏好设置，可临时调整）</Text>
          <View style={styles.chipRow}>
            {PRICE_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.label}
                style={[styles.chip, maxPrice === option.value && styles.chipActive, elderlyStyle]}
                onPress={() => setMaxPrice(option.value)}
                accessibilityLabel={`酒店预算${option.label}`}
              >
                <Text style={[styles.chipText, maxPrice === option.value && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
            {maxPrice !== null && !PRICE_OPTIONS.some(option => option.value === maxPrice) && (
              <View style={[styles.chip, styles.chipActive]}>
                <Text style={[styles.chipText, styles.chipTextActive]}>¥{maxPrice}内</Text>
              </View>
            )}
          </View>
          <Text style={styles.filterTitle}>明确星级</Text>
          <View style={styles.chipRow}>
            {STAR_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, starFilter === option.value && styles.chipActive, elderlyStyle]}
                onPress={() => setStarFilter(option.value)}
                accessibilityLabel={`酒店星级${option.label}`}
              >
                <Text style={[styles.chipText, starFilter === option.value && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterHint}>设施、评分和精确距离暂无可靠实时字段，本页不提供虚假筛选。</Text>
        </View>
      )}

      <View style={styles.sortBar}>
        {SORT_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[styles.sortButton, sortBy === option.value && styles.sortButtonActive, elderlyStyle]}
            onPress={() => setSortBy(option.value)}
            accessibilityLabel={`酒店排序${option.label}`}
          >
            <Text style={[styles.sortText, sortBy === option.value && styles.sortTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
        <Text style={[typography.caption, { marginLeft: 'auto' }]}>{contentState === 'ready' ? `${hotels.length}家` : ''}</Text>
      </View>

      {contentState === 'loading' && (
        <View style={styles.statePanel} testID="hotel-loading-state">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[typography.body, styles.stateTitle]}>正在查询实时酒店…</Text>
          <Text style={typography.caption}>飞猪实时查询可能需要几秒</Text>
        </View>
      )}

      {contentState === 'error' && (
        <View style={styles.statePanel} testID="hotel-error-state">
          <Ionicons name="cloud-offline-outline" size={48} color={colors.disabled} />
          <Text style={[typography.body, styles.stateTitle]}>{errorMessage}</Text>
          <TouchableOpacity
            style={[styles.retryButton, elderlyStyle]}
            onPress={() => setRetryNonce(value => value + 1)}
            accessibilityLabel="重新加载实时酒店"
          >
            <Text style={styles.retryButtonText}>重新加载</Text>
          </TouchableOpacity>
        </View>
      )}

      {contentState === 'empty' && (
        <View style={styles.statePanel} testID="hotel-empty-state">
          <Ionicons name="bed-outline" size={48} color={colors.disabled} />
          <Text style={[typography.body, styles.stateTitle]}>暂时没有找到符合条件的酒店</Text>
          <Text style={[typography.caption, { textAlign: 'center' }]}>可以尝试放宽预算、星级或搜索关键词。</Text>
        </View>
      )}

      {contentState === 'ready' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent} testID="hotel-results">
          {hotels.map(hotel => {
            const card = buildHotelCardViewModel(hotel, selectedHotelId);
            return (
              <View key={hotel.id} style={[styles.hotelCard, card.isSelected && styles.hotelCardSelected]} testID={`hotel-card-${hotel.id}`}>
                {card.imageUrl ? (
                  <Image source={{ uri: card.imageUrl }} style={styles.hotelImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.hotelImage, styles.imagePlaceholder]} testID="hotel-image-placeholder">
                    <Ionicons name="image-outline" size={32} color={colors.disabled} />
                    <Text style={typography.caption}>暂无图片</Text>
                  </View>
                )}
                <View style={styles.hotelBody}>
                  <View style={styles.hotelTitleRow}>
                    <Text style={[typography.body, { fontWeight: '700', flex: 1 }]} numberOfLines={2}>{card.name}</Text>
                    <TouchableOpacity
                      onPress={() => toggleFavoriteHotel(hotel.id)}
                      accessibilityLabel={favoriteHotelIds.includes(hotel.id) ? `取消收藏${hotel.name}` : `收藏${hotel.name}`}
                    >
                      <Ionicons
                        name={favoriteHotelIds.includes(hotel.id) ? 'heart' : 'heart-outline'}
                        size={20}
                        color={favoriteHotelIds.includes(hotel.id) ? colors.priceRed : colors.disabled}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.metaRow}>
                    {card.starText && <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>{card.starText}</Text></View>}
                    {card.ratingText && (
                      <View style={styles.metaInline}><Ionicons name="star" size={12} color={colors.warningYellow} /><Text style={styles.metaText}>{card.ratingText}</Text></View>
                    )}
                    {card.distanceText && <Text style={styles.metaText}>{card.distanceText}</Text>}
                  </View>
                  {card.address && <Text style={[typography.caption, { marginTop: 5 }]} numberOfLines={2}>{card.address}</Text>}
                  {card.tags.length > 0 && (
                    <View style={styles.tagRow}>{card.tags.map(tag => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View>
                  )}
                  <View style={styles.priceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={card.priceText === '查看实时价格' ? styles.noPriceText : styles.referencePrice}>{card.priceText}</Text>
                      <Text style={styles.priceCaption}>{card.priceCaption}</Text>
                    </View>
                    {card.canOpenBooking && (
                      <TouchableOpacity
                        style={[styles.secondaryButton, elderlyStyle]}
                        onPress={() => handleBooking(hotel)}
                        accessibilityLabel={`去飞猪查看${hotel.name}`}
                      >
                        <Text style={styles.secondaryButtonText}>去飞猪预订</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.selectButton, card.isSelected && styles.selectedButton, elderlyStyle]}
                      onPress={() => handleSelectHotel(hotel)}
                      disabled={card.isSelected}
                      accessibilityLabel={card.isSelected ? `${hotel.name}已选择` : `选择酒店${hotel.name}`}
                    >
                      <Ionicons name={card.isSelected ? 'checkmark-circle' : 'add-circle-outline'} size={17} color="#FFF" />
                      <Text style={styles.selectButtonText}>{card.isSelected ? '已选择' : '选这家'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={[typography.caption, { flex: 1 }]}>{PRICE_DISCLAIMER}</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tripStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  sourceBadge: { backgroundColor: '#FF6A0015', borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  sourceBadgeText: { color: '#D85800', fontSize: 11, fontWeight: '700' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontSize: 14, color: colors.textPrimary, paddingVertical: spacing.xs },
  filterButton: { width: 36, height: 36, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  filterButtonActive: { backgroundColor: colors.primary },
  filterPanel: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  filterHint: { fontSize: 11, color: colors.textSecondary, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: borderRadius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}12` },
  chipText: { fontSize: 12, color: colors.textPrimary },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  sortBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sortButton: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: borderRadius.full },
  sortButtonActive: { backgroundColor: `${colors.primary}12` },
  sortText: { fontSize: 12, color: colors.textSecondary },
  sortTextActive: { color: colors.primary, fontWeight: '700' },
  statePanel: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  stateTitle: { marginTop: spacing.md, marginBottom: spacing.xs, textAlign: 'center' },
  retryButton: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.primary },
  retryButtonText: { color: '#FFF', fontWeight: '700' },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm },
  hotelCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.md, borderWidth: 1.5, borderColor: 'transparent', ...shadow.light },
  hotelCardSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}04` },
  hotelImage: { width: '100%', height: 160, backgroundColor: colors.border },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  hotelBody: { padding: spacing.md },
  hotelTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  metaBadge: { backgroundColor: `${colors.primary}12`, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  metaBadgeText: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  metaInline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.textSecondary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
  tag: { backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.sm },
  tagText: { fontSize: 10, color: colors.textSecondary },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  referencePrice: { fontSize: 19, fontWeight: '800', color: colors.priceRed },
  noPriceText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  priceCaption: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  secondaryButton: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  selectButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, backgroundColor: colors.primary },
  selectedButton: { backgroundColor: colors.successGreen },
  selectButtonText: { fontSize: 12, color: '#FFF', fontWeight: '700' },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, padding: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.md, marginBottom: spacing.xxl },
  elderlyTouchTarget: { minHeight: 48, minWidth: 48 },
});
