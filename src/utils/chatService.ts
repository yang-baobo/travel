/** GLM 5.3 中转站旅行助手；远端未配置时保留本地降级能力。 */
import { sendAIChat, type AIChatMessage } from '../services/aiService';
import { buildAssistantContext } from './assistantContext';
import { ApiError } from '../services/apiClient';
import { tryParseLocalAssistantCommand } from './localAssistantAgent';

export interface AIAction {
  type: string;
  value?: any;
}

export interface AIResponse {
  reply: string;
  actions: AIAction[];
  stage: 'collecting' | 'generating' | 'speaking' | 'adjusting' | 'done';
  provider?: 'glm-relay' | 'remote_glm' | 'local_fallback' | 'unavailable';
  collected?: Record<string, any>;
  route_summary?: string;
}

type LocalStage = AIResponse['stage'] | 'confirming';

function normalizeStage(value?: string): LocalStage {
  if (value === 'generating' || value === 'speaking' || value === 'adjusting'
    || value === 'done' || value === 'confirming') return value;
  return 'collecting';
}

class ChatService {
  async sendMessage(
    userText: string,
    phaseContext?: string,
    messages: AIChatMessage[] = [],
  ): Promise<AIResponse> {
    const userMessage: AIChatMessage = { role: 'user', content: userText };
    const nextHistory = [...messages, userMessage].slice(-30);
    try {
      const response = await sendAIChat(nextHistory, buildAssistantContext(), normalizeStage(phaseContext));
      return response;
    } catch (error) {
      console.warn('GLM assistant unavailable, using local fallback:', error);
      const local = tryParseLocalAssistantCommand(userText, normalizeStage(phaseContext));
      const fallback = local || {
        reply: error instanceof ApiError && error.code === 'AI_NOT_CONFIGURED'
          ? 'GLM 5.3 的接口位置已经接好，填写中转站地址和 API Key 后就会启用。现在我仍可以先帮您设置天数、人数、预算、酒店和交通偏好。'
          : 'AI 服务暂时没有响应。您可以稍后重试，或先在北京探索页选择景点、酒店与餐厅。',
        actions: [],
        stage: 'collecting' as const,
      };
      return {
        ...fallback,
        reply: `【本地规则降级】${fallback.reply}`,
        provider: 'local_fallback',
      } as AIResponse;
    }
  }

  getGreeting(): AIResponse {
    return {
      reply: '您好！我是旅行助手。您可以打字、点击麦克风转成文字，或者直接使用电话式语音和我聊北京行程。',
      actions: [],
      stage: 'collecting',
    };
  }
}

export const chatService = new ChatService();
