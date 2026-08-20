import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  Switch,
  TextInput,
  LayoutAnimation,
  UIManager,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { CustomStackParamList, RouteStop, CuisineType, TimePeriod, LuggageOption } from '../../types';
import { useRouteStore } from '../../store/useRouteStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { getAttractionById } from '../../data/attractions';
import { formatPrice, getZoneName } from '../../utils/formatters';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Nav = NativeStackNavigationProp<CustomStackParamList, 'CustomHome'>;

const DAY_OPTIONS = [1, 2, 3, 4, 5];
const SIZE_OPTIONS = [1, 2, 3, 4, 5, 6];
const CUISINE_OPTIONS: { type: CuisineType; label: string; icon: string }[] = [
  { type: '粤菜', label: '粤菜', icon: 'restaurant-outline' },
  { type: '湘菜', label: '湘菜', icon: 'flame-outline' },
  { type: '川菜', label: '川菜', icon: 'flame-outline' },
  { type: '海鲜', label: '海鲜', icon: 'fish-outline' },
  { type: '日料', label: '日料', icon: 'nutrition-outline' },
  { type: '西餐', label: '西餐', icon: 'pizza-outline' },
  { type: '火锅', label: '火锅', icon: 'bonfire-outline' },
  { type: '小吃', label: '小吃', icon: 'fast-food-outline' },
  { type: '茶餐厅', label: '茶餐厅', icon: 'cafe-outline' },
  { type: '素食', label: '素食', icon: 'leaf-outline' },
];

const TIME_PERIOD_OPTIONS: { key: TimePeriod; label: string; desc: string }[] = [
  { key: 'morning', label: '上午', desc: '6-12点' },
  { key: 'afternoon', label: '下午', desc: '12-18点' },
  { key: 'evening', label: '傍晚', desc: '18-22点' },
  { key: 'night', label: '夜间', desc: '22-6点' },
];

const CITY_OPTIONS = [
  '大连', '北京', '上海', '广州', '成都', '杭州',
  '武汉', '南京', '重庆', '西安', '长沙', '厦门',
];

