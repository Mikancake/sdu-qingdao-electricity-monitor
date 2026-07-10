import { AdminManagedUser, AdminManagedUserDetail } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label } from "../ui/input";
import { ListToolbar } from "./toolbars";
import { compareDate, compareNumber, compareText, matchesSearch } from "./utils";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function AdminUserRoomEditor({
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

export function UsersPanel({
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
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState("created_desc");

  useEffect(() => {
    if (!detail) {
      return;
    }
    setNotificationEmail(detail.notification_email ?? "");
    setNotificationVerified(detail.notification_email_verified);
    setUserCooldown(detail.manual_check_cooldown_seconds?.toString() ?? "");
    setUserNotifyCooldown(detail.notify_cooldown_hours?.toString() ?? "");
  }, [detail]);

  const visibleUsers = useMemo(() => {
    return [...users]
      .filter((user) =>
        matchesSearch(userSearch, [
          user.id,
          user.email,
          user.notification_email,
          user.is_verified ? "已验证" : "未验证",
          user.notification_email_verified ? "提醒邮箱已验证" : "提醒邮箱待验证",
          user.room_count
        ])
      )
      .sort((a, b) => {
        if (userSort === "email_asc") return compareText(a.email, b.email, "asc");
        if (userSort === "email_desc") return compareText(a.email, b.email, "desc");
        if (userSort === "rooms_desc") return compareNumber(a.room_count, b.room_count, "desc");
        if (userSort === "rooms_asc") return compareNumber(a.room_count, b.room_count, "asc");
        if (userSort === "created_asc") return compareDate(a.created_at, b.created_at, "asc");
        return compareDate(a.created_at, b.created_at, "desc");
      });
  }, [users, userSearch, userSort]);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">查看注册用户、邮箱验证状态和绑定宿舍数量。</p>
        </CardHeader>
        <CardContent>
          <ListToolbar
            search={userSearch}
            onSearchChange={setUserSearch}
            sort={userSort}
            onSortChange={setUserSort}
            placeholder="搜索邮箱、用户 ID 或状态"
            sortOptions={[
              { value: "created_desc", label: "注册时间从新到旧" },
              { value: "created_asc", label: "注册时间从旧到新" },
              { value: "email_asc", label: "邮箱 A-Z" },
              { value: "email_desc", label: "邮箱 Z-A" },
              { value: "rooms_desc", label: "宿舍数从多到少" },
              { value: "rooms_asc", label: "宿舍数从少到多" }
            ]}
          />
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
                  {visibleUsers.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                        没有匹配的用户
                      </td>
                    </tr>
                  ) : (
                    visibleUsers.map((user) => (
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
                    ))
                  )}
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
