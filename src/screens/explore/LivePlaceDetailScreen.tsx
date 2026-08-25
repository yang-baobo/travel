import React from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { borderRadius, shadow, spacing } from '../../theme/spacing';
import { useLiveTravelStore } from '../../store/useLiveTravelStore';
import { buildAmapNavigationUrl } from '../../services/travelDataService';
import type { ExploreStackParamList } from '../../types';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'LivePlaceDetail'>;
type Route = NativeStackScreenProps<ExploreStackParamList, 'LivePlaceDetail'>['route'];

const CATEGORY_LABEL = { attraction: '景点', hotel: '酒店', restaurant: '餐饮' } as const;

export default function LivePlaceDetailScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const place = useLiveTravelStore(state => (
    state.itinerary.find(item => item.id === route.params.placeId)
      || Object.values(state.items).flat().find(item => item.id === route.params.placeId)
  ));
  const addToItinerary = useLiveTravelStore(state => state.addToItinerary);
  const inItinerary = useLiveTravelStore(state => state.itinerary.some(item => item.id === route.params.placeId));

  if (!place) {
    return (
      <View style={styles.missing}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.disabled} />
        <Text style={styles.missingTitle}>地点信息已失效</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backText}>返回列表</Text></TouchableOpacity>
      </View>
    );
  }

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('暂时无法打开', '请稍后重试。');
    }
  };

  const add = () => {
    addToItinerary(place);
    Alert.alert('已加入路线', `${place.name} 已加入，是否查看实时交通？`, [
      { text: '继续浏览', style: 'cancel' },
      { text: '查看路线', onPress: () => navigation.navigate('LiveItinerary') },
    ]);
  };

  const pendingLabel = place.category === 'restaurant' ? '餐饮预订接入中' : '携程接入中';
  const photo = place.photoUrls[0];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroFallback]}>
            <Ionicons name="image-outline" size={52} color={colors.primaryLight} />
          </View>
        )}
        <View style={styles.body}>
          <View style={styles.categoryPill}><Text style={styles.categoryText}>{CATEGORY_LABEL[place.category]}</Text></View>
          <Text style={styles.name}>{place.name}</Text>
          <Text style={styles.type}>{place.typeName || `${place.district}${CATEGORY_LABEL[place.category]}`}</Text>

          <View style={styles.metrics}>
            <Metric icon="star" label="评分" value={place.rating == null ? '暂无' : place.rating.toFixed(1)} color={colors.warningYellow} />
            <Metric icon="wallet-outline" label="参考消费" value={place.cost == null ? '暂无' : `¥${Math.round(place.cost)}`} color={colors.priceRed} />
            <Metric icon="business-outline" label="区域" value={place.district || '北京'} color={colors.primary} />
          </View>

          <InfoRow icon="location-outline" title="地址" value={place.address || '高德暂未提供详细地址'} />
          <InfoRow icon="time-outline" title="营业时间" value={place.openHours || '请以现场或预订页为准'} />
          <InfoRow icon="call-outline" title="联系电话" value={place.phone || '暂无公开电话'} />

          {place.tags.length > 0 && (
            <View style={styles.tags}>
              {place.tags.map(tag => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}
            </View>
          )}

          <View style={styles.sourceNote}>
            <Ionicons name="information-circle-outline" size={17} color={colors.textSecondary} />
            <Text style={styles.sourceText}>地点、评分和营业信息来自高德开放平台，价格与营业时间可能变化，请在预订前确认。</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => void openUrl(buildAmapNavigationUrl(place.name, place.location.longitude, place.location.latitude))}
        >
          <Ionicons name="navigate-outline" size={18} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>高德导航</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!place.booking.enabled || !place.booking.url}
          style={[styles.bookingButton, (!place.booking.enabled || !place.booking.url) && styles.buttonDisabled]}
          onPress={() => place.booking.url && void openUrl(place.booking.url)}
        >
          <Text style={styles.bookingButtonText}>{place.booking.enabled ? place.booking.label : pendingLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={inItinerary} style={[styles.addButton, inItinerary && styles.addedButton]} onPress={add}>
          <Text style={styles.addButtonText}>{inItinerary ? '已加入' : '加入路线'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Metric({ icon, label, value, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, title, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={styles.infoCopy}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 104 },
  hero: { width: '100%', height: 250, backgroundColor: colors.border },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.xl },
  categoryPill: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#E6F5F1' },
  categoryText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  name: { marginTop: spacing.md, color: colors.textPrimary, fontSize: 25, fontWeight: '800', lineHeight: 33 },
  type: { marginTop: 5, color: colors.textSecondary, fontSize: 13 },
  metrics: { flexDirection: 'row', marginTop: spacing.xl, paddingVertical: spacing.lg, backgroundColor: colors.surface, borderRadius: borderRadius.lg, ...shadow.light },
  metric: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  metricValue: { marginTop: 5, color: colors.textPrimary, fontSize: 14, fontWeight: '700', maxWidth: '100%' },
  metricLabel: { marginTop: 2, color: colors.textSecondary, fontSize: 11 },
  infoRow: { flexDirection: 'row', marginTop: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  infoCopy: { flex: 1, marginLeft: spacing.md },
  infoTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  infoValue: { marginTop: 5, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  tag: { backgroundColor: '#EFF5F3', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  tagText: { color: colors.textSecondary, fontSize: 12 },
  sourceNote: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: '#F4F8F6' },
  sourceText: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 17 },
  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.xl, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  secondaryButton: { height: 48, minWidth: 92, borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.md, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  bookingButton: { height: 48, flex: 1.25, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningYellow, paddingHorizontal: 8 },
  bookingButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  addButton: { height: 48, flex: 1, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  addedButton: { backgroundColor: colors.successGreen },
  addButtonText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  buttonDisabled: { backgroundColor: colors.disabled },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.xl },
  missingTitle: { marginTop: spacing.lg, color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  backText: { marginTop: spacing.lg, color: colors.primary, fontWeight: '700' },
});