const FIXED_DATES = Array.from({ length: 11 }, (_, i) => {
  const d = new Date(2026, 2, 25 + i); // 3月25日 ~ 4月4日
  return d.toISOString().split('T')[0];
});

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const formatDateCN = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日(周${WEEKDAYS[d.getDay()]})`;
};

export default function CustomHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { routeStops, removeStop, clearStops } = useRouteStore();
  const {
    needHotel, needBreakfast, needLunch, needDinner, groupSize, travelDays, cuisinePrefs,
    setNeedHotel, setNeedBreakfast, setNeedLunch, setNeedDinner, setGroupSize, setTravelDays, toggleCuisinePref,
    travelStartDate, setTravelStartDate, travelReturnDate, setTravelReturnDate,
    departureTimePeriod, setDepartureTimePeriod, returnTimePeriod, setReturnTimePeriod,
    flightPreference, setFlightPreference, transportRule, setTransportRule,
    returnDayTourEnabled, setReturnDayTourEnabled,
    returnDayMinDepartureTime, setReturnDayMinDepartureTime,
    returnDayWaitOption, setReturnDayWaitOption,
    isInDestCity, setIsInDestCity, departureCity, setDepartureCity,
  } = usePreferenceStore();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [prefExpanded, setPrefExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<'departure' | 'return' | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [citySearchText, setCitySearchText] = useState('');

  // Custom input mode
  const [customDaysMode, setCustomDaysMode] = useState(false);
  const [customDaysText, setCustomDaysText] = useState('');
  const [customSizeMode, setCustomSizeMode] = useState(false);
  const [customSizeText, setCustomSizeText] = useState('');

  const togglePref = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPrefExpanded(p => !p);
  };

  const handleCustomDaysSubmit = () => {
    const val = parseInt(customDaysText);
    if (val && val >= 1 && val <= 30) {
      setTravelDays(val);
      setCustomDaysMode(false);
    } else {
      Alert.alert('提示', '请输入1-30之间的天数');
    }
  };

  const handleCustomSizeSubmit = () => {
    const val = parseInt(customSizeText);
    if (val && val >= 1 && val <= 99) {
      setGroupSize(val);
      setCustomSizeMode(false);
    } else {
      Alert.alert('提示', '请输入1-99之间的人数');
    }
  };

  const toggleSelect = (attractionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(attractionId)) {
        next.delete(attractionId);
      } else {
        next.add(attractionId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === routeStops.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(routeStops.map(s => s.attractionId)));
    }
  };

  const handleGenerateRoute = () => {
    if (selectedIds.size === 0) {
      Alert.alert('提示', '请先勾选要加入路线的景点');
      return;
    }
    navigation.navigate('RoutePlan');
  };

  const handleViewCost = () => {
    navigation.navigate('Cart');
  };

  // Summary text for collapsed state
  const startShort = `${new Date(travelStartDate).getMonth() + 1}.${new Date(travelStartDate).getDate()}`;
  const returnShort = `${new Date(travelReturnDate).getMonth() + 1}.${new Date(travelReturnDate).getDate()}`;
  const prefSummary = `${startShort}-${returnShort} · ${isInDestCity ? '本地' : departureCity + '出发'} · ${groupSize}人 · ${[needBreakfast && '早', needLunch && '午', needDinner && '晚'].filter(Boolean).join('') || '无餐'}${needHotel ? ' · 住宿' : ''}`;

  const renderPreferenceSection = () => (
    <View style={styles.prefSection}>
      {/* Collapsible header */}
      <TouchableOpacity style={styles.prefHeader} onPress={togglePref} activeOpacity={0.7}>
        <View style={styles.prefHeaderLeft}>
          <Ionicons name="settings-outline" size={18} color={colors.primary} />
          <Text style={[typography.h3, { marginBottom: 0 }]}>出行设置</Text>
        </View>
        <View style={styles.prefHeaderRight}>
          {!prefExpanded && (
            <Text style={styles.prefSummaryText} numberOfLines={1}>{prefSummary}</Text>
          )}
          <Ionicons name={prefExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {prefExpanded && (
        <View style={styles.prefBody}>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
          {/* 出行日期区间 */}
          <View style={styles.prefRow}>
            <View style={styles.prefLabel}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={typography.body}>出行日期</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker('departure')}>
                <Text style={styles.dateBtnText}>{formatDateCN(travelStartDate)}</Text>
              </TouchableOpacity>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>至</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker('return')}>
                <Text style={styles.dateBtnText}>{formatDateCN(travelReturnDate)}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
            共{travelDays}天{Math.max(0, travelDays - 1)}晚 · 可选范围 3月25日-4月4日
          </Text>

          {/* Group size */}
          <View style={styles.prefRow}>
            <View style={styles.prefLabel}>
              <Ionicons name="people-outline" size={18} color={colors.accent} />
              <Text style={typography.body}>出行人数</Text>
            </View>
            <View style={styles.sizeRow}>
              {SIZE_OPTIONS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sizeChip, !customSizeMode && groupSize === s && styles.sizeChipActive]}
                  onPress={() => { setGroupSize(s); setCustomSizeMode(false); }}
                >
                  <Text style={[styles.sizeChipText, !customSizeMode && groupSize === s && styles.sizeChipTextActive]}>{s}人</Text>
                </TouchableOpacity>
              ))}
              {customSizeMode ? (
                <View style={styles.customInputRow}>
                  <TextInput
                    style={styles.customInputSmall}
                    value={customSizeText}
                    onChangeText={setCustomSizeText}
                    keyboardType="number-pad"
                    placeholder="人数"
                    placeholderTextColor={colors.disabled}
                    maxLength={2}
                    autoFocus
                  />
                  <TouchableOpacity style={styles.customInputConfirm} onPress={handleCustomSizeSubmit}>
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.sizeChip, !SIZE_OPTIONS.includes(groupSize) && styles.sizeChipActive]}
                  onPress={() => { setCustomSizeMode(true); setCustomSizeText(SIZE_OPTIONS.includes(groupSize) ? '' : String(groupSize)); }}
                >
                  <Text style={[styles.sizeChipText, !SIZE_OPTIONS.includes(groupSize) && styles.sizeChipTextActive]}>
                    {!SIZE_OPTIONS.includes(groupSize) ? `${groupSize}人` : '自定义'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Hotel toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.prefLabel}>
              <Ionicons name="bed-outline" size={18} color={colors.hotel} />
              <Text style={typography.body}>需要住宿</Text>
            </View>
            <Switch
              value={needHotel}
              onValueChange={setNeedHotel}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={needHotel ? colors.primary : colors.disabled}
            />
          </View>

          {/* Meal toggles */}
          <View style={styles.toggleRow}>
            <View style={styles.prefLabel}>
              <Ionicons name="sunny-outline" size={18} color={colors.warningYellow} />
              <Text style={typography.body}>需要早餐</Text>
            </View>
            <Switch
              value={needBreakfast}
              onValueChange={setNeedBreakfast}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={needBreakfast ? colors.primary : colors.disabled}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.prefLabel}>
              <Ionicons name="restaurant-outline" size={18} color={colors.warningYellow} />
              <Text style={typography.body}>需要午餐</Text>
            </View>
            <Switch
              value={needLunch}
              onValueChange={setNeedLunch}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={needLunch ? colors.primary : colors.disabled}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.prefLabel}>
              <Ionicons name="moon-outline" size={18} color={colors.accent} />
              <Text style={typography.body}>需要晚餐</Text>
            </View>
            <Switch
              value={needDinner}
              onValueChange={setNeedDinner}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={needDinner ? colors.primary : colors.disabled}
            />
          </View>

          {/* Cuisine type preferences */}
          {(needBreakfast || needLunch || needDinner) && (
            <View style={{ marginTop: spacing.md }}>
              <View style={styles.prefLabel}>
                <Ionicons name="heart-outline" size={18} color={colors.priceRed} />
                <Text style={typography.body}>喜欢的餐饮类型</Text>
              </View>
              <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
                选择后将优先推荐对应菜系（可多选，不选则推荐全部）
              </Text>
              <View style={styles.cuisineRow}>
                {CUISINE_OPTIONS.map(opt => {
                  const sel = cuisinePrefs.includes(opt.type);
                  return (
                    <TouchableOpacity
                      key={opt.type}
                      style={[styles.cuisineChip, sel && styles.cuisineChipActive]}
                      onPress={() => toggleCuisinePref(opt.type)}
                    >
                      <Ionicons name={opt.icon as any} size={14} color={sel ? '#FFF' : colors.textSecondary} />
                      <Text style={[styles.cuisineChipText, sel && styles.cuisineChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* 分隔线 */}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />

          {/* 我已在深圳 */}
          <View style={styles.toggleRow}>
            <View style={styles.prefLabel}>
              <Ionicons name="location-outline" size={18} color={colors.successGreen} />
              <Text style={typography.body}>我已在深圳</Text>
            </View>
            <Switch
              value={isInDestCity}
              onValueChange={setIsInDestCity}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={isInDestCity ? colors.primary : colors.disabled}
            />
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
            {isInDestCity ? '本地出行，无需航班信息' : '需要从外地飞往深圳'}
          </Text>

          {/* 出发城市 — 仅当不在本地时显示 */}
          {!isInDestCity && (
            <View style={[styles.prefRow, { marginTop: spacing.sm }]}>
              <View style={styles.prefLabel}>
                <Ionicons name="navigate-outline" size={18} color={colors.primary} />
                <Text style={typography.body}>出发城市</Text>
              </View>
              <TouchableOpacity style={styles.dateBtn} onPress={() => { setShowCityPicker(true); setCitySearchText(''); }}>
                <Text style={styles.dateBtnText}>{departureCity}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* === 航班相关设置 (仅当不在本地时显示) === */}
          {!isInDestCity && (
            <>
          {/* 出发时间段 */}
          <View style={{ marginTop: spacing.sm }}>
            <View style={styles.prefLabel}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <Text style={typography.body}>出发时间段</Text>
            </View>
            <View style={[styles.sizeRow, { marginTop: spacing.xs }]}>
              {TIME_PERIOD_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sizeChip, { flexDirection: 'column', paddingHorizontal: 10, paddingVertical: 5 }, departureTimePeriod === opt.key && styles.sizeChipActive]}
                  onPress={() => setDepartureTimePeriod(opt.key)}
                >
                  <Text style={[styles.sizeChipText, departureTimePeriod === opt.key && styles.sizeChipTextActive]}>{opt.label}</Text>
                  <Text style={[{ fontSize: 9, color: colors.textSecondary }, departureTimePeriod === opt.key && { color: 'rgba(255,255,255,0.7)' }]}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 返程时间段 */}
          <View style={{ marginTop: spacing.sm }}>
            <View style={styles.prefLabel}>
              <Ionicons name="time-outline" size={18} color={colors.accent} />
              <Text style={typography.body}>返程时间段</Text>
            </View>
            <View style={[styles.sizeRow, { marginTop: spacing.xs }]}>
              {TIME_PERIOD_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sizeChip, { flexDirection: 'column', paddingHorizontal: 10, paddingVertical: 5 }, returnTimePeriod === opt.key && styles.sizeChipActive]}
                  onPress={() => setReturnTimePeriod(opt.key)}
                >
                  <Text style={[styles.sizeChipText, returnTimePeriod === opt.key && styles.sizeChipTextActive]}>{opt.label}</Text>
                  <Text style={[{ fontSize: 9, color: colors.textSecondary }, returnTimePeriod === opt.key && { color: 'rgba(255,255,255,0.7)' }]}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 行李偏好 */}
          <View style={[styles.prefRow, { marginTop: spacing.sm }]}>
            <View style={styles.prefLabel}>
              <Ionicons name="briefcase-outline" size={18} color={colors.warningYellow} />
              <Text style={typography.body}>行李偏好</Text>
            </View>
            <View style={styles.sizeRow}>
              {([
                { key: 'any' as const, label: '不限' },
                { key: 'checked' as const, label: '含托运' },
                { key: 'carryOnly' as const, label: '仅手提' },
              ] as { key: LuggageOption | 'any'; label: string }[]).map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sizeChip, flightPreference.luggagePreference === opt.key && styles.sizeChipActive]}
                  onPress={() => setFlightPreference({ luggagePreference: opt.key })}
                >
                  <Text style={[styles.sizeChipText, flightPreference.luggagePreference === opt.key && styles.sizeChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 到达先存行李 */}
          <View style={styles.toggleRow}>
            <View style={styles.prefLabel}>
              <Ionicons name="bag-check-outline" size={18} color={colors.hotel} />
              <Text style={typography.body}>到达先存行李</Text>
            </View>
            <Switch
              value={transportRule.dropOffLuggageAtHotel}
              onValueChange={(v) => setTransportRule({ dropOffLuggageAtHotel: v })}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={transportRule.dropOffLuggageAtHotel ? colors.primary : colors.disabled}
            />
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>白天到达先去酒店放行李再游玩；18点后到达则直接去酒店</Text>

          {/* 返程当天安排游览 */}
          <View style={[styles.toggleRow, { marginTop: spacing.md }]}>
            <View style={styles.prefLabel}>
              <Ionicons name="airplane-outline" size={18} color={colors.secondary} />
              <Text style={typography.body}>返程当天安排游览</Text>
            </View>
            <Switch
              value={returnDayTourEnabled}
              onValueChange={setReturnDayTourEnabled}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={returnDayTourEnabled ? colors.primary : colors.disabled}
            />
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
            开启后将在返程当天推荐顺路景点；关闭则退房后直接前往机场
          </Text>

          {/* 最早出门时间 */}
          <View style={[styles.prefRow, { marginTop: spacing.sm }]}>
            <View style={styles.prefLabel}>
              <Ionicons name="time-outline" size={18} color={colors.accent} />
              <Text style={typography.body}>最早出门时间</Text>
            </View>
            <View style={styles.sizeRow}>
              {['08:00', '08:30', '09:00', '09:30', '10:00'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.sizeChip, returnDayMinDepartureTime === t && styles.sizeChipActive]}
                  onPress={() => setReturnDayMinDepartureTime(t)}
                >
                  <Text style={[styles.sizeChipText, returnDayMinDepartureTime === t && styles.sizeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
            航班太早需在此时间前出门时，将跳过当天游览
          </Text>

          {/* 退房后等候方式 (仅当关闭游览时显示) */}
          {!returnDayTourEnabled && (
            <View style={[styles.prefRow, { marginTop: spacing.sm }]}>
              <View style={styles.prefLabel}>
                <Ionicons name="hourglass-outline" size={18} color={colors.hotel} />
                <Text style={typography.body}>退房后等候方式</Text>
              </View>
              <View style={styles.sizeRow}>
                <TouchableOpacity
                  style={[styles.sizeChip, returnDayWaitOption === 'hotel' && styles.sizeChipActive]}
                  onPress={() => setReturnDayWaitOption('hotel')}
                >
                  <Text style={[styles.sizeChipText, returnDayWaitOption === 'hotel' && styles.sizeChipTextActive]}>酒店大厅</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sizeChip, returnDayWaitOption === 'airport' && styles.sizeChipActive]}
                  onPress={() => setReturnDayWaitOption('airport')}
                >
                  <Text style={[styles.sizeChipText, returnDayWaitOption === 'airport' && styles.sizeChipTextActive]}>提前去机场</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

            </>
          )}

          {/* 驾车方式 (仅当 defaultMode 为 driving 时显示) */}
          {transportRule.defaultMode === 'driving' && (
            <View style={[styles.prefRow, { marginTop: spacing.sm }]}>
              <View style={styles.prefLabel}>
                <Ionicons name="car-sport-outline" size={18} color={colors.accent} />
                <Text style={typography.body}>驾车方式</Text>
              </View>
              <View style={styles.sizeRow}>
                <TouchableOpacity
                  style={[styles.sizeChip, transportRule.drivingSubMode === 'self' && styles.sizeChipActive]}
                  onPress={() => setTransportRule({ drivingSubMode: 'self' })}
                >
                  <Text style={[styles.sizeChipText, transportRule.drivingSubMode === 'self' && styles.sizeChipTextActive]}>自驾</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sizeChip, transportRule.drivingSubMode === 'taxi' && styles.sizeChipActive]}
                  onPress={() => setTransportRule({ drivingSubMode: 'taxi' })}
                >
                  <Text style={[styles.sizeChipText, transportRule.drivingSubMode === 'taxi' && styles.sizeChipTextActive]}>打车</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {transportRule.defaultMode === 'driving' && (
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
              {transportRule.drivingSubMode === 'self' ? '按油费+停车费估算费用' : '按出租车计费估算费用'}
            </Text>
          )}

          <Text style={[typography.caption, { marginTop: spacing.md }]}>
            选中的需求将在路线规划中预分配，未选中的仍可手动添加
          </Text>
          </ScrollView>
        </View>
      )}
    </View>
  );

  const renderItem = ({ item }: { item: RouteStop }) => {
    const attraction = getAttractionById(item.attractionId);
    if (!attraction) return null;

    const isSelected = selectedIds.has(item.attractionId);
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => toggleSelect(item.attractionId)}
        >
          <Ionicons
            name={isSelected ? 'checkbox' : 'square-outline'}
            size={22}
            color={isSelected ? colors.primary : colors.disabled}
          />
        </TouchableOpacity>
        <Image source={{ uri: attraction.imageUrl }} style={styles.cardImage} />
        <View style={styles.cardBody}>
          <Text style={typography.body} numberOfLines={1}>{attraction.name}</Text>
          <View style={styles.cardMeta}>
            <Text style={typography.caption}>{getZoneName(attraction.zone)}</Text>
            <Text style={typography.caption}>{attraction.estimatedDuration}小时</Text>
            <Text style={[typography.caption, { color: colors.priceRed }]}>
              {attraction.ticketPrice === 0 ? '免费' : formatPrice(attraction.ticketPrice)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => removeStop(item.attractionId)}
        >
          <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="compass-outline" size={64} color={colors.disabled} />
      <Text style={[typography.h3, { color: colors.textSecondary, marginTop: spacing.lg }]}>
        还没有收藏景点
      </Text>
      <Text style={[typography.bodySmall, { textAlign: 'center', marginTop: spacing.sm }]}>
        去「探索」页面浏览景点，点击 + 收藏到这里
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={colors.gradient} style={styles.header}>
        <Text style={styles.headerTitle}>自定义路线</Text>
        <Text style={styles.headerSubtitle}>
          {routeStops.length > 0
            ? `已收藏 ${routeStops.length} 个景点，勾选后生成路线`
            : '从探索页面添加感兴趣的景点'}
        </Text>
      </LinearGradient>

      {/* Preference section */}
      {routeStops.length > 0 && renderPreferenceSection()}

      {/* Select All Bar */}
      {routeStops.length > 0 && (
        <View style={styles.selectBar}>
          <TouchableOpacity style={styles.selectAllBtn} onPress={selectAll}>
            <Ionicons
              name={selectedIds.size === routeStops.length ? 'checkbox' : 'square-outline'}
              size={20}
              color={colors.primary}
            />
            <Text style={[typography.bodySmall, { color: colors.primary }]}>
              {selectedIds.size === routeStops.length ? '取消全选' : '全选'}
            </Text>
          </TouchableOpacity>
          <Text style={typography.bodySmall}>
            已选 {selectedIds.size}/{routeStops.length}
          </Text>
          <TouchableOpacity onPress={() => {
            Alert.alert('清空收藏', '确定清空所有收藏的景点吗？', [
              { text: '取消', style: 'cancel' },
              { text: '确定', style: 'destructive', onPress: clearStops },
            ]);
          }}>
            <Text style={[typography.bodySmall, { color: colors.priceRed }]}>清空</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={routeStops}
        renderItem={renderItem}
        keyExtractor={(item) => item.attractionId}
        contentContainerStyle={routeStops.length === 0 ? styles.emptyList : styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
      />

      {/* Bottom Action Bar */}
      {routeStops.length > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.costBtn} onPress={handleViewCost}>
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text style={[typography.body, { color: colors.primary }]}>费用预估</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.generateBtn, selectedIds.size === 0 && styles.generateBtnDisabled]}
            onPress={handleGenerateRoute}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={18} color="#FFF" />
            <Text style={styles.generateBtnText}>
              生成路线 ({selectedIds.size})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 日期选择 Modal */}
      <Modal visible={showDatePicker !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDatePicker(null)}>
          <View style={styles.modalContent}>
            <Text style={[typography.h3, { marginBottom: spacing.md }]}>
              {showDatePicker === 'departure' ? '选择出发日期' : '选择返程日期'}
            </Text>
            <ScrollView style={{ maxHeight: 350 }}>
              {FIXED_DATES.map(dateStr => {
                const isSelected = showDatePicker === 'departure'
                  ? dateStr === travelStartDate
                  : dateStr === travelReturnDate;
                const isDisabled = showDatePicker === 'return' && dateStr <= travelStartDate;
                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={[styles.dateOption, isSelected && styles.dateOptionActive, isDisabled && { opacity: 0.3 }]}
                    onPress={() => {
                      if (isDisabled) return;
                      if (showDatePicker === 'departure') {
                        setTravelStartDate(dateStr);
                        let retDate = travelReturnDate;
                        if (dateStr >= travelReturnDate) {
                          const next = new Date(dateStr);
                          next.setDate(next.getDate() + 2);
                          const nextStr = next.toISOString().split('T')[0];
                          if (FIXED_DATES.includes(nextStr)) {
                            setTravelReturnDate(nextStr);
                            retDate = nextStr;
                          }
                        }
                        const days = Math.round((new Date(retDate).getTime() - new Date(dateStr).getTime()) / 86400000) + 1;
                        setTravelDays(Math.max(1, days));
                      } else {
                        setTravelReturnDate(dateStr);
                        const days = Math.round((new Date(dateStr).getTime() - new Date(travelStartDate).getTime()) / 86400000) + 1;
                        setTravelDays(Math.max(1, days));
                      }
                      setShowDatePicker(null);
                    }}
                  >
                    <Text style={[typography.body, isSelected && { color: '#FFF', fontWeight: '700' }]}>{formatDateCN(dateStr)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDatePicker(null)}>
              <Text style={[typography.body, { color: colors.primary }]}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 城市选择 Modal */}
      <Modal visible={showCityPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCityPicker(false)}>
          <View style={styles.modalContent}>
            <Text style={[typography.h3, { marginBottom: spacing.md }]}>选择出发城市</Text>
            <TextInput
              style={[styles.dateBtn, { width: '100%', marginBottom: spacing.sm, paddingHorizontal: spacing.sm, height: 40 }]}
              placeholder="搜索城市..."
              placeholderTextColor={colors.disabled}
              value={citySearchText}
              onChangeText={setCitySearchText}
              autoFocus
            />
            <ScrollView style={{ maxHeight: 300 }}>
              {CITY_OPTIONS.filter(c => !citySearchText.trim() || c.includes(citySearchText.trim())).map(city => {
                const isSelected = city === departureCity;
                return (
                  <TouchableOpacity
                    key={city}
                    style={[styles.dateOption, isSelected && styles.dateOptionActive]}
                    onPress={() => {
                      setDepartureCity(city);
                      setShowCityPicker(false);
                      setCitySearchText('');
                    }}
                  >
                    <Text style={[typography.body, isSelected && { color: '#FFF', fontWeight: '700' }]}>{city}</Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                );
              })}
              {CITY_OPTIONS.filter(c => !citySearchText.trim() || c.includes(citySearchText.trim())).length === 0 && (
                <Text style={[typography.caption, { textAlign: 'center', padding: spacing.md, color: colors.textSecondary }]}>
                  未找到匹配城市
                </Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowCityPicker(false)}>
              <Text style={[typography.body, { color: colors.primary }]}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  // Preference section - collapsible
  prefSection: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.light,
  },
  prefHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  prefHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  prefHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'flex-end',
  },
  prefSummaryText: {
    fontSize: 12,
    color: colors.textSecondary,
    maxWidth: 180,
  },
  prefBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  prefRow: {
    marginBottom: spacing.md,
  },
  prefLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sizeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  sizeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  sizeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sizeChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  sizeChipTextActive: {
    color: '#FFF',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  customInputSmall: {
    width: 56,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
    backgroundColor: colors.surface,
  },
  customInputConfirm: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  // Select bar
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: 100,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingTop: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadow.light,
  },
  checkbox: {
    marginRight: spacing.md,
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.border,
    marginRight: spacing.md,
  },
  cardBody: {
    flex: 1,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 4,
  },
  removeBtn: {
    padding: spacing.xs,
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  costBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  generateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.full,
  },
  generateBtnDisabled: {
    backgroundColor: colors.disabled,
  },
  generateBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  cuisineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cuisineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  cuisineChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cuisineChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  cuisineChipTextActive: {
    color: '#FFF',
  },
  // 日期选择按钮
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: borderRadius.md },
  dateBtnText: { fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  // 日期选择 Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFF', borderRadius: borderRadius.lg, padding: spacing.xl, width: '80%', maxWidth: 360 },
  dateOption: { paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md, marginBottom: 4 },
  dateOptionActive: { backgroundColor: colors.primary },
  modalCloseBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
});
