import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder } from '@siteed/audio-studio';
import { getRealtimeWebSocketUrl } from '../services/aiService';
import { buildAssistantContext } from '../utils/assistantContext';
import { float32ToPcm16Base64 } from '../utils/audioEncoding';
import { RealtimePcmPlayer } from '../utils/realtimePcmPlayer';
import { usePlanningSessionStore } from '../store/usePlanningSessionStore';

export type RealtimeVoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'assistant_speaking'
  | 'error'
  | 'ended';

export interface RealtimeTranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface RealtimeVoiceSession {
  status: RealtimeVoiceStatus;
  error: string | null;
  muted: boolean;
  durationSeconds: number;
  transcript: RealtimeTranscriptItem[];
  assistantDraft: string;
  startCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
}

export function useRealtimeVoice(): RealtimeVoiceSession {
  const recorder = useAudioRecorder();
  const [status, setStatus] = useState<RealtimeVoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [transcript, setTranscript] = useState<RealtimeTranscriptItem[]>([]);
  const [assistantDraft, setAssistantDraft] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const mutedRef = useRef(false);
  const connectedRef = useRef(false);
  const recordingActiveRef = useRef(false);
  const endingRef = useRef(false);
  const playerRef = useRef(new RealtimePcmPlayer());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopRecorder = useCallback(async () => {
    if (recordingActiveRef.current) {
      recordingActiveRef.current = false;
      await recorder.stopRecording().catch(() => undefined);
    }
  }, [recorder.stopRecording]);

  const endCall = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    connectedRef.current = false;
    stopTimer();
    await stopRecorder();
    await playerRef.current.interrupt();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'user ended call');
    setStatus('ended');
    endingRef.current = false;
  }, [stopRecorder, stopTimer]);

  const startStreamingRecorder = useCallback(async () => {
    await recorder.startRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      streamFormat: 'float32',
      interval: 100,
      bufferDurationSeconds: 0.1,
      keepFullAnalysis: false,
      output: { primary: { enabled: false } },
      onAudioStream: async event => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN || mutedRef.current) return;
        const samples = event.data instanceof Float32Array
          ? event.data
          : new Float32Array(event.data as ArrayLike<number>);
        if (samples.length === 0) return;
        socket.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: float32ToPcm16Base64(samples),
        }));
      },
    });
    recordingActiveRef.current = true;
  }, [recorder.startRecording]);

  const startCall = useCallback(async () => {
    const url = getRealtimeWebSocketUrl();
    if (!url) {
      setError('请先填写 EXPO_PUBLIC_REALTIME_WS_URL，再启动实时语音服务。');
      setStatus('error');
      return;
    }
    if (socketRef.current) return;

    setError(null);
    setTranscript([]);
    setAssistantDraft('');
    setDurationSeconds(0);
    setStatus('connecting');
    endingRef.current = false;

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      const planning = usePlanningSessionStore.getState().session;
      socket.send(JSON.stringify({
        type: 'client.configure',
        context: {
          ...buildAssistantContext(),
          planning_session: planning ? {
            id: planning.id,
            status: planning.status,
            request: {
              ...planning.request,
              candidates: planning.request.candidates.map(candidate => ({
                source: candidate.source,
                sourceId: candidate.sourceId,
                name: candidate.name,
                category: candidate.category,
                latitude: candidate.latitude,
                longitude: candidate.longitude,
              })),
            },
            messages: planning.messages.slice(-20),
          } : null,
        },
      }));
    };

    socket.onmessage = async message => {
      let event: any;
      try {
        event = JSON.parse(String(message.data));
      } catch (_) {
        return;
      }

      if (event.type === 'proxy.ready') {
        try {
          await startStreamingRecorder();
          connectedRef.current = true;
          setStatus('listening');
          timerRef.current = setInterval(() => setDurationSeconds(value => value + 1), 1000);
        } catch (recordingError) {
          setError(recordingError instanceof Error ? recordingError.message : '无法使用麦克风');
          setStatus('error');
        }
        return;
      }
      if (event.type === 'proxy.error' || event.type === 'error') {
        setError(event.message || event.error?.message || '实时语音服务发生错误');
        setStatus('error');
        return;
      }
      if (event.type === 'input_audio_buffer.speech_started') {
        setStatus('user_speaking');
        await playerRef.current.interrupt();
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'response.cancel' }));
        return;
      }
      if (event.type === 'input_audio_buffer.speech_stopped') {
        setStatus('listening');
        return;
      }
      if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
        usePlanningSessionStore.getState().addMessage({
          role: 'user',
          text: String(event.transcript),
          inputMethod: 'realtime',
        });
        setTranscript(items => [...items, {
          id: event.item_id || `user-${Date.now()}`,
          role: 'user',
          text: event.transcript,
        }]);
        return;
      }
      if (event.type === 'response.audio.delta' && event.delta) {
        setStatus('assistant_speaking');
        await playerRef.current.enqueue(event.delta);
        return;
      }
      if (event.type === 'response.audio_transcript.delta') {
        setAssistantDraft(value => value + String(event.delta || ''));
        return;
      }
      if (event.type === 'response.audio_transcript.done') {
        const text = String(event.transcript || assistantDraft).trim();
        if (text) {
          usePlanningSessionStore.getState().addMessage({ role: 'assistant', text });
          setTranscript(items => [...items, {
            id: event.item_id || `assistant-${Date.now()}`,
            role: 'assistant',
            text,
          }]);
        }
        setAssistantDraft('');
        return;
      }
      if (event.type === 'response.audio.done') {
        await playerRef.current.complete();
        if (connectedRef.current) setStatus('listening');
      }
    };

    socket.onerror = () => {
      setError('无法连接实时语音服务，请检查 WebSocket 地址和服务端配置。');
      setStatus('error');
    };
    socket.onclose = () => {
      connectedRef.current = false;
      stopTimer();
      void stopRecorder();
      socketRef.current = null;
      setStatus(current => current === 'error' ? current : 'ended');
    };
  }, [assistantDraft, startStreamingRecorder, stopRecorder, stopTimer]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  useEffect(() => () => {
    connectedRef.current = false;
    stopTimer();
    socketRef.current?.close();
    void playerRef.current.interrupt();
  }, [stopTimer]);

  return {
    status,
    error,
    muted,
    durationSeconds,
    transcript,
    assistantDraft,
    startCall,
    endCall,
    toggleMute,
  };
}
