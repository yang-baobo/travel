/**
 * FloatingMiniChat -- 路线页面悬浮迷你聊天
 * 小圆按钮 + 可展开面板，支持电话模式和打断
 * 进入 presenting 阶段时自动 TTS 路线介绍
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_WIDTH = Math.min(320, SCREEN_WIDTH - 40);
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.5;

interface Props {
  voiceEngine: VoiceEngine;
}

export default function FloatingMiniChat({ voiceEngine }: Props) {
  const { isElderlyMode, scaleIcon } = useElderlyMode();

  const phase = useAssistantStore((s) => s.phase);
  const messages = useAssistantStore((s) => s.messages);
  const isProcessing = useAssistantStore((s) => s.isProcessing);
  const isMiniExpanded = useAssistantStore((s) => s.isMiniExpanded);
  const routePresentationText = useAssistantStore((s) => s.routePresentationText);
  const {
    addMessage,
    setIsProcessing,
    setPhase,
    expandMini,
    collapseMini,
    requestRouteModification,
  } = useAssistantStore.getState();

  const [inputText, setInputText] = useState('');
  const [isPhoneMode, setIsPhoneMode] = useState(true);
  const [hasPresentedRoute, setHasPresentedRoute] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { status, interimText, startListening, stopListening, speakText, interruptSpeaking, setOnFinalText } = voiceEngine;

  // 注册最终文本回调
  useEffect(() => {
    setOnFinalText((text: string) => {
      handleSendMessage(text);
    });
    return () => setOnFinalText(null);
  }, [isProcessing]);

  // presenting 阶段自动 TTS 介绍路线
  useEffect(() => {
    if (phase === 'presenting' && routePresentationText && !hasPresentedRoute) {
      setHasPresentedRoute(true);
      const bubble: ChatBubble = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: routePresentationText,
        timestamp: Date.now(),
      };
      addMessage(bubble);
      speakText(routePresentationText, true).then(() => {
        // TTS 完毕后切换到 adjusting 阶段，等待用户反馈
        setPhase('adjusting');
      });
    }
  }, [phase, routePresentationText, hasPresentedRoute]);

  // 展开/收起动画
  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isMiniExpanded ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isMiniExpanded]);

  // 小猫脉冲动画（TTS 或监听时）
  useEffect(() => {
    if (status === 'speaking' || status === 'listening') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  // 自动滚到底部
  useEffect(() => {
    if (isMiniExpanded) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, interimText, isMiniExpanded]);

  // 发送消息（核心逻辑）
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
      const currentPhase = useAssistantStore.getState().phase;
      const response = await chatService.sendMessage(text.trim(), currentPhase);
      const navigationActions = executeActions(response.actions);

      const assistantBubble: ChatBubble = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: response.reply,
        timestamp: Date.now(),
      };
      addMessage(assistantBubble);

      // 检查路线修改类动作
      for (const action of navigationActions) {
        switch (action.type) {
          case 'change_restaurant':
          case 'change_hotel':
          case 'add_attraction':
          case 'remove_attraction':
            requestRouteModification(action.type, action.value);
            break;
        }
      }

      await speakText(response.reply, true);
    } catch (error) {
      console.error('FloatingMini send error:', error);
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
  }, [speakText]);

  // 切换展开/收起
  const handleToggleExpand = useCallback(() => {
    if (isMiniExpanded) {
      collapseMini();
    } else {
      expandMini();
    }
  }, [isMiniExpanded]);

  // 打断按钮
  const handleInterrupt = useCallback(() => {
    interruptSpeaking();
    if (!isMiniExpanded) {
      expandMini();
    }
  }, [isMiniExpanded, interruptSpeaking]);

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

  // 麦克风按钮
  const handleMicPress = useCallback(async () => {
    if (status === 'listening') {
      stopListening();
    } else {
      await startListening();
    }
  }, [status, startListening, stopListening]);

  // 发送文字
  const handleTextSend = useCallback(() => {
    if (inputText.trim()) {
      handleSendMessage(inputText.trim());
    }
  }, [inputText, handleSendMessage]);

  const panelHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, PANEL_HEIGHT],
  });

  const panelOpacity = expandAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.5, 1],
  });

  const fabSize = isElderlyMode ? 56 : 48;
  const statusColor = status === 'speaking' ? '#FF9800' : status === 'listening' ? '#4CAF50' : colors.primary;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* 展开面板 */}
      <Animated.View style={[
        styles.panel,
        {
          height: panelHeight,
          opacity: panelOpacity,
          width: PANEL_WIDTH,
        },
      ]}>
        {isMiniExpanded && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* 面板头部 */}
            <View style={styles.panelHeader}>
              <View style={styles.headerLeft}>
                <Text style={{ fontSize: 16 }}>🐱</Text>
                <Text style={[typography.caption, { marginLeft: 4, fontWeight: '600' }]}>
                  {phase === 'presenting' ? '路线介绍中...' :
                   phase === 'adjusting' ? '告诉我您的想法' : '小猫助手'}
                </Text>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity
                  style={[styles.modeToggleSmall, isPhoneMode && styles.modeToggleActive]}
                  onPress={handleTogglePhoneMode}
                >
                  <Ionicons
                    name={isPhoneMode ? 'call' : 'call-outline'}
                    size={scaleIcon(12)}
                    color={isPhoneMode ? '#fff' : colors.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleToggleExpand} style={styles.collapseBtn}>
                  <Ionicons name="chevron-down" size={scaleIcon(18)} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* 状态栏 */}
            {status !== 'idle' && (
              <View style={styles.statusBar}>
                <View style={[
                  styles.statusDot,
                  status === 'listening' && { backgroundColor: '#4CAF50' },
                  status === 'speaking' && { backgroundColor: '#FF9800' },
                ]} />
                <Text style={[typography.caption, { marginLeft: 4, fontSize: 11 }]}>
                  {status === 'listening' ? '聆听中...' : status === 'speaking' ? '播放中...' : ''}
                </Text>
              </View>
            )}

            {/* 聊天区域 */}
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
                      { fontSize: 13, lineHeight: 18 },
                      msg.role === 'user' ? { color: '#fff' } : { color: '#333' },
                    ]}>
                      {msg.text}
                    </Text>
                  </View>
                </View>
              ))}

              {interimText.length > 0 && (
                <View style={[styles.bubble, styles.bubbleUser]}>
                  <View style={[styles.bubbleContent, styles.bubbleContentUser, { opacity: 0.6 }]}>
                    <Text style={{ fontSize: 13, color: '#fff' }}>{interimText}...</Text>
                  </View>
                </View>
              )}

              {isProcessing && (
                <View style={[styles.bubble, styles.bubbleAssistant]}>
                  <Text style={styles.bubbleAvatar}>🐱</Text>
                  <View style={[styles.bubbleContent, styles.bubbleContentAssistant]}>
                    <Text style={{ fontSize: 13, color: '#333' }}>正在思考...</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* 输入区域 */}
            <View style={styles.inputArea}>
              {isPhoneMode ? (
                <View style={styles.phoneRow}>
                  <TouchableOpacity
                    style={[styles.phoneBtn, { backgroundColor: status === 'listening' ? '#E8F5E9' : '#F5F5F5' }]}
                    onPress={status === 'speaking' ? interruptSpeaking : handleMicPress}
                  >
                    <Ionicons
                      name={status === 'speaking' ? 'volume-high' : 'mic'}
                      size={scaleIcon(20)}
                      color={status === 'listening' ? '#4CAF50' : status === 'speaking' ? '#FF9800' : colors.textSecondary}
                    />
                  </TouchableOpacity>
                  <Text style={[typography.caption, { flex: 1, textAlign: 'center', color: colors.textSecondary }]}>
                    {status === 'listening' ? '正在聆听...' :
                     status === 'speaking' ? '点击打断' : '点击说话'}
                  </Text>
                </View>
              ) : (
                <View style={styles.textRow}>
                  <TextInput
                    style={styles.textInput}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="输入修改意见..."
                    placeholderTextColor="#999"
                    onSubmitEditing={handleTextSend}
                    returnKeyType="send"
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, (!inputText.trim() || isProcessing) && { opacity: 0.5 }]}
                    onPress={handleTextSend}
                    disabled={!inputText.trim() || isProcessing}
                  >
                    <Ionicons name="send" size={scaleIcon(16)} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        )}
      </Animated.View>

      {/* 悬浮小圆按钮 */}
      <View style={styles.fabRow}>
        {/* 打断按钮（TTS 播放时显示） */}
        {status === 'speaking' && (
          <TouchableOpacity
            style={[styles.interruptBtn, { width: fabSize - 8, height: fabSize - 8, borderRadius: (fabSize - 8) / 2 }]}
            onPress={handleInterrupt}
            activeOpacity={0.7}
          >
            <Ionicons name="hand-left" size={scaleIcon(18)} color="#E53935" />
          </TouchableOpacity>
        )}

        {/* 小猫按钮 */}
        <TouchableOpacity
          style={[
            styles.fab,
            {
              width: fabSize,
              height: fabSize,
              borderRadius: fabSize / 2,
              borderColor: statusColor,
              borderWidth: status !== 'idle' ? 2 : 0,
            },
          ]}
          onPress={handleToggleExpand}
          activeOpacity={0.8}
        >
          <Animated.Text style={{ fontSize: isElderlyMode ? 28 : 24, transform: [{ scale: pulseAnim }] }}>
            🐱
          </Animated.Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    alignItems: 'flex-end',
    zIndex: 999,
  },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeToggleSmall: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center', alignItems: 'center',
  },
  modeToggleActive: { backgroundColor: colors.primary },
  collapseBtn: { padding: 2 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#FAFAFA',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ccc' },
  chatArea: { flex: 1 },
  chatContent: { padding: 10, paddingBottom: 4 },
  bubble: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAssistant: { justifyContent: 'flex-start' },
  bubbleAvatar: { fontSize: 14, marginRight: 4, marginTop: 2 },
  bubbleContent: {
    maxWidth: '80%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
  },
  bubbleContentUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleContentAssistant: { backgroundColor: '#F5F5F5', borderBottomLeftRadius: 4 },
  inputArea: {
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
    paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#fff',
  },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  phoneBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  textRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  textInput: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
  },
  sendBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  fabRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  interruptBtn: {
    backgroundColor: '#FFEBEE',
    justifyContent: 'center', alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  fab: {
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
