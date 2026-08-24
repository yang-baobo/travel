import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import type { ExploreStackParamList } from '../../types';
import {
  AUTO_PLAN_VARIANTS,
  BEIJING_CANDIDATES,
  DEFAULT_PLANNER_PARAMS,
  PLANNER_MODE_COPY,
  PlannerCandidate,
  PlannerMode,
  PlannerParams,
  QUICK_SERVICES,
} from '../../data/beijingHomeMock';
import CurrentTripCard from '../../components/home/CurrentTripCard';
import ItineraryPreviewSheet from '../../components/home/ItineraryPreviewSheet';
import PlannerCandidatePanel from '../../components/home/PlannerCandidatePanel';
import PlannerModeSelector from '../../components/home/PlannerModeSelector';
import PlannerParameterPicker from '../../components/home/PlannerParameterPicker';
import PreferenceConfirmationCard from '../../components/home/PreferenceConfirmationCard';
import BeijingDiscoverySection from '../../components/home/BeijingDiscoverySection';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'Home'>;
type ParameterField = keyof PlannerParams;
const C = { teal: '#0E9F93', tealDark: '#0A7A70', ink: '#0F2B27', gold: '#F5C351', bg: '#F6F9F8', textSecondary: '#617571' };
const HERO_IMAGE = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=1400&q=85';

