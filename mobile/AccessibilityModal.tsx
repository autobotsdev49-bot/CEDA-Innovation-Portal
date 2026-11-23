import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedModalBackdrop, FrostedSurface } from './FrostedGlass';
import { MobileIcon } from './AdminOverview';
import { useAccessibility, type MobileFontSizeMode } from './useAccessibility';
import { buttonCornerRadius } from './theme';

export function AccessibilityModal() {
  const insets = useSafeAreaInsets();
  const {
    darkMode,
    toggleDarkMode,
    fontSize,
    setFontSize,
    scaleFont,
    talkbackEnabled,
    toggleTalkback,
    highContrast,
    toggleHighContrast,
    announce,
    isModalOpen,
    closeModal,
  } = useAccessibility();

  if (!isModalOpen) return null;

  const fontOptions: { id: MobileFontSizeMode; label: string; hint: string }[] = [
    { id: 'sm', label: 'A-', hint: 'Small text (88%)' },
    { id: 'default', label: 'A', hint: 'Standard text (100%)' },
    { id: 'lg', label: 'A+', hint: 'Large text (115%)' },
    { id: 'xl', label: 'A++', hint: 'Extra large text (130%)' },
    { id: 'xxl', label: 'A+++', hint: 'Maximum text (145%)' },
  ];

  const bgColor = darkMode ? '#1a1510' : '#ffffff';
  const textColor = darkMode ? '#f0e8e0' : '#192c40';
  const mutedColor = darkMode ? '#b8a898' : '#66717e';
  const cardBorder = darkMode ? 'rgba(240, 220, 200, 0.12)' : 'rgba(36, 28, 25, 0.08)';
  const rustColor = '#9a3d2b';

  return (
    <Modal visible={isModalOpen} transparent statusBarTranslucent animationType='fade' onRequestClose={closeModal}>
      <FrostedModalBackdrop>
        <View style={styles.backdrop}>
          <Pressable accessibilityRole='button' accessibilityLabel='Close accessibility controls' onPress={closeModal} style={StyleSheet.absoluteFill} />

          <View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                backgroundColor: bgColor,
                paddingBottom: Math.max(insets.bottom, 20),
                borderColor: cardBorder,
              },
            ]}
          >
            <FrostedSurface variant='sheet' />
            <View style={[styles.header, { borderBottomColor: cardBorder }]}>
              <View style={styles.headerTitleWrap}>
                <View style={[styles.headerIconWrap, { backgroundColor: darkMode ? '#2e1c18' : '#fbede8' }]}>
                  <MobileIcon name='shield' color={rustColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text accessibilityRole='header' style={[styles.title, { color: textColor, fontSize: scaleFont(18) }]}>
                    Accessibility & Display
                  </Text>
                  <Text style={[styles.subtitle, { color: mutedColor, fontSize: scaleFont(13) }]}>
                    Personalize your view across all CEDA features
                  </Text>
                </View>
              </View>

              <Pressable
                accessibilityRole='button'
                accessibilityLabel='Close accessibility panel'
                onPress={closeModal}
                style={[styles.closeBtn, { backgroundColor: darkMode ? '#2e2416' : '#f4efe9' }]}
              >
                <MobileIcon name='close' color={textColor} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              <View style={[styles.row, { borderColor: cardBorder }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.rowTitle, { color: textColor, fontSize: scaleFont(15) }]}>Dark appearance</Text>
                  <Text style={[styles.rowSub, { color: mutedColor, fontSize: scaleFont(12) }]}>
                    High contrast dark theme for low-light comfort
                  </Text>
                </View>
                <Switch
                  value={darkMode}
                  onValueChange={toggleDarkMode}
                  trackColor={{ false: '#d9cec2', true: rustColor }}
                  thumbColor='#ffffff'
                  accessibilityLabel='Toggle dark mode'
                />
              </View>

              <View style={[styles.section, { borderColor: cardBorder }]}>
                <Text style={[styles.sectionTitle, { color: textColor, fontSize: scaleFont(14) }]}>Text sizing</Text>
                <Text style={[styles.sectionSub, { color: mutedColor, fontSize: scaleFont(12) }]}>
                  Choose text size from compact to maximum readability
                </Text>

                <View style={styles.chipsRow}>
                  {fontOptions.map((opt) => {
                    const isSelected = fontSize === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        accessibilityRole='button'
                        accessibilityLabel={opt.hint}
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => setFontSize(opt.id)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected ? rustColor : darkMode ? '#252018' : '#f7f2eb',
                            borderColor: isSelected ? rustColor : cardBorder,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            {
                              color: isSelected ? '#ffffff' : textColor,
                              fontSize: scaleFont(opt.id === 'sm' ? 12 : opt.id === 'default' ? 14 : opt.id === 'lg' ? 16 : opt.id === 'xl' ? 18 : 20),
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.row, { borderColor: cardBorder }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.rowTitle, { color: textColor, fontSize: scaleFont(15) }]}>High contrast borders</Text>
                  <Text style={[styles.rowSub, { color: mutedColor, fontSize: scaleFont(12) }]}>
                    Adds pronounced solid borders to cards and fields
                  </Text>
                </View>
                <Switch
                  value={highContrast}
                  onValueChange={toggleHighContrast}
                  trackColor={{ false: '#d9cec2', true: rustColor }}
                  thumbColor='#ffffff'
                  accessibilityLabel='Toggle high contrast mode'
                />
              </View>

              <View style={[styles.row, { borderColor: cardBorder }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.rowTitle, { color: textColor, fontSize: scaleFont(15) }]}>Screen speech & TalkBack</Text>
                  <Text style={[styles.rowSub, { color: mutedColor, fontSize: scaleFont(12) }]}>
                    Enables proactive audio feedback on button taps and state updates
                  </Text>
                </View>
                <Switch
                  value={talkbackEnabled}
                  onValueChange={toggleTalkback}
                  trackColor={{ false: '#d9cec2', true: rustColor }}
                  thumbColor='#ffffff'
                  accessibilityLabel='Toggle TalkBack screen reader assistance'
                />
              </View>

              <Pressable
                accessibilityRole='button'
                accessibilityLabel='Test TalkBack speech audio'
                onPress={() => announce('CEDA Innovation Portal accessibility features active and functioning.')}
                style={[styles.testSpeechBtn, { borderColor: cardBorder, backgroundColor: darkMode ? '#252018' : '#f7f2eb' }]}
              >
                <MobileIcon name='globe' color={rustColor} />
                <Text style={[styles.testSpeechText, { color: textColor, fontSize: scaleFont(13) }]}>
                  Test TalkBack speech feedback
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole='button'
                accessibilityLabel='Done and save accessibility settings'
                onPress={closeModal}
                style={[styles.doneBtn, { backgroundColor: rustColor }]}
              >
                <Text style={[styles.doneBtnText, { fontSize: scaleFont(15) }]}>Apply & Save</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </FrostedModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    maxHeight: '88%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 18,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: 20,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowTitle: {
    fontWeight: '700',
  },
  rowSub: {
    marginTop: 2,
    lineHeight: 17,
  },
  section: {
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  sectionSub: {
    lineHeight: 17,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  chip: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    textAlign: 'center',
  },
  testSpeechBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  testSpeechText: {
    fontWeight: '600',
  },
  doneBtn: {
    minHeight: 50,
    borderRadius: buttonCornerRadius,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  doneBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
