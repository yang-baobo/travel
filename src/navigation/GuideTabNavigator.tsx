import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { flowTabScreenOptions } from '../theme/navigationTheme';
import GuideDashboardScreen from '../screens/guide-portal/GuideDashboardScreen';
import GuideOrdersScreen from '../screens/guide-portal/GuideOrdersScreen';
import GuideProfileScreen from '../screens/guide-portal/GuideProfileScreen';

const Tab = createBottomTabNavigator();

export default function GuideTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={flowTabScreenOptions}
    >
      <Tab.Screen
        name="我的路线"
        component={GuideDashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="订单"
        component={GuideOrdersScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="个人"
        component={GuideProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
