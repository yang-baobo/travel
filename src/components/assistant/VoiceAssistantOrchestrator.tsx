/**
 * 小猫助手编排器 — 根据 displayMode 切换渲染 FAB / FullPanel / FloatingMini
 * 挂载在 AppNavigator 层，全局唯一
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  Animated,
  StyleSheet,
} from 'react-native';
import { useAssistantStore } from '../../store/useAssistantStore';
import { useElderlyMode } from '../../theme/ElderlyModeContext';
import { useVoiceEngine } from '../../hooks/useVoiceEngine';
import { colors } from '../../theme/colors';
import FullPanelChat from './FullPanelChat';
import FloatingMiniChat from './FloatingMiniChat';

export default function VoiceAssistantOrchestrator() {
  const displayMode = useAssistantStore((s) => s.displayMode);
  const openAssistant = useAssistantStore((s) => s.openAssistant);
  const { isElderlyMode } = useElderlyMode();

  const voiceEngine = useVoiceEngine();

  const fabSize = isElderlyMode ? 68 : 56;

  // FAB 按钮（idle 时显示）
  if (displayMode === 'hidden') {
    return (
      <TouchableOpacity
        style={[
          styles.fab,
          {
            width: fabSize,
            height: fabSize,
            borderRadius: fabSize / 2,
          },
        ]}
        onPress={openAssistant}
        activeOpacity={0.8}
      >
        <Text style={{ fontSize: isElderlyMode ? 32 : 26 }}>🐱</Text>
      </TouchableOpacity>
    );
  }

  // 全面板模式（collecting / generating）
  if (displayMode === 'full_panel') {
    return <FullPanelChat voiceEngine={voiceEngine} />;
  }

  // 悬浮迷你模式（presenting / adjusting）
  if (displayMode === 'floating_mini') {
    return <FloatingMiniChat voiceEngine={voiceEngine} />;
  }

  return null;
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 999,
  },
});
