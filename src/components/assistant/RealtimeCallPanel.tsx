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
  onComplete?: (transcript: Array<{ role: 'user' | 'assistant'; text: string }>) => void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export default function RealtimeCallPanel({ visible, onClose, onComplete }: Props) {
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
    onComplete?.(session.transcript);
    onClose();
  };

  const statusText = session.status === 'connecting' ? '正在连接 StepAudio 2.5…'
    : session.status === 'user_speaking' ? '我在听，你继续说'
    : session.status === 'assistant_speaking' ? 'AI 旅伴正在回答'
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
            <View style={styles.avatar}><Ionicons name="sparkles" size={48} color="#FFFFFF" /><Text style={styles.avatarText}>AI TRAVEL</Text></View>
          </Animated.View>
          <Text style={styles.title}>北京旅行助手</Text>
          <Text style={styles.status}>{statusText}</Text>
          {session.error && <Text style={styles.error}>{session.error}</Text>}
        </View>

        <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
          {session.transcript.slice(-4).map(item => (
            <View key={item.id} style={styles.transcriptLine}>
              <Text style={styles.transcriptRole}>{item.role === 'user' ? '你' : '旅伴'}</Text>
              <Text style={styles.transcriptText}>{item.text}</Text>
            </View>
          ))}
          {!!session.assistantDraft && (
            <View style={styles.transcriptLine}>
              <Text style={styles.transcriptRole}>旅伴</Text>
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
  container: { flex: 1, backgroundColor: '#082F2B', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 42 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#6FE0CD', fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  duration: { color: 'rgba(255,255,255,0.78)', fontSize: 15, marginTop: 5, fontVariant: ['tabular-nums'] },
  closeButton: { width: 44, height: 44, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', marginTop: 48 },
  avatarHalo: { width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(33,198,181,0.14)', borderWidth: 1, borderColor: 'rgba(111,224,205,0.24)', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 116, height: 116, borderRadius: 40, backgroundColor: '#0E9F93', alignItems: 'center', justifyContent: 'center', shadowColor: '#21C6B5', shadowOpacity: 0.34, shadowRadius: 24 },
  avatarText: { color: 'rgba(255,255,255,0.72)', fontSize: 8, fontWeight: '900', letterSpacing: 1.3, marginTop: 5 },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 24 },
  status: { color: '#8DD8CB', fontSize: 15, marginTop: 8 },
  error: { color: '#FFB5AE', fontSize: 13, textAlign: 'center', marginTop: 12, maxWidth: 310, lineHeight: 19 },
  transcript: { flex: 1, marginTop: 30 },
  transcriptContent: { padding: 16, paddingBottom: 12, backgroundColor: 'rgba(255,255,255,0.055)', borderRadius: 24 },
  transcriptLine: { flexDirection: 'row', marginBottom: 13 },
  transcriptRole: { color: '#6FE0CD', width: 46, fontSize: 12, fontWeight: '800' },
  transcriptText: { color: 'rgba(255,255,255,0.82)', flex: 1, fontSize: 14, lineHeight: 21 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 18 },
  control: { width: 84, alignItems: 'center' },
  controlCircle: { width: 60, height: 60, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.11)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  controlCircleActive: { backgroundColor: '#0E9F93' },
  hangupCircle: { width: 70, height: 70, borderRadius: 25, backgroundColor: '#D65B55', alignItems: 'center', justifyContent: 'center' },
  controlLabel: { color: 'rgba(255,255,255,0.76)', fontSize: 12, marginTop: 9 },
});
