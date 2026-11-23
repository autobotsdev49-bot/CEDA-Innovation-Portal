import React, { createContext, useContext } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileIcon } from "./AdminOverview";
import { FrostedModalBackdrop, FrostedSurface } from "./FrostedGlass";
import { createSignedEvidenceUrl } from "./innovatorApi";
import { formatBytes, type InnovatorDocument } from "./innovatorDomain";
import { useAccessibility } from "./useAccessibility";
import { buttonCornerRadius, fontSizes } from "./theme";

export const adminStyleColors = {
  navy: "#192C40",
  rust: "#9A3D2B",
  rustDark: "#7B3123",
  teal: "#236D61",
  tealBright: "#278477",
  blue: "#28599B",
  blueSoft: "#417AC5",
  amber: "#94702D",
  purple: "#695198",
  muted: "#4E5A68",
  subtle: "#4A5564",
  line: "rgba(218,208,198,0.45)",
  borderWhite: "rgba(255,255,255,0.90)",
  canvas: "#F7F2EB",
  inputBorder: "#CAB9A9",
  white: "#FFFFFF",
} as const;

export type FontStep = keyof typeof fontSizes;

export interface InnovatorA11yConfig {
  textSize: "standard" | "large" | "xlarge";
  scale: number;
  highContrast: boolean;
  reducedMotion: boolean;
  darkMode: boolean;
  toggleDarkMode?: () => void;
  fs: (step: FontStep) => number;
}

const defaultA11y: InnovatorA11yConfig = {
  textSize: "standard",
  scale: 1,
  highContrast: false,
  reducedMotion: false,
  darkMode: false,
  fs: (step) => fontSizes[step],
};

const A11yContext = createContext<InnovatorA11yConfig>(defaultA11y);

export function InnovatorA11yProvider({
  textSize = "standard",
  highContrast = false,
  reducedMotion = false,
  darkMode = false,
  toggleDarkMode,
  children,
}: {
  textSize?: "standard" | "large" | "xlarge";
  highContrast?: boolean;
  reducedMotion?: boolean;
  darkMode?: boolean;
  toggleDarkMode?: () => void;
  children: React.ReactNode;
}) {
  const scale = textSize === "xlarge" ? 1.22 : textSize === "large" ? 1.11 : 1;
  return (
    <A11yContext.Provider
      value={{
        textSize,
        scale,
        highContrast,
        reducedMotion,
        darkMode,
        toggleDarkMode,
        fs: (step) => Math.round(fontSizes[step] * scale),
      }}
    >
      {children}
    </A11yContext.Provider>
  );
}

export function useInnovatorA11y(): InnovatorA11yConfig {
  const local = useContext(A11yContext);
  const global = useAccessibility();

  const effectiveDark = global.darkMode || local.darkMode;
  const effectiveScale =
    global.fontSize === "xxl"
      ? 1.45
      : global.fontSize === "xl"
      ? 1.3
      : global.fontSize === "lg"
      ? 1.15
      : global.fontSize === "sm"
      ? 0.88
      : local.scale;
  const effectiveHighContrast = global.highContrast || local.highContrast;

  return {
    textSize:
      global.fontSize === "xl" || global.fontSize === "xxl"
        ? "xlarge"
        : global.fontSize === "lg"
        ? "large"
        : local.textSize,
    scale: effectiveScale,
    highContrast: effectiveHighContrast,
    reducedMotion: local.reducedMotion,
    darkMode: effectiveDark,
    toggleDarkMode: global.toggleDarkMode || local.toggleDarkMode,
    fs: (step) => Math.round(fontSizes[step] * effectiveScale),
  };
}

export type InnovatorIconName =
  | "menu"
  | "back"
  | "close"
  | "bell"
  | "search"
  | "home"
  | "applications"
  | "submit"
  | "messages"
  | "more"
  | "documents"
  | "optimus"
  | "support"
  | "settings"
  | "logout"
  | "clock"
  | "check"
  | "shield"
  | "alert"
  | "sector"
  | "pulse"
  | "people";

