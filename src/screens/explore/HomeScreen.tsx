import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchFliggyAttractionEditorial, searchTravelPlaces } from '../../services/travelDataService';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useRouteStore } from '../../store/useRouteStore';
import { usePlanningSessionStore } from '../../store/usePlanningSessionStore';
import { useTripStore } from '../../store/useTripStore';
import { buildPlanningRequest } from '../../services/planningRequestBuilder';
import { useVoiceEngine } from '../../hooks/useVoiceEngine';
import type { ExploreStackParamList } from '../../types';
import type { FliggyAttractionEditorial, TravelPlace } from '../../types/travel';
import { DEFAULT_PLANNER_PARAMS, PLANNER_MODE_COPY, QUICK_SERVICES } from '../../data/beijingHomeUi';
import type { PlannerCandidate, PlannerMode, PlannerParams } from '../../data/beijingHomeUi';
import { FLYAI_WUMEN_EDITORIAL } from '../../data/beijingEditorialAssets';
import CurrentTripCard from '../../components/home/CurrentTripCard';
import ItineraryPreviewSheet from '../../components/home/ItineraryPreviewSheet';
import PlannerCandidatePanel from '../../components/home/PlannerCandidatePanel';
import PlannerModeSelector from '../../components/home/PlannerModeSelector';
import PlannerParameterPicker from '../../components/home/PlannerParameterPicker';
import PreferenceConfirmationCard from '../../components/home/PreferenceConfirmationCard';
import BeijingDiscoverySection from '../../components/home/BeijingDiscoverySection';
import type { PlanningEntryMode, PlanningInputMethod, PlanningRequirementKey } from '../../types/planning';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'Home'>;
type ParameterField = keyof PlannerParams;

type HeroMetricProps = {
  icon: string;
  value: string;
  label: string;
};

const C = {
  teal: '#10A99A',
  tealDark: '#08766D',
  ink: '#102B27',
  gold: '#F2C15B',
  bg: '#F2F6F4',
  textSecondary: '#627773',
  white: '#FFFFFF',
};

const QUICK_PROMPTS = ['带父母慢慢逛', '建筑与咖啡', '周末两日松弛游'];

