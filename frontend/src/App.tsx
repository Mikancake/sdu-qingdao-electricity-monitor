import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, createApiClient } from "./lib/api";
import type { UserRoomBinding } from "./lib/types";
import { AdminApp } from "./components/AdminApp";
import { AuthPanel } from "./components/AuthPanel";
import { AppShell, type ViewKey } from "./components/AppShell";
import { DashboardView, type ChartRangeState } from "./components/DashboardView";
import { RecordsView } from "./components/RecordsView";
import { RoomsView } from "./components/RoomsView";
import { SettingsView } from "./components/SettingsView";

const TOKEN_KEY = "sdu-electricity-token";
const THEME_KEY = "sdu-electricity-theme";

function readStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.detail === "string") {
      return error.detail;
    }
    if (
      error.detail &&
      typeof error.detail === "object" &&
      "kind" in error.detail &&
      error.detail.kind === "manual_check_cooldown"
    ) {
      const retryAfter = "retry_after_seconds" in error.detail ? Number(error.detail.retry_after_seconds) : 300;
      return `手动同步冷却中，请 ${Math.max(1, retryAfter)} 秒后再试。`;
    }
    if (
      error.detail &&
      typeof error.detail === "object" &&
      "kind" in error.detail &&
      (error.detail.kind === "test_email_cooldown" || error.detail.kind === "verification_email_cooldown")
    ) {
      const retryAfter = "retry_after_seconds" in error.detail ? Number(error.detail.retry_after_seconds) : 1800;
      return `邮件发送冷却中，请 ${Math.max(1, Math.ceil(retryAfter / 60))} 分钟后再试。`;
    }
    return JSON.stringify(error.detail);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败";
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

