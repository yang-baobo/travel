import React, { createContext, useContext, useMemo } from 'react';
import { usePreferenceStore } from '../store/usePreferenceStore';

const FONT_SCALE = 1.35;
const ICON_SCALE = 1.3;

interface ElderlyModeContextValue {
  isElderlyMode: boolean;
  fontScale: number;
  iconScale: number;
  scaleFont: (base: number) => number;
  scaleIcon: (base: number) => number;
}

const ElderlyModeContext = createContext<ElderlyModeContextValue>({
  isElderlyMode: false,
  fontScale: 1,
  iconScale: 1,
  scaleFont: (n) => n,
  scaleIcon: (n) => n,
});

export function ElderlyModeProvider({ children }: { children: React.ReactNode }) {
  const elderlyMode = usePreferenceStore(s => s.elderlyMode);

  const value = useMemo<ElderlyModeContextValue>(() => ({
    isElderlyMode: elderlyMode,
    fontScale: elderlyMode ? FONT_SCALE : 1,
    iconScale: elderlyMode ? ICON_SCALE : 1,
    scaleFont: (base: number) => elderlyMode ? Math.round(base * FONT_SCALE) : base,
    scaleIcon: (base: number) => elderlyMode ? Math.round(base * ICON_SCALE) : base,
  }), [elderlyMode]);

  return (
    <ElderlyModeContext.Provider value={value}>
      {children}
    </ElderlyModeContext.Provider>
  );
}

export function useElderlyMode() {
  return useContext(ElderlyModeContext);
}
