import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { useAuthStore } from '../../store/useAuthStore';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { login, error } = useAuthStore();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setIsLoading(true);
    await login(username.trim(), password.trim());
    setIsLoading(false);
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Top gradient header */}
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <SafeAreaView edges={['top']}>
              <View style={styles.headerContent}>
                <View style={styles.logoContainer}>
                  <Ionicons name="airplane" size={40} color="#FFF" />
                </View>
                <Text style={styles.appName}>深圳旅行通</Text>
                <Text style={styles.appSubtitle}>你的智能旅行规划助手</Text>
              </View>
            </SafeAreaView>
          </LinearGradient>

          {/* Login form card */}
          <View style={styles.formWrapper}>
            <View style={styles.formCard}>
              <Text style={styles.welcomeText}>欢迎回来</Text>
              <Text style={styles.welcomeSubtext}>登录以开始你的深圳之旅</Text>

              {/* Username input */}
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="请输入用户名"
                  placeholderTextColor={colors.disabled}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password input */}
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="请输入密码"
                  placeholderTextColor={colors.disabled}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {/* Error message */}
              {error ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color={colors.priceRed} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Login button */}
              <TouchableOpacity
                onPress={handleLogin}
                disabled={isLoading || !username.trim() || !password.trim()}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    !username.trim() || !password.trim()
                      ? [colors.disabled, colors.disabled]
                      : colors.gradient
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.loginButton}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.loginButtonText}>登 录</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Test accounts info */}
            <View style={styles.testAccountsContainer}>
              <Text style={styles.testAccountsTitle}>测试账号</Text>
              <View style={styles.testAccountsGrid}>
                <View style={styles.testAccountItem}>
                  <View style={[styles.roleBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={styles.roleBadgeText}>游客</Text>
                  </View>
                  <Text style={styles.testAccountText}>user1 / 123456</Text>
                </View>
                <View style={styles.testAccountItem}>
                  <View style={[styles.roleBadge, { backgroundColor: '#E8D5FF' }]}>
                    <Text style={[styles.roleBadgeText, { color: colors.accent }]}>导游</Text>
                  </View>
                  <Text style={styles.testAccountText}>guide1 / 123456</Text>
                </View>
                <View style={styles.testAccountItem}>
                  <View style={[styles.roleBadge, { backgroundColor: '#E8D5FF' }]}>
                    <Text style={[styles.roleBadgeText, { color: colors.accent }]}>导游</Text>
                  </View>
                  <Text style={styles.testAccountText}>guide2 / 123456</Text>
                </View>
                <View style={styles.testAccountItem}>
                  <View style={[styles.roleBadge, { backgroundColor: '#D5F5E3' }]}>
                    <Text style={[styles.roleBadgeText, { color: colors.successGreen }]}>管理</Text>
                  </View>
                  <Text style={styles.testAccountText}>admin1 / 123456</Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingBottom: spacing.xxxl + 20,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  appSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
  formWrapper: {
    flex: 1,
    marginTop: -spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    ...shadow.medium,
  },
  welcomeText: {
    ...typography.h1,
    marginBottom: spacing.xs,
  },
  welcomeSubtext: {
    ...typography.bodySmall,
    marginBottom: spacing.xxl,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    height: '100%',
  },
  eyeIcon: {
    padding: spacing.xs,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  errorText: {
    fontSize: 13,
    color: colors.priceRed,
    marginLeft: spacing.xs,
  },
  loginButton: {
    height: 52,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  testAccountsContainer: {
    marginTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  testAccountsTitle: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.md,
    color: colors.textSecondary,
  },
  testAccountsGrid: {
    gap: spacing.sm,
  },
  testAccountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadow.light,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginRight: spacing.md,
    minWidth: 44,
    alignItems: 'center',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  testAccountText: {
    ...typography.bodySmall,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: colors.textPrimary,
  },
});
