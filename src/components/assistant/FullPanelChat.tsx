/**
 * FullPanelChat — 信息收集阶段的全尺寸对话面板
 * 底部弹出78%高度，保持原有UI样式
 * 从 VoiceAssistant.tsx 重构，STT/TTS 逻辑移至 useVoiceEngine
 */

import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useElderlyMode } from '../../theme/ElderlyModeContext';
import { chatService } from '../../utils/chatService';
import { executeActions } from '../../utils/assistantActions';
import { generateRoute } from '../../utils/routeGenerator';
import { useAssistantStore, ChatBubble } from '../../store/useAssistantStore';
import { voiceService } from '../../utils/voiceService';
import { VoiceEngine } from '../../hooks/useVoiceEngine';
import RealtimeCallPanel from './RealtimeCallPanel';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  voiceEngine: VoiceEngine;
}

export default function FullPanelChat({ voiceEngine }: Props) {
  const { isElderlyMode, scaleIcon } = useElderlyMode();
  const navigation = useNavigation<any>();

  // Store state
  const messages = useAssistantStore((s) => s.messages);
  const isProcessing = useAssistantStore((s) => s.isProcessing);
  const phase = useAssistantStore((s) => s.phase);
  const pendingPrompt = useAssistantStore((s) => s.pendingPrompt);
  const consumePendingPrompt = useAssistantStore((s) => s.consumePendingPrompt);
  const {
    addMessage,
    setIsProcessing,
    closeAssistant,
    setPhase,
    setRouteSummary,
    setRoutePresentationText,
  } = useAssistantStore.getState();

  // Local UI state
  const [inputText, setInputText] = React.useState('');
  const [isRealtimeCallVisible, setIsRealtimeCallVisible] = React.useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const micPulseAnim = useRef(new Animated.Value(1)).current;

  const { status, interimText, startListening, stopListening, speakText, setOnFinalText } = voiceEngine;

  // StepAudio ASR 只负责把语音填入输入框，用户确认后再发送给 GLM。
  useEffect(() => {
    setOnFinalText((text: string) => {
      setInputText(current => current ? `${current} ${text}` : text);
    });
    return () => setOnFinalText(null);
  }, [setOnFinalText]);

  // 面板打开动画 + 首次问候
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // 首次打开：小猫问候
    if (messages.length === 0) {
      const greeting = chatService.getGreeting();
      const greetingBubble: ChatBubble = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: greeting.reply,
        timestamp: Date.now(),
      };
      addMessage(greetingBubble);

    }
  }, []);

  // 麦克风脉冲动画
  useEffect(() => {
    if (status === 'listening') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(micPulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      micPulseAnim.setValue(1);
    }
  }, [status]);

  // 自动滚到底部
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, interimText]);

  // 关闭面板
  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      stopListening();
      voiceService.stopSpeaking();
      closeAssistant();
    });
  }, [stopListening, closeAssistant]);

  // 发送消息（核心）
  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || useAssistantStore.getState().isProcessing) return;

    const userBubble: ChatBubble = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: Date.now(),
    };
    addMessage(userBubble);
    setInputText('');
    setIsProcessing(true);

    try {
      const response = await chatService.sendMessage(text.trim(), phase);
      const navigationActions = executeActions(response.actions);

      const assistantBubble: ChatBubble = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: response.reply,
        timestamp: Date.now(),
      };
      addMessage(assistantBubble);

      // 检查是否需要生成路线
      const hasGenerateRoute = response.actions.some(a => a.type === 'generate_route') ||
                               response.stage === 'generating';
      const hasNavigateToRoute = navigationActions.some(a => a.type === 'navigate_to_route_plan');

      if (hasGenerateRoute) {
        // 生成路线
        setPhase('generating');
        const selectedIds = response.actions
          .find(a => a.type === 'select_attractions')?.value as string[] | undefined;
        const summary = generateRoute(selectedIds);
        setRouteSummary(summary);
        setRoutePresentationText(summary.summaryText);

        // 切换到悬浮模式并跳转
        setPhase('presenting');
        navigation.navigate('CustomTab', { screen: 'RoutePlan' });
      }
    } catch (error) {
      console.error('Send message error:', error);
      const errorBubble: ChatBubble = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: '出了点小问题，您再说一次好吗？',
        timestamp: Date.now(),
      };
      addMessage(errorBubble);
    } finally {
      setIsProcessing(false);
    }
  }, [navigation, speakText]);

  // 首页携带的规划需求也必须走与手动发送相同的 GLM 请求链路。
  useEffect(() => {
    if (!pendingPrompt) return;
    const prompt = consumePendingPrompt();
    if (prompt) void handleSendMessage(prompt);
  }, [pendingPrompt, consumePendingPrompt, handleSendMessage]);

  // 文字发送
  const handleTextSend = useCallback(() => {
    if (inputText.trim()) {
      handleSendMessage(inputText.trim());
    }
  }, [inputText, handleSendMessage]);

  // 麦克风按钮
  const handleMicPress = useCallback(async () => {
    if (status === 'listening') {
      await stopListening();
    } else {
      await startListening();
    }
  }, [status, startListening, stopListening]);

  // 重播消息
  const handleReplay = useCallback(async (text: string) => {
    voiceService.stopSpeaking();
    await speakText(text, false);
  }, [speakText]);

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}>
          {/* 顶部栏 */}
          <View style={styles.panelHeader}>
            <View style={styles.headerLeft}>
              <Text style={{ fontSize: 22 }}>🐱</Text>
              <Text style={[typography.h3, { marginLeft: 8 }]}>小猫助手</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.modeToggleActive} onPress={() => setIsRealtimeCallVisible(true)}>
                <Ionicons
                  name="call"
                  size={scaleIcon(16)}
                  color="#fff"
                />
                <Text style={[typography.caption, { marginLeft: 4, color: '#fff' }]}>语音通话</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Ionicons name="close" size={scaleIcon(24)} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* 状态指示 */}
          {status !== 'idle' && (
            <View style={styles.statusBar}>
              <Animated.View style={[
                styles.statusDot,
                status === 'listening' && styles.statusDotListening,
                status === 'speaking' && styles.statusDotSpeaking,
                status === 'error' && styles.statusDotError,
                { transform: [{ scale: status === 'listening' ? micPulseAnim : 1 }] },
              ]} />
              <Text style={[typography.caption, { marginLeft: 6 }]}>
                {status === 'listening' ? '正在录音，再点一次完成...' :
                 status === 'transcribing' ? 'StepAudio 2.5 正在识别...' :
                 status === 'speaking' ? '小猫正在说话...' :
                 '连接错误'}
              </Text>
            </View>
          )}

          {/* 聊天区域 */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              ref={scrollViewRef}
              style={styles.chatArea}
              contentContainerStyle={styles.chatContent}
            >
              {messages.map((msg) => (
                <View
                  key={msg.id}
                  style={[
                    styles.bubble,
                    msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                  ]}
                >
                  {msg.role === 'assistant' && (
                    <Text style={styles.bubbleAvatar}>🐱</Text>
                  )}
                  <View style={[
                    styles.bubbleContent,
                    msg.role === 'user' ? styles.bubbleContentUser : styles.bubbleContentAssistant,
                  ]}>
                    <Text style={[
                      typography.body,
                      msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant,
                    ]}>
                      {msg.text}
                    </Text>
                    {msg.role === 'assistant' && (
                      <TouchableOpacity
                        style={styles.replayBtn}
                        onPress={() => handleReplay(msg.text)}
                      >
                        <Ionicons name="volume-high-outline" size={scaleIcon(16)} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}

              {/* 实时语音文本 */}
              {interimText.length > 0 && (
                <View style={[styles.bubble, styles.bubbleUser]}>
                  <View style={[styles.bubbleContent, styles.bubbleContentUser, { opacity: 0.6 }]}>
                    <Text style={[typography.body, styles.bubbleTextUser]}>
                      {interimText}...
                    </Text>
                  </View>
                </View>
              )}

              {/* 处理中指示 */}
              {isProcessing && (
                <View style={[styles.bubble, styles.bubbleAssistant]}>
                  <Text style={styles.bubbleAvatar}>🐱</Text>
                  <View style={[styles.bubbleContent, styles.bubbleContentAssistant]}>
                    <Text style={[typography.body, styles.bubbleTextAssistant]}>
                      {phase === 'generating' ? '正在帮您规划路线...' : '正在思考...'}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* 底部输入区 */}
            <View style={styles.inputArea}>
                <View style={styles.textModeInput}>
                  <TextInput
                    style={[styles.textInput, typography.body]}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="输入您的需求..."
                    placeholderTextColor={colors.textSecondary}
                    onSubmitEditing={handleTextSend}
                    returnKeyType="send"
                  />
                  <TouchableOpacity
                    style={[styles.micSmallBtn, status === 'listening' && styles.micSmallBtnActive]}
                    onPress={handleMicPress}
                    disabled={status === 'transcribing'}
                  >
                    <Ionicons
                      name={status === 'listening' ? 'stop' : 'mic-outline'}
                      size={scaleIcon(22)}
                      color={status === 'listening' ? '#E53935' : colors.textSecondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendBtn, (!inputText.trim() || isProcessing) && styles.sendBtnDisabled]}
                    onPress={handleTextSend}
                    disabled={!inputText.trim() || isProcessing}
                  >
                    <Ionicons name="send" size={scaleIcon(20)} color="#fff" />
                  </TouchableOpacity>
                </View>
              {!!interimText && <Text style={styles.asrHint}>{interimText}</Text>}
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
      <RealtimeCallPanel visible={isRealtimeCallVisible} onClose={() => setIsRealtimeCallVisible(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  panel: {
    height: SCREEN_HEIGHT * 0.78,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeToggle: { flexDirection: 'row', alignItems: 'center' },
  modeToggleActive: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 16, backgroundColor: colors.primary,
  },
  closeBtn: { padding: 4 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 6, backgroundColor: '#FAFAFA',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ccc' },
  statusDotListening: { backgroundColor: '#4CAF50' },
  statusDotSpeaking: { backgroundColor: '#FF9800' },
  statusDotError: { backgroundColor: '#E53935' },
  chatArea: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 8 },
  bubble: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAssistant: { justifyContent: 'flex-start' },
  bubbleAvatar: { fontSize: 20, marginRight: 8, marginTop: 4 },
  bubbleContent: {
    maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16,
  },
  bubbleContentUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleContentAssistant: { backgroundColor: '#F5F5F5', borderBottomLeftRadius: 4 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAssistant: { color: '#333' },
  replayBtn: { marginTop: 6, alignSelf: 'flex-start', padding: 2 },
  inputArea: {
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
    paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#fff',
  },
  phoneModeInput: { alignItems: 'center', paddingVertical: 8 },
  listeningIndicator: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center',
  },
  speakingIndicator: { backgroundColor: '#FFF3E0' },
  textModeInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textInput: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100,
  },
  micSmallBtn: { padding: 8 },
  micSmallBtnActive: { backgroundColor: '#FFEBEE', borderRadius: 20 },
  asrHint: { fontSize: 12, color: colors.textSecondary, marginTop: 7, marginLeft: 8 },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
