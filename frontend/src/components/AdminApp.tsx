import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Database,
  KeyRound,
  LogOut,
  Mail,
  Moon,
  ScrollText,
  Server,
  ShieldCheck,
  Sun,
  Users
} from "lucide-react";

import { ApiError, createApiClient } from "../lib/api";
import type { AdminAuditLog, AdminPageQuery } from "../lib/types";
import { Button } from "./ui/button";
import { NoticeDialog } from "./NoticeDialog";
import { AccountPanel } from "./admin/AccountPanel";
import { AdminLogin } from "./admin/AdminLogin";
import { AuditPanel } from "./admin/AuditPanel";
import { AdminRoomsPanel } from "./admin/RoomsPanel";
import { RuntimeSettingsPanel } from "./admin/SettingsPanel";
import { SmtpPanel } from "./admin/SmtpPanel";
import { StatusPanel } from "./admin/StatusPanel";
import { TokenPanel } from "./admin/TokenPanel";
import { UsersPanel } from "./admin/UsersPanel";
import { MobileAdminNav } from "./admin/MobileAdminNav";
import type { AdminNavItem } from "./admin/MobileAdminNav";
import { ADMIN_THEME_KEY, ADMIN_TOKEN_KEY, DEFAULT_LOG_FILTERS, describeError } from "./admin/utils";
import type { AdminView, LogFilters } from "./admin/utils";







