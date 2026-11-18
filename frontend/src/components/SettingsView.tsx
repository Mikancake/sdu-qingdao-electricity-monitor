import { type FormEvent, useEffect, useRef, useState } from "react";
import { Bell, KeyRound, Loader2, Mail, Save, Send, ShieldCheck, Trash2 } from "lucide-react";

import type { User, UserRoomBinding } from "../lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Label, Select } from "./ui/input";

type BindingUpdatePayload = {
  alert_days?: number;
  alert_threshold_mode?: "days" | "average" | "fixed";
  low_power_threshold?: string | null;
  manual_check_cooldown_seconds?: number | null;
  notify_cooldown_hours?: number | null;
  enabled?: boolean;
};

type UserPreferencesPayload = {
  notify_cooldown_hours?: number | null;
  daily_report_enabled?: boolean;
  daily_report_interval_days?: number;
};

interface SettingsViewProps {
  user?: User;
  userLoading: boolean;
  userError: boolean;
  bindings: UserRoomBinding[];
  loading: boolean;
  bindingsError?: boolean;
  updatingId?: number | null;
  requestingEmail: boolean;
  verifyingEmail: boolean;
  notificationEmailCode?: string | null;
  minimumManualCheckCooldownSeconds?: number | null;
  minimumNotifyCooldownHours?: number | null;
  updatingPreferences: boolean;
  sendingTestEmail: boolean;
  updatingPassword: boolean;
  deletingAccount: boolean;
  onUpdateBinding: (binding: UserRoomBinding, payload: BindingUpdatePayload) => void;
  onUpdatePreferences: (payload: UserPreferencesPayload) => void;
  onSendTestEmail: () => void;
  onUpdatePassword: (oldPassword: string, newPassword: string, onSuccess?: () => void) => void;
  onDeleteAccount: (password: string) => void;
  onRequestNotificationEmail: (email: string, onSuccess?: () => void) => void;
  onVerifyNotificationEmail: (email: string, code: string, onSuccess?: () => void) => void;
}

interface BindingAlertFormProps {
  binding: UserRoomBinding;
  saving: boolean;
  otherRoomSaving: boolean;
  minimumManualCheckCooldownSeconds?: number | null;
  minimumNotifyCooldownHours?: number | null;
  onSave: (binding: UserRoomBinding, payload: BindingUpdatePayload) => void;
}

// Follow refetched values until this field is edited. Once the server reflects
// the edit, later refreshes should be able to update this field again.
function useFieldDraft<T extends string | boolean>(saved: T) {
  const [draft, setDraft] = useState<T>();
  useEffect(() => {
    if (draft === saved) setDraft(undefined);
  }, [draft, saved]);
  return [draft ?? saved, setDraft] as const;
}

interface CooldownFieldProps {
  id: string;
  label: string;
  value: string;
  saved: string;
  minimum?: number | null;
  maximum: number;
  inherit: string;
  onChange: (value: string) => void;
}

function CooldownField({ id, label, value, saved, minimum, maximum, inherit, onChange }: CooldownFieldProps) {
  // Existing overrides can predate a higher platform minimum. Do not
  // invalidate an unrelated edit unless the override is actually changed.
  const min = value === saved && saved !== "" ? Math.min(minimum ?? 0, Number(saved)) : minimum ?? 0;
  const invalid = value !== "" && (!Number.isInteger(Number(value)) || Number(value) < min || Number(value) > maximum);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={min} max={maximum} step={1} value={value} onChange={(event) => onChange(event.target.value)}
        placeholder={`留空继承${inherit}`} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className={invalid ? "mt-1 text-xs text-danger" : "mt-1 text-xs text-muted-foreground"}>
        留空继承{inherit}；{minimum != null ? `自定义时请输入 ${minimum}–${maximum} 的整数。` : `自定义值须为整数，不低于平台默认值且不超过 ${maximum}。`}
      </p>
    </div>
  );
}

