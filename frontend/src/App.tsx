import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createApiClient, getApiErrorMessage as describeError } from "./lib/api";
import type { UserRoomBinding } from "./lib/types";
import { AuthPanel } from "./components/AuthPanel";
import { AppShell, type ViewKey } from "./components/AppShell";
import { DashboardView, isChartRangeValid, type ChartRangeState } from "./components/DashboardView";
import { ActionNotice } from "./components/ActionNotice";
import { RecordsView } from "./components/RecordsView";
import { RoomsView } from "./components/RoomsView";
import { SettingsView } from "./components/SettingsView";

const AdminApp = lazy(() => import("./components/AdminApp").then((module) => ({ default: module.AdminApp })));

const TOKEN_KEY = "sdu-electricity-token";
const THEME_KEY = "sdu-electricity-theme";
const ACTIVE_VIEW_KEY = "sdu-electricity-active-view";

function readStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}
function readStoredView(): ViewKey {
  const value = new URL(window.location.href).searchParams.get("view") ?? window.localStorage.getItem(ACTIVE_VIEW_KEY);
  return value === "rooms" || value === "records" || value === "settings" ? value : "dashboard";
}

function viewUrl(view: ViewKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  url.hash = "";
  return url;
}

function toApiDateTime(value: string) {
  if (!value) {
    return undefined;
  }
  return new Date(value).toISOString();
}

function buildChartParams(range: ChartRangeState) {
  if (range.key === "1d") {
    return { days: 1, limit: 5000 };
  }
  if (range.key === "7d") {
    return { days: 7, limit: 5000 };
  }
  if (range.key === "30d") {
    return { days: 30, limit: 5000 };
  }
  if (range.key === "custom") {
    return {
      start_at: toApiDateTime(range.startAt),
      end_at: toApiDateTime(range.endAt),
      limit: 5000
    };
  }
  return { limit: 5000 };
}

function UserApp() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(readStoredToken);
  const [generation, setGeneration] = useState(0);
  const [expired, setExpired] = useState(false);
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem(THEME_KEY) === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    function syncSession(event: StorageEvent) {
      if (event.storageArea !== window.localStorage || (event.key !== null && event.key !== TOKEN_KEY)) return;
      queryClient.clear();
      setGeneration(value => value + 1);
      setExpired(false);
      setToken(readStoredToken());
    }
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, [queryClient]);

  const endSession = useCallback((expiredSession: boolean) => {
    if (readStoredToken() !== token) return;
    window.localStorage.removeItem(TOKEN_KEY);
    queryClient.clear();
    setExpired(expiredSession);
    setToken(null);
  }, [queryClient, token]);

  if (!token) return <>
    {expired && <p role="status" className="border-b border-warning bg-panel px-4 py-3 text-center text-sm">登录已失效，请重新登录。</p>}
    <AuthPanel onLogin={nextToken => {
      window.localStorage.setItem(TOKEN_KEY, nextToken);
      window.localStorage.setItem(ACTIVE_VIEW_KEY, "dashboard");
      setExpired(false);
      setToken(nextToken);
    }} />
  </>;

  return <StudentWorkspace key={generation} token={token} endSession={endSession}
    rotateToken={next => {
      if (readStoredToken() !== token) return false;
      window.localStorage.setItem(TOKEN_KEY, next);
      setToken(next);
      return true;
    }} darkMode={darkMode} toggleTheme={() => setDarkMode(value => !value)} />;
}

interface WorkspaceProps {
  token: string;
  endSession: (expired: boolean) => void;
  rotateToken: (next: string) => boolean;
  darkMode: boolean;
  toggleTheme: () => void;
}

