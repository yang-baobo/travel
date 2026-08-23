import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CustomStackParamList } from '../types';
import { colors } from '../theme/colors';
import LiveItineraryScreen from '../screens/explore/LiveItineraryScreen';
import LivePlacesScreen from '../screens/explore/LivePlacesScreen';
import LivePlaceDetailScreen from '../screens/explore/LivePlaceDetailScreen';
import RoutePlanScreen from '../screens/custom/RoutePlanScreen';
import RouteDetailScreen from '../screens/route/RouteDetailScreen';
import CartScreen from '../screens/cart/CartScreen';
import SettlementScreen from '../screens/cart/SettlementScreen';
import TripProfileScreen from '../screens/blind-box/TripProfileScreen';
import BlindBoxScreen from '../screens/blind-box/BlindBoxScreen';
import HotelListScreen from '../screens/explore/HotelListScreen';

const Stack = createNativeStackNavigator<CustomStackParamList>();

export default function CustomStack() {
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
        name="CustomHome"
        component={LiveItineraryScreen}
        options={{ title: '我的实时路线' }}
      />
      <Stack.Screen name="TripProfile" component={TripProfileScreen} options={{ title: '盲盒设置' }} />
      <Stack.Screen name="BlindBox" component={BlindBoxScreen} options={{ title: 'AI 旅行盲盒' }} />
      <Stack.Screen name="LivePlaces" component={LivePlacesScreen} options={{ title: '添加北京地点' }} />
      <Stack.Screen name="LivePlaceDetail" component={LivePlaceDetailScreen} options={{ title: '地点详情' }} />
      <Stack.Screen name="LiveItinerary" component={LiveItineraryScreen} options={{ title: '我的实时路线' }} />
      <Stack.Screen name="HotelList" component={HotelListScreen} options={{ title: '选择实时酒店' }} />
      <Stack.Screen
        name="RoutePlan"
        component={RoutePlanScreen}
        options={{ title: '路线规划' }}
      />
      <Stack.Screen
        name="RouteDetail"
        component={RouteDetailScreen}
        options={{ title: '路线详情' }}
      />
      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settlement"
        component={SettlementScreen}
        options={{ title: '结算明细' }}
      />
    </Stack.Navigator>
  );
}
