/**
 * 动作执行器 — 解析 AI 返回的 actions 并执行 store 操作
 * 支持完整的 Agent 功能，可控制应用内所有设置
 */

import { usePreferenceStore } from '../store/usePreferenceStore';
import { useRouteStore } from '../store/useRouteStore';
import { useAssistantActionStore } from '../store/useAssistantActionStore';
import { useAssistantStore } from '../store/useAssistantStore';
import { AIAction } from './chatService';
import { CuisineType, HotelAmenity, HotelZonePreference } from '../types';

/**
 * 批量执行 AI 返回的动作
 * 返回需要 VoiceAssistant 组件处理的导航类动作
 */
export function executeActions(actions: AIAction[]): AIAction[] {
  const prefStore = usePreferenceStore.getState();
  const routeStore = useRouteStore.getState();
  const assistantStore = useAssistantActionStore.getState();
  const agentStore = useAssistantStore.getState();

  // 收集需要返回给 VoiceAssistant 处理的导航类动作
  const navigationActions: AIAction[] = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        // === 基础设置 ===
        case 'set_travel_days':
          if (typeof action.value === 'number' && action.value > 0 && action.value <= 7) {
            prefStore.setTravelDays(action.value);
            routeStore.setTravelDays(action.value);
          }
          break;

        case 'set_group_size':
          if (typeof action.value === 'number' && action.value > 0 && action.value <= 20) {
            prefStore.setGroupSize(action.value);
          }
          break;

        case 'set_budget_pref':
          if (['low', 'medium', 'high', 'any'].includes(action.value)) {
            prefStore.setBudgetPref(action.value);
          }
          break;

        // === 交通偏好 ===
        case 'set_transport_pref':
          if (['transit', 'driving', 'walking', 'any'].includes(action.value)) {
            prefStore.setTransportPref(action.value);
          }
          break;

        case 'set_walk_max_km':
          if (typeof action.value === 'number' && action.value > 0 && action.value <= 5) {
            prefStore.setTransportRule({ walkMaxKm: action.value });
          }
          break;

        case 'set_driving_submode':
          if (['taxi', 'self'].includes(action.value)) {
            prefStore.setTransportRule({ drivingSubMode: action.value });
          }
          break;

        case 'set_max_transit_minutes':
          if (typeof action.value === 'number' && action.value > 0) {
            prefStore.setTransportRule({ maxTransitMinutes: action.value });
          }
          break;

        // === 住宿偏好 ===
        case 'set_hotel_level':
          if (['budget', 'mid', 'luxury', 'any'].includes(action.value)) {
            prefStore.setHotelLevelPref(action.value);
          }
          break;

        case 'set_hotel_zone':
        case 'set_hotel_zone_pref':
          if (['any', 'city_center', 'near_attraction', 'near_shopping', 'near_food_street', 'quiet_area', 'near_metro'].includes(action.value)) {
            prefStore.setHotelZonePref(action.value as HotelZonePreference);
          }
          break;

        case 'set_hotel_price_range':
          if (action.value && typeof action.value.min === 'number' && typeof action.value.max === 'number') {
            prefStore.setHotelPriceRange({ min: action.value.min, max: action.value.max });
          }
          break;

        case 'toggle_hotel_amenity':
          if (['wifi', 'parking', 'breakfast', 'pool', 'gym', 'spa', 'restaurant', 'laundry'].includes(action.value)) {
            prefStore.toggleHotelAmenityPref(action.value as HotelAmenity);
          }
          break;

        case 'set_need_hotel':
          if (typeof action.value === 'boolean') {
            prefStore.setNeedHotel(action.value);
          }
          break;

        // === 餐饮偏好 ===
        case 'set_cuisine_prefs':
          if (Array.isArray(action.value)) {
            // 先清空现有的，然后逐个添加
            const currentPrefs = usePreferenceStore.getState().cuisinePrefs;
            for (const existing of currentPrefs) {
              prefStore.toggleCuisinePref(existing);
            }
            for (const cuisine of action.value) {
              prefStore.toggleCuisinePref(cuisine as CuisineType);
            }
          }
          break;

        case 'set_need_breakfast':
          if (typeof action.value === 'boolean') {
            prefStore.setNeedBreakfast(action.value);
          }
          break;

        case 'set_need_lunch':
          if (typeof action.value === 'boolean') {
            prefStore.setNeedLunch(action.value);
          }
          break;

        case 'set_need_dinner':
          if (typeof action.value === 'boolean') {
            prefStore.setNeedDinner(action.value);
          }
          break;

        case 'set_need_meals':
          if (action.value && typeof action.value === 'object') {
            if ('breakfast' in action.value) prefStore.setNeedBreakfast(!!action.value.breakfast);
            if ('lunch' in action.value) prefStore.setNeedLunch(!!action.value.lunch);
            if ('dinner' in action.value) prefStore.setNeedDinner(!!action.value.dinner);
          }
          break;

        // === 景点偏好 ===
        case 'set_categories':
          if (Array.isArray(action.value)) {
            prefStore.setCategories(action.value);
          }
          break;

        case 'exclude_category':
          // 从当前分类中移除指定类别
          const currentCats = usePreferenceStore.getState().selectedCategories;
          const filtered = currentCats.filter(c => c !== action.value);
          prefStore.setCategories(filtered);
          break;

        // === 其他设置 ===
        case 'set_is_in_dest_city':
          if (typeof action.value === 'boolean') {
            prefStore.setIsInDestCity(action.value);
          }
          break;

        case 'set_departure_city':
          if (typeof action.value === 'string') {
            prefStore.setDepartureCity(action.value);
          }
          break;

        case 'set_elderly_mode':
          if (typeof action.value === 'boolean') {
            prefStore.setElderlyMode(action.value);
          }
          break;

        case 'reset_preferences':
          prefStore.resetPreferences();
          break;

        // === 导航和页面操作类动作 ===
        // 路线修改动作同时写入 agentStore 供 RoutePlanScreen 消费
        case 'change_restaurant':
        case 'change_hotel':
        case 'add_attraction':
        case 'remove_attraction':
          agentStore.requestRouteModification(action.type, action.value);
          navigationActions.push(action);
          break;

        // 其他导航动作返回给组件处理
        case 'navigate_to_route_plan':
        case 'navigate_to_home':
        case 'navigate_to_orders':
        case 'navigate_to_profile':
        case 'open_restaurant_picker':
        case 'open_hotel_picker':
        case 'open_attraction_picker':
        case 'confirm_route':
        case 'speak_route_summary':
        case 'generate_route':
        case 'select_attractions':
          navigationActions.push(action);
          break;

        default:
          console.warn('Unknown action type:', action.type);
      }
    } catch (error) {
      console.error('Action execution error:', action.type, error);
    }
  }

  return navigationActions;
}

