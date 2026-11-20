import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Linking, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { Onboarding, PortalWelcome } from "./Onboarding";
import { palette } from "./theme";
import { NativeAuth, type AuthMode } from "./NativeAuth";
import { portalUrl } from "./auth";

const onboardingKey = "ceda.onboarding.v1";
const splashHoldDuration = 1600;
const splashFadeDuration = 650;
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [splashReady, setSplashReady] = useState(false);
  const [splashHoldFinished, setSplashHoldFinished] = useState(false);
  const [destinationReady, setDestinationReady] = useState(false);
  const [splashFinished, setSplashFinished] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [showIntroduction, setShowIntroduction] = useState<boolean | null>(null);
  const [linkError, setLinkError] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [retryAt, setRetryAt] = useState<Record<AuthMode, number>>({ signin: 0, signup: 0 });

  useEffect(() => {
    if (!splashReady) return;
    void SplashScreen.hideAsync().catch(() => {});
    const timer = setTimeout(() => setSplashHoldFinished(true), splashHoldDuration);
    return () => clearTimeout(timer);
  }, [splashReady]);

  useEffect(() => {
    if (!destinationReady) return;
    let active = true;
    const fade = Animated.timing(splashOpacity, {
      toValue: 0,
      duration: splashFadeDuration,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => true).then(reduceMotion => {
      if (!active) return;
      if (reduceMotion) {
        setSplashFinished(true);
        return;
      }
      fade.start(({ finished }) => {
        if (active && finished) setSplashFinished(true);
      });
    });
    return () => {
      active = false;
      fade.stop();
    };
  }, [destinationReady, splashOpacity]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(onboardingKey).then((value) => {
      if (active) setShowIntroduction(value !== "complete");
    }).catch(() => {
      if (active) setShowIntroduction(true);
    });
    return () => { active = false; };
  }, []);

  function finishIntroduction() {
    setShowIntroduction(false);
    AccessibilityInfo.announceForAccessibility("Ready to innovate the world with your ideas?");
    void AsyncStorage.setItem(onboardingKey, "complete").catch(() => {});
  }

  async function openPortal(url: string) {
    setLinkError("");
    try {
      await Linking.openURL(url);
    } catch {
      setLinkError("We could not open your browser. Try again or use the CEDA Innovation Portal in your browser.");
    }
  }

  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        {splashHoldFinished && showIntroduction !== null && (
          <SafeAreaView
            edges={authMode ? ["top", "left", "right"] : undefined}
            style={styles.screen}
            pointerEvents={splashFinished ? "auto" : "none"}
            accessibilityElementsHidden={!splashFinished}
            importantForAccessibility={splashFinished ? "auto" : "no-hide-descendants"}
            onLayout={() => setDestinationReady(true)}
          >
            {showIntroduction ? (
              <Onboarding onFinish={finishIntroduction} />
            ) : authMode ? (
              <NativeAuth
                key={authMode}
                mode={authMode}
                retryAt={retryAt[authMode]}
                onRateLimited={(deadline) => setRetryAt(previous => ({ ...previous, [authMode]: deadline }))}
                onBack={() => setAuthMode(null)}
                onSwitch={setAuthMode}
              />
            ) : (
              <PortalWelcome
                error={linkError}
                onSignIn={() => setAuthMode("signin")}
                onSignUp={() => setAuthMode("signup")}
                onWebsite={() => void openPortal(portalUrl)}
              />
            )}
          </SafeAreaView>
        )}
        {!splashFinished && (
          <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { opacity: splashOpacity }]}>
            <Image
              source={require("./assets/ceda.png")}
              style={styles.splashLogo}
              resizeMode="contain"
              accessible
              accessibilityLabel="CEDA Innovation"
              onLoadEnd={() => setSplashReady(true)}
            />
          </Animated.View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.white },
  splash: { backgroundColor: palette.white, alignItems: "center", justifyContent: "center" },
  splashLogo: { width: 160, height: 160 },
});
