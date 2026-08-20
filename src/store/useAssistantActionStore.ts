/**
 * 语音助手全局动作 Store
 * 用于 VoiceAssistant 触发其他页面的操作
 */

import { create } from 'zustand';

export type AssistantActionType =
  | 'navigate_to_route_plan'      // 跳转到路线规划页
  | 'navigate_to_home'            // 跳转到首页
  | 'navigate_to_orders'          // 跳转到订单页
  | 'navigate_to_profile'         // 跳转到个人中心
  | 'open_restaurant_picker'      // 打开餐厅选择器
  | 'open_hotel_picker'           // 打开酒店选择器
  | 'open_attraction_picker'      // 打开景点选择器
  | 'change_restaurant'           // 更换餐厅 (payload: { day, meal })
  | 'change_hotel'                // 更换酒店 (payload: { day })
  | 'add_attraction'              // 添加景点
  | 'remove_attraction'           // 移除景点 (payload: { attractionId })
  | 'confirm_route'               // 确认路线
  | 'speak_route_summary'         // 朗读路线摘要
  | 'none';                       // 无动作

export interface AssistantAction {
  type: AssistantActionType;
  payload?: any;
  timestamp: number;
}

interface AssistantActionState {
  // 最后一次动作
  lastAction: AssistantAction | null;

  // 当前页面上下文（供 AI 参考）
  currentPage: string;
  pageData: Record<string, any>;

  // 派发动作
  dispatchAction: (type: AssistantActionType, payload?: any) => void;

  // 清除动作（页面处理完后调用）
  clearAction: () => void;

  // 设置当前页面
  setCurrentPage: (page: string, data?: Record<string, any>) => void;
}

export const useAssistantActionStore = create<AssistantActionState>((set, get) => ({
  lastAction: null,
  currentPage: 'home',
  pageData: {},

  dispatchAction: (type, payload) => {
    set({
      lastAction: {
        type,
        payload,
        timestamp: Date.now(),
      },
    });
  },

  clearAction: () => {
    set({ lastAction: null });
  },

  setCurrentPage: (page, data = {}) => {
    set({
      currentPage: page,
      pageData: data,
    });
  },
}));
