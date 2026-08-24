import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, ImageBackground, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchTravelConfig } from '../../services/travelDataService';
import { useAssistantStore } from '../../store/useAssistantStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import type { ExploreStackParamList } from '../../types';
import type { TravelProviderStatus } from '../../types/travel';
import { DEFAULT_PLANNER_PARAMS, BEIJING_EXPLORE_CARDS, PLANNER_MODE_COPY, PlannerParams, PlannerMode, QUICK_SERVICES, BeijingExploreCard } from '../../data/beijingHomeMock';
import CurrentTripCard from '../../components/home/CurrentTripCard';
import ItineraryPreviewSheet from '../../components/home/ItineraryPreviewSheet';
import PlannerParameterPicker from '../../components/home/PlannerParameterPicker';
import PlannerModeSelector from '../../components/home/PlannerModeSelector';
import PreferenceConfirmationCard from '../../components/home/PreferenceConfirmationCard';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'Home'>;
type ParameterField = keyof PlannerParams;
const C = { teal: '#0E9F93', tealDark: '#0A7A70', ink: '#0F2B27', gold: '#F5C351', bg: '#F6F9F8', textSecondary: '#617571' };
const HERO_IMAGE = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=1400&q=85';

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return <View style={styles.sectionTitle}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.sectionHeading}>{title}</Text>{subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}</View>;
}

function PressScale({ onPress, children, style }: { onPress: () => void; children: React.ReactNode; style?: object }) {
  const scale = useRef(new Animated.Value(1)).current;
  return <Pressable style={style} onPress={onPress} onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()} onPressOut={() => Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }).start()}><Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View></Pressable>;
}

