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
import { getHotelById, getRoomTypesForHotel } from '../../data/hotels';
import { getAttractionById } from '../../data/attractions';
import { formatPrice, getZoneName, getHotelLevelName } from '../../utils/formatters';
import { getHotelBreakfastOptions } from '../../utils/mealScheduler';

type RouteParams = RouteProp<{ HotelDetail: { hotelId: string } }, 'HotelDetail'>;

export default function HotelDetailScreen() {
  const { params } = useRoute<RouteParams>();
  const navigation = useNavigation<any>();
  const hotel = getHotelById(params.hotelId);

  if (!hotel) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="alert-circle" size={48} color={colors.disabled} />
          <Text style={[typography.h3, { marginTop: spacing.md }]}>酒店未找到</Text>
        </View>
      </View>
    );
  }

  const roomTypes = getRoomTypesForHotel(hotel);
  const nearbyAttractions = hotel.nearbyAttractions
    .map(id => getAttractionById(id))
    .filter(Boolean);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <Image source={{ uri: hotel.imageUrl }} style={styles.heroImage} />

        {/* Main Info */}
        <View style={styles.mainInfo}>
          <View style={styles.titleRow}>
            <Text style={[typography.h1, { flex: 1 }]}>{hotel.name}</Text>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={14} color="#FFF" />
              <Text style={styles.ratingText}>{hotel.rating.toFixed(1)}</Text>
            </View>
          </View>

          {/* Meta Row */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={15} color={colors.accent} />
              <Text style={typography.bodySmall}>{getZoneName(hotel.zone)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="ribbon-outline" size={15} color={colors.hotel} />
              <Text style={typography.bodySmall}>{getHotelLevelName(hotel.level)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="pricetag-outline" size={15} color={colors.priceRed} />
              <Text style={[typography.bodySmall, { color: colors.priceRed }]}>
                {formatPrice(hotel.pricePerNight)}/晚
              </Text>
            </View>
          </View>

          {/* Amenities Tags */}
          <View style={styles.tagRow}>
            {hotel.amenities.map((amenity) => (
              <View key={amenity} style={styles.tag}>
                <Text style={styles.tagText}>{amenity}</Text>
              </View>
            ))}
          </View>

          {/* Description */}
          <Text style={[typography.body, { marginTop: spacing.lg }]}>
            {hotel.description}
          </Text>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="navigate" size={18} color={colors.hotel} />
              <View style={{ flex: 1 }}>
                <Text style={typography.bodySmall}>酒店地址</Text>
                <Text style={typography.body}>{hotel.location.address}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="cafe-outline" size={18} color={colors.food} />
              <View style={{ flex: 1 }}>
                <Text style={typography.bodySmall}>含早餐</Text>
                <Text style={typography.body}>{getHotelBreakfastOptions(hotel)?.included ? '是' : '否'}</Text>
              </View>
            </View>
          </View>

          {/* Room Types */}
          <View style={styles.section}>
            <Text style={[typography.h3, { marginBottom: spacing.md }]}>可选房型</Text>
            {roomTypes.map((room) => (
              <View key={room.type} style={styles.roomCard}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{room.type}</Text>
                  <Text style={typography.caption}>{room.description} | 最多{room.maxOccupancy}人</Text>
                </View>
                <Text style={[typography.body, { color: colors.priceRed, fontWeight: '600' }]}>
                  {formatPrice(Math.round(hotel.pricePerNight * room.priceAdjust))}
                </Text>
              </View>
            ))}
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
    backgroundColor: colors.hotel,
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
    backgroundColor: `${colors.hotel}15`,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.hotel,
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
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    ...shadow.light,
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
