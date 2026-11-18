import { AlertTriangle, ArrowRight, BatteryCharging, BellRing, Building2, CheckCircle2, CircleDollarSign, Clock, Receipt, Sparkles, Zap } from "lucide-react";

import type { Announcement, Reading, UserRoomSummary } from "../lib/types";
import { formatDateTime, formatDays, formatKwh, formatKwhPerDay } from "../lib/utils";
import { AnnouncementsNotice } from "./AnnouncementsNotice";
import { EmptyState } from "./EmptyState";
import { CooldownRefreshButton } from "./CooldownRefreshButton";
import { PowerChart } from "./PowerChart";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Label, Select } from "./ui/input";
import { DashboardSkeleton, Skeleton } from "./ui/skeleton";

export type ChartRangeKey = "1d" | "7d" | "30d" | "all" | "custom";

export interface ChartRangeState {
  key: ChartRangeKey;
  startAt: string;
  endAt: string;
}

// The readings endpoint accepts either inclusive bound independently.
export function isChartRangeValid(range: ChartRangeState) {
  if (range.key !== "custom") return true;
  if (!range.startAt && !range.endAt) return false;
  const start = range.startAt ? Date.parse(range.startAt) : -Infinity;
  const end = range.endAt ? Date.parse(range.endAt) : Infinity;
  return start <= end;
}

interface DashboardViewProps {
  announcements: Announcement[];
  summariesError?: boolean;
  chartError?: boolean;
  onRetry?: () => void;
  onRetryChart?: () => void;
  summaries: UserRoomSummary[];
  selectedBindingId?: number | null;
  chartReadings: Reading[];
  chartLoading: boolean;
  chartRange: ChartRangeState;
  loading: boolean;
  checkingId?: number | null;
  onSelectBinding: (bindingId: number) => void;
  onChangeChartRange: (range: ChartRangeState) => void;
  onCheckRoom: (bindingId: number) => void;
  onGoRooms: () => void;
}

function estimatedDailyUsage(item: UserRoomSummary) {
  return item.usage.estimated_daily_usage ?? item.usage.average_daily_usage;
}

function usageSource(item: UserRoomSummary) {
  return item.usage.estimated_daily_usage_source ?? item.usage.average_daily_usage_source ?? "unknown";
}

function latestDataAt(item: UserRoomSummary) {
  return item.usage.latest_provider_updated_at ?? item.usage.latest_read_at;
}

function formatUsageWindow(hours?: string | null) {
  if (!hours) {
    return "历史读数";
  }
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0) {
    return "历史读数";
  }
  const days = value / 24;
  return days < 2 ? `${days.toFixed(1)} 天读数` : `${Math.round(days)} 天读数`;
}

function dailyUsageBasis(item: UserRoomSummary) {
  const value = estimatedDailyUsage(item);
  const formatted = formatKwhPerDay(value);
  const source = usageSource(item);
  if (source === "provider_reported_historical" || source === "measured_historical") {
    return `历史活跃期参考 ${formatted}`;
  }
  if (source === "provider_reported") {
    return `上游日均 ${formatted}`;
  }
  if (source === "measured") {
    return `余额下降实测 ${formatted}`;
  }
  return value != null ? `默认估算 ${formatted}` : "暂无日均用电数据";
}

function usageAverageHint(item: UserRoomSummary) {
  const source = usageSource(item);
  if (source === "provider_reported") {
    return `基于最近${formatUsageWindow(item.usage.usage_window_hours)}的上游日用电数据`;
  }
  if (source === "provider_reported_historical") {
    return `当前刚恢复用电，暂参考上一段活跃期的上游日用电数据`;
  }
  if (source === "measured") {
    return `基于最近${formatUsageWindow(item.usage.usage_window_hours)}的余额下降记录`;
  }
  if (source === "measured_historical") {
    return `当前刚恢复用电，暂参考上一段活跃期的余额下降记录`;
  }
  if (item.usage.latest_read_at && estimatedDailyUsage(item) != null) {
    return `有效完整日样本不足，暂按${formatKwhPerDay(estimatedDailyUsage(item))}估算`;
  }
  return "暂无历史读数";
}

function remainingHint(item: UserRoomSummary) {
  if (!item.usage.latest_balance) {
    return "暂无当前电量";
  }
  if (item.usage.days_remaining == null) return "暂无可用估算";
  if (item.usage.days_remaining_source !== "default") return `基于${dailyUsageBasis(item)}估算`;
  return `基于${dailyUsageBasis(item)}估算，获得足够完整日数据后会自动更新`;
}

