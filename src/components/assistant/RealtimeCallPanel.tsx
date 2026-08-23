import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRealtimeVoice } from '../../hooks/useRealtimeVoice';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export default function RealtimeCallPanel({ visible, onClose }: Props) {
  const session = useRealtimeVoice();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    void session.startCall();
  }, [visible]);

  useEffect(() => {
    if (!['user_speaking', 'assistant_speaking'].includes(session.status)) {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.12, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [session.status, pulse]);

  const close = async () => {
    await session.endCall();
    onClose();
  };

  const statusText = session.status === 'connecting' ? '正在连接 StepAudio 2.5…'
    : session.status === 'user_speaking' ? '我在听，你继续说'
    : session.status === 'assistant_speaking' ? '小猫正在回答'
    : session.status === 'listening' ? '已接通'
    : session.status === 'error' ? '连接失败'
    : '通话已结束';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>STEP AUDIO 2.5 REALTIME</Text>
            <Text style={styles.duration}>{formatDuration(session.durationSeconds)}</Text>
          </View>
          <TouchableOpacity onPress={close} style={styles.closeButton}>
            <Ionicons name="chevron-down" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <Animated.View style={[styles.avatarHalo, { transform: [{ scale: pulse }] }]}>
            <View style={styles.avatar}><Text style={styles.avatarText}>🐱</Text></View>
          </Animated.View>
          <Text style={styles.title}>北京旅行助手</Text>
          <Text style={styles.status}>{statusText}</Text>
          {session.error && <Text style={styles.error}>{session.error}</Text>}
        </View>

        <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
          {session.transcript.slice(-4).map(item => (
            <View key={item.id} style={styles.transcriptLine}>
              <Text style={styles.transcriptRole}>{item.role === 'user' ? '你' : '小猫'}</Text>
              <Text style={styles.transcriptText}>{item.text}</Text>
            </View>
          ))}
          {!!session.assistantDraft && (
            <View style={styles.transcriptLine}>
              <Text style={styles.transcriptRole}>小猫</Text>
              <Text style={[styles.transcriptText, { opacity: 0.65 }]}>{session.assistantDraft}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.control} onPress={session.toggleMute}>
            <View style={[styles.controlCircle, session.muted && styles.controlCircleActive]}>
              <Ionicons name={session.muted ? 'mic-off' : 'mic'} size={26} color="#fff" />
            </View>
            <Text style={styles.controlLabel}>{session.muted ? '取消静音' : '静音'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.control} onPress={close}>
            <View style={styles.hangupCircle}>
              <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </View>
            <Text style={styles.controlLabel}>结束</Text>
          </TouchableOpacity>
          <View style={styles.control}>
            <View style={styles.controlCircle}>
              <Ionicons name="volume-high" size={26} color="#fff" />
            </View>
            <Text style={styles.controlLabel}>扬声器</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101827', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 42 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#8EA3C6', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  duration: { color: '#DDE7F7', fontSize: 15, marginTop: 4, fontVariant: ['tabular-nums'] },
  closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#21304A', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', marginTop: 48 },
  avatarHalo: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#243B62', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#FFF6E9', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 56 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 22 },
  status: { color: '#AFC0DA', fontSize: 15, marginTop: 8 },
  error: { color: '#FFAAA5', fontSize: 13, textAlign: 'center', marginTop: 12, maxWidth: 310, lineHeight: 19 },
  transcript: { flex: 1, marginTop: 28 },
  transcriptContent: { paddingBottom: 12 },
  transcriptLine: { flexDirection: 'row', marginBottom: 12 },
  transcriptRole: { color: '#7894BE', width: 42, fontSize: 13, fontWeight: '700' },
  transcriptText: { color: '#DCE7F8', flex: 1, fontSize: 14, lineHeight: 21 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 16 },
  control: { width: 84, alignItems: 'center' },
  controlCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#2A3952', alignItems: 'center', justifyContent: 'center' },
  controlCircleActive: { backgroundColor: '#526987' },
  hangupCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#E84B4B', alignItems: 'center', justifyContent: 'center' },
  controlLabel: { color: '#D7E1F1', fontSize: 12, marginTop: 9 },
});
