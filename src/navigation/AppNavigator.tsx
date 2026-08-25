import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { flowNavigationTheme } from '../theme/navigationTheme';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import UserTabNavigator from './UserTabNavigator';
import VoiceAssistantOrchestrator from '../components/assistant/VoiceAssistantOrchestrator';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer theme={flowNavigationTheme}>
      <View style={{ flex: 1 }}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="UserTabs" component={UserTabNavigator} />
        </Stack.Navigator>
        <VoiceAssistantOrchestrator />
      </View>
    </NavigationContainer>
  );
}
