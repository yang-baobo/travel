import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import PlanningWorkbench from '../../components/home/PlanningWorkbench';
import PlanningConfirmationCard from '../../components/home/PlanningConfirmationCard';
import RealtimeCallPanel from '../../components/assistant/RealtimeCallPanel';
import { usePlanningSessionStore } from '../../store/usePlanningSessionStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useVoiceEngine } from '../../hooks/useVoiceEngine';
import type { ExploreStackParamList } from '../../types';
import type { PlanningEntryMode } from '../../types/planning';
import type { PlannerMode } from '../../data/beijingHomeUi';
import { PLANNER_MODE_COPY } from '../../data/beijingHomeUi';
import { colors } from '../../theme/colors';
import {
  collectionProgress,
  missingRequiredRequirements,
  nextRequirement,
  planningQuestion,
  quickAnswersFor,
} from '../../services/planningCollection';
import {
  answerPlanningClarification,
  answerPlanningCollection,
  commitDraft,
  ensurePlanningCollectionPrompt,
  generatePlanningDraft,
  replacePlanningDraft,
  syncPlanningPreferences,
} from '../../services/planningSessionService';

type Navigation = NativeStackNavigationProp<ExploreStackParamList, 'AIPlanning'>;
type Route = NativeStackScreenProps<ExploreStackParamList, 'AIPlanning'>['route'];

const MODE_COPY: Record<PlanningEntryMode, { label: string; detail: string; icon: string }> = {
  selected_places: { label: '选景点规划', detail: '保留已选景点，AI 补齐酒店、美食与交通', icon: 'map-outline' },
  chat: { label: 'AI 对话定制', detail: '边聊边收集必填条件，再推荐完整路线', icon: 'chatbubble-ellipses-outline' },
  realtime: { label: '电话实时规划', detail: '通话收集同一份条件，结束后继续核对', icon: 'call-outline' },
};

