import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { ElderlyModeProvider } from './src/theme/ElderlyModeContext';
import { usePreferenceStore } from './src/store/usePreferenceStore';

function AppContent() {
  const elderlyMode = usePreferenceStore(s => s.elderlyMode);

  return (
    <ElderlyModeProvider>
      <SafeAreaProvider key={elderlyMode ? 'elderly' : 'normal'}>
        <AppNavigator />
      </SafeAreaProvider>
    </ElderlyModeProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppContent />
    </GestureHandlerRootView>
  );
}
