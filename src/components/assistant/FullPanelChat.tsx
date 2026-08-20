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
  const [isPhoneMode, setIsPhoneMode] = React.useState(true);

  const scrollViewRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const micPulseAnim = useRef(new Animated.Value(1)).current;

  const { status, interimText, startListening, stopListening, speakText, interruptSpeaking, setOnFinalText } = voiceEngine;

  // 注册最终文本回调
  useEffect(() => {
    setOnFinalText((text: string) => {
      handleSendMessage(text);
    });
    return () => setOnFinalText(null);
  }, [isProcessing]);

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

      if (isPhoneMode) {
        speakText(greeting.reply, true);
      }
    } else if (isPhoneMode) {
      startListening();
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
      const response = await chatService.sendMessage(text.trim());
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
        await speakText(response.reply, false);

        const selectedIds = response.actions
          .find(a => a.type === 'select_attractions')?.value as string[] | undefined;
        const summary = generateRoute(selectedIds);
        setRouteSummary(summary);
        setRoutePresentationText(summary.summaryText);

        // 切换到悬浮模式并跳转
        setPhase('presenting');
        navigation.navigate('CustomTab', { screen: 'RoutePlan' });
      } else {
        // 普通回复，朗读
        await speakText(response.reply, true);
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
      await speakText('出了点小问题，您再说一次好吗？', true);
    } finally {
      setIsProcessing(false);
    }
  }, [navigation, speakText]);

  // 文字发送
  const handleTextSend = useCallback(() => {
    if (inputText.trim()) {
      handleSendMessage(inputText.trim());
    }
  }, [inputText, handleSendMessage]);

  // 麦克风按钮
  const handleMicPress = useCallback(async () => {
    if (status === 'listening') {
      stopListening();
    } else {
      await startListening();
    }
  }, [status, startListening, stopListening]);

  // 切换电话模式
  const handleTogglePhoneMode = useCallback(async () => {
    const newMode = !isPhoneMode;
    setIsPhoneMode(newMode);
    if (newMode) {
      await startListening();
    } else {
      stopListening();
      voiceService.stopSpeaking();
    }
  }, [isPhoneMode, startListening, stopListening]);

  // 重播消息
  const handleReplay = useCallback(async (text: string) => {
    voiceService.stopSpeaking();
    await speakText(text, true);
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
              <TouchableOpacity
                style={[styles.modeToggle, isPhoneMode && styles.modeToggleActive]}
                onPress={handleTogglePhoneMode}
              >
                <Ionicons
                  name={isPhoneMode ? 'call' : 'call-outline'}
                  size={scaleIcon(16)}
                  color={isPhoneMode ? '#fff' : colors.textSecondary}
                />
                <Text style={[
                  typography.caption,
                  { marginLeft: 4, color: isPhoneMode ? '#fff' : colors.textSecondary },
                ]}>
                  电话模式
                </Text>
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
                {status === 'listening' ? '正在聆听...' :
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
              {isPhoneMode ? (
                <TouchableOpacity
                  style={styles.phoneModeInput}
                  onPress={status === 'speaking' ? interruptSpeaking : handleMicPress}
                  activeOpacity={0.7}
                >
                  <Animated.View style={[
                    styles.listeningIndicator,
                    status === 'speaking' && styles.speakingIndicator,
                    { transform: [{ scale: status === 'listening' ? micPulseAnim : 1 }] },
                  ]}>
                    <Ionicons
                      name={status === 'speaking' ? 'volume-high' : 'mic'}
                      size={scaleIcon(32)}
                      color={status === 'listening' ? '#4CAF50' : status === 'speaking' ? '#FF9800' : colors.primary}
                    />
                  </Animated.View>
                  <Text style={[typography.caption, { marginTop: 8, textAlign: 'center' }]}>
                    {status === 'listening' ? '正在聆听，请说话...' :
                     status === 'speaking' ? '点击此处可打断' :
                     '准备聆听...'}
                  </Text>
                  {interimText.length > 0 && (
                    <Text style={[typography.bodySmall, { marginTop: 4, color: colors.textSecondary }]}>
                      "{interimText}"
                    </Text>
                  )}
                </TouchableOpacity>
              ) : (
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
                  <TouchableOpacity style={styles.micSmallBtn} onPress={handleMicPress}>
                    <Ionicons
                      name={status === 'listening' ? 'mic' : 'mic-outline'}
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
              )}
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
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
  modeToggle: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, backgroundColor: '#F5F5F5',
  },
  modeToggleActive: { backgroundColor: colors.primary },
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
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
