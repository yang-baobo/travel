/**
 * 本地旅行助手。
 * 当前版本不连接任何第三方大模型，避免在客户端暴露 API 密钥。
 */
import { tryParseLocalAssistantCommand } from './localAssistantAgent';

export interface AIAction {
  type: string;
  value?: any;
}

export interface AIResponse {
  reply: string;
  actions: AIAction[];
  stage: 'collecting' | 'generating' | 'speaking' | 'adjusting' | 'done';
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
  resetConversation(): void {
    // 本地解析器无远端会话状态。
  }

  async sendMessage(userText: string, phaseContext?: string): Promise<AIResponse> {
    const local = tryParseLocalAssistantCommand(userText, normalizeStage(phaseContext));
    if (local) return local;
    return {
      reply: '我现在可以帮您设置天数、人数、预算、酒店和交通偏好。实时景点、酒店与餐厅请在北京探索页选择。',
      actions: [],
      stage: 'collecting',
    };
  }

  getGreeting(): AIResponse {
    return {
      reply: '您好！我是旅行助手。北京的景点、酒店和餐厅会从实时服务加载，您也可以告诉我出行天数和交通偏好。',
      actions: [],
      stage: 'collecting',
    };
  }
}

export const chatService = new ChatService();
