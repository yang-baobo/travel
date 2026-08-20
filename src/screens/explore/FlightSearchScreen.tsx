import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList, TripType, Flight, FlightClass, AirlineType, LuggageOption } from '../../types';
import { searchFlights, findCheapFlights, findPremiumAlternative, findFlightsByGroup } from '../../data/flights';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useFavoriteStore } from '../../store/useFavoriteStore';
import { formatPrice } from '../../utils/formatters';

type Nav = NativeStackNavigationProp<ExploreStackParamList, 'FlightSearch'>;

const DATES = [
  '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27',
  '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31',
  '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04',
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getWeekday(dateStr: string): string {
  const d = new Date(dateStr);
  return '周' + WEEKDAYS[d.getDay()];
}

function formatDateShort(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? m + 'm' : ''}`;
}

function getCabinLabel(cabin: FlightClass): string {
  switch (cabin) {
    case 'economy': return '经济舱';
    case 'premium': return '超级经济舱';
    case 'first': return '头等舱';
  }
}

export default function FlightSearchScreen() {
  const navigation = useNavigation<Nav>();
  const { flightPreference } = usePreferenceStore();
  const { favoriteFlightIds, toggleFavoriteFlight } = useFavoriteStore();

  const [tripType, setTripType] = useState<TripType>('oneWay');
  const [departureCity, setDepartureCity] = useState('大连');
  const [arrivalCity, setArrivalCity] = useState('深圳');
  const [departureDate, setDepartureDate] = useState('2026-03-24');
  const [returnDate, setReturnDate] = useState('2026-04-04');
  const [showDatePicker, setShowDatePicker] = useState<'departure' | 'return' | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<Flight[]>([]);
  const [returnResults, setReturnResults] = useState<Flight[]>([]);

  // 往返选中的航班
  const [selectedDepFlight, setSelectedDepFlight] = useState<Flight | null>(null);
  const [selectedRetFlight, setSelectedRetFlight] = useState<Flight | null>(null);
  // 当前激活列 (往返模式下)
  const [activeColumn, setActiveColumn] = useState<'departure' | 'return'>('departure');

  // 筛选状态
  const [filterCabin, setFilterCabin] = useState<FlightClass | 'any'>(flightPreference.preferredCabin);
  const [filterAirline, setFilterAirline] = useState<AirlineType | 'any'>(flightPreference.preferredAirlineType);
  const [filterDirect, setFilterDirect] = useState(flightPreference.preferDirectFlight);
  const [sortBy, setSortBy] = useState<'price' | 'time' | 'duration'>('price');

  // 航班详情页
  const [detailFlight, setDetailFlight] = useState<Flight | null>(null);
  const [detailCabinTab, setDetailCabinTab] = useState<FlightClass>('economy');

  const swapCities = () => {
    setDepartureCity(arrivalCity);
    setArrivalCity(departureCity);
  };

  const handleSearch = () => {
    const searchResults = searchFlights({
      departureCity, arrivalCity, date: departureDate,
      cabin: filterCabin, airlineType: filterAirline, directOnly: filterDirect,
    });
    setResults(searchResults);
    if (tripType === 'roundTrip') {
      const retResults = searchFlights({
        departureCity: arrivalCity, arrivalCity: departureCity, date: returnDate,
        cabin: filterCabin, airlineType: filterAirline, directOnly: filterDirect,
      });
      setReturnResults(retResults);
    }
    setSelectedDepFlight(null);
    setSelectedRetFlight(null);
    setActiveColumn('departure');
    setShowResults(true);
  };

  const reSearch = (overrides: { directOnly?: boolean; cabin?: FlightClass | 'any'; airlineType?: AirlineType | 'any'; date?: string }) => {
    const r = searchFlights({
      departureCity, arrivalCity, date: overrides.date || departureDate,
      cabin: overrides.cabin ?? filterCabin, airlineType: overrides.airlineType ?? filterAirline, directOnly: overrides.directOnly ?? filterDirect,
    });
    setResults(r);
  };

  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === 'price') return a.totalPrice - b.totalPrice;
    if (sortBy === 'time') return a.departureTime.localeCompare(b.departureTime);
    return a.durationMin - b.durationMin;
  });

  // 按 slotGroupId 分组，每组只取最便宜的一条展示
  const groupedResults = useMemo(() => {
    const groups: Record<string, Flight> = {};
    for (const f of sortedResults) {
      if (!groups[f.slotGroupId] || f.totalPrice < groups[f.slotGroupId].totalPrice) {
        groups[f.slotGroupId] = f;
      }
    }
    const unique = Object.values(groups);
    return unique.sort((a, b) => {
      if (sortBy === 'price') return a.totalPrice - b.totalPrice;
      if (sortBy === 'time') return a.departureTime.localeCompare(b.departureTime);
      return a.durationMin - b.durationMin;
    });
  }, [sortedResults, sortBy]);

  // 返程分组结果
  const sortedReturnResults = [...returnResults].sort((a, b) => {
    if (sortBy === 'price') return a.totalPrice - b.totalPrice;
    if (sortBy === 'time') return a.departureTime.localeCompare(b.departureTime);
    return a.durationMin - b.durationMin;
  });
  const groupedReturnResults = useMemo(() => {
    const groups: Record<string, Flight> = {};
    for (const f of sortedReturnResults) {
      if (!groups[f.slotGroupId] || f.totalPrice < groups[f.slotGroupId].totalPrice) {
        groups[f.slotGroupId] = f;
      }
    }
    return Object.values(groups).sort((a, b) => {
      if (sortBy === 'price') return a.totalPrice - b.totalPrice;
      if (sortBy === 'time') return a.departureTime.localeCompare(b.departureTime);
      return a.durationMin - b.durationMin;
    });
  }, [sortedReturnResults, sortBy]);

  // 差价对比 - 与当前搜索同条件在其他日期的最低价
  const cheapAlerts = findCheapFlights({
    departureCity, arrivalCity,
    excludeDate: departureDate,
    priceThreshold: flightPreference.priceAlertThreshold,
    cabin: flightPreference.preferredCabin,
  }).slice(0, 5);

  // ===== 航班结果卡片（每个时段只显示一条，点击进入详情） =====
  const renderFlightCard = ({ item: flight }: { item: Flight }) => {
    // 获取同组所有方案，计算价格范围
    const groupFlights = findFlightsByGroup(flight.slotGroupId);
    const minPrice = Math.min(...groupFlights.map(f => f.totalPrice));
    const maxPrice = Math.max(...groupFlights.map(f => f.totalPrice));
    const cabinCount = new Set(groupFlights.map(f => f.cabin)).size;

    return (
      <TouchableOpacity style={s.card} activeOpacity={0.7} onPress={() => { setDetailFlight(flight); setDetailCabinTab('economy'); }}>
        {/* 航司 + 航班号 */}
        <View style={s.cardTop}>
          <Text style={s.airline}>{flight.airline}</Text>
          <Text style={s.flightNo}>{flight.flightNo}</Text>
          {flight.airlineType === 'budget' && (
            <View style={s.lcBadge}><Text style={s.lcText}>廉航</Text></View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={[s.detailText, { fontSize: 11, color: colors.accent }]}>{cabinCount}种舱位可选</Text>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); toggleFavoriteFlight(flight.id); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ marginLeft: 6 }}
          >
            <Ionicons
              name={favoriteFlightIds.includes(flight.id) ? 'heart' : 'heart-outline'}
              size={16}
              color={favoriteFlightIds.includes(flight.id) ? colors.priceRed : colors.disabled}
            />
          </TouchableOpacity>
        </View>

        {/* 出发 -> 到达 */}
        <View style={s.routeRow}>
          <View style={s.timeCol}>
            <Text style={s.bigTime}>{flight.departureTime}</Text>
            <Text style={s.airport}>{flight.departureCity}</Text>
          </View>
          <View style={s.middle}>
            <Text style={s.dur}>{formatDuration(flight.durationMin)}</Text>
            <View style={s.line}>
              <View style={s.dot} />
              <View style={s.dash} />
              {!flight.isDirect && <View style={[s.dot, { backgroundColor: colors.warningYellow }]} />}
              {!flight.isDirect && <View style={s.dash} />}
              <View style={s.dot} />
            </View>
            <Text style={s.stopLabel}>{flight.isDirect ? '直飞' : `经停${flight.stopCity}`}</Text>
          </View>
          <View style={[s.timeCol, { alignItems: 'flex-end' }]}>
            <Text style={s.bigTime}>{flight.arrivalTime}</Text>
            <Text style={s.airport}>{flight.arrivalCity}</Text>
          </View>
        </View>

        {/* 价格区间 + 进入详情提示 */}
        <View style={s.cardBottom}>
          <View>
            <Text style={s.price}>{formatPrice(minPrice)}起</Text>
            {minPrice !== maxPrice && <Text style={[s.detailText, { fontSize: 10, marginTop: 1 }]}>最高{formatPrice(maxPrice)}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12, color: colors.accent }}>查看方案</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.accent} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ===== 航班详情页面 =====
  if (showResults && detailFlight) {
    const allGroupFlights = findFlightsByGroup(detailFlight.slotGroupId);
    const cabinTypes: FlightClass[] = ['economy', 'premium', 'first'];
    const availableCabins = cabinTypes.filter(c => allGroupFlights.some(f => f.cabin === c));
    const tabFlights = allGroupFlights.filter(f => f.cabin === detailCabinTab);

    return (
      <SafeAreaView style={s.container} edges={['top']}>
        {/* 顶部导航 */}
        <View style={s.resNav}>
          <TouchableOpacity onPress={() => setDetailFlight(null)} style={s.navBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.resNavCenter}>
            <Text style={s.resRoute}>航班方案</Text>
            <Text style={s.resDate}>{detailFlight.airline} {detailFlight.flightNo}</Text>
          </View>
          <View style={s.navBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* 航班信息头部 */}
          <View style={ds.flightHeader}>
            <View style={ds.headerAirline}>
              <Text style={ds.airlineName}>{detailFlight.airline}</Text>
              <Text style={ds.flightNoText}>{detailFlight.flightNo}</Text>
              {detailFlight.airlineType === 'budget' && (
                <View style={s.lcBadge}><Text style={s.lcText}>廉航</Text></View>
              )}
            </View>

            <View style={ds.routeInfo}>
              <View style={{ alignItems: 'center' }}>
                <Text style={ds.timeText}>{detailFlight.departureTime}</Text>
                <Text style={ds.cityLabel}>{detailFlight.departureCity}</Text>
                <Text style={ds.airportLabel}>{detailFlight.departureAirport}</Text>
              </View>
              <View style={ds.routeMiddle}>
                <Text style={ds.durationText}>{formatDuration(detailFlight.durationMin)}</Text>
                <View style={ds.routeLine}>
                  <View style={ds.routeDot} />
                  <View style={ds.routeDash} />
                  {!detailFlight.isDirect && <View style={[ds.routeDot, { backgroundColor: colors.warningYellow }]} />}
                  {!detailFlight.isDirect && <View style={ds.routeDash} />}
                  <View style={ds.routeDot} />
                </View>
                <Text style={ds.stopText}>{detailFlight.isDirect ? '直飞' : `经停${detailFlight.stopCity}`}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={ds.timeText}>{detailFlight.arrivalTime}</Text>
                <Text style={ds.cityLabel}>{detailFlight.arrivalCity}</Text>
                <Text style={ds.airportLabel}>{detailFlight.arrivalAirport}</Text>
              </View>
            </View>

            <Text style={ds.dateLabel}>{formatDateShort(detailFlight.date)} {getWeekday(detailFlight.date)}</Text>
          </View>

          {/* 舱位Tab */}
          <View style={ds.tabBar}>
            {availableCabins.map(c => {
              const isActive = detailCabinTab === c;
              return (
                <TouchableOpacity
                  key={c}
                  style={[ds.tabBtn, isActive && ds.tabBtnActive]}
                  onPress={() => setDetailCabinTab(c)}
                >
                  <Text style={[ds.tabText, isActive && ds.tabTextActive]}>{getCabinLabel(c)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 方案列表 */}
          <View style={ds.optionList}>
            {tabFlights.map((f, idx) => {
              const luggageDesc = f.luggageOption === 'checked'
                ? '托运20kg + 手提7kg'
                : '仅手提7kg (无免费托运)';
              return (
                <View key={f.id} style={ds.optionCard}>
                  <View style={ds.optionHeader}>
                    <View style={ds.optionBadge}>
                      <Ionicons
                        name={f.luggageOption === 'checked' ? 'bag-check' : 'bag-handle'}
                        size={14}
                        color={f.luggageOption === 'checked' ? colors.primary : colors.warningYellow}
                      />
                      <Text style={[ds.optionBadgeText, {
                        color: f.luggageOption === 'checked' ? colors.primary : colors.warningYellow,
                      }]}>{luggageDesc}</Text>
                    </View>
                    {idx === 0 && (
                      <View style={ds.cheapTag}>
                        <Text style={ds.cheapTagText}>最低价</Text>
                      </View>
                    )}
                  </View>

                  <View style={ds.optionPriceRow}>
                    <View>
                      <Text style={ds.optionPrice}>{formatPrice(f.totalPrice)}</Text>
                      <Text style={ds.optionPriceNote}>/人</Text>
                    </View>
                    <TouchableOpacity
                      style={ds.selectBtn}
                      onPress={() => {
                        navigation.navigate('FlightList', {
                          departureCity: f.departureCity,
                          arrivalCity: f.arrivalCity,
                          date: f.date,
                          tripType,
                          returnDate: tripType === 'roundTrip' ? returnDate : undefined,
                        });
                      }}
                    >
                      <Text style={ds.selectBtnText}>选择</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 价格明细 */}
                  <View style={ds.breakdownRow}>
                    <Text style={ds.breakdownLabel}>票价 {formatPrice(f.basePrice)}</Text>
                    {f.fuelSurcharge > 0 && <Text style={ds.breakdownLabel}>燃油 {formatPrice(f.fuelSurcharge)}</Text>}
                    {f.luggageAddOnPrice > 0 && <Text style={ds.breakdownLabel}>行李 {formatPrice(f.luggageAddOnPrice)}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===== 结果页面 =====
  if (showResults) {
    const isRoundTrip = tripType === 'roundTrip';
    const roundTripTotal = (selectedDepFlight?.totalPrice || 0) + (selectedRetFlight?.totalPrice || 0);

    // 紧凑航班卡片渲染
    const renderCompactCard = (flight: Flight, selected: boolean, onSelect: () => void) => (
      <TouchableOpacity
        key={flight.slotGroupId}
        style={[rs.compactCard, selected && rs.compactCardSelected]}
        activeOpacity={0.7}
        onPress={onSelect}
      >
        <View style={rs.compactRow}>
          <View style={{ flex: 1 }}>
            <Text style={rs.compactTime}>{flight.departureTime}</Text>
            <Text style={rs.compactAirport}>{flight.departureAirport || flight.departureCity}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={rs.compactTime}>{flight.arrivalTime}</Text>
            <Text style={rs.compactAirport}>{flight.arrivalAirport || flight.arrivalCity}</Text>
          </View>
        </View>
        <View style={rs.compactBottom}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
            <Text style={rs.compactAirline}>{flight.airline}</Text>
            <Text style={rs.compactMeta}>{flight.isDirect ? '直飞' : `经停`}</Text>
          </View>
          <Text style={[rs.compactPrice, selected && { color: '#FFF' }]}>{formatPrice(flight.totalPrice)}</Text>
        </View>
      </TouchableOpacity>
    );

    // 日期Tab渲染
    const renderDateTabs = (currentDate: string, onDateChange: (d: string) => void) => (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4 }}>
        {DATES.map(d => {
          const dt = new Date(d);
          const dayNum = dt.getDate();
          const wk = '周' + WEEKDAYS[dt.getDay()];
          const isActive = d === currentDate;
          return (
            <TouchableOpacity
              key={d}
              style={[rs.dateTab, isActive && rs.dateTabActive]}
              onPress={() => onDateChange(d)}
            >
              <Text style={[rs.dateTabDay, isActive && rs.dateTabDayActive]}>{String(dt.getMonth() + 1).padStart(2, '0')}-{String(dayNum).padStart(2, '0')}</Text>
              <Text style={[rs.dateTabWk, isActive && rs.dateTabWkActive]}>{wk}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );

    return (
      <SafeAreaView style={s.container} edges={['top']}>
        {/* 顶部导航 */}
        <View style={rs.header}>
          <TouchableOpacity onPress={() => setShowResults(false)} style={s.navBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={rs.headerTitle}>{departureCity} ⇌ {arrivalCity}</Text>
          <View style={s.navBtn} />
        </View>

        {/* 筛选栏 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContent}>
          {[
            { key: 'price', label: '价格优先' },
            { key: 'time', label: '时间优先' },
          ].map(item => (
            <TouchableOpacity key={item.key} style={[s.fChip, sortBy === item.key && s.fChipOn]} onPress={() => setSortBy(item.key as any)}>
              <Text style={[s.fChipText, sortBy === item.key && s.fChipTextOn]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={s.fDivider} />
          <TouchableOpacity style={[s.fChip, filterDirect && s.fChipOn]} onPress={() => { const v = !filterDirect; setFilterDirect(v); reSearch({ directOnly: v }); }}>
            <Text style={[s.fChipText, filterDirect && s.fChipTextOn]}>直飞优先</Text>
          </TouchableOpacity>
        </ScrollView>

        {isRoundTrip ? (
          /* ===== 往返双列布局 ===== */
          <View style={{ flex: 1 }}>
            {/* 去程/返程 Tab */}
            <View style={rs.columnTabs}>
              <TouchableOpacity
                style={[rs.colTab, activeColumn === 'departure' && rs.colTabActive]}
                onPress={() => setActiveColumn('departure')}
              >
                <Text style={[rs.colTabText, activeColumn === 'departure' && rs.colTabTextActive]}>去程</Text>
                {selectedDepFlight && <Text style={rs.colTabSub}>{selectedDepFlight.departureTime}-{selectedDepFlight.arrivalTime}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[rs.colTab, activeColumn === 'return' && rs.colTabActiveRet]}
                onPress={() => setActiveColumn('return')}
              >
                <Text style={[rs.colTabText, activeColumn === 'return' && rs.colTabTextActiveRet]}>返程</Text>
                {selectedRetFlight && <Text style={[rs.colTabSub, { color: '#E53935' }]}>{selectedRetFlight.departureTime}-{selectedRetFlight.arrivalTime}</Text>}
              </TouchableOpacity>
            </View>

            {/* 日期Tab */}
            <View style={rs.dateTabs}>
              {activeColumn === 'departure'
                ? renderDateTabs(departureDate, (d) => {
                    setDepartureDate(d);
                    const r = searchFlights({ departureCity, arrivalCity, date: d, cabin: filterCabin, airlineType: filterAirline, directOnly: filterDirect });
                    setResults(r);
                  })
                : renderDateTabs(returnDate, (d) => {
                    setReturnDate(d);
                    const r = searchFlights({ departureCity: arrivalCity, arrivalCity: departureCity, date: d, cabin: filterCabin, airlineType: filterAirline, directOnly: filterDirect });
                    setReturnResults(r);
                  })
              }
            </View>

            {/* 航班列表 */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.sm, gap: 6 }}>
              {activeColumn === 'departure' ? (
                groupedResults.length > 0 ? groupedResults.map(f =>
                  renderCompactCard(f, selectedDepFlight?.slotGroupId === f.slotGroupId, () => {
                    setSelectedDepFlight(f);
                    // 选完去程自动切换到返程
                    if (!selectedRetFlight) setActiveColumn('return');
                  })
                ) : (
                  <View style={s.empty}>
                    <Text style={[typography.body, { color: colors.textSecondary }]}>暂无去程航班</Text>
                  </View>
                )
              ) : (
                groupedReturnResults.length > 0 ? groupedReturnResults.map(f =>
                  renderCompactCard(f, selectedRetFlight?.slotGroupId === f.slotGroupId, () => setSelectedRetFlight(f))
                ) : (
                  <View style={s.empty}>
                    <Text style={[typography.body, { color: colors.textSecondary }]}>暂无返程航班</Text>
                  </View>
                )
              )}
            </ScrollView>

            {/* 底部栏 */}
            <View style={rs.bottomBar}>
              <View style={{ flex: 1 }}>
                {selectedDepFlight && selectedRetFlight ? (
                  <>
                    <Text style={rs.totalPrice}>{formatPrice(roundTripTotal)}</Text>
                    <Text style={rs.totalLabel}>往返总价</Text>
                  </>
                ) : (
                  <Text style={rs.totalLabel}>
                    {!selectedDepFlight ? '请选择去程航班' : '请选择返程航班'}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={{ marginRight: spacing.sm }} onPress={() => {
                if (selectedDepFlight) { setDetailFlight(selectedDepFlight); setDetailCabinTab('economy'); }
              }}>
                <Text style={{ fontSize: 13, color: colors.primary }}>航班详情</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[rs.nextBtn, (!selectedDepFlight || !selectedRetFlight) && { opacity: 0.4 }]}
                disabled={!selectedDepFlight || !selectedRetFlight}
                onPress={() => navigation.goBack()}
              >
                <Text style={rs.nextBtnText}>下一步</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* ===== 单程列表 ===== */
          <>
            <View style={rs.dateTabs}>
              {renderDateTabs(departureDate, (d) => {
                setDepartureDate(d);
                const r = searchFlights({ departureCity, arrivalCity, date: d, cabin: filterCabin, airlineType: filterAirline, directOnly: filterDirect });
                setResults(r);
              })}
            </View>
            <FlatList
              data={groupedResults}
              keyExtractor={item => item.slotGroupId}
              renderItem={renderFlightCard}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
              ListEmptyComponent={
                <View style={s.empty}>
                  <Ionicons name="airplane-outline" size={48} color={colors.disabled} />
                  <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>没有符合条件的航班</Text>
                </View>
              }
            />
          </>
        )}
      </SafeAreaView>
    );
  }

  // ===== 搜索首页 =====
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={colors.gradient} style={s.header}>
          <View style={s.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.navBtn}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>机票搜索</Text>
            <View style={s.navBtn} />
          </View>

          {/* 单程/往返 */}
          <View style={s.typeRow}>
            {(['oneWay', 'roundTrip'] as TripType[]).map(t => (
              <TouchableOpacity key={t} style={[s.typeBtn, tripType === t && s.typeBtnOn]} onPress={() => setTripType(t)}>
                <Text style={[s.typeText, tripType === t && s.typeTextOn]}>{t === 'roundTrip' ? '往返' : '单程'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {/* 搜索卡片 */}
        <View style={s.searchCard}>
          {/* 城市选择 */}
          <View style={s.cityRow}>
            <TouchableOpacity style={s.cityBox} onPress={() => setDepartureCity(departureCity === '大连' ? '深圳' : '大连')}>
              <Text style={s.cityHint}>出发</Text>
              <Text style={s.cityText}>{departureCity}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={swapCities} style={s.swapIcon}>
              <Ionicons name="swap-horizontal" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.cityBox, { alignItems: 'flex-end' }]} onPress={() => setArrivalCity(arrivalCity === '深圳' ? '大连' : '深圳')}>
              <Text style={s.cityHint}>到达</Text>
              <Text style={s.cityText}>{arrivalCity}</Text>
            </TouchableOpacity>
          </View>

          <View style={s.sep} />

          {/* 日期 */}
          <View style={s.dateRow}>
            <TouchableOpacity style={s.dateBox} onPress={() => setShowDatePicker('departure')}>
              <Text style={s.dateHint}>去程</Text>
              <Text style={s.dateText}>{formatDateShort(departureDate)}</Text>
              <Text style={s.dateWk}>{getWeekday(departureDate)}</Text>
            </TouchableOpacity>
            {tripType === 'roundTrip' && (
              <>
                <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                <TouchableOpacity style={s.dateBox} onPress={() => setShowDatePicker('return')}>
                  <Text style={s.dateHint}>返程</Text>
                  <Text style={s.dateText}>{formatDateShort(returnDate)}</Text>
                  <Text style={s.dateWk}>{getWeekday(returnDate)}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={s.sep} />

          {/* 快捷筛选 */}
          <View style={{ marginVertical: spacing.sm }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['any', 'economy', 'premium', 'first'] as (FlightClass | 'any')[]).map(c => (
                <TouchableOpacity
                  key={c}
                  style={[s.tagChip, filterCabin === c && s.tagChipOn]}
                  onPress={() => setFilterCabin(c)}
                >
                  <Text style={[s.tagText, filterCabin === c && s.tagTextOn]}>
                    {c === 'any' ? '全部舱位' : getCabinLabel(c)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {(['any', 'standard', 'budget'] as (AirlineType | 'any')[]).map(a => (
                <TouchableOpacity
                  key={a}
                  style={[s.tagChip, filterAirline === a && s.tagChipOn]}
                  onPress={() => setFilterAirline(a)}
                >
                  <Text style={[s.tagText, filterAirline === a && s.tagTextOn]}>
                    {a === 'any' ? '全部航司' : a === 'standard' ? '普通航空' : '廉价航空'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[s.tagChip, filterDirect && s.tagChipOn]}
                onPress={() => setFilterDirect(!filterDirect)}
              >
                <Text style={[s.tagText, filterDirect && s.tagTextOn]}>仅直飞</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 搜索按钮 */}
          <TouchableOpacity onPress={handleSearch} activeOpacity={0.8}>
            <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.searchBtn}>
              <Ionicons name="search" size={18} color="#FFF" />
              <Text style={s.searchBtnText}>搜索机票</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* 其他日期更低价航班 */}
        {cheapAlerts.length > 0 && (
          <View style={s.homeAlert}>
            <View style={s.alertHead}>
              <Ionicons name="pricetag-outline" size={14} color={colors.priceRed} />
              <Text style={[s.alertTitle, { color: colors.priceRed }]}>
                发现{cheapAlerts.length}个更低价航班 (其他日期)
              </Text>
            </View>
            {cheapAlerts.slice(0, 3).map(f => (
              <View key={f.id} style={s.homeAlertRow}>
                <Text style={s.alertDate}>{formatDateShort(f.date)}</Text>
                <Text style={s.alertInfo}>{f.airline} {getCabinLabel(f.cabin)}</Text>
                <Text style={[s.alertPrice, { color: colors.priceRed }]}>{formatPrice(f.totalPrice)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 广告位 */}
        <View style={s.adPlaceholder}>
          <Text style={s.adPlaceholderText}>广告位</Text>
        </View>
      </ScrollView>

      {/* 日期选择 Modal */}
      <Modal visible={showDatePicker !== null} transparent animationType="slide">
        <View style={s.modalBg}>
          <View style={s.datePicker}>
            <View style={s.datePickerHead}>
              <Text style={typography.h3}>{showDatePicker === 'departure' ? '选择去程日期' : '选择返程日期'}</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(null)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {DATES.map(date => {
                const isSelected = showDatePicker === 'departure' ? departureDate === date : returnDate === date;
                const disabled = showDatePicker === 'return' && date <= departureDate;
                return (
                  <TouchableOpacity
                    key={date}
                    style={[s.dateOpt, isSelected && s.dateOptOn, disabled && { opacity: 0.4 }]}
                    onPress={() => {
                      if (disabled) return;
                      if (showDatePicker === 'departure') {
                        setDepartureDate(date);
                        if (date >= returnDate) {
                          const idx = DATES.indexOf(date);
                          if (idx < DATES.length - 1) setReturnDate(DATES[idx + 1]);
                        }
                      } else {
                        setReturnDate(date);
                      }
                      setShowDatePicker(null);
                    }}
                    disabled={disabled}
                  >
                    <Text style={[s.dateOptText, isSelected && { color: '#FFF' }, disabled && { color: colors.disabled }]}>
                      {formatDateShort(date)} {getWeekday(date)}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Header
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl + 20, borderBottomLeftRadius: borderRadius.xl, borderBottomRightRadius: borderRadius.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  navBtn: { padding: spacing.xs },
  typeRow: { flexDirection: 'row', marginTop: spacing.md, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: borderRadius.full, padding: 2 },
  typeBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: borderRadius.full },
  typeBtnOn: { backgroundColor: '#FFF' },
  typeText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  typeTextOn: { color: colors.primary },
  // Search card
  searchCard: { marginHorizontal: spacing.lg, marginTop: -spacing.xxl, backgroundColor: colors.surface, borderRadius: borderRadius.xl, padding: spacing.lg, ...shadow.medium },
  cityRow: { flexDirection: 'row', alignItems: 'center' },
  cityBox: { flex: 1 },
  cityHint: { fontSize: 11, color: colors.textSecondary },
  cityText: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  swapIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: colors.primary + '40', justifyContent: 'center', alignItems: 'center' },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  dateRow: { flexDirection: 'row' },
  dateBox: { flex: 1, paddingVertical: spacing.xs },
  dateHint: { fontSize: 11, color: colors.textSecondary },
  dateText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  dateWk: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  tagChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tagText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  tagTextOn: { color: '#FFF' },
  searchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: borderRadius.full, gap: spacing.sm, marginTop: spacing.md },
  searchBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  adPlaceholder: { marginTop: spacing.lg, marginHorizontal: spacing.md, height: 120, borderRadius: borderRadius.lg, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', backgroundColor: `${colors.textSecondary}08`, justifyContent: 'center', alignItems: 'center' },
  adPlaceholderText: { fontSize: 14, color: colors.disabled, fontWeight: '500' },
  // Results nav
  resNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  resNavCenter: { flex: 1, marginLeft: spacing.sm },
  resRoute: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  resDate: { fontSize: 12, color: colors.textSecondary },
  // Filter scroll
  filterScroll: { borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 44 },
  filterContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 8, alignItems: 'center' as const },
  fChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignSelf: 'center' as const },
  fChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  fChipText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  fChipTextOn: { color: '#FFF' },
  fDivider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4, alignSelf: 'center' as const },
  // Flight card
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, ...shadow.light },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  airline: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  flightNo: { fontSize: 11, color: colors.textSecondary },
  lcBadge: { backgroundColor: colors.warningYellow + '20', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  lcText: { fontSize: 9, fontWeight: '600', color: colors.warningYellow },
  cabinTag: { backgroundColor: colors.primary + '12', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  cabinTagText: { fontSize: 10, fontWeight: '500', color: colors.primary },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  timeCol: { width: 65 },
  bigTime: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, flexShrink: 0 },
  airport: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  middle: { flex: 1, alignItems: 'center' },
  dur: { fontSize: 10, color: colors.textSecondary },
  line: { flexDirection: 'row', alignItems: 'center', width: '85%', marginVertical: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  dash: { flex: 1, height: 1.5, backgroundColor: colors.border },
  stopLabel: { fontSize: 10, color: colors.textSecondary },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  detailText: { fontSize: 11, color: colors.textSecondary },
  breakdownText: { fontSize: 10, color: colors.disabled, marginLeft: 'auto' },
  upgradeBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.successGreen + '10', borderRadius: 6, padding: 6, marginTop: spacing.xs },
  upgradeText: { fontSize: 11, color: colors.successGreen, flex: 1 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  price: { fontSize: 22, fontWeight: '700', color: colors.priceRed },
  bookBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 8, borderRadius: borderRadius.full },
  bookText: { fontSize: 13, fontWeight: '600', color: '#FFF' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  // Alerts
  alertBox: { marginTop: spacing.md, backgroundColor: colors.warningYellow + '08', borderRadius: borderRadius.lg, padding: spacing.md },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  alertTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  alertDate: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, width: 65 },
  alertInfo: { fontSize: 11, color: colors.textSecondary, flex: 1 },
  alertPrice: { fontSize: 15, fontWeight: '700', color: colors.priceRed },
  homeAlert: { marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.priceRed + '08', borderRadius: borderRadius.lg, padding: spacing.md },
  homeAlertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  // Date picker
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  datePicker: { backgroundColor: colors.background, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '65%' },
  datePickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  dateOpt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: 4 },
  dateOptOn: { backgroundColor: colors.primary, borderRadius: borderRadius.md },
  dateOptText: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  // Custom flight
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  inputLabel: { width: 70, fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  inputBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border },
  inputPlaceholder: { fontSize: 14, color: colors.disabled },
});

// 往返结果页样式
const rs = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  // 去程/返程 Tab
  columnTabs: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: colors.border },
  colTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  colTabActive: { borderBottomColor: colors.primary },
  colTabActiveRet: { borderBottomColor: '#E53935' },
  colTabText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  colTabTextActive: { color: colors.primary },
  colTabTextActiveRet: { color: '#E53935' },
  colTabSub: { fontSize: 11, color: colors.primary, marginTop: 2 },
  // 日期Tab
  dateTabs: { backgroundColor: colors.surface, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  dateTab: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 2, borderRadius: borderRadius.md },
  dateTabActive: { backgroundColor: colors.primary },
  dateTabDay: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  dateTabDayActive: { color: '#FFF' },
  dateTabWk: { fontSize: 10, color: colors.disabled, marginTop: 1 },
  dateTabWkActive: { color: 'rgba(255,255,255,0.8)' },
  // 紧凑航班卡片
  compactCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border },
  compactCardSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  compactRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  compactTime: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  compactAirport: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  compactBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compactAirline: { fontSize: 11, color: colors.textSecondary },
  compactMeta: { fontSize: 10, color: colors.disabled },
  compactPrice: { fontSize: 16, fontWeight: '700', color: colors.priceRed },
  // 底部栏
  bottomBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  totalPrice: { fontSize: 22, fontWeight: '700', color: colors.priceRed },
  totalLabel: { fontSize: 12, color: colors.textSecondary },
  nextBtn: { backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: borderRadius.full },
  nextBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
});

// 详情页样式
const ds = StyleSheet.create({
  flightHeader: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  headerAirline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  airlineName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  flightNoText: { fontSize: 13, color: colors.textSecondary },
  routeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  timeText: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  cityLabel: { fontSize: 13, fontWeight: '500', color: colors.textPrimary, marginTop: 2 },
  airportLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 1, textAlign: 'center', maxWidth: 90 },
  routeMiddle: { flex: 1, alignItems: 'center', marginHorizontal: spacing.md },
  durationText: { fontSize: 11, color: colors.textSecondary },
  routeLine: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 4 },
  routeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  routeDash: { flex: 1, height: 1.5, backgroundColor: colors.border },
  stopText: { fontSize: 11, color: colors.textSecondary },
  dateLabel: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: 0,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: colors.primary,
  },
  tabText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  // Options
  optionList: { padding: spacing.md, gap: spacing.sm },
  optionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadow.light,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  optionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  optionBadgeText: { fontSize: 12, fontWeight: '500' },
  cheapTag: {
    backgroundColor: colors.priceRed + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  cheapTagText: { fontSize: 10, fontWeight: '600', color: colors.priceRed },
  optionPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  optionPrice: { fontSize: 24, fontWeight: '700', color: colors.priceRed },
  optionPriceNote: { fontSize: 11, color: colors.textSecondary },
  selectBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  selectBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  breakdownRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  breakdownLabel: { fontSize: 11, color: colors.textSecondary },
});
