/**
 * 全局 AI 旅伴编排器：统一渲染呼吸 FAB、完整对话面板和路线迷你窗。
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAssistantStore } from '../../store/useAssistantStore';
import { useElderlyMode } from '../../theme/ElderlyModeContext';
import { useVoiceEngine } from '../../hooks/useVoiceEngine';
import FullPanelChat from './FullPanelChat';
import FloatingMiniChat from './FloatingMiniChat';

export default function VoiceAssistantOrchestrator() {
  const displayMode = useAssistantStore((state) => state.displayMode);
  const openAssistant = useAssistantStore((state) => state.openAssistant);
  const { isElderlyMode } = useElderlyMode();
  const voiceEngine = useVoiceEngine();
  const breathe = useRef(new Animated.Value(0)).current;
  const fabSize = isElderlyMode ? 72 : 62;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1800, useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1800, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [breathe]);

  if (displayMode === 'hidden') {
    const haloScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
    const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] });
    return (
      <View style={styles.fabDock} pointerEvents="box-none">
        <Animated.View style={[styles.halo, {
          width: fabSize,
          height: fabSize,
          borderRadius: fabSize / 2,
          opacity: haloOpacity,
          transform: [{ scale: haloScale }],
        }]} />
        <TouchableOpacity
          style={[styles.fab, { width: fabSize, height: fabSize, borderRadius: fabSize / 2 }]}
          onPress={openAssistant}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel="打开北京 AI 旅伴"
        >
          <LinearGradient colors={['#21C6B5', '#08766D']} style={styles.fabGradient}>
            <Ionicons name="sparkles" size={isElderlyMode ? 26 : 22} color="#FFFFFF" />
            <Text style={[styles.aiLabel, isElderlyMode && { fontSize: 10 }]}>AI</Text>
          </LinearGradient>
          <View style={styles.onlineDot} />
        </TouchableOpacity>
      </View>
    );
  }

  if (displayMode === 'full_panel') return <FullPanelChat voiceEngine={voiceEngine} />;
  if (displayMode === 'floating_mini') return <FloatingMiniChat voiceEngine={voiceEngine} />;
  return null;
}

const styles = StyleSheet.create({
  fabDock: { position: 'absolute', bottom: 94, right: 18, zIndex: 999, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', backgroundColor: '#21C6B5' },
  fab: {
    overflow: 'visible',
    shadowColor: '#0A514A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  fabGradient: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.42)' },
  aiLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: -1 },
  onlineDot: { position: 'absolute', right: 1, bottom: 4, width: 13, height: 13, borderRadius: 7, backgroundColor: '#F2C15B', borderWidth: 3, borderColor: '#FFFFFF' },
});
