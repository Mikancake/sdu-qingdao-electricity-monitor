import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BatteryCharging, Bell, KeyRound, Loader2, Mail, Play, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { createApiClient } from "../../lib/api";
import { formatDateTime } from "../../lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { ActivityChart, HealthOverview } from "./StatusCharts";
import { BuildingStatsChart, CheckTrendChart, EmailTrendChart, UserGrowthChart } from "./DashboardCharts";
import { ADMIN_TOKEN_KEY, describeError } from "./utils";

type DashboardChartKey = "activity" | "checks" | "emails" | "users" | "buildings" | "health";

const CHART_VISIBILITY_KEY = "electricity-admin-dashboard-charts";
const chartOptions: Array<{ key: DashboardChartKey; label: string }> = [
  { key: "activity", label: "平台活动" },
  { key: "checks", label: "查询趋势" },
  { key: "emails", label: "邮件趋势" },
  { key: "users", label: "用户增长" },
  { key: "buildings", label: "宿舍楼统计" },
  { key: "health", label: "运行健康度" }
];

function defaultChartVisibility(): Record<DashboardChartKey, boolean> {
  return { activity: true, checks: true, emails: true, users: true, buildings: true, health: true };
}

function loadChartVisibility() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CHART_VISIBILITY_KEY) ?? "null") as
      | Partial<Record<DashboardChartKey, boolean>>
      | null;
    return { ...defaultChartVisibility(), ...(saved ?? {}) };
  } catch {
    return defaultChartVisibility();
  }
}

interface DashboardStat {
  key: string;
  label: string;
  value: number | string;
  detail: string;
  icon: ReactNode;
}

const DashboardStatCard = memo(function DashboardStatCard({ item, index }: { item: DashboardStat; index: number }) {
  return (
    <Card className={`min-w-0 ${index === 0 ? "border-primary/30 bg-primary/5 sm:col-span-2" : ""}`}>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
          <span aria-hidden="true" className="shrink-0">{item.icon}</span>
        </div>
        <div className="min-w-0">
          <div className="metric-value break-words">{item.value}</div>
          <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</div>
        </div>
      </CardContent>
    </Card>
  );
});

