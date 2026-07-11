import { AppearanceSettings, RuntimeSettings } from "../../lib/types";
import { AppearanceSettingsPanel } from "../AppearanceSettingsPanel";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label } from "../ui/input";
import { Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type RuntimeNumberSettingKey =
  | "check_interval_seconds"
  | "check_batch_size"
  | "check_request_delay_seconds"
  | "notify_interval_seconds"
  | "notify_cooldown_hours"
  | "worker_idle_seconds"
  | "manual_check_cooldown_seconds"
  | "max_rooms_per_user"
  | "verification_code_retention_days"
  | "check_attempt_retention_days"
  | "notification_retention_days"
  | "electricity_reading_retention_days"
  | "admin_audit_log_retention_days"
  | "scheduled_job_run_retention_days"
  | "retention_cleanup_hour";

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
  runtime?: RuntimeSettings;
  appearance?: AppearanceSettings | null;
  onSave: (payload: Partial<RuntimeSettings>) => void;
  onSaveAppearance: (payload: Partial<AppearanceSettings>) => void;
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
  const [form, setForm] = useState<RuntimeSettings | null>(null);
  const [rateLimitIp, setRateLimitIp] = useState("");
  const [rateLimitIdentity, setRateLimitIdentity] = useState("");
  const [rateLimitBucket, setRateLimitBucket] = useState("");

  useEffect(() => {
    if (runtime) setForm(runtime);
  }, [runtime]);

  if (!form) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" size={18} />
        正在读取设置
      </div>
    );
  }

  function setNumber(key: RuntimeNumberSettingKey, value: string) {
    setForm((current) => (current ? { ...current, [key]: Number(value) } : current));
  }

  return (
    <div className="grid gap-5">
      <AppearanceSettingsPanel
        appearance={appearance}
        saving={savingAppearance}
        onSave={onSaveAppearance}
        onUploadBackground={onUploadAppearanceBackground}
      />

      <Card>
      <CardHeader>
        <CardTitle>全局任务设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label htmlFor="check-interval">同步周期（秒）</Label>
            <Input id="check-interval" type="number" value={form.check_interval_seconds} onChange={(event) => setNumber("check_interval_seconds", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="check-batch">每轮检查数量</Label>
            <Input id="check-batch" type="number" value={form.check_batch_size} onChange={(event) => setNumber("check_batch_size", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="request-delay">请求间隔（秒）</Label>
            <Input
              id="request-delay"
              type="number"
              step="0.1"
              value={form.check_request_delay_seconds}
              onChange={(event) => setNumber("check_request_delay_seconds", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="notify-interval">通知扫描周期（秒）</Label>
            <Input id="notify-interval" type="number" value={form.notify_interval_seconds} onChange={(event) => setNumber("notify_interval_seconds", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="notify-cooldown">通知冷却（小时）</Label>
            <Input id="notify-cooldown" type="number" value={form.notify_cooldown_hours} onChange={(event) => setNumber("notify_cooldown_hours", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="worker-idle">Worker 空闲轮询（秒）</Label>
            <Input id="worker-idle" type="number" value={form.worker_idle_seconds} onChange={(event) => setNumber("worker_idle_seconds", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="manual-cooldown">手动同步冷却（秒）</Label>
            <Input
              id="manual-cooldown"
              type="number"
              value={form.manual_check_cooldown_seconds}
              onChange={(event) => setNumber("manual_check_cooldown_seconds", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="max-rooms-per-user">每用户宿舍上限</Label>
            <Input
              id="max-rooms-per-user"
              type="number"
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
              min={0}
              max={23}
              value={form.retention_cleanup_hour}
              onChange={(event) => setNumber("retention_cleanup_hour", event.target.value)}
            />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          保留天数填 0 表示不自动清理。worker 会每天按上面的时间执行一次，也可以在这里手动清理已过期数据。
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={saving} onClick={() => onSave(form)}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存全局设置
          </Button>
          <Button disabled={cleaningRetention} onClick={onRunDataRetentionCleanup} variant="secondary">
            {cleaningRetention ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
            立即清理过期数据
          </Button>
        </div>
      </CardContent>
      </Card>

      <Card>
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
            只填 IP 会清除这个 IP 的全部匹配记录；只填邮箱会清除这个邮箱的匹配记录；都不填则会清除所有内存限流记录。
          </div>
          <Button
            disabled={clearingRateLimits}
            onClick={() =>
              onClearRateLimits({
                bucket: rateLimitBucket || null,
                client_ip: rateLimitIp.trim() || null,
                identity: rateLimitIdentity.trim() || null
              })
            }
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
