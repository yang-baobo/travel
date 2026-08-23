/** StepAudio 2.5 ASR 语音输入 + 系统朗读。电话模式由 useRealtimeVoice 独立处理。 */
import { useCallback, useRef, useState } from 'react';
import { useAudioRecorder } from '@siteed/audio-studio';
import { transcribeAudio } from '../services/aiService';
import { recordingUriToBase64 } from '../utils/audioEncoding';
import { voiceService } from '../utils/voiceService';

export type VoiceStatus = 'idle' | 'listening' | 'transcribing' | 'speaking' | 'error';

export interface VoiceEngine {
  status: VoiceStatus;
  interimText: string;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  speakText: (text: string, shouldResumeListening?: boolean) => Promise<void>;
  interruptSpeaking: () => void;
  setOnFinalText: (cb: ((text: string) => void) | null) => void;
}

export function useVoiceEngine(): VoiceEngine {
  const recorder = useAudioRecorder();
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [interimText, setInterimText] = useState('');
  const onFinalTextRef = useRef<((text: string) => void) | null>(null);
  const recordingRef = useRef(false);
  const speakingRef = useRef(false);

  const startListening = useCallback(async () => {
    if (recordingRef.current || speakingRef.current) return;
    setInterimText('正在录音，完成后再点一次麦克风');
    setStatus('listening');
    try {
      await recorder.startRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 250,
        keepFullAnalysis: false,
        maxDurationMs: 60_000,
        autoStopOnMaxDuration: false,
      });
      recordingRef.current = true;
    } catch (error) {
      setInterimText('');
      setStatus('error');
      throw error;
    }
  }, [recorder.startRecording]);

  const stopListening = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setStatus('transcribing');
    setInterimText('StepAudio 2.5 正在识别…');
    try {
      const recording = await recorder.stopRecording();
      const audioBase64 = await recordingUriToBase64(recording.fileUri);
      const text = await transcribeAudio(audioBase64, 'wav');
      setInterimText('');
      setStatus('idle');
      onFinalTextRef.current?.(text);
    } catch (error) {
      console.error('StepAudio ASR failed:', error);
      setInterimText('');
      setStatus('error');
    }
  }, [recorder.stopRecording]);

  const speakText = useCallback(async (text: string, shouldResumeListening = false) => {
    speakingRef.current = true;
    setStatus('speaking');
    await voiceService.speak(text);
    speakingRef.current = false;
    setStatus('idle');
    if (shouldResumeListening) await startListening();
  }, [startListening]);

  const interruptSpeaking = useCallback(() => {
    voiceService.stopSpeaking();
    speakingRef.current = false;
    setStatus('idle');
  }, []);

  const setOnFinalText = useCallback((callback: ((text: string) => void) | null) => {
    onFinalTextRef.current = callback;
  }, []);

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
