import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList, Attraction, Guide } from '../../types';
import { attractions } from '../../data/attractions';
import { systemRoutes } from '../../data/systemRoutes';
import { guideRoutes } from '../../data/guideRoutes';
import { guides } from '../../data/guides';
import { useRouteStore } from '../../store/useRouteStore';
import { formatPrice, getZoneName } from '../../utils/formatters';
import UnifiedExploreScreen from './UnifiedExploreScreen';

type Nav = NativeStackNavigationProp<ExploreStackParamList, 'ExploreMain'>;
type Params = RouteProp<ExploreStackParamList, 'ExploreMain'>;
type TabKey = 'attractions' | 'routes' | 'guides';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'attractions', label: '景点', icon: 'compass' },
  { key: 'routes', label: '路线', icon: 'map' },
  { key: 'guides', label: '导游', icon: 'people' },
];

const STYLE_OPTIONS = ['全部', '主题乐园', '自然', '文化', '历史', '休闲', '海滩', '购物', '美食', '艺术', '冒险'];
const DAYS_OPTIONS = ['全部', '1天', '2天', '3天', '5天'];
const PEOPLE_OPTIONS = ['全部', '1人', '2人', '3-4人', '5人以上'];
const LANG_OPTIONS = ['全部', '普通话', '粤语', '英语', '日语', '韩语'];
const EXP_OPTIONS = ['全部', '3年以下', '3-8年', '8年以上'];
const ZONE_OPTIONS = ['全部', '南山区', '福田区', '罗湖区', '龙岗区', '盐田/大鹏', '宝安区'];

const { width: SW } = Dimensions.get('window');

/**
 * The public ExploreMain route now uses the real, provider-backed catalog.
 * The legacy route/guide implementation below is retained for compatibility
 * with older deep links until those screens are migrated separately.
 */
export default function ExploreMainScreen() {
  return <UnifiedExploreScreen />;
}

