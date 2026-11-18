import type { AdminManagedUserDetail, AdminManagedUserPage, AdminPageQuery } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label } from "../ui/input";
import { PaginationControls } from "../ui/pagination";
import { ListSkeleton } from "../ui/skeleton";
import { ListToolbar } from "./toolbars";
import { Loader2, Save, Trash2 } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";

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
    <form className="rounded-lg border border-border p-3" onSubmit={(event) => {
      event.preventDefault();
      onSave(binding.id, {
        enabled, alert_days: thresholdMode === "days" ? Number(alertDays) : binding.alert_days,
        alert_threshold_mode: thresholdMode, low_power_threshold: thresholdMode === "fixed" ? threshold.trim() : null,
        manual_check_cooldown_seconds: cooldown.trim() ? Number(cooldown) : null,
        notify_cooldown_hours: notifyCooldown.trim() ? Number(notifyCooldown) : null
      });
    }}>
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
              required
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
              max={100000} step="0.01" required
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
            max={720}
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
            max={3600}
            value={cooldown}
            onChange={(event) => setCooldown(event.target.value)}
            placeholder="继承用户/全局"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="submit" size="sm" variant="secondary">
          <Save size={14} />
          保存
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(binding.id)}>
          <Trash2 size={14} />
          删除
        </Button>
      </div>
    </form>
  );
}

export function UsersPanel({
  pageData,
  query,
  onQueryChange,
  detail,
  listProblem, detailProblem, busy,
  loading,
  detailLoading,
  selectedUserId,
  onSelectUser,
  onUpdateUser,
  onUpdateRoom,
  onDeleteUser,
  onDeleteRoom
}: {
  pageData?: AdminManagedUserPage;
  query: AdminPageQuery;
  onQueryChange: (query: AdminPageQuery) => void;
  detail?: AdminManagedUserDetail;
  listProblem: ReactNode; detailProblem: ReactNode; busy: boolean;
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
  const [userSearch, setUserSearch] = useState(query.q);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  function selectUser(userId: number) {
    onSelectUser(userId);
    if (window.matchMedia("(max-width: 1535px)").matches) detailHeading.current?.focus();
  }

  useEffect(() => {
    if (!detail) {
      return;
    }
    setNotificationEmail(detail.notification_email ?? "");
    setNotificationVerified(detail.notification_email_verified);
    setUserCooldown(detail.manual_check_cooldown_seconds?.toString() ?? "");
    setUserNotifyCooldown(detail.notify_cooldown_hours?.toString() ?? "");
  }, [detail]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (userSearch === query.q) return;
      onQueryChange({ ...query, page: 1, q: userSearch });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [onQueryChange, query, userSearch]);

  const visibleUsers = pageData?.items ?? [];

  return (
    <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card className="border-border bg-panel shadow-none">
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">查看注册用户、邮箱验证状态和绑定宿舍数量。</p>
        </CardHeader>
        <CardContent>
          <ListToolbar
            search={userSearch}
            onSearchChange={setUserSearch}
            sort={query.sort}
            onSortChange={(sort) => onQueryChange({ ...query, page: 1, sort })}
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
          {listProblem || (loading ? (
            <ListSkeleton rows={5} />
          ) : (
            <>
            <div className="responsive-table-shell rounded-lg border border-border">
              <table className="responsive-table w-full border-collapse text-sm">
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
                      <td className="responsive-table-empty px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                        {query.q ? "没有匹配的用户" : "暂无注册用户"}
                      </td>
                    </tr>
                  ) : (
                    visibleUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`border-t border-border transition hover:bg-muted/60 ${selectedUserId === user.id ? "bg-muted" : ""}`}
                    >
                      <td data-label="用户" className="px-4 py-3">
                        <button type="button" className="break-all text-left font-medium text-primary hover:underline" aria-pressed={selectedUserId === user.id} aria-label={`查看 ${user.email} 的详情`} onClick={() => selectUser(user.id)}>{user.email}</button>
                        <Badge className="mt-1" tone={user.is_verified ? "success" : "warning"}>
                          {user.is_verified ? "已验证" : "未验证"}
                        </Badge>
                      </td>
                      <td data-label="提醒邮箱" className="px-4 py-3">
                        <div className="max-w-[240px] truncate text-muted-foreground">{user.notification_email || user.email}</div>
                        <Badge className="mt-1" tone={user.notification_email_verified || !user.notification_email ? "success" : "warning"}>
                          {user.notification_email_verified || !user.notification_email ? "可用" : "待验证"}
                        </Badge>
                      </td>
                      <td data-label="宿舍" className="px-4 py-3 text-muted-foreground">{user.room_count}</td>
                      <td data-label="注册时间" className="px-4 py-3 text-muted-foreground">{formatDateTime(user.created_at)}</td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={pageData?.page ?? query.page}
              pageSize={pageData?.page_size ?? query.page_size}
              total={pageData?.total ?? 0}
              totalPages={pageData?.total_pages ?? 1}
              onPageChange={(page) => onQueryChange({ ...query, page })}
              onPageSizeChange={(pageSize) => onQueryChange({ ...query, page: 1, page_size: pageSize })}
            />
            </>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border bg-panel shadow-none">
        <CardHeader>
          <h2 ref={detailHeading} tabIndex={-1} className="scroll-mt-24 text-base font-semibold">用户详情</h2>
        </CardHeader>
        <CardContent>
          {!selectedUserId ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">从用户列表选择账号查看详情</div>
          ) : detailProblem ? detailProblem : detailLoading ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={18} />
              正在读取详情
            </div>
          ) : detail ? (
            <fieldset disabled={busy} aria-busy={busy} aria-label="用户配置" className="min-w-0 space-y-4">
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
              <form className="rounded-lg border border-border p-3" onSubmit={(event) => {
                event.preventDefault();
                onUpdateUser(detail.id, {
                  notification_email: notificationEmail.trim() || null,
                  notification_email_verified: Boolean(notificationEmail.trim() && notificationVerified),
                  manual_check_cooldown_seconds: userCooldown.trim() ? Number(userCooldown) : null,
                  notify_cooldown_hours: userNotifyCooldown.trim() ? Number(userNotifyCooldown) : null
                });
              }}>
                <div className="grid gap-3">
                  <div>
                    <Label htmlFor="admin-user-notification-email">提醒邮箱</Label>
                    <Input
                      id="admin-user-notification-email"
                      type="email"
                      value={notificationEmail}
                      onChange={(event) => { setNotificationEmail(event.target.value); setNotificationVerified(false); }}
                      placeholder="留空则使用账号邮箱"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-user-notify-cooldown">用户邮件间隔覆盖（小时）</Label>
                    <Input
                      id="admin-user-notify-cooldown"
                      type="number"
                      min={0}
                      max={720}
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
                      max={3600}
                      value={userCooldown}
                      onChange={(event) => setUserCooldown(event.target.value)}
                      placeholder="留空则继承全局"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      className="h-4 w-4 accent-primary"
                      type="checkbox"
                      disabled={!notificationEmail.trim()}
                      checked={notificationVerified}
                      onChange={(event) => setNotificationVerified(event.target.checked)}
                    />
                    提醒邮箱已验证
                  </label>
                  <Button type="submit" size="sm">
                    <Save size={14} />
                    保存用户配置
                  </Button>
                </div>
              </form>
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
            </fieldset>
          ) : (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">用户不存在或读取失败</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
