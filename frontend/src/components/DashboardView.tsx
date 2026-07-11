import { AlertTriangle, BatteryCharging, Building2, Clock, Zap } from "lucide-react";

import type { Reading, UserRoomSummary } from "../lib/types";
import { formatDateTime, formatDays, formatKwh, formatKwhPerDay } from "../lib/utils";
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

interface DashboardViewProps {
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

function selectPrimaryRoom(summaries: UserRoomSummary[]) {
  return summaries.find((item) => item.enabled) ?? summaries[0];
}

function hasMeasuredAverage(item: UserRoomSummary) {
  return item.usage.average_daily_usage_source === "measured" && Boolean(item.usage.average_daily_usage);
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

function defaultDailyUsage(item: UserRoomSummary) {
  const threshold = Number(item.usage.alert_threshold);
  if (Number.isFinite(threshold) && threshold > 0) {
    if ((item.alert_threshold_mode ?? "days") === "days" && item.alert_days > 0) {
      return threshold / item.alert_days;
    }
    if ((item.alert_threshold_mode ?? "days") === "average") {
      return threshold;
    }
  }
  return 5;
}

function dailyUsageBasis(item: UserRoomSummary) {
  if (hasMeasuredAverage(item)) {
    return `实测日均 ${formatKwhPerDay(item.usage.average_daily_usage)}`;
  }
  return `默认 ${formatKwhPerDay(defaultDailyUsage(item))}`;
}

function usageAverageHint(item: UserRoomSummary) {
  if (hasMeasuredAverage(item)) {
    return `基于最近${formatUsageWindow(item.usage.usage_window_hours)}的余额下降记录计算`;
  }
  if (item.usage.latest_read_at) {
    return "有效下降读数不足，暂不显示实测日均";
  }
  return "暂无历史读数";
}

function remainingHint(item: UserRoomSummary) {
  if (!item.usage.latest_balance) {
    return "暂无当前电量";
  }
  if (item.usage.days_remaining_source === "measured") {
    return "基于最近实测日均用电估算";
  }
  return `基于${dailyUsageBasis(item)}估算，有效下降读数充足后改用实测`;
}

function thresholdHint(item: UserRoomSummary) {
  const value = formatKwh(item.usage.alert_threshold);
  const mode = item.alert_threshold_mode ?? "days";
  if (value === "--") {
    return "暂无提醒阈值";
  }
  if (mode === "fixed") {
    return `固定阈值：电量低于 ${value} 时提醒`;
  }
  if (mode === "average") {
    return `提醒阈值：低于 1 天用电量时提醒（${dailyUsageBasis(item)} = ${value}）`;
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

export function DashboardView({
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
  const primary = summaries.find((item) => item.binding_id === selectedBindingId) ?? selectPrimaryRoom(summaries);
  const lowCount = summaries.filter((item) => item.usage.is_low_power).length;
  const enabledCount = summaries.filter((item) => item.enabled).length;

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!primary) {
    return (
      <EmptyState
        title="还没有绑定宿舍"
        description="绑定宿舍后，这里会显示当前电量、预计剩余天数和最近电量曲线。"
        icon={<Building2 size={28} />}
        action={<Button onClick={onGoRooms}>去绑定宿舍</Button>}
      />
    );
  }

  const checking = checkingId === primary.binding_id;

  return (
    <div className="space-y-5">
      <section className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="power-summary-card power-summary-card-primary min-h-[148px]">
          <CardContent className="flex h-full items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">当前电量</div>
              <div className="mt-2 text-2xl font-semibold">{formatKwh(primary.usage.latest_balance)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(primary.usage.latest_read_at)}</div>
            </div>
            <BatteryCharging className="text-primary" size={28} />
          </CardContent>
        </Card>

        <Card className="power-summary-card min-h-[148px]">
          <CardContent className="flex h-full items-center justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">预计剩余</div>
              <div className="mt-2 text-2xl font-semibold">{formatDays(primary.usage.days_remaining)}</div>
              <div className="mt-1 max-w-[210px] text-xs leading-5 text-muted-foreground">{remainingHint(primary)}</div>
            </div>
            <Clock className="shrink-0 text-success" size={28} />
          </CardContent>
        </Card>

        <Card className="power-summary-card min-h-[148px]">
          <CardContent className="flex h-full items-center justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">日均用电</div>
              <div className="mt-2 text-2xl font-semibold">{formatKwhPerDay(primary.usage.average_daily_usage)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{usageAverageHint(primary)}</div>
              <div className="mt-1 max-w-[240px] text-xs leading-5 text-muted-foreground">{thresholdHint(primary)}</div>
            </div>
            <Zap className="shrink-0 text-warning" size={28} />
          </CardContent>
        </Card>

        <Card className="power-summary-card min-h-[148px]">
          <CardContent className="flex h-full items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">绑定宿舍</div>
              <div className="mt-2 text-2xl font-semibold">{enabledCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">{lowCount > 0 ? `${lowCount} 个低电量` : "运行正常"}</div>
            </div>
            <AlertTriangle className={lowCount > 0 ? "text-danger" : "text-muted-foreground"} size={28} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="dashboard-chart-card">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>
                {primary.room.building_name} {primary.room.room_number}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">每一次查询都会成为一个点，曲线按查询时间连接。</p>
            </div>
            <CooldownRefreshButton
              availableAt={primary.manual_check_available_at}
              checking={checking}
              className="w-full sm:w-auto"
              onClick={() => onCheckRoom(primary.binding_id)}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[220px_1fr] lg:items-end">
              <div>
                <Label htmlFor="chart-room">图表宿舍</Label>
                <Select
                  id="chart-room"
                  value={primary.binding_id}
                  onChange={(event) => onSelectBinding(Number(event.target.value))}
                >
                  {summaries.map((item) => (
                    <option key={item.binding_id} value={item.binding_id}>
                      {item.room.building_name} {item.room.room_number}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                {chartRangeItems.map((item) => (
                  <Button
                    key={item.key}
                    size="sm"
                    variant={chartRange.key === item.key ? "primary" : "secondary"}
                    onClick={() => onChangeChartRange({ ...chartRange, key: item.key })}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            {chartRange.key === "custom" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="chart-start">开始时间</Label>
                  <Input
                    id="chart-start"
                    type="datetime-local"
                    value={chartRange.startAt}
                    onChange={(event) => onChangeChartRange({ ...chartRange, startAt: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="chart-end">结束时间</Label>
                  <Input
                    id="chart-end"
                    type="datetime-local"
                    value={chartRange.endAt}
                    onChange={(event) => onChangeChartRange({ ...chartRange, endAt: event.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {chartLoading ? (
              <div aria-label="正在读取历史读数" className="min-h-[280px] space-y-4 py-3" role="status">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-[238px] w-full rounded-xl" />
                <span className="sr-only">正在读取历史读数</span>
              </div>
            ) : chartReadings.length > 0 ? (
              <PowerChart readings={chartReadings} averageDailyUsage={primary.usage.average_daily_usage} />
            ) : (
              <EmptyState
                title="暂无历史记录"
                description="换一个时间范围，或点击立即刷新后保存新的电量记录。"
                className="min-h-[280px]"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>宿舍状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaries.map((item) => (
              <div key={item.binding_id} className="status-room-card glass-tile rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {item.room.building_name} {item.room.room_number}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.usage.latest_read_at)}</div>
                  </div>
                  <Badge tone={item.usage.is_low_power ? "danger" : item.enabled ? "success" : "muted"}>
                    {item.usage.is_low_power ? "低电量" : item.enabled ? "启用" : "停用"}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-muted/55 px-2 py-2">
                    <div className="text-muted-foreground">余额</div>
                    <div className="mt-1 font-medium">{formatKwh(item.usage.latest_balance)}</div>
                  </div>
                  <div className="rounded-md bg-muted/55 px-2 py-2">
                    <div className="text-muted-foreground">剩余</div>
                    <div className="mt-1 font-medium">{formatDays(item.usage.days_remaining)}</div>
                    {item.usage.days_remaining_source === "default" ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">默认估算</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