export function InnovatorIcon({
  name,
  color = adminStyleColors.navy,
  size = 18,
}: {
  name: InnovatorIconName;
  color?: string;
  size?: number;
}) {
  switch (name) {
    case "menu":
    case "back":
    case "close":
    case "bell":
    case "search":
    case "clock":
    case "check":
    case "shield":
    case "alert":
    case "sector":
    case "pulse":
    case "people":
      return <MobileIcon name={name} color={color} />;
    case "applications":
      return <MobileIcon name="application" color={color} />;
    case "optimus":
      return <MobileIcon name="ai" color={color} />;
    case "support":
      return <MobileIcon name="support" color={color} />;
    case "documents":
      return <MobileIcon name="audit" color={color} />;
    case "home":
      return <MobileIcon name="traffic" color={color} />;
    case "submit":
      return (
        <View style={[iconStyles.box, { width: size, height: size }]}>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 6,
              borderWidth: 1.7,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: 9, height: 1.7, backgroundColor: color, borderRadius: 1 }} />
            <View
              style={{
                position: "absolute",
                width: 1.7,
                height: 9,
                backgroundColor: color,
                borderRadius: 1,
              }}
            />
          </View>
        </View>
      );
    case "messages":
      return <MobileIcon name="feedback" color={color} />;
    case "more":
      return (
        <View style={[iconStyles.box, { width: 24, height: 24, flexDirection: "row", gap: 3 }]}>
          <View style={[iconStyles.dot, { backgroundColor: color }]} />
          <View style={[iconStyles.dot, { backgroundColor: color }]} />
          <View style={[iconStyles.dot, { backgroundColor: color }]} />
        </View>
      );
    case "settings":
      return (
        <View style={[iconStyles.box, { width: size, height: size }]}>
          <View
            style={{
              width: 17,
              height: 17,
              borderRadius: 9,
              borderWidth: 1.7,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                borderWidth: 1.6,
                borderColor: color,
              }}
            />
          </View>
        </View>
      );
    case "logout":
      return (
        <View style={[iconStyles.box, { width: size, height: size }]}>
          <View
            style={{
              width: 10,
              height: 15,
              borderWidth: 1.7,
              borderRightWidth: 0,
              borderColor: color,
              borderTopLeftRadius: 4,
              borderBottomLeftRadius: 4,
              marginRight: 4,
            }}
          />
          <View
            style={{
              position: "absolute",
              right: 2,
              width: 9,
              height: 1.7,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
        </View>
      );
  }
}

export function statusAppearance(status: string): {
  color: string;
  tint: string;
  label?: string;
} {
  switch (status) {
    case "Awarded":
      return { color: "#7C5317", tint: "#FFF3D8" };
    case "Approved":
    case "Completed":
    case "Resolved":
    case "Published":
    case "active":
      return { color: adminStyleColors.teal, tint: "#E4F4F0" };
    case "Submitted":
    case "Open":
      return { color: adminStyleColors.blue, tint: "#EAF1FC" };
    case "In review":
    case "Waiting":
      return { color: adminStyleColors.amber, tint: "#FCF4E4" };
    case "Changes requested":
    case "Rejected":
    case "Withdrawn":
    case "High":
      return { color: "#903925", tint: "#FBEDE8" };
    case "Draft":
      return { color: adminStyleColors.amber, tint: "#FCF4E4" };
    default:
      return { color: adminStyleColors.muted, tint: "#F1F3F6" };
  }
}

