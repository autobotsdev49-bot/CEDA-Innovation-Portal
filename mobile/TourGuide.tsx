import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileIcon } from "./AdminOverview";
import { buttonCornerRadius } from "./theme";
import { useAccessibility } from "./useAccessibility";

export type TourPortalKey = "onboarding" | "innovator" | "admin" | "assessor" | "support" | "committee";

export interface MobileTourStep {
  targetId?: string;
  screen?: string;
  title: string;
  description: string;
}

export const MOBILE_TOURS: Record<TourPortalKey, MobileTourStep[]> = {
  innovator: [
    {
      targetId: "innovator.overview",
      screen: "home",
      title: "Overview & Application Status",
      description:
        "Welcome to your Innovator Overview. See your active applications, drafts in progress, and next steps at a glance.",
    },
    {
      targetId: "innovator.submit",
      screen: "home",
      title: "Submit a New Innovation",
      description:
        "Tap Submit to open the 12-step guided application wizard. You can save drafts anytime and continue later.",
    },
    {
      targetId: "innovator.applications",
      screen: "applications",
      title: "Track Your Applications",
      description:
        "View live review stages, read assessor feedback, and respond if CEDA requests additional evidence.",
    },
    {
      targetId: "innovator.optimus",
      screen: "home",
      title: "Optimus Prime AI Assistant",
      description:
        "This is Optimus Prime, your personal AI assistant. It is here 24/7 to help with eligibility and evidence, especially if live support is busy or unavailable.",
    },
    {
      targetId: "innovator.menu",
      screen: "home",
      title: "Menu, Accessibility & TalkBack",
      description:
        "Open the top-left menu anytime for Documents, Support, Dark Mode, Text Sizing (A- to A+++), and TalkBack speech feedback.",
    },
  ],
  admin: [
    {
      targetId: "admin.overview",
      screen: "Overview",
      title: "Executive Overview & Live Metrics",
      description:
        "Monitor live portal page views, Optimus Prime interactions, total applications, and open follow-up matters.",
    },
    {
      targetId: "admin.innovations",
      screen: "Innovations",
      title: "Innovations Pipeline",
      description:
        "Review submitted applications, filter by status, and oversee assessment progression.",
    },
    {
      targetId: "admin.users",
      screen: "Users",
      title: "Users & Access Control",
      description:
        "Manage innovators, assessors, support officers, and committee observers, including roles and MFA status.",
    },
    {
      targetId: "admin.bell",
      screen: "Overview",
      title: "Notifications & Alerts",
      description:
        "Tap the bell icon for urgent administrative alerts and escalated matters.",
    },
    {
      targetId: "admin.menu",
      screen: "Overview",
      title: "Menu, Accessibility & TalkBack",
      description:
        "Open the top-left menu for Sectors, Optimus Prime AI governance, Audit logs, Dark Mode, Text Sizing, and TalkBack.",
    },
  ],
  assessor: [
    {
      targetId: "assessor.overview",
      screen: "overview",
      title: "Assessor Overview & Workload",
      description:
        "Check your assigned reviews, upcoming panel deadlines, and active assessment progress.",
    },
    {
      targetId: "assessor.assessments",
      screen: "assessments",
      title: "My Assessments",
      description:
        "Open My Assessments to score assigned innovations using the CEDA rubric and submit your formal evaluation.",
    },
    {
      targetId: "assessor.library",
      screen: "library",
      title: "Application Library",
      description:
        "Browse submissions across all sectors to review supporting documents and context.",
    },
    {
      targetId: "assessor.messages",
      screen: "messages",
      title: "Panel Discussion",
      description:
        "Collaborate securely with fellow assessors per application before finalizing recommendations.",
    },
    {
      targetId: "assessor.menu",
      screen: "overview",
      title: "Menu, Accessibility & TalkBack",
      description:
        "Open the top-left menu for Guidance, Account Security, Dark Mode, Text Sizing, and TalkBack speech.",
    },
  ],
  support: [
    {
      targetId: "support.overview",
      screen: "overview",
      title: "Support Desk Overview",
      description:
        "Monitor open requests, urgent escalations, and your live chat availability (09:00 to 16:00 working days).",
    },
    {
      targetId: "support.queue",
      screen: "queue",
      title: "Support & Escalations Queue",
      description:
        "Handle live innovator chats and escalated Optimus Prime handoffs with full consented conversation context.",
    },
    {
      targetId: "support.performance",
      screen: "performance",
      title: "Officer Performance",
      description:
        "Review your personal resolution rate, response turnaround times, and workload.",
    },
    {
      targetId: "support.menu",
      screen: "overview",
      title: "Menu, Accessibility & TalkBack",
      description:
        "Open the top-left menu for the Support Playbook, Dark Mode, Text Sizing, and TalkBack speech feedback.",
    },
  ],
  committee: [
    {
      targetId: "committee.overview",
      screen: "overview",
      title: "Committee Observer Overview",
      description:
        "View read-only portfolio metrics, sector distribution, and overall innovation pipeline status.",
    },
    {
      targetId: "committee.timeline",
      screen: "timeline",
      title: "Pipeline Lifecycle Timeline",
      description:
        "Follow each innovation's progression from submission through assessment to final decision.",
    },
    {
      targetId: "committee.awards",
      screen: "awards",
      title: "Awards Showcase",
      description:
        "Review conferred CEDA Innovation Awards and share official award briefs.",
    },
    {
      targetId: "committee.accessibility",
      screen: "overview",
      title: "Accessibility & TalkBack",
      description:
        "Tap the Accessibility icon in the header anytime for Dark Mode, Text Sizing (A- to A+++), and TalkBack.",
    },
  ],
  onboarding: [
    {
      title: "Welcome to CEDA Innovation",
      description:
        "Sign in or create an account to share your idea, prototype, or registered solution with CEDA and track its progress.",
    },
    {
      title: "Accessibility & TalkBack",
      description:
        "Use the floating Accessibility button anytime to enable Dark Mode, resize text (A- to A+++), or turn on TalkBack speech feedback.",
    },
  ],
};

