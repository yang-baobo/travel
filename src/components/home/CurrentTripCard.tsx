import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { useRouteStore } from '../../store/useRouteStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';

function EmptyTripJourney({ scale, onPress }: { scale: number; onPress: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(240);

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 3600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(progress, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const runnerX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, Math.max(8, trackWidth - 24)],
  });
  const runnerScale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.82, 1.12, 0.82],
  });
  const arrowX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 4] });

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.emptyJourneyPressable, pressed && styles.pressed]}>
      <LinearGradient colors={['#0B4E48', '#087E74', '#16A899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyJourneyGradient}>
        <View style={styles.emptyGlowLarge} />
        <View style={styles.emptyGlowSmall} />

        <View style={styles.emptyJourneyTop}>
          <View style={styles.emptyJourneyBadge}>
            <Ionicons name="sparkles" size={12} color="#F8D06B" />
            <Text style={styles.emptyJourneyKicker}>START A NEW JOURNEY</Text>
          </View>
          <Animated.View style={[styles.emptyJourneyArrow, { transform: [{ translateX: arrowX }] }]}>
            <Ionicons name="arrow-forward" size={16} color="#0A5B54" />
          </Animated.View>
        </View>

        <Text style={[styles.emptyJourneyTitle, { fontSize: 22 * scale }]}>从北京，画出第一条路线</Text>
        <Text style={[styles.emptyJourneySubtitle, { fontSize: 11 * scale }]}>把时间和偏好告诉 AI，沿途的惊喜会从这里生长。</Text>

        <View
          style={styles.routeTrack}
          onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.routeLine} />
          <View style={[styles.routePoint, styles.routePointStart]}><View style={styles.routePointCore} /></View>
          <View style={[styles.routePoint, styles.routePointMiddle]}><Ionicons name="location" size={10} color="#0B756B" /></View>
          <View style={[styles.routePoint, styles.routePointEnd]}><Ionicons name="flag" size={10} color="#0B756B" /></View>
          <Animated.View style={[styles.routeRunner, { transform: [{ translateX: runnerX }, { scale: runnerScale }] }]}>
            <Ionicons name="sparkles" size={10} color="#F8D06B" />
          </Animated.View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export default function CurrentTripCard({ elderlyMode, onPress }: { elderlyMode: boolean; onPress: () => void }) {
  const routeStops = useRouteStore(state => state.routeStops);
  const travelDays = useRouteStore(state => state.travelDays);
  const currentRouteId = useRouteStore(state => state.currentRouteId);
  const routeSource = useRouteStore(state => state.routeSource);
  const preferenceTravelDays = usePreferenceStore(state => state.travelDays);
  const preferenceGroupSize = usePreferenceStore(state => state.groupSize);

  const scale = elderlyMode ? 1.12 : 1;
  const hasTrip = routeStops.length > 0 || currentRouteId !== null;

  if (!hasTrip) {
    return <EmptyTripJourney scale={scale} onPress={onPress} />;
  }

  const stopCount = routeStops.length;
  const sourceLabel = routeSource === 'guide' ? '导游路线' : routeSource === 'system' ? '推荐路线' : '自定义路线';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.kicker, { fontSize: 10 * scale }]}>
            北京 · {travelDays || preferenceTravelDays}天{Math.max(0, (travelDays || preferenceTravelDays) - 1)}晚
          </Text>
          <Text style={[styles.day, { fontSize: 24 * scale }]}>
            {sourceLabel}
          </Text>
        </View>
        <View style={styles.next}>
          <Text style={styles.nextLabel}>共 {stopCount} 个地点</Text>
          <Text style={styles.nextName}>点击查看完整行程</Text>
        </View>
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={16} color="#FFF" />
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Ionicons name="people-outline" size={17} color={colors.primary} />
          <Text style={styles.statLabel}>出行人数</Text>
          <Text style={[styles.statValue, { fontSize: 13 * scale }]}>{preferenceGroupSize}人</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="calendar-outline" size={17} color={colors.primary} />
          <Text style={styles.statLabel}>旅行天数</Text>
          <Text style={[styles.statValue, { fontSize: 13 * scale }]}>{travelDays || preferenceTravelDays}天</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#0F2B27',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 4,
  },
  pressed: { transform: [{ scale: 0.985 }] },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  kicker: {
    color: colors.primary,
    fontWeight: '800',
    letterSpacing: 1,
  },
  day: {
    color: '#0F2B27',
    fontWeight: '900',
    marginTop: 4,
  },
  next: {
    flex: 1,
    marginLeft: 18,
    paddingLeft: 14,
    borderLeftWidth: 1,
    borderLeftColor: '#E5EEEB',
  },
  nextLabel: {
    color: '#82938F',
    fontSize: 10,
  },
  nextName: {
    color: '#0F2B27',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F0',
    gap: 12,
  },
  stat: {
    width: '45%',
    minHeight: 40,
  },
  statLabel: {
    color: '#82938F',
    fontSize: 10,
    marginTop: 4,
  },
  statValue: {
    color: '#304641',
    fontWeight: '800',
    marginTop: 2,
  },
  emptyJourneyPressable: {
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: '#087E74',
    shadowColor: '#0B514A',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 7,
  },
  emptyJourneyGradient: {
    minHeight: 176,
    paddingHorizontal: 20,
    paddingVertical: 18,
    overflow: 'hidden',
  },
  emptyGlowLarge: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -65,
    top: -88,
    backgroundColor: 'rgba(119,231,208,0.18)',
  },
  emptyGlowSmall: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    left: -28,
    bottom: -55,
    borderWidth: 18,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyJourneyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyJourneyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  emptyJourneyKicker: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.35,
  },
  emptyJourneyArrow: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  emptyJourneyTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    marginTop: 13,
    letterSpacing: -0.5,
  },
  emptyJourneySubtitle: {
    color: 'rgba(255,255,255,0.72)',
    marginTop: 5,
  },
  routeTrack: {
    position: 'relative',
    height: 38,
    marginTop: 12,
  },
  routeLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 19,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.38)',
  },
  routePoint: {
    position: 'absolute',
    top: 11,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D7FAF2',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  routePointStart: { left: 1 },
  routePointMiddle: { left: '48%' },
  routePointEnd: { right: 1 },
  routePointCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#0B756B',
  },
  routeRunner: {
    position: 'absolute',
    top: 11,
    left: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B514A',
    borderWidth: 1,
    borderColor: 'rgba(248,208,107,0.52)',
  },
});
