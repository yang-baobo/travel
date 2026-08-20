import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../types';
import { colors } from '../theme/colors';
import ProfileScreen from '../screens/profile/ProfileScreen';
import PreferenceScreen from '../screens/explore/PreferenceScreen';
import FavoritesScreen from '../screens/profile/FavoritesScreen';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Preference"
        component={PreferenceScreen}
        options={{ title: '偏好设置' }}
      />
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ title: '我的收藏' }}
      />
    </Stack.Navigator>
  );
}