export default function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const openAssistant = useAssistantStore(state => state.openAssistant);
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
  const [preferenceCard, setPreferenceCard] = useState(true);
  const [heroBroken, setHeroBroken] = useState(false);
  const [status, setStatus] = useState<TravelProviderStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const scale = elderlyMode ? 1.16 : 1;
  const showPreferencePrompt = !hasSetPreferences && !preferencePromptDismissed;

  useEffect(() => { fetchTravelConfig().then(setStatus).catch(() => setStatusError(true)); }, []);
  useEffect(() => {
    if (!listening) { pulse.stopAnimation(); pulse.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1.18, duration: 650, useNativeDriver: true }), Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true })]));
    animation.start(); return () => animation.stop();
  }, [listening, pulse]);

  const updateParam = (field: ParameterField, value: string) => setParams(current => ({ ...current, [field]: value }));
  const startPlanning = () => { setPlanning(true); setTimeout(() => { setPlanning(false); setPreviewVisible(true); }, 1600); };
  const handlePreferenceAction = (action: 'once' | 'save' | 'edit' | 'ignore') => { if (action === 'edit') { navigation.navigate('Preference'); return; } setPreferenceCard(false); };

  return <SafeAreaView style={styles.container} edges={[]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.heroWrap}>
        {!heroBroken ? <ImageBackground source={{ uri: HERO_IMAGE }} style={styles.hero} imageStyle={styles.heroImage} onError={() => setHeroBroken(true)}><LinearGradient colors={['rgba(5,33,29,0.04)', 'rgba(5,33,29,0.42)', 'rgba(5,33,29,0.96)']} style={styles.heroOverlay}><HeroContent insets={insets} scale={scale} onVoice={openAssistant} /></LinearGradient></ImageBackground> : <LinearGradient colors={['#146D65', '#062D29']} style={styles.hero}><HeroContent insets={insets} scale={scale} onVoice={openAssistant} /></LinearGradient>}
        <View style={styles.header}><View style={styles.location}><Ionicons name="location" size={15} color="#FFF" /><Text style={styles.headerText}>北京</Text><Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.72)" /></View><View style={styles.headerActions}><Pressable onPress={() => setElderlyMode(!elderlyMode)} style={styles.headerButton}><Ionicons name="accessibility-outline" size={19} color="#FFF" /></Pressable><Pressable onPress={() => navigation.getParent()?.navigate('个人' as never)} style={styles.avatar}><Ionicons name="person" size={16} color={C.tealDark} /></Pressable></View></View>
      </View>
      <View style={styles.body}>
        <View style={styles.plannerCard}><View style={styles.plannerHeader}><View><Text style={styles.plannerEyebrow}>AI TRAVEL PLANNER</Text><Text style={[styles.plannerTitle, { fontSize: 21 * scale }]}>把想法交给 AI</Text></View><View style={styles.aiOrb}><Ionicons name="sparkles" size={18} color={C.gold} /></View></View>
          <TextInput value={input} onChangeText={value => { setInput(value); setPreferenceCard(value.trim().length > 0); }} multiline placeholder="告诉我你想怎么玩北京……" placeholderTextColor="#97A8A3" style={[styles.input, { minHeight: 66 * scale, fontSize: 14 * scale }]} />
          <PreferenceConfirmationCard visible={preferenceCard && input.trim().length > 0} preference="带父母、少走路、想吃烤鸭" onAction={handlePreferenceAction} />
          <View style={styles.plannerTools}><Pressable onPress={() => setListening(value => !value)} style={[styles.voiceButton, listening && styles.voiceButtonActive]}><Animated.View style={{ transform: [{ scale: pulse }] }}><Ionicons name={listening ? 'radio-outline' : 'mic-outline'} size={17} color={listening ? '#FFF' : C.teal} /></Animated.View><Text style={[styles.voiceText, listening && styles.voiceTextActive]}>{listening ? '正在聆听…' : '语音输入'}</Text></Pressable><Text style={styles.modeHint}>{PLANNER_MODE_COPY[mode].label}</Text></View>
          <View style={styles.params}>{(['days', 'people', 'budget', 'pace'] as ParameterField[]).map(field => <Pressable key={field} onPress={() => setPicker(field)} style={styles.param}><Text style={styles.paramValue}>{params[field]}</Text><Ionicons name="chevron-down" size={13} color={C.teal} /></Pressable>)}</View>
          <Pressable onPress={startPlanning} disabled={planning} style={styles.planButton}>{planning ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="sparkles" size={17} color="#FFF" /><Text style={styles.planButtonText}>开始规划</Text><Ionicons name="arrow-forward" size={16} color="#FFF" /></>}</Pressable>
          <Pressable onPress={() => setModePickerVisible(value => !value)} style={styles.modeLink}><Text style={styles.modeLinkText}>选择规划方式 · 当前：{PLANNER_MODE_COPY[mode].label}</Text><Ionicons name="options-outline" size={15} color={C.teal} /></Pressable>
          {modePickerVisible && <PlannerModeSelector value={mode} onChange={value => { setMode(value); setModePickerVisible(false); }} />}
        </View>
        <SectionTitle eyebrow="MY BEIJING JOURNEY" title="我的北京之旅" subtitle="行程已经准备好，今天慢慢走就好" />
        <CurrentTripCard elderlyMode={elderlyMode} onPress={() => navigation.navigate('LiveItinerary')} />
        <SectionTitle eyebrow="EXPLORE BEIJING" title="发现北京" subtitle="北京，远不止一条路线" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exploreList}>{BEIJING_EXPLORE_CARDS.map(card => <PressScale key={card.id} onPress={() => navigation.navigate('LivePlaces', { category: 'attraction' })}><ExploreCard card={card} /></PressScale>)}</ScrollView>
        <SectionTitle eyebrow="QUICK SERVICES" title="为这趟旅行，再准备一点" />
        <View style={styles.quickGrid}>{QUICK_SERVICES.map(service => <PressScale key={service.id} onPress={() => service.id === 'hotel' ? navigation.navigate('HotelList') : service.id === 'food' ? navigation.navigate('LivePlaces', { category: 'restaurant' }) : service.id === 'blind-box' ? navigation.navigate('BlindBox') : navigation.navigate('LivePlaces', { category: 'attraction' })} style={styles.quickHalf}><View style={[styles.quickCard, { backgroundColor: service.color }]}><Ionicons name={service.icon as any} size={22} color="#FFF" /><Text style={styles.quickTitle}>{service.title}</Text><Text style={styles.quickSubtitle}>{service.subtitle}</Text></View></PressScale>)}</View>
        <View style={styles.elderlyCard}><View style={styles.elderlyIcon}><Ionicons name="accessibility" size={22} color={C.teal} /></View><View style={styles.elderlyCopy}><Text style={styles.elderlyTitle}>和父母旅行，也可以很轻松</Text><Text style={styles.elderlyText}>AI 会自动减少步行、增加休息，并安排准点用餐</Text></View><Pressable onPress={() => setElderlyMode(!elderlyMode)} style={[styles.switch, elderlyMode && styles.switchOn]}><View style={[styles.switchThumb, elderlyMode && styles.switchThumbOn]} /></Pressable></View>
        <View style={styles.statusCard}><Text style={styles.statusTitle}>北京旅行数据</Text>{statusError ? <Text style={styles.statusText}>当前使用本地演示数据</Text> : status ? <Text style={styles.statusText}>实时服务已连接 · Mock 可随时替换 API</Text> : <ActivityIndicator size="small" color={C.teal} />}</View><View style={{ height: 48 }} />
      </View>
    </ScrollView>
    <PlannerParameterPicker field={picker} value={params} onClose={() => setPicker(null)} onChange={updateParam} />
    <ItineraryPreviewSheet visible={previewVisible} days={params.days} onClose={() => setPreviewVisible(false)} onViewFull={() => { setPreviewVisible(false); navigation.navigate('LiveItinerary'); }} />
    <Modal visible={showPreferencePrompt} transparent animationType="fade"><View style={styles.promptOverlay}><View style={styles.promptCard}><Ionicons name="sparkles" size={28} color={C.teal} /><Text style={styles.promptTitle}>先设置一次旅行偏好？</Text><Text style={styles.promptText}>设置完成后，AI 会更懂你的北京旅行节奏。</Text><TouchableOpacity style={styles.promptButton} onPress={() => navigation.navigate('Preference')}><Text style={styles.promptButtonText}>去设置</Text></TouchableOpacity><TouchableOpacity onPress={dismissPreferencePrompt} style={styles.later}><Text style={styles.laterText}>稍后再说</Text></TouchableOpacity></View></View></Modal>
  </SafeAreaView>;
}

