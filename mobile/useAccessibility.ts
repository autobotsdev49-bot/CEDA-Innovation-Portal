import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { fontSizes } from "./theme";

export type MobileFontStep = keyof typeof fontSizes;
export type MobileFontSizeMode = "sm" | "default" | "lg" | "xl" | "xxl";

export interface AccessibilityContextValue {
  darkMode: boolean;
  setDarkMode: (next: boolean) => void;
  toggleDarkMode: () => void;
  darkModeLoaded: boolean;
  screenReaderEnabled: boolean;
  fontSize: MobileFontSizeMode;
  setFontSize: (mode: MobileFontSizeMode) => void;
  scaleFont: (size: number) => number;
  fs: (step: MobileFontStep) => number;
  talkbackEnabled: boolean;
  toggleTalkback: () => void;
  setTalkbackEnabled: (enabled: boolean) => void;
  highContrast: boolean;
  toggleHighContrast: () => void;
  setHighContrast: (enabled: boolean) => void;
  announce: (message: string) => void;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const STORAGE_KEYS = {
  darkMode: "ceda.mobile.darkMode",
  fontSize: "ceda.mobile.fontSize",
  talkback: "ceda.mobile.talkback",
  highContrast: "ceda.mobile.highContrast",
};

const FONT_MULTIPLIERS: Record<MobileFontSizeMode, number> = {
  sm: 0.88,
  default: 1.0,
  lg: 1.15,
  xl: 1.3,
  xxl: 1.45,
};

export function announceTalkBack(message: string) {
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {}
}

const defaultContext: AccessibilityContextValue = {
  darkMode: false,
  setDarkMode: () => {},
  toggleDarkMode: () => {},
  darkModeLoaded: false,
  screenReaderEnabled: false,
  fontSize: "default",
  setFontSize: () => {},
  scaleFont: (s) => s,
  fs: (step) => fontSizes[step],
  talkbackEnabled: false,
  toggleTalkback: () => {},
  setTalkbackEnabled: () => {},
  highContrast: false,
  toggleHighContrast: () => {},
  setHighContrast: () => {},
  announce: () => {},
  isModalOpen: false,
  openModal: () => {},
  closeModal: () => {},
};

const AccessibilityContext = createContext<AccessibilityContextValue>(defaultContext);

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkModeState] = useState<boolean>(false);
  const [darkModeLoaded, setDarkModeLoaded] = useState(false);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [fontSize, setFontSizeState] = useState<MobileFontSizeMode>("default");
  const [talkbackEnabled, setTalkbackEnabledState] = useState<boolean>(false);
  const [highContrast, setHighContrastState] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.darkMode),
      AsyncStorage.getItem(STORAGE_KEYS.fontSize),
      AsyncStorage.getItem(STORAGE_KEYS.talkback),
      AsyncStorage.getItem(STORAGE_KEYS.highContrast),
    ])
      .then(([darkVal, fontVal, talkbackVal, contrastVal]) => {
        if (!active) return;
        if (darkVal !== null) setDarkModeState(darkVal === "true");
        setDarkModeLoaded(true);
        if (fontVal && ["sm", "default", "lg", "xl", "xxl"].includes(fontVal)) {
          setFontSizeState(fontVal as MobileFontSizeMode);
        }
        if (talkbackVal !== null) setTalkbackEnabledState(talkbackVal === "true");
        if (contrastVal !== null) setHighContrastState(contrastVal === "true");
      })
      .catch(() => {
        if (active) setDarkModeLoaded(true);
      });

    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (active && enabled) {
          setScreenReaderEnabled(true);
          setTalkbackEnabledState(true);
        }
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", (enabled) => {
      if (active) setScreenReaderEnabled(enabled);
    });

    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  const announce = useCallback((message: string) => {
    announceTalkBack(message);
  }, []);

  const setDarkMode = useCallback((enabled: boolean) => {
    setDarkModeState(enabled);
    void AsyncStorage.setItem(STORAGE_KEYS.darkMode, enabled ? "true" : "false").catch(() => {});
    announceTalkBack(enabled ? "Dark mode on" : "Light mode on");
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkModeState((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(STORAGE_KEYS.darkMode, next ? "true" : "false").catch(() => {});
      announceTalkBack(next ? "Dark mode on" : "Light mode on");
      return next;
    });
  }, []);

  const setFontSize = useCallback((mode: MobileFontSizeMode) => {
    setFontSizeState(mode);
    void AsyncStorage.setItem(STORAGE_KEYS.fontSize, mode).catch(() => {});
    const label =
      mode === "sm" ? "Small" : mode === "lg" ? "Large" : mode === "xl" ? "Extra large" : mode === "xxl" ? "Maximum" : "Default";
    announceTalkBack(`Text size set to ${label}`);
  }, []);

  const setTalkbackEnabled = useCallback((enabled: boolean) => {
    setTalkbackEnabledState(enabled);
    void AsyncStorage.setItem(STORAGE_KEYS.talkback, enabled ? "true" : "false").catch(() => {});
    announceTalkBack(enabled ? "TalkBack announcements enabled" : "TalkBack announcements muted");
  }, []);

  const toggleTalkback = useCallback(() => {
    setTalkbackEnabledState((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(STORAGE_KEYS.talkback, next ? "true" : "false").catch(() => {});
      announceTalkBack(next ? "TalkBack announcements enabled" : "TalkBack announcements muted");
      return next;
    });
  }, []);

  const setHighContrast = useCallback((enabled: boolean) => {
    setHighContrastState(enabled);
    void AsyncStorage.setItem(STORAGE_KEYS.highContrast, enabled ? "true" : "false").catch(() => {});
    announceTalkBack(enabled ? "High contrast mode on" : "Standard contrast on");
  }, []);

  const toggleHighContrast = useCallback(() => {
    setHighContrastState((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(STORAGE_KEYS.highContrast, next ? "true" : "false").catch(() => {});
      announceTalkBack(next ? "High contrast mode on" : "Standard contrast on");
      return next;
    });
  }, []);

  const multiplier = FONT_MULTIPLIERS[fontSize] || 1.0;

  const scaleFont = useCallback(
    (size: number) => {
      return Math.round(size * multiplier);
    },
    [multiplier]
  );

  const fs = useCallback(
    (step: MobileFontStep) => {
      return Math.round(fontSizes[step] * multiplier);
    },
    [multiplier]
  );

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      darkMode,
      setDarkMode,
      toggleDarkMode,
      darkModeLoaded,
      screenReaderEnabled,
      fontSize,
      setFontSize,
      scaleFont,
      fs,
      talkbackEnabled,
      toggleTalkback,
      setTalkbackEnabled,
      highContrast,
      toggleHighContrast,
      setHighContrast,
      announce,
      isModalOpen,
      openModal,
      closeModal,
    }),
    [
      darkMode,
      setDarkMode,
      toggleDarkMode,
      darkModeLoaded,
      screenReaderEnabled,
      fontSize,
      setFontSize,
      scaleFont,
      fs,
      talkbackEnabled,
      toggleTalkback,
      setTalkbackEnabled,
      highContrast,
      toggleHighContrast,
      setHighContrast,
      announce,
      isModalOpen,
      openModal,
      closeModal,
    ]
  );

  return React.createElement(AccessibilityContext.Provider, { value }, children);
}

