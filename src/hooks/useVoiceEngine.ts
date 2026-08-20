/**
 * 语音引擎 Hook — STT/TTS 共享逻辑
 * 从 VoiceAssistant 提取，供 FullPanelChat 和 FloatingMiniChat 共享
 */

import { useCallback, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { voiceService } from '../utils/voiceService';

export type VoiceStatus = 'idle' | 'listening' | 'speaking' | 'error';

// STT 配置
const speechRecognitionOptions = {
  lang: 'zh-CN',
  interimResults: true,
  continuous: false,
  requiresOnDeviceRecognition: false,
  addsPunctuation: true,
  contextualStrings: [
    '北京', '故宫', '天坛', '颐和园', '圆明园', '八达岭长城',
    '国家博物馆', '什刹海', '南锣鼓巷', '奥林匹克公园', '环球影城',
    '东城', '西城', '朝阳', '海淀', '丰台', '石景山', '昌平', '延庆',
    '王府井', '前门', '三里屯', '国贸', '地铁', '公交',
    '酒店', '民宿', '餐厅', '景点', '门票', '路线', '行程',
  ],
};

export interface VoiceEngine {
  status: VoiceStatus;
  interimText: string;
  startListening: () => Promise<void>;
  stopListening: () => void;
  speakText: (text: string, shouldResumeListening?: boolean) => Promise<void>;
  interruptSpeaking: () => void;
  /** 注册最终文本回调（3秒静默后触发） */
  setOnFinalText: (cb: ((text: string) => void) | null) => void;
}

export function useVoiceEngine(): VoiceEngine {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [interimText, setInterimText] = useState('');

  const currentTextRef = useRef('');
  const shouldListenRef = useRef(false);
  const isTTSPlayingRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalTextRef = useRef<((text: string) => void) | null>(null);

  // ---- 静默计时器 ----
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
        onFinalTextRef.current?.(text);
      }
    }, 3000);
  }, [clearSilenceTimer]);

  // ---- STT 控制 ----
  const startListening = useCallback(async () => {
    if (isTTSPlayingRef.current) return;
    shouldListenRef.current = true;
    setStatus('listening');
    try {
      await ExpoSpeechRecognitionModule.start(speechRecognitionOptions);
    } catch (e) {
      console.log('Failed to start STT:', e);
      setStatus('error');
    }
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    clearSilenceTimer();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {}
  }, [clearSilenceTimer]);

  // ---- TTS 控制 ----
  const speakText = useCallback(async (text: string, shouldResumeListening = true) => {
    isTTSPlayingRef.current = true;
    setStatus('speaking');
    clearSilenceTimer();
    try { ExpoSpeechRecognitionModule.stop(); } catch (e) {}

    await voiceService.speak(text);

    isTTSPlayingRef.current = false;

    if (shouldResumeListening) {
      shouldListenRef.current = true;
      setTimeout(async () => {
        if (!isTTSPlayingRef.current) {
          try {
            await ExpoSpeechRecognitionModule.start(speechRecognitionOptions);
            setStatus('listening');
          } catch (e) {
            console.log('Failed to resume STT after TTS:', e);
            setStatus('idle');
          }
        }
      }, 300);
    } else {
      setStatus('idle');
    }
  }, [clearSilenceTimer]);

  const interruptSpeaking = useCallback(() => {
    if (isTTSPlayingRef.current) {
      voiceService.stopSpeaking();
      isTTSPlayingRef.current = false;
    }
    shouldListenRef.current = true;
    setStatus('listening');
    try { ExpoSpeechRecognitionModule.start(speechRecognitionOptions); } catch (e) {}
  }, []);

  const setOnFinalText = useCallback((cb: ((text: string) => void) | null) => {
    onFinalTextRef.current = cb;
  }, []);

  // ---- STT 事件 ----
  useSpeechRecognitionEvent('result', (event) => {
    if (isTTSPlayingRef.current) return;
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
    if (!isTTSPlayingRef.current) {
      setStatus('listening');
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (isTTSPlayingRef.current) return;
    if (currentTextRef.current.trim().length > 0 && !silenceTimerRef.current) {
      startSilenceTimer();
    }
    if (shouldListenRef.current) {
      setTimeout(() => {
        if (shouldListenRef.current && !isTTSPlayingRef.current) {
          try { ExpoSpeechRecognitionModule.start(speechRecognitionOptions); } catch (e) {}
        }
      }, 100);
    } else {
      setStatus('idle');
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (isTTSPlayingRef.current) return;
    if (event.error === 'no-speech' || event.error === 'aborted') {
      if (currentTextRef.current.trim().length > 0 && !silenceTimerRef.current) {
        startSilenceTimer();
      }
      if (shouldListenRef.current) {
        setTimeout(() => {
          if (shouldListenRef.current && !isTTSPlayingRef.current) {
            try { ExpoSpeechRecognitionModule.start(speechRecognitionOptions); } catch (e) {}
          }
        }, 100);
      }
    } else if (event.error !== 'not-allowed') {
      setStatus('error');
    }
  });

  return {
    status,
    interimText,
    startListening,
    stopListening,
    speakText,
    interruptSpeaking,
    setOnFinalText,
  };
}
