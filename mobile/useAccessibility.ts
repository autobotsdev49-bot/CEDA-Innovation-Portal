/**
 * useAccessibility - CEDA Innovation Mobile
 * Persists dark-mode preference to AsyncStorage.
 * Text-size / contrast / motion are stored server-side via profile.preferences.
 *
 * Usage:
 *   const { darkMode, setDarkMode } = useAccessibility();
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const DARK_MODE_KEY = "ceda.mobile.darkMode";

export function useAccessibility() {
  const [darkMode, setDarkModeState] = useState<boolean>(false);
  const [loaded, setLoaded] = useState(false);

  // Load from storage on mount
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(DARK_MODE_KEY)
      .then((val) => {
        if (active) {
          setDarkModeState(val === "true");
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  function setDarkMode(next: boolean) {
    setDarkModeState(next);
    void AsyncStorage.setItem(DARK_MODE_KEY, next ? "true" : "false").catch(() => {});
  }

  return { darkMode, setDarkMode, darkModeLoaded: loaded };
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
