import { memo, useId, useMemo } from "react";
import type { CSSProperties } from "react";

import type { AdminActivityPoint, AdminBuildingStat } from "../../lib/types";
import { formatDateTime, formatKwh } from "../../lib/utils";

interface TrendPoint {
  day: string;
  values: Record<string, number>;
}

interface TrendSeries {
  key: string;
  label: string;
  className: string;
}

const CHECK_TREND_SERIES: readonly TrendSeries[] = [
  { key: "checks_succeeded", label: "查询成功", className: "admin-trend-success" },
  { key: "checks_failed", label: "查询失败", className: "admin-trend-danger" }
];

const EMAIL_TREND_SERIES: readonly TrendSeries[] = [
  { key: "emails_sent", label: "发送成功", className: "admin-trend-primary" },
  { key: "emails_failed", label: "发送失败", className: "admin-trend-danger" }
];

const USER_TREND_SERIES: readonly TrendSeries[] = [
  { key: "total_users", label: "累计用户", className: "admin-trend-primary" },
  { key: "new_users", label: "当日新增", className: "admin-trend-warning" }
];

function compactDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : `${date.getMonth() + 1}/${date.getDate()}`;
}

function chartScale(maximum: number) {
  const step = Math.max(1, Math.ceil(maximum / 4));
  return { maximum: step * 4, step };
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;
    path += ` C ${current.x + (next.x - previous.x) / 6} ${current.y + (next.y - previous.y) / 6}, ${
      next.x - (afterNext.x - current.x) / 6
    } ${next.y - (afterNext.y - current.y) / 6}, ${next.x} ${next.y}`;
  }
  return path;
}

function TrendChart({
  title,
  description,
  points,
  series
}: {
  title: string;
  description: string;
  points: TrendPoint[];
  series: readonly TrendSeries[];
}) {
  const gradientId = useId().replace(/:/g, "");
  const width = 620;
  const height = 245;
  const padding = { top: 22, right: 18, bottom: 38, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximumValue = Math.max(1, ...points.flatMap((point) => series.map((item) => point.values[item.key] ?? 0)));
  const scale = chartScale(maximumValue);
  const xFor = (index: number) =>
    padding.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yFor = (value: number) => padding.top + plotHeight - (value / scale.maximum) * plotHeight;
  const plottedSeries = series.map((item) => ({
    ...item,
    points: points.map((point, index) => ({ x: xFor(index), y: yFor(point.values[item.key] ?? 0) }))
  }));
  const firstSeries = plottedSeries[0];
  const firstPath = firstSeries ? smoothPath(firstSeries.points) : "";
  const lastFirstSeriesPoint = firstSeries?.points[firstSeries.points.length - 1];
  const areaPath = firstSeries?.points.length
    ? `${firstPath} L ${lastFirstSeriesPoint?.x} ${padding.top + plotHeight} L ${firstSeries.points[0].x} ${
        padding.top + plotHeight
      } Z`
    : "";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <span className={`admin-chart-legend-dot ${item.className}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="admin-chart-frame">
        {points.length ? (
          <svg aria-label={title} className="admin-chart-canvas block h-auto w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((tick) => {
              const ratio = tick / 4;
              const y = padding.top + plotHeight * (1 - ratio);
              return (
                <g key={tick}>
                  <line className="admin-chart-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
                  <text className="admin-chart-axis-label" textAnchor="end" x={padding.left - 9} y={y + 4}>
                    {scale.step * tick}
                  </text>
                </g>
              );
            })}
            {areaPath ? <path className="admin-trend-area" d={areaPath} fill={`url(#${gradientId})`} /> : null}
            {plottedSeries.map((item, seriesIndex) => (
              <g
                key={item.key}
                className={`admin-trend-series ${item.className}`}
                style={{ "--admin-chart-delay": `${seriesIndex * 55 + 70}ms` } as CSSProperties}
              >
                <path className="admin-trend-line" d={smoothPath(item.points)} fill="none" />
                {item.points.map((point, index) => (
                  <circle key={points[index].day} className="admin-trend-dot" cx={point.x} cy={point.y} r={3.4}>
                    <title>{`${points[index].day} · ${item.label} ${points[index].values[item.key] ?? 0}`}</title>
                  </circle>
                ))}
              </g>
            ))}
            {points.map((point, index) => (
              <text
                key={point.day}
                className="admin-chart-axis-label"
                textAnchor="middle"
                x={xFor(index)}
                y={height - 14}
              >
                {compactDay(point.day)}
              </text>
            ))}
          </svg>
        ) : (
          <div className="admin-chart-empty">暂无趋势数据</div>
        )}
      </div>
    </div>
  );
}

