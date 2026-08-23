import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchTravelConfig, searchTravelPlaces } from '../../services/travelDataService';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useAssistantStore } from '../../store/useAssistantStore';
import type { ExploreStackParamList } from '../../types';
import type { TravelPlace, TravelProviderStatus } from '../../types/travel';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'Home'>;

const C = {
  teal: '#0E9F93',
  tealDeep: '#0A7A70',
  tealSoft: 'rgba(14,159,147,0.10)',
  ink: '#0F2B27',
  gold: '#F5C351',
  goldDeep: '#E3A93C',
  goldInk: '#4A3812',
  bg: '#F6F9F8',
  surface: '#FFFFFF',
  textSecondary: '#617571',
  border: '#E4EBE9',
};

const HERO_FALLBACK: [string, string] = ['#0C554E', '#06302B'];
const HERO_OVERLAY: [string, string, string] = ['rgba(5,33,29,0.18)', 'rgba(5,33,29,0.52)', 'rgba(5,33,29,0.94)'];
const TEAL_GRAD: [string, string] = ['#12B0A2', '#0A7A70'];
const GOLD_GRAD: [string, string] = ['#F7CC68', '#E3A93C'];

const PACE_LABEL: Record<string, string> = { relaxed: '轻松', standard: '标准', intensive: '紧凑' };

function useEntrance(delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, {
      toValue: 1,
      duration: 560,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [value, delay]);
  return value;
}

