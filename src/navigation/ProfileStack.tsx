import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../types';
import { flowStackScreenOptions } from '../theme/navigationTheme';
import ProfileScreen from '../screens/profile/ProfileScreen';
import PreferenceScreen from '../screens/explore/PreferenceScreen';
import FavoritesScreen from '../screens/profile/FavoritesScreen';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={flowStackScreenOptions}
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
