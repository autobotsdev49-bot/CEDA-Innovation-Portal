import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { AccessibilityInfo, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from "react-native";
import { palette } from "./theme";
import { useAccessibility } from "./useAccessibility";

const slides = [
  {
    image: require("./assets/discover.jpg"),
    title: "Bring your idea to CEDA",
    description: "Botswana's innovators can use the CEDA Innovation Portal to share an idea, a prototype or an existing solution for assessment.",
  },
  {
    image: require("./assets/prepare.jpg"),
    title: "Show what your idea can do",
    description: "Explain the problem you're solving, who benefits and what you've tested so far. Bring sketches, photos or other evidence that helps tell your story.",
  },
  {
    image: require("./assets/progress.jpg"),
    title: "Know what happens next",
    description: "After you submit, the portal helps you follow your application's progress, see feedback and respond when CEDA asks for more information.",
  },
];

type PortalIntroProps = {
  image: ImageSourcePropType;
  title: string;
  description: string;
  label?: string;
  headerAction?: ReactNode;
  actions: ReactNode;
};

function PortalIntro({ image, title, description, label, headerAction, actions }: PortalIntroProps) {
  const { darkMode, scaleFont } = useAccessibility();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [copyHeight, setCopyHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(58);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const { width, height } = useWindowDimensions();
  const preferredArtworkHeight = Math.min(340, width * 0.88, height * 0.45);
  const artworkHeight = viewportHeight && copyHeight
    ? Math.max(headerHeight + 80, Math.floor(viewportHeight - copyHeight))
    : Math.max(headerHeight + 80, preferredArtworkHeight);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [title]);

  const bgScreen = darkMode ? "#131009" : palette.white;
  const washColors = darkMode
    ? (["rgba(19, 16, 9, 0)", "rgba(19, 16, 9, 0)", "rgba(19, 16, 9, 0.6)", "#131009"] as const)
    : (["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.5)", palette.white] as const);
  const headerWashColors = darkMode
    ? (["rgba(19, 16, 9, 0.94)", "rgba(19, 16, 9, 0.82)", "rgba(19, 16, 9, 0.45)", "rgba(19, 16, 9, 0)"] as const)
    : (["rgba(255, 255, 255, 0.92)", "rgba(255, 255, 255, 0.78)", "rgba(255, 255, 255, 0.42)", "rgba(255, 255, 255, 0)"] as const);

  return (
    <View style={[styles.screen, { backgroundColor: bgScreen }]}>
      <ScrollView
        ref={scroll}
        style={styles.scroll}
        onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}
      >
        <View style={[styles.artworkFrame, { height: artworkHeight, backgroundColor: darkMode ? "#1c1810" : palette.paper }]}>
          <Image source={image} resizeMode="cover" style={styles.artwork} accessible={false} />
          <LinearGradient
            colors={washColors}
            locations={[0, 0.48, 0.76, 1]}
            pointerEvents="none"
            accessible={false}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={headerWashColors}
            locations={[0, 0.45, 0.72, 1]}
            pointerEvents="none"
            accessible={false}
            style={[styles.headerWash, { height: headerHeight + 36 }]}
          />
          <View style={styles.header} onLayout={({ nativeEvent }) => setHeaderHeight(nativeEvent.layout.height)}>
            <View style={styles.brand}>
              <Image source={require("./assets/ceda.png")} style={styles.logo} resizeMode="contain" accessible={false} />
              <Text style={[styles.brandText, { color: darkMode ? "#f0e8e0" : palette.ink, fontSize: scaleFont(14) }]}>CEDA Innovation</Text>
            </View>
            {headerAction}
          </View>
        </View>

        <View style={styles.copy} onLayout={({ nativeEvent }) => setCopyHeight(nativeEvent.layout.height)}>
          {label && <Text style={[styles.progress, { fontSize: scaleFont(13) }]}>{label}</Text>}
          <Text accessibilityRole="header" style={[styles.title, { color: darkMode ? "#f0e8e0" : palette.ink, fontSize: scaleFont(34) }]}>{title}</Text>
          <Text style={[styles.description, { color: darkMode ? "#b8a898" : palette.muted, fontSize: scaleFont(16) }]}>{description}</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: bgScreen }]}>{actions}</View>
    </View>
  );
}

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const finalStep = step === slides.length - 1;

  function goTo(next: number) {
    setStep(next);
    AccessibilityInfo.announceForAccessibility(`Step ${next + 1} of ${slides.length}. ${slides[next].title}.`);
  }

  return (
    <PortalIntro
      {...slides[step]}
      label={`Step ${step + 1} of ${slides.length}`}
      headerAction={
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens the portal welcome screen"
          onPress={onFinish}
          style={({ pressed }) => [styles.skip, pressed && styles.secondaryPressed]}
        >
          <Text style={styles.link}>Skip</Text>
        </Pressable>
      }
      actions={
        <View style={styles.navigation}>
          {step > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => goTo(step - 1)}
              style={({ pressed }) => [styles.back, pressed && styles.secondaryPressed]}
            >
              <Text style={styles.link}>Back</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={finalStep ? onFinish : () => goTo(step + 1)}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryLabel}>{finalStep ? "Explore the portal" : "Next"}</Text>
          </Pressable>
        </View>
      }
    />
  );
}

