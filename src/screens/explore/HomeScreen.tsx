import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { borderRadius, shadow, spacing } from '../../theme/spacing';
import { fetchTravelConfig } from '../../services/travelDataService';
import type { ExploreStackParamList } from '../../types';
import type { TravelProviderStatus } from '../../types/travel';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'Home'>;

const ENTRIES = [
  { category: 'attraction' as const, label: '景点', subtitle: '博物馆、公园与名胜', icon: 'camera-outline' as const, color: '#5B67F1' },
  { category: 'hotel' as const, label: '酒店', subtitle: '北京真实住宿地点', icon: 'bed-outline' as const, color: '#00A6A6' },
  { category: 'restaurant' as const, label: '餐饮', subtitle: '餐厅、小吃与本地风味', icon: 'restaurant-outline' as const, color: '#F59E0B' },
];

export default function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const [status, setStatus] = useState<TravelProviderStatus | null>(null);
  const [statusError, setStatusError] = useState(false);

  useEffect(() => {
    fetchTravelConfig().then(setStatus).catch(() => setStatusError(true));
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#2357D9', '#4C82F4']} style={styles.hero}>
        <View style={styles.cityRow}>
          <View style={styles.cityPill}>
            <Ionicons name="location" size={15} color="#FFF" />
            <Text style={styles.cityText}>北京</Text>
          </View>
          <View style={styles.realBadge}><Text style={styles.realBadgeText}>实时数据</Text></View>
        </View>
        <Text style={styles.title}>真实的北京，按你的节奏出发</Text>
        <Text style={styles.subtitle}>景点、酒店、餐饮来自高德服务；预订入口通过官方合作链接接入。</Text>
      </LinearGradient>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>你想先看什么？</Text>
        {ENTRIES.map(entry => (
          <TouchableOpacity
            key={entry.category}
            style={styles.entry}
            activeOpacity={0.75}
            onPress={() => navigation.navigate('LivePlaces', { category: entry.category })}
          >
            <View style={[styles.entryIcon, { backgroundColor: `${entry.color}18` }]}>
              <Ionicons name={entry.icon} size={24} color={entry.color} />
            </View>
            <View style={styles.entryCopy}>
              <Text style={styles.entryTitle}>{entry.label}</Text>
              <Text style={styles.entrySubtitle}>{entry.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.itinerary} onPress={() => navigation.navigate('LiveItinerary')}>
          <View>
            <Text style={styles.itineraryTitle}>我的实时路线</Text>
            <Text style={styles.itinerarySubtitle}>添加地点后，获取高德公交、驾车与步行方案</Text>
          </View>
          <Ionicons name="map-outline" size={28} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>数据服务</Text>
            {!status && !statusError && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          {statusError ? (
            <Text style={styles.statusError}>平台服务暂未启动，请检查 API 地址。</Text>
          ) : (
            <>
              <StatusLine label="高德地点与路线" ready={status?.amap.configured} />
              <StatusLine label="携程酒店与门票入口" ready={status?.ctrip.configured} />
              <StatusLine label="餐饮合作入口" ready={status?.meituan.configured} />
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function StatusLine({ label, ready }: { label: string; ready?: boolean }) {
  return (
    <View style={styles.statusLine}>
      <Ionicons
        name={ready ? 'checkmark-circle' : 'time-outline'}
        size={17}
        color={ready ? colors.successGreen : colors.warningYellow}
      />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, ready && styles.statusReady]}>{ready ? '已连接' : '待配置'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: 36 },
  cityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityPill: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  cityText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  realBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  realBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  title: { marginTop: spacing.xxl, color: '#FFF', fontSize: 27, fontWeight: '800', lineHeight: 36 },
  subtitle: { marginTop: spacing.sm, color: 'rgba(255,255,255,0.84)', fontSize: 14, lineHeight: 21 },
  content: { padding: spacing.xl, gap: spacing.md },
  sectionTitle: { color: colors.textPrimary, fontSize: 19, fontWeight: '700', marginBottom: spacing.xs },
  entry: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', ...shadow.light },
  entryIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  entryCopy: { flex: 1, marginLeft: spacing.md },
  entryTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  entrySubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  itinerary: { marginTop: spacing.sm, backgroundColor: colors.accent, borderRadius: borderRadius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itineraryTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  itinerarySubtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 5, maxWidth: 270 },
  statusCard: { marginTop: spacing.sm, borderRadius: borderRadius.lg, backgroundColor: colors.surface, padding: spacing.lg, ...shadow.light },
  statusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  statusTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 15 },
  statusLine: { flexDirection: 'row', alignItems: 'center', minHeight: 30 },
  statusLabel: { flex: 1, color: colors.textSecondary, fontSize: 13, marginLeft: spacing.sm },
  statusValue: { color: colors.warningYellow, fontSize: 12, fontWeight: '600' },
  statusReady: { color: colors.successGreen },
  statusError: { color: colors.priceRed, fontSize: 13 },
});