export function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { highContrast, darkMode } = useInnovatorA11y();
  return (
    <View
      style={[
        uiStyles.card,
        darkMode ? { borderColor: "rgba(240,220,200,0.12)" } : null,
        highContrast ? uiStyles.cardHighContrast : null,
        style,
      ]}
    >
      <FrostedSurface variant="card" borderRadius={20} />
      {children}
    </View>
  );
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const { fs } = useInnovatorA11y();
  const app = statusAppearance(status);
  return (
    <View style={[uiStyles.badge, { backgroundColor: app.tint }]}>
      <View style={[uiStyles.badgeDot, { backgroundColor: app.color }]} />
      <Text style={{ color: app.color, fontSize: fs("caption"), fontWeight: "700" }}>
        {label ?? status}
      </Text>
    </View>
  );
}

export function SubscreenHero({
  icon,
  color,
  tint,
  eyebrow,
  title,
  badge,
  summary,
}: {
  icon: InnovatorIconName;
  color: string;
  tint: string;
  eyebrow: string;
  title: string;
  badge: string;
  summary: string;
}) {
  const { fs, highContrast, darkMode } = useInnovatorA11y();
  const darkInk = darkMode ? "#f0e8e0" : adminStyleColors.navy;
  const darkSubtle = darkMode ? "#b8a898" : adminStyleColors.subtle;
  return (
    <View style={[uiStyles.subscreenHero, darkMode ? { borderColor: "rgba(240,220,200,0.12)" } : null, highContrast ? uiStyles.cardHighContrast : null]}>
      <FrostedSurface variant="card" borderRadius={22} />
      <View style={uiStyles.subscreenTop}>
        <View style={[uiStyles.subscreenIcon, { backgroundColor: tint }]}>
          <InnovatorIcon name={icon} color={color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[uiStyles.subscreenEyebrow, { fontSize: fs("caption"), color: darkSubtle }]}>{eyebrow}</Text>
          <Text accessibilityRole="header" style={[uiStyles.subscreenTitle, { fontSize: fs("title"), color: darkInk }]}>
            {title}
          </Text>
        </View>
        <View style={[uiStyles.rowBadge, { backgroundColor: tint }]}>
          <Text style={{ color, fontSize: fs("caption"), fontWeight: "700" }}>{badge}</Text>
        </View>
      </View>
      <Text style={{ color: darkSubtle, fontSize: fs("subbody"), lineHeight: 19 }}>
        {summary}
      </Text>
    </View>
  );
}

export function MiniBars({ color }: { color: string }) {
  return (
    <View accessible={false} style={uiStyles.miniBars}>
      {[7, 11, 8, 15, 12, 20, 17].map((height, i) => (
        <View
          key={i}
          style={{
            width: 4,
            height,
            borderRadius: 2,
            backgroundColor: color,
            opacity: i === 6 ? 1 : 0.35 + i * 0.07,
          }}
        />
      ))}
    </View>
  );
}

