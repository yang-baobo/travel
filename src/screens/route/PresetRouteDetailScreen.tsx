import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList, GuideRoute, SystemRoute, RouteVersion, RoomOption } from '../../types';
import { getGuideRouteById } from '../../data/guideRoutes';
import { getSystemRouteById } from '../../data/systemRoutes';
import { getAttractionById } from '../../data/attractions';
import { getGuideById } from '../../data/guides';
import { hotels as allHotels, getRoomTypesForHotel, getRecommendedRoomTypes } from '../../data/hotels';
import { getRouteOption } from '../../data/travelTimeMatrix';
import { formatPrice, formatDays, getCategoryName, getCategoryIcon, getHotelLevelName } from '../../utils/formatters';
import { PREMIUM_CAR_TYPES, calcPremiumPrice, calcCarCount } from '../../utils/airportTransfer';
import { getUniversalRoute } from '../../utils/universalRoute';
import { useRouteStore } from '../../store/useRouteStore';

type RouteParams = RouteProp<ExploreStackParamList, 'PresetRouteDetail'>;
type Nav = NativeStackNavigationProp<ExploreStackParamList, 'PresetRouteDetail'>;

export default function PresetRouteDetailScreen() {
  const { params } = useRoute<RouteParams>();
  const navigation = useNavigation<Nav>();
  const { addStop } = useRouteStore();

  const isGuideRoute = params.routeType === 'guide';
  const guideRoute = isGuideRoute ? getGuideRouteById(params.routeId) : null;
  const systemRoute = !isGuideRoute ? getSystemRouteById(params.routeId) : null;

  const route = guideRoute || systemRoute;

  // 人数
  const [groupSize, setGroupSize] = useState(2);
  // 路线版本
  const [routeVersion, setRouteVersion] = useState<RouteVersion>('economy');
  // 房型选择: day -> roomType
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<Record<number, string>>({});
  // 可选项目选中状态: costId -> boolean
  const [selectedOptionalIds, setSelectedOptionalIds] = useState<Set<string>>(new Set());
  // 机场接送专车
  const [showAirportModal, setShowAirportModal] = useState(false);
  const [airportDirection, setAirportDirection] = useState<'pickup' | 'dropoff'>('pickup');
  const [selectedCarType, setSelectedCarType] = useState('comfort');
  const [premiumBookings, setPremiumBookings] = useState<{
    pickup: { carTypeId: string; price: number } | null;
    dropoff: { carTypeId: string; price: number } | null;
  }>({ pickup: null, dropoff: null });

  if (!route) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContent}>
          <Ionicons name="alert-circle" size={48} color={colors.disabled} />
          <Text style={[typography.h3, { marginTop: spacing.md }]}>路线未找到</Text>
        </View>
      </View>
    );
  }

  const guide = isGuideRoute && guideRoute ? getGuideById(guideRoute.guideId) : null;
  const dailyPlan = route.dailyPlan;
  const [expandedTransport, setExpandedTransport] = useState<Set<string>>(new Set());

  // 根据版本匹配酒店：经济版用budget/mid，豪华版用mid/luxury
  const getVersionHotel = (dayPlan: typeof dailyPlan[0], dayNum: number) => {
    if (!dayPlan.hotel) return null;
    // 从zone匹配酒店
    const dayAttrIds = dayPlan.attractionIds;
    const zones = new Set(dayAttrIds.map(id => getAttractionById(id)?.zone).filter(Boolean));
    const zoneArr = Array.from(zones) as string[];
    const targetLevel = routeVersion === 'economy' ? ['budget', 'mid'] : ['luxury', 'mid'];
    const matchHotels = allHotels.filter(h => zoneArr.includes(h.zone) && targetLevel.includes(h.level));
    if (matchHotels.length === 0) return { ...dayPlan.hotel, matchedHotel: null };
    const best = matchHotels.sort((a, b) => b.rating - a.rating)[0];
    return { ...dayPlan.hotel, matchedHotel: best, name: best.name, price: best.pricePerNight };
  };

  // 计算房间数量
  const roomCount = Math.max(1, Math.ceil(groupSize / 2));

  const toggleTransport = (key: string) => {
    setExpandedTransport(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const costs = isGuideRoute && guideRoute
    ? [...guideRoute.mandatoryCosts, ...guideRoute.optionalCosts]
    : (systemRoute?.estimatedCosts || []);

  const hasBus = isGuideRoute && !!guideRoute?.busTransport;
  const busPerPersonPerDay = hasBus ? guideRoute!.busTransport!.perPersonPerDay : 0;
  const busTotalCost = hasBus ? busPerPersonPerDay * groupSize * guideRoute!.durationDays : 0;
  const originalTransportCost = hasBus
    ? guideRoute!.mandatoryCosts.filter(c => c.category === 'transport').reduce((s, c) => s + c.unitPrice * c.quantity, 0)
    : 0;

  const mandatoryTotal = isGuideRoute && guideRoute
    ? guideRoute.mandatoryCosts.reduce((sum, c) => {
        if (hasBus && c.category === 'transport') {
          return sum + busTotalCost;
        }
        return sum + c.unitPrice * c.quantity * (c.isPerPerson ? groupSize : 1);
      }, 0)
    : 0;
  const optionalTotal = isGuideRoute && guideRoute
    ? guideRoute.optionalCosts.filter(c => selectedOptionalIds.has(c.id)).reduce((sum, c) => sum + c.unitPrice * c.quantity * (c.isPerPerson ? groupSize : 1), 0)
    : 0;

  // 版本价格系数：豪华版 1.6x
  const versionMultiplier = routeVersion === 'luxury' ? 1.6 : 1.0;

  // 房型额外费用
  const roomTypeExtraCost = Object.entries(selectedRoomTypes).reduce((sum, [day, roomType]) => {
    const dayPlan = dailyPlan.find(d => d.day === parseInt(day));
    if (!dayPlan?.hotel) return sum;
    const vHotel = getVersionHotel(dayPlan, parseInt(day));
    if (!vHotel?.matchedHotel) return sum;
    const rooms = getRoomTypesForHotel(vHotel.matchedHotel);
    const room = rooms.find(r => r.type === roomType);
    if (!room) return sum;
    return sum + (vHotel.matchedHotel.pricePerNight * (room.priceAdjust - 1.0) * roomCount);
  }, 0);

  // 机场接送费用计算
  const firstDayAttrIds = dailyPlan[0]?.attractionIds || [];
  const lastDayAttrIds = dailyPlan[dailyPlan.length - 1]?.attractionIds || [];
  const pickupTargetId = firstDayAttrIds[0] || '';
  const dropoffTargetId = lastDayAttrIds[lastDayAttrIds.length - 1] || '';
  const pickupRoute = pickupTargetId ? getUniversalRoute('airport-szx', pickupTargetId) : null;
  const dropoffRoute = dropoffTargetId ? getUniversalRoute(dropoffTargetId, 'airport-szx') : null;
  const pickupBaseTaxi = pickupRoute ? pickupRoute.driving.price : 50;
  const dropoffBaseTaxi = dropoffRoute ? dropoffRoute.driving.price : 50;
  const carCount = calcCarCount(groupSize);
  const airportTransferCost =
    (premiumBookings.pickup ? premiumBookings.pickup.price * carCount : 0) +
    (premiumBookings.dropoff ? premiumBookings.dropoff.price * carCount : 0);

  const groupPriceFactor = groupSize > 1 ? 1 + (groupSize - 1) * 0.6 : 1;
  const settlementPrice = isGuideRoute && guideRoute
    ? hasBus
      ? Math.round((guideRoute.totalFlatPrice - originalTransportCost) * versionMultiplier * groupPriceFactor + busTotalCost + optionalTotal + roomTypeExtraCost + airportTransferCost)
      : Math.round(guideRoute.totalFlatPrice * versionMultiplier * groupPriceFactor + optionalTotal + roomTypeExtraCost + airportTransferCost)
    : systemRoute
      ? Math.round(systemRoute.estimatedCosts.reduce((s, c) => s + c.unitPrice * c.quantity * (c.isPerPerson ? groupSize : 1), 0) * versionMultiplier + roomTypeExtraCost + airportTransferCost)
      : 0;
  const allAttractionIds = route.dailyPlan.flatMap(d => d.attractionIds);
  const handleSettlement = () => {
    navigation.navigate('Settlement', {
      orderTitle: route.title,
      routeType: params.routeType,
      routeId: params.routeId,
      totalPrice: settlementPrice,
      durationDays: route.durationDays,
      attractionIds: allAttractionIds,
      guideId: isGuideRoute && guideRoute ? guideRoute.guideId : undefined,
      restaurantIds: [],
    });
  };

  const handleAddToCustom = () => {
    // 构建带正确天数分配的 stops
    const stops: import('../../types').RouteStop[] = [];
    let order = 0;
    for (const dayPlan of route.dailyPlan) {
      for (const attrId of dayPlan.attractionIds) {
        const attr = getAttractionById(attrId);
        if (!attr) continue;
        stops.push({
          attractionId: attrId,
          order: order++,
          day: dayPlan.day,
          arrivalTime: '09:00',
          stayDuration: attr.estimatedDuration * 60,
          transportToNext: null,
        });
      }
    }

    // 构建导游分配
    const guideAssignment: Record<number, string | null> = {};
    if (isGuideRoute && guideRoute) {
      for (let d = 1; d <= route.durationDays; d++) {
        guideAssignment[d] = guideRoute.guideId;
      }
    }

    // 使用 loadFromPreset 一次性加载完整路线
    useRouteStore.getState().loadFromPreset(
      stops,
      isGuideRoute ? 'guide' : 'system',
      params.routeId,
      route.durationDays,
      guideAssignment,
    );

    // 直接跳转到自定义页面
    const parent = navigation.getParent();
    if (parent) parent.navigate('自定义');
  };

  // 加载路线后直接跳转到路线规划页面（多住一晚/增加用餐）
  const handleGoToRoutePlan = () => {
    // 先加载路线
    const stops: import('../../types').RouteStop[] = [];
    let order = 0;
    for (const dayPlan of route.dailyPlan) {
      for (const attrId of dayPlan.attractionIds) {
        const attr = getAttractionById(attrId);
        if (!attr) continue;
        stops.push({
          attractionId: attrId,
          order: order++,
          day: dayPlan.day,
          arrivalTime: '09:00',
          stayDuration: attr.estimatedDuration * 60,
          transportToNext: null,
        });
      }
    }
    const guideAssignment: Record<number, string | null> = {};
    if (isGuideRoute && guideRoute) {
      for (let d = 1; d <= route.durationDays; d++) {
        guideAssignment[d] = guideRoute.guideId;
      }
    }
    useRouteStore.getState().loadFromPreset(
      stops,
      isGuideRoute ? 'guide' : 'system',
      params.routeId,
      route.durationDays,
      guideAssignment,
    );

    // 跳转到自定义 Tab 下的 RoutePlan 页面
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate('自定义', { screen: 'RoutePlan' });
    }
  };

  return (
    <View style={styles.container}>
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Cover Image */}
      <Image source={{ uri: route.coverImage }} style={styles.coverImage} />
      <View style={styles.dayBadge}>
        <Text style={styles.dayBadgeText}>{formatDays(route.durationDays)}</Text>
      </View>

      {/* Title Section */}
      <View style={styles.mainInfo}>
        <Text style={typography.h1}>{route.title}</Text>
        <Text style={[typography.body, { marginTop: spacing.sm, color: colors.textSecondary }]}>
          {route.description}
        </Text>

        {/* 人数选择 + 版本切换 */}
        <View style={styles.groupVersionRow}>
          <View style={styles.groupSizeBox}>
            <Ionicons name="people-outline" size={16} color={colors.primary} />
            <Text style={typography.bodySmall}>人数</Text>
            <View style={styles.groupInputRow}>
              <TouchableOpacity style={styles.groupBtn} onPress={() => setGroupSize(s => Math.max(1, s - 1))}>
                <Ionicons name="remove" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.groupNum}>{groupSize}</Text>
              <TouchableOpacity style={styles.groupBtn} onPress={() => setGroupSize(s => Math.min(20, s + 1))}>
                <Ionicons name="add" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.versionToggle}>
            <TouchableOpacity
              style={[styles.versionBtn, routeVersion === 'economy' && styles.versionBtnActive]}
              onPress={() => setRouteVersion('economy')}
            >
              <Ionicons name="wallet-outline" size={14} color={routeVersion === 'economy' ? '#FFF' : colors.textPrimary} />
              <Text style={[styles.versionBtnText, routeVersion === 'economy' && styles.versionBtnTextActive]}>经济版</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.versionBtn, routeVersion === 'luxury' && styles.versionBtnLuxActive]}
              onPress={() => setRouteVersion('luxury')}
            >
              <Ionicons name="diamond-outline" size={14} color={routeVersion === 'luxury' ? '#FFF' : colors.textPrimary} />
              <Text style={[styles.versionBtnText, routeVersion === 'luxury' && styles.versionBtnTextActive]}>豪华版</Text>
            </TouchableOpacity>
          </View>
        </View>
        {groupSize > 2 && (
          <Text style={[typography.caption, { marginTop: spacing.xs, color: colors.textSecondary }]}>
            预计需要 {roomCount} 间房 · {groupSize}人出行
          </Text>
        )}

        {/* Tags */}
        <View style={styles.tagRow}>
          {route.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {/* Guide Info (for guide routes) */}
        {guide && (
          <View style={styles.guideCard}>
            <Image source={{ uri: guide.avatar }} style={styles.guideAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>{guide.name}</Text>
              <Text style={typography.bodySmall}>
                {guide.yearsOfExperience}年经验 | {guide.languages.join('/')}
              </Text>
            </View>
            <View style={styles.guideRating}>
              <Ionicons name="star" size={13} color={colors.warningYellow} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                {guide.rating.toFixed(1)}
              </Text>
            </View>
          </View>
        )}

        {/* System route metadata */}
        {!isGuideRoute && systemRoute && (
          <View style={styles.systemMeta}>
            <View style={styles.systemMetaItem}>
              <Ionicons name="speedometer-outline" size={16} color={colors.successGreen} />
              <Text style={typography.body}>
                {systemRoute.difficulty === 'easy' ? '轻松' : systemRoute.difficulty === 'medium' ? '适中' : '挑战'}
              </Text>
            </View>
            <View style={styles.systemMetaItem}>
              <Ionicons name="people-outline" size={16} color={colors.accent} />
              <Text style={typography.body}>{systemRoute.suitableFor.join(' / ')}</Text>
            </View>
          </View>
        )}

        {/* Guide route rating & pricing */}
        {isGuideRoute && guideRoute && (
          <View style={styles.pricingCard}>
            <View style={styles.pricingRow}>
              <Text style={typography.body}>路线总价 (打包价)</Text>
              <Text style={typography.price}>{formatPrice(guideRoute.totalFlatPrice)}</Text>
            </View>
            <View style={styles.pricingRow}>
              <View style={styles.ratingSmall}>
                <Ionicons name="star" size={14} color={colors.warningYellow} />
                <Text style={{ fontSize: 14, fontWeight: '600' }}>{guideRoute.rating.toFixed(1)}</Text>
                <Text style={typography.caption}>({guideRoute.reviewCount}评价)</Text>
              </View>
              <Text style={typography.caption}>最多{guideRoute.maxGroupSize}人</Text>
            </View>
          </View>
        )}
      </View>

      {/* Daily Itinerary */}
      <View style={styles.section}>
        <Text style={[typography.h2, { marginBottom: spacing.lg }]}>每日行程</Text>
        {dailyPlan.map((day) => (
          <View key={day.day} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <View style={styles.dayNumber}>
                <Text style={styles.dayNumberText}>D{day.day}</Text>
              </View>
              <Text style={[typography.h3, { flex: 1 }]}>{day.description}</Text>
            </View>

            {/* Bus transport banner */}
            {hasBus && (
              <View style={styles.busBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Ionicons name="bus" size={18} color={colors.transport} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.transport }}>
                    大巴接送  人均{busPerPersonPerDay}元/天
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                  导游租车，全程包接包送
                </Text>
              </View>
            )}

            {/* Attractions for the day with transport */}
            {day.attractionIds.map((aId, idx) => {
              const attraction = getAttractionById(aId);
              if (!attraction) return null;
              const prevId = idx > 0 ? day.attractionIds[idx - 1] : null;
              const routeOpt = prevId ? getRouteOption(prevId, aId) : null;
              return (
                <View key={aId}>
                  {/* Transport between attractions - hidden for bus routes */}
                  {routeOpt && !hasBus && (() => {
                    const tKey = `${day.day}-${prevId}-${aId}`;
                    const isExpanded = expandedTransport.has(tKey);
                    return (
                      <View>
                        <TouchableOpacity style={styles.transportRow} onPress={() => toggleTransport(tKey)} activeOpacity={0.7}>
                          <View style={styles.transportDot}>
                            <Ionicons name="car" size={10} color={colors.accent} />
                          </View>
                          <View style={[styles.transportInfo, { flex: 1 }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={[typography.caption, { color: colors.accent, fontWeight: '600' }]}>
                                {routeOpt.transit.time}分 | {routeOpt.transit.distance}km | {formatPrice(routeOpt.transit.price)}
                              </Text>
                              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
                            </View>
                          </View>
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={styles.transportExpanded}>
                            <Text style={[typography.caption, { fontWeight: '500' }]}>{routeOpt.transit.detail}</Text>
                            {routeOpt.driving && (
                              <Text style={[typography.caption, { marginTop: 3 }]}>
                                驾车: {routeOpt.driving.time}分 | {routeOpt.driving.distance}km | {formatPrice(routeOpt.driving.price)}
                              </Text>
                            )}
                            {routeOpt.walking && (
                              <Text style={[typography.caption, { marginTop: 3 }]}>
                                步行: {routeOpt.walking.time}分 | {routeOpt.walking.distance}km
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  <View style={styles.attractionItem}>
                    <View style={styles.timelineDot} />
                    {idx < day.attractionIds.length - 1 && <View style={styles.timelineLine} />}
                    <Image source={{ uri: attraction.imageUrl }} style={styles.attractionThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={typography.body}>{attraction.name}</Text>
                      <Text style={typography.caption}>
                        {attraction.estimatedDuration}小时 | {attraction.ticketPrice === 0 ? '免费' : formatPrice(attraction.ticketPrice)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Meals */}
            {day.meals.length > 0 && (
              <View style={styles.mealSection}>
                {day.meals.map((meal, mIdx) => (
                  <View key={mIdx} style={styles.mealItem}>
                    <Ionicons
                      name={meal.type === 'breakfast' ? 'sunny-outline' : meal.type === 'lunch' ? 'restaurant-outline' : 'moon-outline'}
                      size={14}
                      color={colors.warningYellow}
                    />
                    <Text style={typography.caption}>
                      {meal.type === 'breakfast' ? '早' : meal.type === 'lunch' ? '午' : '晚'}: {meal.description}
                    </Text>
                    {meal.included && (
                      <View style={styles.includedBadge}>
                        <Text style={styles.includedText}>已含</Text>
                      </View>
                    )}
                    {!meal.included && meal.price && (
                      <Text style={[typography.caption, { color: colors.priceRed }]}>~{formatPrice(meal.price)}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Hotel - version-aware with room type selection */}
            {day.hotel && (() => {
              const vHotel = getVersionHotel(day, day.day);
              const matchedHotel = vHotel?.matchedHotel;
              const roomOptions = matchedHotel ? getRecommendedRoomTypes(groupSize, matchedHotel) : [];
              const selectedRoom = selectedRoomTypes[day.day];
              return (
                <View style={styles.hotelSection}>
                  <View style={styles.hotelItem}>
                    <Ionicons name="bed-outline" size={14} color="#6E58A5" />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Text style={[typography.caption, { fontWeight: '600' }]}>
                          住宿: {matchedHotel ? matchedHotel.name : day.hotel.name}
                        </Text>
                        <View style={[styles.versionTag, routeVersion === 'luxury' && styles.versionTagLux]}>
                          <Text style={[styles.versionTagText, routeVersion === 'luxury' && styles.versionTagTextLux]}>
                            {routeVersion === 'luxury' ? '豪华' : '经济'}
                          </Text>
                        </View>
                      </View>
                      {matchedHotel && (
                        <Text style={[typography.caption, { marginTop: 2 }]}>
                          {getHotelLevelName(matchedHotel.level)} | {matchedHotel.rating}分 | {formatPrice(matchedHotel.pricePerNight)}/晚 x{roomCount}间
                        </Text>
                      )}
                    </View>
                  </View>
                  {/* Room type selection */}
                  {roomOptions.length > 0 && (
                    <View style={styles.roomTypeRow}>
                      <Text style={[typography.caption, { marginBottom: spacing.xs, color: colors.textSecondary }]}>选择房型:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                          {roomOptions.map(room => {
                            const isSel = selectedRoom === room.type;
                            return (
                              <TouchableOpacity
                                key={room.type}
                                style={[styles.roomChip, isSel && styles.roomChipActive]}
                                onPress={() => setSelectedRoomTypes(prev => ({ ...prev, [day.day]: isSel ? '' : room.type }))}
                              >
                                <Text style={[styles.roomChipText, isSel && styles.roomChipTextActive]}>{room.type}</Text>
                                {room.priceAdjust > 1 && (
                                  <Text style={[styles.roomChipPrice, isSel && { color: '#FFF' }]}>
                                    +{Math.round((room.priceAdjust - 1) * 100)}%
                                  </Text>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        ))}
      </View>

      {/* Cost Breakdown */}
      <View style={styles.section}>
        <Text style={[typography.h2, { marginBottom: spacing.sm }]}>费用明细 ({groupSize}人·{routeVersion === 'luxury' ? '豪华版' : '经济版'})</Text>
        <Text style={[typography.caption, { marginBottom: spacing.lg, color: colors.textSecondary }]}>
          {routeVersion === 'luxury' ? '豪华版含高档酒店、专车接送' : '经济版含舒适酒店、公共交通'}
        </Text>

        {isGuideRoute && guideRoute && (
          <>
            <Text style={[typography.h3, { marginBottom: spacing.sm, color: colors.priceRed }]}>
              必选项目
            </Text>
            {guideRoute.mandatoryCosts.map((cost) => {
              if (hasBus && cost.category === 'transport') {
                return (
                  <View key={cost.id} style={styles.costRow}>
                    <View style={styles.costLabel}>
                      <Ionicons name="bus" size={14} color={colors.transport} />
                      <Text style={typography.body}>大巴接送</Text>
                      <Text style={typography.caption}>{busPerPersonPerDay}元/人/天 x{groupSize}人 x{guideRoute.durationDays}天</Text>
                    </View>
                    <Text style={typography.body}>{formatPrice(busTotalCost)}</Text>
                  </View>
                );
              }
              return (
                <View key={cost.id} style={styles.costRow}>
                  <View style={styles.costLabel}>
                    <Ionicons name={getCategoryIcon(cost.category) as any} size={14} color={colors[cost.category]} />
                    <Text style={typography.body}>{cost.name}</Text>
                    {cost.isPerPerson && <Text style={typography.caption}>x{groupSize}人</Text>}
                  </View>
                  <Text style={typography.body}>{formatPrice(cost.unitPrice * cost.quantity * (cost.isPerPerson ? groupSize : 1))}</Text>
                </View>
              );
            })}
            <View style={styles.costSubtotal}>
              <Text style={typography.bodySmall}>必选小计</Text>
              <Text style={[typography.priceSmall]}>{formatPrice(mandatoryTotal)}</Text>
            </View>

            {guideRoute.optionalCosts.length > 0 && (
              <>
                <Text style={[typography.h3, { marginTop: spacing.lg, marginBottom: spacing.xs, color: colors.accent }]}>
                  可选项目
                </Text>
                <Text style={[typography.caption, { marginBottom: spacing.sm, color: colors.textSecondary }]}>
                  勾选后纳入费用计算
                </Text>
                {guideRoute.optionalCosts.map((cost) => {
                  const isSelected = selectedOptionalIds.has(cost.id);
                  const itemPrice = cost.unitPrice * cost.quantity * (cost.isPerPerson ? groupSize : 1);
                  return (
                    <TouchableOpacity
                      key={cost.id}
                      style={[styles.costRow, styles.optionalCostRow, isSelected && styles.optionalCostRowActive]}
                      onPress={() => {
                        setSelectedOptionalIds(prev => {
                          const next = new Set(prev);
                          if (next.has(cost.id)) next.delete(cost.id); else next.add(cost.id);
                          return next;
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.costLabel}>
                        <Ionicons
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={isSelected ? colors.primary : colors.disabled}
                        />
                        <Ionicons name={getCategoryIcon(cost.category) as any} size={14} color={isSelected ? colors[cost.category] : colors.disabled} />
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.body, !isSelected && { color: colors.textSecondary }]}>{cost.name}</Text>
                          {cost.description && <Text style={typography.caption}>{cost.description}</Text>}
                        </View>
                      </View>
                      <Text style={[typography.body, isSelected ? { color: colors.priceRed } : { color: colors.disabled }]}>
                        {formatPrice(itemPrice)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {optionalTotal > 0 && (
                  <View style={styles.costSubtotal}>
                    <Text style={typography.bodySmall}>已选可选项小计</Text>
                    <Text style={[typography.priceSmall]}>{formatPrice(optionalTotal)}</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {!isGuideRoute && systemRoute && (
          <>
            <Text style={[typography.bodySmall, { marginBottom: spacing.md }]}>
              以下为预估费用({groupSize}人)，实际花费可能有所不同
            </Text>
            {systemRoute.estimatedCosts.map((cost) => (
              <View key={cost.id} style={styles.costRow}>
                <View style={styles.costLabel}>
                  <Ionicons name={getCategoryIcon(cost.category) as any} size={14} color={colors[cost.category]} />
                  <Text style={typography.body}>{cost.name}</Text>
                  {cost.isPerPerson && <Text style={typography.caption}>x{groupSize}人</Text>}
                </View>
                <Text style={typography.body}>{formatPrice(cost.unitPrice * cost.quantity * (cost.isPerPerson ? groupSize : 1))}</Text>
              </View>
            ))}
            <View style={styles.costSubtotal}>
              <Text style={typography.bodySmall}>预估总计</Text>
              <Text style={typography.priceSmall}>
                {formatPrice(systemRoute.estimatedCosts.reduce((s, c) => s + c.unitPrice * c.quantity * (c.isPerPerson ? groupSize : 1), 0))}
              </Text>
            </View>
          </>
        )}

        {/* 版本附加费 */}
        {routeVersion === 'luxury' && (
          <View style={[styles.costSubtotal, { marginTop: spacing.md }]}>
            <Text style={[typography.bodySmall, { color: '#6E58A5' }]}>豪华版附加</Text>
            <Text style={[typography.priceSmall, { color: '#6E58A5' }]}>+60%</Text>
          </View>
        )}
        {roomTypeExtraCost > 0 && (
          <View style={styles.costSubtotal}>
            <Text style={typography.bodySmall}>房型升级</Text>
            <Text style={typography.priceSmall}>{formatPrice(roomTypeExtraCost)}</Text>
          </View>
        )}
        {airportTransferCost > 0 && (
          <View style={styles.costSubtotal}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="car-sport-outline" size={14} color={colors.transport} />
              <Text style={[typography.bodySmall, { color: colors.transport }]}>机场专车</Text>
            </View>
            <Text style={[typography.priceSmall, { color: colors.transport }]}>{formatPrice(airportTransferCost)}</Text>
          </View>
        )}
      </View>

      {/* 额外食宿选项 */}
      <View style={styles.section}>
        <Text style={[typography.h2, { marginBottom: spacing.md }]}>额外食宿选项</Text>
        <Text style={[typography.caption, { marginBottom: spacing.md, color: colors.textSecondary }]}>
          想多住几晚或加几顿美食？在这里添加
        </Text>
        <View style={styles.extraOptionsRow}>
          <TouchableOpacity style={styles.extraOptionCard} onPress={handleGoToRoutePlan}>
            <View style={[styles.extraOptionIcon, { backgroundColor: '#6E58A520' }]}>
              <Ionicons name="bed-outline" size={24} color="#6E58A5" />
            </View>
            <Text style={[typography.bodySmall, { fontWeight: '600' }]}>多住一晚</Text>
            <Text style={typography.caption}>延长行程</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.extraOptionCard} onPress={handleGoToRoutePlan}>
            <View style={[styles.extraOptionIcon, { backgroundColor: `${colors.warningYellow}20` }]}>
              <Ionicons name="restaurant-outline" size={24} color={colors.warningYellow} />
            </View>
            <Text style={[typography.bodySmall, { fontWeight: '600' }]}>增加用餐</Text>
            <Text style={typography.caption}>美食体验</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.extraOptionCard} onPress={() => { setAirportDirection('pickup'); setShowAirportModal(true); }}>
            <View style={[styles.extraOptionIcon, { backgroundColor: `${colors.accent}20` }]}>
              <Ionicons name="car-outline" size={24} color={colors.accent} />
            </View>
            <Text style={[typography.bodySmall, { fontWeight: '600' }]}>接送服务</Text>
            <Text style={typography.caption}>
              {premiumBookings.pickup || premiumBookings.dropoff ? '已配置' : '省心出行'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>

    {/* Settlement Bar */}
    <View style={styles.settleBar}>
      <View>
        <Text style={typography.caption}>{groupSize}人·{routeVersion === 'luxury' ? '豪华版' : '经济版'}</Text>
        <Text style={typography.price}>{formatPrice(settlementPrice)}</Text>
      </View>
      <View style={styles.settleBtnGroup}>
        <TouchableOpacity onPress={handleAddToCustom} activeOpacity={0.7} style={styles.addToCustomBtn}>
          <Text style={styles.addToCustomBtnText}>加入自定义</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSettlement} activeOpacity={0.8}>
          <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.settleBtn}>
            <Text style={styles.settleBtnText}>去结算</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>

    {/* Airport Transfer Modal */}
    <Modal visible={showAirportModal} transparent animationType="slide" onRequestClose={() => setShowAirportModal(false)}>
      <View style={styles.airportModalOverlay}>
        <View style={styles.airportModalContent}>
          <View style={styles.airportModalHeader}>
            <Text style={typography.h3}>机场专车接送</Text>
            <TouchableOpacity onPress={() => setShowAirportModal(false)}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
              专业司机准时接送，行李帮提，舒适出行
            </Text>

            {/* Direction tabs */}
            <View style={styles.airportDirRow}>
              <TouchableOpacity
                style={[styles.airportDirBtn, airportDirection === 'pickup' && styles.airportDirBtnActive]}
                onPress={() => setAirportDirection('pickup')}
              >
                <Ionicons name="airplane-outline" size={16} color={airportDirection === 'pickup' ? '#FFF' : colors.textPrimary} />
                <Text style={[styles.airportDirBtnText, airportDirection === 'pickup' && styles.airportDirBtnTextActive]}>接机</Text>
                {premiumBookings.pickup && <Ionicons name="checkmark-circle" size={14} color={airportDirection === 'pickup' ? '#FFF' : colors.successGreen} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.airportDirBtn, airportDirection === 'dropoff' && styles.airportDirBtnActive]}
                onPress={() => setAirportDirection('dropoff')}
              >
                <Ionicons name="airplane-outline" size={16} color={airportDirection === 'dropoff' ? '#FFF' : colors.textPrimary} style={{ transform: [{ rotate: '45deg' }] }} />
                <Text style={[styles.airportDirBtnText, airportDirection === 'dropoff' && styles.airportDirBtnTextActive]}>送机</Text>
                {premiumBookings.dropoff && <Ionicons name="checkmark-circle" size={14} color={airportDirection === 'dropoff' ? '#FFF' : colors.successGreen} />}
              </TouchableOpacity>
            </View>

            {/* Route info */}
            {(() => {
              const routeInfo = airportDirection === 'pickup' ? pickupRoute : dropoffRoute;
              const targetAttr = getAttractionById(airportDirection === 'pickup' ? pickupTargetId : dropoffTargetId);
              if (!routeInfo) return <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.md }]}>暂无路线信息</Text>;
              return (
                <View style={styles.airportRouteCard}>
                  <Ionicons name="navigate-outline" size={16} color={colors.transport} />
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodySmall, { fontWeight: '600' }]}>
                      {airportDirection === 'pickup' ? '深圳宝安机场' : (targetAttr?.name || '出发地')} → {airportDirection === 'pickup' ? (targetAttr?.name || '目的地') : '深圳宝安机场'}
                    </Text>
                    <Text style={typography.caption}>{routeInfo.driving.distance.toFixed(1)}km · 预计{routeInfo.driving.time}分钟</Text>
                  </View>
                </View>
              );
            })()}

            {/* Car type selection */}
            <Text style={[typography.bodySmall, { fontWeight: '600', marginTop: spacing.lg, marginBottom: spacing.md }]}>选择车型</Text>
            <View style={styles.airportCarTypeRow}>
              {PREMIUM_CAR_TYPES.map(car => {
                const isActive = selectedCarType === car.id;
                const baseTaxi = airportDirection === 'pickup' ? pickupBaseTaxi : dropoffBaseTaxi;
                const premPrice = calcPremiumPrice(baseTaxi, car.id);
                return (
                  <TouchableOpacity
                    key={car.id}
                    style={[styles.airportCarTypeCard, isActive && styles.airportCarTypeCardActive]}
                    onPress={() => setSelectedCarType(car.id)}
                  >
                    <Ionicons name={car.id === 'luxury' ? 'diamond-outline' : car.id === 'business' ? 'briefcase-outline' : 'car-outline'} size={24} color={isActive ? colors.transport : colors.textSecondary} />
                    <Text style={[typography.bodySmall, { fontWeight: '600', marginTop: spacing.xs, color: isActive ? colors.transport : colors.textPrimary }]}>{car.name}</Text>
                    <Text style={[typography.caption, { textAlign: 'center', marginTop: 2 }]}>{car.description}</Text>
                    <Text style={[typography.priceSmall, { marginTop: spacing.sm, color: isActive ? colors.transport : colors.priceRed }]}>
                      {formatPrice(premPrice * carCount)}
                    </Text>
                    {carCount > 1 && <Text style={typography.caption}>{carCount}辆车</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Price breakdown */}
            {(() => {
              const baseTaxi = airportDirection === 'pickup' ? pickupBaseTaxi : dropoffBaseTaxi;
              const premPrice = calcPremiumPrice(baseTaxi, selectedCarType);
              const carType = PREMIUM_CAR_TYPES.find(c => c.id === selectedCarType);
              return (
                <View style={styles.airportPriceBreakdown}>
                  <View style={styles.airportPriceRow}>
                    <Text style={typography.caption}>基础打车费</Text>
                    <Text style={typography.caption}>{formatPrice(baseTaxi)}</Text>
                  </View>
                  <View style={styles.airportPriceRow}>
                    <Text style={typography.caption}>车型服务费 ({carType?.name})</Text>
                    <Text style={typography.caption}>+{formatPrice(premPrice - baseTaxi)}</Text>
                  </View>
                  {carCount > 1 && (
                    <View style={styles.airportPriceRow}>
                      <Text style={typography.caption}>车辆数</Text>
                      <Text style={typography.caption}>{carCount}辆</Text>
                    </View>
                  )}
                  <View style={[styles.airportPriceRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs }]}>
                    <Text style={[typography.bodySmall, { fontWeight: '700' }]}>合计</Text>
                    <Text style={typography.price}>{formatPrice(premPrice * carCount)}</Text>
                  </View>
                </View>
              );
            })()}
          </ScrollView>

          {/* Buttons */}
          <View style={styles.airportBtnRow}>
            {(airportDirection === 'pickup' ? premiumBookings.pickup : premiumBookings.dropoff) ? (
              <TouchableOpacity
                style={[styles.airportBtn, { backgroundColor: colors.priceRed }]}
                onPress={() => {
                  setPremiumBookings(prev => ({ ...prev, [airportDirection]: null }));
                }}
              >
                <Text style={styles.airportBtnText}>取消{airportDirection === 'pickup' ? '接机' : '送机'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.airportBtn, { backgroundColor: colors.transport, flex: 1 }]}
              onPress={() => {
                const baseTaxi = airportDirection === 'pickup' ? pickupBaseTaxi : dropoffBaseTaxi;
                const premPrice = calcPremiumPrice(baseTaxi, selectedCarType);
                setPremiumBookings(prev => ({ ...prev, [airportDirection]: { carTypeId: selectedCarType, price: premPrice } }));
                setShowAirportModal(false);
              }}
            >
              <Text style={styles.airportBtnText}>确认预约{airportDirection === 'pickup' ? '接机' : '送机'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: 220,
    backgroundColor: colors.border,
  },
  dayBadge: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  dayBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  mainInfo: {
    padding: spacing.xl,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tag: {
    backgroundColor: `${colors.primary}15`,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xl,
    ...shadow.light,
  },
  guideAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
    marginRight: spacing.md,
  },
  guideRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  systemMeta: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  systemMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pricingCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginTop: spacing.lg,
    ...shadow.light,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  ratingSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  section: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.light,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  busBanner: {
    backgroundColor: `${colors.transport}12`,
    borderWidth: 1,
    borderColor: `${colors.transport}30`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dayNumber: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  attractionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: 18,
    marginBottom: spacing.md,
    position: 'relative',
  },
  timelineDot: {
    position: 'absolute',
    left: 0,
    top: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  timelineLine: {
    position: 'absolute',
    left: 3,
    top: 24,
    width: 2,
    height: 30,
    backgroundColor: colors.primaryLight,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: 10,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  transportDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: `${colors.accent}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transportInfo: {
    flex: 1,
    backgroundColor: `${colors.accent}08`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  transportExpanded: {
    marginLeft: 34,
    backgroundColor: `${colors.accent}08`,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  attractionThumb: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.border,
  },
  mealSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  mealItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hotelSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  hotelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  includedBadge: {
    backgroundColor: `${colors.successGreen}20`,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  includedText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.successGreen,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  optionalCostRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: 0,
    backgroundColor: colors.background,
  },
  optionalCostRowActive: {
    backgroundColor: `${colors.primary}08`,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  costLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  costSubtotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  settleBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  settleBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
  },
  settleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  settleBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addToCustomBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addToCustomBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  // 人数 + 版本
  groupVersionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  groupSizeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groupInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  groupBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupNum: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: 'center',
  },
  versionToggle: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  versionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  versionBtnActive: {
    backgroundColor: colors.primary,
  },
  versionBtnLuxActive: {
    backgroundColor: '#6E58A5',
  },
  versionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  versionBtnTextActive: {
    color: '#FFF',
  },
  // 版本标签
  versionTag: {
    backgroundColor: `${colors.primary}15`,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  versionTagLux: {
    backgroundColor: '#6E58A520',
  },
  versionTagText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.primary,
  },
  versionTagTextLux: {
    color: '#6E58A5',
  },
  // 房型选择
  roomTypeRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  roomChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomChipActive: {
    backgroundColor: '#6E58A5',
    borderColor: '#6E58A5',
  },
  roomChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  roomChipTextActive: {
    color: '#FFF',
  },
  roomChipPrice: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  // 额外食宿选项
  extraOptionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  extraOptionCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadow.light,
  },
  extraOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  // Airport transfer modal
  airportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  airportModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    maxHeight: '85%',
  },
  airportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  airportDirRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  airportDirBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  airportDirBtnActive: {
    backgroundColor: colors.transport,
    borderColor: colors.transport,
  },
  airportDirBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  airportDirBtnTextActive: {
    color: '#FFF',
  },
  airportRouteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.transport}08`,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: `${colors.transport}20`,
    marginTop: spacing.sm,
  },
  airportCarTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  airportCarTypeCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  airportCarTypeCardActive: {
    borderColor: colors.transport,
    backgroundColor: `${colors.transport}08`,
  },
  airportPriceBreakdown: {
    marginTop: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  airportPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  airportBtnRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  airportBtn: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  airportBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
