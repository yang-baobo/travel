import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExploreStackParamList } from '../types';
import { flowStackScreenOptions } from '../theme/navigationTheme';
import HomeScreen from '../screens/explore/HomeScreen';
import ExploreMainScreen from '../screens/explore/ExploreMainScreen';
import PreferenceScreen from '../screens/explore/PreferenceScreen';
import RecommendationScreen from '../screens/explore/RecommendationScreen';
import AttractionDetailScreen from '../screens/explore/AttractionDetailScreen';
import PresetRouteListScreen from '../screens/route/PresetRouteListScreen';
import PresetRouteDetailScreen from '../screens/route/PresetRouteDetailScreen';
import GuideListScreen from '../screens/guide/GuideListScreen';
import GuideDetailScreen from '../screens/guide/GuideDetailScreen';
import GuideRouteDetailScreen from '../screens/guide/GuideRouteDetailScreen';
import HotelListScreen from '../screens/explore/HotelListScreen';
import RestaurantDetailScreen from '../screens/explore/RestaurantDetailScreen';
import FlightSearchScreen from '../screens/explore/FlightSearchScreen';
import SettlementScreen from '../screens/cart/SettlementScreen';
import LivePlacesScreen from '../screens/explore/LivePlacesScreen';
import LivePlaceDetailScreen from '../screens/explore/LivePlaceDetailScreen';
import LiveItineraryScreen from '../screens/explore/LiveItineraryScreen';
import AIPlanningScreen from '../screens/explore/AIPlanningScreen';
import BlindBoxScreen from '../screens/blind-box/BlindBoxScreen';

const Stack = createNativeStackNavigator<ExploreStackParamList>();

export default function ExploreStack() {
  return (
    <Stack.Navigator
      screenOptions={flowStackScreenOptions}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="BlindBox" component={BlindBoxScreen} options={{ title: 'AI 旅行盲盒' }} />
      <Stack.Screen
        name="LivePlaces"
        component={LivePlacesScreen}
        options={{ title: '北京探索' }}
      />
      <Stack.Screen
        name="LivePlaceDetail"
        component={LivePlaceDetailScreen}
        options={{ title: '地点详情' }}
      />
      <Stack.Screen
        name="LiveItinerary"
        component={LiveItineraryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AIPlanning"
        component={AIPlanningScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ExploreMain"
        component={ExploreMainScreen}
        options={{ title: '发现北京' }}
      />
      <Stack.Screen
        name="Preference"
        component={PreferenceScreen}
        options={{ title: '偏好推荐' }}
      />
      <Stack.Screen
        name="Recommendation"
        component={RecommendationScreen}
        options={{ title: '推荐景点' }}
      />
      <Stack.Screen
        name="AttractionDetail"
        component={AttractionDetailScreen}
        options={{ title: '景点详情' }}
      />
      <Stack.Screen
        name="PresetRouteList"
        component={PresetRouteListScreen}
        options={{ title: '推荐路线' }}
      />
      <Stack.Screen
        name="PresetRouteDetail"
        component={PresetRouteDetailScreen}
        options={{ title: '路线详情' }}
      />
      <Stack.Screen
        name="GuideList"
        component={GuideListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GuideDetail"
        component={GuideDetailScreen}
        options={{ title: '导游详情' }}
      />
      <Stack.Screen
        name="GuideRouteDetail"
        component={GuideRouteDetailScreen}
        options={{ title: '导游路线' }}
      />
      <Stack.Screen
        name="HotelList"
        component={HotelListScreen}
        options={{ title: '酒店住宿' }}
      />
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={{ title: '餐厅详情' }}
      />
      <Stack.Screen
        name="FlightSearch"
        component={FlightSearchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FlightList"
        component={FlightSearchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settlement"
        component={SettlementScreen}
        options={{ title: '确认结算' }}
      />
    </Stack.Navigator>
  );
}
