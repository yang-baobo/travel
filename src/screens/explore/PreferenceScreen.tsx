import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { TransportPreference, HotelLevelPreference, BudgetPreference, HotelZonePreference, HotelAmenity, AirlineType, FlightClass, LuggageOption, HotelStayMode, FatigueLevel, DetourTolerance, TimeCostPreference, TransferComplexity } from '../../types';
import { categories } from '../../data/categories';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useBlindBoxStore } from '../../store/useBlindBoxStore';
import { getHotelLevelName, getZoneName } from '../../utils/formatters';

const TRANSPORT_OPTIONS: { key: TransportPreference; label: string; icon: string }[] = [
  { key: 'transit', label: '公交地铁', icon: 'bus-outline' },
  { key: 'driving', label: '驾车', icon: 'car-outline' },
  { key: 'walking', label: '步行', icon: 'walk-outline' },
  { key: 'any', label: '都可以', icon: 'shuffle-outline' },
];

const HOTEL_OPTIONS: { key: HotelLevelPreference; label: string }[] = [
  { key: 'budget', label: '经济型' },
  { key: 'mid', label: '舒适型' },
  { key: 'luxury', label: '豪华型' },
  { key: 'any', label: '都可以' },
];

const BUDGET_OPTIONS: { key: BudgetPreference; label: string; desc: string }[] = [
  { key: 'low', label: '节省', desc: '200元以内/天' },
  { key: 'medium', label: '适中', desc: '200-500元/天' },
  { key: 'high', label: '宽裕', desc: '500元+/天' },
  { key: 'any', label: '不限', desc: '随意' },
];

const ZONE_OPTIONS: { key: HotelZonePreference; label: string }[] = [
  { key: 'any', label: '不限' },
  { key: 'city_center', label: '市中心' },
  { key: 'near_attraction', label: '靠近景区' },
  { key: 'near_shopping', label: '靠近购物区' },
  { key: 'near_food_street', label: '靠近美食街' },
  { key: 'quiet_area', label: '安静休息区' },
  { key: 'near_metro', label: '靠近地铁' },
];

const ALL_AMENITIES: HotelAmenity[] = ['泳池', '健身房', 'SPA', 'WiFi', '自助早餐', '海景房', '亲子乐园', '商务中心'];

const WALK_MAX_OPTIONS = [0.5, 1, 1.5, 2];
const MAX_TIME_OPTIONS = [30, 45, 60, 90];
const WALK_TO_STATION_OPTIONS = [0.5, 1, 1.5, 2];

const FATIGUE_OPTIONS: { key: FatigueLevel; label: string; desc: string }[] = [
  { key: 'relaxed', label: '轻松', desc: '少走路，多休息' },
  { key: 'standard', label: '标准', desc: '适度步行' },
  { key: 'intensive', label: '紧凑', desc: '多走多看' },
];

const DETOUR_OPTIONS: { key: DetourTolerance; label: string; desc: string }[] = [
  { key: 'strict', label: '严格顺路', desc: '不绕路' },
  { key: 'moderate', label: '适度绕路', desc: '可小幅绕路' },
  { key: 'optimal', label: '综合最优', desc: '自动权衡' },
];

const TIME_COST_OPTIONS: { key: TimeCostPreference; label: string; desc: string }[] = [
  { key: 'save_money', label: '更省钱', desc: '优先公交/步行' },
  { key: 'balanced', label: '平衡', desc: '综合考虑' },
  { key: 'save_time', label: '更省时间', desc: '优先打车' },
];

const TRANSFER_OPTIONS: { key: TransferComplexity; label: string; desc: string }[] = [
  { key: 'few', label: '少换乘', desc: '尽量直达' },
  { key: 'normal', label: '正常', desc: '合理换乘' },
  { key: 'any', label: '不限制', desc: '最快即可' },
];

const DRIVING_SUB_OPTIONS: { key: 'self' | 'taxi'; label: string; icon: string }[] = [
  { key: 'taxi', label: '打车', icon: 'car-sport-outline' },
  { key: 'self', label: '自驾', icon: 'key-outline' },
];

const AIRLINE_TYPE_OPTIONS: { key: AirlineType | 'any'; label: string }[] = [
  { key: 'any', label: '不限' },
  { key: 'budget', label: '廉价航空' },
  { key: 'standard', label: '普通航空' },
];

const CABIN_OPTIONS: { key: FlightClass | 'any'; label: string }[] = [
  { key: 'any', label: '不限' },
  { key: 'economy', label: '经济舱' },
  { key: 'premium', label: '超级经济舱' },
  { key: 'first', label: '头等舱' },
];

const LUGGAGE_PREF_OPTIONS: { key: LuggageOption | 'any'; label: string }[] = [
  { key: 'any', label: '不限' },
  { key: 'checked', label: '含托运行李' },
  { key: 'carryOnly', label: '仅手提' },
];

const PRICE_ALERT_OPTIONS = [100, 200, 300, 500];
const NEARBY_DATE_ALERT_OPTIONS = [100, 150, 200, 300];

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-');
  const d = new Date(dateStr);
  return `${parseInt(parts[1])}月${parseInt(parts[2])}日 周${WEEKDAY_NAMES[d.getDay()]}`;
}

