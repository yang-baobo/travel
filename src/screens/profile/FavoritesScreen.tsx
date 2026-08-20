import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { useFavoriteStore } from '../../store/useFavoriteStore';
import { getAttractionById } from '../../data/attractions';
import { getHotelById } from '../../data/hotels';
import { getRestaurantById } from '../../data/restaurants';
import { getGuideById } from '../../data/guides';
import { getGuideRouteById } from '../../data/guideRoutes';
import { getSystemRouteById } from '../../data/systemRoutes';
import { mockFlights } from '../../data/flights';
import { formatPrice, getHotelLevelName } from '../../utils/formatters';

type TabKey = 'attractions' | 'routes' | 'guides' | 'flights' | 'hotels' | 'restaurants';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'attractions', label: '景点', icon: 'compass-outline' },
  { key: 'routes', label: '路线', icon: 'map-outline' },
  { key: 'guides', label: '导游', icon: 'people-outline' },
  { key: 'flights', label: '机票', icon: 'airplane-outline' },
  { key: 'hotels', label: '酒店', icon: 'bed-outline' },
  { key: 'restaurants', label: '餐厅', icon: 'restaurant-outline' },
];

function getCabinLabel(cabin: string): string {
  switch (cabin) {
    case 'economy': return '经济舱';
    case 'premium': return '超级经济舱';
    case 'first': return '头等舱';
    default: return cabin;
  }
}