export function useAccessibility(): AccessibilityContextValue {
  return useContext(AccessibilityContext);
}

// Dark palette for the mobile app
export const darkPalette = {
  white: "#1a1510",
  ink: "#f0e8e0",
  muted: "#b8a898",
  accent: "#e07060",
  accentPressed: "#c85040",
  amberTint: "#2e2416",
  paper: "#252018",
} as const;

// Shell colours derived from dark/light mode
export interface ShellColors {
  bg: string;
  ink: string;
  inkSoft: string;
  muted: string;
  paper: string;
  hairline: string;
  accent: string;
  accentSoft: string;
  amber: string;
  card: string;
  border: string;
  headerBg: string;
}

export const shellDark: ShellColors = {
  bg: "#131009",
  ink: "#ede6de",
  inkSoft: "#c8b8a8",
  muted: "#907860",
  paper: "#1e1812",
  hairline: "rgba(240,220,200,0.08)",
  accent: "#e07060",
  accentSoft: "#2e1c18",
  amber: "#c08828",
  card: "#1e1812",
  border: "rgba(240,220,200,0.065)",
  headerBg: "rgba(19,16,9,0.90)",
};

export const shellLight: ShellColors = {
  bg: "#fdfcfa",
  ink: "#1e242b",
  inkSoft: "#374151",
  muted: "#525d69",
  paper: "#ffffff",
  hairline: "rgba(36,28,25,0.075)",
  accent: "#9a3d2b",
  accentSoft: "#f6e8e3",
  amber: "#d39b3b",
  card: "#ffffff",
  border: "rgba(36,28,25,0.065)",
  headerBg: "rgba(253,252,250,0.88)",
};

export function getShellColors(dark: boolean): ShellColors {
  return dark ? shellDark : shellLight;
}