export function StatusPanel({
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
  const [visibleCharts, setVisibleCharts] = useState(loadChartVisibility);
  const renderedCharts = useDeferredValue(visibleCharts);
  const statusQuery = useQuery({ queryKey: ["admin-status"], queryFn: api.getAdminStatus });
  const status = statusQuery.data;

  useEffect(() => {
    window.localStorage.setItem(CHART_VISIBILITY_KEY, JSON.stringify(visibleCharts));
  }, [visibleCharts]);

  const toggleChart = (key: DashboardChartKey) => {
    setVisibleCharts((current) => ({ ...current, [key]: !current[key] }));
  };
  const cards = useMemo<DashboardStat[]>(() => [
    {
      key: "users",
      label: "注册用户",
      value: status?.total_users ?? "--",
      detail: `已验证 ${status?.verified_users ?? "--"}`,
      icon: <ShieldCheck className="text-primary" size={24} />
    },
    {
      key: "rooms",
      label: "使用宿舍",
      value: status?.total_rooms ?? "--",
      detail: `启用绑定 ${status?.active_bindings ?? "--"}`,
      icon: <BatteryCharging className="text-success" size={24} />
    },
    {
      key: "tokens",
      label: "Token",
      value: status ? `${status.enabled_token_count}/${status.token_count}` : "--",
      detail: `异常 ${status?.unhealthy_token_count ?? "--"}`,
      icon: <KeyRound className="text-warning" size={24} />
    },
    {
      key: "smtp",
      label: "SMTP",
      value: status ? `${status.enabled_smtp_count}/${status.smtp_count}` : "--",
      detail: `异常 ${status?.unhealthy_smtp_count ?? "--"}`,
      icon: <Mail className={status?.smtp_configured ? "text-success" : "text-muted-foreground"} size={24} />
    },
    {
      key: "business-email",
      label: "提醒与日报",
      value: status?.sent_notifications ?? "--",
      detail: `业务记录 ${status?.total_notifications ?? "--"}`,
      icon: <Bell className="text-primary" size={24} />
    },
    {
      key: "email",
      label: "全部发信",
      value: status?.all_sent_emails ?? "--",
      detail: `24h ${status?.recent_sent_emails ?? "--"} · 失败 ${status?.recent_failed_emails ?? "--"}`,
      icon: <Mail className="text-primary" size={24} />
    },
    {
      key: "queue",
      label: "通知队列",
      value: status?.pending_notifications ?? "--",
      detail: `失败 ${status?.failed_notifications ?? "--"}`,
      icon: <Bell className={status?.failed_notifications ? "text-danger" : "text-muted-foreground"} size={24} />
    }
  ], [status]);

  return (
    <div className="grid min-w-0 gap-6">
      <section aria-label="运行调度" className="grid min-w-0 gap-0 overflow-hidden rounded-lg border border-border bg-panel xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <div className="feature-panel p-5 sm:p-6">
          <div className="eyebrow">监测快照</div>
          <h2 className="mt-3 font-serif text-2xl leading-snug">校园用电，尽在掌握。</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">查询凭据、宿舍读数与通知投递的统一运行记录。</p>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">最近一次电量读数</span>
            <span className="text-sm font-medium tabular-nums">{formatDateTime(status?.latest_read_at)}</span>
          </div>
        </div>
        <div className="grid content-center gap-4 border-t border-border p-5 sm:p-6 xl:border-l xl:border-t-0">
          <div><h3 className="text-sm font-semibold">手动调度</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">需要即时更新？按需运行到期检查或通知扫描。</p></div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={runningChecks} aria-busy={runningChecks} onClick={onRunChecks}>
              {runningChecks ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
              立即检查到期宿舍
            </Button>
            <Button disabled={runningNotifications} aria-busy={runningNotifications} onClick={onRunNotifications} variant="secondary">
              {runningNotifications ? <Loader2 className="animate-spin" size={16} /> : <Bell size={16} />}
              立即扫描提醒
            </Button>
          </div>
        </div>
      </section>
      {statusQuery.isLoading ? <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />正在汇总平台运行数据…</div> : null}
      {statusQuery.isError ? <div role="alert" className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{describeError(statusQuery.error)}</div> : null}
      <section aria-label="平台关键指标" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item, index) => (
          <DashboardStatCard key={item.key} index={index} item={item} />
        ))}
      </section>

      <Card>
        <CardContent className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
          <div className="flex items-start gap-3">
            <SlidersHorizontal size={18} className="mt-0.5 shrink-0 text-primary" />
            <div><h2 className="text-sm font-semibold">趋势与健康度</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">勾选图表，定制当前视图。</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="图表显示选项">
            {chartOptions.map((item) => (
              <label key={item.key} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${visibleCharts[item.key] ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-panel text-muted-foreground"}`}>
                <input className="h-3.5 w-3.5 accent-primary" checked={visibleCharts[item.key]} type="checkbox" onChange={() => toggleChart(item.key)} />
                <span>{item.label}</span>
              </label>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setVisibleCharts(defaultChartVisibility())}>
              <RotateCcw size={14} />
              全部显示
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        {renderedCharts.activity ? (
          <Card className="min-w-0 xl:col-span-2">
            <CardContent><ActivityChart points={status?.activity_series ?? []} /></CardContent>
          </Card>
        ) : null}
        {renderedCharts.checks ? (
          <Card className="min-w-0">
            <CardContent><CheckTrendChart points={status?.activity_series ?? []} /></CardContent>
          </Card>
        ) : null}
        {renderedCharts.emails ? (
          <Card className="min-w-0">
            <CardContent><EmailTrendChart points={status?.activity_series ?? []} /></CardContent>
          </Card>
        ) : null}
        {renderedCharts.users ? (
          <Card className="min-w-0">
            <CardContent><UserGrowthChart points={status?.activity_series ?? []} totalUsers={status?.total_users ?? 0} /></CardContent>
          </Card>
        ) : null}
        {renderedCharts.health ? (
          <Card className="min-w-0">
            <CardContent>
              <HealthOverview
                enabledSmtp={status?.enabled_smtp_count ?? 0}
                enabledTokens={status?.enabled_token_count ?? 0}
                recentFailedEmails={status?.recent_failed_emails ?? 0}
                recentSentEmails={status?.recent_sent_emails ?? 0}
                smtpCount={status?.smtp_count ?? 0}
                tokenCount={status?.token_count ?? 0}
                totalUsers={status?.total_users ?? 0}
                verifiedUsers={status?.verified_users ?? 0}
              />
            </CardContent>
          </Card>
        ) : null}
        {renderedCharts.buildings ? (
          <Card className="min-w-0 xl:col-span-2">
            <CardContent><BuildingStatsChart buildings={status?.building_stats ?? []} /></CardContent>
          </Card>
        ) : null}
      </section>

    </div>
  );
}