function BindingAlertForm({
  binding,
  saving,
  otherRoomSaving,
  minimumManualCheckCooldownSeconds,
  minimumNotifyCooldownHours,
  onSave
}: BindingAlertFormProps) {
  const savedMode = binding.alert_threshold_mode ?? (binding.low_power_threshold != null ? "fixed" : "days");
  const savedCooldown = binding.manual_check_cooldown_seconds?.toString() ?? "";
  const savedNotifyCooldown = binding.notify_cooldown_hours?.toString() ?? "";
  const [enabled, setEnabled] = useFieldDraft(binding.enabled);
  const [alertDays, setAlertDays] = useFieldDraft(String(binding.alert_days));
  const [thresholdMode, setThresholdMode] = useFieldDraft(savedMode);
  const [threshold, setThreshold] = useFieldDraft(binding.low_power_threshold ?? "");
  const [cooldown, setCooldown] = useFieldDraft(savedCooldown);
  const [notifyCooldown, setNotifyCooldown] = useFieldDraft(savedNotifyCooldown);

  function save(event: FormEvent) {
    event.preventDefault();
    if (saving || otherRoomSaving) return;
    const payload: BindingUpdatePayload = {
      enabled,
      alert_threshold_mode: thresholdMode,
      low_power_threshold: thresholdMode === "fixed" ? threshold : null
    };
    if (thresholdMode === "days") payload.alert_days = Number(alertDays);
    if (cooldown !== savedCooldown) payload.manual_check_cooldown_seconds = cooldown ? Number(cooldown) : null;
    if (notifyCooldown !== savedNotifyCooldown) payload.notify_cooldown_hours = notifyCooldown ? Number(notifyCooldown) : null;
    onSave(binding, payload);
  }

  return (
    <form aria-label={`${binding.room.building_name} ${binding.room.room_number} 提醒策略`} aria-busy={saving} onSubmit={save}>
    <fieldset disabled={saving} className="min-w-0 rounded-xl border border-border p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">
              {binding.room.building_name} {binding.room.room_number}
            </div>
            <Badge tone={binding.enabled ? "success" : "muted"}>{binding.enabled ? "提醒开启" : "提醒关闭"}</Badge>
          </div>
          <div className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">独立设置这个宿舍的提醒方式与发送频率，留空的覆盖项将继承默认设置。</div>
        </div>

        <label className="inline-flex select-none items-center gap-2 text-sm text-muted-foreground">
          <input
            className="h-4 w-4 accent-primary"
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          启用邮件提醒
        </label>
      </div>

      <div className="mt-5 grid gap-x-5 gap-y-4 border-t border-border pt-5 md:grid-cols-2">
        <div>
          <Label htmlFor={`threshold-mode-${binding.id}`}>提醒方式</Label>
          <Select
            id={`threshold-mode-${binding.id}`}
            value={thresholdMode}
            onChange={(event) => setThresholdMode(event.target.value as "days" | "average" | "fixed")}
          >
            <option value="days">按可用天数提醒</option>
            <option value="average">低于 1 天用电量提醒</option>
            <option value="fixed">按固定电量提醒</option>
          </Select>
        </div>
        {thresholdMode === "days" ? (
          <div>
            <Label htmlFor={`alert-days-${binding.id}`}>低于多少天用电量时提醒</Label>
            <Input
              id={`alert-days-${binding.id}`}
              type="number"
              min={1}
              max={30}
              required
              aria-describedby={`alert-days-${binding.id}-hint`}
              value={alertDays}
              onChange={(event) => setAlertDays(event.target.value)}
            />
            <p id={`alert-days-${binding.id}-hint`} className="mt-1 text-xs text-muted-foreground">填写 1–30 的整数。读数不足时使用平台默认日用电量估算。</p>
          </div>
        ) : null}
        {thresholdMode === "fixed" ? (
          <div>
            <Label htmlFor={`threshold-${binding.id}`}>固定电量阈值</Label>
            <Input
              id={`threshold-${binding.id}`}
              type="number"
              min={0}
              max={100000}
              step="0.01"
              required
              aria-describedby={`threshold-${binding.id}-hint`}
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              placeholder="例如 10"
            />
            <p id={`threshold-${binding.id}-hint`} className="mt-1 text-xs text-muted-foreground">填写 0–100000 度，最多两位小数。电量低于此值时提醒。</p>
          </div>
        ) : null}
        {thresholdMode === "average" ? (
          <div className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">
            电量低于 1 天用电量时提醒。读数不足时使用平台默认日用电量估算。
          </div>
        ) : null}
        <CooldownField id={`notify-cooldown-${binding.id}`} label="邮件间隔覆盖（小时）" inherit="账号设置"
          minimum={minimumNotifyCooldownHours} maximum={720} value={notifyCooldown} saved={savedNotifyCooldown} onChange={setNotifyCooldown} />
        <CooldownField id={`manual-cooldown-${binding.id}`} label="立即同步冷却（秒）" inherit="默认设置"
          minimum={minimumManualCheckCooldownSeconds} maximum={3600} value={cooldown} saved={savedCooldown} onChange={setCooldown} />
        <Button
          className="justify-self-start md:col-span-2"
          disabled={saving || otherRoomSaving}
          type="submit"
          variant="secondary"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saving ? "保存中…" : "保存宿舍策略"}
        </Button>
      </div>
    </fieldset>
    </form>
  );
}

