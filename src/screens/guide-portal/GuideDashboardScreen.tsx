import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';

export default function GuideDashboardScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="map" size={48} color={colors.accent} />
        <Text style={styles.title}>我的路线 - 导游端</Text>
        <Text style={styles.subtitle}>管理你的旅行路线</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: colors.accent, marginTop: 16 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 8 },
});
