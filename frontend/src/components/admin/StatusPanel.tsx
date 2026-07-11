import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BatteryCharging, Bell, KeyRound, Loader2, Mail, Play, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { createApiClient } from "../../lib/api";
import { formatDateTime } from "../../lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ActivityChart, HealthOverview } from "./StatusCharts";
import { BuildingStatsChart, CheckTrendChart, EmailTrendChart, UserGrowthChart } from "./DashboardCharts";
import { ADMIN_TOKEN_KEY } from "./utils";

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
    <Card
      className="admin-dashboard-card admin-stat-card admin-dashboard-enter"
      style={{ "--admin-dashboard-delay": `${index * 34}ms` } as CSSProperties}
    >
      <CardContent className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            <span key={String(item.value)} className="admin-stat-value">{item.value}</span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</div>
        </div>
        <div className="admin-stat-icon">{item.icon}</div>
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
    <div className="admin-dashboard grid gap-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item, index) => (
          <DashboardStatCard key={item.key} index={index} item={item} />
        ))}
      </section>

      <Card className="admin-dashboard-card admin-dashboard-controls admin-dashboard-enter" style={{ "--admin-dashboard-delay": "210ms" } as CSSProperties}>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="admin-stat-icon h-10 w-10 rounded-xl"><SlidersHorizontal size={18} /></div>
            <div className="text-sm font-semibold">看板内容</div>
          </div>
          <div className="admin-chart-toggle-group flex flex-wrap items-center gap-2" role="group" aria-label="图表显示选项">
            {chartOptions.map((item) => (
              <label key={item.key} className="admin-chart-toggle">
                <input checked={visibleCharts[item.key]} type="checkbox" onChange={() => toggleChart(item.key)} />
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

      <section className="grid gap-4 xl:grid-cols-2">
        {renderedCharts.activity ? (
          <Card className="admin-dashboard-card admin-dashboard-chart-card admin-dashboard-enter xl:col-span-2" style={{ "--admin-dashboard-delay": "250ms" } as CSSProperties}>
            <CardContent><ActivityChart points={status?.activity_series ?? []} /></CardContent>
          </Card>
        ) : null}
        {renderedCharts.checks ? (
          <Card className="admin-dashboard-card admin-dashboard-chart-card admin-dashboard-enter" style={{ "--admin-dashboard-delay": "285ms" } as CSSProperties}>
            <CardContent><CheckTrendChart points={status?.activity_series ?? []} /></CardContent>
          </Card>
        ) : null}
        {renderedCharts.emails ? (
          <Card className="admin-dashboard-card admin-dashboard-chart-card admin-dashboard-enter" style={{ "--admin-dashboard-delay": "320ms" } as CSSProperties}>
            <CardContent><EmailTrendChart points={status?.activity_series ?? []} /></CardContent>
          </Card>
        ) : null}
        {renderedCharts.users ? (
          <Card className="admin-dashboard-card admin-dashboard-chart-card admin-dashboard-enter" style={{ "--admin-dashboard-delay": "355ms" } as CSSProperties}>
            <CardContent><UserGrowthChart points={status?.activity_series ?? []} totalUsers={status?.total_users ?? 0} /></CardContent>
          </Card>
        ) : null}
        {renderedCharts.health ? (
          <Card className="admin-dashboard-card admin-dashboard-chart-card admin-dashboard-enter" style={{ "--admin-dashboard-delay": "390ms" } as CSSProperties}>
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
          <Card className="admin-dashboard-card admin-dashboard-chart-card admin-dashboard-enter xl:col-span-2" style={{ "--admin-dashboard-delay": "425ms" } as CSSProperties}>
            <CardContent><BuildingStatsChart buildings={status?.building_stats ?? []} /></CardContent>
          </Card>
        ) : null}
      </section>

      <Card className="admin-dashboard-card admin-dashboard-enter" style={{ "--admin-dashboard-delay": "460ms" } as CSSProperties}>
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