type Rect = { x: number; y: number; width: number; height: number };

interface TourContextValue {
  activePortal: TourPortalKey;
  setPortalContext: (portal: TourPortalKey, navigateFn?: (screen: string) => void) => void;
  registerTarget: (id: string, ref: React.RefObject<ComponentRef<typeof View> | null>) => void;
  unregisterTarget: (id: string) => void;
  startTour: (portalOverride?: TourPortalKey) => void;
  stopTour: () => void;
  isTourOpen: boolean;
}

const TourContext = createContext<TourContextValue>({
  activePortal: "onboarding",
  setPortalContext: () => {},
  registerTarget: () => {},
  unregisterTarget: () => {},
  startTour: () => {},
  stopTour: () => {},
  isTourOpen: false,
});

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [activePortal, setActivePortal] = useState<TourPortalKey>("onboarding");
  const navigateRef = useRef<((screen: string) => void) | undefined>(undefined);
  const targetsRef = useRef<Map<string, React.RefObject<ComponentRef<typeof View> | null>>>(new Map());

  const [isTourOpen, setIsTourOpen] = useState(false);
  const [tourSteps, setTourSteps] = useState<MobileTourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<Rect | null>(null);

  const setPortalContext = useCallback((portal: TourPortalKey, navigateFn?: (screen: string) => void) => {
    setActivePortal(portal);
    navigateRef.current = navigateFn;
  }, []);

  const registerTarget = useCallback((id: string, ref: React.RefObject<ComponentRef<typeof View> | null>) => {
    targetsRef.current.set(id, ref);
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    targetsRef.current.delete(id);
  }, []);

  const measureCurrentStep = useCallback((steps: MobileTourStep[], idx: number) => {
    const step = steps[idx];
    if (!step) return;
    if (step.screen && navigateRef.current) {
      try {
        navigateRef.current(step.screen);
      } catch {}
    }

    const runMeasure = () => {
      const ref = step.targetId ? targetsRef.current.get(step.targetId) : undefined;
      if (ref?.current && typeof ref.current.measureInWindow === "function") {
        ref.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          if (width > 0 && height > 0) {
            setSpotlightRect({ x, y, width, height });
          } else {
            setSpotlightRect(null);
          }
        });
      } else {
        setSpotlightRect(null);
      }
    };

    setTimeout(runMeasure, 240);
  }, []);

  const startTour = useCallback(
    (portalOverride?: TourPortalKey) => {
      const key = portalOverride || activePortal;
      const list = MOBILE_TOURS[key] || MOBILE_TOURS.onboarding;
      setTourSteps(list);
      setStepIndex(0);
      setSpotlightRect(null);
      setIsTourOpen(true);
      measureCurrentStep(list, 0);
      try {
        AccessibilityInfo.announceForAccessibility(`Starting guided tour. ${list[0].title}. ${list[0].description}`);
      } catch {}
    },
    [activePortal, measureCurrentStep]
  );

  const stopTour = useCallback(() => {
    setIsTourOpen(false);
    setSpotlightRect(null);
  }, []);

  const goToStep = useCallback(
    (next: number) => {
      if (next < 0 || next >= tourSteps.length) {
        stopTour();
        return;
      }
      setStepIndex(next);
      setSpotlightRect(null);
      measureCurrentStep(tourSteps, next);
      try {
        AccessibilityInfo.announceForAccessibility(
          `Step ${next + 1} of ${tourSteps.length}. ${tourSteps[next].title}. ${tourSteps[next].description}`
        );
      } catch {}
    },
    [tourSteps, measureCurrentStep, stopTour]
  );

  const value = useMemo<TourContextValue>(
    () => ({
      activePortal,
      setPortalContext,
      registerTarget,
      unregisterTarget,
      startTour,
      stopTour,
      isTourOpen,
    }),
    [activePortal, setPortalContext, registerTarget, unregisterTarget, startTour, stopTour, isTourOpen]
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay
        visible={isTourOpen}
        steps={tourSteps}
        stepIndex={stepIndex}
        rect={spotlightRect}
        onPrev={() => goToStep(stepIndex - 1)}
        onNext={() => goToStep(stepIndex + 1)}
        onClose={stopTour}
      />
    </TourContext.Provider>
  );
}

