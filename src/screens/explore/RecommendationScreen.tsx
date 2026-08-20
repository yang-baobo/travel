import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList, Attraction } from '../../types';
import { useAttractionStore } from '../../store/useAttractionStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useRouteStore } from '../../store/useRouteStore';
import { formatPrice, getZoneName } from '../../utils/formatters';

type Nav = NativeStackNavigationProp<ExploreStackParamList, 'Recommendation'>;

export default function RecommendationScreen() {
  const navigation = useNavigation<Nav>();
  const { selectedCategories } = usePreferenceStore();
  const { getRecommendations, allAttractions } = useAttractionStore();
  const { addStop, removeStop, routeStops } = useRouteStore();

  const recommended = selectedCategories.length > 0
    ? getRecommendations(selectedCategories, 15)
    : allAttractions;

  const isInRoute = (id: string) => routeStops.some(s => s.attractionId === id);

  const handleToggleRoute = (item: Attraction) => {
    if (isInRoute(item.id)) {
      removeStop(item.id);
    } else {
      addStop({
        attractionId: item.id,
        order: routeStops.length,
        day: 1,
        arrivalTime: '09:00',
        stayDuration: item.estimatedDuration * 60,
        transportToNext: null,
      });
    }
  };

  const renderItem = ({ item }: { item: Attraction }) => {
    const added = isInRoute(item.id);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('AttractionDetail', { attractionId: item.id })}
      >
        <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
        {/* Add to custom route button */}
        <TouchableOpacity
          style={[styles.addBtn, added && styles.addBtnActive]}
          onPress={() => handleToggleRoute(item)}
          activeOpacity={0.7}
        >
          <Ionicons name={added ? 'checkmark' : 'add'} size={20} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={[typography.h3]} numberOfLines={1}>{item.name}</Text>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#FFF" />
              <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          </View>
          <Text style={[typography.bodySmall, { marginTop: 4 }]} numberOfLines={2}>
            {item.description}
          </Text>
          <View style={styles.cardFooter}>
            <View style={styles.tagRow}>
              <View style={styles.zoneTag}>
                <Ionicons name="location" size={11} color={colors.accent} />
                <Text style={styles.zoneTagText}>{getZoneName(item.zone)}</Text>
              </View>
              {item.tags.slice(0, 2).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
            <Text style={[typography.priceSmall]}>
              {item.ticketPrice === 0 ? '免费' : formatPrice(item.ticketPrice)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        data={recommended}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={[typography.bodySmall, styles.listHeader]}>
              {selectedCategories.length > 0
                ? `根据你的偏好，为你推荐 ${recommended.length} 个景点`
                : `共 ${recommended.length} 个精选景点`}
            </Text>
          </View>
        }
      />
      {/* 侧边浮动"生成路线"按钮 */}
      {routeStops.length > 0 && (
        <TouchableOpacity
          style={styles.floatingBtn}
          activeOpacity={0.85}
          onPress={() => {
            const parent = navigation.getParent();
            if (parent) {
              parent.navigate('自定义');
            }
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
  list: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  listHeader: {
    marginBottom: spacing.xs,
  },
  // 侧边浮动按钮
  floatingBtn: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 100,
    borderRadius: borderRadius.lg,
    ...shadow.medium,
  },
  floatingBtnGradient: {
    width: 52,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  floatingBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 14,
  },
  floatingBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.priceRed,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  floatingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadow.medium,
  },
  cardImage: {
    width: '100%',
    height: 160,
    backgroundColor: colors.border,
  },
  addBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnActive: {
    backgroundColor: colors.primary,
  },
  cardBody: {
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
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
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexShrink: 1,
  },
  zoneTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.accent}15`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    gap: 3,
  },
  zoneTagText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.accent,
  },
  tag: {
    backgroundColor: `${colors.primary}15`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.primary,
  },
});
