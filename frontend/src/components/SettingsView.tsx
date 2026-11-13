import { useEffect, useState } from "react";
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
  onUpdatePassword: (oldPassword: string, newPassword: string) => void;
  onDeleteAccount: (password: string) => void;
  onRequestNotificationEmail: (email: string) => void;
  onVerifyNotificationEmail: (email: string, code: string) => void;
}

interface BindingAlertFormProps {
  binding: UserRoomBinding;
  saving: boolean;
  minimumManualCheckCooldownSeconds?: number | null;
  minimumNotifyCooldownHours?: number | null;
  onSave: (binding: UserRoomBinding, payload: BindingUpdatePayload) => void;
}

function BindingAlertForm({
  binding,
  saving,
  minimumManualCheckCooldownSeconds,
  minimumNotifyCooldownHours,
  onSave
}: BindingAlertFormProps) {
  const [enabled, setEnabled] = useState(binding.enabled);
  const [alertDays, setAlertDays] = useState(String(binding.alert_days));
  const [thresholdMode, setThresholdMode] = useState<"days" | "average" | "fixed">(
    binding.alert_threshold_mode ?? (binding.low_power_threshold ? "fixed" : "days")
  );
  const [threshold, setThreshold] = useState(binding.low_power_threshold ?? "");
  const [cooldown, setCooldown] = useState(binding.manual_check_cooldown_seconds?.toString() ?? "");
  const [notifyCooldown, setNotifyCooldown] = useState(binding.notify_cooldown_hours?.toString() ?? "");
  const [cooldownTouched, setCooldownTouched] = useState(false);
  const [notifyCooldownTouched, setNotifyCooldownTouched] = useState(false);

  useEffect(() => {
    setEnabled(binding.enabled);
    setAlertDays(String(binding.alert_days));
    setThresholdMode(binding.alert_threshold_mode ?? (binding.low_power_threshold ? "fixed" : "days"));
    setThreshold(binding.low_power_threshold ?? "");
    setCooldown(binding.manual_check_cooldown_seconds?.toString() ?? "");
    setNotifyCooldown(binding.notify_cooldown_hours?.toString() ?? "");
    setCooldownTouched(false);
    setNotifyCooldownTouched(false);
  }, [binding]);

  const cooldownValue = cooldown.trim() ? Number(cooldown) : null;
  const cooldownInvalidNumber = cooldownValue !== null && (!Number.isFinite(cooldownValue) || cooldownValue < 0);
  const cooldownTooLow =
    cooldownTouched &&
    cooldownValue !== null &&
    Number.isFinite(cooldownValue) &&
    minimumManualCheckCooldownSeconds !== undefined &&
    minimumManualCheckCooldownSeconds !== null &&
    cooldownValue < minimumManualCheckCooldownSeconds;
  const cooldownHasError = cooldownInvalidNumber || cooldownTooLow;
  const notifyCooldownValue = notifyCooldown.trim() ? Number(notifyCooldown) : null;
  const notifyCooldownInvalidNumber =
    notifyCooldownValue !== null && (!Number.isFinite(notifyCooldownValue) || notifyCooldownValue < 0);
  const notifyCooldownTooLow =
    notifyCooldownTouched &&
    notifyCooldownValue !== null &&
    Number.isFinite(notifyCooldownValue) &&
    minimumNotifyCooldownHours !== undefined &&
    minimumNotifyCooldownHours !== null &&
    notifyCooldownValue < minimumNotifyCooldownHours;
  const notifyCooldownHasError = notifyCooldownInvalidNumber || notifyCooldownTooLow;

  function save() {
    const days = Math.max(1, Number(alertDays) || binding.alert_days);
    const nextThreshold = threshold.trim();
    const payload: BindingUpdatePayload = {
      enabled,
      alert_days: days,
      alert_threshold_mode: thresholdMode,
      low_power_threshold: thresholdMode === "fixed" && nextThreshold ? nextThreshold : null
    };

    if (cooldownTouched) {
      payload.manual_check_cooldown_seconds = cooldown.trim() ? Math.max(0, Number(cooldown)) : null;
    }
    if (notifyCooldownTouched) {
      payload.notify_cooldown_hours = notifyCooldown.trim() ? Math.max(0, Number(notifyCooldown)) : null;
    }

    onSave(binding, payload);
  }

  return (
    <div className="rounded-xl border border-border p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">
              {binding.room.building_name} {binding.room.room_number}
            </div>
            <Badge tone={enabled ? "success" : "muted"}>{enabled ? "提醒开启" : "提醒关闭"}</Badge>
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
              value={alertDays}
              onChange={(event) => setAlertDays(event.target.value)}
            />
            <div className="mt-1 text-xs text-muted-foreground">默认 1 天；有效下降读数不足时先按默认 5 度/天估算。</div>
          </div>
        ) : null}
        {thresholdMode === "fixed" ? (
          <div>
            <Label htmlFor={`threshold-${binding.id}`}>固定电量阈值</Label>
            <Input
              id={`threshold-${binding.id}`}
              type="number"
              min={0}
              step="0.1"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              placeholder="例如 10"
            />
            <div className="mt-1 text-xs text-muted-foreground">当前电量低于这个数值时提醒。</div>
          </div>
        ) : null}
        {thresholdMode === "average" ? (
          <div className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">
            电量低于 1 天用电量时提醒。有效下降读数不足时先按默认 5 度/天估算。
          </div>
        ) : null}
        <div>
          <Label htmlFor={`notify-cooldown-${binding.id}`}>邮件间隔覆盖（小时）</Label>
          <Input
            id={`notify-cooldown-${binding.id}`}
            type="number"
            min={minimumNotifyCooldownHours ?? 0}
            value={notifyCooldown}
            onChange={(event) => {
              setNotifyCooldown(event.target.value);
              setNotifyCooldownTouched(true);
            }}
            placeholder="留空继承账号设置"
          />
          <div className={notifyCooldownHasError ? "mt-1 text-xs text-danger" : "mt-1 text-xs text-muted-foreground"}>
            {notifyCooldownTooLow && minimumNotifyCooldownHours !== undefined && minimumNotifyCooldownHours !== null
              ? `普通用户不能低于平台默认 ${minimumNotifyCooldownHours} 小时`
              : "限制同一宿舍重复提醒的发送频率"}
          </div>
        </div>
        <div>
          <Label htmlFor={`manual-cooldown-${binding.id}`}>立即同步冷却（秒）</Label>
          <Input
            id={`manual-cooldown-${binding.id}`}
            type="number"
            min={minimumManualCheckCooldownSeconds ?? 0}
            value={cooldown}
            onChange={(event) => {
              setCooldown(event.target.value);
              setCooldownTouched(true);
            }}
            placeholder="留空继承平台设置"
          />
          <div className={cooldownHasError ? "mt-1 text-xs text-danger" : "mt-1 text-xs text-muted-foreground"}>
            {cooldownTooLow && minimumManualCheckCooldownSeconds !== undefined && minimumManualCheckCooldownSeconds !== null
              ? `普通用户不能低于平台默认 ${minimumManualCheckCooldownSeconds} 秒`
              : "留空时使用管理员配置或平台默认值"}
          </div>
        </div>
        <Button
          className="justify-self-start md:col-span-2"
          disabled={saving || cooldownHasError || notifyCooldownHasError}
          onClick={save}
          variant="secondary"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          保存
        </Button>
      </div>
    </div>
  );
}

