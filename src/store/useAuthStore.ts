import { create } from 'zustand';
import { User } from '../types';
import { mockUsers } from '../data/mockUsers';
import { saveUser, getStoredUser, clearUser } from '../utils/authUtils';
import { usePreferenceStore } from './usePreferenceStore';

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (username: string, password: string) => {
    set({ error: null });
    const user = mockUsers.find(u => u.username === username && u.password === password);
    if (user) {
      await saveUser(user);
      const prefStore = usePreferenceStore.getState();
      if (prefStore.checkUserPreferences(user.id)) {
        // 已设置过偏好的用户，直接标记为已设置
        prefStore.markPreferencesSet();
      } else {
        // 首次登录的用户，重置偏好让弹窗出现
        prefStore.resetPreferences();
      }
      set({ currentUser: user, isAuthenticated: true, error: null });
      return true;
    }
    set({ error: '用户名或密码错误' });
    return false;
  },

  logout: async () => {
    await clearUser();
    // 登出时清空偏好
    usePreferenceStore.getState().resetPreferences();
    set({ currentUser: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    const user = await getStoredUser();
    if (user) {
      set({ currentUser: user, isAuthenticated: true, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },
}));