function activityValues(points: AdminActivityPoint[], keys: readonly string[]): TrendPoint[] {
  return points.map((point) => ({
    day: point.day,
    values: Object.fromEntries(keys.map((key) => [key, Number(point[key as keyof AdminActivityPoint]) || 0]))
  }));
}

export const CheckTrendChart = memo(function CheckTrendChart({ points }: { points: AdminActivityPoint[] }) {
  const trendPoints = useMemo(() => activityValues(points, ["checks_succeeded", "checks_failed"]), [points]);
  return (
    <TrendChart
      title="宿舍查询趋势"
      description="最近 7 天的检查成功与失败次数"
      points={trendPoints}
      series={CHECK_TREND_SERIES}
    />
  );
});

export const EmailTrendChart = memo(function EmailTrendChart({ points }: { points: AdminActivityPoint[] }) {
  const trendPoints = useMemo(() => activityValues(points, ["emails_sent", "emails_failed"]), [points]);
  return (
    <TrendChart
      title="邮件投递趋势"
      description="最近 7 天由 SMTP 返回的发送结果"
      points={trendPoints}
      series={EMAIL_TREND_SERIES}
    />
  );
});

export const UserGrowthChart = memo(function UserGrowthChart({ points, totalUsers }: { points: AdminActivityPoint[]; totalUsers: number }) {
  const growthPoints = useMemo(() => {
    const newUserTotal = points.reduce((total, point) => total + point.new_users, 0);
    let cumulative = Math.max(0, totalUsers - newUserTotal);
    return points.map((point) => {
      cumulative += point.new_users;
      return { day: point.day, values: { total_users: cumulative, new_users: point.new_users } };
    });
  }, [points, totalUsers]);
  return (
    <TrendChart
      title="用户增长"
      description="累计注册用户与每日新增用户"
      points={growthPoints}
      series={USER_TREND_SERIES}
    />
  );
});

export const BuildingStatsChart = memo(function BuildingStatsChart({ buildings }: { buildings: AdminBuildingStat[] }) {
  const maximum = Math.max(1, ...buildings.flatMap((item) => [item.room_count, item.binding_count]));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">宿舍楼使用分布</div>
          <div className="mt-1 text-xs text-muted-foreground">显示每个宿舍楼的宿舍数、绑定数、用户数和最新电量覆盖情况</div>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="admin-chart-legend-dot admin-chart-bar-readings" />宿舍数</span>
          <span className="inline-flex items-center gap-1.5"><span className="admin-chart-legend-dot admin-chart-bar-emails" />绑定数</span>
        </div>
      </div>
      {buildings.length ? (
        <div className="admin-building-chart admin-chart-list scrollbar-thin">
          {buildings.map((item, index) => (
            <div key={`${item.campus}-${item.building_key ?? item.building_name}`} className="admin-building-row">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.building_name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {item.campus} · {item.user_count} 名用户 · {item.rooms_with_readings}/{item.room_count} 间有读数
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  <div>{item.room_count} 间宿舍 / {item.binding_count} 个绑定</div>
                  <div className="mt-1">
                    平均余额 {item.average_latest_balance == null ? "--" : formatKwh(item.average_latest_balance)}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                <div className="admin-building-track">
                  <span
                    className="admin-building-fill admin-building-fill-rooms"
                    style={{ "--admin-building-ratio": item.room_count / maximum, "--admin-building-delay": `${index * 35}ms` } as CSSProperties}
                  />
                </div>
                <div className="admin-building-track">
                  <span
                    className="admin-building-fill admin-building-fill-bindings"
                    style={{ "--admin-building-ratio": item.binding_count / maximum, "--admin-building-delay": `${index * 35 + 40}ms` } as CSSProperties}
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>启用绑定 {item.enabled_binding_count}/{item.binding_count}</span>
                <span>最近读数 {formatDateTime(item.latest_read_at)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-chart-empty">暂无宿舍楼数据</div>
      )}
    </div>
  );
});