function PressScale({ children, onPress, style, disabled = false }: {
  children: React.ReactNode;
  onPress: () => void;
  style?: object;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.timing(scale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, speed: 28, bounciness: 6, useNativeDriver: true }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={disabled} style={style}>
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

function HeroMetric({ icon, value, label }: HeroMetricProps) {
  return (
    <View style={styles.heroMetric}>
      <View style={styles.heroMetricIcon}>
        <Ionicons name={icon as any} size={15} color="#7EE4D1" />
      </View>
      <View>
        <Text style={styles.heroMetricValue}>{value}</Text>
        <Text style={styles.heroMetricLabel}>{label}</Text>
      </View>
    </View>
  );
}

function SectionIntro({ eyebrow, title, subtitle, dark = false }: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  dark?: boolean;
}) {
  return (
    <View style={styles.sectionIntro}>
      <Text style={[styles.sectionEyebrow, dark && styles.sectionEyebrowLight]}>{eyebrow}</Text>
      <Text style={[styles.sectionTitle, dark && styles.sectionTitleLight]}>{title}</Text>
      {subtitle ? <Text style={[styles.sectionSubtitle, dark && styles.sectionSubtitleLight]}>{subtitle}</Text> : null}
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isWide = width >= 1180;
  const heroHeight = isDesktop ? 790 : 760;

  const elderlyMode = usePreferenceStore(state => state.elderlyMode);
  const setElderlyMode = usePreferenceStore(state => state.setElderlyMode);
  const hasSetPreferences = usePreferenceStore(state => state.hasSetPreferences);
  const preferencePromptDismissed = usePreferenceStore(state => state.preferencePromptDismissed);
  const dismissPreferencePrompt = usePreferenceStore(state => state.dismissPreferencePrompt);
  const planningSession = usePlanningSessionStore(state => state.session);
  const currentTrip = useTripStore(state => state.currentTrip);
  const legacyHasRoute = useRouteStore(state => state.routeStops.length > 0 || state.currentRouteId !== null);
  const planning = Boolean(planningSession && ['understanding', 'querying_places', 'calculating_transport', 'committing'].includes(planningSession.status));
  const hasRoute = Boolean(currentTrip) || legacyHasRoute;
  const plannerVoice = useVoiceEngine();

  const [params, setParams] = useState<PlannerParams>(DEFAULT_PLANNER_PARAMS);
  const [mode, setMode] = useState<PlannerMode>('auto');
  const [modePickerVisible, setModePickerVisible] = useState(false);
  const [picker, setPicker] = useState<ParameterField | null>(null);
  const [input, setInput] = useState('');
  const [plannerExpanded, setPlannerExpanded] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [featured, setFeatured] = useState<TravelPlace[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState(false);
  const [editorialAttractions, setEditorialAttractions] = useState<FliggyAttractionEditorial[]>([]);
  const [editorialLoading, setEditorialLoading] = useState(true);
  const [editorialError, setEditorialError] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [preferenceCard, setPreferenceCard] = useState(false);
  const [sessionPreference, setSessionPreference] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ignoredIds, setIgnoredIds] = useState<string[]>([]);
  const [autoPlanIds, setAutoPlanIds] = useState<string[]>([]);
  const [inputMethod, setInputMethod] = useState<PlanningInputMethod>('text');

  const scrollY = useRef(new Animated.Value(0)).current;
  const heroOpacity = useRef(new Animated.Value(1)).current;
  const heroZoom = useRef(new Animated.Value(1.03)).current;
  const intro = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const plannerEntrance = useRef(new Animated.Value(0)).current;
  const requestId = useRef(0);
  const scale = elderlyMode ? 1.12 : 1;
  const showPreferenceNudge = !hasSetPreferences && !preferencePromptDismissed;

  const loadFeatured = useCallback(() => {
    const id = ++requestId.current;
    setFeaturedLoading(true);
    setFeaturedError(false);
    searchTravelPlaces('attraction', '', 1, 8)
      .then(response => {
        if (requestId.current !== id) return;
        setFeatured(response.items);
        setFeaturedLoading(false);
      })
      .catch(() => {
        if (requestId.current !== id) return;
        setFeaturedError(true);
        setFeaturedLoading(false);
      });
  }, []);

  useEffect(() => loadFeatured(), [loadFeatured]);

  const loadEditorialAttractions = useCallback(() => {
    setEditorialLoading(true);
    setEditorialError(false);
    fetchFliggyAttractionEditorial()
      .then(response => {
        setEditorialAttractions(response.attractions);
        setEditorialLoading(false);
      })
      .catch(() => {
        setEditorialAttractions([]);
        setEditorialError(true);
        setEditorialLoading(false);
      });
  }, []);

  useEffect(() => loadEditorialAttractions(), [loadEditorialAttractions]);

  useEffect(() => {
    plannerVoice.setOnFinalText(text => {
      setInput(current => [current.trim(), text.trim()].filter(Boolean).join(' '));
      setSessionPreference(current => [current.trim(), text.trim()].filter(Boolean).join(' '));
      setInputMethod('asr');
    });
    return () => plannerVoice.setOnFinalText(null);
  }, [plannerVoice.setOnFinalText]);

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 950,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const pulseAnimation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [intro, pulse]);

  useEffect(() => {
    if (featured.length > 0 && autoPlanIds.length === 0) {
      setAutoPlanIds(featured.slice(0, 4).map(place => place.id));
    }
  }, [featured, autoPlanIds.length]);

  const heroImages = useMemo(() => {
    const fliggyImages = editorialAttractions.map(place => place.imageUrl).filter(Boolean);
    const amapImages = featured.flatMap(place => place.photoUrls).filter(Boolean);
    return Array.from(new Set([FLYAI_WUMEN_EDITORIAL.imageUrl, ...fliggyImages, ...amapImages])).slice(0, 8);
  }, [editorialAttractions, featured]);

  useEffect(() => {
    const showImmediately = heroIndex === 0;
    heroOpacity.setValue(showImmediately ? 1 : 0);
    heroZoom.setValue(1.02);
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: showImmediately ? 0 : 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(heroZoom, { toValue: 1.12, duration: 7200, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      if (heroImages.length > 1) setHeroIndex(index => (index + 1) % heroImages.length);
    }, 6500);
    return () => clearTimeout(timer);
  }, [heroIndex, heroImages.length, heroOpacity, heroZoom]);

  useEffect(() => {
    if (heroIndex >= heroImages.length) setHeroIndex(0);
  }, [heroImages.length, heroIndex]);

  const plannerCandidates: PlannerCandidate[] = featured.map(place => ({
    id: place.id,
    name: place.name,
    category: 'attraction',
    categoryLabel: '景点',
    detail: [place.district, place.rating ? '评分 ' + place.rating : '', place.address].filter(Boolean).join(' · '),
    reason: place.tags.slice(0, 2).join(' · ') || '来自高德的实时北京地点',
    imageUrl: place.photoUrls[0] || '',
    fallbackColors: ['#0E9F93', '#0A7A70'],
  }));

  const suggestedIds = mode === 'complete'
    ? plannerCandidates.filter(item => !selectedIds.includes(item.id)).slice(0, 3).map(item => item.id)
    : [];
  const activePlanIds = mode === 'auto' ? autoPlanIds : selectedIds;
  const activeCandidates = plannerCandidates.filter(item => activePlanIds.includes(item.id));
  const currentHeroImage = heroImages[heroIndex];

  const headerOpacity = scrollY.interpolate({ inputRange: [0, 120, 300], outputRange: [0, 0.25, 0.96], extrapolate: 'clamp' });
  const heroParallax = scrollY.interpolate({ inputRange: [0, heroHeight], outputRange: [0, heroHeight * 0.2], extrapolate: 'clamp' });
  const heroContentShift = scrollY.interpolate({ inputRange: [0, 420], outputRange: [0, -72], extrapolate: 'clamp' });
  const heroContentFade = scrollY.interpolate({ inputRange: [0, 360, 560], outputRange: [1, 0.58, 0], extrapolate: 'clamp' });
  const pageLift = scrollY.interpolate({ inputRange: [heroHeight - 120, heroHeight + 180], outputRange: [28, 0], extrapolate: 'clamp' });
  const introTranslate = intro.interpolate({ inputRange: [0, 1], outputRange: [34, 0] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  const updateParam = (field: ParameterField, value: string) => setParams(current => ({ ...current, [field]: value }));

  const togglePlanner = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlannerExpanded(value => !value);
    plannerEntrance.setValue(0);
    Animated.timing(plannerEntrance, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  const handleToggleCandidate = (candidate: PlannerCandidate) => {
    if (mode === 'auto') {
      setAutoPlanIds(ids => ids.includes(candidate.id) ? ids.filter(id => id !== candidate.id) : [...ids, candidate.id]);
      return;
    }
    setSelectedIds(ids => ids.includes(candidate.id) ? ids.filter(id => id !== candidate.id) : [...ids, candidate.id]);
  };

  const handleSuggestion = (candidate: PlannerCandidate, action: 'accept' | 'replace' | 'ignore') => {
    if (action === 'accept') setSelectedIds(ids => ids.includes(candidate.id) ? ids : [...ids, candidate.id]);
    if (action === 'ignore') setIgnoredIds(ids => ids.includes(candidate.id) ? ids : [...ids, candidate.id]);
    if (action === 'replace') {
      const replacement = plannerCandidates.find(item => item.id !== candidate.id && !selectedIds.includes(item.id) && !suggestedIds.includes(item.id));
      if (replacement) {
        setIgnoredIds(ids => [...ids.filter(id => id !== replacement.id), candidate.id]);
        setSelectedIds(ids => ids.includes(replacement.id) ? ids : [...ids, replacement.id]);
      } else {
        setInput(current => `${current.trim()} 请用真实可核验的北京地点替换“${candidate.name}”。`.trim());
      }
    }
  };

  const handleAutoReplace = (candidate: PlannerCandidate) => {
    const replacement = plannerCandidates.find(item => item.id !== candidate.id && !autoPlanIds.includes(item.id));
    if (replacement) setAutoPlanIds(ids => ids.map(id => id === candidate.id ? replacement.id : id));
    else setInput(current => `${current.trim()} 请把“${candidate.name}”换成更符合我偏好的真实北京地点。`.trim());
  };

  const handlePreferenceAction = (action: 'once' | 'save' | 'edit' | 'ignore') => {
    if (action === 'save') navigation.navigate('Preference');
    if (action !== 'edit') setPreferenceCard(false);
  };

  const createRequest = (method: PlanningInputMethod, userInput = input) => buildPlanningRequest({
    userInput,
    inputMethod: method,
    mode,
    params,
    candidates: mode === 'auto' ? [] : featured.filter(place => activePlanIds.includes(place.id)),
  });

  const enterPlanning = (entryMode: PlanningEntryMode, method: PlanningInputMethod, launchRealtime = false) => {
    if (planning) return;
    const confirmedRequirements: PlanningRequirementKey[] = plannerExpanded ? ['people', 'budget', 'pace'] : [];
    usePlanningSessionStore.getState().beginSession(createRequest(method), { entryMode, confirmedRequirements });
    navigation.navigate('AIPlanning', launchRealtime ? { launchRealtime: true } : undefined);
    setInputMethod('text');
  };

  const startPlanning = () => {
    const entryMode: PlanningEntryMode = plannerExpanded && mode !== 'auto' ? 'selected_places' : 'chat';
    enterPlanning(entryMode, inputMethod);
  };

  const handleAsrPress = async () => {
    if (plannerVoice.status === 'listening') await plannerVoice.stopListening();
    else if (plannerVoice.status !== 'transcribing') await plannerVoice.startListening();
  };

  const openRealtimePlanning = () => {
    enterPlanning('realtime', 'realtime', true);
  };

  const chooseQuickPrompt = (prompt: string) => {
    setInput(prompt);
    setSessionPreference(prompt);
  };

  const navigateToNearby = () => navigation.navigate('LivePlaces', { category: 'attraction' });

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <View style={[styles.hero, { height: heroHeight }]}>
          {currentHeroImage ? (
            <Animated.Image
              key={currentHeroImage}
              source={{ uri: currentHeroImage }}
              style={[styles.heroImage, { opacity: heroOpacity, transform: [{ translateY: heroParallax }, { scale: heroZoom }] }]}
            />
          ) : null}
          <LinearGradient colors={['rgba(4,24,22,0.10)', 'rgba(4,24,22,0.30)', 'rgba(3,24,21,0.88)']} style={StyleSheet.absoluteFillObject} />
          <LinearGradient colors={['rgba(5,69,62,0.28)', 'transparent', 'rgba(4,22,20,0.16)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={styles.heroOrbOne} />
          <View pointerEvents="none" style={styles.heroOrbTwo} />

          <Animated.View style={[styles.headerTint, { opacity: headerOpacity }]} />
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <View style={[styles.headerInner, isDesktop && styles.headerInnerDesktop]}>
              <View style={styles.brand}>
                <LinearGradient colors={['#24C7B6', '#08766D']} style={styles.brandMark}>
                  <Ionicons name="navigate" size={17} color="#FFF" />
                </LinearGradient>
                <View>
                  <Text style={styles.brandName}>BEIJING FLOW</Text>
                  <Text style={styles.brandSub}>AI TRAVEL STUDIO</Text>
                </View>
              </View>
              {isDesktop ? (
                <View style={styles.desktopNav}>
                  <Pressable onPress={navigateToNearby}><Text style={styles.desktopNavText}>发现北京</Text></Pressable>
                  <Pressable onPress={() => navigation.navigate('HotelList')}><Text style={styles.desktopNavText}>酒店</Text></Pressable>
                  <Pressable onPress={() => navigation.navigate('LivePlaces', { category: 'restaurant' })}><Text style={styles.desktopNavText}>餐饮</Text></Pressable>
                  <Pressable onPress={() => hasRoute ? navigation.navigate('LiveItinerary') : togglePlanner()}><Text style={styles.desktopNavText}>我的行程</Text></Pressable>
                </View>
              ) : null}
              <View style={styles.headerActions}>
                <Pressable onPress={() => setElderlyMode(!elderlyMode)} style={[styles.roundHeaderButton, elderlyMode && styles.roundHeaderButtonOn]}>
                  <Ionicons name="accessibility-outline" size={18} color="#FFF" />
                </Pressable>
                <Pressable onPress={() => navigation.getParent()?.navigate('个人' as never)} style={styles.avatar}>
                  <Ionicons name="person" size={16} color={C.tealDark} />
                </Pressable>
              </View>
            </View>
          </View>

          <Animated.View style={[styles.heroContent, isDesktop && styles.heroContentDesktop, { opacity: Animated.multiply(intro, heroContentFade), transform: [{ translateY: Animated.add(introTranslate, heroContentShift) }] }]}>
            <View style={styles.heroBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.heroBadgeText}>真实北京 · 正在发生</Text>
              <View style={styles.heroBadgeDivider} />
              <Text style={styles.heroBadgeMeta}>高德实时地点</Text>
            </View>

            <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop, elderlyMode && styles.heroTitleLarge]}>
              北京，正在为你展开
            </Text>
            <Text style={[styles.heroSubtitle, isDesktop && styles.heroSubtitleDesktop]}>
              不从模板开始。从你的一句话、此刻的心情和真实城市数据开始。
            </Text>

            <View style={[styles.heroComposer, isDesktop && styles.heroComposerDesktop]}>
              <View style={styles.composerMain}>
                <Ionicons name="sparkles" size={18} color="#79E0CF" />
                <TextInput
                  value={input}
                  onChangeText={value => { setInput(value); setSessionPreference(value); }}
                  placeholder="想怎么玩北京？说一句就好"
                  placeholderTextColor="rgba(255,255,255,0.56)"
                  style={[styles.heroInput, { fontSize: 14 * scale }]}
                  returnKeyType="send"
                  onSubmitEditing={startPlanning}
                />
              </View>
              <View style={styles.composerActions}>
                <Pressable onPress={() => void handleAsrPress()} style={styles.voiceOrb}>
                  <Animated.View pointerEvents="none" style={[styles.voicePulse, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
                  {plannerVoice.status === 'transcribing' ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name={plannerVoice.status === 'listening' ? 'stop' : 'mic-outline'} size={20} color="#FFF" />}
                </Pressable>
                <PressScale onPress={startPlanning} disabled={planning}>
                  <LinearGradient colors={['#21C6B5', '#0A8B80']} style={styles.sendButton}>
                    {planning ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="arrow-forward" size={20} color="#FFF" />}
                  </LinearGradient>
                </PressScale>
              </View>
            </View>

            <View style={styles.quickPromptRow}>
              {QUICK_PROMPTS.map(prompt => (
                <Pressable key={prompt} onPress={() => chooseQuickPrompt(prompt)} style={styles.quickPrompt}>
                  <Text style={styles.quickPromptText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.planningMethodRow} testID="home-planning-entry-methods">
              <Pressable onPress={togglePlanner} style={styles.planningMethodButton}><Ionicons name="map-outline" size={14} color="#FFF" /><Text style={styles.planningMethodText}>选景点规划</Text></Pressable>
              <Pressable onPress={() => enterPlanning('chat', inputMethod)} style={styles.planningMethodButton}><Ionicons name="chatbubble-ellipses-outline" size={14} color="#FFF" /><Text style={styles.planningMethodText}>AI 对话定制</Text></Pressable>
              <Pressable onPress={openRealtimePlanning} style={styles.planningMethodButton}><Ionicons name="call-outline" size={14} color="#FFF" /><Text style={styles.planningMethodText}>电话实时规划</Text></Pressable>
            </View>

            <View style={[styles.heroBottomRow, isDesktop && styles.heroBottomRowDesktop]}>
              <Pressable onPress={togglePlanner} style={styles.deepPlanLink}>
                <Text style={styles.deepPlanText}>{plannerExpanded ? '收起深度定制' : '展开深度定制'}</Text>
                <Ionicons name={plannerExpanded ? 'chevron-up' : 'options-outline'} size={16} color="#FFF" />
              </Pressable>
              <View style={styles.heroMetrics}>
                <HeroMetric icon="location-outline" value={featuredLoading ? '···' : String(featured.length)} label="实时灵感" />
                <HeroMetric icon="bed-outline" value="FlyAI" label="真实酒店" />
                <HeroMetric icon="sparkles-outline" value="GLM" label="AI 规划" />
              </View>
            </View>
          </Animated.View>

          <View pointerEvents="none" style={styles.scrollCue}>
            <Text style={styles.scrollCueText}>SCROLL TO EXPLORE</Text>
            <View style={styles.scrollLine}><Animated.View style={[styles.scrollDot, { transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) }] }]} /></View>
          </View>
        </View>

        <Animated.View style={[styles.page, isWide && styles.pageWide, { transform: [{ translateY: pageLift }] }]}>
          {plannerExpanded ? (
            <Animated.View style={[styles.planningStudio, { opacity: plannerEntrance, transform: [{ translateY: plannerEntrance.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }] }]}>
              <View style={styles.studioHeader}>
                <View>
                  <Text style={styles.studioEyebrow}>AI PLANNING STUDIO</Text>
                  <Text style={styles.studioTitle}>把灵感变成可走的路线</Text>
                  <Text style={styles.studioSubtitle}>设置边界，剩下的交给 AI 与真实城市数据。</Text>
                </View>
                <Pressable onPress={togglePlanner} style={styles.studioClose}>
                  <Ionicons name="close" size={20} color={C.ink} />
                </Pressable>
              </View>

              <TextInput
                value={input}
                onChangeText={value => { setInput(value); setSessionPreference(value); setPreferenceCard(Boolean(value.trim())); }}
                multiline
                placeholder="例如：带父母慢慢逛四天，想看建筑、喝咖啡，尽量少走路……"
                placeholderTextColor="#91A39F"
                style={styles.studioInput}
              />
              <PreferenceConfirmationCard
                visible={preferenceCard && input.trim().length > 0}
                preference={sessionPreference || input}
                large={elderlyMode}
                onPreferenceChange={value => { setSessionPreference(value); setInput(value); }}
                onAction={handlePreferenceAction}
              />

              <View style={styles.studioToolbar}>
                <Pressable onPress={() => void handleAsrPress()} style={styles.studioVoiceButton}>
                  <Ionicons name={plannerVoice.status === 'listening' ? 'stop' : 'mic-outline'} size={17} color={C.tealDark} />
                  <Text style={styles.studioVoiceText}>{plannerVoice.status === 'transcribing' ? '正在转写…' : plannerVoice.status === 'listening' ? '完成录音' : '语音转文字'}</Text>
                </Pressable>
                <Pressable onPress={openRealtimePlanning} style={styles.studioVoiceButton}>
                  <Ionicons name="call-outline" size={17} color={C.tealDark} />
                  <Text style={styles.studioVoiceText}>实时通话</Text>
                </Pressable>
                <Pressable onPress={() => setModePickerVisible(true)} style={styles.studioModeButton}>
                  <Text style={styles.studioModeText}>{PLANNER_MODE_COPY[mode].label}</Text>
                  <Ionicons name="chevron-down" size={15} color={C.tealDark} />
                </Pressable>
              </View>

              <View style={styles.params}>
                {(['days', 'people', 'budget', 'pace'] as ParameterField[]).map(field => (
                  <Pressable key={field} onPress={() => setPicker(field)} style={[styles.param, elderlyMode && styles.largeTouch]}>
                    <Text style={styles.paramValue}>{params[field]}</Text>
                    <Ionicons name="chevron-down" size={13} color={C.teal} />
                  </Pressable>
                ))}
              </View>

              <PlannerCandidatePanel
                candidates={plannerCandidates}
                mode={mode}
                selectedIds={mode === 'auto' ? autoPlanIds : selectedIds}
                suggestedIds={suggestedIds}
                ignoredIds={ignoredIds}
                autoPlanIds={autoPlanIds}
                onToggle={handleToggleCandidate}
                onSuggestion={handleSuggestion}
                onAutoReplace={handleAutoReplace}
                elderlyMode={elderlyMode}
              />

              <View style={[styles.studioActions, !isDesktop && styles.studioActionsMobile]}>
                {activeCandidates.length > 0 ? (
                  <PressScale onPress={() => setPreviewVisible(true)} style={styles.previewAction}>
                    <View style={styles.previewActionInner}>
                      <Ionicons name="map-outline" size={17} color={C.tealDark} />
                      <Text style={styles.previewActionText}>预览 {activeCandidates.length} 个候选</Text>
                    </View>
                  </PressScale>
                ) : null}
                <PressScale onPress={startPlanning} disabled={planning} style={styles.primaryAction}>
                  <LinearGradient colors={['#17BCAA', '#08766D']} style={styles.primaryActionInner}>
                    {planning ? <ActivityIndicator color="#FFF" /> : <Ionicons name="sparkles" size={17} color="#FFF" />}
                    <Text style={styles.primaryActionText}>{planning ? 'AI 正在规划…' : '进入 AI 规划页'}</Text>
                    <Ionicons name="arrow-forward" size={17} color="#FFF" />
                  </LinearGradient>
                </PressScale>
              </View>
            </Animated.View>
          ) : null}

          {showPreferenceNudge ? (
            <View style={styles.preferenceNudge}>
              <LinearGradient colors={['#0D463F', '#092F2B']} style={styles.preferenceNudgeGradient}>
                <View style={styles.nudgeIcon}><Ionicons name="sparkles" size={21} color={C.gold} /></View>
                <View style={styles.nudgeCopy}>
                  <Text style={styles.nudgeEyebrow}>PERSONAL TRAVEL DNA</Text>
                  <Text style={styles.nudgeTitle}>让 AI 先记住你的旅行底线</Text>
                  <Text style={styles.nudgeText}>过敏、步行量、预算和绝对不要，只设置一次。</Text>
                </View>
                <View style={styles.nudgeActions}>
                  <Pressable onPress={() => navigation.navigate('Preference')} style={styles.nudgePrimary}><Text style={styles.nudgePrimaryText}>去设置</Text></Pressable>
                  <Pressable onPress={dismissPreferencePrompt} style={styles.nudgeLater}><Text style={styles.nudgeLaterText}>稍后</Text></Pressable>
                </View>
              </LinearGradient>
            </View>
          ) : null}

          <Animated.View style={{ transform: [{ translateY: pageLift }] }}>
            <SectionIntro eyebrow="YOUR JOURNEY" title="这趟北京，已经开始了" subtitle={hasRoute ? '真实行程已保存，随时回到今天的路线。' : '还没有固定路线，也正好从此刻开始。'} />
            <CurrentTripCard elderlyMode={elderlyMode} onPress={() => hasRoute ? navigation.navigate('LiveItinerary') : enterPlanning('chat', 'text')} />
          </Animated.View>

          <BeijingDiscoverySection
            places={featured}
            editorialPlaces={editorialAttractions}
            loading={featuredLoading || editorialLoading}
            error={featuredError || editorialError}
            onRetry={() => { loadFeatured(); loadEditorialAttractions(); }}
            elderlyMode={elderlyMode}
            scrollY={scrollY}
            onExplore={place => navigation.navigate('LivePlaceDetail', { placeId: place.id })}
          />

          <View style={styles.serviceSection}>
            <SectionIntro eyebrow="TRAVEL, YOUR WAY" title="现在需要什么，就从这里出发" subtitle="真实酒店、北京味道、盲盒惊喜和附近灵感，都在同一趟旅程里。" />
            <View style={styles.serviceGrid}>
              {QUICK_SERVICES.map((service, index) => (
                <PressScale
                  key={service.id}
                  onPress={() => service.id === 'hotel'
                    ? navigation.navigate('HotelList')
                    : service.id === 'food'
                      ? navigation.navigate('LivePlaces', { category: 'restaurant' })
                      : service.id === 'blind-box'
                        ? navigation.navigate('BlindBox')
                        : navigateToNearby()}
                  style={[styles.serviceCardWrap, isDesktop && styles.serviceCardDesktop, index % 2 === 1 && !isDesktop ? styles.serviceCardOffset : undefined]}
                >
                  <LinearGradient colors={[service.color, service.color + 'B8']} style={styles.serviceCard}>
                    <View style={styles.serviceGlow} />
                    <View style={styles.serviceTop}>
                      <View style={styles.serviceIcon}><Ionicons name={service.icon as any} size={21} color="#FFF" /></View>
                      <Ionicons name="arrow-up" size={18} color="rgba(255,255,255,0.72)" style={styles.serviceArrow} />
                    </View>
                    <View>
                      <Text style={styles.serviceIndex}>0{index + 1}</Text>
                      <Text style={styles.serviceTitle}>{service.title}</Text>
                      <Text style={styles.serviceSubtitle}>{service.subtitle}</Text>
                    </View>
                  </LinearGradient>
                </PressScale>
              ))}
            </View>
          </View>

          <View style={[styles.elderlyCard, elderlyMode && styles.elderlyCardOn]}>
            <View style={styles.elderlyIcon}><Ionicons name="accessibility" size={23} color={C.teal} /></View>
            <View style={styles.elderlyCopy}>
              <Text style={styles.elderlyTitle}>和父母旅行，也可以很轻松</Text>
              <Text style={styles.elderlyText}>开启后，AI 会减少步行、增加休息，并避开不适合的安排。</Text>
            </View>
            <Pressable onPress={() => setElderlyMode(!elderlyMode)} style={[styles.switch, elderlyMode && styles.switchOn]}>
              <View style={[styles.switchThumb, elderlyMode && styles.switchThumbOn]} />
            </Pressable>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerBrand}><View style={styles.footerDot} /><Text style={styles.footerBrandText}>BEIJING FLOW</Text></View>
            <Text style={styles.footerText}>真实地点由高德提供 · 酒店预订由飞猪提供 · AI 由 GLM 驱动</Text>
          </View>
        </Animated.View>
        <View style={{ height: 96 }} />
      </Animated.ScrollView>

      <PlannerModeSelector visible={modePickerVisible} value={mode} onChange={setMode} onClose={() => setModePickerVisible(false)} />
      <PlannerParameterPicker field={picker} value={params} onClose={() => setPicker(null)} onChange={updateParam} />
      <ItineraryPreviewSheet
        visible={previewVisible}
        days={params.days}
        selectedCandidates={activeCandidates}
        modeLabel={PLANNER_MODE_COPY[mode].label}
        onClose={() => setPreviewVisible(false)}
        onViewFull={() => { setPreviewVisible(false); startPlanning(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 0 },
  hero: { position: 'relative', overflow: 'hidden', backgroundColor: '#293230' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  heroOrbOne: { position: 'absolute', width: 420, height: 420, borderRadius: 210, right: -210, top: 130, backgroundColor: 'rgba(20,190,170,0.10)' },
  heroOrbTwo: { position: 'absolute', width: 260, height: 260, borderRadius: 130, left: -150, bottom: 40, backgroundColor: 'rgba(242,193,91,0.08)' },
  headerTint: { position: 'absolute', top: 0, left: 0, right: 0, height: 108, backgroundColor: '#062E2A' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4, paddingHorizontal: 18 },
  headerInner: { width: '100%', maxWidth: 1180, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerInnerDesktop: { minHeight: 58 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: 1.3 },
  brandSub: { color: 'rgba(255,255,255,0.52)', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginTop: 2 },
  desktopNav: { flexDirection: 'row', alignItems: 'center', gap: 30 },
  desktopNavText: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  roundHeaderButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  roundHeaderButtonOn: { backgroundColor: 'rgba(21,187,169,0.58)' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  heroContent: { position: 'absolute', left: 20, right: 20, top: 0, bottom: 32, maxWidth: 1180, alignSelf: 'center', justifyContent: 'center', paddingTop: 82 },
  heroContentDesktop: { left: 40, right: 40, bottom: 20 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.11)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6FE0BD', shadowColor: '#6FE0BD', shadowOpacity: 0.8, shadowRadius: 8 },
  heroBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  heroBadgeDivider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.24)' },
  heroBadgeMeta: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700' },
  heroTitle: { color: '#FFF', fontSize: 40, lineHeight: 48, fontWeight: '900', letterSpacing: -1.2, marginTop: 22, maxWidth: 800, textShadowColor: 'rgba(0,0,0,0.24)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 18 },
  heroTitleDesktop: { fontSize: 66, lineHeight: 76, letterSpacing: -2.4 },
  heroTitleLarge: { fontSize: 48, lineHeight: 56 },
  heroSubtitle: { color: 'rgba(255,255,255,0.74)', fontSize: 14, lineHeight: 23, marginTop: 14, maxWidth: 590 },
  heroSubtitleDesktop: { fontSize: 17, lineHeight: 28 },
  heroComposer: { width: '100%', marginTop: 28, minHeight: 68, padding: 8, paddingLeft: 16, borderRadius: 24, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(4,30,27,0.70)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.19)', shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 28, shadowOffset: { width: 0, height: 16 } },
  heroComposerDesktop: { maxWidth: 760, minHeight: 76, borderRadius: 27 },
  composerMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroInput: { flex: 1, minWidth: 0, height: 50, color: '#FFF', paddingVertical: 0, outlineStyle: 'none' } as any,
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  voiceOrb: { position: 'relative', width: 47, height: 47, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  voicePulse: { position: 'absolute', width: 47, height: 47, borderRadius: 24, backgroundColor: 'rgba(42,210,188,0.45)' },
  sendButton: { width: 50, height: 50, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  quickPromptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  quickPrompt: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  quickPromptText: { color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: '700' },
  planningMethodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  planningMethodButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(5,54,49,0.50)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  planningMethodText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  heroBottomRow: { marginTop: 20, gap: 18 },
  heroBottomRowDesktop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', maxWidth: 760 },
  deepPlanLink: { alignSelf: 'flex-start', minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  deepPlanText: { color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  heroMetrics: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroMetric: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroMetricIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  heroMetricValue: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  heroMetricLabel: { color: 'rgba(255,255,255,0.48)', fontSize: 8, marginTop: 1 },
  scrollCue: { position: 'absolute', right: 18, bottom: 25, alignItems: 'center', gap: 8 },
  scrollCueText: { color: 'rgba(255,255,255,0.42)', fontSize: 7, fontWeight: '800', letterSpacing: 1.2, transform: [{ rotate: '90deg' }], marginBottom: 26 },
  scrollLine: { width: 1, height: 38, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.16)' },
  scrollDot: { width: 1, height: 14, backgroundColor: '#64E0CD' },
  page: { width: '100%', paddingHorizontal: 18, backgroundColor: C.bg },
  pageWide: { maxWidth: 1180, alignSelf: 'center' },
  planningStudio: { marginTop: -45, padding: 20, borderRadius: 28, backgroundColor: '#FFF', shadowColor: '#092F2B', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.16, shadowRadius: 35, elevation: 8, zIndex: 3 },
  studioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  studioEyebrow: { color: C.teal, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  studioTitle: { color: C.ink, fontSize: 23, fontWeight: '900', marginTop: 5 },
  studioSubtitle: { color: C.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 5 },
  studioClose: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF5F3' },
  studioInput: { minHeight: 82, marginTop: 18, padding: 14, borderRadius: 18, color: C.ink, textAlignVertical: 'top', backgroundColor: '#F3F7F5', borderWidth: 1, borderColor: '#E1EAE7', outlineStyle: 'none' } as any,
  studioToolbar: { marginTop: 11, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  studioVoiceButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 22, backgroundColor: '#EAF7F4' },
  studioVoiceText: { color: C.tealDark, fontSize: 11, fontWeight: '800' },
  studioModeButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 22, backgroundColor: '#F4F6F5' },
  studioModeText: { color: C.ink, fontSize: 11, fontWeight: '800' },
  params: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  param: { minHeight: 42, paddingHorizontal: 12, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3F7F5', borderWidth: 1, borderColor: '#E0EAE7' },
  paramValue: { color: C.ink, fontSize: 11, fontWeight: '800' },
  largeTouch: { minHeight: 48 },
  studioActions: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  studioActionsMobile: { alignItems: 'stretch', flexDirection: 'column' },
  previewAction: { minWidth: 180 },
  previewActionInner: { minHeight: 52, paddingHorizontal: 18, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#E6F5F1' },
  previewActionText: { color: C.tealDark, fontSize: 12, fontWeight: '800' },
  primaryAction: { minWidth: 220 },
  primaryActionInner: { minHeight: 52, paddingHorizontal: 20, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  preferenceNudge: { marginTop: 28, borderRadius: 25, overflow: 'hidden' },
  preferenceNudgeGradient: { minHeight: 126, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  nudgeIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  nudgeCopy: { flex: 1 },
  nudgeEyebrow: { color: '#6FDCC8', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  nudgeTitle: { color: '#FFF', fontSize: 15, fontWeight: '900', marginTop: 4 },
  nudgeText: { color: 'rgba(255,255,255,0.56)', fontSize: 10, lineHeight: 15, marginTop: 3 },
  nudgeActions: { alignItems: 'center', gap: 4 },
  nudgePrimary: { minHeight: 38, paddingHorizontal: 15, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: C.teal },
  nudgePrimaryText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  nudgeLater: { padding: 6 },
  nudgeLaterText: { color: 'rgba(255,255,255,0.52)', fontSize: 9, fontWeight: '700' },
  sectionIntro: { marginTop: 68, marginBottom: 18, maxWidth: 690 },
  sectionEyebrow: { color: C.teal, fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  sectionEyebrowLight: { color: '#6FE0CD' },
  sectionTitle: { color: C.ink, fontSize: 28, lineHeight: 35, fontWeight: '900', letterSpacing: -0.7, marginTop: 7 },
  sectionTitleLight: { color: '#FFF' },
  sectionSubtitle: { color: C.textSecondary, fontSize: 12, lineHeight: 20, marginTop: 7 },
  sectionSubtitleLight: { color: 'rgba(255,255,255,0.58)' },
  serviceSection: { marginTop: 14 },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  serviceCardWrap: { width: '48%', borderRadius: 24, overflow: 'hidden' },
  serviceCardDesktop: { width: '23.7%' },
  serviceCardOffset: { marginTop: 22 },
  serviceCard: { minHeight: 190, padding: 17, justifyContent: 'space-between', overflow: 'hidden' },
  serviceGlow: { position: 'absolute', width: 170, height: 170, borderRadius: 85, right: -75, top: -85, backgroundColor: 'rgba(255,255,255,0.11)' },
  serviceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serviceIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.17)' },
  serviceArrow: { transform: [{ rotate: '45deg' }] },
  serviceIndex: { color: 'rgba(255,255,255,0.46)', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  serviceTitle: { color: '#FFF', fontSize: 19, fontWeight: '900', marginTop: 7 },
  serviceSubtitle: { color: 'rgba(255,255,255,0.68)', fontSize: 10, marginTop: 3 },
  elderlyCard: { marginTop: 58, padding: 18, borderRadius: 24, flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5F2EE', borderWidth: 1, borderColor: '#D5E8E2' },
  elderlyCardOn: { borderColor: '#8DD8CB', backgroundColor: '#DCF2ED' },
  elderlyIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  elderlyCopy: { flex: 1, marginHorizontal: 13 },
  elderlyTitle: { color: C.ink, fontSize: 13, fontWeight: '900' },
  elderlyText: { color: C.textSecondary, fontSize: 10, lineHeight: 16, marginTop: 3 },
  switch: { width: 49, height: 29, borderRadius: 15, padding: 4, justifyContent: 'center', backgroundColor: '#BDCFCA' },
  switchOn: { backgroundColor: C.teal },
  switchThumb: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
  switchThumbOn: { alignSelf: 'flex-end' },
  footer: { marginTop: 54, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#DDE7E4', alignItems: 'center', gap: 8 },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  footerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.teal },
  footerBrandText: { color: C.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  footerText: { color: '#82928E', fontSize: 9, textAlign: 'center' },
});
