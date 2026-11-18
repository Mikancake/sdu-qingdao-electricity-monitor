import { useEffect, useMemo, useState } from "react";
import { Palette, Save, X } from "lucide-react";

import {
  DEFAULT_APPEARANCE_SETTINGS,
  applyAppearanceSettings,
  applyStoredAppearanceSettings,
  normalizeAppearanceSettings,
  saveAppearanceSettings
} from "../lib/appearance";
import type { AppearanceSettings } from "../lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Label } from "./ui/input";

const appearancePositions: Array<{ key: AppearanceSettings["background_position"]; label: string }> = [
  { key: "top", label: "顶部" },
  { key: "center", label: "居中" },
  { key: "bottom", label: "底部" }
];

const glassEffectModes: Array<{ key: AppearanceSettings["glass_effect_mode"]; label: string; description: string }> = [
  { key: "lite", label: "轻量玻璃", description: "清晰克制，适合纯色或细节较少的背景。" },
  { key: "liquid", label: "液态玻璃", description: "通透、柔和反射，突出导航与交互控件。" },
  { key: "frosted", label: "细腻毛玻璃", description: "均匀磨砂和柔化纹理，适合照片背景。" }
];

type AppearanceTuning = Pick<
  AppearanceSettings,
  "background_overlay_opacity" | "background_blur_px" | "glass_card_opacity" | "glass_blur_px"
>;

const glassModeDefaults: Record<AppearanceSettings["glass_effect_mode"], AppearanceTuning> = {
  lite: {
    background_overlay_opacity: 0.5,
    background_blur_px: 0,
    glass_card_opacity: 0.78,
    glass_blur_px: 3
  },
  liquid: {
    background_overlay_opacity: 0.34,
    background_blur_px: 3,
    glass_card_opacity: 0.46,
    glass_blur_px: 12
  },
  frosted: {
    background_overlay_opacity: 0.4,
    background_blur_px: 10,
    glass_card_opacity: 0.58,
    glass_blur_px: 14
  }
};

const glassPresets: Array<{ key: string; label: string; description: string; values: AppearanceTuning }> = [
  {
    key: "clear",
    label: "清晰",
    description: "高可读性",
    values: { background_overlay_opacity: 0.56, background_blur_px: 0, glass_card_opacity: 0.8, glass_blur_px: 4 }
  },
  {
    key: "balanced",
    label: "均衡",
    description: "日常推荐",
    values: { background_overlay_opacity: 0.42, background_blur_px: 6, glass_card_opacity: 0.62, glass_blur_px: 10 }
  },
  {
    key: "transparent",
    label: "通透",
    description: "突出背景",
    values: { background_overlay_opacity: 0.28, background_blur_px: 12, glass_card_opacity: 0.42, glass_blur_px: 15 }
  }
];

type AppearanceNumberSettingKey =
  | "background_overlay_opacity"
  | "background_blur_px"
  | "glass_card_opacity"
  | "glass_blur_px";