export default function App() {
  if (window.location.pathname.startsWith("/admin")) {
    return <AdminApp />;
  }

  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedChartBindingId, setSelectedChartBindingId] = useState<number | null>(null);
  const [chartRange, setChartRange] = useState<ChartRangeState>({ key: "7d", startAt: "", endAt: "" });
  const [notificationEmailCode, setNotificationEmailCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem(THEME_KEY) === "dark");

  const api = useMemo(() => createApiClient(token), [token]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  function handleLogin(nextToken: string) {
    window.localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setActiveView("dashboard");
    setNotice(null);
  }

  function handleLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    queryClient.clear();
  }

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    enabled: Boolean(token)
  });

  const runtimeLimitsQuery = useQuery({
    queryKey: ["runtime-limits"],
    queryFn: api.getRuntimeLimits,
    enabled: Boolean(token)
  });

  const summariesQuery = useQuery({
    queryKey: ["room-summaries"],
    queryFn: api.listRoomSummaries,
    enabled: Boolean(token)
  });

  const bindingsQuery = useQuery({
    queryKey: ["room-bindings"],
    queryFn: api.listRoomBindings,
    enabled: Boolean(token)
  });

  const buildingsQuery = useQuery({
    queryKey: ["buildings"],
    queryFn: api.listBuildings,
    enabled: Boolean(token)
  });

  const attemptsQuery = useQuery({
    queryKey: ["check-attempts"],
    queryFn: api.listCheckAttempts,
    enabled: Boolean(token)
  });

  useEffect(() => {
    const summaries = summariesQuery.data ?? [];
    if (summaries.length > 0 && !summaries.some((item) => item.binding_id === selectedChartBindingId)) {
      setSelectedChartBindingId(summaries[0].binding_id);
    }
  }, [selectedChartBindingId, summariesQuery.data]);

  const chartReadingsQuery = useQuery({
    queryKey: ["chart-readings", selectedChartBindingId, chartRange],
    queryFn: () => api.listRoomReadings(selectedChartBindingId as number, buildChartParams(chartRange)),
    enabled: Boolean(token && selectedChartBindingId)
  });

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      handleLogout();
    }
  }, [meQuery.error]);

  const bindMutation = useMutation({
    mutationFn: api.bindRoom,
    onSuccess: () => {
      setNotice("宿舍已绑定。");
      void queryClient.invalidateQueries({ queryKey: ["room-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["room-summaries"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  const checkMutation = useMutation({
    mutationFn: api.checkRoom,
    onMutate: (bindingId) => setCheckingId(bindingId),
    onSuccess: () => {
      setNotice("电量已刷新。");
      void queryClient.invalidateQueries({ queryKey: ["room-summaries"] });
      void queryClient.invalidateQueries({ queryKey: ["check-attempts"] });
      void queryClient.invalidateQueries({ queryKey: ["chart-readings"] });
    },
    onError: (error) => setNotice(describeError(error)),
    onSettled: () => setCheckingId(null)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof api.updateBinding>[1] }) =>
      api.updateBinding(id, payload),
    onMutate: ({ id }) => setUpdatingId(id),
    onSuccess: () => {
      setNotice("提醒设置已保存。");
      void queryClient.invalidateQueries({ queryKey: ["room-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["room-summaries"] });
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

  const deleteAccountMutation = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => {
      window.localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      queryClient.clear();
    },
    onError: (error) => setNotice(describeError(error))
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteBinding,
    onSuccess: () => {
      setNotice("宿舍绑定已删除。");
      void queryClient.invalidateQueries({ queryKey: ["room-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["room-summaries"] });
    },
    onError: (error) => setNotice(describeError(error))
  });

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    void queryClient.invalidateQueries({ queryKey: ["room-summaries"] });
    void queryClient.invalidateQueries({ queryKey: ["room-bindings"] });
    void queryClient.invalidateQueries({ queryKey: ["buildings"] });
    void queryClient.invalidateQueries({ queryKey: ["check-attempts"] });
    void queryClient.invalidateQueries({ queryKey: ["chart-readings"] });
    void queryClient.invalidateQueries({ queryKey: ["runtime-limits"] });
  }

  function toggleBinding(binding: UserRoomBinding) {
    updateMutation.mutate({ id: binding.id, payload: { enabled: !binding.enabled } });
  }

  function updateBindingSettings(binding: UserRoomBinding, payload: Parameters<typeof api.updateBinding>[1]) {
    updateMutation.mutate({ id: binding.id, payload });
  }

  if (!token) {
    return <AuthPanel onLogin={handleLogin} />;
  }

  const summaries = summariesQuery.data ?? [];
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
      onChangeView={setActiveView}
      onLogout={handleLogout}
      onRefresh={refreshAll}
      onToggleTheme={() => setDarkMode((value) => !value)}
    >
      {notice ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-panel px-4 py-3 text-sm shadow-soft">
          <span className="text-muted-foreground">{notice}</span>
          <button className="text-xs text-primary" onClick={() => setNotice(null)} type="button">
            关闭
          </button>
        </div>
      ) : null}

      {activeView === "dashboard" ? (
        <DashboardView
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
          onGoRooms={() => setActiveView("rooms")}
        />
      ) : null}

      {activeView === "rooms" ? (
        <RoomsView
          buildings={buildings}
          bindings={bindings}
          loading={bindingsQuery.isLoading || buildingsQuery.isLoading}
          saving={bindMutation.isPending}
          checkingId={checkingId}
          manualCheckAvailableAtByBinding={manualCheckAvailableAtByBinding}
          onBindRoom={(payload) => bindMutation.mutate(payload)}
          onCheckRoom={(bindingId) => checkMutation.mutate(bindingId)}
          onToggleRoom={toggleBinding}
          onDeleteRoom={(bindingId) => deleteMutation.mutate(bindingId)}
        />
      ) : null}

      {activeView === "records" ? <RecordsView attempts={attempts} loading={attemptsQuery.isLoading} /> : null}

      {activeView === "settings" ? (
        <SettingsView
          user={meQuery.data}
          bindings={bindings}
          loading={bindingsQuery.isLoading}
          updatingId={updatingId}
          requestingEmail={requestNotificationEmailMutation.isPending}
          verifyingEmail={verifyNotificationEmailMutation.isPending}
          notificationEmailCode={notificationEmailCode}
          minimumManualCheckCooldownSeconds={runtimeLimitsQuery.data?.manual_check_cooldown_seconds}
          minimumNotifyCooldownHours={runtimeLimitsQuery.data?.notify_cooldown_hours}
          updatingPreferences={updatePreferencesMutation.isPending}
          sendingTestEmail={testEmailMutation.isPending}
          deletingAccount={deleteAccountMutation.isPending}
          onUpdateBinding={updateBindingSettings}
          onUpdatePreferences={(payload) => updatePreferencesMutation.mutate(payload)}
          onSendTestEmail={() => testEmailMutation.mutate()}
          onDeleteAccount={(password) => deleteAccountMutation.mutate({ password })}
          onRequestNotificationEmail={(email) => requestNotificationEmailMutation.mutate({ email })}
          onVerifyNotificationEmail={(email, code) => verifyNotificationEmailMutation.mutate({ email, code })}
        />
      ) : null}
    </AppShell>
  );
}
