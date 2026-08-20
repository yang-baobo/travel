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
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { getRestaurantById } from '../../data/restaurants';
import { getAttractionById } from '../../data/attractions';
import { formatPrice, getZoneName } from '../../utils/formatters';

type RouteParams = RouteProp<{ RestaurantDetail: { restaurantId: string } }, 'RestaurantDetail'>;

const mealTypeLabels: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
};

export default function RestaurantDetailScreen() {
  const { params } = useRoute<RouteParams>();
  const navigation = useNavigation<any>();
  const restaurant = getRestaurantById(params.restaurantId);

  if (!restaurant) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="alert-circle" size={48} color={colors.disabled} />
          <Text style={[typography.h3, { marginTop: spacing.md }]}>餐厅未找到</Text>
        </View>
      </View>
    );
  }

  const nearbyAttractions = restaurant.nearbyAttractions
    .map(id => getAttractionById(id))
    .filter(Boolean);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <Image source={{ uri: restaurant.imageUrl }} style={styles.heroImage} />

        {/* Main Info */}
        <View style={styles.mainInfo}>
          <View style={styles.titleRow}>
            <Text style={[typography.h1, { flex: 1 }]}>{restaurant.name}</Text>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={14} color="#FFF" />
              <Text style={styles.ratingText}>{restaurant.rating.toFixed(1)}</Text>
            </View>
          </View>

          {/* Meta Row */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={15} color={colors.accent} />
              <Text style={typography.bodySmall}>{getZoneName(restaurant.zone)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="restaurant-outline" size={15} color={colors.food} />
              <Text style={typography.bodySmall}>{restaurant.cuisineType}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="pricetag-outline" size={15} color={colors.priceRed} />
              <Text style={[typography.bodySmall, { color: colors.priceRed }]}>
                人均{formatPrice(restaurant.pricePerPerson)}
              </Text>
            </View>
          </View>

          {/* Tags */}
          <View style={styles.tagRow}>
            {restaurant.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Meal Types */}
          <View style={[styles.tagRow, { marginTop: spacing.sm }]}>
            {restaurant.mealTypes.map((meal) => (
              <View key={meal} style={styles.mealBadge}>
                <Text style={styles.mealBadgeText}>{mealTypeLabels[meal] || meal}</Text>
              </View>
            ))}
          </View>

          {/* Description */}
          <Text style={[typography.body, { marginTop: spacing.lg }]}>
            {restaurant.description}
          </Text>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="time" size={18} color={colors.food} />
              <View style={{ flex: 1 }}>
                <Text style={typography.bodySmall}>营业时间</Text>
                <Text style={typography.body}>{restaurant.openingHours}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="navigate" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={typography.bodySmall}>地址</Text>
                <Text style={typography.body}>{restaurant.location.address}</Text>
              </View>
            </View>
            {restaurant.groupMealPrice != null && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Ionicons name="people" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={typography.bodySmall}>团餐价格</Text>
                    <Text style={[typography.body, { color: colors.priceRed }]}>
                      {formatPrice(restaurant.groupMealPrice)}/人
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Nearby Attractions */}
          {nearbyAttractions.length > 0 && (
            <View style={styles.section}>
              <Text style={[typography.h3, { marginBottom: spacing.md }]}>附近景点</Text>
              {nearbyAttractions.map((attr) => {
                if (!attr) return null;
                return (
                  <TouchableOpacity
                    key={attr.id}
                    style={styles.nearbyCard}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('AttractionDetail', { attractionId: attr.id })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={typography.body}>{attr.name}</Text>
                      <Text style={typography.caption}>
                        {getZoneName(attr.zone)} | {attr.ticketPrice === 0 ? '免费' : formatPrice(attr.ticketPrice)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={{ height: spacing.xxxl }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImage: {
    width: '100%',
    height: 240,
    backgroundColor: colors.border,
  },
  mainInfo: {
    padding: spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.food,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tag: {
    backgroundColor: `${colors.food}15`,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.food,
  },
  mealBadge: {
    backgroundColor: `${colors.primary}15`,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  mealBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    ...shadow.light,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  section: {
    marginTop: spacing.xxl,
  },
  nearbyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    ...shadow.light,
  },
});
