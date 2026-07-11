import type { AppearanceSettings } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
export const APPEARANCE_STORAGE_KEY = "sdu-electricity-appearance";

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  background_image_url: null,
  light_background_image_url: null,
  dark_background_image_url: null,
  light_background_blurred_url: null,
  dark_background_blurred_url: null,
  background_position: "center",
  background_overlay_opacity: 0.42,
  background_blur_px: 0,
  glass_card_opacity: 0.62,
  glass_blur_px: 10,
  glass_effect_mode: "lite"
};

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, next));
}

function normalizeBackgroundPosition(value: unknown): AppearanceSettings["background_position"] {
  if (value === "top" || value === "center" || value === "bottom") {
    return value;
  }
  return DEFAULT_APPEARANCE_SETTINGS.background_position;
}

function normalizeGlassEffectMode(value: unknown): AppearanceSettings["glass_effect_mode"] {
  if (value === "frosted" || value === "liquid") {
    return value;
  }
  return "lite";
}

export function normalizeAppearanceSettings(settings?: Partial<AppearanceSettings> | null): AppearanceSettings {
  const lightBackground = settings?.light_background_image_url?.trim() || settings?.background_image_url?.trim() || null;
  const darkBackground = settings?.dark_background_image_url?.trim() || null;
  const lightBlurred = settings?.light_background_blurred_url?.trim() || null;
  const darkBlurred = settings?.dark_background_blurred_url?.trim() || (!darkBackground ? lightBlurred : null);
  return {
    background_image_url: lightBackground,
    light_background_image_url: lightBackground,
    dark_background_image_url: darkBackground,
    light_background_blurred_url: lightBlurred,
    dark_background_blurred_url: darkBlurred,
    background_position: normalizeBackgroundPosition(settings?.background_position),
    background_overlay_opacity: clamp(
      settings?.background_overlay_opacity,
      0.16,
      0.82,
      DEFAULT_APPEARANCE_SETTINGS.background_overlay_opacity
    ),
    background_blur_px: clamp(settings?.background_blur_px, 0, 18, DEFAULT_APPEARANCE_SETTINGS.background_blur_px),
    glass_card_opacity: clamp(settings?.glass_card_opacity, 0.28, 0.94, DEFAULT_APPEARANCE_SETTINGS.glass_card_opacity),
    glass_blur_px: clamp(settings?.glass_blur_px, 0, 16, DEFAULT_APPEARANCE_SETTINGS.glass_blur_px),
    glass_effect_mode: normalizeGlassEffectMode(settings?.glass_effect_mode)
  };
}

function safeCssUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "none";
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "data:") {
      return "none";
    }
    const lowerPath = parsed.pathname.toLowerCase();
    if (/\.(gif|mp4|webm|mov|m4v|avi)$/.test(lowerPath) || parsed.href.toLowerCase().startsWith("data:image/gif")) {
      return "none";
    }
  } catch {
    return "none";
  }

  return `url("${trimmed.replace(/["\\\n\r]/g, "")}")`;
}

export function readStoredAppearanceSettings(): AppearanceSettings {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return normalizeAppearanceSettings(raw ? (JSON.parse(raw) as Partial<AppearanceSettings>) : null);
  } catch {
    return { ...DEFAULT_APPEARANCE_SETTINGS };
  }
}

export function applyAppearanceSettings(settings?: Partial<AppearanceSettings> | null) {
  const next = normalizeAppearanceSettings(settings);
  const root = document.documentElement;
  root.style.setProperty("--app-bg-image", safeCssUrl(next.light_background_image_url));
  root.style.setProperty("--app-bg-image-light", safeCssUrl(next.light_background_image_url));
  root.style.setProperty("--app-bg-image-dark", safeCssUrl(next.dark_background_image_url ?? next.light_background_image_url));
  root.style.setProperty(
    "--app-bg-image-blurred-light",
    safeCssUrl(next.light_background_blurred_url ?? next.light_background_image_url)
  );
  root.style.setProperty(
    "--app-bg-image-blurred-dark",
    safeCssUrl(
      next.dark_background_blurred_url ??
        next.dark_background_image_url ??
        next.light_background_blurred_url ??
        next.light_background_image_url
    )
  );
  root.style.setProperty("--app-bg-position", next.background_position ?? "center");
  root.style.setProperty("--app-bg-overlay-opacity", String(next.background_overlay_opacity));
  root.style.setProperty("--app-bg-blur", `${next.background_blur_px}px`);
  root.style.setProperty("--app-bg-blur-ratio", String(next.background_blur_px / 18));
  root.style.setProperty("--glass-card-opacity", String(next.glass_card_opacity));
  root.style.setProperty("--glass-card-blur", `${next.glass_blur_px}px`);
  root.style.setProperty("--glass-blur-ratio", String(next.glass_blur_px / 16));
  root.style.setProperty("--glass-material-strength", String(0.28 + (next.glass_blur_px / 16) * 0.42));
  root.dataset.glassMode = next.glass_effect_mode;
  root.dataset.backgroundBlur = next.background_blur_px > 0 ? "on" : "off";
  root.dataset.preblurLight = next.light_background_blurred_url ? "on" : "off";
  root.dataset.preblurDark = next.dark_background_blurred_url ? "on" : "off";
}

export function applyStoredAppearanceSettings() {
  applyAppearanceSettings(readStoredAppearanceSettings());
}

export function saveAppearanceSettings(settings: Partial<AppearanceSettings>) {
  const next = normalizeAppearanceSettings(settings);
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
  applyAppearanceSettings(next);
  return next;
}

export async function loadGlobalAppearanceSettings() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/appearance`);
    if (!response.ok) {
      return readStoredAppearanceSettings();
    }
    const settings = normalizeAppearanceSettings((await response.json()) as Partial<AppearanceSettings>);
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
    applyAppearanceSettings(settings);
    return settings;
  } catch {
    return readStoredAppearanceSettings();
  }
}
