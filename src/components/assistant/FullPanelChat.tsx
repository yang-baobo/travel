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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useElderlyMode } from '../../theme/ElderlyModeContext';
import { chatService } from '../../utils/chatService';
import { executeActions } from '../../utils/assistantActions';
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
      const response = await chatService.sendMessage(
        text.trim(),
        phase,
        messages.map(message => ({ role: message.role, content: message.text })),
      );
      executeActions(response.actions);

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
      if (hasGenerateRoute) {
        setPhase('collecting');
        addMessage({
          id: `msg-${Date.now() + 2}`,
          role: 'assistant',
          text: '路线生成已统一到首页的北京路线工作台。请回到首页确认结构化条件后生成真实草稿。',
          timestamp: Date.now(),
        });
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
  }, [messages, phase, speakText]);

  // Legacy 入口仍可携带普通助手提示；首页规划已使用 Planning Session。
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
              <View style={styles.headerMark}><Ionicons name="sparkles" size={18} color="#FFFFFF" /></View>
              <View>
                <Text style={styles.headerTitle}>北京 AI 旅伴</Text>
                <Text style={styles.headerSubtitle}>把时间、预算和偏好告诉我</Text>
              </View>
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
                <Ionicons name="close" size={scaleIcon(24)} color="rgba(255,255,255,0.76)" />
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
                    <View style={styles.bubbleAvatar}><Ionicons name="sparkles" size={14} color="#FFFFFF" /></View>
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
                  <View style={styles.bubbleAvatar}><Ionicons name="sparkles" size={14} color="#FFFFFF" /></View>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(4,24,22,0.48)', justifyContent: 'flex-end' },
  panel: {
    height: SCREEN_HEIGHT * 0.82, backgroundColor: '#F3F7F5', borderTopLeftRadius: 30,
    borderTopRightRadius: 30, overflow: 'hidden', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  panelHeader: { minHeight: 78, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 13, backgroundColor: '#0D463F' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMark: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#0E9F93', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)' },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  headerSubtitle: { color: 'rgba(255,255,255,0.56)', fontSize: 10, marginTop: 3 },
  modeToggle: { flexDirection: 'row', alignItems: 'center' },
  modeToggleActive: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 17, backgroundColor: '#D8A33B' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  statusBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#EAF7F4' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#AAB8B4' },
  statusDotListening: { backgroundColor: '#0E9F93' },
  statusDotSpeaking: { backgroundColor: '#D8A33B' },
  statusDotError: { backgroundColor: '#D65B55' },
  chatArea: { flex: 1 },
  chatContent: { padding: 18, paddingBottom: 10 },
  bubble: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-start' },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAssistant: { justifyContent: 'flex-start' },
  bubbleAvatar: { width: 30, height: 30, borderRadius: 11, marginRight: 8, marginTop: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E9F93' },
  bubbleContent: { maxWidth: '78%', paddingHorizontal: 15, paddingVertical: 11, borderRadius: 18 },
  bubbleContentUser: { backgroundColor: '#0E9F93', borderBottomRightRadius: 5 },
  bubbleContentAssistant: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 5, borderWidth: 1, borderColor: '#E1EAE7' },
  bubbleTextUser: { color: '#FFFFFF' },
  bubbleTextAssistant: { color: '#0F2B27' },
  replayBtn: { marginTop: 7, alignSelf: 'flex-start', padding: 2 },
  inputArea: { borderTopWidth: 1, borderTopColor: '#DDE7E4', paddingVertical: 13, paddingHorizontal: 16, backgroundColor: '#FFFFFF' },
  phoneModeInput: { alignItems: 'center', paddingVertical: 8 },
  listeningIndicator: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E6F5F1', justifyContent: 'center', alignItems: 'center' },
  speakingIndicator: { backgroundColor: '#FFF8E7' },
  textModeInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textInput: { flex: 1, backgroundColor: '#F0F5F3', borderRadius: 22, paddingHorizontal: 17, paddingVertical: 11, maxHeight: 100, color: '#0F2B27' },
  micSmallBtn: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF5F3' },
  micSmallBtnActive: { backgroundColor: '#FFF1F2' },
  asrHint: { fontSize: 12, color: '#617571', marginTop: 7, marginLeft: 8 },
  sendBtn: { width: 42, height: 42, borderRadius: 16, backgroundColor: '#0E9F93', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
});