export default function FavoritesScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('attractions');
  const {
    favoriteAttractionIds, favoriteRouteIds, favoriteGuideIds,
    favoriteFlightIds, favoriteHotelIds, favoriteRestaurantIds,
    toggleFavoriteAttraction, toggleFavoriteRoute, toggleFavoriteGuide,
    toggleFavoriteFlight, toggleFavoriteHotel, toggleFavoriteRestaurant,
  } = useFavoriteStore();

  const counts: Record<TabKey, number> = {
    attractions: favoriteAttractionIds.length,
    routes: favoriteRouteIds.length,
    guides: favoriteGuideIds.length,
    flights: favoriteFlightIds.length,
    hotels: favoriteHotelIds.length,
    restaurants: favoriteRestaurantIds.length,
  };

  const attractions = useMemo(() =>
    favoriteAttractionIds.map(id => getAttractionById(id)).filter(Boolean),
    [favoriteAttractionIds]
  );

  const routes = useMemo(() =>
    favoriteRouteIds.map(id => getGuideRouteById(id) || getSystemRouteById(id)).filter(Boolean),
    [favoriteRouteIds]
  );

  const guidesData = useMemo(() =>
    favoriteGuideIds.map(id => getGuideById(id)).filter(Boolean),
    [favoriteGuideIds]
  );

  const flights = useMemo(() =>
    favoriteFlightIds.map(id => mockFlights.find(f => f.id === id)).filter(Boolean),
    [favoriteFlightIds]
  );

  const hotelsData = useMemo(() =>
    favoriteHotelIds.map(id => getHotelById(id)).filter(Boolean),
    [favoriteHotelIds]
  );

  const restaurantsData = useMemo(() =>
    favoriteRestaurantIds.map(id => getRestaurantById(id)).filter(Boolean),
    [favoriteRestaurantIds]
  );

  const renderEmpty = () => (
    <View style={s.empty}>
      <Ionicons name="heart-outline" size={48} color={colors.disabled} />
      <Text style={[typography.body, { color: colors.disabled, marginTop: spacing.md }]}>暂无收藏</Text>
    </View>
  );

  const renderHeartBtn = (onPress: () => void) => (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Ionicons name="heart" size={20} color={colors.priceRed} />
    </TouchableOpacity>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'attractions':
        return (
          <FlatList
            data={attractions}
            keyExtractor={item => item!.id}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={s.list}
            renderItem={({ item }) => {
              const a = item!;
              return (
                <View style={s.card}>
                  <Image source={{ uri: a.imageUrl }} style={s.cardImg} />
                  <View style={s.cardBody}>
                    <Text style={typography.body} numberOfLines={1}>{a.name}</Text>
                    <Text style={typography.caption}>{a.zone}区 · {a.rating}分</Text>
                    <Text style={[typography.caption, { color: colors.primary }]}>
                      {a.ticketPrice > 0 ? formatPrice(a.ticketPrice) : '免费'}
                    </Text>
                  </View>
                  {renderHeartBtn(() => toggleFavoriteAttraction(a.id))}
                </View>
              );
            }}
          />
        );

      case 'routes':
        return (
          <FlatList
            data={routes}
            keyExtractor={item => item!.id}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={s.list}
            renderItem={({ item }) => {
              const r = item!;
              return (
                <View style={s.card}>
                  <Image source={{ uri: r.coverImage }} style={s.cardImg} />
                  <View style={s.cardBody}>
                    <Text style={typography.body} numberOfLines={1}>{r.title}</Text>
                    <Text style={typography.caption}>{r.durationDays}天行程 · {r.dailyPlan.flatMap(d => d.attractionIds).length}个景点</Text>
                  </View>
                  {renderHeartBtn(() => toggleFavoriteRoute(r.id))}
                </View>
              );
            }}
          />
        );

      case 'guides':
        return (
          <FlatList
            data={guidesData}
            keyExtractor={item => item!.id}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={s.list}
            renderItem={({ item }) => {
              const g = item!;
              return (
                <View style={s.card}>
                  <Image source={{ uri: g.avatar }} style={s.avatar} />
                  <View style={s.cardBody}>
                    <Text style={typography.body} numberOfLines={1}>{g.name}</Text>
                    <Text style={typography.caption}>{g.rating}分 · {g.yearsOfExperience}年经验</Text>
                    <Text style={[typography.caption, { color: colors.primary }]}>{formatPrice(g.perDayPrice)}/天</Text>
                  </View>
                  {renderHeartBtn(() => toggleFavoriteGuide(g.id))}
                </View>
              );
            }}
          />
        );

      case 'flights':
        return (
          <FlatList
            data={flights}
            keyExtractor={item => item!.id}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={s.list}
            renderItem={({ item }) => {
              const f = item!;
              return (
                <View style={s.card}>
                  <View style={s.flightIcon}>
                    <Ionicons name="airplane" size={24} color={colors.primary} />
                  </View>
                  <View style={s.cardBody}>
                    <Text style={typography.body} numberOfLines={1}>{f.airline}</Text>
                    <Text style={typography.caption}>
                      {f.departureCity}→{f.arrivalCity} · {f.departureTime}-{f.arrivalTime}
                    </Text>
                    <Text style={typography.caption}>{getCabinLabel(f.cabin)} · {f.date}</Text>
                    <Text style={[typography.caption, { color: colors.priceRed, fontWeight: '600' }]}>{formatPrice(f.totalPrice)}</Text>
                  </View>
                  {renderHeartBtn(() => toggleFavoriteFlight(f.id))}
                </View>
              );
            }}
          />
        );

      case 'hotels':
        return (
          <FlatList
            data={hotelsData}
            keyExtractor={item => item!.id}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={s.list}
            renderItem={({ item }) => {
              const h = item!;
              return (
                <View style={s.card}>
                  <Image source={{ uri: h.imageUrl }} style={s.cardImg} />
                  <View style={s.cardBody}>
                    <Text style={typography.body} numberOfLines={1}>{h.name}</Text>
                    <Text style={typography.caption}>{getHotelLevelName(h.level)} · {h.zone}区</Text>
                    <Text style={[typography.caption, { color: colors.priceRed, fontWeight: '600' }]}>{formatPrice(h.pricePerNight)}/晚</Text>
                  </View>
                  {renderHeartBtn(() => toggleFavoriteHotel(h.id))}
                </View>
              );
            }}
          />
        );

      case 'restaurants':
        return (
          <FlatList
            data={restaurantsData}
            keyExtractor={item => item!.id}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={s.list}
            renderItem={({ item }) => {
              const r = item!;
              return (
                <View style={s.card}>
                  <View style={s.flightIcon}>
                    <Ionicons name="restaurant" size={24} color={colors.warningYellow} />
                  </View>
                  <View style={s.cardBody}>
                    <Text style={typography.body} numberOfLines={1}>{r.name}</Text>
                    <Text style={typography.caption}>{r.cuisineType} · {r.zone}区 · {r.rating}分</Text>
                    <Text style={[typography.caption, { color: colors.primary }]}>人均{formatPrice(r.pricePerPerson)}</Text>
                  </View>
                  {renderHeartBtn(() => toggleFavoriteRestaurant(r.id))}
                </View>
              );
            }}
          />
        );
    }
  };

  return (
    <SafeAreaView style={s.container} edges={[]}>
      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const count = counts[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons name={tab.icon as any} size={16} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[s.tabText, active && s.tabTextActive]}>{tab.label}</Text>
              {count > 0 && (
                <View style={[s.badge, active && s.badgeActive]}>
                  <Text style={[s.badgeText, active && s.badgeTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {renderContent()}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: { flexDirection: 'row', paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.md, gap: 2 },
  tabActive: { backgroundColor: `${colors.primary}10` },
  tabText: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '600' },
  badge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeActive: { backgroundColor: colors.primary },
  badgeText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  badgeTextActive: { color: '#FFF' },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  card: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md, ...shadow.light },
  cardImg: { width: 60, height: 60, borderRadius: borderRadius.sm },
  cardBody: { flex: 1, gap: 2 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
  flightIcon: { width: 48, height: 48, borderRadius: borderRadius.sm, backgroundColor: `${colors.primary}10`, justifyContent: 'center', alignItems: 'center' },
});
