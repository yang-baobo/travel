import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useAuthStore } from '../store/useAuthStore';
import { RootStackParamList } from '../types';
import AuthStack from './AuthStack';
import UserTabNavigator from './UserTabNavigator';
import GuideTabNavigator from './GuideTabNavigator';
import AdminTabNavigator from './AdminTabNavigator';
import VoiceAssistantOrchestrator from '../components/assistant/VoiceAssistantOrchestrator';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isAuthenticated, isLoading, currentUser, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <View style={{ flex: 1 }}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Auth" component={AuthStack} />
          ) : currentUser?.role === 'guide' ? (
            <Stack.Screen name="GuideTabs" component={GuideTabNavigator} />
          ) : currentUser?.role === 'admin' ? (
            <Stack.Screen name="AdminTabs" component={AdminTabNavigator} />
          ) : (
            <Stack.Screen name="UserTabs" component={UserTabNavigator} />
          )}
        </Stack.Navigator>
        {isAuthenticated && currentUser?.role === 'user' && <VoiceAssistantOrchestrator />}
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