export function SettingsView({
  user,
  userLoading,
  userError,
  bindings,
  loading,
  bindingsError = false,
  updatingId,
  requestingEmail,
  verifyingEmail,
  notificationEmailCode,
  minimumManualCheckCooldownSeconds,
  minimumNotifyCooldownHours,
  updatingPreferences,
  sendingTestEmail,
  updatingPassword,
  deletingAccount,
  onUpdateBinding,
  onUpdatePreferences,
  onSendTestEmail,
  onUpdatePassword,
  onDeleteAccount,
  onRequestNotificationEmail,
  onVerifyNotificationEmail
}: SettingsViewProps) {
  const [notificationEmail, setNotificationEmail] = useFieldDraft(user?.notification_email || user?.email || "");
  const email = notificationEmail.trim().toLowerCase();
  const emailForm = useRef<HTMLFormElement>(null);
  const [codeRecipient, setCodeRecipient] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const savedNotifyCooldown = user?.notify_cooldown_hours?.toString() ?? "";
  const [userNotifyCooldown, setUserNotifyCooldown] = useFieldDraft(savedNotifyCooldown);
  const [dailyReportEnabled, setDailyReportEnabled] = useFieldDraft(user?.daily_report_enabled ?? false);
  const [dailyReportIntervalDays, setDailyReportIntervalDays] = useFieldDraft(user?.daily_report_interval_days?.toString() ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const accountUnavailable = !user || deletingAccount;
  const emailLocked = accountUnavailable || requestingEmail || verifyingEmail;
  const testAvailableAt = Date.parse(user?.test_email_sent_at ?? "") + 30 * 60_000;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const current = Date.now();
    setNow(current);
    if (testAvailableAt > current) {
      const timer = window.setTimeout(() => setNow(Date.now()), testAvailableAt - current + 1);
      return () => window.clearTimeout(timer);
    }
  }, [testAvailableAt]);
  const testCoolingDown = testAvailableAt > now;
  const newPasswordError = newPassword && (newPassword === currentPassword ? "新密码不能与当前密码相同" : newPassword.length < 8 ? "至少需要 8 个字符" : "");
  const passwordMismatch = confirmPassword !== "" && confirmPassword !== newPassword;
  const accountEmail = user?.email ?? (userLoading ? "正在读取账号信息" : userError ? "账号信息加载失败" : "未获取到账号");
  const notificationEmailLabel = user
    ? user.notification_email || user.email || "--"
    : userLoading
      ? "正在读取账号信息"
      : userError
        ? "无法读取"
        : "--";
  const notificationEmailVerified = user?.notification_email ? user.notification_email_verified : user?.is_verified;
  const testRecipient = user?.notification_email_verified ? user.notification_email : user?.email;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">个人设置</p>
        <h1 className="page-heading mt-2">按你的方式，接收提醒</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">管理通知偏好、宿舍策略与账号安全。</p>
        {(userError || !user) && <p role="status" className="mt-2 text-sm text-muted-foreground">{userLoading ? "正在读取账号设置…" : user ? "账号设置刷新失败，正在显示上次读取的数据。" : "账号设置暂不可用，请刷新后再试。"}</p>}
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="设置分区" className="flex flex-wrap gap-2 lg:sticky lg:top-6 lg:flex-col">
          {[
            ["notification-settings", "提醒邮箱"],
            ["delivery-settings", "发送偏好"],
            ["password-settings", "账号安全"],
            ["room-alert-settings", "宿舍提醒策略"],
            ["account-deletion", "注销账号"]
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{label}</a>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">
      <Card id="notification-settings" tabIndex={-1} className="scroll-mt-6 overflow-hidden">
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail size={18} />
          </div>
          <div>
            <CardTitle className="text-base">提醒邮箱</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">为低电量提醒选择一个常用邮箱，验证后即可接收通知。</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 border-b border-border pb-5 md:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">登录邮箱</div>
              <div className="mt-1 break-all text-sm font-medium">{accountEmail}</div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">当前提醒邮箱</div>
                  <div className="mt-1 break-all text-sm font-medium">{notificationEmailLabel}</div>
                </div>
                <Badge tone={notificationEmailVerified ? "success" : user ? "warning" : "muted"}>
                  {user ? (notificationEmailVerified ? "已验证" : "待验证") : userLoading ? "读取中" : userError ? "读取失败" : "暂无"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-4">
            <div>
              <div className="text-sm font-medium">测试邮件</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {testCoolingDown ? `已发送测试邮件，可在 ${new Date(testAvailableAt).toLocaleTimeString("zh-CN")} 后再次发送。` : `测试邮件将发送至${testRecipient || "已验证邮箱"}，成功后需等待 30 分钟。`}
              </div>
            </div>
            <Button disabled={accountUnavailable || sendingTestEmail || testCoolingDown} onClick={onSendTestEmail} variant="secondary">
              {sendingTestEmail ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              发送测试邮件
            </Button>
          </div>

          <form ref={emailForm} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end" aria-label="请求提醒邮箱验证码" onSubmit={(event) => {
            event.preventDefault();
            if (emailLocked) return;
            onRequestNotificationEmail(email, () => {
              setCodeRecipient(email);
              setVerificationCode("");
            });
          }}>
            <div>
              <Label htmlFor="notification-email">新的提醒邮箱</Label>
              <Input
                id="notification-email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                required
                pattern={"[^\\s@]+@[^\\s@.]+(\\.[^\\s@.]+)+"}
                title="请输入完整邮箱，例如 you@example.com"
                maxLength={255}
                disabled={emailLocked}
                value={notificationEmail}
                onChange={(event) => {
                  setVerificationCode("");
                  setNotificationEmail(event.target.value);
                }}
                placeholder="you@example.com"
              />
            </div>
            <Button
              disabled={emailLocked}
              type="submit"
              variant="secondary"
            >
              {requestingEmail ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              发送验证码
            </Button>
          </form>

          <form className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end" aria-label="验证提醒邮箱" onSubmit={(event) => {
            event.preventDefault();
            if (emailLocked || !emailForm.current?.reportValidity()) return;
            onVerifyNotificationEmail(email, verificationCode, () => {
              setVerificationCode("");
              setCodeRecipient("");
              setNotificationEmail(email);
            });
          }}>
            <div>
              <Label htmlFor="notification-code">验证码</Label>
              <Input
                id="notification-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                aria-describedby="code-hint"
                disabled={emailLocked}
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                placeholder="6 位验证码"
              />
            </div>
            <Button
              type="submit" disabled={emailLocked}
            >
              {verifyingEmail ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
              验证并保存
            </Button>
          </form>
          <p id="code-hint" className="text-xs text-muted-foreground">{codeRecipient && codeRecipient === email ? `请输入 ${codeRecipient} 对应的 6 位数字验证码。` : "先向新邮箱发送验证码，再输入该邮箱对应的 6 位数字。"}</p>

          {notificationEmailCode && codeRecipient && codeRecipient === email ? (
            <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
              开发验证码：<span className="font-semibold">{notificationEmailCode}</span>
            </div>
          ) : null}

        </CardContent>
      </Card>

      <Card id="delivery-settings" tabIndex={-1} className="scroll-mt-6">
        <CardHeader className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Send size={18} /></div>
          <div>
            <CardTitle className="text-base">发送偏好</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">设置账号默认通知频率与用电日报，避免重复打扰。</p>
          </div>
        </CardHeader>
        <CardContent>
          <form aria-label="发送偏好" aria-busy={updatingPreferences} onSubmit={(event) => {
            event.preventDefault();
            if (accountUnavailable || updatingPreferences) return;
            const payload: UserPreferencesPayload = { daily_report_enabled: dailyReportEnabled };
            if (dailyReportEnabled) payload.daily_report_interval_days = Number(dailyReportIntervalDays);
            if (userNotifyCooldown !== savedNotifyCooldown) payload.notify_cooldown_hours = userNotifyCooldown ? Number(userNotifyCooldown) : null;
            onUpdatePreferences(payload);
          }}>
          <fieldset disabled={accountUnavailable || updatingPreferences} className="grid min-w-0 gap-5 md:grid-cols-2">
            <CooldownField id="user-notify-cooldown" label="默认邮件发送间隔（小时）" inherit="平台默认"
              minimum={minimumNotifyCooldownHours} maximum={720} value={userNotifyCooldown} saved={savedNotifyCooldown} onChange={setUserNotifyCooldown} />
            <label className="inline-flex items-center gap-3 rounded-xl bg-muted/50 p-4 text-sm">
              <input
                className="h-4 w-4 accent-primary"
                type="checkbox"
                checked={dailyReportEnabled}
                onChange={(event) => setDailyReportEnabled(event.target.checked)}
              />
              定期发送用电日报
            </label>
            <div>
              <Label htmlFor="daily-report-interval">日报间隔（天）</Label>
              <Input
                id="daily-report-interval"
                type="number"
                min={1}
                max={30}
                value={dailyReportIntervalDays}
                disabled={!dailyReportEnabled}
                required={dailyReportEnabled}
                aria-describedby="daily-report-hint"
                onChange={(event) => setDailyReportIntervalDays(event.target.value)}
              />
              <p id="daily-report-hint" className="mt-1 text-xs text-muted-foreground">{dailyReportEnabled ? "填写 1–30 的整数，例如 3 表示每 3 天发送。" : "启用用电日报后，可以设置发送间隔。"}</p>
            </div>
            <Button
              className="justify-self-start md:col-span-2"
              type="submit"
              variant="secondary"
            >
              {updatingPreferences ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              {updatingPreferences ? "保存中…" : "保存发送偏好"}
            </Button>
          </fieldset>
          </form>
        </CardContent>
      </Card>

      <Card id="password-settings" tabIndex={-1} className="scroll-mt-6">
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound size={18} />
          </div>
          <div>
            <CardTitle className="text-base">账号安全</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">更新登录密码，保存后其他设备上的旧登录会话将立即失效。</p>
          </div>
        </CardHeader>
        <CardContent>
          <form aria-label="修改登录密码" aria-busy={updatingPassword} onSubmit={(event) => {
            event.preventDefault();
            if (accountUnavailable || updatingPassword || newPasswordError || passwordMismatch) return;
            onUpdatePassword(currentPassword, newPassword, () => {
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setDeletePassword("");
            });
          }}>
          <fieldset disabled={accountUnavailable || updatingPassword} className="grid min-w-0 gap-5 md:grid-cols-2">
          <div className="md:col-span-2 md:max-w-sm">
            <Label htmlFor="current-password">当前密码</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-password">新密码</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              aria-describedby="new-password-hint"
              aria-invalid={Boolean(newPasswordError) || undefined}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p id="new-password-hint" className={newPasswordError ? "mt-1 text-xs text-danger" : "mt-1 text-xs text-muted-foreground"}>
              {newPasswordError || "使用与当前密码不同的 8–128 位密码。"}
            </p>
          </div>
          <div>
            <Label htmlFor="confirm-password">确认新密码</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              maxLength={128}
              aria-invalid={passwordMismatch || undefined}
              aria-describedby={passwordMismatch ? "confirm-password-error" : undefined}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {passwordMismatch && <p id="confirm-password-error" className="mt-1 text-xs text-danger">两次输入的密码不一致</p>}
          </div>
          <Button
            className="justify-self-start md:col-span-2"
            type="submit"
            disabled={Boolean(newPasswordError) || passwordMismatch}
            variant="secondary"
          >
            {updatingPassword ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {updatingPassword ? "保存中…" : "更新密码"}
          </Button>
          </fieldset>
          </form>
        </CardContent>
      </Card>

      <Card id="room-alert-settings" tabIndex={-1} className="scroll-mt-6">
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell size={18} />
          </div>
          <div>
            <CardTitle className="text-base">宿舍提醒策略</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">各宿舍可以独立设置。普通用户的邮件间隔和同步冷却不能低于平台默认值。</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {bindingsError && <p role="status" className="text-sm text-danger">宿舍策略读取失败，请刷新重试。{bindings.length > 0 && "以下为上次读取的数据。"}</p>}
          {loading && !bindings.length ? (
            <div role="status" className="flex h-44 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={18} />
              正在读取设置
            </div>
          ) : bindingsError && !bindings.length ? null : bindings.length === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center px-5 text-center text-sm text-muted-foreground">
              <ShieldCheck className="mb-3" size={28} />
              尚未绑定宿舍。请先在「我的宿舍」添加绑定，再来配置提醒。
            </div>
          ) : (
            bindings.map((binding) => (
              <BindingAlertForm
                key={binding.id}
                binding={binding}
                saving={updatingId === binding.id}
                otherRoomSaving={deletingAccount || (updatingId != null && updatingId !== binding.id)}
                minimumManualCheckCooldownSeconds={minimumManualCheckCooldownSeconds}
                minimumNotifyCooldownHours={minimumNotifyCooldownHours}
                onSave={onUpdateBinding}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card id="account-deletion" tabIndex={-1} className="scroll-mt-6 border-danger/25">
        <CardHeader className="flex flex-row items-start gap-3 border-danger/20">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <Trash2 size={18} />
          </div>
          <div>
            <CardTitle className="text-base">注销账号</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">此操作不可撤销。宿舍绑定和提醒记录会被移除，历史电量读数将作为宿舍公共数据保留。</p>
          </div>
        </CardHeader>
        <CardContent>
          <form aria-label="注销账号" className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={(event) => {
            event.preventDefault();
            if (!accountUnavailable && !updatingPassword && window.confirm(`确定注销 ${user?.email} 吗？此操作不可撤销。`)) onDeleteAccount(deletePassword);
          }}>
          <div>
            <Label htmlFor="delete-account-password">当前密码</Label>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              disabled={accountUnavailable || updatingPassword}
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              placeholder="输入密码确认注销"
            />
          </div>
          <Button
            className="text-danger hover:bg-danger/10 hover:text-danger"
            type="submit"
            disabled={accountUnavailable || updatingPassword || !deletePassword}
            variant="ghost"
          >
            {deletingAccount ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
            注销账号
          </Button>
          </form>
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}
