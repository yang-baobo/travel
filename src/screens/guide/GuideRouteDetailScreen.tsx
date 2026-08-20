import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList } from '../../types';
import { getGuideRouteById } from '../../data/guideRoutes';
import { getAttractionById } from '../../data/attractions';
import { getGuideById } from '../../data/guides';
import { formatPrice, formatDays, getCategoryIcon } from '../../utils/formatters';

type RouteParams = RouteProp<ExploreStackParamList, 'GuideRouteDetail'>;

export default function GuideRouteDetailScreen() {
  const { params } = useRoute<RouteParams>();
  const route = getGuideRouteById(params.routeId);

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

  const guide = getGuideById(route.guideId);
  const mandatoryTotal = route.mandatoryCosts.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Cover */}
      <Image source={{ uri: route.coverImage }} style={styles.coverImage} />
      <View style={styles.dayBadge}>
        <Text style={styles.dayBadgeText}>{formatDays(route.durationDays)}</Text>
      </View>

      {/* Header */}
      <View style={styles.mainInfo}>
        <Text style={typography.h1}>{route.title}</Text>
        <Text style={[typography.body, { marginTop: spacing.sm, color: colors.textSecondary }]}>
          {route.description}
        </Text>

        {/* Rating & Price */}
        <View style={styles.metaRow}>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={13} color="#FFF" />
            <Text style={styles.ratingText}>{route.rating.toFixed(1)}</Text>
          </View>
          <Text style={typography.caption}>{route.reviewCount}条评价</Text>
          <Text style={typography.caption}>最多{route.maxGroupSize}人</Text>
          <Text style={typography.price}>{formatPrice(route.totalFlatPrice)}</Text>
        </View>

        {/* Tags */}
        <View style={styles.tagRow}>
          {route.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {/* Guide info */}
        {guide && (
          <View style={styles.guideCard}>
            <Image source={{ uri: guide.avatar }} style={styles.guideAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>{guide.name}</Text>
              <Text style={typography.bodySmall}>
                {guide.yearsOfExperience}年经验 | {formatPrice(guide.perDayPrice)}/天
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Daily Plan */}
      <View style={styles.section}>
        <Text style={[typography.h2, { marginBottom: spacing.lg }]}>每日行程</Text>
        {route.dailyPlan.map((day) => (
          <View key={day.day} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <View style={styles.dayNumber}>
                <Text style={styles.dayNumberText}>D{day.day}</Text>
              </View>
              <Text style={[typography.body, { flex: 1 }]}>{day.description}</Text>
            </View>

            {day.attractionIds.map((aId, idx) => {
              const attraction = getAttractionById(aId);
              if (!attraction) return null;
              return (
                <View key={aId} style={styles.attractionItem}>
                  <View style={styles.dot} />
                  {idx < day.attractionIds.length - 1 && <View style={styles.line} />}
                  <Image source={{ uri: attraction.imageUrl }} style={styles.attractionThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{attraction.name}</Text>
                    <Text style={typography.caption}>
                      {attraction.estimatedDuration}小时 | {attraction.ticketPrice === 0 ? '免费' : formatPrice(attraction.ticketPrice)}
                    </Text>
                  </View>
                </View>
              );
            })}

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
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Costs */}
      <View style={styles.section}>
        <Text style={[typography.h2, { marginBottom: spacing.lg }]}>费用明细</Text>

        <Text style={[typography.h3, { marginBottom: spacing.sm, color: colors.priceRed }]}>必选项目</Text>
        {route.mandatoryCosts.map((cost) => (
          <View key={cost.id} style={styles.costRow}>
            <View style={styles.costLabel}>
              <Ionicons name={getCategoryIcon(cost.category) as any} size={14} color={colors[cost.category]} />
              <Text style={typography.body}>{cost.name}</Text>
            </View>
            <Text style={typography.body}>{formatPrice(cost.unitPrice * cost.quantity)}</Text>
          </View>
        ))}
        <View style={styles.costSubtotal}>
          <Text style={typography.bodySmall}>必选小计</Text>
          <Text style={typography.priceSmall}>{formatPrice(mandatoryTotal)}</Text>
        </View>

        {route.optionalCosts.length > 0 && (
          <>
            <Text style={[typography.h3, { marginTop: spacing.xl, marginBottom: spacing.sm, color: colors.accent }]}>
              可选项目
            </Text>
            {route.optionalCosts.map((cost) => (
              <View key={cost.id} style={styles.costRow}>
                <View style={styles.costLabel}>
                  <Ionicons name={getCategoryIcon(cost.category) as any} size={14} color={colors[cost.category]} />
                  <View>
                    <Text style={typography.body}>{cost.name}</Text>
                    {cost.description && <Text style={typography.caption}>{cost.description}</Text>}
                  </View>
                </View>
                <Text style={typography.body}>{formatPrice(cost.unitPrice * cost.quantity)}</Text>
              </View>
            ))}
          </>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningYellow,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
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
    marginTop: spacing.lg,
    ...shadow.light,
  },
  guideAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.border,
    marginRight: spacing.md,
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
  dot: {
    position: 'absolute',
    left: 0,
    top: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  line: {
    position: 'absolute',
    left: 3,
    top: 24,
    width: 2,
    height: 30,
    backgroundColor: colors.primaryLight,
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
  },
});
