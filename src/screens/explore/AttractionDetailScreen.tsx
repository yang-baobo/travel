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
import { ExploreStackParamList } from '../../types';
import { getAttractionById } from '../../data/attractions';
import { getRoutesByAttractionId } from '../../data/guideRoutes';
import { getGuideById } from '../../data/guides';
import { useRouteStore } from '../../store/useRouteStore';
import { useFavoriteStore } from '../../store/useFavoriteStore';
import { formatPrice, formatDuration, getZoneName } from '../../utils/formatters';

type RouteParams = RouteProp<ExploreStackParamList, 'AttractionDetail'>;

export default function AttractionDetailScreen() {
  const { params } = useRoute<RouteParams>();
  const navigation = useNavigation();
  const attraction = getAttractionById(params.attractionId);
  const { addStop, removeStop, routeStops } = useRouteStore();
  const { favoriteAttractionIds, toggleFavoriteAttraction } = useFavoriteStore();
  const isFav = favoriteAttractionIds.includes(params.attractionId);

  if (!attraction) {
    return (
      <View style={styles.container}>
        <Text style={typography.body}>景点未找到</Text>
      </View>
    );
  }

  const relatedRoutes = getRoutesByAttractionId(attraction.id);
  const isInRoute = routeStops.some(s => s.attractionId === attraction.id);

  const handleToggleRoute = () => {
    if (isInRoute) {
      removeStop(attraction.id);
    } else {
      addStop({
        attractionId: attraction.id,
        order: routeStops.length,
        day: 1,
        arrivalTime: '09:00',
        stayDuration: attraction.estimatedDuration * 60,
        transportToNext: null,
      });
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View>
          <Image source={{ uri: attraction.imageUrl }} style={styles.heroImage} />
          <TouchableOpacity
            style={styles.favBtn}
            onPress={() => toggleFavoriteAttraction(attraction.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={22} color={isFav ? colors.priceRed : '#FFF'} />
          </TouchableOpacity>
        </View>

        {/* Main Info */}
        <View style={styles.mainInfo}>
          <View style={styles.titleRow}>
            <Text style={[typography.h1, { flex: 1 }]}>{attraction.name}</Text>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={14} color="#FFF" />
              <Text style={styles.ratingText}>{attraction.rating.toFixed(1)}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={15} color={colors.accent} />
              <Text style={typography.bodySmall}>{getZoneName(attraction.zone)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={15} color={colors.primary} />
              <Text style={typography.bodySmall}>{formatDuration(attraction.estimatedDuration * 60)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="pricetag-outline" size={15} color={colors.priceRed} />
              <Text style={[typography.bodySmall, { color: colors.priceRed }]}>
                {attraction.ticketPrice === 0 ? '免费' : formatPrice(attraction.ticketPrice)}
              </Text>
            </View>
          </View>

          {/* Tags */}
          <View style={styles.tagRow}>
            {attraction.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Description */}
          <Text style={[typography.body, { marginTop: spacing.lg }]}>
            {attraction.description}
          </Text>

          {/* Info Cards */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="time" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={typography.bodySmall}>开放时间</Text>
                <Text style={typography.body}>{attraction.openingHours}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="navigate" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={typography.bodySmall}>地址</Text>
                <Text style={typography.body}>{attraction.location.address}</Text>
              </View>
            </View>
          </View>

          {/* Related Guide Routes */}
          {relatedRoutes.length > 0 && (
            <View style={styles.relatedSection}>
              <Text style={[typography.h3, { marginBottom: spacing.md }]}>
                包含此景点的导游路线
              </Text>
              {relatedRoutes.map((route) => {
                const guide = getGuideById(route.guideId);
                return (
                  <View key={route.id} style={styles.relatedCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={typography.body} numberOfLines={1}>{route.title}</Text>
                      <Text style={typography.bodySmall}>
                        {guide?.name} | {route.durationDays}天 | {formatPrice(route.totalFlatPrice)}
                      </Text>
                    </View>
                    <View style={styles.relatedRating}>
                      <Ionicons name="star" size={11} color={colors.warningYellow} />
                      <Text style={[typography.caption, { color: colors.textPrimary }]}>
                        {route.rating.toFixed(1)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 80 }} />
        </View>
      </ScrollView>

      {/* Floating Add to Route Button */}
      <View style={styles.floatingBar}>
        <TouchableOpacity
          style={[styles.floatingBtn, isInRoute && styles.floatingBtnActive]}
          onPress={handleToggleRoute}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isInRoute ? 'checkmark-circle' : 'add-circle'}
            size={22}
            color="#FFF"
          />
          <Text style={styles.floatingBtnText}>
            {isInRoute ? '已加入自定义路线' : '加入自定义路线'}
          </Text>
          {routeStops.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{routeStops.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        {routeStops.length > 0 && (
          <TouchableOpacity
            style={styles.goCustomFloatBtn}
            activeOpacity={0.8}
            onPress={() => {
              const parent = navigation.getParent();
              if (parent) {
                parent.navigate('自定义');
              }
            }}
          >
            <Ionicons name="navigate" size={18} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  heroImage: {
    width: '100%',
    height: 240,
  },
  favBtn: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
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
    backgroundColor: colors.primary,
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
  relatedSection: {
    marginTop: spacing.xxl,
  },
  relatedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    ...shadow.light,
  },
  relatedRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
    backgroundColor: 'rgba(255,245,247,0.95)',
  },
  floatingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
  },
  floatingBtnActive: {
    backgroundColor: colors.successGreen,
  },
  floatingBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  goCustomFloatBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
});
