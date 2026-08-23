import { Platform } from 'react-native';
import { apiRequest } from './apiClient';
import type { AIResponse } from '../utils/chatService';

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIProviderConfig {
  glm: { configured: boolean; model: string };
  stepfun_asr: { configured: boolean; model: string };
  stepfun_realtime: { configured: boolean; model: string; voice: string };
}

interface ASRResponse {
  text: string;
  provider: 'stepfun';
  model: string;
}

export function getAIProviderConfig(): Promise<AIProviderConfig> {
  return apiRequest<AIProviderConfig>('/api/ai/config');
}

export function sendAIChat(
  messages: AIChatMessage[],
  context: Record<string, unknown>,
  phase?: string,
): Promise<AIResponse> {
  return apiRequest<AIResponse>('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages.slice(-30), context, phase }),
  }, 45_000);
}

export async function transcribeAudio(
  audioBase64: string,
  format: 'wav' | 'm4a' | 'mp3' | 'ogg' | 'pcm' = 'wav',
): Promise<string> {
  const response = await apiRequest<ASRResponse>('/api/ai/asr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_base64: audioBase64,
      format: format === 'pcm'
        ? { type: 'pcm', codec: 'pcm_s16le', rate: 16000, bits: 16, channel: 1 }
        : { type: format },
      language: 'zh',
      hotwords: ['北京', '故宫', '天坛', '颐和园', '长城', '酒店', '餐厅', '路线', '盲盒'],
    }),
  }, 80_000);
  return response.text;
}

export function getRealtimeWebSocketUrl(): string | null {
  const explicit = (process.env.EXPO_PUBLIC_REALTIME_WS_URL || '').trim();
  if (explicit) return explicit;

  const apiBase = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (apiBase) {
    return `${apiBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/api/ai/realtime`;
  }

  // 同域 ASGI 部署可以零配置工作；Expo 本地网页开发仍建议显式填写端口。
  if (Platform.OS === 'web' && typeof window !== 'undefined' && !/^localhost:\d+$/.test(window.location.host)) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/ai/realtime`;
  }
  return null;
}
