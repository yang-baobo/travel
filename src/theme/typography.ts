import { TextStyle } from 'react-native';
import { usePreferenceStore } from '../store/usePreferenceStore';

const ELDERLY_FONT_SCALE = 1.35;
const ELDERLY_LINE_SCALE = 1.35;

type TypographyKey = 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'price' | 'priceSmall' | 'tag' | 'button';

// 基础颜色值（避免循环依赖，直接写值）
const TEXT_PRIMARY = '#1A1C2B';
const TEXT_PRIMARY_ELDERLY = '#000000';
const TEXT_SECONDARY = '#8A8FA8';
const TEXT_SECONDARY_ELDERLY = '#4A4A4A';
const PRICE_RED = '#E53935';

const BASE_TYPOGRAPHY: Record<TypographyKey, TextStyle> = {
  h1: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    lineHeight: 32,
  },
  h2: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    lineHeight: 28,
  },
  h3: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    color: TEXT_PRIMARY,
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400',
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400',
    color: TEXT_SECONDARY,
    lineHeight: 16,
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: PRICE_RED,
    lineHeight: 24,
  },
  priceSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: PRICE_RED,
    lineHeight: 20,
  },
  tag: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  button: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
};

function scaleStyle(style: TextStyle, isElderly: boolean): TextStyle {
  if (!isElderly) return style;
  const scaled: TextStyle = { ...style };
  if (scaled.fontSize) {
    scaled.fontSize = Math.round(scaled.fontSize * ELDERLY_FONT_SCALE);
  }
  if (scaled.lineHeight) {
    scaled.lineHeight = Math.round(scaled.lineHeight * ELDERLY_LINE_SCALE);
  }
  // 高对比度颜色
  if (scaled.color === TEXT_PRIMARY) {
    scaled.color = TEXT_PRIMARY_ELDERLY;
  } else if (scaled.color === TEXT_SECONDARY) {
    scaled.color = TEXT_SECONDARY_ELDERLY;
  }
  return scaled;
}

export const typography = new Proxy(BASE_TYPOGRAPHY, {
  get(target, prop: string) {
    if (prop in target) {
      const isElderly = usePreferenceStore.getState().elderlyMode;
      return scaleStyle(target[prop as TypographyKey], isElderly);
    }
    return undefined;
  },
}) as Record<TypographyKey, TextStyle>;
