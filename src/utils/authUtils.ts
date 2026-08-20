import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

const AUTH_KEY = '@auth_user';

export const saveUser = async (user: User): Promise<void> => {
  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user));
};

export const getStoredUser = async (): Promise<User | null> => {
  const data = await AsyncStorage.getItem(AUTH_KEY);
  return data ? JSON.parse(data) : null;
};

export const clearUser = async (): Promise<void> => {
  await AsyncStorage.removeItem(AUTH_KEY);
};
