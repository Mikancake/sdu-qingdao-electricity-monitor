import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BatteryCharging,
  Building2,
  Bell,
  Database,
  Edit3,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Play,
  Save,
  ScrollText,
  Server,
  ShieldCheck,
  Sun,
  Trash2,
  Users,
  X
} from "lucide-react";

import { ApiError, createApiClient, getApiErrorMessage } from "../lib/api";
import type {
  AppearanceSettings,
  AdminAuditLog,
  AdminAuthToken,
  AdminAuthTokenHealthLog,
  AdminManagedUser,
  AdminManagedUserDetail,
  AdminRoom,
  RuntimeSettings,
  SmtpHealthLog,
  SmtpSettings
} from "../lib/types";
import { formatDateTime } from "../lib/utils";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Label } from "./ui/input";
import { NoticeDialog } from "./NoticeDialog";

const ADMIN_TOKEN_KEY = "sdu-electricity-admin-token";
const ADMIN_THEME_KEY = "sdu-electricity-theme";

type AdminView = "status" | "users" | "rooms" | "tokens" | "smtp" | "settings" | "account" | "audit";

function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return "服务器处理失败，请稍后再试。";
    }
    if (typeof error.detail === "string") {
      return error.detail;
    }
    return getApiErrorMessage(error);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败";
}

function healthTone(status?: string): "success" | "warning" | "danger" | "muted" {
  if (status === "healthy") return "success";
  if (status === "warning") return "warning";
  if (status === "invalid") return "danger";
  return "muted";
}

function healthLabel(status?: string) {
  const labels: Record<string, string> = {
    healthy: "健康",
    warning: "异常",
    invalid: "失效",
    unknown: "未检测"
  };
  return labels[status ?? "unknown"] ?? status ?? "未检测";
}

