import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { flowTabScreenOptions } from '../theme/navigationTheme';
import AdminDashboardScreen from '../screens/admin-portal/AdminDashboardScreen';
import AdminUsersScreen from '../screens/admin-portal/AdminUsersScreen';
import AdminSettingsScreen from '../screens/admin-portal/AdminSettingsScreen';

const Tab = createBottomTabNavigator();

export default function AdminTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={flowTabScreenOptions}
    >
      <Tab.Screen
        name="数据"
        component={AdminDashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="用户"
        component={AdminUsersScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="设置"
        component={AdminSettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
