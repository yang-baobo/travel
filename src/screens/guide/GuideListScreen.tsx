import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList, Guide } from '../../types';
import { guides, getGuidesWithRoutes, getFreelanceGuides } from '../../data/guides';
import { getRoutesByGuideId } from '../../data/guideRoutes';
import { formatPrice } from '../../utils/formatters';
import { useFavoriteStore } from '../../store/useFavoriteStore';
import { useRouteStore } from '../../store/useRouteStore';

type Nav = NativeStackNavigationProp<ExploreStackParamList, 'GuideList'>;

export default function GuideListScreen() {
  const navigation = useNavigation<Nav>();
  const [filter, setFilter] = useState<'all' | 'withRoutes' | 'freelance' | 'favorites'>('all');
  const { favoriteGuideIds, toggleFavoriteGuide } = useFavoriteStore();
  const { routeStops } = useRouteStore();

  const filtered = filter === 'all'
    ? guides
    : filter === 'withRoutes'
      ? getGuidesWithRoutes()
      : filter === 'freelance'
        ? getFreelanceGuides()
        : guides.filter(g => favoriteGuideIds.includes(g.id));

  const renderGuide = ({ item }: { item: Guide }) => {
    const routeCount = getRoutesByGuideId(item.id).length;
    const isFav = favoriteGuideIds.includes(item.id);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('GuideDetail', { guideId: item.id })}
      >
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={typography.h3}>{item.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <TouchableOpacity onPress={() => toggleFavoriteGuide(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? colors.priceRed : colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={11} color="#FFF" />
                <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
              </View>
            </View>
          </View>
          <Text style={[typography.bodySmall, { marginTop: 2 }]} numberOfLines={2}>
            {item.description}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="briefcase-outline" size={13} color={colors.accent} />
              <Text style={typography.caption}>{item.yearsOfExperience}年经验</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="globe-outline" size={13} color={colors.primary} />
              <Text style={typography.caption}>{item.languages.join('/')}</Text>
            </View>
            {routeCount > 0 && (
              <View style={styles.metaItem}>
                <Ionicons name="map-outline" size={13} color={colors.successGreen} />
                <Text style={typography.caption}>{routeCount}条路线</Text>
              </View>
            )}
          </View>
          <View style={styles.cardFooter}>
            <View style={styles.specialtyRow}>
              {item.specialtyAreas.slice(0, 2).map((area) => (
                <View key={area} style={styles.tag}>
                  <Text style={styles.tagText}>{area}</Text>
                </View>
              ))}
            </View>
            <Text style={typography.priceSmall}>{formatPrice(item.perDayPrice)}/天</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={colors.gradient} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ position: 'absolute', left: spacing.md, top: spacing.md, zIndex: 1, padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>找导游</Text>
        <Text style={styles.headerSubtitle}>专业导游，省心之选</Text>
      </LinearGradient>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {[
          { key: 'all', label: '全部' },
          { key: 'withRoutes', label: '有路线' },
          { key: 'freelance', label: '自由导游' },
          { key: 'favorites', label: '我的收藏' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterChip, filter === tab.key && styles.filterChipActive]}
            onPress={() => setFilter(tab.key as any)}
          >
            <Text style={[styles.filterText, filter === tab.key && styles.filterTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        renderItem={renderGuide}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* 侧边浮动"生成路线"按钮 */}
      {routeStops.length > 0 && (
        <TouchableOpacity
          style={styles.floatingBtn}
          activeOpacity={0.85}
          onPress={() => {
            const parent = navigation.getParent();
            if (parent) parent.navigate('自定义');
          }}
        >
          <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.floatingBtnGradient}>
            <Ionicons name="map-outline" size={20} color="#FFF" />
            <Text style={styles.floatingBtnText}>生成{'\n'}路线</Text>
            <View style={styles.floatingBadge}>
              <Text style={styles.floatingBadgeText}>{routeStops.length}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: '#FFF',
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadow.light,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.border,
    marginRight: spacing.md,
  },
  cardBody: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningYellow,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    gap: 2,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  specialtyRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexShrink: 1,
  },
  tag: {
    backgroundColor: `${colors.accent}15`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.accent,
  },
  // 侧边浮动按钮
  floatingBtn: { position: 'absolute', right: spacing.lg, bottom: 100, borderRadius: borderRadius.lg, ...shadow.medium },
  floatingBtnGradient: { width: 52, paddingVertical: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center', gap: 4 },
  floatingBtnText: { fontSize: 11, fontWeight: '700', color: '#FFF', textAlign: 'center', lineHeight: 14 },
  floatingBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.priceRed, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  floatingBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
});
