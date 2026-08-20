import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList } from '../../types';
import { guideRoutes } from '../../data/guideRoutes';
import { systemRoutes } from '../../data/systemRoutes';
import { getGuideById } from '../../data/guides';
import { formatPrice, formatDays } from '../../utils/formatters';
import { useFavoriteStore } from '../../store/useFavoriteStore';

type Nav = NativeStackNavigationProp<ExploreStackParamList, 'PresetRouteList'>;

export default function PresetRouteListScreen() {
  const navigation = useNavigation<Nav>();
  const [activeTab, setActiveTab] = useState<'guide' | 'system'>('guide');
  const { favoriteRouteIds, toggleFavoriteRoute } = useFavoriteStore();

  const listData: any[] = activeTab === 'guide' ? guideRoutes : systemRoutes;

  return (
    <View style={styles.container}>
      {/* Tab Switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'guide' && styles.tabActive]}
          onPress={() => setActiveTab('guide')}
        >
          <Ionicons name="people" size={16} color={activeTab === 'guide' ? '#FFF' : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'guide' && styles.tabTextActive]}>
            导游路线 ({guideRoutes.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'system' && styles.tabActive]}
          onPress={() => setActiveTab('system')}
        >
          <Ionicons name="compass" size={16} color={activeTab === 'system' ? '#FFF' : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'system' && styles.tabTextActive]}>
            系统推荐 ({systemRoutes.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }: { item: any }) => {
          const isGuide = 'guideId' in item;
          const guide = isGuide ? getGuideById((item as any).guideId) : null;
          const price = isGuide ? (item as any).totalFlatPrice : null;
          const rating = isGuide ? (item as any).rating : null;
          const days = item.durationDays;

          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate('PresetRouteDetail', {
                  routeId: item.id,
                  routeType: isGuide ? 'guide' : 'system',
                })
              }
            >
              <Image
                source={{ uri: isGuide ? (item as any).coverImage : (item as any).coverImage }}
                style={styles.cardImage}
              />
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>{formatDays(days)}</Text>
              </View>
              <TouchableOpacity
                style={{ position: 'absolute', top: spacing.sm, right: spacing.sm, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 15, width: 30, height: 30, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => toggleFavoriteRoute(item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={favoriteRouteIds.includes(item.id) ? 'heart' : 'heart-outline'} size={16} color={favoriteRouteIds.includes(item.id) ? colors.priceRed : '#FFF'} />
              </TouchableOpacity>
              <View style={styles.cardBody}>
                <Text style={typography.h3} numberOfLines={1}>{item.title}</Text>
                <Text style={[typography.bodySmall, { marginTop: 4 }]} numberOfLines={2}>
                  {item.description}
                </Text>
                <View style={styles.cardFooter}>
                  {guide && (
                    <View style={styles.guideInfo}>
                      <Ionicons name="person-circle" size={16} color={colors.accent} />
                      <Text style={[typography.caption, { color: colors.accent }]}>{guide.name}</Text>
                    </View>
                  )}
                  {!isGuide && (
                    <View style={styles.difficultyBadge}>
                      <Text style={styles.difficultyText}>
                        {(item as any).difficulty === 'easy' ? '轻松' : '适中'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.priceRow}>
                    {rating != null && (
                      <View style={styles.ratingSmall}>
                        <Ionicons name="star" size={11} color={colors.warningYellow} />
                        <Text style={{ fontSize: 12, color: colors.textPrimary }}>{rating.toFixed(1)}</Text>
                      </View>
                    )}
                    {price != null && (
                      <Text style={typography.priceSmall}>{formatPrice(price)}</Text>
                    )}
                  </View>
                </View>
                {/* Tags */}
                <View style={styles.tagRow}>
                  {item.tags.slice(0, 3).map((tag: string) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                  {isGuide && (item as any).busTransport && (
                    <View style={styles.busBadge}>
                      <Ionicons name="bus" size={11} color={colors.transport} />
                      <Text style={styles.busBadgeText}>大巴接送</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: '#FFF',
  },
  list: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadow.medium,
  },
  cardImage: {
    width: '100%',
    height: 150,
    backgroundColor: colors.border,
  },
  dayBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  cardBody: {
    padding: spacing.lg,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  guideInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  difficultyBadge: {
    backgroundColor: `${colors.successGreen}20`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.successGreen,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ratingSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tag: {
    backgroundColor: `${colors.primary}12`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.primary,
  },
  busBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${colors.transport}15`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  busBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.transport,
  },
});
