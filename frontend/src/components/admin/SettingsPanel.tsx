import { AppearanceSettings, RuntimeSettings } from "../../lib/types";
import { AppearanceSettingsPanel } from "../AppearanceSettingsPanel";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label } from "../ui/input";
import { Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

type RuntimeNumberSettingKey =
  | "check_interval_seconds"
  | "check_batch_size"
  | "check_request_delay_seconds"
  | "notify_interval_seconds"
  | "notify_cooldown_hours"
  | "default_alert_days"
  | "default_daily_usage_kwh"
  | "worker_idle_seconds"
  | "manual_check_cooldown_seconds"
  | "max_rooms_per_user"
  | "verification_code_retention_days"
  | "check_attempt_retention_days"
  | "notification_retention_days"
  | "electricity_reading_retention_days"
  | "admin_audit_log_retention_days"
  | "scheduled_job_run_retention_days"
  | "retention_cleanup_hour"
  | "hwgl_metadata_sync_interval_seconds"
  | "hwgl_metadata_history_days"
  | "hwgl_recharge_history_days"
  | "hwgl_probe_max_duration_seconds";

export function RuntimeSettingsPanel({
  runtime,
  appearance,
  onSave,
  onSaveAppearance,
  onUploadAppearanceBackground,
  onRunDataRetentionCleanup,
  onClearRateLimits,
  saving,
  savingAppearance,
  cleaningRetention,
  clearingRateLimits
}: {
  runtime: RuntimeSettings;
  appearance: AppearanceSettings;
  onSave: (payload: Partial<RuntimeSettings>, onSuccess: () => void) => void;
  onSaveAppearance: (payload: Partial<AppearanceSettings>, onSuccess: () => void) => void;
  onUploadAppearanceBackground: (
    theme: "light" | "dark",
    file: File
  ) => Promise<{ theme: "light" | "dark"; url: string; blurred_url: string }>;
  onRunDataRetentionCleanup: () => void;
  onClearRateLimits: (payload: { bucket?: string | null; client_ip?: string | null; identity?: string | null }) => void;
  saving: boolean;
  savingAppearance: boolean;
  cleaningRetention: boolean;
  clearingRateLimits: boolean;
}) {
  const [edits, setEdits] = useState<Partial<Record<RuntimeNumberSettingKey, string>>>({});
  const [rateLimitIp, setRateLimitIp] = useState("");
  const [rateLimitIdentity, setRateLimitIdentity] = useState("");
  const [rateLimitBucket, setRateLimitBucket] = useState("");

  const form = { ...runtime, ...edits };
  function setNumber(key: RuntimeNumberSettingKey, value: string) {
    setEdits((current) => ({ ...current, [key]: value }));
  }
  function saveSection(hwgl: boolean) {
    const changed = (Object.keys(edits) as RuntimeNumberSettingKey[]).filter((key) => key.startsWith("hwgl_") === hwgl);
    const payload: Partial<RuntimeSettings> = {};
    for (const key of changed) payload[key] = Number(edits[key]);
    onSave(payload, () => setEdits((current) => {
      const next = { ...current };
      for (const key of changed) delete next[key];
      return next;
    }));
  }
  const hasGlobalEdits = Object.keys(edits).some((key) => !key.startsWith("hwgl_"));
  const hasHwglEdits = Object.keys(edits).some((key) => key.startsWith("hwgl_"));

  return (
    <div className="grid gap-5">
      <AppearanceSettingsPanel
        appearance={appearance}
        saving={savingAppearance}
        onSave={onSaveAppearance}
        onUploadBackground={onUploadAppearanceBackground}
      />

      <Card className="border-border bg-panel shadow-none">
      <CardHeader>
        <CardTitle>全局任务设置</CardTitle>
      </CardHeader>
      <CardContent><form onSubmit={(event) => { event.preventDefault(); saveSection(false); }}>
        <fieldset disabled={saving || cleaningRetention} className="min-w-0 space-y-4" aria-label="全局任务设置">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label htmlFor="check-interval">同步周期（秒）</Label>
            <Input id="check-interval" type="number" required min={60} max={604800} value={form.check_interval_seconds} onChange={(event) => setNumber("check_interval_seconds", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="check-batch">每轮检查数量</Label>
            <Input id="check-batch" type="number" required min={1} max={5000} value={form.check_batch_size} onChange={(event) => setNumber("check_batch_size", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="request-delay">请求间隔（秒）</Label>
            <Input
              id="request-delay"
              type="number"
              min={0} max={60} required
              step="0.1"
              value={form.check_request_delay_seconds}
              onChange={(event) => setNumber("check_request_delay_seconds", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="notify-interval">通知扫描周期（秒）</Label>
            <Input id="notify-interval" type="number" required min={60} max={604800} value={form.notify_interval_seconds} onChange={(event) => setNumber("notify_interval_seconds", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="notify-cooldown">通知冷却（小时）</Label>
            <Input id="notify-cooldown" type="number" required min={1} max={720} value={form.notify_cooldown_hours} onChange={(event) => setNumber("notify_cooldown_hours", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="default-alert-days">默认提醒天数</Label>
            <Input
              id="default-alert-days"
              type="number"
              required
              min={1}
              max={30}
              value={form.default_alert_days}
              onChange={(event) => setNumber("default_alert_days", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="default-daily-usage">默认日均用电（度/天）</Label>
            <Input
              id="default-daily-usage"
              type="number"
              required
              min={0.1}
              max={100}
              step="0.1"
              value={form.default_daily_usage_kwh}
              onChange={(event) => setNumber("default_daily_usage_kwh", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="worker-idle">Worker 空闲轮询（秒）</Label>
            <Input id="worker-idle" type="number" required min={1} max={300} value={form.worker_idle_seconds} onChange={(event) => setNumber("worker_idle_seconds", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="manual-cooldown">手动同步冷却（秒）</Label>
            <Input
              id="manual-cooldown"
              type="number"
              min={0} max={3600} required
              value={form.manual_check_cooldown_seconds}
              onChange={(event) => setNumber("manual_check_cooldown_seconds", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="max-rooms-per-user">每用户宿舍上限</Label>
            <Input
              id="max-rooms-per-user"
              type="number"
              required
              min={1}
              max={100}
              value={form.max_rooms_per_user}
              onChange={(event) => setNumber("max_rooms_per_user", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="verification-retention">验证码记录保留（天）</Label>
            <Input
              id="verification-retention"
              type="number"
              max={3650} required
              min={0}
              value={form.verification_code_retention_days}
              onChange={(event) => setNumber("verification_code_retention_days", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="attempt-retention">检查记录保留（天）</Label>
            <Input
              id="attempt-retention"
              type="number"
              max={3650} required
              min={0}
              value={form.check_attempt_retention_days}
              onChange={(event) => setNumber("check_attempt_retention_days", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="notification-retention">通知记录保留（天）</Label>
            <Input
              id="notification-retention"
              type="number"
              max={3650} required
              min={0}
              value={form.notification_retention_days}
              onChange={(event) => setNumber("notification_retention_days", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="reading-retention">电量历史保留（天）</Label>
            <Input
              id="reading-retention"
              type="number"
              max={3650} required
              min={0}
              value={form.electricity_reading_retention_days}
              onChange={(event) => setNumber("electricity_reading_retention_days", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="audit-retention">审计日志保留（天）</Label>
            <Input
              id="audit-retention"
              type="number"
              max={3650} required
              min={0}
              value={form.admin_audit_log_retention_days}
              onChange={(event) => setNumber("admin_audit_log_retention_days", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="scheduled-job-retention">调度执行记录保留（天）</Label>
            <Input
              id="scheduled-job-retention"
              type="number"
              max={3650} required
              min={0}
              value={form.scheduled_job_run_retention_days}
              onChange={(event) => setNumber("scheduled_job_run_retention_days", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cleanup-hour">每日清理时间（0-23 点）</Label>
            <Input
              id="cleanup-hour"
              type="number"
              required
              min={0}
              max={23}
              value={form.retention_cleanup_hour}
              onChange={(event) => setNumber("retention_cleanup_hour", event.target.value)}
            />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          保留天数为 0 的项目不会清理。立即清理使用已保存的策略；如已修改，请先保存设置。
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || !hasGlobalEdits}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存全局设置
          </Button>
          <Button type="button" disabled={saving || cleaningRetention || hasGlobalEdits} onClick={() => {
            if (window.confirm("按已保存的保留策略立即删除过期数据？删除后无法恢复。")) onRunDataRetentionCleanup();
          }} variant="secondary">
            {cleaningRetention ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
            立即清理过期数据
          </Button>
        </div>
        </fieldset></form></CardContent>
      </Card>

      <Card className="border-border bg-panel shadow-none">
        <CardHeader>
          <CardTitle>HWGL 数据与探测</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            这些设置只影响使用新电费系统的宿舍。元数据同步由 worker 执行，实时性探测仍然需要在“实时性”页面手动启动。
          </p>
        </CardHeader>
        <CardContent><form onSubmit={(event) => { event.preventDefault(); saveSection(true); }}>
          <fieldset disabled={saving} className="min-w-0 space-y-4" aria-label="HWGL 设置">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label htmlFor="hwgl-sync-interval">扩展数据同步周期（秒）</Label>
              <Input
                id="hwgl-sync-interval"
                type="number"
                required max={604800}
                min={60}
                value={form.hwgl_metadata_sync_interval_seconds}
                onChange={(event) => setNumber("hwgl_metadata_sync_interval_seconds", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="hwgl-history-days">日用电历史窗口（天）</Label>
              <Input
                id="hwgl-history-days"
                type="number"
                required max={365}
                min={1}
                value={form.hwgl_metadata_history_days}
                onChange={(event) => setNumber("hwgl_metadata_history_days", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="hwgl-recharge-days">充值记录窗口（天）</Label>
              <Input
                id="hwgl-recharge-days"
                type="number"
                required max={730}
                min={1}
                value={form.hwgl_recharge_history_days}
                onChange={(event) => setNumber("hwgl_recharge_history_days", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="hwgl-probe-duration">探测最长持续时间（秒）</Label>
              <Input
                id="hwgl-probe-duration"
                type="number"
                required max={86400}
                min={60}
                value={form.hwgl_probe_max_duration_seconds}
                onChange={(event) => setNumber("hwgl_probe_max_duration_seconds", event.target.value)}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
            修改后由 worker 读取最新值。探测间隔可选 60–3600 秒，最长持续时间还会受到服务器环境变量上限约束。
          </div>
          <Button type="submit" disabled={saving || !hasHwglEdits}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存 HWGL 设置
          </Button>
          </fieldset></form></CardContent>
      </Card>

      <Card className="border-border bg-panel shadow-none">
        <CardHeader>
          <CardTitle>防滥用限制</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            当同学因为短时间多次登录、注册或验证被临时限制时，可以在这里清除对应 IP 或邮箱的限流记录。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="rate-limit-ip">IP 地址</Label>
              <Input
                id="rate-limit-ip"
                value={rateLimitIp}
                onChange={(event) => setRateLimitIp(event.target.value)}
                placeholder="例如 192.0.2.23"
              />
            </div>
            <div>
              <Label htmlFor="rate-limit-identity">邮箱或账号</Label>
              <Input
                id="rate-limit-identity"
                value={rateLimitIdentity}
                onChange={(event) => setRateLimitIdentity(event.target.value)}
                placeholder="可选，例如 name@example.com"
              />
            </div>
            <div>
              <Label htmlFor="rate-limit-bucket">限制类型</Label>
              <select
                id="rate-limit-bucket"
                className="h-9 w-full rounded-md border border-border/75 bg-panel/70 px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={rateLimitBucket}
                onChange={(event) => setRateLimitBucket(event.target.value)}
              >
                <option value="">全部类型</option>
                <option value="auth:register">注册</option>
                <option value="auth:request-code">重新发送验证码</option>
                <option value="auth:verify-email">邮箱验证</option>
                <option value="auth:login">登录</option>
              </select>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            选择限制类型、填写 IP 或邮箱可缩小范围。不指定任何条件将清除所有内存限流记录。
          </div>
          <Button
            disabled={clearingRateLimits}
            onClick={() => {
              const filters = { bucket: rateLimitBucket || null, client_ip: rateLimitIp.trim() || null, identity: rateLimitIdentity.trim() || null };
              const scope = [filters.bucket && `类型：${filters.bucket}`, filters.client_ip && `IP：${filters.client_ip}`, filters.identity && `账号：${filters.identity}`].filter(Boolean).join("；");
              if (window.confirm(scope ? `确定清除匹配的限流记录（${scope}）吗？` : "未指定任何条件。确定清除所有类型、所有用户的限流记录吗？")) onClearRateLimits(filters);
            }}
            variant="secondary"
          >
            {clearingRateLimits ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
            清除限流记录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