type PortalWelcomeProps = {
  onSignIn: () => void;
  onSignUp: () => void;
  onWebsite: () => void;
  error: string;
};

export function PortalWelcome({ onSignIn, onSignUp, onWebsite, error }: PortalWelcomeProps) {
  return (
    <PortalIntro
      image={require("./assets/welcome.jpg")}
      title="Ready to innovate the world with your ideas?"
      description="Share your idea, prototype or solution with CEDA and follow your application through the Innovation Portal."
      actions={
        <View style={styles.welcomeActions}>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens sign-in"
            onPress={onSignIn}
            style={({ pressed }) => [styles.welcomeButton, styles.primaryFill, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryLabel}>Submit an innovation</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens sign-up"
            onPress={onSignUp}
            style={({ pressed }) => [styles.welcomeButton, styles.outline, pressed && styles.secondaryPressed]}
          >
            <Text style={styles.link}>Create an account</Text>
          </Pressable>
          <Text style={styles.websiteNote}>
            View more information in the{" "}
            <Text accessibilityRole="link" onPress={onWebsite} style={styles.websiteLink}>website</Text>
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.white },
  header: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 58, paddingBottom: 6 },
  brand: { flexDirection: "row", alignItems: "center", flexShrink: 1, gap: 8 },
  logo: { width: 51, height: 34 },
  brandText: { flexShrink: 1, color: palette.ink, fontSize: 14, fontWeight: "700" },
  skip: { minHeight: 48, paddingHorizontal: 17, paddingVertical: 8, justifyContent: "center", alignItems: "center", borderRadius: 24, borderWidth: 1, borderColor: "#d9cec2", backgroundColor: "rgba(247, 242, 235, 0.7)" },
  scroll: { flex: 1 },
  artworkFrame: { width: "100%", overflow: "hidden", backgroundColor: palette.paper },
  artwork: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  headerWash: { position: "absolute", top: 0, left: 0, right: 0 },
  copy: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20, paddingTop: 3, paddingBottom: 4, gap: 7 },
  progress: { fontSize: 13, fontWeight: "700", color: palette.accent },
  title: { fontSize: 34, fontWeight: "800", letterSpacing: -0.8, color: palette.ink },
  description: { fontSize: 16, lineHeight: 23, color: palette.muted },
  footer: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, backgroundColor: palette.white },
  navigation: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  welcomeActions: { gap: 8 },
  welcomeButton: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  primaryFill: { backgroundColor: palette.accent },
  outline: { borderWidth: 1, borderColor: palette.accent },
  websiteNote: { color: palette.muted, fontSize: 15, textAlign: "center", paddingVertical: 10 },
  websiteLink: { fontWeight: "700", color: palette.accent },
  error: { color: palette.accent, fontSize: 15 },
  primary: { flex: 1, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 28, justifyContent: "center", alignItems: "center", backgroundColor: palette.accent },
  primaryPressed: { backgroundColor: palette.accentPressed },
  primaryLabel: { fontSize: 17, textAlign: "center", fontWeight: "700", color: palette.white },
  back: { minHeight: 48, maxWidth: "38%", paddingHorizontal: 12, paddingVertical: 9, justifyContent: "center", alignItems: "center", borderRadius: 24, borderWidth: 1, borderColor: "#d9cec2" },
  secondaryPressed: { backgroundColor: palette.amberTint },
  link: { fontSize: 15, fontWeight: "700", textAlign: "center", color: palette.accent },
});