function LegacyExploreMainScreen() {
  const route = useRoute<Params>();
  const navigation = useNavigation<Nav>();
  const { addStop, removeStop, routeStops } = useRouteStore();

  const [activeTab, setActiveTab] = useState<TabKey>('attractions');
  const [filterVisible, setFilterVisible] = useState(false);

  // Attraction filters
  const [attrStyle, setAttrStyle] = useState('全部');
  const [attrZone, setAttrZone] = useState('全部');
  // Route filters
  const [routeDays, setRouteDays] = useState('全部');
  const [routeStyle, setRouteStyle] = useState('全部');
  // Guide filters
  const [guideLang, setGuideLang] = useState('全部');
  const [guideExp, setGuideExp] = useState('全部');
  const [guideZone, setGuideZone] = useState('全部');

  const filteredAttractions = useMemo(() => {
    let list = [...attractions];
    if (attrStyle !== '全部') list = list.filter(a => a.category.some(c => c.includes(attrStyle)) || a.tags.some(t => t.includes(attrStyle)));
    if (attrZone !== '全部') {
      const zoneMap: Record<string, string> = { '南山区': 'A', '福田区': 'B', '罗湖区': 'C', '龙岗区': 'D', '盐田/大鹏': 'E', '宝安区': 'F' };
      list = list.filter(a => a.zone === zoneMap[attrZone]);
    }
    return list;
  }, [attrStyle, attrZone]);

  const allRoutes = useMemo(() => {
    const sys = systemRoutes.map(r => ({ ...r, routeType: 'system' as const }));
    const grd = guideRoutes.map(r => ({ ...r, routeType: 'guide' as const }));
    let list = [...sys, ...grd];
    if (routeDays !== '全部') {
      const d = parseInt(routeDays);
      if (!isNaN(d)) list = list.filter(r => r.durationDays === d);
    }
    if (routeStyle !== '全部') list = list.filter(r => r.tags.some(t => t.includes(routeStyle)));
    return list;
  }, [routeDays, routeStyle]);

  const filteredGuides = useMemo(() => {
    let list = [...guides];
    if (guideLang !== '全部') list = list.filter(g => g.languages.includes(guideLang));
    if (guideExp !== '全部') {
      if (guideExp === '3年以下') list = list.filter(g => g.yearsOfExperience < 3);
      else if (guideExp === '3-8年') list = list.filter(g => g.yearsOfExperience >= 3 && g.yearsOfExperience <= 8);
      else list = list.filter(g => g.yearsOfExperience > 8);
    }
    if (guideZone !== '全部') list = list.filter(g => g.specialtyAreas.some(a => a.includes(guideZone)));
    return list;
  }, [guideLang, guideExp, guideZone]);

  const isInRoute = (id: string) => routeStops.some(s => s.attractionId === id);

  const handleToggleRoute = useCallback((item: Attraction) => {
    if (isInRoute(item.id)) { removeStop(item.id); }
    else { addStop({ attractionId: item.id, order: routeStops.length, day: 1, arrivalTime: '09:00', stayDuration: item.estimatedDuration * 60, transportToNext: null }); }
  }, [routeStops]);

  const getActiveFilterCount = () => {
    if (activeTab === 'attractions') return (attrStyle !== '全部' ? 1 : 0) + (attrZone !== '全部' ? 1 : 0);
    if (activeTab === 'routes') return (routeDays !== '全部' ? 1 : 0) + (routeStyle !== '全部' ? 1 : 0);
    return (guideLang !== '全部' ? 1 : 0) + (guideExp !== '全部' ? 1 : 0) + (guideZone !== '全部' ? 1 : 0);
  };

  const clearFilters = () => {
    setAttrStyle('全部'); setAttrZone('全部');
    setRouteDays('全部'); setRouteStyle('全部');
    setGuideLang('全部'); setGuideExp('全部'); setGuideZone('全部');
  };

  const renderFilterChips = (label: string, options: string[], value: string, setter: (v: string) => void) => (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.filterChips}>
        {options.map(opt => (
          <TouchableOpacity key={opt} style={[styles.fChip, value === opt && styles.fChipActive]} onPress={() => setter(opt)}>
            <Text style={[styles.fChipText, value === opt && styles.fChipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderFilterModal = () => (
    <Modal visible={filterVisible} transparent animationType="fade" onRequestClose={() => setFilterVisible(false)}>
      <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setFilterVisible(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.filterPanel} onPress={() => {}}>
          <View style={styles.filterHeader}>
            <Text style={typography.h3}>筛选条件</Text>
            <TouchableOpacity onPress={clearFilters}>
              <Text style={[typography.bodySmall, { color: colors.priceRed }]}>重置</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
            {activeTab === 'attractions' && (
              <>
                {renderFilterChips('旅行风格', STYLE_OPTIONS, attrStyle, setAttrStyle)}
                {renderFilterChips('区域', ZONE_OPTIONS, attrZone, setAttrZone)}
              </>
            )}
            {activeTab === 'routes' && (
              <>
                {renderFilterChips('游玩天数', DAYS_OPTIONS, routeDays, setRouteDays)}
                {renderFilterChips('路线风格', STYLE_OPTIONS.slice(0, 7), routeStyle, setRouteStyle)}
              </>
            )}
            {activeTab === 'guides' && (
              <>
                {renderFilterChips('语言', LANG_OPTIONS, guideLang, setGuideLang)}
                {renderFilterChips('经验', EXP_OPTIONS, guideExp, setGuideExp)}
                {renderFilterChips('擅长区域', ZONE_OPTIONS, guideZone, setGuideZone)}
              </>
            )}
          </ScrollView>
          <TouchableOpacity style={styles.filterApply} onPress={() => setFilterVisible(false)} activeOpacity={0.8}>
            <Text style={styles.filterApplyText}>确定</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  const renderAttractionItem = ({ item }: { item: Attraction }) => {
    const added = isInRoute(item.id);
    return (
      <TouchableOpacity style={styles.listCard} activeOpacity={0.8} onPress={() => navigation.navigate('AttractionDetail', { attractionId: item.id })}>
        <Image source={{ uri: item.imageUrl }} style={styles.listImg} />
        <TouchableOpacity style={[styles.addBtn, added && styles.addBtnActive]} onPress={() => handleToggleRoute(item)}>
          <Ionicons name={added ? 'checkmark' : 'add'} size={18} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.listBody}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={typography.body} numberOfLines={1}>{item.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="star" size={12} color={colors.warningYellow} />
              <Text style={{ fontSize: 12, fontWeight: '600' }}>{item.rating}</Text>
            </View>
          </View>
          <Text style={[typography.caption, { marginTop: 2 }]} numberOfLines={1}>{item.description}</Text>
          <View style={styles.listFooter}>
            <Text style={[typography.caption, { color: colors.accent }]}>{getZoneName(item.zone)} | {item.estimatedDuration}h</Text>
            <Text style={typography.priceSmall}>{item.ticketPrice === 0 ? '免费' : formatPrice(item.ticketPrice)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRouteItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.listCard} activeOpacity={0.8} onPress={() => navigation.navigate('PresetRouteDetail', { routeId: item.id, routeType: item.routeType })}>
      <Image source={{ uri: item.coverImage }} style={styles.listImg} />
      <View style={styles.routeTypeBadge}>
        <Text style={styles.routeTypeText}>{item.routeType === 'guide' ? '导游' : '系统'}</Text>
      </View>
      <View style={styles.listBody}>
        <Text style={typography.body} numberOfLines={1}>{item.title}</Text>
        <Text style={[typography.caption, { marginTop: 2 }]} numberOfLines={1}>{item.description}</Text>
        <View style={styles.listFooter}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {item.tags.slice(0, 3).map((t: string) => (
              <View key={t} style={styles.miniTag}><Text style={styles.miniTagText}>{t}</Text></View>
            ))}
          </View>
          <Text style={typography.caption}>{item.durationDays}天</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderGuideItem = ({ item }: { item: Guide }) => (
    <TouchableOpacity style={styles.guideItem} activeOpacity={0.8} onPress={() => navigation.navigate('GuideDetail', { guideId: item.id })}>
      <Image source={{ uri: item.avatar }} style={styles.guideAvatar} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={typography.body}>{item.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="star" size={12} color={colors.warningYellow} />
            <Text style={{ fontSize: 12, fontWeight: '600' }}>{item.rating}</Text>
          </View>
        </View>
        <Text style={[typography.caption, { marginTop: 2 }]}>{item.yearsOfExperience}年经验 | {item.languages.join('/')}</Text>
        <Text style={[typography.caption, { marginTop: 2 }]}>{item.specialtyAreas.join(', ')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={typography.priceSmall}>{formatPrice(item.perDayPrice)}/天</Text>
        {item.routeIds.length > 0 && <Text style={[typography.caption, { color: colors.primary }]}>{item.routeIds.length}条路线</Text>}
      </View>
    </TouchableOpacity>
  );

  const filterCount = getActiveFilterCount();

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={[styles.tab, activeTab === tab.key && styles.tabActive]} onPress={() => setActiveTab(tab.key)}>
            <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
        {/* Filter Button */}
        <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)}>
          <Ionicons name="filter" size={16} color={filterCount > 0 ? colors.primary : colors.textSecondary} />
          <Text style={[styles.filterBtnText, filterCount > 0 && { color: colors.primary }]}>筛选</Text>
          {filterCount > 0 && <View style={styles.filterDot}><Text style={styles.filterDotText}>{filterCount}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* List */}
      {activeTab === 'attractions' && (
        <FlatList data={filteredAttractions} renderItem={renderAttractionItem} keyExtractor={i => i.id} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
          ListHeaderComponent={routeStops.length > 0 ? <View style={styles.cartBanner}><Ionicons name="bag-handle" size={14} color={colors.primary} /><Text style={[typography.caption, { color: colors.primary }]}>已收藏 {routeStops.length} 个景点</Text></View> : null}
          ListEmptyComponent={<View style={styles.emptyBox}><Ionicons name="search" size={48} color={colors.disabled} /><Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>没有匹配的景点</Text></View>}
        />
      )}
      {activeTab === 'routes' && (
        <FlatList data={allRoutes} renderItem={renderRouteItem} keyExtractor={i => i.id} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<View style={styles.emptyBox}><Ionicons name="search" size={48} color={colors.disabled} /><Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>没有匹配的路线</Text></View>}
        />
      )}
      {activeTab === 'guides' && (
        <FlatList data={filteredGuides} renderItem={renderGuideItem} keyExtractor={i => i.id} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<View style={styles.emptyBox}><Ionicons name="search" size={48} color={colors.disabled} /><Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>没有匹配的导游</Text></View>}
        />
      )}

      {renderFilterModal()}

      {/* 侧边浮动"生成路线"按钮 */}
      {routeStops.length > 0 && (
        <TouchableOpacity
          style={styles.floatingBtn}
          activeOpacity={0.85}
          onPress={() => {
            const parent = navigation.getParent();
            if (parent) parent.navigate('自定义');
          }}
        >
          <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.floatingBtnGradient}>
            <Ionicons name="map-outline" size={20} color="#FFF" />
            <Text style={styles.floatingBtnText}>生成{'\n'}路线</Text>
            <View style={styles.floatingBadge}>
              <Text style={styles.floatingBadgeText}>{routeStops.length}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: spacing.xs },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.md, borderRadius: borderRadius.full },
  tabActive: { backgroundColor: `${colors.primary}15` },
  tabText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '600' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  filterBtnText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  filterDot: { backgroundColor: colors.primary, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  filterDotText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  listContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  // Cards
  listCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, overflow: 'hidden', ...shadow.light },
  listImg: { width: '100%', height: 140, backgroundColor: colors.border },
  listBody: { padding: spacing.lg },
  listFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  addBtn: { position: 'absolute', top: spacing.sm, right: spacing.sm, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  addBtnActive: { backgroundColor: colors.primary },
  routeTypeBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm, backgroundColor: colors.accent, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  routeTypeText: { fontSize: 10, fontWeight: '600', color: '#FFF' },
  miniTag: { backgroundColor: `${colors.primary}12`, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  miniTagText: { fontSize: 10, fontWeight: '500', color: colors.primary },
  // Guide
  guideItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, ...shadow.light },
  guideAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.border, marginRight: spacing.md },
  // Filter modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-start' },
  filterPanel: { backgroundColor: colors.surface, marginTop: 90, marginHorizontal: 0, borderBottomLeftRadius: borderRadius.xl, borderBottomRightRadius: borderRadius.xl, padding: spacing.xl, ...shadow.medium },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  filterGroup: { marginBottom: spacing.lg },
  filterLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.sm },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  fChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  fChipText: { fontSize: 13, color: colors.textPrimary },
  fChipTextActive: { color: '#FFF', fontWeight: '600' },
  filterApply: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: borderRadius.full, alignItems: 'center', marginTop: spacing.md },
  filterApplyText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  cartBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: `${colors.primary}12`, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.sm },
  emptyBox: { alignItems: 'center', paddingVertical: spacing.xxxl * 2 },
  // 侧边浮动按钮
  floatingBtn: { position: 'absolute', right: spacing.lg, bottom: 100, borderRadius: borderRadius.lg, ...shadow.medium },
  floatingBtnGradient: { width: 52, paddingVertical: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center', gap: 4 },
  floatingBtnText: { fontSize: 11, fontWeight: '700', color: '#FFF', textAlign: 'center', lineHeight: 14 },
  floatingBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.priceRed, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  floatingBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
});