export default function PreferenceScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {
    selectedCategories,
    toggleCategory,
    transportPref,
    setTransportPref,
    hotelLevelPref,
    setHotelLevelPref,
    budgetPref,
    setBudgetPref,
    hotelZonePref,
    setHotelZonePref,
    hotelPriceRange,
    setHotelPriceRange,
    hotelAmenityPrefs,
    toggleHotelAmenityPref,
    transportRule,
    setTransportRule,
    flightPreference,
    setFlightPreference,
    travelStartDate,
    setTravelStartDate,
    travelReturnDate,
    setTravelReturnDate,
    hotelStayMode,
    setHotelStayMode,
    dailyStartTime,
    setDailyStartTime,
    dailyEndTime,
    setDailyEndTime,
    lunchLatestEndTime,
    setLunchLatestEndTime,
    dinnerLatestEndTime,
    setDinnerLatestEndTime,
    markPreferencesSet,
  } = usePreferenceStore();
  const blindBoxDraft = useBlindBoxStore(state => state.draftProfile);
  const updateBlindBoxDraft = useBlindBoxStore(state => state.updateDraft);
  const updateBlindBoxHard = useBlindBoxStore(state => state.updateHardConstraints);
  const confirmBlindBoxProfile = useBlindBoxStore(state => state.confirmProfile);

  const [showHotelEdit, setShowHotelEdit] = useState(false);
  const [showTransportEdit, setShowTransportEdit] = useState(false);
  const [showFlightEdit, setShowFlightEdit] = useState(false);
  const [showBlindBoxEdit, setShowBlindBoxEdit] = useState(false);
  const [customPriceAlert, setCustomPriceAlert] = useState('');
  const [useCustomPriceAlert, setUseCustomPriceAlert] = useState(false);
  const [customNearbyAlert, setCustomNearbyAlert] = useState('');
  const [useCustomNearbyAlert, setUseCustomNearbyAlert] = useState(false);
  const [customWalkMax, setCustomWalkMax] = useState('');
  const [customMaxTime, setCustomMaxTime] = useState('');
  const [customWalkStation, setCustomWalkStation] = useState('');
  const [useCustomWalkMax, setUseCustomWalkMax] = useState(false);
  const [useCustomMaxTime, setUseCustomMaxTime] = useState(false);
  const [useCustomWalkStation, setUseCustomWalkStation] = useState(false);

  // 住宿预算临时文本状态（避免 parseInt || 2000 导致无法清空）
  const [hotelMinText, setHotelMinText] = useState(String(hotelPriceRange.min));
  const [hotelMaxText, setHotelMaxText] = useState(String(hotelPriceRange.max));

  // 键盘状态追踪：控制底部按钮行为
  const [hotelKeyboardOpen, setHotelKeyboardOpen] = useState(false);
  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      if (showHotelEdit) setHotelKeyboardOpen(true);
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setHotelKeyboardOpen(false);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [showHotelEdit]);

  // 当弹窗打开时，同步 store 值到文本状态
  useEffect(() => {
    if (showHotelEdit) {
      setHotelMinText(String(hotelPriceRange.min));
      setHotelMaxText(String(hotelPriceRange.max));
    }
  }, [showHotelEdit]);

  const handleStart = () => {
    markPreferencesSet();

    if (route.params?.returnToPlanning) {
      navigation.goBack();
      return;
    }

    const parent = navigation.getParent?.();
    if (parent) {
      parent.navigate('探索', {
        screen: 'ExploreMain',
        params: { tab: 'attractions' },
      });
      return;
    }

    navigation.dispatch(
      CommonActions.navigate({
        name: 'ExploreMain',
        params: { tab: 'attractions' },
      })
    );
  };

  // 住宿偏好摘要文字
  const hotelSummary = [
    hotelStayMode === 'fixed' ? '固定住宿' : '顺路换住',
    hotelLevelPref === 'any' ? '不限档次' : getHotelLevelName(hotelLevelPref),
    hotelZonePref === 'any' ? '不限区域' : getZoneName(hotelZonePref),
    hotelPriceRange.max < 2000 ? `${hotelPriceRange.min}-${hotelPriceRange.max}元/晚` : '不限价格',
    hotelAmenityPrefs.length > 0 ? hotelAmenityPrefs.join('、') : '',
  ].filter(Boolean).join(' | ');

  // 交通规则摘要
  const transportModeLabel = transportPref === 'any' ? '不限交通' : transportPref === 'transit' ? '公共交通' : transportPref === 'driving' ? '驾车' : '步行';
  const fatigueLabel = transportRule.fatigueLevel === 'relaxed' ? '轻松' : transportRule.fatigueLevel === 'intensive' ? '紧凑' : '标准';
  const timeCostLabel = transportRule.timeCostPreference === 'save_money' ? '省钱' : transportRule.timeCostPreference === 'save_time' ? '省时' : '平衡';
  const transportSummary = [
    transportModeLabel,
    `步行≤${transportRule.walkMaxKm}km`,
    fatigueLabel,
    timeCostLabel,
  ].join(' | ');

  // 航班偏好摘要
  const airlineLabel = flightPreference.preferredAirlineType === 'any' ? '不限航司' : flightPreference.preferredAirlineType === 'budget' ? '廉价航空' : '普通航空';
  const cabinLabel = flightPreference.preferredCabin === 'any' ? '不限舱位' : flightPreference.preferredCabin === 'economy' ? '经济舱' : flightPreference.preferredCabin === 'premium' ? '超级经济舱' : '头等舱';
  const flightSummary = [
    airlineLabel,
    cabinLabel,
    flightPreference.preferDirectFlight ? '优先直飞' : '',
    `同日差价>${flightPreference.priceAlertThreshold}`,
    `临近日期>${flightPreference.nearbyDateAlertThreshold}`,
  ].filter(Boolean).join(' | ');

  // 盲盒安全设置摘要
  const hard = blindBoxDraft.hardConstraints;
  const blindBoxSummary = [
    `总预算¥${blindBoxDraft.totalTripBudget}`,
    `步行≤${hard.maxWalkingMinutesPerDay}分钟/天`,
    hard.dietaryAllergies.length ? `避开${hard.dietaryAllergies.join('、')}` : '',
    hard.forbidden.length ? `不接受${hard.forbidden.join('、')}` : '',
    hard.noNightActivity ? '不夜间' : '',
    hard.mobilityLimitations.length ? '有行动限制' : '',
  ].filter(Boolean).join(' | ');

  const saveBlindBoxSafety = () => {
    if (blindBoxDraft.totalTripBudget <= 0) {
      Alert.alert('请填写预算', '总体旅行预算必须大于 0 元。');
      return;
    }
    if (hard.maxWalkingMinutesPerSegment > hard.maxWalkingMinutesPerDay) {
      Alert.alert('步行限制有冲突', '单段最大步行时间不能超过每天最大步行时间。');
      return;
    }
    confirmBlindBoxProfile();
    setShowBlindBoxEdit(false);
    Alert.alert('盲盒安全设置已保存', 'AI 旅行盲盒会始终遵守这些限制。');
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 兴趣选择 */}
        <View style={styles.section}>
          <Text style={[typography.h3, styles.sectionTitle]}>你对什么感兴趣?</Text>
          <Text style={[typography.bodySmall, { marginBottom: spacing.md }]}>
            选择你感兴趣的类别(可多选)
          </Text>
          <View style={styles.categoryGrid}>
            {categories.map((cat) => {
              const isSelected = selectedCategories.includes(cat.id);
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryItem,
                    isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => toggleCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={24}
                    color={isSelected ? '#FFF' : cat.color}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      isSelected && { color: '#FFF' },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 酒店偏好(摘要+修改) */}
        <View style={styles.section}>
          <Text style={[typography.h3, styles.sectionTitle]}>住宿偏好</Text>
          <TouchableOpacity style={styles.summaryCard} activeOpacity={0.7} onPress={() => setShowHotelEdit(true)}>
            <Ionicons name="bed-outline" size={18} color={colors.primary} />
            <Text style={[typography.bodySmall, { flex: 1 }]}>{hotelSummary}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* 交通偏好(摘要+修改) */}
        <View style={styles.section}>
          <Text style={[typography.h3, styles.sectionTitle]}>交通规则</Text>
          <TouchableOpacity style={styles.summaryCard} activeOpacity={0.7} onPress={() => setShowTransportEdit(true)}>
            <Ionicons name="car-outline" size={18} color={colors.primary} />
            <Text style={[typography.bodySmall, { flex: 1 }]}>{transportSummary}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* 盲盒安全设置(摘要+修改) */}
        <View style={styles.section}>
          <Text style={[typography.h3, styles.sectionTitle]}>盲盒安全设置</Text>
          <TouchableOpacity style={styles.summaryCard} activeOpacity={0.7} onPress={() => setShowBlindBoxEdit(true)}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={[typography.bodySmall, { flex: 1 }]}>{blindBoxSummary}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[typography.caption, { marginTop: spacing.xs, color: colors.textSecondary }]}>
            预算、过敏、雷点和行动限制是 AI 旅行盲盒的硬性边界，盲盒不会为了惊喜而突破
          </Text>
        </View>

        {/* 航班偏好(摘要+修改) */}
        <View style={styles.section}>
          <Text style={[typography.h3, styles.sectionTitle]}>航班偏好</Text>
          <TouchableOpacity style={styles.summaryCard} activeOpacity={0.7} onPress={() => setShowFlightEdit(true)}>
            <Ionicons name="airplane-outline" size={18} color={colors.primary} />
            <Text style={[typography.bodySmall, { flex: 1 }]}>{flightSummary}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* 每日行程时间 */}
        <View style={styles.section}>
          <Text style={[typography.h3, styles.sectionTitle]}>每日行程时间</Text>
          <Text style={[typography.bodySmall, { marginBottom: spacing.sm }]}>
            设置每天安排行程的时间范围
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Ionicons name="sunny-outline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <Text style={typography.bodySmall}>最早出发</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['07:00', '08:00', '09:00', '10:00'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.optionChip, dailyStartTime === t && styles.optionChipActive]}
                  onPress={() => setDailyStartTime(t)}
                >
                  <Text style={[styles.optionChipText, dailyStartTime === t && styles.optionChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm }}>
            <Ionicons name="moon-outline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <Text style={typography.bodySmall}>最晚结束</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.optionChip, dailyEndTime === t && styles.optionChipActive]}
                  onPress={() => setDailyEndTime(t)}
                >
                  <Text style={[styles.optionChipText, dailyEndTime === t && styles.optionChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Text style={[typography.caption, { marginTop: spacing.sm, color: colors.textSecondary }]}> 
            每天 {dailyStartTime} - {dailyEndTime} 安排行程
          </Text>

          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />
          <Text style={[typography.body, { fontWeight: '600', marginBottom: 4 }]}>用餐最晚结束时间</Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}> 
            路线必须保证在你选择的时间前用餐结束；无法满足时会先征求你的选择。
          </Text>

          <Text style={[typography.bodySmall, { marginBottom: spacing.sm }]}>午餐结束不晚于</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['13:30', '14:00', '14:30', '15:00'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.optionChip, lunchLatestEndTime === t && styles.optionChipActive]}
                  onPress={() => setLunchLatestEndTime(t)}
                >
                  <Text style={[styles.optionChipText, lunchLatestEndTime === t && styles.optionChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[typography.bodySmall, { marginTop: spacing.md, marginBottom: spacing.sm }]}>晚餐结束不晚于</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['19:30', '20:00', '20:30', '21:00'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.optionChip, dinnerLatestEndTime === t && styles.optionChipActive]}
                  onPress={() => setDinnerLatestEndTime(t)}
                >
                  <Text style={[styles.optionChipText, dinnerLatestEndTime === t && styles.optionChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 开始按钮 */}
        <View style={styles.buttonWrapper}>
          <TouchableOpacity onPress={handleStart} activeOpacity={0.8}>
            <LinearGradient
              colors={colors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startButton}
            >
              <Text style={styles.startButtonText}>{route.params?.returnToPlanning ? '保存并返回规划' : '开始探索'}</Text>
              <Ionicons name={route.params?.returnToPlanning ? 'checkmark' : 'arrow-forward'} size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 酒店偏好编辑弹窗 */}
      <Modal visible={showHotelEdit} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboardWrap}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={typography.h3}>住宿偏好设置</Text>
                <TouchableOpacity onPress={() => setShowHotelEdit(false)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalScrollContent}
              >
                <Text style={styles.modalLabel}>住宿方式</Text>
                <View style={styles.optionRow}>
                  <TouchableOpacity style={[styles.transportChip, hotelStayMode === 'fixed' && styles.transportChipActive]} onPress={() => setHotelStayMode('fixed')}>
                    <Ionicons name="bed-outline" size={16} color={hotelStayMode === 'fixed' ? '#FFF' : colors.textPrimary} />
                    <Text style={[styles.optionChipText, hotelStayMode === 'fixed' && styles.optionChipTextActive]}>固定住宿</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.transportChip, hotelStayMode === 'flexible' && styles.transportChipActive]} onPress={() => setHotelStayMode('flexible')}>
                    <Ionicons name="swap-horizontal-outline" size={16} color={hotelStayMode === 'flexible' ? '#FFF' : colors.textPrimary} />
                    <Text style={[styles.optionChipText, hotelStayMode === 'flexible' && styles.optionChipTextActive]}>顺路换住</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[typography.caption, { marginTop: spacing.xs, color: colors.textSecondary }]}>
                  {hotelStayMode === 'fixed' ? '全程住同一家酒店，方便存放行李' : '跟着行程路线换酒店，减少通勤时间'}
                </Text>

                <Text style={styles.modalLabel}>酒店档次</Text>
                <View style={styles.optionRow}>
                  {HOTEL_OPTIONS.map(opt => (
                    <TouchableOpacity key={opt.key} style={[styles.optionChip, hotelLevelPref === opt.key && styles.optionChipActive]} onPress={() => setHotelLevelPref(opt.key)}>
                      <Text style={[styles.optionChipText, hotelLevelPref === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>偏好区域</Text>
                <View style={styles.optionRow}>
                  {ZONE_OPTIONS.map(z => (
                    <TouchableOpacity key={z.key} style={[styles.optionChip, hotelZonePref === z.key && styles.optionChipActive]} onPress={() => setHotelZonePref(z.key)}>
                      <Text style={[styles.optionChipText, hotelZonePref === z.key && styles.optionChipTextActive]}>{z.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>价格范围 (元/晚)</Text>
                <View style={styles.priceRangeRow}>
                  <TextInput style={styles.priceInput} value={hotelMinText} onChangeText={setHotelMinText} onBlur={() => { const n = parseInt(hotelMinText); if (isNaN(n) || hotelMinText === '') { setHotelMinText('0'); setHotelPriceRange({ ...hotelPriceRange, min: 0 }); } else { setHotelPriceRange({ ...hotelPriceRange, min: n }); } }} keyboardType="number-pad" placeholder="最低" placeholderTextColor={colors.disabled} returnKeyType="done" onSubmitEditing={() => { const n = parseInt(hotelMinText); if (isNaN(n) || hotelMinText === '') { setHotelMinText('0'); setHotelPriceRange({ ...hotelPriceRange, min: 0 }); } else { setHotelPriceRange({ ...hotelPriceRange, min: n }); } Keyboard.dismiss(); }} />
                  <Text style={typography.body}>—</Text>
                  <TextInput style={styles.priceInput} value={hotelMaxText} onChangeText={setHotelMaxText} onBlur={() => { const n = parseInt(hotelMaxText); if (isNaN(n) || hotelMaxText === '') { setHotelMaxText('2000'); setHotelPriceRange({ ...hotelPriceRange, max: 2000 }); } else { setHotelPriceRange({ ...hotelPriceRange, max: n }); } }} keyboardType="number-pad" placeholder="最高" placeholderTextColor={colors.disabled} returnKeyType="done" onSubmitEditing={() => { const n = parseInt(hotelMaxText); if (isNaN(n) || hotelMaxText === '') { setHotelMaxText('2000'); setHotelPriceRange({ ...hotelPriceRange, max: 2000 }); } else { setHotelPriceRange({ ...hotelPriceRange, max: n }); } Keyboard.dismiss(); }} />
                </View>

                <Text style={styles.modalLabel}>必备设施</Text>
                <View style={styles.optionRow}>
                  {ALL_AMENITIES.map(a => (
                    <TouchableOpacity key={a} style={[styles.optionChip, hotelAmenityPrefs.includes(a) && styles.optionChipActive]} onPress={() => toggleHotelAmenityPref(a)}>
                      <Text style={[styles.optionChipText, hotelAmenityPrefs.includes(a) && styles.optionChipTextActive]}>{a}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
              <TouchableOpacity style={styles.modalDoneBtn} onPress={() => {
                // 校验并提交价格值
                const minVal = parseInt(hotelMinText);
                const maxVal = parseInt(hotelMaxText);
                const finalMin = isNaN(minVal) ? hotelPriceRange.min : minVal;
                const finalMax = isNaN(maxVal) ? hotelPriceRange.max : maxVal;
                setHotelPriceRange({ min: finalMin, max: finalMax });
                if (hotelKeyboardOpen) {
                  // 键盘打开时：仅收起键盘 + 确认价格，不关闭弹窗
                  Keyboard.dismiss();
                } else {
                  // 键盘关闭时：保存全部偏好并关闭弹窗
                  setShowHotelEdit(false);
                }
              }}>
                <Text style={styles.modalDoneBtnText}>{hotelKeyboardOpen ? '完成价格输入' : '保存住宿偏好'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 交通规则编辑弹窗 */}
      <Modal visible={showTransportEdit} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={typography.h3}>出行设置</Text>
              <TouchableOpacity onPress={() => setShowTransportEdit(false)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalLabel}>默认交通偏好</Text>
              <View style={styles.optionRow}>
                {TRANSPORT_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.key} style={[styles.transportChip, transportPref === opt.key && styles.transportChipActive]} onPress={() => setTransportPref(opt.key)}>
                    <Ionicons name={opt.icon as any} size={16} color={transportPref === opt.key ? '#FFF' : colors.textPrimary} />
                    <Text style={[styles.optionChipText, transportPref === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ===== 公交地铁模式 ===== */}
              {transportPref === 'transit' && (
                <>
                  <Text style={styles.modalLabel}>步行距离上限 (距离 ≤ 此值则步行)</Text>
                  <View style={styles.optionRow}>
                    {WALK_MAX_OPTIONS.map(d => (
                      <TouchableOpacity key={d} style={[styles.optionChip, !useCustomWalkMax && transportRule.walkMaxKm === d && styles.optionChipActive]} onPress={() => { setTransportRule({ walkMaxKm: d }); setUseCustomWalkMax(false); }}>
                        <Text style={[styles.optionChipText, !useCustomWalkMax && transportRule.walkMaxKm === d && styles.optionChipTextActive]}>{d}km</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[styles.optionChip, useCustomWalkMax && styles.optionChipActive]} onPress={() => setUseCustomWalkMax(true)}>
                      <Text style={[styles.optionChipText, useCustomWalkMax && styles.optionChipTextActive]}>自定义</Text>
                    </TouchableOpacity>
                  </View>
                  {useCustomWalkMax && (
                    <TextInput style={styles.customInput} value={customWalkMax} onChangeText={t => { setCustomWalkMax(t); const n = parseFloat(t); if (!isNaN(n) && n > 0) setTransportRule({ walkMaxKm: n }); }} keyboardType="decimal-pad" placeholder="输入公里数 如 1.5" placeholderTextColor={colors.disabled} />
                  )}

                  <Text style={styles.modalLabel}>公交/地铁最长时间 (超时改打车)</Text>
                  <View style={styles.optionRow}>
                    {MAX_TIME_OPTIONS.map(t => (
                      <TouchableOpacity key={t} style={[styles.optionChip, !useCustomMaxTime && transportRule.maxTransitMinutes === t && styles.optionChipActive]} onPress={() => { setTransportRule({ maxTransitMinutes: t }); setUseCustomMaxTime(false); }}>
                        <Text style={[styles.optionChipText, !useCustomMaxTime && transportRule.maxTransitMinutes === t && styles.optionChipTextActive]}>{t}分钟</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[styles.optionChip, useCustomMaxTime && styles.optionChipActive]} onPress={() => setUseCustomMaxTime(true)}>
                      <Text style={[styles.optionChipText, useCustomMaxTime && styles.optionChipTextActive]}>自定义</Text>
                    </TouchableOpacity>
                  </View>
                  {useCustomMaxTime && (
                    <TextInput style={styles.customInput} value={customMaxTime} onChangeText={t => { setCustomMaxTime(t); const n = parseInt(t); if (!isNaN(n) && n > 0) setTransportRule({ maxTransitMinutes: n }); }} keyboardType="number-pad" placeholder="输入分钟数 如 50" placeholderTextColor={colors.disabled} />
                  )}

                  <Text style={styles.modalLabel}>步行到站台/换乘距离上限</Text>
                  <View style={styles.optionRow}>
                    {WALK_TO_STATION_OPTIONS.map(d => (
                      <TouchableOpacity key={d} style={[styles.optionChip, !useCustomWalkStation && transportRule.maxWalkToStationKm === d && styles.optionChipActive]} onPress={() => { setTransportRule({ maxWalkToStationKm: d }); setUseCustomWalkStation(false); }}>
                        <Text style={[styles.optionChipText, !useCustomWalkStation && transportRule.maxWalkToStationKm === d && styles.optionChipTextActive]}>{d}km</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[styles.optionChip, useCustomWalkStation && styles.optionChipActive]} onPress={() => setUseCustomWalkStation(true)}>
                      <Text style={[styles.optionChipText, useCustomWalkStation && styles.optionChipTextActive]}>自定义</Text>
                    </TouchableOpacity>
                  </View>
                  {useCustomWalkStation && (
                    <TextInput style={styles.customInput} value={customWalkStation} onChangeText={t => { setCustomWalkStation(t); const n = parseFloat(t); if (!isNaN(n) && n > 0) setTransportRule({ maxWalkToStationKm: n }); }} keyboardType="decimal-pad" placeholder="输入公里数 如 0.8" placeholderTextColor={colors.disabled} />
                  )}

                  <Text style={styles.modalLabel}>换乘复杂度</Text>
                  <View style={styles.optionRow}>
                    {TRANSFER_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt.key} style={[styles.optionChip, transportRule.transferComplexity === opt.key && styles.optionChipActive]} onPress={() => setTransportRule({ transferComplexity: opt.key })}>
                        <Text style={[styles.optionChipText, transportRule.transferComplexity === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.modalLabel}>时间/费用偏好</Text>
                  <View style={styles.optionRow}>
                    {TIME_COST_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt.key} style={[styles.optionChip, transportRule.timeCostPreference === opt.key && styles.optionChipActive]} onPress={() => setTransportRule({ timeCostPreference: opt.key })}>
                        <Text style={[styles.optionChipText, transportRule.timeCostPreference === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* ===== 驾车模式 ===== */}
              {transportPref === 'driving' && (
                <>
                  <Text style={styles.modalLabel}>驾车方式</Text>
                  <View style={styles.optionRow}>
                    {DRIVING_SUB_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt.key} style={[styles.transportChip, transportRule.drivingSubMode === opt.key && styles.transportChipActive]} onPress={() => setTransportRule({ drivingSubMode: opt.key })}>
                        <Ionicons name={opt.icon as any} size={16} color={transportRule.drivingSubMode === opt.key ? '#FFF' : colors.textPrimary} />
                        <Text style={[styles.optionChipText, transportRule.drivingSubMode === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.modalLabel}>绕路容忍度</Text>
                  <View style={styles.optionRow}>
                    {DETOUR_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt.key} style={[styles.optionChip, transportRule.detourTolerance === opt.key && styles.optionChipActive]} onPress={() => setTransportRule({ detourTolerance: opt.key })}>
                        <Text style={[styles.optionChipText, transportRule.detourTolerance === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.modalLabel}>时间/费用偏好</Text>
                  <View style={styles.optionRow}>
                    {TIME_COST_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt.key} style={[styles.optionChip, transportRule.timeCostPreference === opt.key && styles.optionChipActive]} onPress={() => setTransportRule({ timeCostPreference: opt.key })}>
                        <Text style={[styles.optionChipText, transportRule.timeCostPreference === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* ===== 步行模式 ===== */}
              {transportPref === 'walking' && (
                <>
                  <Text style={styles.modalLabel}>步行距离上限</Text>
                  <View style={styles.optionRow}>
                    {WALK_MAX_OPTIONS.map(d => (
                      <TouchableOpacity key={d} style={[styles.optionChip, !useCustomWalkMax && transportRule.walkMaxKm === d && styles.optionChipActive]} onPress={() => { setTransportRule({ walkMaxKm: d }); setUseCustomWalkMax(false); }}>
                        <Text style={[styles.optionChipText, !useCustomWalkMax && transportRule.walkMaxKm === d && styles.optionChipTextActive]}>{d}km</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[styles.optionChip, useCustomWalkMax && styles.optionChipActive]} onPress={() => setUseCustomWalkMax(true)}>
                      <Text style={[styles.optionChipText, useCustomWalkMax && styles.optionChipTextActive]}>自定义</Text>
                    </TouchableOpacity>
                  </View>
                  {useCustomWalkMax && (
                    <TextInput style={styles.customInput} value={customWalkMax} onChangeText={t => { setCustomWalkMax(t); const n = parseFloat(t); if (!isNaN(n) && n > 0) setTransportRule({ walkMaxKm: n }); }} keyboardType="decimal-pad" placeholder="输入公里数 如 1.5" placeholderTextColor={colors.disabled} />
                  )}

                  <Text style={styles.modalLabel}>疲劳控制</Text>
                  <View style={styles.optionRow}>
                    {FATIGUE_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt.key} style={[styles.optionChip, transportRule.fatigueLevel === opt.key && styles.optionChipActive]} onPress={() => setTransportRule({ fatigueLevel: opt.key })}>
                        <Text style={[styles.optionChipText, transportRule.fatigueLevel === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.modalLabel}>绕路容忍度</Text>
                  <View style={styles.optionRow}>
                    {DETOUR_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt.key} style={[styles.optionChip, transportRule.detourTolerance === opt.key && styles.optionChipActive]} onPress={() => setTransportRule({ detourTolerance: opt.key })}>
                        <Text style={[styles.optionChipText, transportRule.detourTolerance === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* ===== 都可以(混合)模式 ===== */}
              {transportPref === 'any' && (
                <>
                  <Text style={styles.modalLabel}>超过步行距离后用什么?</Text>
                  <View style={styles.optionRow}>
                    <TouchableOpacity style={[styles.transportChip, transportRule.defaultMode === 'transit' && styles.transportChipActive]} onPress={() => setTransportRule({ defaultMode: 'transit' })}>
                      <Ionicons name="bus-outline" size={16} color={transportRule.defaultMode === 'transit' ? '#FFF' : colors.textPrimary} />
                      <Text style={[styles.optionChipText, transportRule.defaultMode === 'transit' && styles.optionChipTextActive]}>公交地铁</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.transportChip, transportRule.defaultMode === 'driving' && styles.transportChipActive]} onPress={() => setTransportRule({ defaultMode: 'driving' })}>
                      <Ionicons name="car-outline" size={16} color={transportRule.defaultMode === 'driving' ? '#FFF' : colors.textPrimary} />
                      <Text style={[styles.optionChipText, transportRule.defaultMode === 'driving' && styles.optionChipTextActive]}>打车</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.modalLabel}>步行距离上限 (距离 ≤ 此值则步行)</Text>
                  <View style={styles.optionRow}>
                    {WALK_MAX_OPTIONS.map(d => (
                      <TouchableOpacity key={d} style={[styles.optionChip, !useCustomWalkMax && transportRule.walkMaxKm === d && styles.optionChipActive]} onPress={() => { setTransportRule({ walkMaxKm: d }); setUseCustomWalkMax(false); }}>
                        <Text style={[styles.optionChipText, !useCustomWalkMax && transportRule.walkMaxKm === d && styles.optionChipTextActive]}>{d}km</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[styles.optionChip, useCustomWalkMax && styles.optionChipActive]} onPress={() => setUseCustomWalkMax(true)}>
                      <Text style={[styles.optionChipText, useCustomWalkMax && styles.optionChipTextActive]}>自定义</Text>
                    </TouchableOpacity>
                  </View>
                  {useCustomWalkMax && (
                    <TextInput style={styles.customInput} value={customWalkMax} onChangeText={t => { setCustomWalkMax(t); const n = parseFloat(t); if (!isNaN(n) && n > 0) setTransportRule({ walkMaxKm: n }); }} keyboardType="decimal-pad" placeholder="输入公里数 如 1.5" placeholderTextColor={colors.disabled} />
                  )}

                  <Text style={styles.modalLabel}>公交/地铁最长时间 (超时改打车)</Text>
                  <View style={styles.optionRow}>
                    {MAX_TIME_OPTIONS.map(t => (
                      <TouchableOpacity key={t} style={[styles.optionChip, !useCustomMaxTime && transportRule.maxTransitMinutes === t && styles.optionChipActive]} onPress={() => { setTransportRule({ maxTransitMinutes: t }); setUseCustomMaxTime(false); }}>
                        <Text style={[styles.optionChipText, !useCustomMaxTime && transportRule.maxTransitMinutes === t && styles.optionChipTextActive]}>{t}分钟</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[styles.optionChip, useCustomMaxTime && styles.optionChipActive]} onPress={() => setUseCustomMaxTime(true)}>
                      <Text style={[styles.optionChipText, useCustomMaxTime && styles.optionChipTextActive]}>自定义</Text>
                    </TouchableOpacity>
                  </View>
                  {useCustomMaxTime && (
                    <TextInput style={styles.customInput} value={customMaxTime} onChangeText={t => { setCustomMaxTime(t); const n = parseInt(t); if (!isNaN(n) && n > 0) setTransportRule({ maxTransitMinutes: n }); }} keyboardType="number-pad" placeholder="输入分钟数 如 50" placeholderTextColor={colors.disabled} />
                  )}

                  <Text style={styles.modalLabel}>疲劳控制</Text>
                  <View style={styles.optionRow}>
                    {FATIGUE_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt.key} style={[styles.optionChip, transportRule.fatigueLevel === opt.key && styles.optionChipActive]} onPress={() => setTransportRule({ fatigueLevel: opt.key })}>
                        <Text style={[styles.optionChipText, transportRule.fatigueLevel === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.modalLabel}>时间/费用偏好</Text>
                  <View style={styles.optionRow}>
                    {TIME_COST_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt.key} style={[styles.optionChip, transportRule.timeCostPreference === opt.key && styles.optionChipActive]} onPress={() => setTransportRule({ timeCostPreference: opt.key })}>
                        <Text style={[styles.optionChipText, transportRule.timeCostPreference === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.rulePreview}>
                <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                <Text style={[typography.caption, { flex: 1, color: colors.textSecondary }]}>
                  {transportPref === 'transit' && `公交地铁优先: ≤${transportRule.walkMaxKm}km步行，公交超${transportRule.maxTransitMinutes}分钟或到站超${transportRule.maxWalkToStationKm}km改打车。换乘${transportRule.transferComplexity === 'few' ? '尽量少' : transportRule.transferComplexity === 'any' ? '不限' : '正常'}，${transportRule.timeCostPreference === 'save_money' ? '省钱优先' : transportRule.timeCostPreference === 'save_time' ? '省时优先' : '平衡模式'}。`}
                  {transportPref === 'driving' && `驾车优先: ${transportRule.drivingSubMode === 'self' ? '自驾' : '打车'}，${transportRule.detourTolerance === 'strict' ? '严格顺路' : transportRule.detourTolerance === 'optimal' ? '综合最优' : '适度绕路'}，${transportRule.timeCostPreference === 'save_money' ? '省钱优先' : transportRule.timeCostPreference === 'save_time' ? '省时优先' : '平衡模式'}。`}
                  {transportPref === 'walking' && `步行优先: 距离上限${transportRule.walkMaxKm}km，节奏${transportRule.fatigueLevel === 'relaxed' ? '轻松' : transportRule.fatigueLevel === 'intensive' ? '紧凑' : '标准'}，${transportRule.detourTolerance === 'strict' ? '严格顺路' : transportRule.detourTolerance === 'optimal' ? '综合最优' : '适度绕路'}。`}
                  {transportPref === 'any' && `混合模式: ≤${transportRule.walkMaxKm}km步行，其它${transportRule.defaultMode === 'transit' ? '公交地铁' : '打车'}。公交超${transportRule.maxTransitMinutes}分钟改打车。节奏${transportRule.fatigueLevel === 'relaxed' ? '轻松' : transportRule.fatigueLevel === 'intensive' ? '紧凑' : '标准'}，${transportRule.timeCostPreference === 'save_money' ? '省钱优先' : transportRule.timeCostPreference === 'save_time' ? '省时优先' : '平衡模式'}。`}
                </Text>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setShowTransportEdit(false)}>
              <Text style={styles.modalDoneBtnText}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 航班偏好编辑弹窗 */}
      <Modal visible={showFlightEdit} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={typography.h3}>航班偏好设置</Text>
              <TouchableOpacity onPress={() => setShowFlightEdit(false)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalLabel}>偏好航司类型</Text>
              <View style={styles.optionRow}>
                {AIRLINE_TYPE_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.key} style={[styles.optionChip, flightPreference.preferredAirlineType === opt.key && styles.optionChipActive]} onPress={() => setFlightPreference({ preferredAirlineType: opt.key })}>
                    <Text style={[styles.optionChipText, flightPreference.preferredAirlineType === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>偏好舱位</Text>
              <View style={styles.optionRow}>
                {CABIN_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.key} style={[styles.optionChip, flightPreference.preferredCabin === opt.key && styles.optionChipActive]} onPress={() => setFlightPreference({ preferredCabin: opt.key })}>
                    <Text style={[styles.optionChipText, flightPreference.preferredCabin === opt.key && styles.optionChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>优先直飞</Text>
              <View style={styles.optionRow}>
                <TouchableOpacity style={[styles.optionChip, flightPreference.preferDirectFlight && styles.optionChipActive]} onPress={() => setFlightPreference({ preferDirectFlight: true })}>
                  <Text style={[styles.optionChipText, flightPreference.preferDirectFlight && styles.optionChipTextActive]}>是</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.optionChip, !flightPreference.preferDirectFlight && styles.optionChipActive]} onPress={() => setFlightPreference({ preferDirectFlight: false })}>
                  <Text style={[styles.optionChipText, !flightPreference.preferDirectFlight && styles.optionChipTextActive]}>无所谓</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>差价提醒阈值 (推荐航班比当天最低价贵超过此值时提醒)</Text>
              <View style={styles.optionRow}>
                {PRICE_ALERT_OPTIONS.map(p => (
                  <TouchableOpacity key={p} style={[styles.optionChip, !useCustomPriceAlert && flightPreference.priceAlertThreshold === p && styles.optionChipActive]} onPress={() => { setFlightPreference({ priceAlertThreshold: p }); setUseCustomPriceAlert(false); }}>
                    <Text style={[styles.optionChipText, !useCustomPriceAlert && flightPreference.priceAlertThreshold === p && styles.optionChipTextActive]}>{p}元</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.optionChip, useCustomPriceAlert && styles.optionChipActive]} onPress={() => setUseCustomPriceAlert(true)}>
                  <Text style={[styles.optionChipText, useCustomPriceAlert && styles.optionChipTextActive]}>自定义</Text>
                </TouchableOpacity>
              </View>
              {useCustomPriceAlert && (
                <TextInput style={styles.customInput} value={customPriceAlert} onChangeText={t => { setCustomPriceAlert(t); const n = parseInt(t); if (!isNaN(n) && n > 0) setFlightPreference({ priceAlertThreshold: n }); }} keyboardType="number-pad" placeholder="输入差价 如 200" placeholderTextColor={colors.disabled} />
              )}

              <Text style={styles.modalLabel}>临近日期差价提醒 (前后日期航班比规划日期便宜超过此值时提醒)</Text>
              <View style={styles.optionRow}>
                {NEARBY_DATE_ALERT_OPTIONS.map(p => (
                  <TouchableOpacity key={p} style={[styles.optionChip, !useCustomNearbyAlert && flightPreference.nearbyDateAlertThreshold === p && styles.optionChipActive]} onPress={() => { setFlightPreference({ nearbyDateAlertThreshold: p }); setUseCustomNearbyAlert(false); }}>
                    <Text style={[styles.optionChipText, !useCustomNearbyAlert && flightPreference.nearbyDateAlertThreshold === p && styles.optionChipTextActive]}>{p}元</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.optionChip, useCustomNearbyAlert && styles.optionChipActive]} onPress={() => setUseCustomNearbyAlert(true)}>
                  <Text style={[styles.optionChipText, useCustomNearbyAlert && styles.optionChipTextActive]}>自定义</Text>
                </TouchableOpacity>
              </View>
              {useCustomNearbyAlert && (
                <TextInput style={styles.customInput} value={customNearbyAlert} onChangeText={t => { setCustomNearbyAlert(t); const n = parseInt(t); if (!isNaN(n) && n > 0) setFlightPreference({ nearbyDateAlertThreshold: n }); }} keyboardType="number-pad" placeholder="输入差价 如 150" placeholderTextColor={colors.disabled} />
              )}

              <View style={styles.rulePreview}>
                <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                <Text style={[typography.caption, { flex: 1, color: colors.textSecondary }]}>
                  当前偏好: {airlineLabel} | {cabinLabel}{flightPreference.preferDirectFlight ? ' | 优先直飞' : ''} | 同日差价{'>'}{flightPreference.priceAlertThreshold}元提醒 | 临近日期{'>'}{flightPreference.nearbyDateAlertThreshold}元提醒
                </Text>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setShowFlightEdit(false)}>
              <Text style={styles.modalDoneBtnText}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 盲盒安全设置编辑弹窗 */}
      <Modal visible={showBlindBoxEdit} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboardWrap}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={typography.h3}>盲盒安全设置</Text>
                <TouchableOpacity onPress={() => setShowBlindBoxEdit(false)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
                <Text style={styles.modalLabel}>总体旅行预算（元）</Text>
                <TextInput
                  style={styles.customInput}
                  value={String(blindBoxDraft.totalTripBudget)}
                  onChangeText={value => updateBlindBoxDraft({ totalTripBudget: Math.max(0, Number(value.replace(/\D/g, '')) || 0) })}
                  keyboardType="number-pad"
                />

                <Text style={styles.modalLabel}>过敏与饮食禁忌（用、分隔）</Text>
                <TextInput
                  style={styles.customInput}
                  value={blindBoxDraft.hardConstraints.dietaryAllergies.join('、')}
                  onChangeText={value => updateBlindBoxHard({ dietaryAllergies: value.split(/[、,，]/).map(item => item.trim()).filter(Boolean) })}
                  placeholder="例如：花生、海鲜、生食"
                  placeholderTextColor={colors.disabled}
                />

                <Text style={styles.modalLabel}>明确不接受的项目（用、分隔）</Text>
                <TextInput
                  style={styles.customInput}
                  value={blindBoxDraft.hardConstraints.forbidden.join('、')}
                  onChangeText={value => updateBlindBoxHard({ forbidden: value.split(/[、,，]/).map(item => item.trim()).filter(Boolean) })}
                  placeholder="例如：高空、蹦极、密闭空间"
                  placeholderTextColor={colors.disabled}
                />

                <Text style={styles.modalLabel}>行动能力限制（用、分隔）</Text>
                <TextInput
                  style={styles.customInput}
                  value={blindBoxDraft.hardConstraints.mobilityLimitations.join('、')}
                  onChangeText={value => updateBlindBoxHard({ mobilityLimitations: value.split(/[、,，]/).map(item => item.trim()).filter(Boolean) })}
                  placeholder="例如：使用轮椅、不能爬楼"
                  placeholderTextColor={colors.disabled}
                />

                <View style={[styles.switchRow, { marginTop: spacing.lg }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>不接受夜间活动</Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>开启后，盲盒必须在 19:00 前结束</Text>
                  </View>
                  <Switch
                    value={blindBoxDraft.hardConstraints.noNightActivity}
                    onValueChange={value => updateBlindBoxHard({ noNightActivity: value })}
                    trackColor={{ false: colors.border, true: colors.primaryLight }}
                    thumbColor={blindBoxDraft.hardConstraints.noNightActivity ? colors.primary : '#FFF'}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>每天最多步行（分钟）</Text>
                    <TextInput
                      style={styles.customInput}
                      value={String(blindBoxDraft.hardConstraints.maxWalkingMinutesPerDay)}
                      onChangeText={value => updateBlindBoxHard({ maxWalkingMinutesPerDay: Math.max(0, Number(value.replace(/\D/g, '')) || 0) })}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>单段最多步行（分钟）</Text>
                    <TextInput
                      style={styles.customInput}
                      value={String(blindBoxDraft.hardConstraints.maxWalkingMinutesPerSegment)}
                      onChangeText={value => updateBlindBoxHard({ maxWalkingMinutesPerSegment: Math.max(0, Number(value.replace(/\D/g, '')) || 0) })}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                <View style={styles.rulePreview}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                  <Text style={[typography.caption, { flex: 1, color: colors.textSecondary }]}>
                    这些属于硬性限制，AI 盲盒不会为了惊喜而放宽；兴趣与节奏偏好继续沿用本页的其他设置。
                  </Text>
                </View>
                <View style={{ height: 8 }} />
              </ScrollView>
              <TouchableOpacity style={styles.modalDoneBtn} onPress={saveBlindBoxSafety}>
                <Text style={styles.modalDoneBtnText}>保存盲盒安全设置</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  optionChip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  optionChipTextActive: {
    color: '#FFF',
  },
  transportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  transportChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  budgetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  budgetCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  budgetCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  budgetLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  budgetDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  buttonWrapper: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxxl,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
  },
  startButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
  // 偏好摘要卡片
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  // 弹窗
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalKeyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '80%' },
  modalScrollContent: { paddingBottom: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  priceRangeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, fontSize: 14, color: colors.textPrimary, textAlign: 'center' },
  modalDoneBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.full, paddingVertical: 14, alignItems: 'center', marginTop: spacing.md },
  modalDoneBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  customInput: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, color: colors.textPrimary, marginTop: spacing.sm },
  rulePreview: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: `${colors.primary}08`, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 日期选择按钮
  datePickBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.xs },
  datePickText: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  // 日期选择列表行
  dateOptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: 4 },
  dateOptRowOn: { backgroundColor: colors.primary, borderRadius: borderRadius.md },
  dateOptRowText: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
});