function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const api = useMemo(() => createApiClient(), []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: api.adminLogin,
    onSuccess: (result) => onLogin(result.access_token),
    onError: (err) => setError(describeError(err))
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    loginMutation.mutate({ username, password });
  }

  return (
    <main className="app-background flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck size={20} />
          </div>
          <CardTitle>管理后台</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">使用管理员用户名和密码登录。</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="admin-username">用户名</Label>
              <Input id="admin-username" value={username} onChange={(event) => setUsername(event.target.value)} required />
            </div>
            <div>
              <Label htmlFor="admin-password">密码</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <div className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div> : null}
            <Button className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function StatusPanel({
  onRunChecks,
  onRunNotifications,
  runningChecks,
  runningNotifications
}: {
  onRunChecks: () => void;
  onRunNotifications: () => void;
  runningChecks: boolean;
  runningNotifications: boolean;
}) {
  const api = useMemo(() => createApiClient(window.localStorage.getItem(ADMIN_TOKEN_KEY)), []);
  const statusQuery = useQuery({ queryKey: ["admin-status"], queryFn: api.getAdminStatus });
  const status = statusQuery.data;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">注册用户</div>
              <div className="mt-2 text-2xl font-semibold">{status?.total_users ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">已验证 {status?.verified_users ?? "--"}</div>
            </div>
            <ShieldCheck className="text-primary" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">使用宿舍</div>
              <div className="mt-2 text-2xl font-semibold">{status?.total_rooms ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">启用绑定 {status?.active_bindings ?? "--"}</div>
            </div>
            <BatteryCharging className="text-success" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Token</div>
              <div className="mt-2 text-2xl font-semibold">
                {status ? `${status.enabled_token_count}/${status.token_count}` : "--"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">异常 {status?.unhealthy_token_count ?? "--"}</div>
            </div>
            <KeyRound className="text-warning" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">SMTP</div>
              <div className="mt-2 text-2xl font-semibold">
                {status ? `${status.enabled_smtp_count}/${status.smtp_count}` : "--"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">异常 {status?.unhealthy_smtp_count ?? "--"}</div>
            </div>
            <Mail className={status?.smtp_configured ? "text-success" : "text-muted-foreground"} size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">提醒与日报</div>
              <div className="mt-2 text-2xl font-semibold">{status?.sent_notifications ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">业务记录 {status?.total_notifications ?? "--"}</div>
            </div>
            <Mail className="text-primary" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">24h 业务邮件</div>
              <div className="mt-2 text-2xl font-semibold">{status?.recent_sent_notifications ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">失败 {status?.recent_failed_notifications ?? "--"}</div>
            </div>
            <Bell className="text-success" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">全部发信</div>
              <div className="mt-2 text-2xl font-semibold">{status?.all_sent_emails ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                24h {status?.recent_sent_emails ?? "--"} · 失败 {status?.recent_failed_emails ?? "--"}
              </div>
            </div>
            <Mail className="text-primary" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">待发通知</div>
              <div className="mt-2 text-2xl font-semibold">{status?.pending_notifications ?? "--"}</div>
            </div>
            <Bell className="text-muted-foreground" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">失败通知</div>
              <div className="mt-2 text-2xl font-semibold">{status?.failed_notifications ?? "--"}</div>
            </div>
            <Bell className={status?.failed_notifications ? "text-danger" : "text-muted-foreground"} size={26} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>运行控制</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button disabled={runningChecks} onClick={onRunChecks} variant="secondary">
            {runningChecks ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            立即检查到期宿舍
          </Button>
          <Button disabled={runningNotifications} onClick={onRunNotifications} variant="secondary">
            {runningNotifications ? <Loader2 className="animate-spin" size={16} /> : <Bell size={16} />}
            立即扫描提醒
          </Button>
          <div className="flex items-center text-sm text-muted-foreground">
            最新读数：{formatDateTime(status?.latest_read_at)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminUserRoomEditor({
  binding,
  onSave,
  onDelete
}: {
  binding: AdminManagedUserDetail["rooms"][number];
  onSave: (
    bindingId: number,
    payload: {
      alert_days?: number;
      alert_threshold_mode?: "days" | "average" | "fixed";
      low_power_threshold?: string | null;
      manual_check_cooldown_seconds?: number | null;
      notify_cooldown_hours?: number | null;
      enabled?: boolean;
    }
  ) => void;
  onDelete: (bindingId: number) => void;
}) {
  const [enabled, setEnabled] = useState(binding.enabled);
  const [alertDays, setAlertDays] = useState(String(binding.alert_days));
  const [thresholdMode, setThresholdMode] = useState<"days" | "average" | "fixed">(
    binding.alert_threshold_mode ?? (binding.low_power_threshold ? "fixed" : "days")
  );
  const [threshold, setThreshold] = useState(binding.low_power_threshold ?? "");
  const [cooldown, setCooldown] = useState(binding.manual_check_cooldown_seconds?.toString() ?? "");
  const [notifyCooldown, setNotifyCooldown] = useState(binding.notify_cooldown_hours?.toString() ?? "");

  useEffect(() => {
    setEnabled(binding.enabled);
    setAlertDays(String(binding.alert_days));
    setThresholdMode(binding.alert_threshold_mode ?? (binding.low_power_threshold ? "fixed" : "days"));
    setThreshold(binding.low_power_threshold ?? "");
    setCooldown(binding.manual_check_cooldown_seconds?.toString() ?? "");
    setNotifyCooldown(binding.notify_cooldown_hours?.toString() ?? "");
  }, [binding]);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {binding.room.building_name} {binding.room.room_number}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">绑定 ID {binding.id}</div>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input className="h-4 w-4 accent-primary" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          启用
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor={`admin-threshold-mode-${binding.id}`}>提醒方式</Label>
          <select
            id={`admin-threshold-mode-${binding.id}`}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={thresholdMode}
            onChange={(event) => setThresholdMode(event.target.value as "days" | "average" | "fixed")}
          >
            <option value="days">按可用天数提醒</option>
            <option value="average">低于 1 天用电量提醒</option>
            <option value="fixed">按固定电量提醒</option>
          </select>
        </div>
        {thresholdMode === "days" ? (
          <div>
            <Label htmlFor={`admin-alert-days-${binding.id}`}>低于多少天用电量时提醒</Label>
            <Input
              id={`admin-alert-days-${binding.id}`}
              type="number"
              min={1}
              max={30}
              value={alertDays}
              onChange={(event) => setAlertDays(event.target.value)}
            />
          </div>
        ) : null}
        {thresholdMode === "fixed" ? (
          <div>
            <Label htmlFor={`admin-threshold-${binding.id}`}>固定电量阈值</Label>
            <Input
              id={`admin-threshold-${binding.id}`}
              type="number"
              min={0}
              step="0.1"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              placeholder="例如 10"
            />
          </div>
        ) : null}
        {thresholdMode === "average" ? (
          <div className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">
            低于 1 天用电量时提醒；有效下降读数不足时先按默认日均用电估算。
          </div>
        ) : null}
        <div>
          <Label htmlFor={`admin-notify-cooldown-${binding.id}`}>邮件间隔</Label>
          <Input
            id={`admin-notify-cooldown-${binding.id}`}
            type="number"
            min={0}
            value={notifyCooldown}
            onChange={(event) => setNotifyCooldown(event.target.value)}
            placeholder="继承用户/全局"
          />
        </div>
        <div>
          <Label htmlFor={`admin-cooldown-${binding.id}`}>立即同步冷却</Label>
          <Input
            id={`admin-cooldown-${binding.id}`}
            type="number"
            min={0}
            value={cooldown}
            onChange={(event) => setCooldown(event.target.value)}
            placeholder="继承用户/全局"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onSave(binding.id, {
              enabled,
              alert_days: Math.max(1, Number(alertDays) || binding.alert_days),
              alert_threshold_mode: thresholdMode,
              low_power_threshold: thresholdMode === "fixed" && threshold.trim() ? threshold.trim() : null,
              manual_check_cooldown_seconds: cooldown.trim() ? Math.max(0, Number(cooldown)) : null,
              notify_cooldown_hours: notifyCooldown.trim() ? Math.max(0, Number(notifyCooldown)) : null
            })
          }
        >
          <Save size={14} />
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(binding.id)}>
          <Trash2 size={14} />
          删除
        </Button>
      </div>
    </div>
  );
}

function UsersPanel({
  users,
  detail,
  loading,
  detailLoading,
  selectedUserId,
  onSelectUser,
  onUpdateUser,
  onUpdateRoom,
  onDeleteUser,
  onDeleteRoom
}: {
  users: AdminManagedUser[];
  detail?: AdminManagedUserDetail;
  loading: boolean;
  detailLoading: boolean;
  selectedUserId?: number | null;
  onSelectUser: (userId: number) => void;
  onUpdateUser: (
    userId: number,
    payload: {
      notification_email?: string | null;
      notification_email_verified?: boolean;
      manual_check_cooldown_seconds?: number | null;
      notify_cooldown_hours?: number | null;
    }
  ) => void;
  onUpdateRoom: (
    userId: number,
    bindingId: number,
    payload: {
      alert_days?: number;
      alert_threshold_mode?: "days" | "average" | "fixed";
      low_power_threshold?: string | null;
      manual_check_cooldown_seconds?: number | null;
      notify_cooldown_hours?: number | null;
      enabled?: boolean;
    }
  ) => void;
  onDeleteUser: (userId: number) => void;
  onDeleteRoom: (userId: number, bindingId: number) => void;
}) {
  const [notificationEmail, setNotificationEmail] = useState("");
  const [notificationVerified, setNotificationVerified] = useState(false);
  const [userCooldown, setUserCooldown] = useState("");
  const [userNotifyCooldown, setUserNotifyCooldown] = useState("");

  useEffect(() => {
    if (!detail) {
      return;
    }
    setNotificationEmail(detail.notification_email ?? "");
    setNotificationVerified(detail.notification_email_verified);
    setUserCooldown(detail.manual_check_cooldown_seconds?.toString() ?? "");
    setUserNotifyCooldown(detail.notify_cooldown_hours?.toString() ?? "");
  }, [detail]);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">查看注册用户、邮箱验证状态和绑定宿舍数量。</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={18} />
              正在读取用户
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">用户</th>
                    <th className="px-4 py-3 font-medium">提醒邮箱</th>
                    <th className="px-4 py-3 font-medium">宿舍</th>
                    <th className="px-4 py-3 font-medium">注册时间</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className={`cursor-pointer border-t border-border transition hover:bg-muted/60 ${
                        selectedUserId === user.id ? "bg-muted" : ""
                      }`}
                      onClick={() => onSelectUser(user.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{user.email}</div>
                        <Badge className="mt-1" tone={user.is_verified ? "success" : "warning"}>
                          {user.is_verified ? "已验证" : "未验证"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[240px] truncate text-muted-foreground">{user.notification_email || user.email}</div>
                        <Badge className="mt-1" tone={user.notification_email_verified || !user.notification_email ? "success" : "warning"}>
                          {user.notification_email_verified || !user.notification_email ? "可用" : "待验证"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{user.room_count}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(user.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>用户详情</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedUserId ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">选择左侧用户查看详情</div>
          ) : detailLoading ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={18} />
              正在读取详情
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">账号邮箱</div>
                <div className="mt-1 break-all text-sm font-medium">{detail.email}</div>
              </div>
              <div className="rounded-lg border border-danger/20 bg-danger/5 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-danger">删除用户</div>
                    <div className="mt-1 text-xs text-muted-foreground">删除后会移除该用户的宿舍绑定、通知和登录权限。</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteUser(detail.id)}>
                    <Trash2 size={14} />
                    删除用户
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="grid gap-3">
                  <div>
                    <Label htmlFor="admin-user-notification-email">提醒邮箱</Label>
                    <Input
                      id="admin-user-notification-email"
                      type="email"
                      value={notificationEmail}
                      onChange={(event) => setNotificationEmail(event.target.value)}
                      placeholder="留空则使用账号邮箱"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-user-notify-cooldown">用户邮件间隔覆盖（小时）</Label>
                    <Input
                      id="admin-user-notify-cooldown"
                      type="number"
                      min={0}
                      value={userNotifyCooldown}
                      onChange={(event) => setUserNotifyCooldown(event.target.value)}
                      placeholder="留空则继承全局"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-user-cooldown">用户立即同步冷却覆盖（秒）</Label>
                    <Input
                      id="admin-user-cooldown"
                      type="number"
                      min={0}
                      value={userCooldown}
                      onChange={(event) => setUserCooldown(event.target.value)}
                      placeholder="留空则继承全局"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      className="h-4 w-4 accent-primary"
                      type="checkbox"
                      checked={notificationVerified}
                      onChange={(event) => setNotificationVerified(event.target.checked)}
                    />
                    提醒邮箱已验证
                  </label>
                  <Button
                    size="sm"
                    onClick={() =>
                      onUpdateUser(detail.id, {
                        notification_email: notificationEmail.trim() ? notificationEmail.trim() : null,
                        notification_email_verified: notificationVerified,
                        manual_check_cooldown_seconds: userCooldown.trim() ? Math.max(0, Number(userCooldown)) : null,
                        notify_cooldown_hours: userNotifyCooldown.trim() ? Math.max(0, Number(userNotifyCooldown)) : null
                      })
                    }
                  >
                    <Save size={14} />
                    保存用户配置
                  </Button>
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">绑定宿舍</div>
                <div className="space-y-2">
                  {detail.rooms.length === 0 ? (
                    <div className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">暂无绑定宿舍</div>
                  ) : (
                    detail.rooms.map((binding) => (
                      <AdminUserRoomEditor
                        key={binding.id}
                        binding={binding}
                        onSave={(bindingId, payload) => onUpdateRoom(detail.id, bindingId, payload)}
                        onDelete={(bindingId) => onDeleteRoom(detail.id, bindingId)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">用户不存在或读取失败</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminRoomsPanel({
  rooms,
  loading,
  deletingBindingId,
  onDeleteBinding
}: {
  rooms: AdminRoom[];
  loading: boolean;
  deletingBindingId?: number | null;
  onDeleteBinding: (userId: number, bindingId: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>宿舍列表</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">按当前绑定关系统计宿舍，删除绑定后这里会同步减少。</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 animate-spin" size={18} />
            正在读取宿舍
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex h-44 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
            暂无宿舍绑定
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">宿舍</th>
                  <th className="px-4 py-3 font-medium">绑定人数</th>
                  <th className="px-4 py-3 font-medium">绑定账号邮箱</th>
                  <th className="px-4 py-3 font-medium">提醒邮箱</th>
                  <th className="px-4 py-3 font-medium">最近绑定</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((item) => {
                  const newestBinding = item.bindings.reduce<string | null>((latest, binding) => {
                    if (!latest || new Date(binding.created_at).getTime() > new Date(latest).getTime()) {
                      return binding.created_at;
                    }
                    return latest;
                  }, null);

                  return (
                    <tr key={item.room.id} className="border-t border-border align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {item.room.building_name} {item.room.room_number}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.room.campus}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="success">{item.binding_count}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {item.bindings.map((binding) => (
                            <div key={binding.binding_id} className="break-all text-muted-foreground">
                              {binding.email}
                              {!binding.enabled ? <span className="ml-2 text-xs text-warning">停用</span> : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {item.bindings.map((binding) => (
                            <div key={binding.binding_id} className="break-all text-muted-foreground">
                              {binding.notification_email || binding.email}
                              <span className={binding.notification_email_verified ? "ml-2 text-xs text-success" : "ml-2 text-xs text-muted-foreground"}>
                                {binding.notification_email_verified ? "已验证" : "账号邮箱"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(newestBinding)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1">
                          {item.bindings.map((binding) => (
                            <Button
                              key={binding.binding_id}
                              size="sm"
                              variant="ghost"
                              disabled={deletingBindingId === binding.binding_id}
                              onClick={() => onDeleteBinding(binding.user_id, binding.binding_id)}
                            >
                              {deletingBindingId === binding.binding_id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                              删除绑定
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TokenPanel({
  tokens,
  logs,
  loading,
  onCreate,
  onUpdate,
  onTest,
  onToggle,
  onDelete,
  saving,
  testingTokenId
}: {
  tokens: AdminAuthToken[];
  logs: AdminAuthTokenHealthLog[];
  loading: boolean;
  onCreate: (payload: { name: string; token_value: string; min_interval_seconds: number; enabled: boolean }) => void;
  onUpdate: (
    tokenId: number,
    payload: { name?: string; token_value?: string; min_interval_seconds?: number; enabled?: boolean }
  ) => void;
  onTest: (tokenId: number) => void;
  onToggle: (token: AdminAuthToken) => void;
  onDelete: (tokenId: number) => void;
  saving: boolean;
  testingTokenId: number | null;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [interval, setInterval] = useState(10);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editInterval, setEditInterval] = useState(10);
  const [editEnabled, setEditEnabled] = useState(true);

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({ name: name.trim(), token_value: value.trim(), min_interval_seconds: interval, enabled: true });
    setName("");
    setValue("");
  }

  function startEdit(token: AdminAuthToken) {
    setEditingId(token.id);
    setEditName(token.name);
    setEditValue("");
    setEditInterval(token.min_interval_seconds);
    setEditEnabled(token.enabled);
  }

  function saveEdit(tokenId: number) {
    onUpdate(tokenId, {
      name: editName.trim(),
      token_value: editValue.trim() || undefined,
      min_interval_seconds: editInterval,
      enabled: editEnabled
    });
    setEditingId(null);
    setEditValue("");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>添加 Token</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="token-name">名称</Label>
              <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="token-1" required />
            </div>
            <div>
              <Label htmlFor="token-value">Token</Label>
              <Input id="token-value" value={value} onChange={(event) => setValue(event.target.value)} placeholder="bearer ..." required />
            </div>
            <div>
              <Label htmlFor="token-interval">最小间隔（秒）</Label>
              <Input
                id="token-interval"
                type="number"
                min={0}
                value={interval}
                onChange={(event) => setInterval(Number(event.target.value))}
              />
            </div>
            <Button className="w-full" disabled={saving || !name.trim() || !value.trim()}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              保存 Token
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Token 池</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={18} />
              正在读取 Token
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">名称</th>
                    <th className="px-4 py-3 font-medium">Token</th>
                    <th className="px-4 py-3 font-medium">间隔</th>
                    <th className="px-4 py-3 font-medium">健康</th>
                    <th className="px-4 py-3 font-medium">最近使用</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id} className="border-t border-border">
                      {editingId === token.id ? (
                        <>
                          <td className="px-4 py-3">
                            <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                className="h-4 w-4 accent-primary"
                                type="checkbox"
                                checked={editEnabled}
                                onChange={(event) => setEditEnabled(event.target.checked)}
                              />
                              启用
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              value={editValue}
                              onChange={(event) => setEditValue(event.target.value)}
                              placeholder="留空则不替换 Token"
                            />
                            <div className="mt-1 text-xs text-muted-foreground">当前：{token.token_preview}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min={0}
                              value={editInterval}
                              onChange={(event) => setEditInterval(Number(event.target.value))}
                            />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <Badge tone={healthTone(token.health_status)}>{healthLabel(token.health_status)}</Badge>
                            <div className="mt-1 text-xs">失败 {token.failure_count}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDateTime(token.last_used_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button size="icon" variant="secondary" title="保存" onClick={() => saveEdit(token.id)}>
                                <Save size={15} />
                              </Button>
                              <Button size="icon" variant="ghost" title="取消" onClick={() => setEditingId(null)}>
                                <X size={15} />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <div className="font-medium">{token.name}</div>
                            <Badge className="mt-1" tone={token.enabled ? "success" : "muted"}>
                              {token.enabled ? "启用" : "停用"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{token.token_preview}</td>
                          <td className="px-4 py-3 text-muted-foreground">{token.min_interval_seconds}s</td>
                          <td className="px-4 py-3">
                            <Badge tone={healthTone(token.health_status)}>{healthLabel(token.health_status)}</Badge>
                            <div className="mt-1 text-xs text-muted-foreground">失败 {token.failure_count}</div>
                            {token.last_error_msg ? (
                              <div className="mt-1 max-w-[220px] truncate text-xs text-danger" title={token.last_error_msg}>
                                {token.last_error_kind}: {token.last_error_msg}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDateTime(token.last_used_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button size="icon" variant="secondary" title="测试 Token" onClick={() => onTest(token.id)}>
                                {testingTokenId === token.id ? <Loader2 className="animate-spin" size={15} /> : <Play size={15} />}
                              </Button>
                              <Button size="icon" variant="secondary" title="编辑" onClick={() => startEdit(token)}>
                                <Edit3 size={15} />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => onToggle(token)}>
                                {token.enabled ? "停用" : "启用"}
                              </Button>
                              <Button size="icon" variant="ghost" title="删除" onClick={() => onDelete(token.id)}>
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Token 健康日志</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">Token</th>
                  <th className="px-4 py-3 font-medium">来源</th>
                  <th className="px-4 py-3 font-medium">结果</th>
                  <th className="px-4 py-3 font-medium">错误</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      暂无健康日志
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t border-border">
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-3">{log.token_name ?? `#${log.token_id ?? "-"}`}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.source}</td>
                      <td className="px-4 py-3">
                        <Badge tone={log.success ? "success" : healthTone(log.health_status)}>
                          {log.success ? "成功" : healthLabel(log.health_status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {log.error_kind ? `${log.error_kind}: ${log.error_msg ?? ""}` : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SmtpPanel({
  accounts,
  logs,
  onCreate,
  onUpdate,
  onDelete,
  onTest,
  saving,
  testingSmtpId
}: {
  accounts: SmtpSettings[];
  logs: SmtpHealthLog[];
  onCreate: (payload: {
    name: string;
    host: string;
    port: number;
    username?: string | null;
    password?: string | null;
    from_email: string;
    enabled: boolean;
    min_interval_seconds: number;
    use_ssl: boolean;
    use_starttls: boolean;
  }) => void;
  onUpdate: (
    smtpId: number,
    payload: Partial<SmtpSettings> & { password?: string | null }
  ) => void;
  onDelete: (smtpId: number) => void;
  onTest: (smtpId: number, email: string) => void;
  saving: boolean;
  testingSmtpId: number | null;
}) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(465);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [interval, setInterval] = useState(0);
  const [useSsl, setUseSsl] = useState(true);
  const [useStarttls, setUseStarttls] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editHost, setEditHost] = useState("");
  const [editPort, setEditPort] = useState(465);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editFromEmail, setEditFromEmail] = useState("");
  const [editInterval, setEditInterval] = useState(0);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editUseSsl, setEditUseSsl] = useState(true);
  const [editUseStarttls, setEditUseStarttls] = useState(false);
  const [testEmails, setTestEmails] = useState<Record<number, string>>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({
      name: name.trim(),
      host: host.trim(),
      port,
      username: username.trim() || null,
      password: password || null,
      from_email: fromEmail.trim(),
      enabled: true,
      min_interval_seconds: interval,
      use_ssl: useSsl,
      use_starttls: useStarttls
    });
    setName("");
    setHost("");
    setUsername("");
    setPassword("");
    setFromEmail("");
  }

  function startEdit(item: SmtpSettings) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditHost(item.host ?? "");
    setEditPort(item.port);
    setEditUsername(item.username ?? "");
    setEditPassword("");
    setEditFromEmail(item.from_email ?? "");
    setEditInterval(item.min_interval_seconds);
    setEditEnabled(item.enabled);
    setEditUseSsl(item.use_ssl);
    setEditUseStarttls(item.use_starttls);
  }

  function saveEdit(item: SmtpSettings) {
    onUpdate(item.id, {
      name: editName.trim(),
      host: editHost.trim(),
      port: editPort,
      username: editUsername.trim() || null,
      password: editPassword || undefined,
      from_email: editFromEmail.trim(),
      enabled: editEnabled,
      min_interval_seconds: editInterval,
      use_ssl: editUseSsl,
      use_starttls: editUseStarttls
    });
    setEditingId(null);
    setEditPassword("");
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>添加 SMTP 发件邮箱</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
            <div>
              <Label htmlFor="smtp-name">名称</Label>
              <Input id="smtp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="smtp-1" required />
            </div>
            <div>
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input id="smtp-host" value={host} onChange={(event) => setHost(event.target.value)} required />
            </div>
            <div>
              <Label htmlFor="smtp-port">端口</Label>
              <Input id="smtp-port" type="number" value={port} onChange={(event) => setPort(Number(event.target.value))} />
            </div>
            <div>
              <Label htmlFor="smtp-user">用户名</Label>
              <Input id="smtp-user" value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="smtp-from">发件邮箱</Label>
              <Input id="smtp-from" type="email" value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} required />
            </div>
            <div>
              <Label htmlFor="smtp-password">密码 / 授权码</Label>
              <Input id="smtp-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="smtp-interval">最小间隔（秒）</Label>
              <Input id="smtp-interval" type="number" min={0} value={interval} onChange={(event) => setInterval(Number(event.target.value))} />
            </div>
            <div className="flex items-end gap-4 pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input className="h-4 w-4 accent-primary" type="checkbox" checked={useSsl} onChange={(event) => setUseSsl(event.target.checked)} />
                SSL
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input className="h-4 w-4 accent-primary" type="checkbox" checked={useStarttls} onChange={(event) => setUseStarttls(event.target.checked)} />
                STARTTLS
              </label>
            </div>
            <Button className="md:col-span-2" disabled={saving || !name.trim() || !host.trim() || !fromEmail.trim()}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              保存 SMTP
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMTP 池</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">地址</th>
                  <th className="px-4 py-3 font-medium">健康</th>
                  <th className="px-4 py-3 font-medium">测试</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      暂无后台 SMTP 配置；如果 .env 配了 SMTP，系统仍会用 .env 作为兜底。
                    </td>
                  </tr>
                ) : (
                  accounts.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      {editingId === item.id ? (
                        <>
                          <td className="px-4 py-3">
                            <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                              <input className="h-4 w-4 accent-primary" type="checkbox" checked={editEnabled} onChange={(event) => setEditEnabled(event.target.checked)} />
                              启用
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <div className="grid gap-2">
                              <Input value={editHost} onChange={(event) => setEditHost(event.target.value)} placeholder="SMTP Host" />
                              <Input type="number" value={editPort} onChange={(event) => setEditPort(Number(event.target.value))} placeholder="端口" />
                              <Input value={editUsername} onChange={(event) => setEditUsername(event.target.value)} placeholder="用户名" />
                              <Input type="email" value={editFromEmail} onChange={(event) => setEditFromEmail(event.target.value)} placeholder="发件邮箱" />
                              <Input type="password" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} placeholder={item.password_configured ? "已保存，留空不修改" : "密码 / 授权码"} />
                              <Input type="number" min={0} value={editInterval} onChange={(event) => setEditInterval(Number(event.target.value))} placeholder="最小间隔" />
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <label className="inline-flex items-center gap-2">
                                  <input className="h-4 w-4 accent-primary" type="checkbox" checked={editUseSsl} onChange={(event) => setEditUseSsl(event.target.checked)} />
                                  SSL
                                </label>
                                <label className="inline-flex items-center gap-2">
                                  <input className="h-4 w-4 accent-primary" type="checkbox" checked={editUseStarttls} onChange={(event) => setEditUseStarttls(event.target.checked)} />
                                  STARTTLS
                                </label>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={healthTone(item.health_status)}>{healthLabel(item.health_status)}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">保存后测试</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button size="icon" variant="secondary" title="保存" onClick={() => saveEdit(item)}>
                                <Save size={15} />
                              </Button>
                              <Button size="icon" variant="ghost" title="取消" onClick={() => setEditingId(null)}>
                                <X size={15} />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <div className="font-medium">{item.name}</div>
                            <Badge className="mt-1" tone={item.enabled ? "success" : "muted"}>
                              {item.enabled ? "启用" : "停用"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <div>{item.host}:{item.port}</div>
                            <div className="mt-1">{item.from_email}</div>
                            <div className="mt-1 text-xs">间隔 {item.min_interval_seconds}s，最近使用 {formatDateTime(item.last_used_at)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={healthTone(item.health_status)}>{healthLabel(item.health_status)}</Badge>
                            <div className="mt-1 text-xs text-muted-foreground">失败 {item.failure_count}</div>
                            {item.last_error_msg ? (
                              <div className="mt-1 max-w-[240px] truncate text-xs text-danger" title={item.last_error_msg}>
                                {item.last_error_kind}: {item.last_error_msg}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex min-w-[240px] gap-2">
                              <Input
                                type="email"
                                value={testEmails[item.id] ?? ""}
                                onChange={(event) => setTestEmails((prev) => ({ ...prev, [item.id]: event.target.value }))}
                                placeholder="测试收件邮箱"
                              />
                              <Button
                                size="icon"
                                variant="secondary"
                                disabled={testingSmtpId === item.id || !(testEmails[item.id] ?? "").trim()}
                                title="测试 SMTP"
                                onClick={() => onTest(item.id, (testEmails[item.id] ?? "").trim())}
                              >
                                {testingSmtpId === item.id ? <Loader2 className="animate-spin" size={15} /> : <Mail size={15} />}
                              </Button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button size="icon" variant="secondary" title="编辑" onClick={() => startEdit(item)}>
                                <Edit3 size={15} />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => onUpdate(item.id, { enabled: !item.enabled })}>
                                {item.enabled ? "停用" : "启用"}
                              </Button>
                              <Button size="icon" variant="ghost" title="删除" onClick={() => onDelete(item.id)}>
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMTP 健康日志</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">SMTP</th>
                  <th className="px-4 py-3 font-medium">来源</th>
                  <th className="px-4 py-3 font-medium">收件人</th>
                  <th className="px-4 py-3 font-medium">结果</th>
                  <th className="px-4 py-3 font-medium">错误</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                      暂无 SMTP 健康日志
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t border-border">
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-3">{log.smtp_name ?? `#${log.smtp_id ?? "-"}`}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.source}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.recipient_email ?? "-"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={log.success ? "success" : healthTone(log.health_status)}>
                          {log.success ? "成功" : healthLabel(log.health_status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {log.error_kind ? `${log.error_kind}: ${log.error_msg ?? ""}` : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
  | "retention_cleanup_hour";

function RuntimeSettingsPanel({
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
  onUploadAppearanceBackground: (theme: "light" | "dark", file: File) => Promise<{ theme: "light" | "dark"; url: string }>;
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
                placeholder="例如 10.102.1.23"
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

function AccountPanel({
  admin,
  onUpdateProfile,
  onUpdatePassword,
  savingProfile,
  savingPassword
}: {
  admin?: { username: string; display_name?: string | null };
  onUpdateProfile: (payload: { display_name?: string | null }) => void;
  onUpdatePassword: (payload: { old_password: string; new_password: string }) => void;
  savingProfile: boolean;
  savingPassword: boolean;
}) {
  const [displayName, setDisplayName] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    setDisplayName(admin?.display_name ?? "");
  }, [admin?.display_name]);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>管理员资料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>用户名</Label>
            <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">{admin?.username ?? "--"}</div>
          </div>
          <div>
            <Label htmlFor="admin-display-name">显示名</Label>
            <Input id="admin-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </div>
          <Button disabled={savingProfile} onClick={() => onUpdateProfile({ display_name: displayName.trim() || null })}>
            {savingProfile ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存资料
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="admin-old-password">旧密码</Label>
            <Input
              id="admin-old-password"
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="admin-new-password">新密码</Label>
            <Input
              id="admin-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
            />
          </div>
          <Button
            disabled={savingPassword || oldPassword.length === 0 || newPassword.length < 8}
            onClick={() => {
              onUpdatePassword({ old_password: oldPassword, new_password: newPassword });
              setOldPassword("");
              setNewPassword("");
            }}
          >
            {savingPassword ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
            更新密码
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditPanel({ logs, loading }: { logs: Array<{ id: number; action: string; target_type: string; target_id?: string | null; detail?: string | null; created_at: string }>; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>审计日志</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">记录管理员最近的配置修改操作。</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 animate-spin" size={18} />
            正在读取审计日志
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">动作</th>
                  <th className="px-4 py-3 font-medium">目标</th>
                  <th className="px-4 py-3 font-medium">详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-3 font-medium">{log.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.target_type} {log.target_id ?? ""}
                    </td>
                    <td className="max-w-[420px] truncate px-4 py-3 text-muted-foreground">{log.detail ?? "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminApp() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_KEY));
  const [activeView, setActiveView] = useState<AdminView>("status");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem(ADMIN_THEME_KEY) === "dark");
  const api = useMemo(() => createApiClient(token), [token]);

  const meQuery = useQuery({ queryKey: ["admin-me"], queryFn: api.getAdminMe, enabled: Boolean(token) });
  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: api.listAdminUsers, enabled: Boolean(token) });
  const userDetailQuery = useQuery({
    queryKey: ["admin-user", selectedUserId],
    queryFn: () => api.getAdminUser(selectedUserId as number),
    enabled: Boolean(token && selectedUserId)
  });
  const adminRoomsQuery = useQuery({ queryKey: ["admin-rooms"], queryFn: api.listAdminRooms, enabled: Boolean(token) });
  const tokensQuery = useQuery({ queryKey: ["admin-tokens"], queryFn: api.listAdminTokens, enabled: Boolean(token) });
  const tokenLogsQuery = useQuery({ queryKey: ["admin-token-health-logs"], queryFn: api.listAdminTokenHealthLogs, enabled: Boolean(token) });
  const smtpQuery = useQuery({ queryKey: ["admin-smtp"], queryFn: api.listSmtpSettings, enabled: Boolean(token) });
  const smtpLogsQuery = useQuery({ queryKey: ["admin-smtp-health-logs"], queryFn: api.listSmtpHealthLogs, enabled: Boolean(token) });
  const appearanceQuery = useQuery({ queryKey: ["admin-appearance"], queryFn: api.getAppearanceSettings, enabled: Boolean(token) });
  const runtimeQuery = useQuery({ queryKey: ["admin-runtime"], queryFn: api.getRuntimeSettings, enabled: Boolean(token) });
  const auditLogsQuery = useQuery({ queryKey: ["admin-audit-logs"], queryFn: api.listAdminAuditLogs, enabled: Boolean(token) });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage.setItem(ADMIN_THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      handleLogout();
    }
  }, [meQuery.error]);

  function handleLogin(nextToken: string) {
    window.localStorage.setItem(ADMIN_TOKEN_KEY, nextToken);
    setToken(nextToken);
  }

  function handleLogout() {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    queryClient.clear();
  }

  function refreshAdminAudit() {
    void queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
  }

  function refreshManagedUser() {
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-user"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-rooms"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
  }

  function refreshTokenState() {
    void queryClient.invalidateQueries({ queryKey: ["admin-tokens"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-token-health-logs"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
  }

  function refreshSmtpState() {
    void queryClient.invalidateQueries({ queryKey: ["admin-smtp"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-smtp-health-logs"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
  }

  const updateAdminProfileMutation = useMutation({
    mutationFn: api.updateAdminProfile,
    onSuccess: () => {
      setNotice("管理员资料已保存。");
      void queryClient.invalidateQueries({ queryKey: ["admin-me"] });
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const updateAdminPasswordMutation = useMutation({
    mutationFn: api.updateAdminPassword,
    onSuccess: () => {
      setNotice("管理员密码已更新。");
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const updateManagedUserMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: Parameters<typeof api.updateAdminUser>[1] }) =>
      api.updateAdminUser(userId, payload),
    onSuccess: () => {
      setNotice("用户配置已保存。");
      refreshManagedUser();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const updateManagedUserRoomMutation = useMutation({
    mutationFn: ({
      userId,
      bindingId,
      payload
    }: {
      userId: number;
      bindingId: number;
      payload: Parameters<typeof api.updateAdminUserRoom>[2];
    }) => api.updateAdminUserRoom(userId, bindingId, payload),
    onSuccess: () => {
      setNotice("宿舍绑定配置已保存。");
      refreshManagedUser();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const deleteManagedUserRoomMutation = useMutation({
    mutationFn: ({ userId, bindingId }: { userId: number; bindingId: number }) => api.deleteAdminUserRoom(userId, bindingId),
    onSuccess: () => {
      setNotice("宿舍绑定已删除。");
      refreshManagedUser();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const deleteManagedUserMutation = useMutation({
    mutationFn: api.deleteAdminUser,
    onSuccess: () => {
      setNotice("用户已删除。");
      setSelectedUserId(null);
      refreshManagedUser();
      void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const createTokenMutation = useMutation({
    mutationFn: api.createAdminToken,
    onSuccess: () => {
      setNotice("Token 已保存。");
      refreshTokenState();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const updateTokenMutation = useMutation({
    mutationFn: ({
      id,
      payload
    }: {
      id: number;
      payload: { name?: string; token_value?: string; min_interval_seconds?: number; enabled?: boolean };
    }) => api.updateAdminToken(id, payload),
    onSuccess: () => {
      setNotice("Token 已更新。");
      refreshTokenState();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const deleteTokenMutation = useMutation({
    mutationFn: api.deleteAdminToken,
    onSuccess: () => {
      setNotice("Token 已删除。");
      refreshTokenState();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const testTokenMutation = useMutation({
    mutationFn: (id: number) => api.testAdminToken(id),
    onSuccess: (result) => {
      setNotice(result.success ? "Token 测试成功。" : `Token 测试失败：${result.error_kind ?? "unknown"}`);
      refreshTokenState();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const createSmtpMutation = useMutation({
    mutationFn: api.createSmtpSettings,
    onSuccess: () => {
      setNotice("SMTP 已保存。");
      refreshSmtpState();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const updateSmtpMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof api.updateSmtpSettings>[1] }) =>
      api.updateSmtpSettings(id, payload),
    onSuccess: () => {
      setNotice("SMTP 已更新。");
      refreshSmtpState();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const deleteSmtpMutation = useMutation({
    mutationFn: api.deleteSmtpSettings,
    onSuccess: () => {
      setNotice("SMTP 已删除。");
      refreshSmtpState();
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const smtpTestMutation = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) => api.testSmtpSettings(id, { to_email: email }),
    onSuccess: () => {
      setNotice("测试邮件已发送。");
      refreshSmtpState();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const appearanceMutation = useMutation({
    mutationFn: api.updateAppearanceSettings,
    onSuccess: () => {
      setNotice("全局外观已保存。");
      void queryClient.invalidateQueries({ queryKey: ["admin-appearance"] });
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const appearanceUploadMutation = useMutation({
    mutationFn: api.uploadAppearanceBackground,
    onSuccess: (result) => setNotice(`${result.theme === "light" ? "亮色" : "暗色"}背景已上传，请保存全局外观。`),
    onError: (error) => setNotice(describeError(error))
  });

  const runtimeMutation = useMutation({
    mutationFn: api.updateRuntimeSettings,
    onSuccess: () => {
      setNotice("全局设置已保存。");
      void queryClient.invalidateQueries({ queryKey: ["admin-runtime"] });
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const dataRetentionCleanupMutation = useMutation({
    mutationFn: api.runAdminDataRetentionCleanup,
    onSuccess: (result) => {
      setNotice(`过期数据清理完成：共删除 ${result.total_deleted} 条。`);
      void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const clearRateLimitsMutation = useMutation({
    mutationFn: api.clearAdminRateLimits,
    onSuccess: (result) => {
      setNotice(`限流记录已清除：${result.cleared_keys} 条。`);
      void queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const runChecksMutation = useMutation({
    mutationFn: api.runAdminChecks,
    onSuccess: (result) => {
      setNotice(`检查完成：${result.succeeded}/${result.checked} 成功。`);
      void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const runNotificationsMutation = useMutation({
    mutationFn: api.runAdminNotifications,
    onSuccess: (result) => setNotice(`通知扫描完成：发送 ${result.sent}，跳过 ${result.skipped}。`),
    onError: (error) => setNotice(describeError(error))
  });

  if (!token) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const nav: Array<{ key: AdminView; label: string; icon: JSX.Element }> = [
    { key: "status", label: "状态", icon: <Server size={17} /> },
    { key: "users", label: "用户", icon: <Users size={17} /> },
    { key: "rooms", label: "宿舍", icon: <Building2 size={17} /> },
    { key: "tokens", label: "Token", icon: <KeyRound size={17} /> },
    { key: "smtp", label: "SMTP", icon: <Mail size={17} /> },
    { key: "settings", label: "设置", icon: <Database size={17} /> },
    { key: "account", label: "账号", icon: <ShieldCheck size={17} /> },
    { key: "audit", label: "审计", icon: <ScrollText size={17} /> }
  ];

  return (
    <div className="app-background min-h-screen text-foreground">
      <aside className="glass-panel fixed inset-y-0 left-0 hidden w-64 border-r border-border/70 lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck size={19} />
          </div>
          <div>
            <div className="text-sm font-semibold">Admin Console</div>
            <div className="text-xs text-muted-foreground">{meQuery.data?.username ?? "管理后台"}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map((item) => (
            <button
              key={item.key}
              className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm transition ${
                activeView === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => setActiveView(item.key)}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <Button className="w-full justify-start" variant="ghost" onClick={handleLogout}>
            <LogOut size={16} />
            退出管理后台
          </Button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="glass-panel sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border/70 px-4 lg:px-6">
          <div>
            <div className="text-sm font-semibold">管理后台</div>
            <div className="text-xs text-muted-foreground">{meQuery.data?.display_name || meQuery.data?.username || "正在读取管理员"}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDarkMode((value) => !value)}>
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              {darkMode ? "浅色" : "暗色"}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleLogout}>
              <LogOut size={16} />
              退出
            </Button>
          </div>
        </header>

        <nav className="glass-panel grid grid-cols-4 gap-2 border-b border-border/70 px-3 py-2 sm:grid-cols-8 lg:hidden">
          {nav.map((item) => (
            <button
              key={item.key}
              className={`flex h-9 items-center justify-center gap-2 rounded-md text-xs transition ${
                activeView === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => setActiveView(item.key)}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-6">
          <NoticeDialog message={notice} onClose={() => setNotice(null)} />

          {activeView === "status" ? (
            <StatusPanel
              onRunChecks={() => runChecksMutation.mutate()}
              onRunNotifications={() => runNotificationsMutation.mutate()}
              runningChecks={runChecksMutation.isPending}
              runningNotifications={runNotificationsMutation.isPending}
            />
          ) : null}

          {activeView === "users" ? (
            <UsersPanel
              users={usersQuery.data ?? []}
              detail={userDetailQuery.data}
              loading={usersQuery.isLoading}
              detailLoading={userDetailQuery.isLoading}
              selectedUserId={selectedUserId}
              onSelectUser={setSelectedUserId}
              onUpdateUser={(userId, payload) => updateManagedUserMutation.mutate({ userId, payload })}
              onUpdateRoom={(userId, bindingId, payload) =>
                updateManagedUserRoomMutation.mutate({ userId, bindingId, payload })
              }
              onDeleteUser={(userId) => {
                if (window.confirm("确定删除这个用户吗？该用户的宿舍绑定和通知记录也会被删除。")) {
                  deleteManagedUserMutation.mutate(userId);
                }
              }}
              onDeleteRoom={(userId, bindingId) => {
                if (window.confirm("确定删除这个宿舍绑定吗？")) {
                  deleteManagedUserRoomMutation.mutate({ userId, bindingId });
                }
              }}
            />
          ) : null}

          {activeView === "rooms" ? (
            <AdminRoomsPanel
              rooms={adminRoomsQuery.data ?? []}
              loading={adminRoomsQuery.isLoading}
              deletingBindingId={deleteManagedUserRoomMutation.variables?.bindingId ?? null}
              onDeleteBinding={(userId, bindingId) => {
                if (window.confirm("确定删除这个用户的宿舍绑定吗？")) {
                  deleteManagedUserRoomMutation.mutate({ userId, bindingId });
                }
              }}
            />
          ) : null}

          {activeView === "tokens" ? (
            <TokenPanel
              tokens={tokensQuery.data ?? []}
              logs={tokenLogsQuery.data ?? []}
              loading={tokensQuery.isLoading}
              saving={createTokenMutation.isPending}
              onCreate={(payload) => createTokenMutation.mutate(payload)}
              onUpdate={(id, payload) => updateTokenMutation.mutate({ id, payload })}
              onTest={(id) => testTokenMutation.mutate(id)}
              onToggle={(item) => updateTokenMutation.mutate({ id: item.id, payload: { enabled: !item.enabled } })}
              onDelete={(id) => deleteTokenMutation.mutate(id)}
              testingTokenId={testTokenMutation.variables ?? null}
            />
          ) : null}

          {activeView === "smtp" ? (
            <SmtpPanel
              accounts={smtpQuery.data ?? []}
              logs={smtpLogsQuery.data ?? []}
              saving={createSmtpMutation.isPending}
              testingSmtpId={smtpTestMutation.variables?.id ?? null}
              onCreate={(payload) => createSmtpMutation.mutate(payload)}
              onUpdate={(id, payload) => updateSmtpMutation.mutate({ id, payload })}
              onDelete={(id) => {
                if (window.confirm("确定删除这个 SMTP 发件账号吗？")) {
                  deleteSmtpMutation.mutate(id);
                }
              }}
              onTest={(id, email) => smtpTestMutation.mutate({ id, email })}
            />
          ) : null}

          {activeView === "settings" ? (
            <RuntimeSettingsPanel
              runtime={runtimeQuery.data}
              appearance={appearanceQuery.data}
              saving={runtimeMutation.isPending}
              savingAppearance={appearanceMutation.isPending}
              onSave={(payload) => runtimeMutation.mutate(payload)}
              onSaveAppearance={(payload) => appearanceMutation.mutate(payload)}
              onUploadAppearanceBackground={(theme, file) => appearanceUploadMutation.mutateAsync({ theme, file })}
              onRunDataRetentionCleanup={() => dataRetentionCleanupMutation.mutate()}
              cleaningRetention={dataRetentionCleanupMutation.isPending}
              onClearRateLimits={(payload) => clearRateLimitsMutation.mutate(payload)}
              clearingRateLimits={clearRateLimitsMutation.isPending}
            />
          ) : null}

          {activeView === "account" ? (
            <AccountPanel
              admin={meQuery.data}
              savingProfile={updateAdminProfileMutation.isPending}
              savingPassword={updateAdminPasswordMutation.isPending}
              onUpdateProfile={(payload) => updateAdminProfileMutation.mutate(payload)}
              onUpdatePassword={(payload) => updateAdminPasswordMutation.mutate(payload)}
            />
          ) : null}

          {activeView === "audit" ? (
            <AuditPanel logs={(auditLogsQuery.data ?? []) as AdminAuditLog[]} loading={auditLogsQuery.isLoading} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
