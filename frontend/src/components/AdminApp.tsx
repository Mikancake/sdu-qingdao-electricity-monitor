import { useCallback, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Database,
  KeyRound,
  LogOut,
  Mail,
  Megaphone,
  Moon,
  Radio,
  ScrollText,
  Server,
  ShieldCheck,
  Sun,
  Users
} from "lucide-react";

import { ApiError, createApiClient } from "../lib/api";
import type { ApiClient } from "../lib/api";
import type { AdminAuditLog, AdminPageQuery } from "../lib/types";
import { Button } from "./ui/button";
import { ActionNotice } from "./ActionNotice";
import { saveAppearanceSettings } from "../lib/appearance";
import { AccountPanel } from "./admin/AccountPanel";
import { AdminLogin } from "./admin/AdminLogin";
import { AuditPanel } from "./admin/AuditPanel";
import { AdminRoomsPanel } from "./admin/RoomsPanel";
import { RuntimeSettingsPanel } from "./admin/SettingsPanel";
import { SmtpPanel } from "./admin/SmtpPanel";
import { StatusPanel } from "./admin/StatusPanel";
import { TokenPanel } from "./admin/TokenPanel";
import { UsersPanel } from "./admin/UsersPanel";
import { AnnouncementsPanel } from "./admin/AnnouncementsPanel";
import { HwglProbePanel } from "./admin/HwglProbePanel";
import { MobileAdminNav } from "./admin/MobileAdminNav";
import type { AdminNavItem } from "./admin/MobileAdminNav";
import { ADMIN_THEME_KEY, ADMIN_TOKEN_KEY, DEFAULT_LOG_FILTERS, describeError } from "./admin/utils";
import type { AdminView, LogFilters } from "./admin/utils";


const nav: AdminNavItem[] = [
  { key: "status", label: "状态", icon: <Server size={17} /> },
  { key: "users", label: "用户", icon: <Users size={17} /> },
  { key: "rooms", label: "宿舍", icon: <Building2 size={17} /> },
  { key: "tokens", label: "Token", icon: <KeyRound size={17} /> },
  { key: "smtp", label: "SMTP", icon: <Mail size={17} /> },
  { key: "realtime", label: "实时性", icon: <Radio size={17} /> },
  { key: "announcements", label: "公告", icon: <Megaphone size={17} /> },
  { key: "settings", label: "设置", icon: <Database size={17} /> },
  { key: "account", label: "账号", icon: <ShieldCheck size={17} /> },
  { key: "audit", label: "审计", icon: <ScrollText size={17} /> }
];

function viewFromLocation(): AdminView {
  return nav.find((item) => item.key === window.location.hash.slice(1))?.key ?? "status";
}

function queryProblem(label: string, query: { isError: boolean; error: unknown; isFetching: boolean; refetch: () => Promise<unknown> }) {
  return query.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/30 p-3 text-sm">
    <span className="break-words">{label}读取失败：{describeError(query.error)}</span>
    <Button disabled={query.isFetching} size="sm" variant="secondary" onClick={() => void query.refetch()}>重试</Button>
  </div> : null;
}

export function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(ADMIN_THEME_KEY) === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem(ADMIN_THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const syncSession = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== ADMIN_TOKEN_KEY && event.key !== null)) return;
      setSessionMessage(null);
      setToken(localStorage.getItem(ADMIN_TOKEN_KEY));
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);

  const endSession = useCallback((message: string | null) => {
    if (localStorage.getItem(ADMIN_TOKEN_KEY) !== token) return;
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setSessionMessage(message);
    setToken(null);
  }, [token]);

  // A retired session's requests must never populate the next administrator's cache.
  const { api, client } = useMemo(() => ({
    api: createApiClient(token, () => endSession("管理会话已失效，请重新登录。")),
    client: new QueryClient({ defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500) },
      mutations: { gcTime: 0 }
    } })
  }), [token, endSession]);
  useEffect(() => () => {
    if (localStorage.getItem(ADMIN_TOKEN_KEY) !== token) client.clear();
  }, [client, token]);

  function acceptToken(nextToken: string, message: string | null) {
    if (localStorage.getItem(ADMIN_TOKEN_KEY) !== token) return;
    localStorage.setItem(ADMIN_TOKEN_KEY, nextToken);
    setSessionMessage(message);
    setToken(nextToken);
  }

  if (!token) return <AdminLogin message={sessionMessage} onLogin={(next) => acceptToken(next, null)} />;
  return <QueryClientProvider client={client}>
    <AdminWorkspace key={token} token={token} api={api} initialNotice={sessionMessage} darkMode={darkMode}
      toggleTheme={() => setDarkMode((value) => !value)} handleLogout={() => endSession(null)}
      rotateToken={(next) => acceptToken(next, "管理员密码已更新，其他旧登录会话已经失效。")} />
  </QueryClientProvider>;
}

