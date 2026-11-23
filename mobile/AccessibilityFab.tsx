import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessibility } from './useAccessibility';

export function AccessibilityFab() {
  const insets = useSafeAreaInsets();
  const { openModal, darkMode, scaleFont } = useAccessibility();

  return (
    <View
      pointerEvents='box-none'
      style={[
        styles.container,
        {
          bottom: Math.max(insets.bottom, 16) + 72,
        },
      ]}
    >
      <Pressable
        accessibilityRole='button'
        accessibilityLabel='Open accessibility display options and screen reader settings'
        onPress={openModal}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: darkMode ? '#e07060' : '#9a3d2b',
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[styles.iconText, { fontSize: scaleFont(20) }]} accessible={false}>
          {"\u267F"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    zIndex: 9999,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  iconText: {
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
  },
});
