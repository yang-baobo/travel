import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
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
import { CostItem, CustomStackParamList } from '../../types';
import { useCartStore } from '../../store/useCartStore';
import { useRouteStore } from '../../store/useRouteStore';
import { formatPrice, formatDays, getCategoryName, getCategoryIcon } from '../../utils/formatters';

type Nav = NativeStackNavigationProp<CustomStackParamList, 'Cart'>;

export default function CartScreen() {
  const navigation = useNavigation<Nav>();
  const {
    items,
    toggleItem,
    removeItem,
    getTotalPrice,
    getCategorySummary,
    groupSize,
    getPerPersonTotal,
    routeInfo,
  } = useCartStore();
  const routeStops = useRouteStore(s => s.routeStops);

  const total = getTotalPrice();
  const perPerson = getPerPersonTotal();
  const summary = getCategorySummary();
  const hasItems = items.length > 0;

  const handleSettlement = () => {
    if (!hasItems) {
      Alert.alert('提示', '购物车为空，请先添加费用项目');
      return;
    }
    const attractionIds = routeInfo?.attractionIds ?? routeStops.map(s => s.attractionId);
    const durationDays = routeInfo?.durationDays ?? useRouteStore.getState().travelDays;
    navigation.navigate('Settlement', {
      orderTitle: routeInfo?.title ?? '自定义路线',
      routeType: 'custom',
      totalPrice: total,
      durationDays,
      attractionIds,
      guideId: routeInfo?.guideId,
      restaurantIds: routeInfo?.restaurantIds,
    });
  };

  const renderItem = ({ item }: { item: CostItem }) => (
    <View style={styles.itemCard}>
      <TouchableOpacity
        style={styles.checkbox}
        onPress={() => !item.mandatory && toggleItem(item.id)}
        disabled={item.mandatory}
      >
        <Ionicons
          name={item.selected ? 'checkbox' : 'square-outline'}
          size={22}
          color={item.selected ? colors.primary : colors.disabled}
        />
      </TouchableOpacity>
      <View style={styles.itemBody}>
        <View style={styles.itemHeader}>
          <View style={styles.categoryBadge}>
            <Ionicons
              name={getCategoryIcon(item.category) as any}
              size={12}
              color={colors[item.category]}
            />
            <Text style={[styles.categoryText, { color: colors[item.category] }]}>
              {getCategoryName(item.category)}
            </Text>
          </View>
          {item.mandatory && (
            <View style={styles.mandatoryBadge}>
              <Text style={styles.mandatoryText}>必选</Text>
            </View>
          )}
        </View>
        <Text style={typography.body} numberOfLines={1}>{item.name}</Text>
        <Text style={[typography.priceSmall, { marginTop: 2 }]}>
          {formatPrice(item.unitPrice)} x {item.quantity}
        </Text>
      </View>
      {!item.mandatory && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => removeItem(item.id)}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cart-outline" size={64} color={colors.disabled} />
      <Text style={[typography.h3, { color: colors.textSecondary, marginTop: spacing.lg }]}>
        费用清单为空
      </Text>
      <Text style={[typography.bodySmall, { textAlign: 'center', marginTop: spacing.sm }]}>
        选择路线或添加景点后，费用项目会自动出现在这里
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={colors.gradient} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ position: 'absolute', left: spacing.md, top: spacing.md, zIndex: 1, padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>费用管理</Text>
        <Text style={styles.headerSubtitle}>
          {hasItems ? `${items.length}个项目` : '尚未添加项目'}
        </Text>
      </LinearGradient>

      {/* Route info banner */}
      {routeInfo && (
        <View style={styles.routeInfoBanner}>
          <Ionicons name="map-outline" size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySmall, { fontWeight: '600' }]} numberOfLines={1}>
              {routeInfo.title}
            </Text>
            <Text style={typography.caption}>
              {routeInfo.routeType === 'guide' ? '导游路线' : '系统推荐'} · {formatDays(routeInfo.durationDays)} · {groupSize}人
            </Text>
          </View>
          <View style={styles.routeTypeBadge}>
            <Text style={styles.routeTypeBadgeText}>
              {routeInfo.routeType === 'guide' ? '导游' : '系统'}
            </Text>
          </View>
        </View>
      )}

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={hasItems ? styles.list : styles.emptyList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          hasItems ? (
            <View style={styles.summarySection}>
              {/* Category Summary */}
              <Text style={[typography.h3, { marginBottom: spacing.md }]}>费用分类</Text>
              {summary.map((cat) => (
                <View key={cat.category} style={styles.summaryRow}>
                  <View style={styles.summaryLabel}>
                    <View style={[styles.summaryDot, { backgroundColor: colors[cat.category] }]} />
                    <Text style={typography.body}>{getCategoryName(cat.category)}</Text>
                  </View>
                  <Text style={typography.body}>{formatPrice(cat.total)}</Text>
                </View>
              ))}
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={typography.h3}>总计</Text>
                <Text style={typography.price}>{formatPrice(total)}</Text>
              </View>
              {groupSize > 1 && (
                <View style={styles.perPersonRow}>
                  <Text style={typography.bodySmall}>人均 ({groupSize}人)</Text>
                  <Text style={[typography.priceSmall, { fontSize: 15 }]}>
                    {formatPrice(perPerson)}
                  </Text>
                </View>
              )}
              <View style={{ height: 80 }} />
            </View>
          ) : null
        }
      />

      {/* Bottom settlement bar */}
      {hasItems && (
        <View style={styles.settleBar}>
          <View>
            <Text style={typography.caption}>
              {groupSize > 1 ? `${groupSize}人 · 人均${formatPrice(perPerson)}` : '合计'}
            </Text>
            <Text style={typography.price}>{formatPrice(total)}</Text>
          </View>
          <TouchableOpacity onPress={handleSettlement} activeOpacity={0.8}>
            <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.settleBtn}>
              <Text style={styles.settleBtnText}>去结算</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
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
  routeInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: `${colors.primary}08`,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
    borderRadius: borderRadius.md,
  },
  routeTypeBadge: {
    backgroundColor: `${colors.primary}18`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  routeTypeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingTop: 60,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadow.light,
  },
  checkbox: {
    marginRight: spacing.md,
  },
  itemBody: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '500',
  },
  mandatoryBadge: {
    backgroundColor: `${colors.priceRed}15`,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  mandatoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.priceRed,
  },
  deleteBtn: {
    padding: spacing.sm,
  },
  summarySection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.xxxl,
    ...shadow.light,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  perPersonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
});
