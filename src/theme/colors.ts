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

/** 与北京首页一致的全局视觉色板。 */
const BASE_COLORS: ColorsType = {
  primary: '#0E9F93',
  primaryLight: '#8DD8CB',
  primaryDark: '#0A6F66',
  secondary: '#2A7F76',
  accent: '#6E58A5',

  priceRed: '#D65B55',
  successGreen: '#258A68',
  warningYellow: '#D8A33B',

  background: '#F3F7F5',
  surface: '#FFFFFF',
  textPrimary: '#0F2B27',
  textSecondary: '#617571',
  border: '#DDE7E4',
  disabled: '#AAB8B4',

  gradient: ['#17BCAA', '#08766D'] as [string, string],

  ticket: '#0E9F93',
  transport: '#6E58A5',
  food: '#C9853E',
  hotel: '#2A8E86',
  guide: '#0A6F66',
  flight: '#B55468',
  other: '#71827F',
};

const ELDERLY_OVERRIDES: Partial<ColorsType> = {
  textPrimary: '#071C19',
  textSecondary: '#344A46',
  border: '#9EAEAA',
  disabled: '#788984',
  primary: '#08766D',
  primaryDark: '#075A53',
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
