import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { Order, OrderStatus, OrderStackParamList } from '../../types';
import { useOrderStore } from '../../store/useOrderStore';
import { formatPrice, formatDays } from '../../utils/formatters';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'OrderList'>;

type TabKey = 'all' | OrderStatus;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待付款' },
  { key: 'paid', label: '已付款' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${m}月${day}日 ${h}:${min}`;
}

function getStatusColor(status: OrderStatus): string {
  if (status === 'pending') return colors.warningYellow;
  if (status === 'paid') return colors.successGreen;
  if (status === 'cancelled') return colors.disabled;
  return colors.textSecondary;
}

function getStatusLabel(status: OrderStatus): string {
  if (status === 'pending') return '待付款';
  if (status === 'paid') return '已付款';
  if (status === 'cancelled') return '已取消';
  return '已完成';
}

function getRouteTypeLabel(type: string): string {
  if (type === 'custom') return '自定义';
  if (type === 'guide') return '导游路线';
  return '系统推荐';
}

/** Calculate remaining seconds for pending orders (15-min window) */
function getRemainingSeconds(createdAt: number): number {
  const elapsed = (Date.now() - createdAt) / 1000;
  return Math.max(0, 15 * 60 - Math.floor(elapsed));
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function OrderListScreen() {
  const navigation = useNavigation<Nav>();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const { orders, payOrder, completeOrder, cancelOrder } = useOrderStore();
  const [, setTick] = useState(0);

  // Tick every second to update countdown timers for pending orders
  useEffect(() => {
    const hasPending = orders.some(o => o.status === 'pending');
    if (!hasPending) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [orders]);

  const filteredOrders = activeTab === 'all'
    ? orders
    : orders.filter(o => o.status === activeTab);

  const getTabCount = (key: TabKey): number => {
    if (key === 'all') return orders.length;
    return orders.filter(o => o.status === key).length;
  };

  const handlePay = (order: Order) => {
    Alert.alert('确认付款', `确认支付 ${formatPrice(order.totalPrice)}？`, [
      { text: '取消', style: 'cancel' },
      { text: '确认', onPress: () => payOrder(order.id) },
    ]);
  };

  const handleCancel = (order: Order) => {
    Alert.alert('取消订单', '确认取消此订单吗？取消后不可恢复。', [
      { text: '返回', style: 'cancel' },
      { text: '确认取消', style: 'destructive', onPress: () => cancelOrder(order.id) },
    ]);
  };

  const handleComplete = (order: Order) => {
    Alert.alert('确认完成', '确认标记此订单为已完成？', [
      { text: '取消', style: 'cancel' },
      { text: '确认', onPress: () => completeOrder(order.id) },
    ]);
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const remaining = item.status === 'pending' ? getRemainingSeconds(item.createdAt) : 0;

    return (
      <TouchableOpacity
        style={styles.orderCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
      >
        {/* Card Header */}
        <View style={styles.orderHeader}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[typography.caption, { color: getStatusColor(item.status), fontWeight: '600' }]}>
            {getStatusLabel(item.status)}
          </Text>
          {item.status === 'pending' && remaining > 0 && (
            <View style={styles.countdownBadge}>
              <Ionicons name="time-outline" size={11} color={colors.priceRed} />
              <Text style={styles.countdownText}>{formatCountdown(remaining)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={typography.caption}>{formatTime(item.createdAt)}</Text>
        </View>

        {/* Order Info */}
        <Text style={[typography.h3, { marginTop: spacing.md }]} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.orderMeta}>
          <View style={styles.metaChip}>
            <Ionicons name="map-outline" size={12} color={colors.primary} />
            <Text style={styles.metaText}>{getRouteTypeLabel(item.routeType)}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={12} color={colors.accent} />
            <Text style={styles.metaText}>{formatDays(item.durationDays)}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="location-outline" size={12} color={colors.successGreen} />
            <Text style={styles.metaText}>{item.attractionIds.length}景点</Text>
          </View>
          {item.groupSize > 1 && (
            <View style={styles.metaChip}>
              <Ionicons name="people-outline" size={12} color={colors.warningYellow} />
              <Text style={styles.metaText}>{item.groupSize}人</Text>
            </View>
          )}
        </View>

        {/* Price & Action */}
        <View style={styles.orderFooter}>
          <View>
            <Text style={typography.caption}>订单金额</Text>
            <Text style={typography.price}>{formatPrice(item.totalPrice)}</Text>
          </View>
          {item.status === 'pending' && (
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => handleCancel(item)} style={styles.cancelBtn} activeOpacity={0.7}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handlePay(item)} activeOpacity={0.8}>
                <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtn}>
                  <Text style={styles.actionBtnText}>立即付款</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
          {item.status === 'paid' && (
            <TouchableOpacity onPress={() => handleComplete(item)} activeOpacity={0.8} style={styles.completeBtn}>
              <Text style={styles.completeBtnText}>确认完成</Text>
            </TouchableOpacity>
          )}
          {item.status === 'completed' && item.paidAt && (
            <Text style={[typography.caption, { color: colors.successGreen }]}>
              已于 {formatTime(item.paidAt)} 付款
            </Text>
          )}
          {item.status === 'cancelled' && (
            <Text style={[typography.caption, { color: colors.disabled }]}>
              订单已取消
            </Text>
          )}
        </View>

        {/* Order ID */}
        <Text style={[typography.caption, { marginTop: spacing.sm, color: colors.disabled }]}>
          {item.id}
        </Text>
        <View style={styles.detailHint}>
          <Text style={[typography.caption, { color: colors.primary }]}>查看详情</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </View>
      </TouchableOpacity>
    );
  };

  const activeTabLabel = TABS.find(t => t.key === activeTab)?.label || '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={colors.gradient} style={styles.header}>
        <Text style={styles.headerTitle}>我的订单</Text>
        <Text style={styles.headerSubtitle}>共 {orders.length} 笔订单</Text>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const count = getTabCount(tab.key);
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <View style={[styles.badge, isActive && styles.badgeActive]}>
                  <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Order List */}
      <FlatList
        data={filteredOrders}
        keyExtractor={item => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={56} color={colors.disabled} />
            <Text style={[typography.h3, { color: colors.textSecondary, marginTop: spacing.lg }]}>
              暂无{activeTabLabel}订单
            </Text>
            <Text style={[typography.bodySmall, { textAlign: 'center', marginTop: spacing.sm }]}>
              选择路线后下单，订单会出现在这里
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    gap: 3,
  },
  tabActive: {
    backgroundColor: `${colors.primary}18`,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: colors.border,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeActive: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  badgeTextActive: {
    color: '#FFF',
  },
  listContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadow.light,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${colors.priceRed}10`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.priceRed,
  },
  orderMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.disabled,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  completeBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.successGreen,
  },
  completeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.successGreen,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl * 2,
    paddingHorizontal: spacing.xxxl,
  },
  detailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
});