/**
 * 获取当前设置的摘要（供语音播报）
 */
export function getPreferencesSummary(): string {
  const prefs = usePreferenceStore.getState();
  const parts: string[] = [];

  if (prefs.travelDays) parts.push(`${prefs.travelDays}天`);
  if (prefs.groupSize) parts.push(`${prefs.groupSize}人`);
  if (prefs.transportPref !== 'any') {
    const transportNames: Record<string, string> = {
      transit: '公交地铁',
      driving: '打车或自驾',
      walking: '步行',
    };
    parts.push(`交通优先${transportNames[prefs.transportPref] || prefs.transportPref}`);
  }
  if (prefs.hotelLevelPref !== 'any') {
    const levelNames: Record<string, string> = {
      budget: '经济型酒店',
      mid: '中档酒店',
      luxury: '豪华酒店',
    };
    parts.push(levelNames[prefs.hotelLevelPref] || prefs.hotelLevelPref);
  }
  if (prefs.cuisinePrefs.length > 0) {
    parts.push(`喜欢吃${prefs.cuisinePrefs.join('、')}`);
  }
  if (prefs.selectedCategories.length > 0) {
    parts.push(`想看${prefs.selectedCategories.join('、')}`);
  }

  return parts.length > 0 ? `当前设置：${parts.join('，')}。` : '当前还没有设置偏好。';
}
