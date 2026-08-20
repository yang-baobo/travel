import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';

export default function GuideProfileScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="person-circle" size={48} color={colors.primary} />
        <Text style={styles.title}>个人中心 - 导游端</Text>
        <Text style={styles.subtitle}>管理个人信息与设置</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginTop: 16 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 8 },
});
