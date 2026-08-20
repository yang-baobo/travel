import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { OrderStackParamList, OrderStatus } from '../../types';
import { useOrderStore } from '../../store/useOrderStore';
import { getAttractionById } from '../../data/attractions';
import { getGuideById } from '../../data/guides';
import { getHotelById } from '../../data/hotels';
import { getRestaurantById } from '../../data/restaurants';
import { formatPrice, formatDays, getZoneName, getHotelLevelName } from '../../utils/formatters';

type RouteParams = RouteProp<OrderStackParamList, 'OrderDetail'>;
type Nav = NativeStackNavigationProp<OrderStackParamList, 'OrderDetail'>;

function formatFullTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function getStatusLabel(status: OrderStatus): string {
  if (status === 'pending') return '待付款';
  if (status === 'paid') return '已付款';
  if (status === 'cancelled') return '已取消';
  return '已完成';
}

function getRouteTypeLabel(type: string): string {
  if (type === 'custom') return '自定义路线';
  if (type === 'guide') return '导游路线';
  return '系统推荐路线';
}

export default function OrderDetailScreen() {
  const { params } = useRoute<RouteParams>();
  const navigation = useNavigation<Nav>();
  const { orders, payOrder, cancelOrder, completeOrder } = useOrderStore();
  const order = orders.find(o => o.id === params.orderId);

  if (!order) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="alert-circle" size={48} color={colors.disabled} />
          <Text style={[typography.h3, { marginTop: spacing.md }]}>订单未找到</Text>
        </View>
      </View>
    );
  }

  const attractions = order.attractionIds.map(id => getAttractionById(id)).filter(Boolean);
  const guide = order.guideId ? getGuideById(order.guideId) : null;
  const hotel = order.hotelId ? getHotelById(order.hotelId) : null;
  const restaurantList = (order.restaurantIds || []).map(id => getRestaurantById(id)).filter(Boolean);

  // 按天分组景点
  const perDay = Math.max(1, Math.ceil(attractions.length / order.durationDays));
  const dailyAttractions: (typeof attractions)[] = [];
  for (let d = 0; d < order.durationDays; d++) {
    dailyAttractions.push(attractions.slice(d * perDay, (d + 1) * perDay));
  }

  // 费用估算
  const ticketTotal = attractions.reduce((s, a) => s + (a?.ticketPrice || 0), 0) * order.groupSize;
  const hotelTotal = hotel ? hotel.pricePerNight * Math.max(1, order.durationDays - 1) : 0;
  const restaurantTotal = restaurantList.reduce((s, r) => s + (r?.pricePerPerson || 0), 0) * order.groupSize;
  const guideTotal = guide ? guide.perDayPrice * order.durationDays : 0;

  const canNavigateRoute = order.routeId && order.routeType !== 'custom';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* 订单状态卡 */}
        <LinearGradient
          colors={order.status === 'paid' || order.status === 'completed'
            ? [colors.successGreen, '#4CAF50'] : order.status === 'pending'
              ? [colors.warningYellow, '#FFA726'] : [colors.disabled, '#9E9E9E']}
          style={styles.statusCard}
        >
          <Ionicons
            name={order.status === 'paid' || order.status === 'completed' ? 'checkmark-circle' : order.status === 'pending' ? 'time' : 'close-circle'}
            size={32}
            color="#FFF"
          />
          <Text style={styles.statusTitle}>{getStatusLabel(order.status)}</Text>
          <Text style={styles.statusPrice}>{formatPrice(order.totalPrice)}</Text>
        </LinearGradient>

        {/* 订单信息 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text style={typography.h3}>订单信息</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>订单编号</Text>
            <Text style={[styles.infoValue, { fontSize: 11 }]}>{order.id}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>订单名称</Text>
            <Text style={styles.infoValue} numberOfLines={2}>{order.title}</Text>
          </View>
          {/* 路线类型行 - 可点击跳转路线详情 */}
          {canNavigateRoute ? (
            <TouchableOpacity
              style={styles.infoRow}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('PresetRouteDetail', {
                routeId: order.routeId!,
                routeType: order.routeType as 'guide' | 'system',
              })}
            >
              <Text style={styles.infoLabel}>路线类型</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{getRouteTypeLabel(order.routeType)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>路线类型</Text>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{getRouteTypeLabel(order.routeType)}</Text>
              </View>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>下单时间</Text>
            <Text style={styles.infoValue}>{formatFullTime(order.createdAt)}</Text>
          </View>
          {order.paidAt && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>付款时间</Text>
              <Text style={[styles.infoValue, { color: colors.successGreen }]}>{formatFullTime(order.paidAt)}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>游玩天数</Text>
            <Text style={styles.infoValue}>{formatDays(order.durationDays)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>出行人数</Text>
            <Text style={styles.infoValue}>{order.groupSize}人</Text>
          </View>
        </View>

        {/* 导游信息 - 可点击 */}
        {guide && (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('GuideDetail', { guideId: order.guideId! })}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="person-outline" size={18} color={colors.accent} />
              <Text style={[typography.h3, { flex: 1 }]}>导游信息</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>导游姓名</Text>
              <Text style={styles.infoValue}>{guide.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>从业经验</Text>
              <Text style={styles.infoValue}>{guide.yearsOfExperience}年</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>语言</Text>
              <Text style={styles.infoValue}>{guide.languages.join(' / ')}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>评分</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={14} color={colors.warningYellow} />
                <Text style={styles.infoValue}>{guide.rating.toFixed(1)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* 行程内容 - 景点可点击 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="map-outline" size={18} color={colors.primary} />
            <Text style={typography.h3}>行程内容</Text>
            <Text style={[typography.caption, { marginLeft: 'auto' }]}>{attractions.length}个景点</Text>
          </View>
          {dailyAttractions.map((dayAttrs, dayIdx) => (
            <View key={dayIdx}>
              <View style={styles.dayHeader}>
                <View style={styles.dayBadge}>
                  <Text style={styles.dayBadgeText}>D{dayIdx + 1}</Text>
                </View>
                <Text style={[typography.bodySmall, { fontWeight: '600' }]}>第{dayIdx + 1}天</Text>
              </View>
              {dayAttrs.map((attr, idx) => {
                if (!attr) return null;
                return (
                  <TouchableOpacity
                    key={attr.id}
                    style={styles.attrRow}
                    activeOpacity={0.6}
                    onPress={() => navigation.navigate('AttractionDetail', { attractionId: attr.id })}
                  >
                    <View style={styles.attrDot}>
                      <Text style={styles.attrDotText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={typography.body}>{attr.name}</Text>
                      <Text style={typography.caption}>
                        {getZoneName(attr.zone)} | {attr.estimatedDuration}小时 | {attr.ticketPrice === 0 ? '免费' : formatPrice(attr.ticketPrice)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* 酒店信息 - 可点击 */}
        {hotel && (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('HotelDetail', { hotelId: order.hotelId! })}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="bed-outline" size={18} color={colors.hotel} />
              <Text style={[typography.h3, { flex: 1 }]}>酒店信息</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>酒店名称</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{hotel.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>区域</Text>
              <Text style={styles.infoValue}>{getZoneName(hotel.zone)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>档次</Text>
              <Text style={styles.infoValue}>{getHotelLevelName(hotel.level)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>价格</Text>
              <Text style={[styles.infoValue, { color: colors.priceRed }]}>{formatPrice(hotel.pricePerNight)}/晚</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>评分</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={14} color={colors.warningYellow} />
                <Text style={styles.infoValue}>{hotel.rating.toFixed(1)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* 餐厅信息 - 每家可点击 */}
        {restaurantList.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="restaurant-outline" size={18} color={colors.food} />
              <Text style={typography.h3}>餐厅信息</Text>
              <Text style={[typography.caption, { marginLeft: 'auto' }]}>{restaurantList.length}家</Text>
            </View>
            {restaurantList.map((rest) => {
              if (!rest) return null;
              return (
                <TouchableOpacity
                  key={rest.id}
                  style={styles.restaurantRow}
                  activeOpacity={0.6}
                  onPress={() => navigation.navigate('RestaurantDetail', { restaurantId: rest.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{rest.name}</Text>
                    <Text style={typography.caption}>
                      {rest.cuisineType} | 人均{formatPrice(rest.pricePerPerson)} | {getZoneName(rest.zone)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* 费用明细 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="wallet-outline" size={18} color={colors.priceRed} />
            <Text style={typography.h3}>费用明细</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>景点门票</Text>
            <Text style={styles.infoValue}>{formatPrice(ticketTotal)}</Text>
          </View>
          {hotelTotal > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>酒店住宿</Text>
              <Text style={styles.infoValue}>{formatPrice(hotelTotal)}</Text>
            </View>
          )}
          {restaurantTotal > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>餐饮费用</Text>
              <Text style={styles.infoValue}>{formatPrice(restaurantTotal)}</Text>
            </View>
          )}
          {guideTotal > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>导游费用</Text>
              <Text style={styles.infoValue}>{formatPrice(guideTotal)}</Text>
            </View>
          )}
          <View style={[styles.infoRow, { borderBottomWidth: 0, paddingTop: spacing.md }]}>
            <Text style={[typography.h3, { color: colors.priceRed }]}>订单总价</Text>
            <Text style={typography.price}>{formatPrice(order.totalPrice)}</Text>
          </View>
        </View>

        {/* 操作按钮 */}
        {order.status === 'pending' && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => Alert.alert('取消订单', '确认取消此订单吗？', [
                { text: '返回', style: 'cancel' },
                { text: '确认取消', style: 'destructive', onPress: () => cancelOrder(order.id) },
              ])}
            >
              <Text style={styles.cancelBtnText}>取消订单</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => Alert.alert('确认付款', `确认支付 ${formatPrice(order.totalPrice)}？`, [
                { text: '取消', style: 'cancel' },
                { text: '确认', onPress: () => payOrder(order.id) },
              ])}
            >
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.payBtn}>
                <Text style={styles.payBtnText}>立即付款</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
        {order.status === 'paid' && (
          <TouchableOpacity
            style={styles.completeBtn}
            onPress={() => Alert.alert('确认完成', '确认标记为已完成？', [
              { text: '取消', style: 'cancel' },
              { text: '确认', onPress: () => completeOrder(order.id) },
            ])}
          >
            <Text style={styles.completeBtnText}>确认完成</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  statusPrice: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFF',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadow.light,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  typeBadge: {
    backgroundColor: `${colors.primary}18`,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  dayBadge: {
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  attrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.xxxl,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  attrDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attrDotText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
  },
  cancelBtn: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.disabled,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  payBtn: {
    paddingHorizontal: spacing.xxxl,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
  },
  payBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  completeBtn: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.successGreen,
  },
  completeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.successGreen,
  },
});
