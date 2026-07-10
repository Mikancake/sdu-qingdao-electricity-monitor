import { useEffect, useState } from "react";
import { Palette, Save, X } from "lucide-react";

import {
  DEFAULT_APPEARANCE_SETTINGS,
  applyAppearanceSettings,
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
  { key: "lite", label: "轻量玻璃", description: "清晰、低开销，适合纯色或细节较少的背景。" },
  { key: "liquid", label: "Liquid Glass", description: "导航与控件呈现环境材质，内容区域保持清晰。" },
  { key: "frosted", label: "小米式毛玻璃", description: "复用上传时生成的预模糊纹理，滚动时无需实时计算。" }
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
  appearance?: AppearanceSettings | null;
  saving: boolean;
  onSave: (payload: Partial<AppearanceSettings>) => void;
  onUploadBackground?: (
    theme: "light" | "dark",
    file: File
  ) => Promise<{ theme: "light" | "dark"; url: string; blurred_url: string }>;
}) {
  const [appearanceForm, setAppearanceForm] = useState<AppearanceSettings>(() => normalizeAppearanceSettings(appearance));
  const [dirty, setDirty] = useState(false);
  const [uploadingTheme, setUploadingTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    if (appearance) {
      const normalized = normalizeAppearanceSettings(appearance);
      setAppearanceForm(normalized);
      saveAppearanceSettings(normalized);
      setDirty(false);
    }
  }, [appearance]);

  useEffect(() => {
    applyAppearanceSettings(appearanceForm);
  }, [appearanceForm]);

  function setAppearanceValue<K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) {
    setDirty(true);
    setAppearanceForm((current) => ({ ...current, [key]: value }));
  }

  function setAppearanceNumber(key: AppearanceNumberSettingKey, value: string) {
    setDirty(true);
    setAppearanceForm((current) => ({ ...current, [key]: Number(value) }));
  }

  function saveGlobal() {
    const next = saveAppearanceSettings(appearanceForm);
    setAppearanceForm(next);
    setDirty(false);
    onSave(next);
  }

  function resetGlobal() {
    setAppearanceForm(DEFAULT_APPEARANCE_SETTINGS);
    saveAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS);
    setDirty(false);
    onSave(DEFAULT_APPEARANCE_SETTINGS);
  }

  async function uploadBackground(theme: "light" | "dark", file?: File) {
    if (!file || !onUploadBackground) {
      return;
    }
    setUploadingTheme(theme);
    try {
      const result = await onUploadBackground(theme, file);
      setDirty(true);
      setAppearanceForm((current) => ({
        ...current,
        [theme === "light" ? "light_background_image_url" : "dark_background_image_url"]: result.url,
        [theme === "light" ? "light_background_blurred_url" : "dark_background_blurred_url"]: result.blurred_url
      }));
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
            <Badge tone={dirty ? "warning" : "success"}>{dirty ? "预览中" : "全局配置"}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">管理员统一设置登录页、用户端和管理后台的背景与玻璃卡片参数。</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="appearance-light-bg-url">亮色背景图</Label>
                <Input
                  id="appearance-light-bg-url"
                  value={appearanceForm.light_background_image_url ?? ""}
                  onChange={(event) => {
                    setAppearanceValue("light_background_image_url", event.target.value || null);
                    setAppearanceValue("light_background_blurred_url", null);
                  }}
                  placeholder="https://example.com/light.jpg 或 /uploads/..."
                />
                <Input
                  className="mt-2"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={uploadingTheme === "light"}
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
                  onChange={(event) => {
                    setAppearanceValue("dark_background_image_url", event.target.value || null);
                    setAppearanceValue("dark_background_blurred_url", null);
                  }}
                  placeholder="https://example.com/dark.jpg 或 /uploads/..."
                />
                <Input
                  className="mt-2"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={uploadingTheme === "dark"}
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
              <div className="grid gap-2 md:grid-cols-3">
                {glassEffectModes.map((item) => (
                  <button
                    key={item.key}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      appearanceForm.glass_effect_mode === item.key
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted/70"
                    }`}
                    onClick={() => setAppearanceValue("glass_effect_mode", item.key)}
                    type="button"
                  >
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="mt-1 text-xs leading-5">{item.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="appearance-overlay">背景遮罩 {Math.round(appearanceForm.background_overlay_opacity * 100)}%</Label>
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
              </div>
              <div>
                <Label htmlFor="appearance-bg-blur">背景模糊 {appearanceForm.background_blur_px}px（上传图使用预处理）</Label>
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
              </div>
              <div>
                <Label htmlFor="appearance-card-opacity">卡片透明度 {Math.round(appearanceForm.glass_card_opacity * 100)}%</Label>
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
              </div>
              <div>
                <Label htmlFor="appearance-card-blur">导航与控制层模糊 {appearanceForm.glass_blur_px}px</Label>
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
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={saveGlobal} type="button">
                <Save size={16} />
                保存全局外观
              </Button>
              <Button disabled={saving} onClick={resetGlobal} type="button" variant="secondary">
                <X size={16} />
                恢复默认
              </Button>
            </div>
          </div>

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
