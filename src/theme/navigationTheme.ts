import { DefaultTheme } from '@react-navigation/native';
import { colors } from './colors';

export const flowNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: '#F2C15B',
  },
};

export const flowStackScreenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.primaryDark,
  headerTitleStyle: { color: colors.textPrimary, fontWeight: '800' as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
  animation: 'slide_from_right' as const,
};

export const flowTabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: '#91A39F',
  tabBarHideOnKeyboard: true,
  tabBarStyle: {
    marginHorizontal: 14,
    marginBottom: 10,
    height: 68,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 0,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.97)',
    shadowColor: '#0F2B27',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 10,
  },
  tabBarLabelStyle: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.2,
  },
};
