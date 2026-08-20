import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OrderStackParamList } from '../types';
import { colors } from '../theme/colors';
import OrderListScreen from '../screens/orders/OrderListScreen';
import OrderDetailScreen from '../screens/orders/OrderDetailScreen';
import AttractionDetailScreen from '../screens/explore/AttractionDetailScreen';
import GuideDetailScreen from '../screens/guide/GuideDetailScreen';
import PresetRouteDetailScreen from '../screens/route/PresetRouteDetailScreen';
import HotelDetailScreen from '../screens/explore/HotelDetailScreen';
import RestaurantDetailScreen from '../screens/explore/RestaurantDetailScreen';

const Stack = createNativeStackNavigator<OrderStackParamList>();

export default function OrderStack() {
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
        name="OrderList"
        component={OrderListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{ title: '订单详情' }}
      />
      <Stack.Screen
        name="AttractionDetail"
        component={AttractionDetailScreen}
        options={{ title: '景点详情' }}
      />
      <Stack.Screen
        name="GuideDetail"
        component={GuideDetailScreen}
        options={{ title: '导游详情' }}
      />
      <Stack.Screen
        name="PresetRouteDetail"
        component={PresetRouteDetailScreen}
        options={{ title: '路线详情' }}
      />
      <Stack.Screen
        name="HotelDetail"
        component={HotelDetailScreen}
        options={{ title: '酒店详情' }}
      />
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={{ title: '餐厅详情' }}
      />
    </Stack.Navigator>
  );
}
