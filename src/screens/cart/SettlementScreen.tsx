import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation, RouteProp, CommonActions } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ExploreStackParamList, CustomStackParamList } from '../../types';
import { useOrderStore } from '../../store/useOrderStore';
import { useRouteStore } from '../../store/useRouteStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { getAttractionById } from '../../data/attractions';
import { formatPrice, formatDays } from '../../utils/formatters';

type SettlementParams = ExploreStackParamList['Settlement'] | CustomStackParamList['Settlement'];

type Step = 'confirm' | 'payment' | 'done';

export default function SettlementScreen() {
  const route = useRoute<RouteProp<{ Settlement: SettlementParams }, 'Settlement'>>();
  const navigation = useNavigation<any>();
  const addOrder = useOrderStore(s => s.addOrder);
  const payOrder = useOrderStore(s => s.payOrder);
  const clearStops = useRouteStore(s => s.clearStops);

  const params = route.params;
  const groupSize = usePreferenceStore(s => s.groupSize);
  const [step, setStep] = useState<Step>('confirm');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [paying, setPaying] = useState(false);

  const attractions = params.attractionIds
    .map(id => getAttractionById(id))
    .filter(Boolean);

  // Step 1: Confirm order -> creates a 'pending' order
  const handleConfirmOrder = () => {
    const id = addOrder({
      title: params.orderTitle,
      routeType: params.routeType,
      routeId: 'routeId' in params ? (params as any).routeId : undefined,
      attractionIds: params.attractionIds,
      hotelId: 'hotelId' in params ? (params as any).hotelId : undefined,
      guideId: params.guideId,
      restaurantIds: 'restaurantIds' in params ? (params as any).restaurantIds : undefined,
      durationDays: params.durationDays,
      groupSize,
      totalPrice: params.totalPrice,
      status: 'pending',
    });
    // Clear cart if custom route
    if (params.routeType === 'custom') {
      clearStops();
    }
    setOrderId(id);
    setStep('payment');
  };

  // Step 2: Pay with password
  const handlePay = () => {
    if (password.length < 4) {
      Alert.alert('提示', '请输入至少4位支付密码');
      return;
    }
    if (!orderId) return;
    setPaying(true);
    setTimeout(() => {
      payOrder(orderId);
      setPaying(false);
      setStep('done');
    }, 800);
  };

  // Go back without paying (order stays as 'pending' in orders list with 15-min auto-cancel)
  const handlePayLater = () => {
    Alert.alert(
      '稍后支付',
      '订单已生成，15分钟内未支付将自动取消。\n你可以在"订单"页面继续支付。',
      [
        { text: '继续支付', style: 'cancel' },
        {
          text: '去订单页',
          onPress: () => {
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: '订单' }],
              })
            );
          },
        },
      ]
    );
  };

  const goToOrders = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: '订单' }],
      })
    );
  };

  // ==================== Done Screen ====================
  if (step === 'done') {
    return (
      <View style={styles.doneContainer}>
        <View style={styles.doneCircle}>
          <Ionicons name="checkmark" size={48} color="#FFF" />
        </View>
        <Text style={[typography.h1, { marginTop: spacing.xl, textAlign: 'center' }]}>
          支付成功
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
          订单已支付完成，祝你旅途愉快!
        </Text>
        <Text style={[typography.price, { marginTop: spacing.lg, fontSize: 28 }]}>
          {formatPrice(params.totalPrice)}
        </Text>

        <TouchableOpacity onPress={goToOrders} activeOpacity={0.8} style={{ marginTop: spacing.xxxl }}>
          <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>查看订单</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.popToTop()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={[typography.body, { color: colors.primary }]}>返回首页</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ==================== Payment Screen (Step 2) ====================
  if (step === 'payment') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Payment header */}
          <View style={styles.paymentHeader}>
            <View style={styles.paymentIconCircle}>
              <Ionicons name="lock-closed" size={28} color={colors.primary} />
            </View>
            <Text style={[typography.h1, { textAlign: 'center', marginTop: spacing.lg }]}>输入支付密码</Text>
            <Text style={[typography.bodySmall, { textAlign: 'center', marginTop: spacing.xs }]}>
              请输入密码完成支付（模拟支付，任意密码即可）
            </Text>
          </View>

          {/* Amount display */}
          <View style={styles.amountCard}>
            <Text style={typography.caption}>支付金额</Text>
            <Text style={styles.amountValue}>{formatPrice(params.totalPrice)}</Text>
            <Text style={[typography.caption, { marginTop: spacing.xs }]}>{params.orderTitle}</Text>
          </View>

          {/* Password input */}
          <View style={styles.card}>
            <TextInput
              style={styles.pwdInput}
              placeholder="请输入密码（至少4位）"
              placeholderTextColor={colors.disabled}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              maxLength={20}
              autoFocus
            />
          </View>

          {/* Countdown hint */}
          <View style={styles.hintRow}>
            <Ionicons name="information-circle-outline" size={16} color={colors.warningYellow} />
            <Text style={[typography.caption, { flex: 1 }]}>
              订单将在15分钟内未支付自动取消，请尽快完成支付
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={handlePayLater} style={styles.laterBtn} activeOpacity={0.7}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>稍后支付</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePay} activeOpacity={0.8} disabled={paying}>
            <LinearGradient
              colors={paying ? [colors.disabled, colors.disabled] : colors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.payBtn}
            >
              <Text style={styles.payBtnText}>{paying ? '支付中...' : '确认支付'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ==================== Confirm Screen (Step 1) ====================
  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={styles.stepActive}>
            <Text style={styles.stepActiveText}>1</Text>
          </View>
          <Text style={[typography.bodySmall, { color: colors.primary, fontWeight: '600' }]}>确认订单</Text>
          <View style={styles.stepLine} />
          <View style={styles.stepInactive}>
            <Text style={styles.stepInactiveText}>2</Text>
          </View>
          <Text style={typography.bodySmall}>支付</Text>
        </View>

        {/* Order Summary Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="receipt-outline" size={20} color={colors.primary} />
            <Text style={typography.h2}>订单摘要</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={typography.body}>订单名称</Text>
            <Text style={[typography.body, { fontWeight: '600', flex: 1, textAlign: 'right' }]} numberOfLines={1}>
              {params.orderTitle}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={typography.body}>路线类型</Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>
                {params.routeType === 'custom' ? '自定义' : params.routeType === 'guide' ? '导游路线' : '系统推荐'}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Text style={typography.body}>游玩天数</Text>
            <Text style={typography.body}>{formatDays(params.durationDays)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={typography.body}>景点数量</Text>
            <Text style={typography.body}>{params.attractionIds.length} 个</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={typography.body}>出行人数</Text>
            <Text style={typography.body}>{groupSize}人</Text>
          </View>
        </View>

        {/* Attractions List */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="location-outline" size={20} color={colors.accent} />
            <Text style={typography.h2}>包含景点</Text>
          </View>
          {attractions.map((attr, idx) => {
            if (!attr) return null;
            return (
              <View key={attr.id} style={styles.attractionRow}>
                <View style={styles.orderDot}>
                  <Text style={styles.orderDotText}>{idx + 1}</Text>
                </View>
                <Text style={[typography.body, { flex: 1 }]}>{attr.name}</Text>
                <Text style={typography.caption}>
                  {attr.ticketPrice === 0 ? '免费' : formatPrice(attr.ticketPrice)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Total Price */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="wallet-outline" size={20} color={colors.priceRed} />
            <Text style={typography.h2}>订单金额</Text>
          </View>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>应付总计</Text>
            <Text style={styles.priceValue}>{formatPrice(params.totalPrice)}</Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Confirm Bar */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={typography.caption}>应付</Text>
          <Text style={typography.price}>{formatPrice(params.totalPrice)}</Text>
        </View>
        <TouchableOpacity onPress={handleConfirmOrder} activeOpacity={0.8}>
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.payBtn}
          >
            <Text style={styles.payBtnText}>确认订单</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
  },
  // Step indicator
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
    paddingVertical: spacing.md,
  },
  stepActive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepActiveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  stepInactive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepInactiveText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.border,
  },
  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadow.light,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  typeBadge: {
    backgroundColor: `${colors.primary}18`,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  attractionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  orderDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderDotText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  priceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: `${colors.priceRed}08`,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
  },
  priceLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.priceRed,
  },
  // Payment screen
  paymentHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  paymentIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  amountCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadow.light,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.priceRed,
    marginTop: spacing.sm,
  },
  pwdInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    textAlign: 'center',
    letterSpacing: 4,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  laterBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  payBtn: {
    paddingHorizontal: spacing.xxxl,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
  },
  payBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  // Done state
  doneContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  doneCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.successGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtn: {
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: borderRadius.full,
  },
  doneBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
  backBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
});
