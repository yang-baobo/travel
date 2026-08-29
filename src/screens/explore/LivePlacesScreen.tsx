import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { borderRadius, shadow, spacing } from '../../theme/spacing';
import { useLiveTravelStore } from '../../store/useLiveTravelStore';
import type { ExploreStackParamList } from '../../types';
import type { TravelPlace, TravelPlaceCategory } from '../../types/travel';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'LivePlaces'>;
type Route = NativeStackScreenProps<ExploreStackParamList, 'LivePlaces'>['route'];

const TABS: Array<{ key: TravelPlaceCategory; label: string; placeholder: string }> = [
  { key: 'attraction', label: '景点', placeholder: '搜索故宫、博物馆、公园…' },
  { key: 'hotel', label: '酒店', placeholder: '搜索酒店名称或商圈…' },
  { key: 'restaurant', label: '餐饮', placeholder: '搜索烤鸭、胡同小吃、火锅…' },
];

export default function LivePlacesScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const [category, setCategory] = useState<TravelPlaceCategory>(route.params?.category || 'attraction');
  const [query, setQuery] = useState('');
  const items = useLiveTravelStore(state => state.items[category]);
  const keyword = useLiveTravelStore(state => state.keywords[category]);
  const hasMore = useLiveTravelStore(state => state.hasMore[category]);
  const loading = useLiveTravelStore(state => state.loading);
  const error = useLiveTravelStore(state => state.error);
  const search = useLiveTravelStore(state => state.search);

  useEffect(() => {
    setQuery(keyword);
    if (category === 'hotel') {
      navigation.replace('HotelList');
      return;
    }
    if (items.length === 0) void search(category, keyword, false);
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    Keyboard.dismiss();
    void search(category, query, false);
  };

  const activeTab = TABS.find(tab => tab.key === category)!;

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, category === tab.key && styles.tabActive]}
            onPress={() => tab.key === 'hotel' ? navigation.navigate('HotelList') : setCategory(tab.key)}
          >
            <Text style={[styles.tabText, category === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submit}
            placeholder={activeTab.placeholder}
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            style={styles.input}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.disabled} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchButton} onPress={submit}>
          <Text style={styles.searchButtonText}>搜索</Text>
        </TouchableOpacity>
      </View>

      {error && items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.disabled} />
          <Text style={styles.errorTitle}>真实数据暂时不可用</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={submit}>
            <Text style={styles.retryText}>重新加载</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => `${item.category}-${item.id}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <PlaceCard
              place={item}
              onPress={() => navigation.navigate('LivePlaceDetail', { placeId: item.id, source: 'amap', category: item.category === 'restaurant' ? 'restaurant' : 'attraction' })}
            />
          )}
          ListHeaderComponent={(
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>{keyword ? `“${keyword}”的结果` : `北京${activeTab.label}`}</Text>
              <Text style={styles.attribution}>地点信息由高德开放平台提供</Text>
            </View>
          )}
          ListEmptyComponent={!loading ? (
            <View style={styles.empty}><Text style={styles.emptyText}>没有找到相关地点，换个关键词试试。</Text></View>
          ) : null}
          ListFooterComponent={(
            <View style={styles.footer}>
              {loading ? <ActivityIndicator color={colors.primary} /> : hasMore && items.length > 0 ? (
                <TouchableOpacity style={styles.moreButton} onPress={() => void search(category, keyword, true)}>
                  <Text style={styles.moreText}>加载更多真实地点</Text>
                </TouchableOpacity>
              ) : items.length > 0 ? <Text style={styles.endText}>已加载当前可用结果</Text> : null}
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
    <TouchableOpacity style={styles.card} activeOpacity={0.76} onPress={onPress}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoFallback]}>
          <Ionicons name="location-outline" size={32} color={colors.primaryLight} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.cardType} numberOfLines={1}>{place.typeName || place.district || '北京地点'}</Text>
        <View style={styles.metaRow}>
          {place.rating != null && (
            <View style={styles.metaItem}>
              <Ionicons name="star" size={13} color={colors.warningYellow} />
              <Text style={styles.rating}>{place.rating.toFixed(1)}</Text>
            </View>
          )}
          {place.cost != null && <Text style={styles.cost}>参考消费 ¥{Math.round(place.cost)}</Text>}
        </View>
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.address} numberOfLines={1}>{place.address || place.district}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.disabled} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  searchRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface },
  searchBox: { flex: 1, height: 44, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { flex: 1, color: colors.textPrimary, fontSize: 14 },
  searchButton: { height: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: borderRadius.md, backgroundColor: colors.primary },
  searchButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  list: { padding: spacing.lg, paddingBottom: 40 },
  resultHeader: { marginBottom: spacing.md },
  resultTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  attribution: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  card: { minHeight: 112, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.lg, flexDirection: 'row', alignItems: 'center', ...shadow.light },
  photo: { width: 88, height: 88, borderRadius: borderRadius.md, backgroundColor: colors.background },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, alignSelf: 'stretch', paddingVertical: 2, marginLeft: spacing.md },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  cardType: { marginTop: 5, color: colors.textSecondary, fontSize: 12 },
  metaRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 5 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  cost: { color: colors.priceRed, fontSize: 12, fontWeight: '600' },
  addressRow: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3 },
  address: { flex: 1, fontSize: 11, color: colors.textSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36 },
  errorTitle: { marginTop: spacing.lg, color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  errorText: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retryButton: { marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.xl, paddingVertical: 11 },
  retryText: { color: '#FFF', fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  footer: { minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  moreButton: { paddingVertical: 12, paddingHorizontal: spacing.xl },
  moreText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  endText: { color: colors.textSecondary, fontSize: 12 },
});