function thresholdHint(item: UserRoomSummary) {
  const value = formatKwh(item.usage.alert_threshold);
  const mode = item.alert_threshold_mode ?? "days";
  if (value === "--") {
    return "暂无提醒阈值";
  }
  if (mode === "fixed") {
    return `固定阈值：电量不高于 ${value} 时提醒`;
  }
  if (mode === "average") {
    return `提醒阈值：电量不高于 1 天用电量时提醒（${dailyUsageBasis(item)} = ${value}）`;
  }
  return `提醒阈值：${item.alert_days} 天 × ${dailyUsageBasis(item)} = ${value}`;
}

const chartRangeItems: Array<{ key: ChartRangeKey; label: string }> = [
  { key: "1d", label: "1 天" },
  { key: "7d", label: "7 天" },
  { key: "30d", label: "近一月" },
  { key: "all", label: "有史以来" },
  { key: "custom", label: "自定义" }
];

function formatMoney(value?: string | null) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  return Number.isFinite(number) ? `¥${number.toFixed(2)}` : "--";
}

function formatPrice(value?: string | null) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  return Number.isFinite(number) ? `¥${number.toFixed(4)} / 度` : "--";
}

function HwglDetails({ item }: { item: UserRoomSummary }) {
  const recharges = item.recent_recharges ?? [];
  return (
    <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDollarSign className="text-primary" size={19} />
            电量构成
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">拆分数据由当前电量查询结果提供，余额上涨不会被计入用电量。</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          {[
            ["免费电量", formatKwh(item.usage.free_electricity)],
            ["付费电量", formatKwh(item.usage.paid_electricity)],
            ["欠费电量", formatKwh(item.usage.arrears_electricity)],
            ["当前电价", formatPrice(item.usage.electricity_price)],
            ["余额折算", formatMoney(item.usage.estimated_amount)]
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 border-t border-border pt-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-2 break-words text-base font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="text-success" size={19} />
            最近充值
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recharges.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-xs leading-5 text-muted-foreground">
              暂无充值记录，后台同步后会显示在这里。
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recharges.slice(0, 6).map((recharge) => (
                <div key={recharge.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{recharge.paid_at ? formatDateTime(recharge.paid_at) : "时间未知"}</div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      {recharge.line_type || "电量充值"}{recharge.processing_status || recharge.payment_status ? ` · ${recharge.processing_status || recharge.payment_status}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-success tabular-nums">{formatMoney(recharge.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
function OnboardingPanel({ onGoRooms }: { onGoRooms: () => void }) {
  const steps = [
    {
      title: "选择宿舍楼",
      description: "从楼栋列表中选择对应的宿舍楼。",
      icon: Building2
    },
    {
      title: "填写房间号",
      description: "输入房间号，添加时会先查询确认。",
      icon: CheckCircle2
    },
    {
      title: "设置提醒",
      description: "按剩余天数或固定电量接收提醒。",
      icon: BellRing
    }
  ];

  return (
    <section className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
      <div className="feature-panel flex flex-col items-start rounded-lg border border-border bg-panel p-6 sm:p-8">
        <span className="eyebrow inline-flex items-center gap-2"><Sparkles size={16} /> 开始监测</span>
        <h2 className="page-heading mt-8 max-w-sm text-3xl leading-tight sm:text-4xl">先添加宿舍，<br />再把电量交给我们。</h2>
        <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">绑定后即可查看余额、用电趋势与预计剩余天数。电量接近阈值时，邮件会提醒你及时充值。</p>
        <Button className="mt-8" onClick={onGoRooms}>绑定我的宿舍 <ArrowRight size={16} /></Button>
        <p className="mt-6 text-xs leading-6 text-muted-foreground">支持多宿舍切换，提醒方式可随时调整。</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">只需三步，开始监测</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {steps.map(({ title, description, icon: Icon }, index) => (
            <div key={title} className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={20} /></div>
              <div>
                <p className="text-[11px] font-semibold tabular-nums text-primary">0{index + 1}</p>
                <h3 className="mt-1 text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
export function DashboardView({
  announcements,
  summariesError,
  chartError,
  onRetry,
  onRetryChart,
  summaries,
  selectedBindingId,
  chartReadings,
  chartLoading,
  chartRange,
  loading,
  checkingId,
  onSelectBinding,
  onChangeChartRange,
  onCheckRoom,
  onGoRooms
}: DashboardViewProps) {
  const primary = summaries.find((item) => item.binding_id === selectedBindingId) ?? summaries[0];
  const lowCount = summaries.filter((item) => item.usage.is_low_power).length;
  const enabledCount = summaries.filter((item) => item.enabled).length;
  const rangeValid = isChartRangeValid(chartRange);
  const rangeError = !chartRange.startAt && !chartRange.endAt ? "请至少选择一个时间边界。" : "请确认时间有效且开始时间不晚于结束时间。";
  const summaryErrorNotice = summariesError ? (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4 text-sm">
      {primary ? "宿舍数据刷新失败，以下为上次载入的数据。" : "宿舍数据读取失败，暂时无法显示总览。"}
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>重新读取宿舍</Button> : null}
    </div>
  ) : null;

  const overviewHeader = (
    <section className="dashboard-overview flex flex-col gap-4 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.12] via-panel/45 to-panel/20 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
      <div>
        <p className="eyebrow">用电总览</p>
        <h1 className="page-heading mt-2 text-3xl sm:text-4xl">宿舍用电，一目了然。</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {summaries.length > 0 ? `已绑定 ${summaries.length} 个宿舍 · ${enabledCount} 个正在监测` : "添加宿舍，记录电量变化，及时接收低电量提醒。"}
        </p>
      </div>
      <Badge className="self-start sm:self-auto" tone={lowCount > 0 ? "danger" : "muted"}>
        {lowCount > 0 ? `${lowCount} 个宿舍电量偏低` : summaries.length > 0 ? "暂无低电量标记" : "等待绑定宿舍"}
      </Badge>
    </section>
  );

  if (loading && !primary) {
    return <div role="status"><span className="sr-only">正在读取宿舍数据</span><DashboardSkeleton /></div>;
  }

  if (!primary && summariesError) return summaryErrorNotice;
  if (!primary) {
    return (
      <div className="space-y-5">
        {overviewHeader}
        <AnnouncementsNotice announcements={announcements} />
        <OnboardingPanel onGoRooms={onGoRooms} />
      </div>
    );
  }

  const waitingForBinding = selectedBindingId !== primary.binding_id;
  const checking = checkingId === primary.binding_id;
  return (
    <div className="space-y-6">
      {overviewHeader}
      {summaryErrorNotice}

      <section aria-label="当前宿舍电量" className="dashboard-summary-surface min-w-0 overflow-hidden rounded-2xl border">
        <div className="dashboard-summary-toolbar flex flex-col gap-4 border-b border-border/60 p-4 sm:p-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 xl:w-80">
            <Label htmlFor="chart-room">当前宿舍</Label>
            <Select id="chart-room" value={primary.binding_id} onChange={(event) => onSelectBinding(Number(event.target.value))}>
              {summaries.map((item) => (
                <option key={item.binding_id} value={item.binding_id}>{item.room.building_name} {item.room.room_number}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="muted">{primary.room.provider === "hwgl" ? "HWGL 官方数据" : primary.room.provider === "mcard" ? "校园卡数据" : "已接入数据源"}</Badge>
            <CooldownRefreshButton
              availableAt={primary.manual_check_available_at}
              checking={checking}
              busyElsewhere={checkingId != null && !checking}
              roomLabel={`${primary.room.building_name} ${primary.room.room_number}`}
              onClick={() => onCheckRoom(primary.binding_id)}
            />
            <Button variant="ghost" size="sm" onClick={onGoRooms}>管理宿舍 <ArrowRight size={14} /></Button>
          </div>
        </div>
        <div className="dashboard-metric-grid grid divide-y divide-border/60 md:grid-cols-[1.25fr_1fr_1fr] md:divide-x md:divide-y-0">
          <div className="dashboard-metric-card dashboard-metric-card-primary min-w-0 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground"><BatteryCharging size={16} className="text-primary" /> 当前可用电量</div>
            <div className="metric-value mt-3 break-words">{formatKwh(primary.usage.latest_balance)}</div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">数据更新于 {formatDateTime(latestDataAt(primary))}</p>
          </div>
          <div className="dashboard-metric-card min-w-0 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground"><Clock size={15} /> 预计还可使用</div>
            <div className="metric-value mt-3 break-words">{formatDays(primary.usage.days_remaining)}</div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{remainingHint(primary)}</p>
          </div>
          <div className="dashboard-metric-card min-w-0 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground"><Zap size={15} /> 日均用电</div>
            <div className="metric-value mt-3 break-words">{formatKwhPerDay(estimatedDailyUsage(primary))}</div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{usageAverageHint(primary)}</p>
          </div>
        </div>
        <div className="dashboard-summary-alert flex items-start gap-3 border-t border-border/60 p-4 sm:px-5">
          <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${primary.usage.is_low_power ? "text-danger" : "text-primary"}`} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium">{primary.usage.is_low_power ? "当前宿舍电量偏低" : primary.enabled ? "当前宿舍监测中" : "当前宿舍已停用"}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{thresholdHint(primary)}</p>
          </div>
        </div>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">电量走势</CardTitle>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">按数据更新时间显示余额；竖线标出近期已知充值时间。每次最多读取 5000 条。</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{primary.room.building_name} · {primary.room.room_number}</span>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
              {chartRangeItems.map((item) => (
                <Button
                  key={item.key}
                  size="sm"
                  variant={chartRange.key === item.key ? "primary" : "ghost"}
                  aria-pressed={chartRange.key === item.key}
                  onClick={() => onChangeChartRange({ ...chartRange, key: item.key })}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            {chartRange.key === "custom" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="chart-start">开始时间</Label>
                  <Input
                    id="chart-start"
                    type="datetime-local"
                    value={chartRange.startAt}
                    max={chartRange.endAt || undefined}
                    aria-invalid={!rangeValid}
                    aria-describedby={!rangeValid ? "chart-range-error" : undefined}
                    onChange={(event) => onChangeChartRange({ ...chartRange, startAt: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="chart-end">结束时间</Label>
                  <Input
                    id="chart-end"
                    type="datetime-local"
                    value={chartRange.endAt}
                    min={chartRange.startAt || undefined}
                    aria-invalid={!rangeValid}
                    aria-describedby={!rangeValid ? "chart-range-error" : undefined}
                    onChange={(event) => onChangeChartRange({ ...chartRange, endAt: event.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {!rangeValid ? <p id="chart-range-error" role="status" className="text-sm text-muted-foreground">{rangeError}</p> : null}
            {rangeValid && !waitingForBinding && chartError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                {chartReadings.length ? "走势刷新失败，以下为上次载入的读数。" : "历史读数读取失败。"}
                {onRetryChart ? <Button variant="secondary" size="sm" onClick={onRetryChart}>重新读取走势</Button> : null}
              </div>
            ) : null}
            {!rangeValid ? null : waitingForBinding || (chartLoading && chartReadings.length === 0) ? (
              <div aria-label="正在读取历史读数" className="min-h-[280px] space-y-4 py-3" role="status">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-[238px] w-full rounded-none" />
                <span className="sr-only">正在读取历史读数</span>
              </div>
            ) : chartReadings.length > 0 ? (
              <PowerChart
                key={`${primary.binding_id}:${chartRange.key}:${chartRange.startAt}:${chartRange.endAt}`}
                readings={chartReadings}
                averageDailyUsage={estimatedDailyUsage(primary)}
                recharges={primary.recent_recharges}
              />
            ) : chartError ? null : (
              <EmptyState
                title="暂无历史记录"
                description="换一个时间范围，或点击立即刷新后保存新的电量记录。"
                className="min-h-[280px]"
              />
            )}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader className="flex items-center justify-between gap-3 border-b border-border">
              <CardTitle className="text-base">我的宿舍</CardTitle>
              <span className="text-xs text-muted-foreground">{summaries.length} 个绑定</span>
            </CardHeader>
            <CardContent className="space-y-2">
              {summaries.map((item) => (
                <button
                  key={item.binding_id}
                  aria-pressed={item.binding_id === primary.binding_id}
                  className={`w-full rounded-md border-l-2 p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${item.binding_id === primary.binding_id ? "border-primary bg-muted" : "border-transparent bg-panel hover:bg-muted"}`}
                  onClick={() => onSelectBinding(item.binding_id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {item.room.building_name} {item.room.room_number}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(latestDataAt(item))}</div>
                    </div>
                    <Badge tone={item.usage.is_low_power ? "danger" : item.enabled ? "success" : "muted"}>
                      {item.usage.is_low_power ? "低电量" : item.enabled ? "启用" : "停用"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="border-r border-border pr-2">
                      <div className="text-muted-foreground">余额</div>
                      <div className="mt-1 font-medium">{formatKwh(item.usage.latest_balance)}</div>
                    </div>
                    <div className="pl-2">
                      <div className="text-muted-foreground">剩余</div>
                      <div className="mt-1 font-medium">{formatDays(item.usage.days_remaining)}</div>
                      {item.usage.days_remaining_source === "default" ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">默认估算</div>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
          <AnnouncementsNotice
            announcements={announcements}
          />
        </div>
      </section>
      {primary.room.provider === "hwgl" ? <HwglDetails item={primary} /> : null}
    </div>
  );
}