function AdminWorkspace({ token, api, initialNotice, darkMode, toggleTheme, handleLogout, rotateToken }: {
  token: string; api: ApiClient; initialNotice: string | null; darkMode: boolean; toggleTheme: () => void;
  handleLogout: () => void; rotateToken: (next: string) => void;
}) {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<AdminView>(viewFromLocation);
  useEffect(() => {
    const sync = () => setActiveView(viewFromLocation());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function navigate(view: AdminView) {
    if (view !== activeView) window.location.hash = view;
  }
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedProbeId, setSelectedProbeId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice);
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

  const meQuery = useQuery({ queryKey: ["admin-me"], queryFn: api.getAdminMe, enabled: Boolean(token) });
  const usersQuery = useQuery({
    queryKey: ["admin-users", userListQuery],
    queryFn: () => api.listAdminUsersPage(userListQuery),
    enabled: meQuery.isSuccess && activeView === "users"
  });
  const userDetailQuery = useQuery({
    queryKey: ["admin-user", selectedUserId],
    queryFn: () => api.getAdminUser(selectedUserId as number),
    enabled: meQuery.isSuccess && activeView === "users" && selectedUserId !== null
  });
  const adminRoomsQuery = useQuery({
    queryKey: ["admin-rooms", roomListQuery],
    queryFn: () => api.listAdminRoomsPage(roomListQuery),
    enabled: meQuery.isSuccess && activeView === "rooms"
  });
  const tokensQuery = useQuery({
    queryKey: ["admin-tokens"],
    queryFn: api.listAdminTokens,
    enabled: meQuery.isSuccess && activeView === "tokens"
  });
  const tokenLogsQuery = useQuery({
    queryKey: ["admin-token-health-logs", tokenLogFilters],
    queryFn: () => api.listAdminTokenHealthLogs(tokenLogFilters),
    enabled: meQuery.isSuccess && activeView === "tokens"
  });
  const smtpQuery = useQuery({
    queryKey: ["admin-smtp"],
    queryFn: api.listSmtpSettings,
    enabled: meQuery.isSuccess && activeView === "smtp"
  });
  const smtpLogsQuery = useQuery({
    queryKey: ["admin-smtp-health-logs", smtpLogFilters],
    queryFn: () => api.listSmtpHealthLogs(smtpLogFilters),
    enabled: meQuery.isSuccess && activeView === "smtp"
  });
  const appearanceQuery = useQuery({
    queryKey: ["admin-appearance"],
    queryFn: api.getAppearanceSettings,
    enabled: meQuery.isSuccess && activeView === "settings"
  });
  const runtimeQuery = useQuery({
    queryKey: ["admin-runtime"],
    queryFn: api.getRuntimeSettings,
    enabled: meQuery.isSuccess && (activeView === "settings" || activeView === "realtime")
  });
  const auditLogsQuery = useQuery({
    queryKey: ["admin-audit-logs", auditLogFilters],
    queryFn: () => api.listAdminAuditLogs(auditLogFilters),
    enabled: meQuery.isSuccess && activeView === "audit"
  });
  const announcementsQuery = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: api.listAdminAnnouncements,
    enabled: meQuery.isSuccess && activeView === "announcements"
  });
  const hwglRoomsQuery = useQuery({
    queryKey: ["admin-hwgl-rooms"],
    queryFn: () => api.listAdminHwglRooms(),
    staleTime: 5 * 60_000,
    enabled: meQuery.isSuccess && activeView === "realtime"
  });
  const hwglProbesQuery = useQuery({
    queryKey: ["admin-hwgl-probes"],
    queryFn: () => api.listAdminHwglProbes({ limit: 30 }),
    refetchInterval: activeView === "realtime" ? 5_000 : false,
    enabled: meQuery.isSuccess && activeView === "realtime"
  });
  const hwglProbeDetailQuery = useQuery({
    queryKey: ["admin-hwgl-probe", selectedProbeId],
    queryFn: () => api.getAdminHwglProbe(selectedProbeId as number),
    refetchInterval: (query) => activeView === "realtime" && query.state.data?.status === "running" ? 5_000 : false,
    enabled: meQuery.isSuccess && activeView === "realtime" && selectedProbeId !== null
  });

  useEffect(() => {
    if (usersQuery.data && userListQuery.page > Math.max(1, usersQuery.data.total_pages)) {
      setUserListQuery({ ...userListQuery, page: Math.max(1, usersQuery.data.total_pages) });
    }
  }, [userListQuery, usersQuery.data]);
  useEffect(() => {
    if (adminRoomsQuery.data && roomListQuery.page > Math.max(1, adminRoomsQuery.data.total_pages)) {
      setRoomListQuery({ ...roomListQuery, page: Math.max(1, adminRoomsQuery.data.total_pages) });
    }
  }, [roomListQuery, adminRoomsQuery.data]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeView]);


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
      rotateToken(result.access_token);
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
    onSuccess: (_, id) => {
      setNotice("用户已删除。");
      setSelectedUserId((current) => current === id ? null : current);
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
    onSuccess: (result) => {
      if (localStorage.getItem(ADMIN_TOKEN_KEY) === token) saveAppearanceSettings(result);
      setNotice("全局外观已保存。");
      queryClient.setQueryData(["admin-appearance"], result);
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
    onSuccess: (result) => {
      setNotice("全局设置已保存。");
      queryClient.setQueryData(["admin-runtime"], result);
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });
  const createAnnouncementMutation = useMutation({
    mutationFn: api.createAnnouncement,
    onSuccess: (announcement) => {
      setNotice(announcement.is_published ? "公告已发布。" : "公告已保存为草稿。");
      void queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof api.updateAnnouncement>[1] }) =>
      api.updateAnnouncement(id, payload),
    onSuccess: (announcement) => {
      setNotice(announcement.is_published ? "公告已更新并发布。" : "公告已保存为草稿。");
      void queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      refreshAdminAudit();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: api.deleteAnnouncement,
    onSuccess: () => {
      setNotice("公告已删除。");
      void queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
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
    onSuccess: (result) => {
      setNotice(`通知扫描完成：发送 ${result.sent}，跳过 ${result.skipped}。`);
      void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const createHwglProbeMutation = useMutation({
    mutationFn: api.createAdminHwglProbe,
    onSuccess: (probe) => {
      setSelectedProbeId(probe.id);
      setNotice("实时性探测已开始，worker 会按设定间隔采样。");
      void queryClient.invalidateQueries({ queryKey: ["admin-hwgl-rooms"] });
      refreshAdminAudit();
      return queryClient.invalidateQueries({ queryKey: ["admin-hwgl-probes"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const stopHwglProbeMutation = useMutation({
    mutationFn: api.stopAdminHwglProbe,
    onSuccess: () => {
      setNotice("实时性探测已停止。");
      void queryClient.invalidateQueries({ queryKey: ["admin-hwgl-probe"] });
      refreshAdminAudit();
      return queryClient.invalidateQueries({ queryKey: ["admin-hwgl-probes"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  if (!meQuery.isSuccess) {
    return <main className="app-background flex min-h-screen items-center justify-center p-4">
      <section className="space-y-4 rounded-xl border border-border bg-panel p-6 text-sm">
        {meQuery.isError ? <p role="alert">无法验证管理会话：{describeError(meQuery.error)}</p> : <p role="status">正在验证管理会话…</p>}
        <div className="flex flex-wrap gap-2">
          {meQuery.isError && <Button disabled={meQuery.isFetching} onClick={() => void meQuery.refetch()}>重试</Button>}
          <Button variant="secondary" onClick={handleLogout}>返回登录</Button>
        </div>
      </section>
    </main>;
  }

  const activeNav = nav.find((item) => item.key === activeView);
  const viewDescriptions: Record<AdminView, string> = {
    status: "掌握校园用电服务的运行全貌，让每一次查询与提醒可靠抵达。",
    users: "查看用户资料、通知偏好与宿舍绑定，维护每一位用户的服务。",
    rooms: "从宿舍出发，查看电量监测记录与关联用户。",
    tokens: "管理电量查询凭据，跟踪可用状态与调用记录。",
    smtp: "维护发信通道，查看邮件服务健康状态与投递记录。",
    realtime: "采样与分析后勤数据更新节奏，了解读数的实时性。",
    announcements: "编辑、发布与管理面向校园用户的服务公告。",
    settings: "配置运行策略、数据保留与站点外观。",
    account: "管理个人资料与登录凭据，保护管理权限。",
    audit: "回溯管理操作，保持平台变更透明可查。"
  };

  return (
    <div className="app-background min-h-screen text-foreground">
      <aside className="workspace-sidebar fixed inset-y-0 left-0 z-30 hidden w-52 flex-col border-r border-border lg:flex">
        <a href="/" className="flex min-h-24 items-center gap-3 border-b border-border px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-primary text-xl font-semibold text-primary">E</span>
          <span><span className="block text-sm font-semibold">校园电量</span><span className="mt-1 block text-[10px] tracking-[0.14em] text-muted-foreground">OPERATIONS / SDU</span></span>
        </a>
        <nav aria-label="管理模块" className="flex-1 overflow-y-auto px-3 py-4">
          {nav.map((item, index) => (
            <div key={item.key}>
              {index === 0 || index === 3 || index === 7 ? <div className="px-3 pb-2 pt-4 text-[10px] font-medium tracking-[0.16em] text-muted-foreground">{index === 0 ? "01 / 校园" : index === 3 ? "02 / 服务" : "03 / 管理"}</div> : null}
              <button
                type="button"
                aria-current={activeView === item.key ? "page" : undefined}
                className={`mb-1 flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activeView === item.key ? "border-primary bg-primary/10 font-semibold text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => navigate(item.key)}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label === "状态" ? "运行概览" : item.label === "用户" ? "用户管理" : item.label === "宿舍" ? "宿舍管理" : item.label}</span>
                {activeView === item.key ? <span className="ml-auto text-xs" aria-hidden="true">—</span> : null}
              </button>
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-3 flex items-center gap-3 px-2">
            <ShieldCheck size={19} className="shrink-0 text-primary" />
            <div className="min-w-0"><div className="truncate text-sm">{meQuery.data?.display_name || meQuery.data?.username || "管理员"}</div><div className="mt-0.5 text-[10px] text-muted-foreground">安全访问 · 操作留痕</div></div>
          </div>
          <button type="button" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={handleLogout}><LogOut size={15} />退出管理后台</button>
        </div>
      </aside>
      <div className="relative min-w-0 lg:pl-52">
        <header className="workspace-topbar sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="hidden sm:inline">Electricity Monitor</span><span className="hidden text-border sm:inline">/</span><span className="text-foreground">{activeNav?.label}</span></div>
            <div className="mt-1 text-[10px] tracking-[0.16em] text-muted-foreground lg:hidden">QINGDAO · ADMIN</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="mr-3 hidden text-xs text-muted-foreground xl:inline">山东大学 · 青岛校区</span>
            <Button aria-label={darkMode ? "切换为浅色" : "切换为暗色"} size="icon" variant="ghost" onClick={toggleTheme}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</Button>
            <Button aria-label="退出管理后台" size="icon" variant="ghost" className="lg:hidden" onClick={handleLogout}><LogOut size={17} /></Button>
            <div className="hidden border-l border-border pl-4 text-sm text-muted-foreground lg:block">{meQuery.data?.display_name || meQuery.data?.username || "正在读取管理员"}</div>
          </div>
        </header>

        <MobileAdminNav activeView={activeView} items={nav} onChange={navigate} />

        <main className="workspace-main mx-auto w-full max-w-[1560px] pb-28 lg:pb-10">
          <ActionNotice message={notice} onClose={() => setNotice(null)} />
          <div className="mb-7 grid gap-4 rounded-xl border border-border/70 bg-panel px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div><div className="eyebrow">管理工作区 / {String(nav.findIndex((item) => item.key === activeView) + 1).padStart(2, "0")}</div><h1 className="page-heading mt-2">{activeView === "status" ? "运行概览" : activeNav?.label}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{viewDescriptions[activeView]}</p></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={14} className="text-primary" />管理员专属</div>
          </div>
          <div key={activeView} className="min-w-0">
          {activeView === "status" ? (
            <StatusPanel
              api={api}
              onRunChecks={() => runChecksMutation.mutate()}
              onRunNotifications={() => runNotificationsMutation.mutate()}
              runningChecks={runChecksMutation.isPending}
              runningNotifications={runNotificationsMutation.isPending}
            />
          ) : null}

          {activeView === "users" ? (
            <UsersPanel
              listProblem={queryProblem("用户列表", usersQuery)}
              detailProblem={queryProblem("用户详情", userDetailQuery)}
              busy={updateManagedUserMutation.isPending || updateManagedUserRoomMutation.isPending || deleteManagedUserMutation.isPending || deleteManagedUserRoomMutation.isPending}
              pageData={usersQuery.data}
              query={userListQuery}
              onQueryChange={(next) => { setUserListQuery(next); setSelectedUserId(null); }}
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
                if (window.confirm(`确定删除用户 ${userDetailQuery.data?.email ?? `#${userId}`} 吗？宿舍绑定和通知记录也将删除，无法撤销。`)) {
                  deleteManagedUserMutation.mutate(userId);
                }
              }}
              onDeleteRoom={(userId, bindingId) => {
                if (window.confirm(`确定删除用户 #${userId} 的宿舍绑定 #${bindingId} 吗？此操作无法撤销。`)) {
                  deleteManagedUserRoomMutation.mutate({ userId, bindingId });
                }
              }}
            />
          ) : null}

          {activeView === "rooms" ? (
            <AdminRoomsPanel
              api={api}
              pageData={adminRoomsQuery.data}
              query={roomListQuery}
              onQueryChange={setRoomListQuery}
              loading={adminRoomsQuery.isLoading}
              listProblem={queryProblem("宿舍列表", adminRoomsQuery)}
              deletingBindingId={deleteManagedUserRoomMutation.isPending ? deleteManagedUserRoomMutation.variables.bindingId : null}
              onDeleteBinding={(userId, bindingId) => {
                if (window.confirm(`确定删除用户 #${userId} 的宿舍绑定 #${bindingId} 吗？此操作无法撤销。`)) {
                  deleteManagedUserRoomMutation.mutate({ userId, bindingId });
                }
              }}
            />
          ) : null}

          {activeView === "tokens" ? (
            <TokenPanel
              listProblem={queryProblem("Token 池", tokensQuery)}
              logsProblem={queryProblem("Token 健康日志", tokenLogsQuery)}
              tokens={tokensQuery.data ?? []}
              logs={tokenLogsQuery.data ?? []}
              loading={tokensQuery.isLoading}
              logsLoading={tokenLogsQuery.isLoading}
              logFilters={tokenLogFilters}
              onLogFiltersChange={setTokenLogFilters}
              saving={createTokenMutation.isPending || updateTokenMutation.isPending || deleteTokenMutation.isPending || testTokenMutation.isPending}
              onCreate={(payload, onSuccess) => createTokenMutation.mutate(payload, { onSuccess })}
              onUpdate={(id, payload, onSuccess) => updateTokenMutation.mutate({ id, payload }, { onSuccess })}
              onTest={(id) => testTokenMutation.mutate(id)}
              onToggle={(item) => updateTokenMutation.mutate({ id: item.id, payload: { enabled: !item.enabled } })}
              onDelete={(id) => {
                if (window.confirm(`确定删除 Token「${tokensQuery.data?.find((item) => item.id === id)?.name ?? id}」吗？此操作无法撤销。`)) deleteTokenMutation.mutate(id);
              }}
              testingTokenId={testTokenMutation.isPending ? testTokenMutation.variables : null}
            />
          ) : null}

          {activeView === "smtp" ? (
            <SmtpPanel
              listProblem={queryProblem("SMTP 池", smtpQuery)}
              logsProblem={queryProblem("SMTP 健康日志", smtpLogsQuery)}
              loading={smtpQuery.isLoading}
              accounts={smtpQuery.data ?? []}
              logs={smtpLogsQuery.data ?? []}
              logsLoading={smtpLogsQuery.isLoading}
              logFilters={smtpLogFilters}
              onLogFiltersChange={setSmtpLogFilters}
              saving={createSmtpMutation.isPending || updateSmtpMutation.isPending || deleteSmtpMutation.isPending || smtpTestMutation.isPending}
              testingSmtpId={smtpTestMutation.isPending ? smtpTestMutation.variables.id : null}
              onCreate={(payload, onSuccess) => createSmtpMutation.mutate(payload, { onSuccess })}
              onUpdate={(id, payload, onSuccess) => updateSmtpMutation.mutate({ id, payload }, { onSuccess })}
              onDelete={(id) => {
                if (window.confirm(`确定删除 SMTP 发件账号「${smtpQuery.data?.find((item) => item.id === id)?.name ?? id}」吗？此操作无法撤销。`)) {
                  deleteSmtpMutation.mutate(id);
                }
              }}
              onTest={(id, email) => smtpTestMutation.mutate({ id, email })}
            />
          ) : null}

          {activeView === "announcements" ? (
            <AnnouncementsPanel
              listProblem={queryProblem("公告列表", announcementsQuery)}
              announcements={announcementsQuery.data ?? []}
              loading={announcementsQuery.isLoading}
              saving={createAnnouncementMutation.isPending || updateAnnouncementMutation.isPending || deleteAnnouncementMutation.isPending}
              onCreate={(payload, onSuccess) => createAnnouncementMutation.mutate(payload, { onSuccess })}
              onUpdate={(id, payload, onSuccess) => updateAnnouncementMutation.mutate({ id, payload }, { onSuccess })}
              onDelete={(id) => {
                if (window.confirm(`确定删除公告「${announcementsQuery.data?.find((item) => item.id === id)?.title ?? id}」吗？此操作无法撤销。`)) {
                  deleteAnnouncementMutation.mutate(id);
                }
              }}
            />
          ) : null}

          {activeView === "realtime" && <div className="space-y-4">
            {queryProblem("探测参数", runtimeQuery)}
            {queryProblem("探测宿舍", hwglRoomsQuery)}
            <HwglProbePanel
              detailProblem={queryProblem("探测详情", hwglProbeDetailQuery)}
              listProblem={queryProblem("探测任务", hwglProbesQuery)}
              rooms={hwglRoomsQuery.data ?? []}
              probes={hwglProbesQuery.data ?? []}
              selectedProbe={hwglProbeDetailQuery.data}
              selectedProbeId={selectedProbeId}
              roomsLoading={hwglRoomsQuery.isLoading}
              probesLoading={hwglProbesQuery.isLoading}
              detailLoading={hwglProbeDetailQuery.isLoading}
              creating={createHwglProbeMutation.isPending}
              unavailable={!runtimeQuery.isSuccess || !hwglProbesQuery.isSuccess}
              stopping={stopHwglProbeMutation.isPending}
              onSelectProbe={setSelectedProbeId}
              maxDurationSeconds={runtimeQuery.data?.hwgl_probe_max_duration_seconds}
              onCreate={(payload) => createHwglProbeMutation.mutate(payload)}
              onStop={(probeId) => {
                if (window.confirm(`确定停止探测 #${probeId} 吗？已保存的样本会保留。`)) {
                  stopHwglProbeMutation.mutate(probeId);
                }
              }}
            />
          </div>}

          {activeView === "settings" && <div className="space-y-4">
            {queryProblem("运行设置", runtimeQuery)}
            {queryProblem("外观设置", appearanceQuery)}
            {runtimeQuery.data && appearanceQuery.data ? (
            <RuntimeSettingsPanel
              runtime={runtimeQuery.data}
              appearance={appearanceQuery.data}
              saving={runtimeMutation.isPending}
              savingAppearance={appearanceMutation.isPending}
              onSave={(payload, onSuccess) => runtimeMutation.mutate(payload, { onSuccess })}
              onSaveAppearance={(payload, onSuccess) => appearanceMutation.mutate(payload, { onSuccess })}
              onUploadAppearanceBackground={(theme, file) => appearanceUploadMutation.mutateAsync({ theme, file })}
              onRunDataRetentionCleanup={() => dataRetentionCleanupMutation.mutate()}
              cleaningRetention={dataRetentionCleanupMutation.isPending}
              onClearRateLimits={(payload) => clearRateLimitsMutation.mutate(payload)}
              clearingRateLimits={clearRateLimitsMutation.isPending}
            />
            ) : !runtimeQuery.isError && !appearanceQuery.isError ? <div role="status" className="p-6 text-sm text-muted-foreground">正在读取全局设置…</div> : null}
          </div>}

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
              listProblem={queryProblem("审计日志", auditLogsQuery)}
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
