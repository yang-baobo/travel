import { usePreferenceStore } from '../store/usePreferenceStore';

type ColorsType = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  priceRed: string;
  successGreen: string;
  warningYellow: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  disabled: string;
  gradient: [string, string];
  ticket: string;
  transport: string;
  food: string;
  hotel: string;
  guide: string;
  flight: string;
  other: string;
};

const BASE_COLORS: ColorsType = {
  primary: '#1A73E8',
  primaryLight: '#8AB4F8',
  primaryDark: '#1557B0',
  secondary: '#00ACC1',
  accent: '#6C5CE7',

  priceRed: '#E53935',
  successGreen: '#00C853',
  warningYellow: '#FF9800',

  background: '#F5F7FA',
  surface: '#FFFFFF',
  textPrimary: '#1A1C2B',
  textSecondary: '#8A8FA8',
  border: '#E4E7ED',
  disabled: '#C5C9D4',

  gradient: ['#1A73E8', '#4FC3F7'] as [string, string],

  ticket: '#1A73E8',
  transport: '#6C5CE7',
  food: '#FF9800',
  hotel: '#00ACC1',
  guide: '#1557B0',
  flight: '#E91E63',
  other: '#8A8FA8',
};

const ELDERLY_OVERRIDES: Partial<ColorsType> = {
  textPrimary: '#000000',
  textSecondary: '#4A4A4A',
  border: '#BABABA',
  disabled: '#888888',
  primary: '#0D47A1',
  primaryDark: '#0A3576',
};

export const colors = new Proxy(BASE_COLORS, {
  get(target, prop: string) {
    if (prop in target) {
      const isElderly = usePreferenceStore.getState().elderlyMode;
      if (isElderly && prop in ELDERLY_OVERRIDES) {
        return (ELDERLY_OVERRIDES as any)[prop];
      }
      return (target as any)[prop];
    }
    return undefined;
  },
}) as ColorsType;