function HeroContent({ insets, scale, onVoice }: { insets: { top: number }; scale: number; onVoice: () => void }) {
  return <View style={[styles.heroContent, { paddingTop: insets.top + 70 }]}><View style={styles.heroBadge}><View style={styles.liveDot} /><Text style={styles.heroBadgeText}>AI TRAVEL · BEIJING</Text></View><Text style={[styles.heroTitle, { fontSize: 31 * scale, lineHeight: 40 * scale }]}>今天，想怎么玩北京？</Text><Text style={[styles.heroSubtitle, { fontSize: 13 * scale }]}>告诉 AI 你的时间、预算和旅行偏好，剩下的路线交给我们。</Text><Pressable onPress={onVoice} style={styles.heroVoice}><Ionicons name="mic-outline" size={20} color="#FFF" /><Text style={styles.heroVoiceText}>也可以直接说给我听</Text></Pressable></View>;
}

function ExploreCard({ card }: { card: BeijingExploreCard }) {
  const [broken, setBroken] = useState(false);
  return broken ? <LinearGradient colors={card.fallbackColors} style={styles.exploreCard}><View style={styles.exploreOverlay}><View style={styles.tag}><Text style={styles.tagText}>{card.tag}</Text></View><View><Text style={styles.exploreEnglish}>{card.englishName}</Text><Text style={styles.exploreName}>{card.name}</Text><Text style={styles.exploreDetail}>{card.detail}</Text></View></View></LinearGradient> : <ImageBackground source={{ uri: card.imageUrl }} onError={() => setBroken(true)} style={styles.exploreCard} imageStyle={styles.exploreImage}><LinearGradient colors={['transparent', 'rgba(8,31,28,0.9)']} style={styles.exploreOverlay}><View style={styles.tag}><Text style={styles.tagText}>{card.tag}</Text></View><View><Text style={styles.exploreEnglish}>{card.englishName}</Text><Text style={styles.exploreName}>{card.name}</Text><Text style={styles.exploreDetail}>{card.detail}</Text></View></LinearGradient></ImageBackground>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg }, content: { paddingBottom: 0 }, heroWrap: { minHeight: 390, overflow: 'hidden' }, hero: { minHeight: 390, justifyContent: 'flex-end' }, heroImage: { resizeMode: 'cover' }, heroOverlay: { flex: 1, justifyContent: 'flex-end' }, header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, location: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' }, headerText: { color: '#FFF', fontSize: 12, fontWeight: '800' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 }, headerButton: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }, avatar: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' }, heroContent: { paddingHorizontal: 22, paddingBottom: 28, gap: 13 }, heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#65E0B2' }, heroBadgeText: { color: 'rgba(255,255,255,0.88)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, heroTitle: { color: '#FFF', fontWeight: '900', letterSpacing: 0.2 }, heroSubtitle: { maxWidth: 330, color: 'rgba(255,255,255,0.78)', lineHeight: 20 }, heroVoice: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, minHeight: 42, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' }, heroVoiceText: { color: '#FFF', fontSize: 11, fontWeight: '700' }, body: { paddingHorizontal: 18, paddingTop: 0 }, plannerCard: { marginTop: -32, padding: 18, borderRadius: 25, backgroundColor: '#FFF', shadowColor: '#0F2B27', shadowOffset: { width: 0, height: 15 }, shadowOpacity: 0.14, shadowRadius: 25, elevation: 7 }, plannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, plannerEyebrow: { color: C.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, plannerTitle: { color: C.ink, fontWeight: '900', marginTop: 5 }, aiOrb: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7DD' }, input: { marginTop: 16, color: C.ink, lineHeight: 21, textAlignVertical: 'top', padding: 13, borderRadius: 16, backgroundColor: '#F5F9F7', borderWidth: 1, borderColor: '#E4EEEA' }, plannerTools: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, voiceButton: { minHeight: 38, paddingHorizontal: 11, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF8F6' }, voiceButtonActive: { backgroundColor: C.teal }, voiceText: { color: C.tealDark, fontSize: 11, fontWeight: '700' }, voiceTextActive: { color: '#FFF' }, modeHint: { color: '#8B9D98', fontSize: 11 }, params: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }, param: { minHeight: 36, paddingHorizontal: 11, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F3F7F5', borderWidth: 1, borderColor: '#E3ECE9' }, paramValue: { color: C.ink, fontSize: 11, fontWeight: '800' }, planButton: { minHeight: 50, marginTop: 16, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.teal }, planButtonText: { color: '#FFF', fontSize: 14, fontWeight: '900' }, modeLink: { minHeight: 40, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, modeLinkText: { color: C.tealDark, fontSize: 11, fontWeight: '700' }, sectionTitle: { marginTop: 30, marginBottom: 13 }, eyebrow: { color: C.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, sectionHeading: { color: C.ink, fontSize: 22, fontWeight: '900', marginTop: 5 }, sectionSubtitle: { color: C.textSecondary, fontSize: 12, marginTop: 4 }, exploreList: { gap: 12, paddingRight: 18 }, exploreCard: { width: 238, height: 182, borderRadius: 22, overflow: 'hidden' }, exploreImage: { borderRadius: 22 }, exploreOverlay: { flex: 1, padding: 15, justifyContent: 'space-between' }, tag: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' }, tagText: { color: '#FFF', fontSize: 10, fontWeight: '800' }, exploreEnglish: { color: 'rgba(255,255,255,0.65)', fontSize: 9, fontWeight: '800', letterSpacing: 1 }, exploreName: { color: '#FFF', fontSize: 19, fontWeight: '900', marginTop: 3 }, exploreDetail: { color: 'rgba(255,255,255,0.78)', fontSize: 10, marginTop: 4 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, quickHalf: { width: '48%' }, quickCard: { minHeight: 116, borderRadius: 20, padding: 16, justifyContent: 'space-between' }, quickTitle: { color: '#FFF', fontSize: 15, fontWeight: '900', marginTop: 12 }, quickSubtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 10 }, elderlyCard: { marginTop: 30, padding: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF6F3' }, elderlyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' }, elderlyCopy: { flex: 1, marginHorizontal: 12 }, elderlyTitle: { color: C.ink, fontSize: 13, fontWeight: '900' }, elderlyText: { color: C.textSecondary, fontSize: 10, lineHeight: 16, marginTop: 3 }, switch: { width: 46, height: 26, borderRadius: 14, padding: 3, justifyContent: 'center', backgroundColor: '#C9D8D4' }, switchOn: { backgroundColor: C.teal }, switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF' }, switchThumbOn: { alignSelf: 'flex-end' }, statusCard: { marginTop: 20, padding: 13, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2EBE8' }, statusTitle: { color: C.ink, fontSize: 11, fontWeight: '800' }, statusText: { flex: 1, color: C.textSecondary, fontSize: 10 }, promptOverlay: { flex: 1, backgroundColor: 'rgba(5,32,28,0.55)', justifyContent: 'center', alignItems: 'center', padding: 30 }, promptCard: { width: '100%', maxWidth: 340, backgroundColor: '#FFF', borderRadius: 24, padding: 26, alignItems: 'center' }, promptTitle: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 12 }, promptText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 }, promptButton: { alignSelf: 'stretch', minHeight: 48, marginTop: 20, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.teal }, promptButtonText: { color: '#FFF', fontWeight: '800' }, later: { padding: 12 }, laterText: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
});
