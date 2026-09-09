import React from 'react';
import { Stack } from 'expo-router';
import SettingsScreen from '../../src/components/SettingsScreen';

export default function TrainerSettings() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SettingsScreen />
    </>
  );
}
