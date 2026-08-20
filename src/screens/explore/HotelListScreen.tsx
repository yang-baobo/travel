import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList, HotelLevelPreference, HotelAmenity } from '../../types';
import { hotels } from '../../data/hotels';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useFavoriteStore } from '../../store/useFavoriteStore';
import { formatPrice, getHotelLevelName, getZoneName } from '../../utils/formatters';

type Nav = NativeStackNavigationProp<ExploreStackParamList, 'HotelList'>;

const ZONE_OPTIONS: { key: string; label: string }[] = [
  { key: 'any', label: '不限' },
  { key: 'A', label: '南山区' },
  { key: 'B', label: '福田区' },
  { key: 'C', label: '罗湖区' },
  { key: 'D', label: '龙岗区' },
  { key: 'E', label: '盐田/大鹏' },
  { key: 'F', label: '宝安区' },
];

const LEVEL_OPTIONS: { key: HotelLevelPreference; label: string }[] = [
  { key: 'any', label: '不限' },
  { key: 'budget', label: '经济型' },
  { key: 'mid', label: '舒适型' },
  { key: 'luxury', label: '豪华型' },
];

const PRICE_RANGE_OPTIONS = [
  { label: '不限', min: 0, max: 99999 },
  { label: '300以下', min: 0, max: 300 },
  { label: '300-600', min: 300, max: 600 },
  { label: '600-1000', min: 600, max: 1000 },
  { label: '1000以上', min: 1000, max: 99999 },
];

const SORT_OPTIONS = [
  { key: 'rating', label: '推荐排序' },
  { key: 'price_asc', label: '价格低→高' },
  { key: 'price_desc', label: '价格高→低' },
] as const;

const ALL_AMENITIES: HotelAmenity[] = ['泳池', '健身房', 'SPA', 'WiFi', '自助早餐', '海景房', '亲子乐园', '商务中心'];

type FilterTab = 'zone' | 'level' | 'price' | 'amenity' | null;

