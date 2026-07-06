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

import { ApiError, createApiClient } from "../lib/api";
import type {
  AdminAuditLog,
  AdminAuthToken,
  AdminManagedUser,
  AdminManagedUserDetail,
  AdminRoom,
  RuntimeSettings,
  SmtpSettings
} from "../lib/types";
import { formatDateTime } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Label } from "./ui/input";

const ADMIN_TOKEN_KEY = "sdu-electricity-admin-token";
const ADMIN_THEME_KEY = "sdu-electricity-theme";

type AdminView = "status" | "users" | "rooms" | "tokens" | "smtp" | "settings" | "account" | "audit";

function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.detail === "string") {
      return error.detail;
    }
    return JSON.stringify(error.detail);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败";
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
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
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">用户</div>
              <div className="mt-2 text-2xl font-semibold">{status?.total_users ?? "--"}</div>
            </div>
            <ShieldCheck className="text-primary" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">宿舍</div>
              <div className="mt-2 text-2xl font-semibold">{status?.total_rooms ?? "--"}</div>
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
            </div>
            <KeyRound className="text-warning" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">SMTP</div>
              <div className="mt-2 text-2xl font-semibold">{status?.smtp_configured ? "可用" : "未配"}</div>
            </div>
            <Mail className={status?.smtp_configured ? "text-success" : "text-muted-foreground"} size={26} />
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
  const [threshold, setThreshold] = useState(binding.low_power_threshold ?? "");
  const [cooldown, setCooldown] = useState(binding.manual_check_cooldown_seconds?.toString() ?? "");
  const [notifyCooldown, setNotifyCooldown] = useState(binding.notify_cooldown_hours?.toString() ?? "");

  useEffect(() => {
    setEnabled(binding.enabled);
    setAlertDays(String(binding.alert_days));
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
          <Label htmlFor={`admin-alert-days-${binding.id}`}>提醒天数</Label>
          <Input
            id={`admin-alert-days-${binding.id}`}
            type="number"
            min={1}
            max={30}
            value={alertDays}
            onChange={(event) => setAlertDays(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`admin-threshold-${binding.id}`}>固定阈值</Label>
          <Input
            id={`admin-threshold-${binding.id}`}
            type="number"
            min={0}
            step="0.1"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            placeholder="继承估算"
          />
        </div>
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
              low_power_threshold: threshold.trim() ? threshold.trim() : null,
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

function AdminRoomsPanel({ rooms, loading }: { rooms: AdminRoom[]; loading: boolean }) {
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
  loading,
  onCreate,
  onUpdate,
  onToggle,
  onDelete,
  saving
}: {
  tokens: AdminAuthToken[];
  loading: boolean;
  onCreate: (payload: { name: string; token_value: string; min_interval_seconds: number; enabled: boolean }) => void;
  onUpdate: (
    tokenId: number,
    payload: { name?: string; token_value?: string; min_interval_seconds?: number; enabled?: boolean }
  ) => void;
  onToggle: (token: AdminAuthToken) => void;
  onDelete: (tokenId: number) => void;
  saving: boolean;
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
                          <td className="px-4 py-3 text-muted-foreground">{formatDateTime(token.last_used_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
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
    </div>
  );
}

function SmtpPanel({
  smtp,
  onSave,
  onTest,
  saving,
  testing
}: {
  smtp?: SmtpSettings;
  onSave: (payload: Partial<SmtpSettings> & { password?: string | null }) => void;
  onTest: (email: string) => void;
  saving: boolean;
  testing: boolean;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(465);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [useSsl, setUseSsl] = useState(true);
  const [useStarttls, setUseStarttls] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    if (!smtp) return;
    setHost(smtp.host ?? "");
    setPort(smtp.port);
    setUsername(smtp.username ?? "");
    setFromEmail(smtp.from_email ?? "");
    setUseSsl(smtp.use_ssl);
    setUseStarttls(smtp.use_starttls);
  }, [smtp]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>SMTP 发件邮箱</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="smtp-host">SMTP Host</Label>
            <Input id="smtp-host" value={host} onChange={(event) => setHost(event.target.value)} />
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
            <Input id="smtp-from" type="email" value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="smtp-password">密码 / 授权码</Label>
            <Input
              id="smtp-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={smtp?.password_configured ? "已保存，留空不修改" : ""}
            />
          </div>
          <div className="flex items-end gap-4 pb-2">
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input className="h-4 w-4 accent-primary" type="checkbox" checked={useSsl} onChange={(event) => setUseSsl(event.target.checked)} />
              SSL
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input
                className="h-4 w-4 accent-primary"
                type="checkbox"
                checked={useStarttls}
                onChange={(event) => setUseStarttls(event.target.checked)}
              />
              STARTTLS
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={saving}
            onClick={() =>
              onSave({
                host,
                port,
                username,
                password: password || undefined,
                from_email: fromEmail,
                use_ssl: useSsl,
                use_starttls: useStarttls
              })
            }
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存 SMTP
          </Button>
          <div className="flex min-w-[260px] gap-2">
            <Input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="测试收件邮箱" />
            <Button disabled={testing || !testEmail.trim()} onClick={() => onTest(testEmail.trim())} variant="secondary">
              {testing ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
              测试
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RuntimeSettingsPanel({
  runtime,
  onSave,
  saving
}: {
  runtime?: RuntimeSettings;
  onSave: (payload: Partial<RuntimeSettings>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<RuntimeSettings | null>(null);

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

  function setNumber(key: keyof RuntimeSettings, value: string) {
    setForm((current) => (current ? { ...current, [key]: Number(value) } : current));
  }

  return (
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
        </div>
        <Button disabled={saving} onClick={() => onSave(form)}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          保存全局设置
        </Button>
      </CardContent>
    </Card>
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
  const smtpQuery = useQuery({ queryKey: ["admin-smtp"], queryFn: api.getSmtpSettings, enabled: Boolean(token) });
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
      void queryClient.invalidateQueries({ queryKey: ["admin-tokens"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
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
      void queryClient.invalidateQueries({ queryKey: ["admin-tokens"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const deleteTokenMutation = useMutation({
    mutationFn: api.deleteAdminToken,
    onSuccess: () => {
      setNotice("Token 已删除。");
      void queryClient.invalidateQueries({ queryKey: ["admin-tokens"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const smtpMutation = useMutation({
    mutationFn: api.updateSmtpSettings,
    onSuccess: () => {
      setNotice("SMTP 设置已保存。");
      void queryClient.invalidateQueries({ queryKey: ["admin-smtp"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const smtpTestMutation = useMutation({
    mutationFn: api.testSmtpSettings,
    onSuccess: () => setNotice("测试邮件已发送。"),
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
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-panel lg:flex lg:flex-col">
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
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
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

        <nav className="grid grid-cols-4 gap-2 border-b border-border bg-panel px-3 py-2 sm:grid-cols-8 lg:hidden">
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
          {notice ? (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-panel px-4 py-3 text-sm shadow-soft">
              <span className="text-muted-foreground">{notice}</span>
              <button className="text-xs text-primary" onClick={() => setNotice(null)} type="button">
                关闭
              </button>
            </div>
          ) : null}

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
            <AdminRoomsPanel rooms={adminRoomsQuery.data ?? []} loading={adminRoomsQuery.isLoading} />
          ) : null}

          {activeView === "tokens" ? (
            <TokenPanel
              tokens={tokensQuery.data ?? []}
              loading={tokensQuery.isLoading}
              saving={createTokenMutation.isPending}
              onCreate={(payload) => createTokenMutation.mutate(payload)}
              onUpdate={(id, payload) => updateTokenMutation.mutate({ id, payload })}
              onToggle={(item) => updateTokenMutation.mutate({ id: item.id, payload: { enabled: !item.enabled } })}
              onDelete={(id) => deleteTokenMutation.mutate(id)}
            />
          ) : null}

          {activeView === "smtp" ? (
            <SmtpPanel
              smtp={smtpQuery.data}
              saving={smtpMutation.isPending}
              testing={smtpTestMutation.isPending}
              onSave={(payload) => smtpMutation.mutate(payload)}
              onTest={(email) => smtpTestMutation.mutate({ to_email: email })}
            />
          ) : null}

          {activeView === "settings" ? (
            <RuntimeSettingsPanel
              runtime={runtimeQuery.data}
              saving={runtimeMutation.isPending}
              onSave={(payload) => runtimeMutation.mutate(payload)}
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