function Entrance({ delay = 0, style, children }: { delay?: number; style?: object; children: React.ReactNode }) {
  const anim = useEntrance(delay);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

function PressScale({ onPress, style, children, disabled }: {
  onPress: () => void;
  style?: object;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.timing(scale, { toValue: 0.96, duration: 110, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, speed: 26, bounciness: 7, useNativeDriver: true }).start();
  return (
    <Pressable style={style} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={disabled}>
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowDot} />
        <Text style={styles.eyebrow}>{eyebrow}</Text>
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const elderlyMode = usePreferenceStore(state => state.elderlyMode);
  const travelDays = usePreferenceStore(state => state.travelDays);
  const groupSize = usePreferenceStore(state => state.groupSize);
  const fatigueLevel = usePreferenceStore(state => state.transportRule.fatigueLevel);
  const hasSetPreferences = usePreferenceStore(state => state.hasSetPreferences);
  const preferencePromptDismissed = usePreferenceStore(state => state.preferencePromptDismissed);
  const dismissPreferencePrompt = usePreferenceStore(state => state.dismissPreferencePrompt);
  const openAssistant = useAssistantStore(state => state.openAssistant);

  const [status, setStatus] = useState<TravelProviderStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [featured, setFeatured] = useState<TravelPlace[]>([]);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [heroBroken, setHeroBroken] = useState(false);

  const es = elderlyMode ? 1.28 : 1;
  const showPreferencePrompt = !hasSetPreferences && !preferencePromptDismissed;

  useEffect(() => {
    fetchTravelConfig().then(setStatus).catch(() => setStatusError(true));
    searchTravelPlaces('attraction', '', 1, 8)
      .then(res => setFeatured(res.items))
      .catch(() => setFeatured([]));
  }, []);

  const heroPhoto = featured[0]?.photoUrls[0] && !heroBroken ? featured[0].photoUrls[0] : null;
  const heroName = featured[0]?.name;
  const cardPlaces = featured.slice(1, 5);
  const markImageBroken = (id: string) => setBrokenImages(prev => {
    if (prev.has(id)) return prev;
    return new Set(prev).add(id);
  });

  const tripChips = [
    '北京',
    `${travelDays}天`,
    `${groupSize}人`,
    `${PACE_LABEL[fatigueLevel] || '标准'}节奏`,
  ];

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          {heroPhoto ? (
            <ImageBackground source={{ uri: heroPhoto }} style={styles.hero} imageStyle={styles.heroImage}>
              <LinearGradient colors={HERO_OVERLAY} style={styles.heroOverlay}>
                <HeroBody
                  insets={insets}
                  es={es}
                  heroName={heroName}
                  onPlan={() => navigation.navigate('Preference')}
                  onVoice={openAssistant}
                />
              </LinearGradient>
            </ImageBackground>
          ) : (
            <LinearGradient colors={HERO_FALLBACK} style={styles.hero}>
              <View style={styles.heroDecorOne} />
              <View style={styles.heroDecorTwo} />
              <HeroBody
                insets={insets}
                es={es}
                heroName={heroName}
                onPlan={() => navigation.navigate('Preference')}
                onVoice={openAssistant}
              />
            </LinearGradient>
          )}
        </View>

        <Entrance delay={140} style={styles.contentBody}>
          <PressScale onPress={() => navigation.navigate('LiveItinerary')}>
            <View style={styles.tripCard}>
              <View style={styles.tripIcon}>
                <Ionicons name="map-outline" size={21} color={C.teal} />
              </View>
              <View style={styles.tripCopy}>
                <Text style={[styles.tripTitle, { fontSize: 15 * es }]}>我的旅行计划</Text>
                <View style={styles.tripChips}>
                  {tripChips.map(chip => (
                    <View key={chip} style={styles.tripChip}>
                      <Text style={[styles.tripChipText, { fontSize: 11 * es }]}>{chip}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.tripArrow}>
                <Ionicons name="arrow-forward" size={15} color="#FFF" />
              </View>
            </View>
          </PressScale>

          <SectionHeader
            eyebrow="EXPLORE BEIJING"
            title="热门景点"
            subtitle="来自高德的实时北京地点，点击查看详情与交通"
          />
          {cardPlaces.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardScroll}
              decelerationRate="fast"
            >
              {cardPlaces.map((place, index) => (
                <Entrance key={place.id} delay={220 + index * 70}>
                  <PressScale onPress={() => navigation.navigate('LivePlaces', { category: 'attraction' })}>
                    <FeaturedCard place={place} broken={brokenImages.has(place.id)} onBroken={markImageBroken} />
                  </PressScale>
                </Entrance>
              ))}
              <PressScale onPress={() => navigation.navigate('LivePlaces', { category: 'attraction' })}>
                <View style={styles.moreCard}>
                  <Ionicons name="compass-outline" size={24} color={C.teal} />
                  <Text style={styles.moreCardText}>全部景点</Text>
                </View>
              </PressScale>
            </ScrollView>
          ) : (
            <View style={styles.cardFallback}>
              <ActivityIndicator size="small" color={C.teal} />
              <Text style={styles.cardFallbackText}>正在加载北京实时景点…</Text>
            </View>
          )}

          <View style={styles.tileRow}>
            <PressScale style={styles.tileHalf} onPress={() => navigation.navigate('HotelList')}>
              <LinearGradient colors={TEAL_GRAD} style={styles.tile} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <View style={styles.tileIconGlass}>
                  <Ionicons name="bed-outline" size={20} color="#FFF" />
                </View>
                <Text style={styles.tileTitle}>酒店住宿</Text>
                <Text style={styles.tileSub}>飞猪实时参考价</Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" style={styles.tileChevron} />
              </LinearGradient>
            </PressScale>
            <PressScale style={styles.tileHalf} onPress={() => navigation.navigate('LivePlaces', { category: 'restaurant' })}>
              <LinearGradient colors={GOLD_GRAD} style={styles.tile} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <View style={styles.tileIconGlassDark}>
                  <Ionicons name="restaurant-outline" size={20} color={C.goldInk} />
                </View>
                <Text style={[styles.tileTitle, { color: C.goldInk }]}>特色餐饮</Text>
                <Text style={[styles.tileSub, { color: 'rgba(74,56,18,0.72)' }]}>高德实时餐厅</Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(74,56,18,0.6)" style={styles.tileChevron} />
              </LinearGradient>
            </PressScale>
          </View>

          <Entrance delay={300}>
            <PressScale onPress={() => navigation.navigate('BlindBox')}>
              <View style={styles.blindCard}>
                <LinearGradient colors={GOLD_GRAD} style={styles.blindIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Ionicons name="gift-outline" size={21} color={C.goldInk} />
                </LinearGradient>
                <View style={styles.blindCopy}>
                  <View style={styles.blindTitleRow}>
                    <Text style={[styles.blindTitle, { fontSize: 16 * es }]}>AI 旅行盲盒</Text>
                    <View style={styles.blindBadge}><Text style={styles.blindBadgeText}>AI 生成</Text></View>
                  </View>
                  <Text style={styles.blindSub}>在预算与安全边界内，收获一个意外的北京地点</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
              </View>
            </PressScale>
          </Entrance>

          <Entrance delay={380}>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>数据服务</Text>
              {statusError ? (
                <View style={styles.statusErrorRow}>
                  <Ionicons name="cloud-offline-outline" size={13} color="#D97706" />
                  <Text style={styles.statusErrorText}>平台服务暂未启动，请检查 API 地址</Text>
                </View>
              ) : !status ? (
                <ActivityIndicator size="small" color={C.teal} />
              ) : (
                <View style={styles.statusRow}>
                  <StatusDot label="高德" ready={status.amap.configured} />
                  <StatusDot label="飞猪" ready={status.ctrip.configured} />
                  <StatusDot label="美团" ready={status.meituan.configured} />
                </View>
              )}
            </View>
          </Entrance>

          <View style={{ height: 130 }} />
        </Entrance>
      </ScrollView>

      <Modal visible={showPreferencePrompt} transparent animationType="fade">
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <LinearGradient colors={TEAL_GRAD} style={styles.promptIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="sparkles-outline" size={28} color="#FFF" />
            </LinearGradient>
            <Text style={styles.promptTitle}>先做一个偏好设置？</Text>
            <Text style={styles.promptText}>
              兴趣、住宿预算、交通规则和盲盒安全设置一次配好，景点推荐、酒店推送和 AI 旅行盲盒都会按你的偏好来。
            </Text>
            <TouchableOpacity
              style={[styles.promptPrimary, { minHeight: 48 * es }]}
              onPress={() => navigation.navigate('Preference')}
            >
              <Text style={[styles.promptPrimaryText, { fontSize: 15 * es }]}>立即设置</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.promptSecondary} onPress={dismissPreferencePrompt}>
              <Text style={styles.promptSecondaryText}>稍后再说</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function HeroBody({ insets, es, heroName, onPlan, onVoice }: {
  insets: { top: number };
  es: number;
  heroName?: string;
  onPlan: () => void;
  onVoice: () => void;
}) {
  return (
    <View style={[styles.heroBody, { paddingTop: insets.top + 14 }]}>
      <Entrance delay={0}>
        <View style={styles.heroBadges}>
          <View style={styles.heroBadge}>
            <Ionicons name="location" size={12} color="#FFF" />
            <Text style={styles.heroBadgeText}>北京</Text>
          </View>
          <View style={styles.heroBadge}>
            <View style={styles.heroBadgeDot} />
            <Text style={styles.heroBadgeText}>实时数据</Text>
          </View>
        </View>
      </Entrance>
      <Entrance delay={90}>
        <Text style={[styles.heroTitle, { fontSize: 30 * es, lineHeight: 41 * es }]}>
          让 AI 规划{'\n'}你的北京之旅
        </Text>
      </Entrance>
      <Entrance delay={170}>
        <Text style={styles.heroSubtitle}>
          景点、酒店与路线全部来自实时数据{'\n'}
          {heroName ? `此刻的热门：${heroName}` : '偏好 · 路线优化 · 语音助手，一站完成'}
        </Text>
      </Entrance>
      <Entrance delay={250}>
        <View style={styles.heroCtaRow}>
          <PressScale onPress={onPlan} style={styles.heroCta}>
            <Text style={styles.heroCtaText}>帮我规划北京旅行</Text>
            <Ionicons name="arrow-forward" size={16} color={C.ink} />
          </PressScale>
          <PressScale onPress={onVoice} style={styles.heroVoice}>
            <Ionicons name="mic-outline" size={20} color="#FFF" />
          </PressScale>
        </View>
      </Entrance>
    </View>
  );
}

function FeaturedCard({ place, broken, onBroken }: {
  place: TravelPlace;
  broken: boolean;
  onBroken: (id: string) => void;
}) {
  const photo = place.photoUrls[0];
  if (!photo || broken) {
    return (
      <LinearGradient colors={TEAL_GRAD} style={styles.featuredCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.featuredFallbackIcon}>
          <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.85)" />
        </View>
        <View style={styles.featuredFooter}>
          <Text style={styles.featuredName} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.featuredMeta} numberOfLines={1}>{place.district || '北京'}</Text>
        </View>
      </LinearGradient>
    );
  }
  return (
    <ImageBackground source={{ uri: photo }} style={styles.featuredCard} imageStyle={styles.featuredImage} onError={() => onBroken(place.id)}>
      <LinearGradient colors={['rgba(5,33,29,0.05)', 'rgba(5,33,29,0.72)']} style={styles.featuredOverlay}>
        {place.rating !== null && (
          <View style={styles.featuredRating}>
            <Ionicons name="star" size={10} color={C.gold} />
            <Text style={styles.featuredRatingText}>{place.rating.toFixed(1)}</Text>
          </View>
        )}
        <View style={styles.featuredFooter}>
          <Text style={styles.featuredName} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.featuredMeta} numberOfLines={1}>{place.district || '北京'} · {place.typeName || '景点'}</Text>
        </View>
      </LinearGradient>
    </ImageBackground>
  );
}

function StatusDot({ label, ready }: { label: string; ready?: boolean }) {
  return (
    <View style={styles.statusItem}>
      <View style={[styles.statusDot, ready ? styles.statusDotOn : styles.statusDotOff]} />
      <Text style={styles.statusItemText}>{label}</Text>
      <Text style={[styles.statusItemState, ready ? styles.statusItemStateOn : styles.statusItemStateOff]}>
        {ready ? '已连接' : '待配置'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 0 },

  hero: { minHeight: 348, justifyContent: 'flex-end' },
  heroImage: { resizeMode: 'cover' },
  heroOverlay: { flex: 1, justifyContent: 'flex-end' },
  heroDecorOne: { position: 'absolute', top: 54, right: -46, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroDecorTwo: { position: 'absolute', top: 150, left: -40, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.045)' },
  heroBody: { padding: 22, paddingBottom: 26, gap: 14 },
  heroBadges: { flexDirection: 'row', gap: 8 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  heroBadgeText: { color: '#FFF', fontSize: 11.5, fontWeight: '600' },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  heroTitle: { color: '#FFF', fontWeight: '800', letterSpacing: 0.4 },
  heroSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 20 },
  heroCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  heroCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#FFF', borderRadius: 999, paddingHorizontal: 22, minHeight: 50,
    shadowColor: '#04211D', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 18, elevation: 8,
  },
  heroCtaText: { color: C.ink, fontSize: 15.5, fontWeight: '800' },
  heroVoice: {
    width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },

  contentBody: { paddingHorizontal: 20, paddingTop: 18 },

  tripCard: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: C.surface, borderRadius: 20, padding: 16,
    shadowColor: '#0F2B27', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.07, shadowRadius: 24, elevation: 4,
  },
  tripIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tealSoft },
  tripCopy: { flex: 1 },
  tripTitle: { color: C.ink, fontWeight: '700' },
  tripChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tripChip: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    backgroundColor: '#F0F5F4', borderWidth: 1, borderColor: C.border,
  },
  tripChipText: { color: C.textSecondary, fontWeight: '600' },
  tripArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' },

  sectionHeader: { marginTop: 30, marginBottom: 14 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.gold },
  eyebrow: { color: C.teal, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.6 },
  sectionTitle: { color: C.ink, fontSize: 21, fontWeight: '800', marginTop: 6 },
  sectionSubtitle: { color: C.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 5 },

  cardScroll: { paddingRight: 20, gap: 12 },
  featuredCard: {
    width: 218, height: 152, borderRadius: 20, overflow: 'hidden',
    shadowColor: '#0F2B27', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.09, shadowRadius: 18, elevation: 3,
  },
  featuredImage: { borderRadius: 20 },
  featuredOverlay: { flex: 1, padding: 13, justifyContent: 'flex-end' },
  featuredFallbackIcon: {
    position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  featuredRating: {
    position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(6,32,28,0.55)',
  },
  featuredRatingText: { color: '#FFF', fontSize: 10.5, fontWeight: '700' },
  featuredFooter: { gap: 3 },
  featuredName: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  featuredMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 10.5 },
  moreCard: {
    width: 104, height: 152, borderRadius: 20, borderWidth: 1.5, borderColor: C.teal, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(14,159,147,0.05)',
  },
  moreCardText: { color: C.teal, fontSize: 12.5, fontWeight: '700' },
  cardFallback: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 26, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  cardFallbackText: { color: C.textSecondary, fontSize: 12.5 },

  tileRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  tileHalf: { flex: 1 },
  tile: {
    minHeight: 118, borderRadius: 20, padding: 16, overflow: 'hidden',
    shadowColor: '#0F2B27', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 3,
  },
  tileIconGlass: {
    width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)', marginBottom: 12,
  },
  tileIconGlassDark: {
    width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(74,56,18,0.16)', marginBottom: 12,
  },
  tileTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  tileSub: { color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 3 },
  tileChevron: { position: 'absolute', right: 14, top: 17 },

  blindCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.ink, borderRadius: 20, padding: 17, marginTop: 26,
    shadowColor: '#0F2B27', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 26, elevation: 6,
  },
  blindIcon: {
    width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  blindCopy: { flex: 1 },
  blindTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blindTitle: { color: '#FFF', fontWeight: '800' },
  blindBadge: { backgroundColor: 'rgba(245,195,81,0.16)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  blindBadgeText: { color: C.gold, fontSize: 10, fontWeight: '800' },
  blindSub: { color: 'rgba(255,255,255,0.62)', fontSize: 11.5, lineHeight: 17, marginTop: 5 },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 16, padding: 14, marginTop: 26,
    borderWidth: 1, borderColor: C.border,
  },
  statusLabel: { color: C.ink, fontSize: 12, fontWeight: '800' },
  statusRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusDotOn: { backgroundColor: '#34C77B' },
  statusDotOff: { backgroundColor: '#E8B33C' },
  statusItemText: { color: C.textSecondary, fontSize: 11.5, fontWeight: '600' },
  statusItemState: { fontSize: 10.5 },
  statusItemStateOn: { color: '#34C77B' },
  statusItemStateOff: { color: '#E8B33C' },
  statusErrorRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusErrorText: { color: '#D97706', fontSize: 11.5, flex: 1 },

  promptOverlay: { flex: 1, backgroundColor: 'rgba(5,32,28,0.55)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  promptCard: {
    width: '100%', maxWidth: 340, backgroundColor: '#FFF', borderRadius: 24, padding: 26, alignItems: 'center',
    shadowColor: '#04211D', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.3, shadowRadius: 40, elevation: 12,
  },
  promptIcon: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  promptTitle: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 16 },
  promptText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  promptPrimary: {
    alignSelf: 'stretch', backgroundColor: C.teal, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 22,
    shadowColor: C.teal, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 16, elevation: 6,
  },
  promptPrimaryText: { color: '#FFF', fontWeight: '800' },
  promptSecondary: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  promptSecondaryText: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
});