export default function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const elderlyMode = usePreferenceStore(state => state.elderlyMode);
  const setElderlyMode = usePreferenceStore(state => state.setElderlyMode);
  const hasSetPreferences = usePreferenceStore(state => state.hasSetPreferences);
  const preferencePromptDismissed = usePreferenceStore(state => state.preferencePromptDismissed);
  const dismissPreferencePrompt = usePreferenceStore(state => state.dismissPreferencePrompt);
  const [params, setParams] = useState<PlannerParams>(DEFAULT_PLANNER_PARAMS);
  const [mode, setMode] = useState<PlannerMode>('auto');
  const [modePickerVisible, setModePickerVisible] = useState(false);
  const [picker, setPicker] = useState<ParameterField | null>(null);
  const [input, setInput] = useState('想带父母慢慢逛北京，看看故宫，再找一家好吃的烤鸭');
  const [listening, setListening] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [heroBroken, setHeroBroken] = useState(false);
  const [preferenceCard, setPreferenceCard] = useState(true);
  const [preferenceScope, setPreferenceScope] = useState<'once' | 'saved' | 'ignored' | 'edited' | null>(null);
  const [sessionPreference, setSessionPreference] = useState('带父母、少走路、想吃烤鸭');
  const [selectedIds, setSelectedIds] = useState<string[]>(['candidate-forbidden-city']);
  const [suggestedIds, setSuggestedIds] = useState<string[]>(['candidate-hotel', 'candidate-food', 'candidate-shichahai']);
  const [ignoredIds, setIgnoredIds] = useState<string[]>([]);
  const [autoPlanIds, setAutoPlanIds] = useState<string[]>([]);
  const scrollY = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const planningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = elderlyMode ? 1.14 : 1;
  const showPreferencePrompt = !hasSetPreferences && !preferencePromptDismissed;
  const activePlanIds = mode === 'auto' ? autoPlanIds : selectedIds;
  const activeCandidates = BEIJING_CANDIDATES.filter(item => activePlanIds.includes(item.id));
  const headerBackground = scrollY.interpolate({ inputRange: [0, 80, 180], outputRange: [0, 0.28, 0.92], extrapolate: 'clamp' });
  const heroTranslate = scrollY.interpolate({ inputRange: [0, 360], outputRange: [0, 92], extrapolate: 'clamp' });
  const heroScale = scrollY.interpolate({ inputRange: [0, 360], outputRange: [1, 1.12], extrapolate: 'clamp' });
  const heroContentTranslate = scrollY.interpolate({ inputRange: [0, 320], outputRange: [0, -42], extrapolate: 'clamp' });

  useEffect(() => () => { if (planningTimer.current) clearTimeout(planningTimer.current); }, []);
  useEffect(() => {
    if (!listening) { pulse.stopAnimation(); pulse.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1.18, duration: 650, useNativeDriver: true }), Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true })]));
    animation.start(); return () => animation.stop();
  }, [listening, pulse]);
  useEffect(() => {
    if (mode === 'complete') {
      const missing = ['candidate-hotel', 'candidate-food', 'candidate-shichahai'].filter(id => !selectedIds.includes(id));
      setSuggestedIds(missing);
    }
  }, [mode, selectedIds]);

  const updateParam = (field: ParameterField, value: string) => setParams(current => ({ ...current, [field]: value }));
  const handleToggleCandidate = (candidate: PlannerCandidate) => {
    setSelectedIds(ids => ids.includes(candidate.id) ? ids.filter(id => id !== candidate.id) : [...ids, candidate.id]);
  };
  const handleSuggestion = (candidate: PlannerCandidate, action: 'accept' | 'replace' | 'ignore') => {
    if (action === 'accept') { setSelectedIds(ids => ids.includes(candidate.id) ? ids : [...ids, candidate.id]); return; }
    if (action === 'ignore') { setIgnoredIds(ids => ids.includes(candidate.id) ? ids : [...ids, candidate.id]); return; }
    const replacement = BEIJING_CANDIDATES.find(item => item.category === candidate.category && item.id !== candidate.id && !selectedIds.includes(item.id) && !suggestedIds.includes(item.id));
    if (replacement) setSuggestedIds(ids => ids.map(id => id === candidate.id ? replacement.id : id));
  };
  const handleAutoReplace = (candidate: PlannerCandidate) => {
    const replacement = BEIJING_CANDIDATES.find(item => item.category === candidate.category && item.id !== candidate.id && !autoPlanIds.includes(item.id));
    if (replacement) setAutoPlanIds(ids => ids.map(id => id === candidate.id ? replacement.id : id));
  };
  const handleAutoToggle = (candidate: PlannerCandidate) => setAutoPlanIds(ids => ids.includes(candidate.id) ? ids.filter(id => id !== candidate.id) : [...ids, candidate.id]);
  const handlePreferenceAction = (action: 'once' | 'save' | 'edit' | 'ignore') => {
    if (action === 'once') setPreferenceScope('once');
    if (action === 'save') setPreferenceScope('saved');
    if (action === 'edit') setPreferenceScope('edited');
    if (action === 'ignore') setPreferenceScope('ignored');
    setPreferenceCard(false);
  };
  const startPlanning = () => {
    if (planning || (mode === 'auto' && preferenceCard)) return;
    if (mode === 'auto') {
      const names = [...(AUTO_PLAN_VARIANTS[params.days] || AUTO_PLAN_VARIANTS['4天'])];
      if (params.pace === '紧凑游' && !names.includes('慕田峪长城')) names.push('慕田峪长城');
      if (params.people === '家庭') { setAutoPlanIds(names.filter(name => name !== '慕田峪长城').map(name => BEIJING_CANDIDATES.find(item => item.name === name)?.id).filter((id): id is string => Boolean(id))); }
      else if (params.budget === '¥3000') { setAutoPlanIds(names.filter(name => name !== '前门胡同设计酒店').map(name => BEIJING_CANDIDATES.find(item => item.name === name)?.id).filter((id): id is string => Boolean(id))); }
      else {
        if (params.budget === '¥8000' && !names.includes('慕田峪长城')) names.push('慕田峪长城');
        setAutoPlanIds(names.map(name => BEIJING_CANDIDATES.find(item => item.name === name)?.id).filter((id): id is string => Boolean(id)));
      }
    }
    setPlanning(true);
    planningTimer.current = setTimeout(() => { setPlanning(false); setPreviewVisible(true); }, 1600);
  };
  const navigateToNearby = () => navigation.navigate('LivePlaces', { category: 'attraction' });

  return <SafeAreaView style={styles.container} edges={[]}>
    <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} scrollEventThrottle={16} onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}>
      <View style={styles.heroWrap}>
        {!heroBroken ? <Animated.Image source={{ uri: HERO_IMAGE }} onError={() => setHeroBroken(true)} style={[styles.heroImage, { transform: [{ translateY: heroTranslate }, { scale: heroScale }] }]} /> : <LinearGradient colors={['#146D65', '#062D29']} style={styles.heroFallback} />}
        <LinearGradient colors={['rgba(5,33,29,0.04)', 'rgba(5,33,29,0.42)', 'rgba(5,33,29,0.96)']} style={styles.heroOverlay}><Animated.View style={{ transform: [{ translateY: heroContentTranslate }] }}><HeroContent insets={insets} scale={scale} listening={listening} onVoice={() => setListening(value => !value)} /></Animated.View></LinearGradient>
        <Animated.View pointerEvents="none" style={[styles.headerTint, { opacity: headerBackground }]} />
        <View style={[styles.header, { paddingTop: insets.top + 9 }]}><View style={styles.location}><Ionicons name="location" size={15} color="#FFF" /><Text style={[styles.headerText, { fontSize: 12 * scale }]}>北京</Text><Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.72)" /></View><View style={styles.headerActions}><Pressable onPress={() => setElderlyMode(!elderlyMode)} style={[styles.headerButton, elderlyMode && styles.headerButtonOn]}><Ionicons name="accessibility-outline" size={19 * scale} color="#FFF" /></Pressable><Pressable onPress={() => navigation.getParent()?.navigate('个人' as never)} style={styles.avatar}><Ionicons name="person" size={16 * scale} color={C.tealDark} /></Pressable></View></View>
      </View>
      <View style={styles.body}>
        <View style={styles.plannerCard}><View style={styles.plannerHeader}><View><Text style={styles.plannerEyebrow}>AI TRAVEL PLANNER</Text><Text style={[styles.plannerTitle, { fontSize: 21 * scale }]}>把想法交给 AI</Text></View><View style={styles.aiOrb}><Ionicons name="sparkles" size={18 * scale} color={C.gold} /></View></View>
          <TextInput value={input} onChangeText={value => { setInput(value); if (value.trim()) setPreferenceCard(true); }} multiline placeholder="告诉我你想怎么玩北京……" placeholderTextColor="#97A8A3" style={[styles.input, { minHeight: 66 * scale, fontSize: 14 * scale }]} />
          <PreferenceConfirmationCard visible={preferenceCard && input.trim().length > 0} preference={sessionPreference} large={elderlyMode} onPreferenceChange={setSessionPreference} onAction={handlePreferenceAction} />
          <View style={styles.plannerTools}><Pressable onPress={() => setListening(value => !value)} style={[styles.voiceButton, listening && styles.voiceButtonActive, elderlyMode && styles.largeTouch]}><Animated.View style={{ transform: [{ scale: pulse }] }}><Ionicons name={listening ? 'radio-outline' : 'mic-outline'} size={17 * scale} color={listening ? '#FFF' : C.teal} /></Animated.View><Text style={[styles.voiceText, listening && styles.voiceTextActive, { fontSize: 11 * scale }]}>{listening ? '正在聆听…' : '语音输入'}</Text></Pressable><Text style={[styles.modeHint, { fontSize: 11 * scale }]}>{PLANNER_MODE_COPY[mode].label}</Text></View>
          <View style={styles.params}>{(['days', 'people', 'budget', 'pace'] as ParameterField[]).map(field => <Pressable key={field} onPress={() => setPicker(field)} style={[styles.param, elderlyMode && styles.largeTouch]}><Text style={[styles.paramValue, { fontSize: 11 * scale }]}>{params[field]}</Text><Ionicons name="chevron-down" size={13 * scale} color={C.teal} /></Pressable>)}</View>
          <Pressable onPress={startPlanning} disabled={planning || (mode === 'auto' && preferenceCard)} style={[styles.planButton, (mode === 'auto' && preferenceCard) && styles.planButtonMuted, elderlyMode && styles.largeTouch]}>{planning ? <><ActivityIndicator color="#FFF" /><Text style={styles.planButtonText}>AI 正在整理路线…</Text></> : <><Ionicons name="sparkles" size={17 * scale} color="#FFF" /><Text style={[styles.planButtonText, { fontSize: 14 * scale }]}>开始规划</Text><Ionicons name="arrow-forward" size={16 * scale} color="#FFF" /></>}</Pressable>
          {mode === 'auto' && preferenceCard && <Text style={styles.confirmHint}>请先确认 AI 识别到的偏好，再生成方案</Text>}
          <Pressable onPress={() => setModePickerVisible(value => !value)} style={[styles.modeLink, elderlyMode && styles.largeTouch]}><Text style={[styles.modeLinkText, { fontSize: 11 * scale }]}>选择规划方式 · 当前：{PLANNER_MODE_COPY[mode].label}</Text><Ionicons name="options-outline" size={15 * scale} color={C.teal} /></Pressable>
          {modePickerVisible && <PlannerModeSelector value={mode} onChange={value => { setMode(value); setModePickerVisible(false); }} />}
          {(mode !== 'auto' || autoPlanIds.length > 0) && <PlannerCandidatePanel mode={mode} selectedIds={mode === 'auto' ? autoPlanIds : selectedIds} suggestedIds={suggestedIds} ignoredIds={ignoredIds} autoPlanIds={autoPlanIds} onToggle={mode === 'auto' ? handleAutoToggle : handleToggleCandidate} onSuggestion={handleSuggestion} onAutoReplace={handleAutoReplace} elderlyMode={elderlyMode} />}
        </View>
        <SectionTitle eyebrow="MY BEIJING JOURNEY" title="我的北京之旅" subtitle="行程已经准备好，今天慢慢走就好" scale={scale} />
        <CurrentTripCard elderlyMode={elderlyMode} onPress={() => navigation.navigate('LiveItinerary')} />
        <BeijingDiscoverySection elderlyMode={elderlyMode} scrollY={scrollY} onExplore={navigateToNearby} />
        <SectionTitle eyebrow="QUICK SERVICES" title="为这趟旅行，再准备一点" scale={scale} />
        <View style={styles.quickGrid}>{QUICK_SERVICES.map((service, index) => <Pressable key={service.id} onPress={() => service.id === 'hotel' ? navigation.navigate('HotelList') : service.id === 'food' ? navigation.navigate('LivePlaces', { category: 'restaurant' }) : service.id === 'blind-box' ? navigation.navigate('BlindBox') : navigateToNearby()} style={({ pressed }) => [styles.quickService, index % 3 === 1 && styles.quickServiceOffset, pressed && styles.quickPressed]}><LinearGradient colors={[service.color, `${service.color}C4`]} style={styles.quickCard}><Ionicons name={service.icon as any} size={22 * scale} color="#FFF" /><Text style={[styles.quickTitle, { fontSize: 15 * scale }]}>{service.title}</Text><Text style={[styles.quickSubtitle, { fontSize: 10 * scale }]}>{service.subtitle}</Text></LinearGradient></Pressable>)}</View>
        <View style={[styles.elderlyCard, elderlyMode && styles.elderlyCardOn]}><View style={styles.elderlyIcon}><Ionicons name="accessibility" size={22 * scale} color={C.teal} /></View><View style={styles.elderlyCopy}><Text style={[styles.elderlyTitle, { fontSize: 13 * scale }]}>和父母旅行，也可以很轻松</Text><Text style={[styles.elderlyText, { fontSize: 10 * scale }]}>AI 已自动为长辈优化：少步行、多休息、准点吃饭</Text></View><Pressable onPress={() => setElderlyMode(!elderlyMode)} style={[styles.switch, elderlyMode && styles.switchOn, elderlyMode && styles.largeTouch]}><View style={[styles.switchThumb, elderlyMode && styles.switchThumbOn]} /></Pressable></View>
        <View style={styles.footerNote}><Ionicons name="sparkles-outline" size={15} color={C.teal} /><Text style={styles.footerText}>北京首页 Prototype · AI 规划结果可继续调整</Text></View><View style={{ height: 50 }} />
      </View>
    </Animated.ScrollView>
    <PlannerParameterPicker field={picker} value={params} onClose={() => setPicker(null)} onChange={updateParam} />
    <ItineraryPreviewSheet visible={previewVisible} days={params.days} selectedCandidates={activeCandidates} modeLabel={PLANNER_MODE_COPY[mode].label} onClose={() => setPreviewVisible(false)} onViewFull={() => { setPreviewVisible(false); navigation.navigate('LiveItinerary'); }} />
    <Modal visible={showPreferencePrompt} transparent animationType="fade"><View style={styles.promptOverlay}><View style={styles.promptCard}><Ionicons name="sparkles" size={28} color={C.teal} /><Text style={styles.promptTitle}>先设置一次旅行偏好？</Text><Text style={styles.promptText}>设置完成后，AI 会更懂你的北京旅行节奏。</Text><Pressable style={styles.promptButton} onPress={() => navigation.navigate('Preference')}><Text style={styles.promptButtonText}>去设置</Text></Pressable><Pressable onPress={dismissPreferencePrompt} style={styles.later}><Text style={styles.laterText}>稍后再说</Text></Pressable></View></View></Modal>
  </SafeAreaView>;
}