export function SettingsView({
  user,
  userLoading,
  userError,
  bindings,
  loading,
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
  const [notificationEmail, setNotificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [userNotifyCooldown, setUserNotifyCooldown] = useState("");
  const [dailyReportEnabled, setDailyReportEnabled] = useState(true);
  const [dailyReportIntervalDays, setDailyReportIntervalDays] = useState("1");
  const [notificationEmailDirty, setNotificationEmailDirty] = useState(false);
  const [preferencesDirty, setPreferencesDirty] = useState(false);
  const [userNotifyCooldownTouched, setUserNotifyCooldownTouched] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    if (!user || userLoading) {
      return;
    }
    const serverEmail = user.notification_email || user.email || "";
    if (notificationEmailDirty) {
      if (notificationEmail === serverEmail) {
        setNotificationEmailDirty(false);
      }
      return;
    }
    setNotificationEmail(serverEmail);
  }, [notificationEmail, notificationEmailDirty, user?.email, user?.id, user?.notification_email, userLoading]);

  useEffect(() => {
    if (!user || userLoading) {
      return;
    }
    const serverNotifyCooldown = user.notify_cooldown_hours?.toString() ?? "";
    const serverDailyReportEnabled = user.daily_report_enabled;
    const serverDailyReportIntervalDays = String(user.daily_report_interval_days);
    if (preferencesDirty) {
      if (
        userNotifyCooldown === serverNotifyCooldown &&
        dailyReportEnabled === serverDailyReportEnabled &&
        dailyReportIntervalDays === serverDailyReportIntervalDays
      ) {
        setPreferencesDirty(false);
      }
      return;
    }
    setUserNotifyCooldown(serverNotifyCooldown);
    setDailyReportEnabled(serverDailyReportEnabled);
    setDailyReportIntervalDays(serverDailyReportIntervalDays);
    setUserNotifyCooldownTouched(false);
  }, [
    dailyReportEnabled,
    dailyReportIntervalDays,
    preferencesDirty,
    user?.daily_report_enabled,
    user?.daily_report_interval_days,
    user?.id,
    user?.notify_cooldown_hours,
    userLoading,
    userNotifyCooldown
  ]);

  const userNotifyCooldownValue = userNotifyCooldown.trim() ? Number(userNotifyCooldown) : null;
  const userNotifyCooldownInvalid =
    userNotifyCooldownValue !== null && (!Number.isFinite(userNotifyCooldownValue) || userNotifyCooldownValue < 0);
  const userNotifyCooldownTooLow =
    userNotifyCooldownValue !== null &&
    userNotifyCooldownTouched &&
    Number.isFinite(userNotifyCooldownValue) &&
    minimumNotifyCooldownHours !== undefined &&
    minimumNotifyCooldownHours !== null &&
    userNotifyCooldownValue < minimumNotifyCooldownHours;
  const userNotifyCooldownHasError = userNotifyCooldownInvalid || userNotifyCooldownTooLow;
  const dailyReportIntervalNumber = Number(dailyReportIntervalDays);
  const dailyReportIntervalInvalid = !Number.isFinite(dailyReportIntervalNumber) || dailyReportIntervalNumber < 1;
  const accountEmail = user?.email ?? (userLoading ? "正在读取账号信息" : userError ? "账号信息加载失败" : "未获取到账号");
  const notificationEmailLabel = user
    ? user.notification_email || user.email || "--"
    : userLoading
      ? "正在读取账号信息"
      : userError
        ? "无法读取"
        : "--";
  const notificationEmailVerified = Boolean(user) && Boolean(user?.notification_email_verified || !user?.notification_email);


  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">个人设置</p>
        <h1 className="page-heading mt-2">按你的方式，接收提醒</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">管理通知偏好、宿舍策略与账号安全。</p>
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
      <Card id="notification-settings" className="scroll-mt-6 overflow-hidden">
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
                立即发送一封包含当前宿舍电量信息的测试邮件，成功后 30 分钟内不能重复发送。
              </div>
            </div>
            <Button disabled={sendingTestEmail} onClick={onSendTestEmail} variant="secondary">
              {sendingTestEmail ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              发送测试邮件
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label htmlFor="notification-email">新的提醒邮箱</Label>
              <Input
                id="notification-email"
                type="email"
                value={notificationEmail}
                onChange={(event) => {
                  setNotificationEmailDirty(true);
                  setNotificationEmail(event.target.value);
                }}
                placeholder="you@example.com"
              />
            </div>
            <Button
              disabled={requestingEmail || !notificationEmail.trim()}
              onClick={() => onRequestNotificationEmail(notificationEmail.trim())}
              variant="secondary"
            >
              {requestingEmail ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              发送验证码
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label htmlFor="notification-code">验证码</Label>
              <Input
                id="notification-code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                placeholder="6 位验证码"
              />
            </div>
            <Button
              disabled={verifyingEmail || !verificationCode.trim() || !notificationEmail.trim()}
              onClick={() => onVerifyNotificationEmail(notificationEmail.trim(), verificationCode.trim())}
            >
              {verifyingEmail ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
              验证并保存
            </Button>
          </div>

          {notificationEmailCode ? (
            <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
              开发验证码：<span className="font-semibold">{notificationEmailCode}</span>
            </div>
          ) : null}

        </CardContent>
      </Card>

      <Card id="delivery-settings" className="scroll-mt-6">
        <CardHeader className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Send size={18} /></div>
          <div>
            <CardTitle className="text-base">发送偏好</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">设置账号默认通知频率与用电日报，避免重复打扰。</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <Label htmlFor="user-notify-cooldown">默认邮件发送间隔（小时）</Label>
              <Input
                id="user-notify-cooldown"
                type="number"
                min={minimumNotifyCooldownHours ?? 0}
                value={userNotifyCooldown}
                onChange={(event) => {
                  setPreferencesDirty(true);
                  setUserNotifyCooldown(event.target.value);
                  setUserNotifyCooldownTouched(true);
                }}
                placeholder="留空继承平台默认"
              />
              <div className={userNotifyCooldownHasError ? "mt-1 text-xs text-danger" : "mt-1 text-xs text-muted-foreground"}>
                {userNotifyCooldownTooLow && minimumNotifyCooldownHours !== undefined && minimumNotifyCooldownHours !== null
                  ? `普通用户不能低于平台默认 ${minimumNotifyCooldownHours} 小时`
                  : "用于限制同一个宿舍低电量邮件重复发送的频率"}
              </div>
            </div>
            <label className="inline-flex items-center gap-3 rounded-xl bg-muted/50 p-4 text-sm">
              <input
                className="h-4 w-4 accent-primary"
                type="checkbox"
                checked={dailyReportEnabled}
                onChange={(event) => {
                  setPreferencesDirty(true);
                  setDailyReportEnabled(event.target.checked);
                }}
              />
              每天 8 点发送用电日报
            </label>
            <div>
              <Label htmlFor="daily-report-interval">日报间隔（天）</Label>
              <Input
                id="daily-report-interval"
                type="number"
                min={1}
                max={30}
                value={dailyReportIntervalDays}
                onChange={(event) => {
                  setPreferencesDirty(true);
                  setDailyReportIntervalDays(event.target.value);
                }}
              />
              <div className={dailyReportIntervalInvalid ? "mt-1 text-xs text-danger" : "mt-1 text-xs text-muted-foreground"}>
                {dailyReportIntervalInvalid ? "间隔至少为 1 天" : "例如 1 表示每天发送，3 表示每 3 天发送"}
              </div>
            </div>
            <Button
              className="justify-self-start md:col-span-2"
              disabled={updatingPreferences || userNotifyCooldownHasError || dailyReportIntervalInvalid}
              onClick={() =>
                onUpdatePreferences({
                  notify_cooldown_hours: userNotifyCooldown.trim() ? Math.max(0, Number(userNotifyCooldown)) : null,
                  daily_report_enabled: dailyReportEnabled,
                  daily_report_interval_days: Math.max(1, Number(dailyReportIntervalDays) || 1)
                })
              }
              variant="secondary"
            >
              {updatingPreferences ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              保存
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card id="password-settings" className="scroll-mt-6">
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound size={18} />
          </div>
          <div>
            <CardTitle className="text-base">账号安全</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">更新登录密码，保存后其他设备上的旧登录会话将立即失效。</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2 md:max-w-sm">
            <Label htmlFor="current-password">当前密码</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
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
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <div className={newPassword.length > 0 && newPassword.length < 8 ? "mt-1 text-xs text-danger" : "mt-1 text-xs text-muted-foreground"}>
              {newPassword.length > 0 && newPassword.length < 8 ? "至少需要 8 个字符" : "使用与其他网站不同的密码"}
            </div>
          </div>
          <div>
            <Label htmlFor="confirm-password">确认新密码</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {confirmPassword && confirmPassword !== newPassword ? <div className="mt-1 text-xs text-danger">两次输入的密码不一致</div> : null}
          </div>
          <Button
            className="justify-self-start md:col-span-2"
            disabled={
              updatingPassword ||
              currentPassword.length === 0 ||
              newPassword.length < 8 ||
              newPassword === currentPassword ||
              confirmPassword !== newPassword
            }
            onClick={() => onUpdatePassword(currentPassword, newPassword)}
            variant="secondary"
          >
            {updatingPassword ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存
          </Button>
        </CardContent>
      </Card>

      <Card id="room-alert-settings" className="scroll-mt-6">
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
          {loading ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={18} />
              正在读取设置
            </div>
          ) : bindings.length === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center px-5 text-center text-sm text-muted-foreground">
              <ShieldCheck className="mb-3" size={28} />
              绑定宿舍后，可以在这里配置邮件提醒。
            </div>
          ) : (
            bindings.map((binding) => (
              <BindingAlertForm
                key={binding.id}
                binding={binding}
                saving={updatingId === binding.id}
                minimumManualCheckCooldownSeconds={minimumManualCheckCooldownSeconds}
                minimumNotifyCooldownHours={minimumNotifyCooldownHours}
                onSave={onUpdateBinding}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card id="account-deletion" className="scroll-mt-6 border-danger/25">
        <CardHeader className="flex flex-row items-start gap-3 border-danger/20">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <Trash2 size={18} />
          </div>
          <div>
            <CardTitle className="text-base">注销账号</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">此操作不可撤销。宿舍绑定和提醒记录会被移除，历史电量读数将作为宿舍公共数据保留。</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Label htmlFor="delete-account-password">当前密码</Label>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              placeholder="输入密码确认注销"
            />
          </div>
          <Button
            className="text-danger hover:bg-danger/10 hover:text-danger"
            disabled={deletingAccount || deletePassword.length === 0}
            onClick={() => {
              if (window.confirm("确定要注销账号吗？这个操作不能撤销。")) {
                onDeleteAccount(deletePassword);
              }
            }}
            variant="ghost"
          >
            {deletingAccount ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
            注销账号
          </Button>
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}