function StudentWorkspace({ token, endSession, rotateToken, darkMode, toggleTheme }: WorkspaceProps) {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<ViewKey>(() => readStoredView());
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [preferredBindingId, setSelectedChartBindingId] = useState<number | null>(null);
  const [chartRange, setChartRange] = useState<ChartRangeState>({ key: "7d", startAt: "", endAt: "" });
  const [notificationEmailCode, setNotificationEmailCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const api = useMemo(() => createApiClient(token, () => endSession(true)), [token, endSession]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_VIEW_KEY, activeView);
    const url = new URL(window.location.href);
    if (url.searchParams.get("view") !== activeView) {
      url.searchParams.set("view", activeView);
      window.history.replaceState(null, "", url);
    }
  }, [activeView]);

  useEffect(() => {
    const restore = () => setActiveView(readStoredView());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  function navigate(view: ViewKey) {
    if (view === activeView) return;
    window.history.pushState(null, "", viewUrl(view));
    setActiveView(view);
  }

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe
  });

  const runtimeLimitsQuery = useQuery({
    queryKey: ["runtime-limits"],
    queryFn: api.getRuntimeLimits,
    enabled: activeView === "settings"
  });

  const summariesQuery = useQuery({
    queryKey: ["room-summaries"],
    queryFn: api.listRoomSummaries,
    enabled: activeView === "dashboard" || activeView === "rooms"
  });
  const announcementsQuery = useQuery({
    queryKey: ["announcements"],
    queryFn: api.listAnnouncements,
    enabled: activeView === "dashboard",
    staleTime: 60_000
  });

  const bindingsQuery = useQuery({
    queryKey: ["room-bindings"],
    queryFn: api.listRoomBindings,
    enabled: activeView === "rooms" || activeView === "settings"
  });

  const buildingsQuery = useQuery({
    queryKey: ["buildings"],
    queryFn: api.listBuildings,
    enabled: activeView === "rooms",
    staleTime: 5 * 60_000
  });

  const attemptsQuery = useQuery({
    queryKey: ["check-attempts"],
    queryFn: api.listCheckAttempts,
    enabled: activeView === "records"
  });

  const summaries = summariesQuery.data ?? [];
  const selectedChartBindingId = summaries.find(item => item.binding_id === preferredBindingId)?.binding_id
    ?? summaries[0]?.binding_id ?? null;

  const chartReadingsQuery = useQuery({
    queryKey: ["chart-readings", selectedChartBindingId, chartRange],
    queryFn: () => api.listRoomReadings(selectedChartBindingId as number, buildChartParams(chartRange)),
    enabled: activeView === "dashboard" && selectedChartBindingId !== null && isChartRangeValid(chartRange)
  });

  const bindMutation = useMutation({
    mutationFn: api.bindRoom,
    onSuccess: () => {
      setNotice("宿舍已绑定，并已保存本次电量读数。");
      void queryClient.invalidateQueries({ queryKey: ["room-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["room-summaries"] });
      void queryClient.invalidateQueries({ queryKey: ["check-attempts"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const checkMutation = useMutation({
    mutationFn: api.checkRoom,
    onMutate: (bindingId) => setCheckingId(bindingId),
    onSuccess: async () => {
      setNotice("电量已刷新。");
      await Promise.all(["room-summaries", "check-attempts", "chart-readings"].map(key =>
        queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: async (error) => {
      setNotice(describeError(error));
      await Promise.all(["room-summaries", "check-attempts"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onSettled: () => setCheckingId(null)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof api.updateBinding>[1] }) =>
      api.updateBinding(id, payload),
    onMutate: ({ id }) => setUpdatingId(id),
    onSuccess: () => {
      setNotice("宿舍设置已保存。");
      void queryClient.invalidateQueries({ queryKey: ["room-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["room-summaries"] });
      void queryClient.invalidateQueries({ queryKey: ["chart-readings"] });
      void queryClient.invalidateQueries({ queryKey: ["check-attempts"] });
    },
    onError: (error) => setNotice(describeError(error)),
    onSettled: () => setUpdatingId(null)
  });

  const requestNotificationEmailMutation = useMutation({
    mutationFn: api.requestNotificationEmailCode,
    onSuccess: (result) => {
      setNotificationEmailCode(result.dev_verification_code ?? null);
      setNotice(result.email_sent ? "提醒邮箱验证码已发送。" : "开发模式已返回验证码。");
    },
    onError: (error) => setNotice(describeError(error))
  });

  const verifyNotificationEmailMutation = useMutation({
    mutationFn: api.verifyNotificationEmail,
    onSuccess: () => {
      setNotificationEmailCode(null);
      setNotice("提醒邮箱已更新。");
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: api.updateMePreferences,
    onSuccess: () => {
      setNotice("邮件提醒设置已保存。");
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const testEmailMutation = useMutation({
    mutationFn: api.sendTestEmail,
    onSuccess: (result) => {
      setNotice(`测试邮件已发送至 ${result.email}。`);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const updatePasswordMutation = useMutation({
    mutationFn: api.updatePassword,
    onSuccess: (result) => {
      if (!rotateToken(result.access_token)) return;
      queryClient.setQueryData(["me"], result.user);
      setNotice("密码已更新，其他旧登录会话已经失效。");
    },
    onError: (error) => setNotice(describeError(error))
  });

  const deleteAccountMutation = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => endSession(false),
    onError: (error) => setNotice(describeError(error))
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteBinding,
    onSuccess: () => {
      setNotice("宿舍绑定已删除。");
      void queryClient.invalidateQueries({ queryKey: ["room-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["room-summaries"] });
      void queryClient.invalidateQueries({ queryKey: ["check-attempts"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  }

  function toggleBinding(binding: UserRoomBinding) {
    updateMutation.mutate({ id: binding.id, payload: { enabled: !binding.enabled } });
  }

  function updateBindingSettings(binding: UserRoomBinding, payload: Parameters<typeof api.updateBinding>[1]) {
    updateMutation.mutate({ id: binding.id, payload });
  }

  const bindings = bindingsQuery.data ?? [];
  const buildings = buildingsQuery.data ?? [];
  const attempts = attemptsQuery.data ?? [];
  const manualCheckAvailableAtByBinding = Object.fromEntries(
    summaries.map((item) => [item.binding_id, item.manual_check_available_at])
  );

  return (
    <AppShell
      activeView={activeView}
      darkMode={darkMode}
      user={meQuery.data}
      userLoading={meQuery.isLoading}
      userError={Boolean(meQuery.error)}
      onChangeView={navigate}
      onLogout={() => endSession(false)}
      onRefresh={refreshAll}
      refreshing={refreshing}
      onToggleTheme={toggleTheme}
    >
      <ActionNotice message={notice} onClose={() => setNotice(null)} />

      <Suspense fallback={<ViewLoading />}>
        {activeView === "dashboard" ? (
          <DashboardView
            announcements={announcementsQuery.data ?? []}
            summariesError={summariesQuery.isError}
            chartError={chartReadingsQuery.isError}
            onRetry={() => void summariesQuery.refetch()}
            onRetryChart={() => void chartReadingsQuery.refetch()}
            summaries={summaries}
            selectedBindingId={selectedChartBindingId}
            chartReadings={chartReadingsQuery.data ?? []}
            chartLoading={chartReadingsQuery.isLoading}
            chartRange={chartRange}
            loading={summariesQuery.isLoading}
            checkingId={checkingId}
            onSelectBinding={setSelectedChartBindingId}
            onChangeChartRange={setChartRange}
            onCheckRoom={(bindingId) => checkMutation.mutate(bindingId)}
            onGoRooms={() => navigate("rooms")}
          />
        ) : null}

        {activeView === "rooms" ? (
          <RoomsView
            buildings={buildings}
            bindings={bindings}
            loading={bindingsQuery.isLoading || buildingsQuery.isLoading}
            bindingsError={bindingsQuery.isError}
            buildingsError={buildingsQuery.isError}
            deletingId={deleteMutation.isPending ? deleteMutation.variables : null}
            saving={bindMutation.isPending}
            updatingId={updatingId}
            checkingId={checkingId}
            manualCheckAvailableAtByBinding={manualCheckAvailableAtByBinding}
            onBindRoom={(payload, onSuccess) => bindMutation.mutate(payload, { onSuccess })}
            onUpdateRoom={(id, payload, onSuccess) => updateMutation.mutate({ id, payload }, { onSuccess })}
            onCheckRoom={(bindingId) => checkMutation.mutate(bindingId)}
            onToggleRoom={toggleBinding}
            onDeleteRoom={(bindingId) => deleteMutation.mutate(bindingId)}
          />
        ) : null}

        {activeView === "records" && <RecordsView attempts={attempts} loading={attemptsQuery.isLoading}
          error={attemptsQuery.isError} onRetry={() => void attemptsQuery.refetch()} />}

        {activeView === "settings" ? (
          <SettingsView
            user={meQuery.data}
            userLoading={meQuery.isLoading}
            userError={Boolean(meQuery.error)}
            bindings={bindings}
            loading={bindingsQuery.isLoading}
            bindingsError={bindingsQuery.isError}
            updatingId={updatingId}
            requestingEmail={requestNotificationEmailMutation.isPending}
            verifyingEmail={verifyNotificationEmailMutation.isPending}
            notificationEmailCode={notificationEmailCode}
            minimumManualCheckCooldownSeconds={runtimeLimitsQuery.data?.manual_check_cooldown_seconds}
            minimumNotifyCooldownHours={runtimeLimitsQuery.data?.notify_cooldown_hours}
            updatingPreferences={updatePreferencesMutation.isPending}
            sendingTestEmail={testEmailMutation.isPending}
            updatingPassword={updatePasswordMutation.isPending}
            deletingAccount={deleteAccountMutation.isPending}
            onUpdateBinding={updateBindingSettings}
            onUpdatePreferences={(payload) => updatePreferencesMutation.mutate(payload)}
            onSendTestEmail={() => testEmailMutation.mutate()}
            onUpdatePassword={(oldPassword, newPassword, onSuccess) =>
              updatePasswordMutation.mutate({ old_password: oldPassword, new_password: newPassword }, { onSuccess })
            }
            onDeleteAccount={(password) => deleteAccountMutation.mutate({ password })}
            onRequestNotificationEmail={(email, onSuccess) => requestNotificationEmailMutation.mutate({ email }, { onSuccess })}
            onVerifyNotificationEmail={(email, code, onSuccess) => verifyNotificationEmailMutation.mutate({ email, code }, { onSuccess })}
          />
        ) : null}
      </Suspense>
    </AppShell>
  );
}

function ViewLoading() {
  return (
    <div className="flex min-h-48 items-center justify-center" role="status" aria-label="正在加载页面">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

export default function App() {
  if (/^\/(?:electricity\/)?admin(?:\/|$)/.test(window.location.pathname)) {
    return (
      <Suspense fallback={<ViewLoading />}>
        <AdminApp />
      </Suspense>
    );
  }
  return <UserApp />;
}