export function MetricTile({
  label,
  value,
  caption,
  icon,
  color,
  onPress,
}: {
  label: string;
  value: string;
  caption: string;
  icon: InnovatorIconName;
  color: string;
  onPress?: () => void;
}) {
  const { fs, highContrast, darkMode } = useInnovatorA11y();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`${label}: ${value}. ${caption}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        uiStyles.metric,
        darkMode ? { borderColor: "rgba(240,220,200,0.12)" } : null,
        highContrast ? uiStyles.cardHighContrast : null,
        pressed && onPress ? { opacity: 0.68 } : null,
      ]}
    >
      <FrostedSurface variant="card" borderRadius={18} />
      <View style={uiStyles.metricTop}>
        <View style={[uiStyles.metricIcon, { backgroundColor: color + "22" }]}>
          <InnovatorIcon name={icon} color={color} />
        </View>
        <Text style={[uiStyles.metricValue, { fontSize: fs("title"), color: darkMode ? "#f0e8e0" : adminStyleColors.navy }]}>{value}</Text>
      </View>
      <Text style={[uiStyles.metricLabel, { fontSize: fs("subbody"), color: darkMode ? "#d8cbbd" : "#52606E" }]}>{label}</Text>
      <View style={uiStyles.metricBottom}>
        <Text style={[uiStyles.metricCaption, { fontSize: fs("caption"), color: darkMode ? "#b8a898" : adminStyleColors.subtle }]} numberOfLines={1}>
          {caption}
        </Text>
        <MiniBars color={color} />
      </View>
    </Pressable>
  );
}

export function IconRow({
  title,
  detail,
  icon,
  color = adminStyleColors.blue,
  tint = "#EAF1FC",
  badge,
  last = false,
  onPress,
  children,
}: {
  title: string;
  detail?: string;
  icon: InnovatorIconName;
  color?: string;
  tint?: string;
  badge?: string;
  last?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const { fs, darkMode } = useInnovatorA11y();
  const darkInk = darkMode ? "#f0e8e0" : adminStyleColors.navy;
  const darkSubtle = darkMode ? "#b8a898" : adminStyleColors.subtle;
  const content = (
    <>
      <View accessible={false} style={[uiStyles.rowIcon, { backgroundColor: tint }]}>
        <InnovatorIcon name={icon} color={color} />
      </View>
      <View style={uiStyles.rowBody}>
        <View style={uiStyles.rowTop}>
          <Text style={[uiStyles.rowTitle, { fontSize: fs("body"), color: darkInk }]} numberOfLines={2}>
            {title}
          </Text>
          {badge ? (
            <View style={[uiStyles.rowBadge, { backgroundColor: tint }]}>
              <Text style={{ color, fontSize: fs("caption"), fontWeight: "700" }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {detail ? (
          <Text style={{ color: darkSubtle, fontSize: fs("subbody"), lineHeight: 19 }} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
        {children ? <View style={uiStyles.tags}>{children}</View> : null}
      </View>
      {onPress ? (
        <Text style={[uiStyles.chevron, darkMode && { color: "#b8a898" }]} accessible={false}>
          {"\u203a"}
        </Text>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[uiStyles.row, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }, last && { borderBottomWidth: 0 }]}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      onPress={onPress}
      style={({ pressed }) => [
        uiStyles.row,
        darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" },
        last && { borderBottomWidth: 0 },
        pressed && { backgroundColor: darkMode ? "rgba(240,220,200,0.08)" : "rgba(247,242,235,0.65)" },
      ]}
    >
      {content}
    </Pressable>
  );
}

export function FrostedSearchPill({
  value,
  onChangeText,
  placeholder,
  rightButton,
}: {
  value: string;
  onChangeText: (txt: string) => void;
  placeholder: string;
  rightButton?: React.ReactNode;
}) {
  const { fs, highContrast, darkMode } = useInnovatorA11y();
  return (
    <View style={uiStyles.toolbar}>
      <View style={[uiStyles.pillSearch, darkMode ? { borderColor: "rgba(240,220,200,0.14)" } : null, highContrast ? uiStyles.cardHighContrast : null]}>
        <FrostedSurface variant="bar" borderRadius={24} />
        <InnovatorIcon name="search" color={darkMode ? "#b8a898" : "#8B929C"} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={darkMode ? "#907860" : "#8B929C"}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={[uiStyles.pillSearchInput, { fontSize: fs("body"), color: darkMode ? "#f0e8e0" : adminStyleColors.navy }]}
        />
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => onChangeText("")}
            style={[uiStyles.clearSearch, darkMode && { backgroundColor: "#2e2416" }]}
          >
            <Text style={[uiStyles.clearText, darkMode && { color: "#f0e8e0" }]}>{"\u00d7"}</Text>
          </Pressable>
        ) : null}
      </View>
      {rightButton}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  compact = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { fs, highContrast, darkMode } = useInnovatorA11y();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        uiStyles.buttonBase,
        compact ? uiStyles.buttonCompact : null,
        variant === "primary"
          ? uiStyles.buttonPrimary
          : variant === "danger"
            ? uiStyles.buttonDanger
            : [uiStyles.buttonSecondary, darkMode ? { backgroundColor: "#252018", borderColor: "rgba(240,220,200,0.18)" } : null],
        highContrast && variant === "secondary" ? uiStyles.buttonSecondaryHighContrast : null,
        pressed && !isDisabled ? { opacity: 0.72 } : null,
        isDisabled ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "secondary" ? (darkMode ? "#f0e8e0" : adminStyleColors.navy) : adminStyleColors.white}
        />
      ) : null}
      <Text
        style={{
          color: variant === "secondary" ? (darkMode ? "#f0e8e0" : adminStyleColors.navy) : adminStyleColors.white,
          fontSize: fs(compact ? "subbody" : "body"),
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const { fs, darkMode } = useInnovatorA11y();
  return (
    <View style={uiStyles.sectionHeadRow}>
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? (
          <Text style={[uiStyles.eyebrow, { fontSize: fs("caption"), color: darkMode ? "#b8a898" : adminStyleColors.subtle }]}>{eyebrow}</Text>
        ) : null}
        <Text accessibilityRole="header" style={[uiStyles.sectionTitle, { fontSize: fs("heading"), color: darkMode ? "#f0e8e0" : adminStyleColors.navy }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[uiStyles.sectionSubtitle, { fontSize: fs("subbody"), color: darkMode ? "#b8a898" : adminStyleColors.subtle }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function FormField({
  label,
  hint,
  counterText,
  counterOk,
  children,
}: {
  label: string;
  hint?: string;
  counterText?: string;
  counterOk?: boolean;
  children: React.ReactNode;
}) {
  const { fs, darkMode } = useInnovatorA11y();
  return (
    <View style={uiStyles.fieldWrap}>
      <View style={uiStyles.fieldLabelRow}>
        <Text style={[uiStyles.fieldLabel, { fontSize: fs("subbody"), color: darkMode ? "#f0e8e0" : adminStyleColors.navy }]}>{label}</Text>
        {counterText ? (
          <View
            style={[
              uiStyles.counterPill,
              { backgroundColor: counterOk ? (darkMode ? "#17332d" : "#E4F4F0") : (darkMode ? "#252018" : "#F3EFEA") },
            ]}
          >
            <Text
              style={{
                fontSize: fs("caption"),
                fontWeight: "700",
                color: counterOk ? (darkMode ? "#4fb5a6" : adminStyleColors.teal) : (darkMode ? "#b8a898" : adminStyleColors.muted),
              }}
            >
              {counterText}
            </Text>
          </View>
        ) : null}
      </View>
      {hint ? <Text style={[uiStyles.fieldHint, { fontSize: fs("caption"), color: darkMode ? "#b8a898" : adminStyleColors.subtle }]}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function FrostedInput({ multiline, style, ...props }: TextInputProps) {
  const { fs, highContrast, darkMode } = useInnovatorA11y();
  return (
    <TextInput
      placeholderTextColor={darkMode ? "#907860" : adminStyleColors.subtle}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      {...props}
      style={[
        uiStyles.input,
        darkMode ? { backgroundColor: "#252018", borderColor: "rgba(240,220,200,0.16)", color: "#f0e8e0" } : null,
        multiline ? uiStyles.inputMultiline : null,
        highContrast ? uiStyles.inputHighContrast : null,
        { fontSize: fs("body") },
        style,
      ]}
    />
  );
}

export function ChoiceChips({
  options,
  selected,
  onSelect,
  multi = false,
}: {
  options: readonly string[];
  selected: string | string[];
  onSelect: (next: string) => void;
  multi?: boolean;
}) {
  const { fs, highContrast, darkMode } = useInnovatorA11y();
  const isSelected = (opt: string) =>
    multi ? Array.isArray(selected) && selected.includes(opt) : selected === opt;

  return (
    <View style={uiStyles.chipsWrap}>
      {options.map((opt) => {
        const active = isSelected(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            accessibilityRole={multi ? "checkbox" : "radio"}
            accessibilityState={{ checked: active, selected: active }}
            style={[
              uiStyles.chip,
              darkMode && !active ? { backgroundColor: "#252018", borderColor: "rgba(240,220,200,0.16)" } : null,
              active ? uiStyles.chipActive : null,
              highContrast && !active ? uiStyles.chipHighContrast : null,
            ]}
          >
            <Text
              style={{
                fontSize: fs("subbody"),
                fontWeight: active ? "700" : "500",
                color: active ? adminStyleColors.white : (darkMode ? "#d8cbbd" : adminStyleColors.muted),
              }}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SwitchRow({
  label,
  detail,
  value,
  onValueChange,
  last = false,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  last?: boolean;
}) {
  const { fs, darkMode } = useInnovatorA11y();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={[uiStyles.switchRow, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }, last && { borderBottomWidth: 0 }]}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: fs("body"), fontWeight: "600", color: darkMode ? "#f0e8e0" : adminStyleColors.navy }}>
          {label}
        </Text>
        {detail ? (
          <Text style={{ fontSize: fs("subbody"), color: darkMode ? "#b8a898" : adminStyleColors.subtle, marginTop: 2, lineHeight: 19 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: darkMode ? "rgba(240,220,200,0.22)" : "rgba(25,44,64,0.18)", true: adminStyleColors.rust }}
        thumbColor={adminStyleColors.white}
      />
    </Pressable>
  );
}

export function ProgressBar({
  percent,
  height = 5,
  color = adminStyleColors.rust,
}: {
  percent: number;
  height?: number;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View style={[uiStyles.progressTrack, { height }]}>
      <View style={[uiStyles.progressFill, { width: `${clamped}%`, height, backgroundColor: color }]} />
    </View>
  );
}

export function FactRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const { fs, darkMode } = useInnovatorA11y();
  return (
    <View style={[uiStyles.factRow, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }, last && { borderBottomWidth: 0 }]}>
      <Text style={[uiStyles.factLabel, { fontSize: fs("caption"), color: darkMode ? "#b8a898" : adminStyleColors.subtle }]}>{label}</Text>
      <Text style={[uiStyles.factValue, { fontSize: fs("body"), color: darkMode ? "#f0e8e0" : adminStyleColors.navy }]}>{value || "Not recorded"}</Text>
    </View>
  );
}

export function FlushSheetModal({
  visible,
  eyebrow,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { fs, reducedMotion, darkMode } = useInnovatorA11y();
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "slide"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <FrostedModalBackdrop>
        <View style={uiStyles.modalOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close dialog"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={uiStyles.modalKeyboardWrap}
          >
            <View
              accessibilityViewIsModal
              style={[
                uiStyles.sheetContainer,
                darkMode ? { borderColor: "rgba(240,220,200,0.14)" } : null,
                { paddingBottom: Math.max(insets.bottom, 22) },
              ]}
            >
              <FrostedSurface variant="sheet" borderRadius={32} />
              <View style={[uiStyles.sheetHandle, darkMode ? { backgroundColor: "rgba(240,220,200,0.22)" } : null]} />
              <View style={[uiStyles.sheetHeader, darkMode ? { borderBottomColor: "rgba(240,220,200,0.1)" } : null]}>
                <View style={{ flex: 1 }}>
                  <Text style={[uiStyles.sheetEyebrow, { fontSize: fs("caption"), color: darkMode ? "#b8a898" : adminStyleColors.subtle }]}>{eyebrow}</Text>
                  <Text accessibilityRole="header" style={[uiStyles.sheetTitle, { fontSize: fs("heading"), color: darkMode ? "#f0e8e0" : adminStyleColors.navy }]} numberOfLines={2}>
                    {title}
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close dialog"
                  style={[uiStyles.closeCircle, darkMode ? { backgroundColor: "#252018", borderColor: "rgba(240,220,200,0.16)" } : null]}
                >
                  <InnovatorIcon name="close" color={darkMode ? "#f0e8e0" : "#52606E"} />
                </Pressable>
              </View>

              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={uiStyles.sheetScrollContent}
              >
                <View style={uiStyles.modalInnerCard}>{children}</View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </FrostedModalBackdrop>
    </Modal>
  );
}

export function PrivateDocPreviewModal({
  doc,
  token,
  onClose,
}: {
  doc: InnovatorDocument | null;
  token: string;
  onClose: () => void;
}) {
  const { fs } = useInnovatorA11y();
  const [loading, setLoading] = React.useState(false);
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setSignedUrl(null);
    setError(null);
    if (!doc || doc.docKind === "video_link" || !doc.storagePath) return;
    setLoading(true);
    createSignedEvidenceUrl(token, doc.storagePath, 120)
      .then((url) => {
        if (active) setSignedUrl(url);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not generate private link.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [doc, token]);

  const isImage = Boolean(doc?.mimeType?.toLowerCase().startsWith("image/"));

  return (
    <FlushSheetModal
      visible={Boolean(doc)}
      eyebrow="PRIVATE EVIDENCE PREVIEW"
      title={doc?.title || doc?.fileName || "Document preview"}
      onClose={onClose}
    >
      {doc ? (
        <View style={{ gap: 10 }}>
          <FactRow label="Application" value={doc.applicationRef} />
          <FactRow label="Section" value={doc.sectionKey} />
          <FactRow label="File / Link" value={doc.docKind === "video_link" ? doc.videoUrl || "" : doc.fileName} />
          <FactRow
            label="Size & version"
            value={doc.docKind === "video_link" ? "HTTPS Video Link" : `${formatBytes(doc.fileSize)} • v${doc.version || 1}`}
            last
          />

          {doc.docKind === "video_link" && doc.videoUrl ? (
            <ActionButton
              label="Open external HTTPS video"
              onPress={() => void Linking.openURL(doc.videoUrl!)}
            />
          ) : loading ? (
            <View style={{ paddingVertical: 18, alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={adminStyleColors.rust} />
              <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }}>
                Authorizing 120-second private link...
              </Text>
            </View>
          ) : error ? (
            <Text style={{ fontSize: fs("subbody"), color: "#9A3026", fontWeight: "600" }}>
              {error}
            </Text>
          ) : signedUrl ? (
            <View style={{ gap: 12 }}>
              {isImage ? (
                <Image
                  source={{ uri: signedUrl }}
                  style={uiStyles.previewImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={uiStyles.securityBanner}>
                  <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.amber, fontWeight: "600" }}>
                    Temporary private access URL expires automatically in 120 seconds. Open in your device viewer to read or save.
                  </Text>
                </View>
              )}
              <ActionButton
                label="Open / Download private file"
                onPress={() => void Linking.openURL(signedUrl)}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </FlushSheetModal>
  );
}

const iconStyles = StyleSheet.create({
  box: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  dot: { width: 4, height: 4, borderRadius: 2 },
});

const subtleHairline = "rgba(36, 28, 25, 0.07)";
const softShadow = {
  shadowColor: "#241C19",
  shadowOpacity: 0.05,
  shadowOffset: { width: 0, height: 6 },
  shadowRadius: 14,
  elevation: 2,
} as const;

const uiStyles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 16,
    gap: 12,
    overflow: "hidden",
    ...softShadow,
  },
  cardHighContrast: { borderWidth: 1.5, borderColor: "rgba(25,44,64,0.42)" },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  subscreenHero: {
    borderRadius: 22,
    padding: 18,
    gap: 10,
    overflow: "hidden",
    ...softShadow,
  },
  subscreenTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  subscreenIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  subscreenEyebrow: {
    fontWeight: "700",
    letterSpacing: 1.1,
    color: adminStyleColors.subtle,
    textTransform: "uppercase",
  },
  subscreenTitle: {
    fontWeight: "700",
    letterSpacing: -0.6,
    color: adminStyleColors.navy,
  },
  rowBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  metric: {
    flexBasis: "45%",
    flexGrow: 1,
    borderRadius: 20,
    padding: 14,
    gap: 8,
    overflow: "hidden",
    ...softShadow,
  },
  metricTop: { flexDirection: "row", alignItems: "center", gap: 9, flexWrap: "wrap" },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontWeight: "700",
    letterSpacing: -0.6,
    color: adminStyleColors.navy,
  },
  metricLabel: { fontWeight: "600", color: "#52606E" },
  metricBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 4,
  },
  metricCaption: { color: adminStyleColors.subtle, flexShrink: 1 },
  miniBars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 58,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: subtleHairline,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  rowBody: { flex: 1, gap: 4 },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowTitle: { color: adminStyleColors.navy, fontWeight: "600", flexShrink: 1 },
  chevron: { color: "#A1A8B1", fontSize: 22 },
  tags: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 },
  toolbar: { flexDirection: "row", gap: 10, alignItems: "center" },
  pillSearch: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 14,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#241C19",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 1,
  },
  pillSearchInput: {
    flex: 1,
    minWidth: 0,
    color: adminStyleColors.navy,
    minHeight: 44,
    paddingVertical: 10,
    paddingRight: 8,
  },
  clearSearch: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  clearText: { color: adminStyleColors.subtle, fontSize: 22 },
  buttonBase: {
    minHeight: 42,
    borderRadius: buttonCornerRadius,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonCompact: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  buttonPrimary: { backgroundColor: adminStyleColors.rust },
  buttonDanger: { backgroundColor: "#9A3026" },
  buttonSecondary: { backgroundColor: "rgba(243,239,234,0.94)" },
  buttonSecondaryHighContrast: {
    borderWidth: 1.5,
    borderColor: adminStyleColors.navy,
  },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  eyebrow: {
    color: adminStyleColors.subtle,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  sectionTitle: {
    color: adminStyleColors.navy,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: adminStyleColors.subtle,
    marginTop: 2,
    lineHeight: 19,
  },
  fieldWrap: { gap: 7 },
  fieldLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  fieldLabel: { color: adminStyleColors.navy, fontWeight: "700" },
  counterPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fieldHint: { color: adminStyleColors.subtle, lineHeight: 18 },
  input: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: adminStyleColors.navy,
    backgroundColor: "rgba(255, 255, 255, 0.88)",
  },
  inputMultiline: { minHeight: 96, paddingTop: 12 },
  inputHighContrast: { borderWidth: 1.5, borderColor: adminStyleColors.navy },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 7,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(255, 250, 244, 0.90)",
  },
  chipActive: {
    backgroundColor: adminStyleColors.navy,
  },
  chipHighContrast: { borderWidth: 1.5, borderColor: "rgba(25,44,64,0.45)" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: subtleHairline,
  },
  progressTrack: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: "#EEF2F6",
    overflow: "hidden",
  },
  progressFill: { borderRadius: 999 },
  factRow: {
    gap: 4,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: subtleHairline,
  },
  factLabel: { color: adminStyleColors.subtle, fontWeight: "600" },
  factValue: { color: adminStyleColors.navy, fontWeight: "500", lineHeight: 22 },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalKeyboardWrap: { width: "100%", maxHeight: "90%" },
  sheetContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
    paddingTop: 10,
    paddingHorizontal: 18,
    gap: 14,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(101,86,77,0.24)",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sheetEyebrow: {
    fontWeight: "700",
    letterSpacing: 1.1,
    color: "#4A5564",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  sheetTitle: { color: adminStyleColors.navy, fontWeight: "700" },
  closeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F1EC",
    borderWidth: 1,
    borderColor: "#E5DDD3",
    shadowColor: "#241C19",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  sheetScrollContent: { gap: 14, paddingBottom: 8 },
  modalInnerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DDD3",
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    backgroundColor: "#EEF2F6",
  },
  securityBanner: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#FCF4E4",
  },
});
