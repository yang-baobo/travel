import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { useFavoriteStore } from '../../store/useFavoriteStore';
import { useElderlyMode } from '../../theme/ElderlyModeContext';
import { ProfileStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<ProfileStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { hasSetPreferences, elderlyMode, setElderlyMode } = usePreferenceStore();
  const { scaleIcon } = useElderlyMode();
  const favStore = useFavoriteStore();
  const totalFavorites = favStore.favoriteAttractionIds.length + favStore.favoriteRouteIds.length
    + favStore.favoriteGuideIds.length + favStore.favoriteFlightIds.length
    + favStore.favoriteHotelIds.length + favStore.favoriteRestaurantIds.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <LinearGradient colors={colors.gradient} style={styles.header}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={48} color={colors.primary} />
            </View>
          </View>
          <Text style={styles.displayName}>旅行者</Text>
          <Text style={styles.username}>开启你的真实旅行</Text>
        </LinearGradient>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.prefItem} activeOpacity={0.7} onPress={() => navigation.navigate('TripProfile')}>
            <View style={[styles.prefIconWrap, { backgroundColor: '#7C3AED' }]}>
              <Ionicons name="shield-checkmark" size={scaleIcon(22)} color="#FFF" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <Text style={[typography.body, { fontWeight: '600' }]}>盲盒安全设置</Text>
              <Text style={typography.caption}>过敏、雷点、步行和夜间限制</Text>
            </View>
            <Ionicons name="chevron-forward" size={scaleIcon(18)} color={colors.disabled} />
          </TouchableOpacity>

          {/* 偏好设置 - 独立重要项 */}
          <TouchableOpacity style={styles.prefItem} activeOpacity={0.7} onPress={() => navigation.navigate('Preference')}>
            <View style={styles.prefIconWrap}>
              <Ionicons name="options" size={scaleIcon(22)} color="#FFF" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <Text style={[typography.body, { fontWeight: '600' }]}>偏好设置</Text>
              <Text style={typography.caption}>{hasSetPreferences ? '已设置，点击修改' : '尚未设置，点击配置旅行偏好'}</Text>
            </View>
            {!hasSetPreferences && (
              <View style={styles.prefBadge}><Text style={styles.prefBadgeText}>去设置</Text></View>
            )}
            <Ionicons name="chevron-forward" size={scaleIcon(18)} color={colors.disabled} />
          </TouchableOpacity>

          {/* 我的收藏 - 独立项 */}
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => navigation.navigate('Favorites')}>
            <Ionicons name="heart-outline" size={scaleIcon(22)} color={colors.priceRed} />
            <Text style={[typography.body, { flex: 1, marginLeft: spacing.lg }]}>我的收藏</Text>
            {totalFavorites > 0 && (
              <View style={styles.prefBadge}><Text style={styles.prefBadgeText}>{totalFavorites}</Text></View>
            )}
            <Ionicons name="chevron-forward" size={scaleIcon(18)} color={colors.disabled} />
          </TouchableOpacity>

          {/* 长辈模式开关 */}
          <View style={styles.menuItem}>
            <Ionicons name="accessibility" size={scaleIcon(22)} color={colors.secondary} />
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <Text style={[typography.body, { fontWeight: '500' }]}>长辈模式</Text>
              <Text style={typography.caption}>{elderlyMode ? '已开启 · 大字体高对比度' : '关闭'}</Text>
            </View>
            <Switch
              value={elderlyMode}
              onValueChange={setElderlyMode}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={elderlyMode ? colors.primary : '#f4f3f4'}
            />
          </View>

          {[
            { icon: 'time-outline', label: '浏览历史', color: colors.accent },
            { icon: 'settings-outline', label: '设置', color: colors.textSecondary },
            { icon: 'help-circle-outline', label: '帮助与反馈', color: colors.successGreen },
            { icon: 'information-circle-outline', label: '关于', color: colors.warningYellow },
          ].map((item, idx) => (
            <TouchableOpacity key={idx} style={styles.menuItem} activeOpacity={0.7}>
              <Ionicons name={item.icon as any} size={scaleIcon(22)} color={item.color} />
              <Text style={[typography.body, { flex: 1, marginLeft: spacing.lg }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={scaleIcon(18)} color={colors.disabled} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.border,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    marginTop: spacing.md,
  },
  username: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
  },
  menuSection: {
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    ...shadow.light,
  },
  prefItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
    ...shadow.light,
  },
  prefIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prefBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  prefBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
});
