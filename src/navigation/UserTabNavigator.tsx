import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { flowTabScreenOptions } from '../theme/navigationTheme';
import ExploreStack from './ExploreStack';
import CustomStack from './CustomStack';
import OrderStack from './OrderStack';
import ProfileStack from './ProfileStack';

const Tab = createBottomTabNavigator();

export default function UserTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={flowTabScreenOptions}
    >
      <Tab.Screen
        name="探索"
        component={ExploreStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="行程"
        component={CustomStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="订单"
        component={OrderStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="个人"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