function HeroContent({ insets, scale, listening, onVoice }: { insets: { top: number }; scale: number; listening: boolean; onVoice: () => void }) {
  return <View style={[styles.heroContent, { paddingTop: insets.top + 70 }]}><View style={styles.heroBadge}><View style={styles.liveDot} /><Text style={styles.heroBadgeText}>AI TRAVEL · BEIJING</Text></View><Text style={[styles.heroTitle, { fontSize: 31 * scale, lineHeight: 40 * scale }]}>今天，想怎么玩北京？</Text><Text style={[styles.heroSubtitle, { fontSize: 13 * scale }]}>告诉 AI 你的时间、预算和旅行偏好，剩下的路线交给我们。</Text><Pressable onPress={onVoice} style={[styles.heroVoice, listening && styles.heroVoiceActive, scale > 1 && styles.largeTouch]}><Ionicons name={listening ? 'radio-outline' : 'mic-outline'} size={20 * scale} color="#FFF" /><Text style={[styles.heroVoiceText, { fontSize: 11 * scale }]}>{listening ? '正在聆听… 再点停止' : '也可以直接说给我听'}</Text></Pressable></View>;
}

function SectionTitle({ eyebrow, title, subtitle, scale = 1 }: { eyebrow: string; title: string; subtitle?: string; scale?: number }) {
  return <View style={styles.sectionTitle}><Text style={[styles.eyebrow, { fontSize: 10 * scale }]}>{eyebrow}</Text><Text style={[styles.sectionHeading, { fontSize: 22 * scale }]}>{title}</Text>{subtitle && <Text style={[styles.sectionSubtitle, { fontSize: 12 * scale }]}>{subtitle}</Text>}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg }, content: { paddingBottom: 0 }, heroWrap: { height: 480, overflow: 'hidden', backgroundColor: '#0A403A' }, heroImage: { position: 'absolute', top: -55, left: -22, right: -22, width: 'auto', height: 590, resizeMode: 'cover' }, heroFallback: { ...StyleSheet.absoluteFillObject }, heroOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' }, headerTint: { ...StyleSheet.absoluteFillObject, height: 105, backgroundColor: '#0B4B43' }, header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, location: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' }, headerText: { color: '#FFF', fontWeight: '800' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 }, headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }, headerButtonOn: { backgroundColor: 'rgba(245,195,81,0.3)' }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' }, heroContent: { paddingHorizontal: 22, paddingBottom: 34, gap: 14 }, heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#65E0B2' }, heroBadgeText: { color: 'rgba(255,255,255,0.88)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, heroTitle: { color: '#FFF', fontWeight: '900', letterSpacing: 0.2 }, heroSubtitle: { maxWidth: 340, color: 'rgba(255,255,255,0.78)', lineHeight: 21 }, heroVoice: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, minHeight: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' }, heroVoiceActive: { backgroundColor: 'rgba(14,159,147,0.8)' }, heroVoiceText: { color: '#FFF', fontWeight: '700' }, body: { paddingHorizontal: 18, paddingTop: 0 }, plannerCard: { marginTop: -34, padding: 18, borderRadius: 25, backgroundColor: '#FFF', shadowColor: '#0F2B27', shadowOffset: { width: 0, height: 15 }, shadowOpacity: 0.14, shadowRadius: 25, elevation: 7 }, plannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, plannerEyebrow: { color: C.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, plannerTitle: { color: C.ink, fontWeight: '900', marginTop: 5 }, aiOrb: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7DD' }, input: { marginTop: 16, color: C.ink, lineHeight: 21, textAlignVertical: 'top', padding: 13, borderRadius: 16, backgroundColor: '#F5F9F7', borderWidth: 1, borderColor: '#E4EEEA' }, plannerTools: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, voiceButton: { minHeight: 42, paddingHorizontal: 11, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF8F6' }, voiceButtonActive: { backgroundColor: C.teal }, voiceText: { color: C.tealDark, fontWeight: '700' }, voiceTextActive: { color: '#FFF' }, modeHint: { color: '#8B9D98' }, params: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }, param: { minHeight: 42, paddingHorizontal: 11, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F3F7F5', borderWidth: 1, borderColor: '#E3ECE9' }, paramValue: { color: C.ink, fontWeight: '800' }, largeTouch: { minHeight: 48 }, planButton: { minHeight: 52, marginTop: 16, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.teal }, planButtonMuted: { opacity: 0.58 }, planButtonText: { color: '#FFF', fontWeight: '900' }, confirmHint: { color: '#A26B1D', fontSize: 10, textAlign: 'center', marginTop: 8 }, modeLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, modeLinkText: { color: C.tealDark, fontWeight: '700' }, sectionTitle: { marginTop: 31, marginBottom: 13 }, eyebrow: { color: C.teal, fontWeight: '900', letterSpacing: 1.5 }, sectionHeading: { color: C.ink, fontWeight: '900', marginTop: 5 }, sectionSubtitle: { color: C.textSecondary, marginTop: 4 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }, quickService: { width: '48%', borderRadius: 20, overflow: 'hidden' }, quickServiceOffset: { marginTop: 22 }, quickPressed: { opacity: 0.86, transform: [{ scale: 0.975 }] }, quickCard: { minHeight: 124, padding: 16, justifyContent: 'space-between' }, quickTitle: { color: '#FFF', fontWeight: '900', marginTop: 12 }, quickSubtitle: { color: 'rgba(255,255,255,0.78)' }, elderlyCard: { marginTop: 30, padding: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF6F3' }, elderlyCardOn: { borderWidth: 1, borderColor: '#A9DED4' }, elderlyIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' }, elderlyCopy: { flex: 1, marginHorizontal: 12 }, elderlyTitle: { color: C.ink, fontWeight: '900' }, elderlyText: { color: C.textSecondary, lineHeight: 17, marginTop: 3 }, switch: { width: 48, height: 28, borderRadius: 15, padding: 4, justifyContent: 'center', backgroundColor: '#C9D8D4' }, switchOn: { backgroundColor: C.teal }, switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF' }, switchThumbOn: { alignSelf: 'flex-end' }, footerNote: { marginTop: 24, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, footerText: { color: '#81938E', fontSize: 10 }, promptOverlay: { flex: 1, backgroundColor: 'rgba(5,32,28,0.55)', justifyContent: 'center', alignItems: 'center', padding: 30 }, promptCard: { width: '100%', maxWidth: 340, backgroundColor: '#FFF', borderRadius: 24, padding: 26, alignItems: 'center' }, promptTitle: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 12 }, promptText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 }, promptButton: { alignSelf: 'stretch', minHeight: 48, marginTop: 20, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.teal }, promptButtonText: { color: '#FFF', fontWeight: '800' }, later: { minHeight: 44, padding: 12, justifyContent: 'center' }, laterText: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
});