export function useTour() {
  return useContext(TourContext);
}

export function TourTarget({
  id,
  children,
  style,
}: {
  id: string;
  children: React.ReactNode;
  style?: any;
}) {
  const ref = useRef<ComponentRef<typeof View> | null>(null);
  const { registerTarget, unregisterTarget } = useTour();

  useEffect(() => {
    registerTarget(id, ref);
    return () => unregisterTarget(id);
  }, [id, registerTarget, unregisterTarget]);

  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

function TourOverlay({
  visible,
  steps,
  stepIndex,
  rect,
  onPrev,
  onNext,
  onClose,
}: {
  visible: boolean;
  steps: MobileTourStep[];
  stepIndex: number;
  rect: Rect | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { darkMode, scaleFont } = useAccessibility();

  if (!visible || !steps.length) return null;

  const step = steps[stepIndex];
  const { width: winW, height: winH } = Dimensions.get("window");
  const pad = 6;

  const spotTop = rect ? Math.max(0, rect.y - pad) : 0;
  const spotLeft = rect ? Math.max(0, rect.x - pad) : 0;
  const spotW = rect ? Math.min(winW - spotLeft, rect.width + pad * 2) : 0;
  const spotH = rect ? Math.min(winH - spotTop, rect.height + pad * 2) : 0;

  // Position tooltip card below spotlight if room, otherwise above, or centered if no spotlight
  const cardBg = darkMode ? "#1e1812" : "#ffffff";
  const cardInk = darkMode ? "#f0e8e0" : "#192c40";
  const cardMuted = darkMode ? "#b8a898" : "#4a5564";
  const rust = "#9a3d2b";

  let cardPositionStyle: any = {
    alignSelf: "center",
    top: Math.max(insets.top + 24, winH * 0.34),
  };

  if (rect) {
    const spaceBelow = winH - (spotTop + spotH) - insets.bottom;
    const spaceAbove = spotTop - insets.top;
    if (spaceBelow >= 210) {
      cardPositionStyle = { top: spotTop + spotH + 14 };
    } else if (spaceAbove >= 210) {
      cardPositionStyle = { bottom: winH - spotTop + 14 };
    } else {
      cardPositionStyle = { bottom: Math.max(insets.bottom + 18, 24) };
    }
  }

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        {rect ? (
          <>
            <View style={[styles.dim, { top: 0, left: 0, right: 0, height: spotTop }]} />
            <View style={[styles.dim, { top: spotTop, left: 0, width: spotLeft, height: spotH }]} />
            <View
              style={[
                styles.dim,
                { top: spotTop, left: spotLeft + spotW, right: 0, height: spotH },
              ]}
            />
            <View style={[styles.dim, { top: spotTop + spotH, left: 0, right: 0, bottom: 0 }]} />
            <View
              pointerEvents="none"
              style={[
                styles.spotlightRing,
                { top: spotTop, left: spotLeft, width: spotW, height: spotH },
              ]}
            />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.dim]} />
        )}

        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            cardPositionStyle,
            {
              backgroundColor: cardBg,
              borderColor: darkMode ? "rgba(240,220,200,0.18)" : "rgba(36,28,25,0.12)",
            },
          ]}
        >
          <View style={styles.metaRow}>
            <View style={styles.stepBadgeRow}>
              <MobileIcon name="compass" color={darkMode ? "#e07060" : rust} />
              <Text style={[styles.stepLabel, { color: darkMode ? "#e07060" : rust, fontSize: scaleFont(12) }]}>
                Step {stepIndex + 1} of {steps.length}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close tour"
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: darkMode ? "#2e2416" : "#f4efe9" }]}
            >
              <MobileIcon name="close" color={cardInk} />
            </Pressable>
          </View>

          <Text accessibilityRole="header" style={[styles.title, { color: cardInk, fontSize: scaleFont(18) }]}>
            {step.title}
          </Text>
          <Text style={[styles.desc, { color: cardMuted, fontSize: scaleFont(14) }]}>{step.description}</Text>

          <View style={styles.actionsRow}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.skipBtn}>
              <Text style={[styles.skipText, { color: cardMuted, fontSize: scaleFont(13) }]}>Skip tour</Text>
            </Pressable>

            <View style={styles.navBtns}>
              {stepIndex > 0 && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onPrev}
                  style={[
                    styles.prevBtn,
                    {
                      backgroundColor: darkMode ? "#252018" : "#f4efe9",
                      borderColor: darkMode ? "rgba(240,220,200,0.16)" : "rgba(36,28,25,0.12)",
                    },
                  ]}
                >
                  <Text style={[styles.prevText, { color: cardInk, fontSize: scaleFont(14) }]}>Back</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={onNext} style={[styles.nextBtn, { backgroundColor: rust }]}>
                <Text style={[styles.nextText, { fontSize: scaleFont(14) }]}>
                  {stepIndex === steps.length - 1 ? "Finish" : "Next"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dim: {
    position: "absolute",
    backgroundColor: "rgba(15, 19, 25, 0.68)",
  },
  spotlightRing: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: "#e07060",
  },
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    maxWidth: 420,
    alignSelf: "center",
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepLabel: {
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  desc: {
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontWeight: "600",
  },
  navBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  prevBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: buttonCornerRadius,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  prevText: {
    fontWeight: "700",
  },
  nextBtn: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: buttonCornerRadius,
    justifyContent: "center",
    alignItems: "center",
  },
  nextText: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