export function AdminApp() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_KEY));
  const [activeView, setActiveView] = useState<AdminView>("status");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem(ADMIN_THEME_KEY) === "dark");
  const [tokenLogFilters, setTokenLogFilters] = useState<LogFilters>(DEFAULT_LOG_FILTERS);
  const [smtpLogFilters, setSmtpLogFilters] = useState<LogFilters>(DEFAULT_LOG_FILTERS);
  const [auditLogFilters, setAuditLogFilters] = useState<LogFilters>(DEFAULT_LOG_FILTERS);
  const [userListQuery, setUserListQuery] = useState<AdminPageQuery>({
    page: 1,
    page_size: 30,
    q: "",
    sort: "created_desc"
  });
  const [roomListQuery, setRoomListQuery] = useState<AdminPageQuery>({
    page: 1,
    page_size: 20,
    q: "",
    sort: "newest_desc"
  });
  const api = useMemo(() => createApiClient(token), [token]);

  const meQuery = useQuery({ queryKey: ["admin-me"], queryFn: api.getAdminMe, enabled: Boolean(token) });
  const usersQuery = useQuery({
    queryKey: ["admin-users", userListQuery],
    queryFn: () => api.listAdminUsersPage(userListQuery),
    placeholderData: (previous) => previous,
    enabled: Boolean(token && activeView === "users")
  });
  const userDetailQuery = useQuery({
    queryKey: ["admin-user", selectedUserId],
    queryFn: () => api.getAdminUser(selectedUserId as number),
    enabled: Boolean(token && activeView === "users" && selectedUserId)
  });
  const adminRoomsQuery = useQuery({
    queryKey: ["admin-rooms", roomListQuery],
    queryFn: () => api.listAdminRoomsPage(roomListQuery),
    placeholderData: (previous) => previous,
    enabled: Boolean(token && activeView === "rooms")
  });
  const tokensQuery = useQuery({
    queryKey: ["admin-tokens"],
    queryFn: api.listAdminTokens,
    enabled: Boolean(token && activeView === "tokens")
  });
  const tokenLogsQuery = useQuery({
    queryKey: ["admin-token-health-logs", tokenLogFilters],
    queryFn: () => api.listAdminTokenHealthLogs(tokenLogFilters),
    enabled: Boolean(token && activeView === "tokens")
  });
  const smtpQuery = useQuery({
    queryKey: ["admin-smtp"],
    queryFn: api.listSmtpSettings,
    enabled: Boolean(token && activeView === "smtp")
  });
  const smtpLogsQuery = useQuery({
    queryKey: ["admin-smtp-health-logs", smtpLogFilters],
    queryFn: () => api.listSmtpHealthLogs(smtpLogFilters),
    enabled: Boolean(token && activeView === "smtp")
  });
  const appearanceQuery = useQuery({
    queryKey: ["admin-appearance"],
    queryFn: api.getAppearanceSettings,
    enabled: Boolean(token && activeView === "settings")
  });
  const runtimeQuery = useQuery({
    queryKey: ["admin-runtime"],
    queryFn: api.getRuntimeSettings,
    enabled: Boolean(token && activeView === "settings")
  });
  const auditLogsQuery = useQuery({
    queryKey: ["admin-audit-logs", auditLogFilters],
    queryFn: () => api.listAdminAuditLogs(auditLogFilters),
    enabled: Boolean(token && activeView === "audit")
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage.setItem(ADMIN_THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      handleLogout();
    }
  }, [meQuery.error]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeView]);

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
    onSuccess: (result) => {
      handleLogin(result.access_token);
      queryClient.setQueryData(["admin-me"], result.admin);
      setNotice("管理员密码已更新，其他旧登录会话已经失效。");
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

  const nav: AdminNavItem[] = [
    { key: "status", label: "状态", icon: <Server size={17} /> },
    { key: "users", label: "用户", icon: <Users size={17} /> },
    { key: "rooms", label: "宿舍", icon: <Building2 size={17} /> },
    { key: "tokens", label: "Token", icon: <KeyRound size={17} /> },
    { key: "smtp", label: "SMTP", icon: <Mail size={17} /> },
    { key: "settings", label: "设置", icon: <Database size={17} /> },
    { key: "account", label: "账号", icon: <ShieldCheck size={17} /> },
    { key: "audit", label: "审计", icon: <ScrollText size={17} /> }
  ];
  const activeNavIndex = Math.max(0, nav.findIndex((item) => item.key === activeView));

  return (
    <div className="app-background admin-app-shell min-h-screen text-foreground">
      <aside className="app-sidebar liquid-surface glass-panel fixed inset-y-0 left-0 hidden w-64 border-r border-border/70 lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck size={19} />
          </div>
          <div>
            <div className="text-sm font-semibold">Admin Console</div>
            <div className="text-xs text-muted-foreground">{meQuery.data?.username ?? "管理后台"}</div>
          </div>
        </div>
        <nav
          className="admin-sidebar-nav relative flex flex-1 flex-col gap-1 px-3 py-4"
          style={{ "--admin-nav-index": activeNavIndex } as CSSProperties}
        >
          <span aria-hidden="true" className="admin-nav-indicator" />
          {nav.map((item) => (
            <button
              key={item.key}
              aria-current={activeView === item.key ? "page" : undefined}
              className={`app-nav-item relative z-[1] flex h-9 w-full shrink-0 items-center gap-3 rounded-md px-3 text-sm ${
                activeView === item.key
                  ? "app-nav-item-active text-primary"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
        <header className="app-topbar liquid-surface glass-panel sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border/70 px-4 lg:px-6">
          <div>
            <div className="text-sm font-semibold">管理后台</div>
            <div className="text-xs text-muted-foreground">{meQuery.data?.display_name || meQuery.data?.username || "正在读取管理员"}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              aria-label={darkMode ? "切换为浅色" : "切换为暗色"}
              className="px-2 sm:px-3"
              size="sm"
              title={darkMode ? "切换为浅色" : "切换为暗色"}
              variant="secondary"
              onClick={() => setDarkMode((value) => !value)}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              <span className="hidden sm:inline">{darkMode ? "浅色" : "暗色"}</span>
            </Button>
            <Button
              aria-label="退出管理后台"
              className="px-2 sm:px-3"
              size="sm"
              title="退出管理后台"
              variant="secondary"
              onClick={handleLogout}
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">退出</span>
            </Button>
          </div>
        </header>

        <MobileAdminNav activeView={activeView} items={nav} onChange={setActiveView} />

        <main className="app-main-content mx-auto w-full max-w-7xl px-4 pb-24 pt-5 lg:px-6 lg:pb-5">
          <NoticeDialog message={notice} onClose={() => setNotice(null)} />
          <div key={activeView} className="page-transition">
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
              pageData={usersQuery.data}
              query={userListQuery}
              onQueryChange={setUserListQuery}
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
              pageData={adminRoomsQuery.data}
              query={roomListQuery}
              onQueryChange={setRoomListQuery}
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
              logsLoading={tokenLogsQuery.isLoading}
              logFilters={tokenLogFilters}
              onLogFiltersChange={setTokenLogFilters}
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
              logsLoading={smtpLogsQuery.isLoading}
              logFilters={smtpLogFilters}
              onLogFiltersChange={setSmtpLogFilters}
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
            <AuditPanel
              logs={(auditLogsQuery.data ?? []) as AdminAuditLog[]}
              loading={auditLogsQuery.isLoading}
              filters={auditLogFilters}
              onFiltersChange={setAuditLogFilters}
            />
          ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
