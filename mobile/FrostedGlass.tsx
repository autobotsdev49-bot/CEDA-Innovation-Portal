import { createContext, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import { AccessibilityInfo, Image, Platform, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { palette } from "./theme";

type FrostedContextValue = {
  target: RefObject<ComponentRef<typeof BlurTargetView> | null> | undefined;
  showBlur: boolean;
  reduceTransparency: boolean;
};

const FrostedContext = createContext<FrostedContextValue>({
  target: undefined,
  showBlur: false,
  reduceTransparency: false,
});

const gradientPresets = {
  // High-contrast light cream modal/card surfaces so dark text always stays clearly readable.
  sheet: {
    colors: ["rgba(255,253,249,0.97)", "rgba(255,252,248,0.99)", "#ffffff"] as const,
    locations: [0, 0.38, 1] as const,
    intensity: 44,
  },
  card: {
    colors: ["rgba(255,255,255,0.96)", "rgba(255,253,250,0.98)", "#ffffff"] as const,
    locations: [0, 0.42, 1] as const,
    intensity: 40,
  },
  bar: {
    colors: ["rgba(255,253,249,0.96)", "rgba(255,252,248,0.98)", "#ffffff"] as const,
    locations: [0, 0.45, 1] as const,
    intensity: 42,
  },
};

export function useReduceTransparency() {
  const [reduceTransparency, setReduceTransparency] = useState(Platform.OS === "ios");
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let active = true;
    const listener = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduceTransparency);
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (active) setReduceTransparency(value);
    }).catch(() => {});
    return () => { active = false; listener.remove(); };
  }, []);
  return reduceTransparency;
}

export function FrostedScreenBackdrop({
  image,
  imageHeight = 280,
  children,
}: {
  image?: ImageSourcePropType;
  imageHeight?: number;
  children: ReactNode;
}) {
  const target = useRef<ComponentRef<typeof BlurTargetView>>(null);
  const [backdropReady, setBackdropReady] = useState(false);
  const reduceTransparency = useReduceTransparency();
  const showBlur = backdropReady && !reduceTransparency && (Platform.OS === "ios" || (Platform.OS === "android" && Platform.Version >= 31));

  return (
    <FrostedContext.Provider value={{ target, showBlur, reduceTransparency }}>
      <BlurTargetView
        ref={target}
        onLayout={() => setBackdropReady(true)}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.paper }]} />
        {image && (
          <Image
            source={image}
            resizeMode="cover"
            accessible={false}
            style={{ width: "100%", height: imageHeight, opacity: 0.34 }}
          />
        )}
        <LinearGradient
          colors={["rgba(238,225,210,0.68)", "rgba(247,242,235,0.86)", palette.paper]}
          locations={[0, 0.52, 1]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: imageHeight + 80 }}
          pointerEvents="none"
        />
      </BlurTargetView>
      {children}
    </FrostedContext.Provider>
  );
}

export function FrostedModalBackdrop({ children }: { children: ReactNode }) {
  const target = useRef<ComponentRef<typeof BlurTargetView>>(null);
  const [backdropReady, setBackdropReady] = useState(false);
  const reduceTransparency = useReduceTransparency();
  const showBlur = backdropReady && !reduceTransparency && (Platform.OS === "ios" || (Platform.OS === "android" && Platform.Version >= 31));

  return (
    <FrostedContext.Provider value={{ target, showBlur, reduceTransparency }}>
      <BlurTargetView
        ref={target}
        onLayout={() => setBackdropReady(true)}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <LinearGradient
          colors={["rgba(24,18,15,0.26)", "rgba(36,28,25,0.34)", "rgba(154,61,43,0.18)"]}
          locations={[0, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </BlurTargetView>
      {children}
    </FrostedContext.Provider>
  );
}

export function FrostedSurface({
  variant = "card",
  borderRadius,
  style,
}: {
  variant?: keyof typeof gradientPresets;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { target, showBlur, reduceTransparency } = useContext(FrostedContext);
  const preset = gradientPresets[variant];
  const radiusStyle = borderRadius !== undefined ? { borderRadius } : undefined;

  return (
    <>
      {showBlur && (
        <BlurView
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={preset.intensity}
          tint="light"
          style={[StyleSheet.absoluteFill, radiusStyle, style]}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}
      {reduceTransparency ? (
        <View
          pointerEvents="none"
          accessible={false}
          style={[StyleSheet.absoluteFill, { backgroundColor: "#fffaf4" }, radiusStyle, style]}
        />
      ) : (
        <LinearGradient
          colors={preset.colors}
          locations={preset.locations}
          pointerEvents="none"
          accessible={false}
          style={[StyleSheet.absoluteFill, radiusStyle, style]}
        />
      )}
    </>
  );
}