export function AppearanceSettingsPanel({
  appearance,
  saving,
  onSave,
  onUploadBackground
}: {
  appearance: AppearanceSettings;
  saving: boolean;
  onSave: (payload: Partial<AppearanceSettings>, onSuccess: () => void) => void;
  onUploadBackground: (
    theme: "light" | "dark",
    file: File
  ) => Promise<{ theme: "light" | "dark"; url: string; blurred_url: string }>;
}) {
  const saved = useMemo(() => normalizeAppearanceSettings(appearance), [appearance]);
  const [draft, setDraft] = useState<AppearanceSettings | null>(null);
  const appearanceForm = draft ?? saved;
  const dirty = draft !== null;
  const [uploadingTheme, setUploadingTheme] = useState<"light" | "dark" | null>(null);
  const busy = saving || uploadingTheme !== null;

  useEffect(() => { saveAppearanceSettings(saved); }, [saved]);
  useEffect(() => () => applyStoredAppearanceSettings(), []);

  useEffect(() => {
    applyAppearanceSettings(appearanceForm);
  }, [appearanceForm, saved]);

  function setAppearanceValue<K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) {
    setDraft((current) => ({ ...(current ?? saved), [key]: value }));
  }

  function setAppearanceNumber(key: AppearanceNumberSettingKey, value: string) {
    setAppearanceValue(key, Number(value));
  }

  function saveGlobal() {
    onSave(normalizeAppearanceSettings(appearanceForm), () => setDraft(null));
  }

  function resetGlobal() {
    setDraft({ ...DEFAULT_APPEARANCE_SETTINGS });
  }

  function selectGlassMode(mode: AppearanceSettings["glass_effect_mode"]) {
    setDraft((current) => ({ ...(current ?? saved), glass_effect_mode: mode, ...glassModeDefaults[mode] }));
  }

  function applyGlassPreset(values: AppearanceTuning) {
    setDraft((current) => ({ ...(current ?? saved), ...values }));
  }

  function setBackground(theme: "light" | "dark", url: string | null, blurred: string | null) {
    setDraft((current) => {
      const base = current ?? saved;
      if (theme === "dark") return { ...base, dark_background_image_url: url, dark_background_blurred_url: blurred };
      return { ...base, background_image_url: url, light_background_image_url: url, light_background_blurred_url: blurred,
        dark_background_blurred_url: base.dark_background_image_url ? base.dark_background_blurred_url : null };
    });
  }

  async function uploadBackground(theme: "light" | "dark", file?: File) {
    if (!file || busy) {
      return;
    }
    setUploadingTheme(theme);
    try {
      const result = await onUploadBackground(theme, file);
      setBackground(theme, result.url, result.blurred_url);
    } catch {
      // The upload mutation reports the server error; leave the draft unchanged.
    } finally {
      setUploadingTheme(null);
    }
  }

  function renderPreviewContent() {
    return (
      <div className="grid content-start gap-3 sm:grid-cols-2">
        <div className="glass-card rounded-lg border border-border/70 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">宿舍 A</span>
            <Badge tone="success">正常</Badge>
          </div>
          <div className="mt-4 h-2 rounded-full bg-primary/70" />
          <div className="mt-3 text-xs text-muted-foreground">余额 36.8 kWh</div>
        </div>
        <div className="glass-card rounded-lg border border-border/70 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">宿舍 B</span>
            <Badge tone="warning">关注</Badge>
          </div>
          <div className="mt-4 h-2 rounded-full bg-warning/80" />
          <div className="mt-3 text-xs text-muted-foreground">剩余 3 天</div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted/80 text-muted-foreground">
          <Palette size={18} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>前端外观</CardTitle>
            <Badge tone={dirty ? "warning" : "success"}>{dirty ? "未保存预览" : "全局配置"}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">管理员统一设置登录页、用户端和管理后台的背景与玻璃卡片参数。</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <fieldset aria-label="外观设置" disabled={busy} aria-busy={busy} className="grid min-w-0 gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="appearance-light-bg-url">亮色背景图</Label>
                <Input
                  id="appearance-light-bg-url"
                  value={appearanceForm.light_background_image_url ?? ""}
                  onChange={(event) => setBackground("light", event.target.value || null, null)}
                  placeholder="https://example.com/light.jpg 或 /uploads/..."
                />
                <Input
                  className="mt-2"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  aria-label="上传亮色背景图"
                  onChange={(event) => {
                    void uploadBackground("light", event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <div>
                <Label htmlFor="appearance-dark-bg-url">暗色背景图</Label>
                <Input
                  id="appearance-dark-bg-url"
                  value={appearanceForm.dark_background_image_url ?? ""}
                  onChange={(event) => setBackground("dark", event.target.value || null, null)}
                  placeholder="https://example.com/dark.jpg 或 /uploads/..."
                />
                <Input
                  className="mt-2"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  aria-label="上传暗色背景图"
                  onChange={(event) => {
                    void uploadBackground("dark", event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            </div>

            <div>
              <Label>背景位置</Label>
              <div className="grid grid-cols-3 gap-2">
                {appearancePositions.map((item) => (
                  <Button
                    key={item.key}
                    size="sm"
                    variant={appearanceForm.background_position === item.key ? "primary" : "secondary"}
                    aria-pressed={appearanceForm.background_position === item.key}
                    onClick={() => setAppearanceValue("background_position", item.key)}
                    type="button"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label>玻璃渲染模式</Label>
              <p className="mb-2 text-xs leading-5 text-muted-foreground">选择模式会载入推荐参数，随后仍可用下方滑块微调。</p>
              <div className="grid gap-2 md:grid-cols-3">
                {glassEffectModes.map((item) => (
                  <button
                    key={item.key}
                    aria-pressed={appearanceForm.glass_effect_mode === item.key}
                    className="appearance-material-option"
                    data-active={appearanceForm.glass_effect_mode === item.key ? "true" : "false"}
                    onClick={() => selectGlassMode(item.key)}
                    type="button"
                  >
                    <span className={`appearance-material-swatch appearance-material-swatch-${item.key}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                        {item.label}
                        {appearanceForm.glass_effect_mode === item.key ? <span className="appearance-selected-dot" /> : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>材质预设</Label>
              <div className="grid grid-cols-3 gap-2">
                {glassPresets.map((preset) => (
                  <button
                    key={preset.key}
                    className="appearance-preset"
                    onClick={() => applyGlassPreset(preset.values)}
                    type="button"
                  >
                    <span className="text-sm font-semibold text-foreground">{preset.label}</span>
                    <span className="text-[11px] text-muted-foreground">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="appearance-control-card">
                <Label className="flex items-center justify-between gap-3" htmlFor="appearance-overlay">
                  <span>页面遮罩</span>
                  <span className="appearance-value">{Math.round(appearanceForm.background_overlay_opacity * 100)}%</span>
                </Label>
                <input
                  id="appearance-overlay"
                  className="glass-range"
                  type="range"
                  min="0.16"
                  max="0.82"
                  step="0.01"
                  value={appearanceForm.background_overlay_opacity}
                  onChange={(event) => setAppearanceNumber("background_overlay_opacity", event.target.value)}
                />
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">数值越高，文字与背景的对比越清晰。</p>
              </div>
              <div className="appearance-control-card">
                <Label className="flex items-center justify-between gap-3" htmlFor="appearance-bg-blur">
                  <span>背景柔化</span>
                  <span className="appearance-value">{appearanceForm.background_blur_px}px</span>
                </Label>
                <input
                  id="appearance-bg-blur"
                  className="glass-range"
                  type="range"
                  min="0"
                  max="18"
                  step="1"
                  value={appearanceForm.background_blur_px}
                  onChange={(event) => setAppearanceNumber("background_blur_px", event.target.value)}
                />
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">上传图片会使用优化后的纹理，避免滚动时重复计算。</p>
              </div>
              <div className="appearance-control-card">
                <Label className="flex items-center justify-between gap-3" htmlFor="appearance-card-opacity">
                  <span>材质厚度</span>
                  <span className="appearance-value">{Math.round(appearanceForm.glass_card_opacity * 100)}%</span>
                </Label>
                <input
                  id="appearance-card-opacity"
                  className="glass-range"
                  type="range"
                  min="0.28"
                  max="0.94"
                  step="0.01"
                  value={appearanceForm.glass_card_opacity}
                  onChange={(event) => setAppearanceNumber("glass_card_opacity", event.target.value)}
                />
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">调节纸面与玻璃的融合程度；始终保留可读底色，避免背景干扰数据。</p>
              </div>
              <div className="appearance-control-card">
                <Label className="flex items-center justify-between gap-3" htmlFor="appearance-card-blur">
                  <span>材质柔化强度</span>
                  <span className="appearance-value">{appearanceForm.glass_blur_px}px</span>
                </Label>
                <input
                  id="appearance-card-blur"
                  className="glass-range"
                  type="range"
                  min="0"
                  max="16"
                  step="1"
                  value={appearanceForm.glass_blur_px}
                  onChange={(event) => setAppearanceNumber("glass_blur_px", event.target.value)}
                />
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">调节玻璃卡片背后的柔化程度；轻量模式不使用模糊。</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={!dirty || busy} onClick={saveGlobal} type="button">
                <Save size={16} />
                保存全局外观
              </Button>
              <Button disabled={saving} onClick={resetGlobal} type="button" variant="secondary">
                <X size={16} />
                预览默认外观
              </Button>
              {dirty && <Button variant="ghost" type="button" onClick={() => setDraft(null)}>放弃预览</Button>}
            </div>
          </fieldset>

          <div className="grid gap-3">
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">亮色预览</div>
              <div className="appearance-preview appearance-preview-light overflow-hidden rounded-lg border border-border/70 p-4">
                {renderPreviewContent()}
              </div>
            </div>
            <div className="dark">
              <div className="mb-2 text-xs font-medium text-muted-foreground">暗色预览</div>
              <div className="appearance-preview appearance-preview-dark overflow-hidden rounded-lg border border-border/70 p-4">
                {renderPreviewContent()}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