export default function HotelListScreen() {
  const navigation = useNavigation<Nav>();
  const pref = usePreferenceStore();
  const { favoriteHotelIds, toggleFavoriteHotel } = useFavoriteStore();

  const [filterZone, setFilterZone] = useState<string>('any');
  const [filterLevel, setFilterLevel] = useState<HotelLevelPreference>(pref.hotelLevelPref);
  const [priceIdx, setPriceIdx] = useState(0); // index into PRICE_RANGE_OPTIONS
  const [filterAmenities, setFilterAmenities] = useState<HotelAmenity[]>([...pref.hotelAmenityPrefs]);
  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'rating'>('rating');
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>(null);

  const toggleAmenity = (a: HotelAmenity) => {
    setFilterAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  };

  const toggleTab = (tab: FilterTab) => {
    setActiveTab(prev => prev === tab ? null : tab);
  };

  const priceRange = PRICE_RANGE_OPTIONS[priceIdx];

  const filteredHotels = useMemo(() => {
    let list = [...hotels];
    if (filterZone !== 'any') list = list.filter(h => h.zone === filterZone);
    if (filterLevel !== 'any') list = list.filter(h => h.level === filterLevel);
    list = list.filter(h => h.pricePerNight >= priceRange.min && h.pricePerNight <= priceRange.max);
    if (filterAmenities.length > 0) {
      list = list.filter(h => filterAmenities.every(a => h.amenities.includes(a)));
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(h => h.name.toLowerCase().includes(q) || h.description.toLowerCase().includes(q));
    }
    if (sortBy === 'price_asc') list.sort((a, b) => a.pricePerNight - b.pricePerNight);
    else if (sortBy === 'price_desc') list.sort((a, b) => b.pricePerNight - a.pricePerNight);
    else list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [filterZone, filterLevel, priceRange, filterAmenities, sortBy, searchText]);

  // 筛选标签显示文字
  const zoneLabel = filterZone === 'any' ? '地区' : getZoneName(filterZone);
  const levelLabel = filterLevel === 'any' ? '档次' : getHotelLevelName(filterLevel);
  const priceLabel = priceIdx === 0 ? '价格' : PRICE_RANGE_OPTIONS[priceIdx].label;
  const amenityLabel = filterAmenities.length === 0 ? '设施' : `设施(${filterAmenities.length})`;

  const isFiltered = (tab: FilterTab) => {
    if (tab === 'zone') return filterZone !== 'any';
    if (tab === 'level') return filterLevel !== 'any';
    if (tab === 'price') return priceIdx !== 0;
    if (tab === 'amenity') return filterAmenities.length > 0;
    return false;
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* 搜索栏 */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索酒店名称..."
          placeholderTextColor={colors.disabled}
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity onPress={() => navigation.navigate('Preference')}>
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* 筛选标签栏 */}
      <View style={styles.filterTabBar}>
        {([
          { tab: 'zone' as FilterTab, label: zoneLabel },
          { tab: 'level' as FilterTab, label: levelLabel },
          { tab: 'price' as FilterTab, label: priceLabel },
          { tab: 'amenity' as FilterTab, label: amenityLabel },
        ]).map(item => (
          <TouchableOpacity
            key={item.tab}
            style={styles.filterTabItem}
            onPress={() => toggleTab(item.tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, (activeTab === item.tab || isFiltered(item.tab)) && { color: colors.primary }]}>
              {item.label}
            </Text>
            <Ionicons
              name={activeTab === item.tab ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={activeTab === item.tab || isFiltered(item.tab) ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* 展开的筛选面板 */}
      {activeTab && (
        <View style={styles.dropdownPanel}>
          {activeTab === 'zone' && (
            <View style={styles.dropdownGrid}>
              {ZONE_OPTIONS.map(z => (
                <TouchableOpacity
                  key={z.key}
                  style={[styles.dropdownChip, filterZone === z.key && styles.dropdownChipActive]}
                  onPress={() => { setFilterZone(z.key); setActiveTab(null); }}
                >
                  <Text style={[styles.dropdownChipText, filterZone === z.key && styles.dropdownChipTextActive]}>{z.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {activeTab === 'level' && (
            <View style={styles.dropdownGrid}>
              {LEVEL_OPTIONS.map(l => (
                <TouchableOpacity
                  key={l.key}
                  style={[styles.dropdownChip, filterLevel === l.key && styles.dropdownChipActive]}
                  onPress={() => { setFilterLevel(l.key); setActiveTab(null); }}
                >
                  <Text style={[styles.dropdownChipText, filterLevel === l.key && styles.dropdownChipTextActive]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {activeTab === 'price' && (
            <View style={styles.dropdownGrid}>
              {PRICE_RANGE_OPTIONS.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.dropdownChip, priceIdx === i && styles.dropdownChipActive]}
                  onPress={() => { setPriceIdx(i); setActiveTab(null); }}
                >
                  <Text style={[styles.dropdownChipText, priceIdx === i && styles.dropdownChipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {activeTab === 'amenity' && (
            <View>
              <View style={styles.dropdownGrid}>
                {ALL_AMENITIES.map(a => (
                  <TouchableOpacity
                    key={a}
                    style={[styles.dropdownChip, filterAmenities.includes(a) && styles.dropdownChipActive]}
                    onPress={() => toggleAmenity(a)}
                  >
                    <Text style={[styles.dropdownChipText, filterAmenities.includes(a) && styles.dropdownChipTextActive]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.dropdownDone} onPress={() => setActiveTab(null)}>
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>确定</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* 排序栏 */}
      <View style={styles.sortBar}>
        {SORT_OPTIONS.map(s => (
          <TouchableOpacity key={s.key} onPress={() => setSortBy(s.key)} style={styles.sortItem}>
            <Text style={[styles.sortText, sortBy === s.key && { color: colors.primary, fontWeight: '600' }]}>{s.label}</Text>
            {sortBy === s.key && <View style={styles.sortIndicator} />}
          </TouchableOpacity>
        ))}
        <Text style={[typography.caption, { marginLeft: 'auto', color: colors.textSecondary }]}>共{filteredHotels.length}家</Text>
      </View>

      {/* 酒店列表 */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        {filteredHotels.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bed-outline" size={48} color={colors.disabled} />
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>没有符合条件的酒店</Text>
            <Text style={typography.caption}>试试调整筛选条件</Text>
          </View>
        ) : (
          filteredHotels.map(hotel => (
            <View key={hotel.id} style={styles.hotelCard}>
              <Image source={{ uri: hotel.imageUrl }} style={styles.hotelImg} />
              <View style={styles.hotelBody}>
                <View style={styles.hotelHeader}>
                  <Text style={[typography.body, { fontWeight: '600', flex: 1 }]} numberOfLines={1}>{hotel.name}</Text>
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={11} color={colors.warningYellow} />
                    <Text style={styles.ratingText}>{hotel.rating}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleFavoriteHotel(hotel.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: 6 }}
                  >
                    <Ionicons
                      name={favoriteHotelIds.includes(hotel.id) ? 'heart' : 'heart-outline'}
                      size={18}
                      color={favoriteHotelIds.includes(hotel.id) ? colors.priceRed : colors.disabled}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.hotelMeta}>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelText}>{getHotelLevelName(hotel.level)}</Text>
                  </View>
                  <Text style={typography.caption}>{getZoneName(hotel.zone)}</Text>
                </View>
                <Text style={[typography.caption, { marginTop: 4 }]} numberOfLines={2}>{hotel.description}</Text>
                <View style={styles.amenityList}>
                  {hotel.amenities.slice(0, 4).map(a => (
                    <View key={a} style={styles.amenityTag}><Text style={styles.amenityTagText}>{a}</Text></View>
                  ))}
                  {hotel.amenities.length > 4 && <Text style={[typography.caption, { color: colors.textSecondary }]}>+{hotel.amenities.length - 4}</Text>}
                </View>
                <View style={styles.hotelBottom}>
                  <Text style={[typography.price, { fontSize: 18 }]}>{formatPrice(hotel.pricePerNight)}<Text style={[typography.caption, { color: colors.textSecondary }]}>/晚</Text></Text>
                </View>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // 搜索栏
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { flex: 1, fontSize: 14, color: colors.textPrimary, paddingVertical: spacing.xs },
  // 筛选标签栏
  filterTabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterTabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 12 },
  filterTabText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  // 展开面板
  dropdownPanel: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dropdownChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  dropdownChipActive: { backgroundColor: `${colors.primary}12`, borderColor: colors.primary },
  dropdownChipText: { fontSize: 13, color: colors.textPrimary },
  dropdownChipTextActive: { color: colors.primary, fontWeight: '600' },
  dropdownDone: { alignSelf: 'flex-end', marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  // 排序栏
  sortBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xl, backgroundColor: colors.background },
  sortItem: { alignItems: 'center' },
  sortText: { fontSize: 12, color: colors.textSecondary },
  sortIndicator: { width: 16, height: 2, backgroundColor: colors.primary, borderRadius: 1, marginTop: 2 },
  // 列表
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxxl },
  hotelCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.md, ...shadow.light },
  hotelImg: { width: 120, minHeight: 140, backgroundColor: colors.border },
  hotelBody: { flex: 1, padding: spacing.md },
  hotelHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  hotelMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  levelBadge: { backgroundColor: `${colors.primary}15`, paddingHorizontal: spacing.sm, paddingVertical: 1, borderRadius: borderRadius.full },
  levelText: { fontSize: 11, fontWeight: '500', color: colors.primary },
  amenityList: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
  amenityTag: { backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.sm },
  amenityTagText: { fontSize: 10, color: colors.textSecondary },
  hotelBottom: { marginTop: spacing.sm },
});
