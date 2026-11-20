import { useEffect, useRef } from "react";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { palette, buttonCornerRadius } from "./theme";

const gold = "#b78232";
const sage = "#527364";
const rose = "#cc826e";
const confetti = [
  { x: -83, y: -35, turn: -170, color: gold },
  { x: -70, y: -62, turn: 130, color: rose },
  { x: -49, y: -71, turn: 195, color: sage },
  { x: -33, y: -83, turn: -180, color: palette.accent },
  { x: -14, y: -86, turn: 140, color: gold },
  { x: 5, y: -76, turn: -125, color: sage },
  { x: 23, y: -86, turn: 205, color: rose },
  { x: 43, y: -73, turn: 140, color: gold },
  { x: 58, y: -54, turn: -150, color: palette.accent },
  { x: 76, y: -44, turn: 135, color: sage },
  { x: 90, y: -17, turn: 205, color: rose },
];

export function VerificationSuccess({ onContinue }: { onContinue: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    const burst = Animated.timing(progress, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => true).then(reduceMotion => {
      if (!active) return;
      if (reduceMotion) progress.setValue(0.48);
      else burst.start();
    });
    const timer = setTimeout(onContinue, 3200);
    return () => {
      active = false;
      burst.stop();
      clearTimeout(timer);
    };
  }, [onContinue, progress]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={["#F3ECE2", "#FBF8F4", "#F2EAE0"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.illustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
          <View style={styles.halo} />
          <Animated.View style={[styles.popper, {
            transform: [
              { rotate: "32deg" },
              { scale: progress.interpolate({ inputRange: [0, 0.2, 0.42, 1], outputRange: [0.86, 1.12, 1, 1] }) },
            ],
          }]}>
            <View style={styles.cone} />
            <View style={styles.rim} />
          </Animated.View>
          {confetti.map(({ x, y, turn, color }) => (
            <Animated.View
              key={x}
              style={[styles.confetti, {
                backgroundColor: color,
                opacity: progress.interpolate({ inputRange: [0, 0.1, 0.66, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
                  { translateY: progress.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0, y, y + 30] }) },
                  { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", turn + "deg"] }) },
                ],
              }]}
            />
          ))}
        </View>
        <View style={styles.message}>
          <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />
          <Text accessibilityRole="header" style={styles.title}>Your account has been successfully created</Text>
          <Text style={styles.description}>Your email is verified. Welcome to CEDA Innovation.</Text>
          <Pressable accessibilityRole="button" onPress={onContinue} style={styles.button}>
            <Text style={styles.buttonLabel}>Continue to Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 },
  illustration: { width: 220, height: 168 },
  halo: { position: "absolute", top: 51, left: 52, width: 116, height: 116, borderRadius: 58, backgroundColor: "rgba(255,255,255,0.82)" },
  popper: { position: "absolute", left: 82, top: 89, width: 45, height: 56, alignItems: "center" },
  cone: { width: 0, height: 0, borderLeftWidth: 21, borderRightWidth: 21, borderTopWidth: 51, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: palette.accent },
  rim: { position: "absolute", top: 0, width: 44, height: 8, borderRadius: 4, backgroundColor: gold },
  confetti: { position: "absolute", left: 114, top: 93, width: 5, height: 10, borderRadius: 2 },
  message: { width: "100%", maxWidth: 440, alignItems: "center", gap: 16, padding: 24, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.84)", borderWidth: 1, borderColor: "rgba(255,255,255,0.94)", overflow: "hidden" },
  title: { color: palette.ink, fontSize: 28, fontWeight: "800", textAlign: "center" },
  description: { color: palette.muted, fontSize: 16, lineHeight: 24, textAlign: "center" },
  button: { alignSelf: "stretch", minHeight: 52, marginTop: 8, padding: 12, alignItems: "center", justifyContent: "center", borderRadius: buttonCornerRadius, backgroundColor: palette.accent },
  buttonLabel: { color: palette.white, fontSize: 16, fontWeight: "700", textAlign: "center" },
});