export default function AIPlanningScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const session = usePlanningSessionStore(state => state.session);
  const hasSetPreferences = usePreferenceStore(state => state.hasSetPreferences);
  const voice = useVoiceEngine();
  const [input, setInput] = useState('');
  const [realtimeVisible, setRealtimeVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const openedRealtime = useRef(false);
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    ensurePlanningCollectionPrompt();
    Animated.timing(intro, { toValue: 1, duration: 480, useNativeDriver: true }).start();
  }, [intro]);

  useEffect(() => {
    if (route.params?.launchRealtime && !openedRealtime.current) {
      openedRealtime.current = true;
      setRealtimeVisible(true);
    }
  }, [route.params?.launchRealtime]);

  useEffect(() => {
    voice.setOnFinalText(text => setInput(current => [current.trim(), text.trim()].filter(Boolean).join(' ')));
    return () => voice.setOnFinalText(null);
  }, [voice.setOnFinalText]);

  useFocusEffect(useCallback(() => {
    if (hasSetPreferences && usePlanningSessionStore.getState().session) syncPlanningPreferences();
  }, [hasSetPreferences]));

  const progress = useMemo(() => session ? collectionProgress(session) : { confirmed: 0, total: 0 }, [session]);
  const missing = useMemo(() => session ? missingRequiredRequirements(session) : [], [session]);
  const activeRequirement = useMemo(() => session ? nextRequirement(session) : null, [session]);
  const busy = Boolean(session && ['understanding', 'querying_places', 'calculating_transport', 'committing'].includes(session.status));

  if (!session) {
    return (
      <SafeAreaView style={styles.emptyPage}>
        <Ionicons name="map-outline" size={42} color="#0E9F93" />
        <Text style={styles.emptyTitle}>还没有规划会话</Text>
        <Text style={styles.emptyText}>请从首页选择一种规划方式开始。</Text>
        <Pressable onPress={() => navigation.navigate('Home')} style={styles.emptyButton}><Text style={styles.emptyButtonText}>返回首页</Text></Pressable>
      </SafeAreaView>
    );
  }

  const submit = async (answer = input) => {
    const value = answer.trim();
    if (!value || busy || submitting) return;
    setSubmitting(true);
    try {
      if (session.draft || session.status === 'needs_clarification') {
        await answerPlanningClarification(value);
      } else if (activeRequirement) {
        answerPlanningCollection(value, 'text');
      } else {
        answerPlanningCollection(value, 'text');
      }
      setInput('');
    } finally {
      setSubmitting(false);
    }
  };

  const changeMode = (mode: PlanningEntryMode) => {
    const store = usePlanningSessionStore.getState();
    if (mode === 'selected_places' && session.request.candidates.length === 0) {
      store.addMessage({ role: 'assistant', text: '当前还没有已选景点。请返回首页的“选景点规划”区域选择真实高德景点，或者继续由 AI 推荐。' });
      return;
    }
    store.setEntryMode(mode);
    if (mode === 'realtime') setRealtimeVisible(true);
  };

  const changeStrategy = (mode: PlannerMode) => {
    const store = usePlanningSessionStore.getState();
    if (mode === 'self' && session.request.candidates.length === 0) {
      store.addMessage({ role: 'assistant', text: '自己选择模式需要至少一个真实高德地点，请先从首页选择景点。' });
      return;
    }
    store.updateRequest({ mode });
  };

  const finishRealtime = (transcript: Array<{ role: 'user' | 'assistant'; text: string }>) => {
    const spoken = transcript.filter(item => item.role === 'user').map(item => item.text.trim()).filter(Boolean).join('；');
    if (spoken) answerPlanningCollection(spoken, 'realtime', false);
  };

  const openGeneratedRoute = () => {
    try {
      commitDraft();
      navigation.replace('LiveItinerary');
      return true;
    } catch (error) {
      usePlanningSessionStore.getState().setError(error instanceof Error ? error.message : '路线还不能确认，请先调整条件。');
      return false;
    }
  };

  const confirmAndGenerate = async () => {
    if (busy || submitting || missing.length > 0) return;
    setSubmitting(true);
    try {
      await generatePlanningDraft();
      const latest = usePlanningSessionStore.getState().session;
      if (latest?.draft && latest.status === 'draft_ready') openGeneratedRoute();
    } finally {
      setSubmitting(false);
    }
  };

  const replaceAndOpen = async () => {
    if (busy || submitting) return;
    setSubmitting(true);
    try {
      await replacePlanningDraft();
      const latest = usePlanningSessionStore.getState().session;
      if (latest?.draft && latest.status === 'draft_ready') openGeneratedRoute();
    } finally {
      setSubmitting(false);
    }
  };

  const sourceLabel = session.entryMode === 'selected_places'
    ? `${session.request.candidates.length} 个已选真实景点`
    : session.entryMode === 'realtime' ? 'StepAudio 实时通话' : '文字 / ASR 对话';

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <LinearGradient colors={['#073E38', '#0B5A51', '#0E8176']} style={styles.hero}>
        <View style={styles.heroGlowOne} />
        <View style={styles.heroGlowTwo} />
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}><Ionicons name="arrow-back" size={21} color="#FFF" /></Pressable>
          <View style={styles.brandCopy}><Text style={styles.eyebrow}>BEIJING FLOW · AI PLANNER</Text><Text style={styles.heroTitle}>一起把路线想清楚</Text></View>
          <View style={styles.progressRing}><Text style={styles.progressText}>{progress.confirmed}/{progress.total}</Text></View>
        </View>
        <Text style={styles.heroSubtitle}>先补齐必填信息，再查询真实地点与交通。你的每一句话都会进入同一个规划会话。</Text>
        <View style={styles.sourcePill}><Ionicons name={MODE_COPY[session.entryMode].icon as any} size={14} color="#83E6D5" /><Text style={styles.sourcePillText}>{sourceLabel}</Text></View>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
            <View style={styles.sectionHeader}><Text style={styles.sectionEyebrow}>THREE WAYS, ONE SESSION</Text><Text style={styles.sectionTitle}>选择这次怎么一起制定</Text></View>
            <View style={styles.modeRow}>
              {(Object.keys(MODE_COPY) as PlanningEntryMode[]).map(mode => {
                const copy = MODE_COPY[mode];
                const active = session.entryMode === mode;
                return (
                  <Pressable key={mode} onPress={() => changeMode(mode)} style={[styles.modeCard, active && styles.modeCardActive]}>
                    <View style={[styles.modeIcon, active && styles.modeIconActive]}><Ionicons name={copy.icon as any} size={19} color={active ? '#FFF' : '#0E8E83'} /></View>
                    <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{copy.label}</Text>
                    <Text style={[styles.modeDetail, active && styles.modeDetailActive]}>{copy.detail}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.strategyRow} testID="planning-strategy-selector">
              <Text style={styles.strategyLabel}>规划策略</Text>
              {(Object.keys(PLANNER_MODE_COPY) as PlannerMode[]).map(strategy => (
                <Pressable key={strategy} onPress={() => changeStrategy(strategy)} style={[styles.strategyChip, session.request.mode === strategy && styles.strategyChipActive]}>
                  <Text style={[styles.strategyText, session.request.mode === strategy && styles.strategyTextActive]}>{PLANNER_MODE_COPY[strategy].label}</Text>
                </Pressable>
              ))}
              <Text style={styles.strategyHint}>输入方式（文字 / ASR / 实时通话）与策略相互独立</Text>
            </View>

            <View style={[styles.preferenceCard, hasSetPreferences && styles.preferenceCardDone]}>
              <View style={styles.preferenceIcon}><Ionicons name={hasSetPreferences ? 'checkmark' : 'options-outline'} size={21} color={hasSetPreferences ? '#FFF' : '#0E8E83'} /></View>
              <View style={styles.preferenceCopy}>
                <Text style={styles.preferenceEyebrow}>偏好设置 · 生成前确认</Text>
                <Text style={styles.preferenceTitle}>{hasSetPreferences ? '已载入你的旅行偏好' : '先告诉 AI 你的旅行底线'}</Text>
                <Text style={styles.preferenceText}>{hasSetPreferences ? '酒店、餐饮、交通、步行量和安全限制会一起进入本次请求。' : '建议设置酒店档次、饮食、交通、步行量、过敏和行动限制。也可以在下方对话里逐项告诉我。'}</Text>
              </View>
              <Pressable onPress={() => navigation.navigate('Preference', { returnToPlanning: true })} style={styles.preferenceButton}><Text style={styles.preferenceButtonText}>{hasSetPreferences ? '修改' : '去设置'}</Text></Pressable>
            </View>

            <View style={styles.requirementCard} testID="planning-required-framework">
              <View style={styles.requirementHeader}>
                <View><Text style={styles.cardEyebrow}>ROUTE BRIEF</Text><Text style={styles.cardTitle}>路线生成信息单</Text></View>
                <Text style={styles.requiredLegend}>红点为必填 · 景点可选</Text>
              </View>
              <View style={styles.requirementGrid}>
                {session.requirements.map(item => (
                  <View key={item.key} style={[styles.requirementItem, item.status === 'confirmed' && styles.requirementItemDone]}>
                    <View style={[styles.requirementStatus, item.status === 'confirmed' && styles.requirementStatusDone]}>
                      <Ionicons name={item.status === 'confirmed' ? 'checkmark' : item.required ? 'ellipse' : 'add'} size={item.status === 'confirmed' ? 12 : 7} color={item.status === 'confirmed' ? '#FFF' : item.required ? '#D16A5E' : '#7A918C'} />
                    </View>
                    <View style={styles.requirementCopy}><Text style={styles.requirementLabel}>{item.label}{item.required ? ' *' : '（可选）'}</Text><Text numberOfLines={2} style={styles.requirementSummary}>{item.summary}</Text></View>
                  </View>
                ))}
              </View>
            </View>

            {!session.draft && !busy && missing.length > 0 ? (
              <View style={styles.chatCard} testID="planning-guided-conversation">
                <View style={styles.chatHeader}>
                  <View style={styles.aiAvatar}><Ionicons name="sparkles" size={18} color="#FFF" /></View>
                  <View><Text style={styles.chatTitle}>AI 路线顾问</Text><Text style={styles.chatMeta}>{missing.length ? `还差 ${missing.length} 项必填信息` : '必填信息已收齐，等待你确认生成'}</Text></View>
                </View>
                <View style={styles.messages}>
                  {session.messages.filter(message => message.role !== 'system').slice(-8).map(message => (
                    <View key={message.id} style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                      <Text style={[styles.messageText, message.role === 'user' && styles.userMessageText]}>{message.text}</Text>
                    </View>
                  ))}
                </View>
                {activeRequirement ? (
                  <>
                    <Text style={styles.currentQuestion}>{planningQuestion(activeRequirement.key, session.request)}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
                      {quickAnswersFor(activeRequirement.key, session.request).map(answer => (
                        <Pressable key={answer} onPress={() => void submit(answer)} style={styles.quickAnswer}><Text style={styles.quickAnswerText}>{answer}</Text></Pressable>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                <View style={styles.composer}>
                  <TextInput
                    value={input}
                    onChangeText={setInput}
                    multiline
                    placeholder={activeRequirement ? '直接回答，AI 会写入信息单…' : '还想补充什么？'}
                    placeholderTextColor="#8CA19C"
                    style={styles.input}
                  />
                  <Pressable onPress={() => void (voice.status === 'listening' ? voice.stopListening() : voice.startListening())} style={[styles.composerButton, voice.status === 'listening' && styles.composerButtonLive]}>
                    {voice.status === 'transcribing' ? <ActivityIndicator size="small" color="#0E8E83" /> : <Ionicons name={voice.status === 'listening' ? 'stop' : 'mic-outline'} size={19} color="#0E8E83" />}
                  </Pressable>
                  <Pressable onPress={() => void submit()} disabled={!input.trim() || submitting} style={[styles.sendButton, (!input.trim() || submitting) && styles.disabled]}><Ionicons name="arrow-up" size={19} color="#FFF" /></Pressable>
                </View>
                <Pressable onPress={() => setRealtimeVisible(true)} style={styles.callInline}><Ionicons name="call-outline" size={20} color="#FFF" /><Text style={styles.callInlineText}>实时通话</Text></Pressable>
              </View>
            ) : null}

            {missing.length === 0 && !session.draft && !busy && session.status !== 'error' ? (
              <>
                <PlanningConfirmationCard session={session} busy={submitting} onConfirm={confirmAndGenerate} />
                <View style={styles.confirmEditCard} testID="planning-confirmation-edit">
                  <View style={styles.confirmEditHeading}>
                    <Ionicons name="create-outline" size={17} color="#0B7B72" />
                    <View style={styles.confirmEditCopy}>
                      <Text style={styles.confirmEditTitle}>有内容需要修改？</Text>
                      <Text style={styles.confirmEditHint}>直接补充一句，确认单会更新；不会提前生成路线。</Text>
                    </View>
                  </View>
                  <View style={styles.composer}>
                    <TextInput
                      value={input}
                      onChangeText={setInput}
                      multiline
                      placeholder="例如：预算改为 6000 元，第二天少走路…"
                      placeholderTextColor="#8CA19C"
                      style={styles.input}
                    />
                    <Pressable onPress={() => void (voice.status === 'listening' ? voice.stopListening() : voice.startListening())} style={[styles.composerButton, voice.status === 'listening' && styles.composerButtonLive]}>
                      {voice.status === 'transcribing' ? <ActivityIndicator size="small" color="#0E8E83" /> : <Ionicons name={voice.status === 'listening' ? 'stop' : 'mic-outline'} size={19} color="#0E8E83" />}
                    </Pressable>
                    <Pressable onPress={() => void submit()} disabled={!input.trim() || submitting} style={[styles.sendButton, (!input.trim() || submitting) && styles.disabled]}><Ionicons name="arrow-up" size={19} color="#FFF" /></Pressable>
                  </View>
                </View>
              </>
            ) : null}

            {busy ? (
              <View style={styles.busyCard}><ActivityIndicator color="#0E9F93" /><View><Text style={styles.busyTitle}>正在生成真实路线</Text><Text style={styles.busyText}>当前步骤来自真实请求进度，不使用假倒计时。</Text></View></View>
            ) : null}

            {['needs_clarification', 'error'].includes(session.status) ? (
              <PlanningWorkbench
                session={session}
                showDraftDetails={false}
                onClarify={answerPlanningClarification}
                onReplace={replaceAndOpen}
                onRetry={confirmAndGenerate}
                onCommit={openGeneratedRoute}
              />
            ) : null}
          </Animated.View>
          <View style={{ height: 130 }} />
        </Animated.ScrollView>

        {!session.draft && !busy && missing.length > 0 ? (
          <View style={styles.bottomBar}>
            <View style={styles.bottomCopy}><Text style={styles.bottomLabel}>必填进度</Text><Text style={styles.bottomProgress}>{progress.confirmed}/{progress.total} 已确认</Text></View>
            <Pressable disabled style={[styles.generateButton, styles.generateButtonDisabled]} testID="generate-planning-draft">
              <Ionicons name="list-outline" size={18} color="#FFF" /><Text style={styles.generateText}>还差 {missing.length} 项</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <RealtimeCallPanel visible={realtimeVisible} onClose={() => setRealtimeVisible(false)} onComplete={finishRealtime} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.background },
  hero: { paddingHorizontal: 19, paddingTop: 10, paddingBottom: 25, overflow: 'hidden' },
  heroGlowOne: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -80, top: -100, backgroundColor: 'rgba(104,229,209,0.14)' },
  heroGlowTwo: { position: 'absolute', width: 160, height: 160, borderRadius: 80, left: -70, bottom: -110, backgroundColor: 'rgba(242,193,91,0.10)' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  brandCopy: { flex: 1 },
  eyebrow: { color: '#79DDCC', fontSize: 8, fontWeight: '900', letterSpacing: 1.35 },
  heroTitle: { color: '#FFF', fontSize: 23, fontWeight: '900', marginTop: 4 },
  progressRing: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#71D9C8', backgroundColor: 'rgba(3,42,38,0.32)', alignItems: 'center', justifyContent: 'center' },
  progressText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  heroSubtitle: { color: 'rgba(255,255,255,0.70)', fontSize: 12, lineHeight: 19, marginTop: 17, maxWidth: 620 },
  sourcePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 13, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' },
  sourcePillText: { color: '#DDF8F3', fontSize: 10, fontWeight: '700' },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 16 },
  sectionHeader: { marginTop: 5, marginBottom: 12 },
  sectionEyebrow: { color: '#0E9F93', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: '#133A34', fontSize: 19, fontWeight: '900', marginTop: 4 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingBottom: 3 },
  modeCard: { flexBasis: 150, flexGrow: 1, minHeight: 126, padding: 14, borderRadius: 21, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DCE8E4' },
  modeCardActive: { backgroundColor: '#0D554D', borderColor: '#0D554D' },
  modeIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F6F3' },
  modeIconActive: { backgroundColor: '#13A99B' },
  modeLabel: { color: '#153C36', fontSize: 13, fontWeight: '900', marginTop: 10 },
  modeLabelActive: { color: '#FFF' },
  modeDetail: { color: '#748783', fontSize: 9, lineHeight: 14, marginTop: 4 },
  modeDetailActive: { color: 'rgba(255,255,255,0.66)' },
  strategyRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 10, paddingHorizontal: 2 },
  strategyLabel: { color: '#53736D', fontSize: 10, fontWeight: '800' },
  strategyChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D7E6E1' },
  strategyChipActive: { backgroundColor: '#0E9F93', borderColor: '#0E9F93' },
  strategyText: { color: '#4D716A', fontSize: 10, fontWeight: '800' },
  strategyTextActive: { color: '#FFF' },
  strategyHint: { color: '#88A09A', fontSize: 9, flexBasis: '100%' },
  preferenceCard: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 14, padding: 15, borderRadius: 22, backgroundColor: '#FFF8E8', borderWidth: 1, borderColor: '#F0D598' },
  preferenceCardDone: { backgroundColor: '#EAF7F4', borderColor: '#CAE9E3' },
  preferenceIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E9F93' },
  preferenceCopy: { flex: 1 },
  preferenceEyebrow: { color: '#0B847A', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  preferenceTitle: { color: '#173B35', fontSize: 13, fontWeight: '900', marginTop: 3 },
  preferenceText: { color: '#71827E', fontSize: 9, lineHeight: 14, marginTop: 3 },
  preferenceButton: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, backgroundColor: '#0E9F93' },
  preferenceButtonText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  requirementCard: { marginTop: 14, padding: 16, borderRadius: 24, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DFE9E6' },
  requirementHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  cardEyebrow: { color: '#0E9F93', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  cardTitle: { color: '#153B35', fontSize: 17, fontWeight: '900', marginTop: 3 },
  requiredLegend: { color: '#8A9B97', fontSize: 8 },
  requirementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  requirementItem: { width: '48%', minWidth: 145, flexGrow: 1, flexDirection: 'row', gap: 8, padding: 10, borderRadius: 16, backgroundColor: '#F5F7F6', borderWidth: 1, borderColor: '#E8ECEA' },
  requirementItemDone: { backgroundColor: '#EFF8F5', borderColor: '#D1EDE7' },
  requirementStatus: { width: 21, height: 21, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E9E7' },
  requirementStatusDone: { backgroundColor: '#0E9F93', borderColor: '#0E9F93' },
  requirementCopy: { flex: 1 },
  requirementLabel: { color: '#284741', fontSize: 9, fontWeight: '900' },
  requirementSummary: { color: '#73847F', fontSize: 9, lineHeight: 13, marginTop: 3 },
  chatCard: { marginTop: 14, padding: 16, borderRadius: 24, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DFE9E6' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  aiAvatar: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E9F93' },
  chatTitle: { color: '#173B35', fontSize: 13, fontWeight: '900' },
  chatMeta: { color: '#81918D', fontSize: 9, marginTop: 2 },
  messages: { gap: 8, marginTop: 14 },
  messageBubble: { maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 15 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#EEF5F3', borderBottomLeftRadius: 5 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#0E9F93', borderBottomRightRadius: 5 },
  messageText: { color: '#3F5B56', fontSize: 11, lineHeight: 17 },
  userMessageText: { color: '#FFF' },
  currentQuestion: { color: '#173B35', fontSize: 12, fontWeight: '800', lineHeight: 19, marginTop: 14 },
  quickRow: { gap: 7, paddingVertical: 10 },
  quickAnswer: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#EAF7F4', borderWidth: 1, borderColor: '#D0EBE5' },
  quickAnswerText: { color: '#0A766D', fontSize: 9, fontWeight: '800' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginTop: 3 },
  input: { flex: 1, minHeight: 46, maxHeight: 110, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 17, backgroundColor: '#F0F5F3', color: '#173B35', fontSize: 12, outlineStyle: 'none' } as any,
  composerButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9F6F3' },
  composerButtonLive: { backgroundColor: '#CFECE6' },
  sendButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E9F93' },
  callInline: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, backgroundColor: '#EFF7F5' },
  callInlineText: { color: '#0B7B72', fontSize: 10, fontWeight: '800' },
  confirmEditCard: { marginTop: 10, padding: 14, borderRadius: 21, backgroundColor: '#F6FBF9', borderWidth: 1, borderColor: '#D8EAE6' },
  confirmEditHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  confirmEditCopy: { flex: 1 },
  confirmEditTitle: { color: '#173B35', fontSize: 11, fontWeight: '900' },
  confirmEditHint: { color: '#7A918C', fontSize: 9, lineHeight: 14, marginTop: 2 },
  busyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 17, borderRadius: 22, backgroundColor: '#FFF' },
  busyTitle: { color: '#173B35', fontSize: 13, fontWeight: '900' },
  busyText: { color: '#778985', fontSize: 9, marginTop: 3 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderColor: '#DDE7E3', backgroundColor: 'rgba(255,255,255,0.97)' },
  bottomCopy: { flex: 1 },
  bottomLabel: { color: '#8A9A96', fontSize: 8, fontWeight: '800' },
  bottomProgress: { color: '#173B35', fontSize: 12, fontWeight: '900', marginTop: 2 },
  generateButton: { minWidth: 174, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 17, borderRadius: 18, backgroundColor: '#0E9F93' },
  generateButtonDisabled: { backgroundColor: '#93A9A4' },
  generateText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  emptyPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: colors.background },
  emptyTitle: { color: '#173B35', fontSize: 20, fontWeight: '900', marginTop: 14 },
  emptyText: { color: '#758783', fontSize: 12, marginTop: 7 },
  emptyButton: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16, backgroundColor: '#0E9F93' },
  emptyButtonText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
});
