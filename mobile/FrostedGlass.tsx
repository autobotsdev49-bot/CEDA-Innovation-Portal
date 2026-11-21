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
  // Exact warm cream frosted glass style from Sign-up, tuned so it is not too transparent.
  sheet: {
    colors: ["rgba(255,250,244,0.78)", "rgba(255,250,244,0.93)", "#fffaf4"] as const,
    locations: [0, 0.38, 1] as const,
    intensity: 48,
  },
  card: {
    colors: ["rgba(255,250,244,0.82)", "rgba(255,251,247,0.94)", "#fffcf8"] as const,
    locations: [0, 0.42, 1] as const,
    intensity: 44,
  },
  bar: {
    colors: ["rgba(255,250,244,0.80)", "rgba(255,250,244,0.92)", "rgba(255,250,244,0.97)"] as const,
    locations: [0, 0.45, 1] as const,
    intensity: 46,
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
          colors={["rgba(24,18,15,0.34)", "rgba(36,28,25,0.44)", "rgba(154,61,43,0.28)"]}
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
          tint="default"
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
