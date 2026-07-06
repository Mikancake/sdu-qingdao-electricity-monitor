import { useEffect, useState } from "react";
import { AlertTriangle, BatteryCharging, Building2, Clock, Loader2, RefreshCcw, Zap } from "lucide-react";

import type { Reading, UserRoomSummary } from "../lib/types";
import { formatDateTime, formatDays, formatKwh } from "../lib/utils";
import { EmptyState } from "./EmptyState";
import { PowerChart } from "./PowerChart";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Label, Select } from "./ui/input";

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

function cooldownSecondsUntil(value?: string | null, now = Date.now()) {
  if (!value) {
    return 0;
  }
  return Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
}

const chartRangeItems: Array<{ key: ChartRangeKey; label: string }> = [
  { key: "1d", label: "1天" },
  { key: "7d", label: "7天" },
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
  const [now, setNow] = useState(() => Date.now());
  const primary = summaries.find((item) => item.binding_id === selectedBindingId) ?? selectPrimaryRoom(summaries);
  const lowCount = summaries.filter((item) => item.usage.is_low_power).length;
  const enabledCount = summaries.filter((item) => item.enabled).length;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" size={18} />
        正在读取电量数据
      </div>
    );
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

  const cooldownSeconds = cooldownSecondsUntil(primary.manual_check_available_at, now);
  const checking = checkingId === primary.binding_id;
  const checkDisabled = checking || cooldownSeconds > 0;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">当前电量</div>
              <div className="mt-2 text-2xl font-semibold">{formatKwh(primary.usage.latest_balance)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(primary.usage.latest_read_at)}</div>
            </div>
            <BatteryCharging className="text-primary" size={28} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">预计剩余</div>
              <div className="mt-2 text-2xl font-semibold">{formatDays(primary.usage.days_remaining)}</div>
              <div className="mt-1 text-xs text-muted-foreground">基于最近用电估算</div>
            </div>
            <Clock className="text-success" size={28} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">日均用电</div>
              <div className="mt-2 text-2xl font-semibold">{formatKwh(primary.usage.average_daily_usage)}</div>
              <div className="mt-1 text-xs text-muted-foreground">阈值 {formatKwh(primary.usage.alert_threshold)}</div>
            </div>
            <Zap className="text-warning" size={28} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between">
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{primary.room.building_name} {primary.room.room_number}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">按查询时间点连接的电量变化</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={checkDisabled}
              onClick={() => onCheckRoom(primary.binding_id)}
              title={cooldownSeconds > 0 ? "手动同步有 5 分钟冷却" : "立即同步一次当前电量"}
            >
              {checking ? <Loader2 className="animate-spin" size={15} /> : <RefreshCcw size={15} />}
              {cooldownSeconds > 0 ? `${cooldownSeconds}s 后可刷新` : "立即刷新"}
            </Button>
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
              <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" size={18} />
                正在读取历史读数
              </div>
            ) : chartReadings.length > 0 ? (
              <PowerChart readings={chartReadings} />
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
              <div key={item.binding_id} className="rounded-lg border border-border p-3">
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
                  <div className="rounded-md bg-muted px-2 py-2">
                    <div className="text-muted-foreground">余额</div>
                    <div className="mt-1 font-medium">{formatKwh(item.usage.latest_balance)}</div>
                  </div>
                  <div className="rounded-md bg-muted px-2 py-2">
                    <div className="text-muted-foreground">剩余</div>
                    <div className="mt-1 font-medium">{formatDays(item.usage.days_remaining)}</div>
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
