/**
 * VoiceAssistant — 小猫助手语音对话组件
 * 悬浮按钮 + 对话面板 + STT/TTS 电话模式
 * 支持导航到路线页面、打开选择器等操作
 * 
 * 核心原则：TTS播放期间完全停止STT，播放完成后再恢复监听
 * 启用iOS voiceChat模式进行回声消除（AEC）
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useElderlyMode } from '../theme/ElderlyModeContext';
import { voiceService } from '../utils/voiceService';
import { chatService, AIResponse } from '../utils/chatService';
import { executeActions } from '../utils/assistantActions';
import { generateRoute, RouteSummary, getRouteSummaryText } from '../utils/routeGenerator';
import { useAssistantActionStore } from '../store/useAssistantActionStore';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { 
  configureVoiceChatSession, 
  configurePlaybackSession, 
  configureRecordingSession, 
  resetAudioSession 
} from '../utils/audioSession';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ChatBubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export default function VoiceAssistant() {
  const { isElderlyMode, scaleIcon, scaleFont } = useElderlyMode();
  const navigation = useNavigation<any>();
  const assistantActionStore = useAssistantActionStore();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [inputText, setInputText] = useState('');
  const [isPhoneMode, setIsPhoneMode] = useState(true);
  const [status, setStatus] = useState<'idle' | 'listening' | 'speaking' | 'error'>('idle');
  const [interimText, setInterimText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [stage, setStage] = useState<'collecting' | 'generating' | 'confirming' | 'speaking' | 'adjusting' | 'done'>('collecting');

  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const micPulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // 当前语音识别文本（每次识别独立，不累积）
  const currentTextRef = useRef('');
  const shouldListenRef = useRef(false);
  // 3秒静默计时器：用户停止说话3秒后自动发送
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 用ref持有handleSendMessage，避免闭包陈旧
  const handleSendMessageRef = useRef<(text: string) => void>(() => {});
  // TTS 正在播放标志
  const isTTSPlayingRef = useRef(false);
  // 初始化标志
  const isInitializedRef = useRef(false);

  // 统一语音识别启动配置（提升准确度）
  const speechRecognitionOptions = {
    lang: 'zh-CN',
    interimResults: true,
    continuous: false, // 每段语音独立识别，准确度更高
    requiresOnDeviceRecognition: false, // 使用服务端识别
    addsPunctuation: true,
    contextualStrings: [
      '北京', '故宫', '天坛', '颐和园', '圆明园', '八达岭长城',
      '国家博物馆', '什刹海', '南锣鼓巷', '奥林匹克公园', '环球影城',
      '东城', '西城', '朝阳', '海淀', '丰台', '石景山', '昌平', '延庆',
      '王府井', '前门', '三里屯', '国贸', '地铁', '公交',
      '酒店', '民宿', '餐厅', '景点', '门票', '路线', '行程',
    ],
  };

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      const text = currentTextRef.current.trim();
      if (text.length > 0) {
        currentTextRef.current = '';
        setInterimText('');
        handleSendMessageRef.current(text);
      }
    }, 3000);
  }, [clearSilenceTimer]);

  // 开始监听（启动 STT）
  const startListening = useCallback(async () => {
    // 如果TTS正在播放，不启动监听
    if (isTTSPlayingRef.current) {
      console.log('TTS is playing, skip starting listening');
      return;
    }
    
    shouldListenRef.current = true;
    setStatus('listening');
    
    try {
      // 直接启动STT，不配置音频会话
      await ExpoSpeechRecognitionModule.start(speechRecognitionOptions);
      console.log('STT started');
    } catch (e) {
      console.log('Failed to start STT:', e);
      setStatus('error');
    }
  }, []);

  // 停止监听
  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {}
  }, []);

  /**
   * 朗读文本（TTS）
   * 核心改动：播放期间完全停止STT，播放完成后再恢复监听
   */
  const speakAndListen = useCallback(async (text: string) => {
    // 保存当前是否需要监听的状态
    const wasListening = shouldListenRef.current;
    
    isTTSPlayingRef.current = true;
    setStatus('speaking');
    
    // 停止STT监听（但不改变shouldListenRef）
    clearSilenceTimer();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {}
    
    // 播放 TTS（不配置音频会话，让系统TTS使用默认设置）
    await voiceService.speak(text);
    
    // TTS 播放完成，恢复监听
    isTTSPlayingRef.current = false;
    
    // 如果是电话模式且之前需要监听，恢复监听
    if (isPhoneMode && wasListening) {
      // 稍微延迟，确保TTS完全停止
      setTimeout(async () => {
        await startListening();
        setStatus('listening');
      }, 300);
    } else {
      setStatus('idle');
    }
  }, [isPhoneMode, startListening, clearSilenceTimer]);

  // 点击打断 TTS 并开始说话
  const handleInterruptAndSpeak = useCallback(async () => {
    if (isTTSPlayingRef.current) {
      // 打断 TTS
      voiceService.stopSpeaking();
      isTTSPlayingRef.current = false;
      
      // 开始监听
      setStatus('listening');
      await startListening();
    }
  }, [startListening]);

  // 使用 hook 监听语音识别事件
  useSpeechRecognitionEvent('result', (event) => {
    console.log('Speech result:', event);
    
    // 如果TTS正在播放，忽略所有识别结果
    if (isTTSPlayingRef.current) {
      console.log('TTS is playing, ignore speech result');
      return;
    }
    
    const transcript = event.results?.[0]?.transcript || '';
    const isFinal = event.isFinal;
    
    if (transcript) {
      currentTextRef.current = transcript;
      if (isFinal) {
        setInterimText('');
      } else {
        setInterimText(transcript);
      }
      startSilenceTimer();
    }
  });

  useSpeechRecognitionEvent('start', () => {
    console.log('Speech recognition started');
    if (!isTTSPlayingRef.current) {
      setStatus('listening');
    }
  });

  useSpeechRecognitionEvent('end', () => {
    console.log('Speech recognition ended');
    
    // 如果TTS正在播放，不重启STT
    if (isTTSPlayingRef.current) {
      return;
    }
    
    // 识别结束时，如果有文本且没有计时器在运行，启动一个
    if (currentTextRef.current.trim().length > 0 && !silenceTimerRef.current) {
      startSilenceTimer();
    }
    
    // 如果需要继续监听，重启 STT
    if (shouldListenRef.current) {
      setTimeout(() => {
        if (shouldListenRef.current && !isTTSPlayingRef.current) {
          ExpoSpeechRecognitionModule.start(speechRecognitionOptions);
        }
      }, 100);
    } else {
      setStatus('idle');
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.log('Speech error:', event);
    
    // 如果TTS正在播放，忽略错误
    if (isTTSPlayingRef.current) {
      return;
    }
    
    if (event.error === 'no-speech' || event.error === 'aborted') {
      // no-speech时，如果有文本也要发送
      if (currentTextRef.current.trim().length > 0 && !silenceTimerRef.current) {
        startSilenceTimer();
      }
      // 继续监听
      if (shouldListenRef.current) {
        setTimeout(() => {
          if (shouldListenRef.current && !isTTSPlayingRef.current) {
            ExpoSpeechRecognitionModule.start(speechRecognitionOptions);
          }
        }, 100);
      }
    } else if (event.error !== 'not-allowed') {
      setStatus('error');
    }
  });

  // 悬浮按钮脉冲动画
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
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

  // 初始化 - 请求权限
  useEffect(() => {
    const requestPermissions = async () => {
      const granted = await voiceService.requestPermissions();
      console.log('Permissions granted:', granted);
    };
    requestPermissions();
  }, []);

  // 打开面板
  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // 首次打开：小猫说话，说话完成后再开始监听
    if (messages.length === 0) {
      const greeting = chatService.getGreeting();
      const greetingBubble: ChatBubble = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: greeting.reply,
        timestamp: Date.now(),
      };
      setMessages([greetingBubble]);

      if (isPhoneMode) {
        // 设置监听标志，speakAndListen 会在播放完成后自动启动监听
        shouldListenRef.current = true;
        await speakAndListen(greeting.reply);
      }
    } else if (isPhoneMode) {
      // 非首次打开，直接开始监听
      await startListening();
    }
  }, [messages.length, isPhoneMode, speakAndListen, startListening]);

  // 关闭面板
  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setIsOpen(false);
      shouldListenRef.current = false;
      isTTSPlayingRef.current = false;
      clearSilenceTimer();
      stopListening();
      voiceService.stopSpeaking();
      setInterimText('');
      currentTextRef.current = '';
      setStatus('idle');
    });
  }, [clearSilenceTimer, stopListening]);

  // 处理导航和页面操作动作
  const handleNavigationActions = useCallback(async (actions: any[]) => {
    for (const action of actions) {
      switch (action.type) {
        case 'navigate_to_route_plan':
          handleClose();
          setTimeout(() => {
            navigation.navigate('CustomTab', { screen: 'RoutePlan' });
          }, 300);
          break;

        case 'navigate_to_home':
          handleClose();
          setTimeout(() => {
            navigation.navigate('MainTab', { screen: 'Home' });
          }, 300);
          break;

        case 'navigate_to_orders':
          handleClose();
          setTimeout(() => {
            navigation.navigate('MainTab', { screen: 'Orders' });
          }, 300);
          break;

        case 'navigate_to_profile':
          handleClose();
          setTimeout(() => {
            navigation.navigate('MainTab', { screen: 'Profile' });
          }, 300);
          break;

        case 'open_restaurant_picker':
        case 'open_hotel_picker':
        case 'open_attraction_picker':
        case 'change_restaurant':
        case 'change_hotel':
        case 'add_attraction':
        case 'remove_attraction':
        case 'confirm_route':
          // 这些动作派发给页面处理
          assistantActionStore.dispatchAction(action.type, action.value);
          break;

        case 'speak_route_summary':
          // 朗读路线摘要
          if (action.value?.text) {
            await speakAndListen(action.value.text);
          }
          break;
      }
    }
  }, [navigation, assistantActionStore, handleClose, speakAndListen]);

  // 发送消息
  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isProcessing) return;

    const userBubble: ChatBubble = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userBubble]);
    setInputText('');
    setIsProcessing(true);

    try {
      const response = await chatService.sendMessage(text.trim());

      // 执行 actions，返回需要 VoiceAssistant 处理的导航类动作
      const navigationActions = executeActions(response.actions);
      setStage(response.stage);

      const assistantBubble: ChatBubble = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: response.reply,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantBubble]);

      // 处理路线生成
      if (response.stage === 'generating' || response.actions.some(a => a.type === 'generate_route')) {
        const selectedIds = response.actions
          .find(a => a.type === 'select_attractions')?.value as string[] | undefined;
        const summary = generateRoute(selectedIds);
        setRouteSummary(summary);

        // 朗读 AI 回复 + 行程摘要
        const fullText = response.reply + '。' + summary.summaryText;
        await speakAndListen(fullText);

        // 处理导航到路线页面
        const navAction = navigationActions.find(a => a.type === 'navigate_to_route_plan');
        if (navAction) {
          // 关闭对话面板，跳转到路线页面
          handleClose();
          setTimeout(() => {
            navigation.navigate('CustomTab', { screen: 'RoutePlan' });
            // 派发动作，让 RoutePlanScreen 知道要朗读摘要
            assistantActionStore.dispatchAction('speak_route_summary', {
              text: summary.summaryText,
            });
          }, 300);
        } else {
          setStage('confirming');
        }
      } else {
        // 朗读 AI 回复
        await speakAndListen(response.reply);

        // 处理其他导航动作
        await handleNavigationActions(navigationActions);
      }
    } catch (error) {
      console.error('Send message error:', error);
      const errorText = '出了点小问题，您再说一次好吗？';
      const errorBubble: ChatBubble = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: errorText,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorBubble]);
      await speakAndListen(errorText);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, navigation, assistantActionStore, handleClose, speakAndListen, handleNavigationActions]);

  // 同步ref，确保silenceTimer用到最新的handleSendMessage
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // 文字发送
  const handleTextSend = useCallback(() => {
    if (inputText.trim()) {
      handleSendMessage(inputText.trim());
    }
  }, [inputText, handleSendMessage]);

  // 麦克风按钮
  const handleMicPress = useCallback(async () => {
    if (status === 'listening') {
      shouldListenRef.current = false;
      clearSilenceTimer();
      stopListening();
      // 发送当前文本
      const fullText = currentTextRef.current.trim();
      currentTextRef.current = '';
      setInterimText('');
      if (fullText.length > 0) {
        handleSendMessage(fullText);
      }
    } else {
      await startListening();
    }
  }, [status, handleSendMessage, clearSilenceTimer, startListening, stopListening]);

  // 路线确认
  const handleConfirmRoute = useCallback(async () => {
    setStage('done');
    const confirmText = '好的！路线已经帮您安排好啦，祝您旅途愉快！';
    const confirmBubble: ChatBubble = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: confirmText,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, confirmBubble]);
    await speakAndListen(confirmText);
  }, [speakAndListen]);

  // 重新生成
  const handleRegenerate = useCallback(async () => {
    setStage('collecting');
    setRouteSummary(null);
    const regenText = '好的，那我帮您重新安排，您还有什么想法吗？';
    const regenBubble: ChatBubble = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: regenText,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, regenBubble]);
    await speakAndListen(regenText);
  }, [speakAndListen]);

  // 切换电话模式
  const handleTogglePhoneMode = useCallback(async () => {
    const newMode = !isPhoneMode;
    setIsPhoneMode(newMode);

    if (newMode) {
      // 切换到电话模式：朗读最近助手消息，然后开始监听
      if (messages.length > 0) {
        const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistantMsg) {
          shouldListenRef.current = true;
          await speakAndListen(lastAssistantMsg.text);
        } else {
          await startListening();
        }
      } else {
        await startListening();
      }
    } else {
      // 切换到文字模式：停止监听
      stopListening();
      voiceService.stopSpeaking();
      isTTSPlayingRef.current = false;
      setStatus('idle');
    }
  }, [isPhoneMode, messages, speakAndListen, startListening, stopListening]);

  // 重播某条消息
  const handleReplay = useCallback(async (text: string) => {
    voiceService.stopSpeaking();
    await speakAndListen(text);
  }, [speakAndListen]);

  // 自动滚到底部
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, interimText]);

  const fabSize = isElderlyMode ? 68 : 56;

  return (
    <>
      {/* 悬浮小猫按钮 */}
      {!isOpen && (
        <Animated.View
          style={[
            styles.fab,
            {
              width: fabSize,
              height: fabSize,
              borderRadius: fabSize / 2,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.fabInner, { width: fabSize, height: fabSize, borderRadius: fabSize / 2 }]}
            onPress={handleOpen}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: isElderlyMode ? 32 : 26 }}>🐱</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* 对话面板 */}
      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={handleClose}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.panel,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
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
                   status === 'speaking' ? '正在说话（点击可打断）...' :
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
                        正在思考...
                      </Text>
                    </View>
                  </View>
                )}

                {/* 路线确认卡片 */}
                {stage === 'confirming' && routeSummary && (
                  <View style={styles.confirmCard}>
                    <Text style={[typography.h3, { marginBottom: 8 }]}>行程安排</Text>
                    {routeSummary.days.map((day) => (
                      <View key={day.day} style={styles.dayBlock}>
                        <Text style={[typography.body, { fontWeight: '600' }]}>
                          第{day.day}天
                        </Text>
                        {day.attractions.map((a) => (
                          <Text key={a.id} style={typography.bodySmall}>
                            {a.time} {a.name}（{a.duration}小时）
                          </Text>
                        ))}
                        {day.lunch && (
                          <Text style={[typography.bodySmall, { color: '#E65100' }]}>
                            午餐：{day.lunch.name}
                          </Text>
                        )}
                        {day.dinner && (
                          <Text style={[typography.bodySmall, { color: '#E65100' }]}>
                            晚餐：{day.dinner.name}
                          </Text>
                        )}
                      </View>
                    ))}
                    {routeSummary.hotel && (
                      <Text style={[typography.bodySmall, { marginTop: 4 }]}>
                        住宿：{routeSummary.hotel.name}（{routeSummary.hotel.pricePerNight}元/晚）
                      </Text>
                    )}
                    <Text style={[typography.body, { fontWeight: '600', marginTop: 8 }]}>
                      预计总费用：约{routeSummary.totalEstimatedCost}元
                    </Text>

                    <View style={styles.confirmButtons}>
                      <TouchableOpacity
                        style={[styles.confirmBtn, styles.confirmBtnPrimary]}
                        onPress={handleConfirmRoute}
                      >
                        <Ionicons name="checkmark-circle" size={scaleIcon(20)} color="#fff" />
                        <Text style={[typography.button, { color: '#fff', marginLeft: 6 }]}>
                          好的，就这样
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.confirmBtn, styles.confirmBtnSecondary]}
                        onPress={handleRegenerate}
                      >
                        <Ionicons name="refresh" size={scaleIcon(20)} color={colors.primary} />
                        <Text style={[typography.button, { color: colors.primary, marginLeft: 6 }]}>
                          帮我换一个
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* 完成提示 */}
                {stage === 'done' && (
                  <View style={styles.doneCard}>
                    <Ionicons name="checkmark-circle" size={scaleIcon(40)} color="#4CAF50" />
                    <Text style={[typography.body, { marginTop: 8, textAlign: 'center' }]}>
                      路线已生成！可以在路线页面查看详情。
                    </Text>
                  </View>
                )}
              </ScrollView>

              {/* 底部输入区 */}
              <View style={styles.inputArea}>
                {isPhoneMode ? (
                  /* 电话模式：显示状态，点击可打断 */
                  <TouchableOpacity 
                    style={styles.phoneModeInput}
                    onPress={handleInterruptAndSpeak}
                    activeOpacity={0.7}
                  >
                    <Animated.View style={[
                      styles.listeningIndicator,
                      status === 'speaking' && styles.speakingIndicator,
                      { transform: [{ scale: status === 'listening' ? micPulseAnim : 1 }] }
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
                  /* 文字模式 */
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
                      style={styles.micSmallBtn}
                      onPress={handleMicPress}
                    >
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
    </>
  );
}

const styles = StyleSheet.create({
  // 悬浮按钮
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    backgroundColor: colors.primary,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 999,
  },
  fabInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 模态覆盖
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },

  // 面板
  panel: {
    height: SCREEN_HEIGHT * 0.78,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },

  // 顶部栏
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
  },
  modeToggleActive: {
    backgroundColor: colors.primary,
  },
  closeBtn: {
    padding: 4,
  },

  // 状态指示
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: '#FAFAFA',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ccc',
  },
  statusDotListening: {
    backgroundColor: '#4CAF50',
  },
  statusDotSpeaking: {
    backgroundColor: '#FF9800',
  },
  statusDotError: {
    backgroundColor: '#E53935',
  },

  // 聊天区域
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 8,
  },

  // 气泡
  bubble: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  bubbleUser: {
    justifyContent: 'flex-end',
  },
  bubbleAssistant: {
    justifyContent: 'flex-start',
  },
  bubbleAvatar: {
    fontSize: 20,
    marginRight: 8,
    marginTop: 4,
  },
  bubbleContent: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleContentUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleContentAssistant: {
    backgroundColor: '#F5F5F5',
    borderBottomLeftRadius: 4,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  bubbleTextAssistant: {
    color: '#333',
  },
  replayBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    padding: 2,
  },

  // 路线确认卡片
  confirmCard: {
    backgroundColor: '#F8FFF8',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  dayBlock: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  confirmBtnPrimary: {
    backgroundColor: colors.primary,
  },
  confirmBtnSecondary: {
    backgroundColor: '#F0F0F0',
  },

  // 完成卡片
  doneCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8FFF8',
    borderRadius: 16,
    marginTop: 8,
  },

  // 底部输入
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },

  // 电话模式
  phoneModeInput: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  listeningIndicator: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speakingIndicator: {
    backgroundColor: '#FFF3E0',
  },
  bigMicBtn: {
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  bigMicBtnActive: {
    backgroundColor: '#E53935',
  },

  // 文字模式
  textModeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
  },
  micSmallBtn: {
    padding: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
