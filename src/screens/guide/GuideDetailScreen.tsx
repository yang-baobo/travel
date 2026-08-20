import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList } from '../../types';
import { getGuideById } from '../../data/guides';
import { getRoutesByGuideId } from '../../data/guideRoutes';
import { formatPrice, formatDays } from '../../utils/formatters';

type RouteParams = RouteProp<ExploreStackParamList, 'GuideDetail'>;
type Nav = NativeStackNavigationProp<ExploreStackParamList, 'GuideDetail'>;

export default function GuideDetailScreen() {
  const { params } = useRoute<RouteParams>();
  const navigation = useNavigation<Nav>();
  const guide = getGuideById(params.guideId);

  if (!guide) {
    return (
      <View style={styles.container}>
        <Text style={typography.body}>导游未找到</Text>
      </View>
    );
  }

  const routes = getRoutesByGuideId(guide.id);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <Image source={{ uri: guide.avatar }} style={styles.avatar} />
        <Text style={typography.h1}>{guide.name}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={16} color={colors.warningYellow} />
          <Text style={styles.ratingNumber}>{guide.rating.toFixed(1)}</Text>
          <Text style={typography.bodySmall}>{guide.yearsOfExperience}年经验</Text>
        </View>
        <Text style={[typography.body, styles.description]}>{guide.description}</Text>
      </View>

      {/* Info Cards */}
      <View style={styles.infoGrid}>
        <View style={styles.infoCard}>
          <Ionicons name="cash-outline" size={22} color={colors.priceRed} />
          <Text style={[typography.price, { fontSize: 16 }]}>{formatPrice(guide.perDayPrice)}</Text>
          <Text style={typography.caption}>每天</Text>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="globe-outline" size={22} color={colors.accent} />
          <Text style={[typography.body, { fontWeight: '600' }]}>{guide.languages.length}</Text>
          <Text style={typography.caption}>语言</Text>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="map-outline" size={22} color={colors.successGreen} />
          <Text style={[typography.body, { fontWeight: '600' }]}>{routes.length}</Text>
          <Text style={typography.caption}>路线</Text>
        </View>
      </View>

      {/* Languages */}
      <View style={styles.section}>
        <Text style={[typography.h3, { marginBottom: spacing.sm }]}>语言能力</Text>
        <View style={styles.tagRow}>
          {guide.languages.map((lang) => (
            <View key={lang} style={styles.langTag}>
              <Text style={styles.langTagText}>{lang}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Specialty */}
      <View style={styles.section}>
        <Text style={[typography.h3, { marginBottom: spacing.sm }]}>擅长区域</Text>
        <View style={styles.tagRow}>
          {guide.specialtyAreas.map((area) => (
            <View key={area} style={styles.areaTag}>
              <Text style={styles.areaTagText}>{area}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Routes */}
      {routes.length > 0 && (
        <View style={styles.section}>
          <Text style={[typography.h3, { marginBottom: spacing.md }]}>路线方案</Text>
          {routes.map((route) => (
            <TouchableOpacity
              key={route.id}
              style={styles.routeCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('GuideRouteDetail', { routeId: route.id })}
            >
              <Image source={{ uri: route.coverImage }} style={styles.routeImage} />
              <View style={styles.routeBody}>
                <Text style={typography.body} numberOfLines={1}>{route.title}</Text>
                <Text style={typography.bodySmall} numberOfLines={1}>{route.description}</Text>
                <View style={styles.routeFooter}>
                  <Text style={typography.caption}>{formatDays(route.durationDays)}</Text>
                  <View style={styles.routeRating}>
                    <Ionicons name="star" size={10} color={colors.warningYellow} />
                    <Text style={{ fontSize: 11, color: colors.textPrimary }}>{route.rating.toFixed(1)}</Text>
                  </View>
                  <Text style={typography.priceSmall}>{formatPrice(route.totalFlatPrice)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Hire Button for freelance guides */}
      {routes.length === 0 && (
        <View style={styles.section}>
          <View style={styles.freelanceNote}>
            <Ionicons name="information-circle" size={20} color={colors.accent} />
            <Text style={[typography.body, { flex: 1, marginLeft: spacing.sm }]}>
              该导游为自由导游，可根据你的自定义行程按天雇佣。
            </Text>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileHeader: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  ratingNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  description: {
    textAlign: 'center',
    marginTop: spacing.md,
    color: colors.textSecondary,
  },
  infoGrid: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  infoCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadow.light,
    gap: 4,
  },
  section: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  langTag: {
    backgroundColor: `${colors.accent}15`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  langTagText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.accent,
  },
  areaTag: {
    backgroundColor: `${colors.primary}15`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  areaTagText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
  },
  routeCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadow.light,
  },
  routeImage: {
    width: 100,
    height: 90,
    backgroundColor: colors.border,
  },
  routeBody: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  routeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  routeRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  freelanceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.accent}10`,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
});
