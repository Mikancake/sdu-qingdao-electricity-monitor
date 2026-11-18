import { memo, useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { ElectricityRecharge, Reading } from "../lib/types";
import { formatDateTime } from "../lib/utils";

interface PowerChartProps {
  readings: Reading[];
  averageDailyUsage?: string | number | null;
  recharges?: ElectricityRecharge[];
}

interface ChartPoint {
  timestamp: number;
  time: string;
  providerTime: boolean;
  usageDate?: string | null;
  balance: number;
  charging: boolean;
  reportedDailyUsage?: number | null;
  powerStatus?: string | null;
  provider?: string;
}

interface PositionedPoint extends ChartPoint {
  x: number;
  y: number;
}

interface TimePeriod {
  tick: number;
  label: string;
}

interface RechargeMarker {
  id: number;
  timestamp: number;
  amount?: number | null;
}

const clockFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" });
const fullDayFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
const MAX_RENDERED_POINTS = 900;
const NO_RECHARGES: ElectricityRecharge[] = [];

function finiteNumber(value?: string | number | null) {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}


function formatTick(tick: number, start: number, end: number) {
  if (start === end) return formatDateTime(new Date(tick).toISOString());
  const first = new Date(start), last = new Date(end);
  if (first.getFullYear() !== last.getFullYear()) return fullDayFormatter.format(tick);
  if (first.toDateString() === last.toDateString()) return clockFormatter.format(tick);
  if (end - start <= 36 * 3600000) return `${dayFormatter.format(tick)} ${clockFormatter.format(tick)}`;
  return dayFormatter.format(tick);
}

function buildTimePeriods(start: number, end: number, pointCount: number, compact: boolean): TimePeriod[] {
  const count = Math.min(compact ? 2 : 4, start === end ? 1 : pointCount);
  return Array.from({ length: count }, (_, index) => {
    const tick = start + (end - start) * index / Math.max(1, count - 1);
    return { tick, label: formatTick(tick, start, end) };
  });
}


// Preserve the first/last point and both vertical extrema in every screen-space bucket.
// The full data set remains available in `chart.points` for exact hover selection.
function reducePositionedPoints(points: PositionedPoint[], maximum = MAX_RENDERED_POINTS) {
  if (points.length <= maximum) return points;

  const first = points[0];
  const last = points[points.length - 1];
  const span = Math.max(1, last.x - first.x);
  const bucketCount = Math.max(1, Math.floor((maximum - 2) / 2));
  const buckets = Array.from({ length: bucketCount }, () => ({
    minimum: null as PositionedPoint | null,
    maximum: null as PositionedPoint | null
  }));

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const bucketIndex = Math.min(bucketCount - 1, Math.floor(((point.x - first.x) / span) * bucketCount));
    const bucket = buckets[bucketIndex];
    if (!bucket.minimum || point.y < bucket.minimum.y) bucket.minimum = point;
    if (!bucket.maximum || point.y > bucket.maximum.y) bucket.maximum = point;
  }

  const reduced = [first];
  for (const bucket of buckets) {
    if (!bucket.minimum && !bucket.maximum) continue;
    if (bucket.minimum === bucket.maximum || !bucket.maximum) {
      reduced.push(bucket.minimum as PositionedPoint);
      continue;
    }
    if (!bucket.minimum) {
      reduced.push(bucket.maximum);
      continue;
    }
    if (bucket.minimum.timestamp < bucket.maximum.timestamp) {
      reduced.push(bucket.minimum, bucket.maximum);
    } else {
      reduced.push(bucket.maximum, bucket.minimum);
    }
  }
  reduced.push(last);
  return reduced;
}

function dotsPath(points: PositionedPoint[], radius: number) {
  const diameter = radius * 2;
  return points
    .map(
      (point) =>
        `M ${point.x - radius} ${point.y} a ${radius} ${radius} 0 1 0 ${diameter} 0 a ${radius} ${radius} 0 1 0 ${-diameter} 0`
    )
    .join(" ");
}

function nearestPointIndex(points: ChartPoint[], timestamp: number) {
  let left = 0;
  let right = points.length - 1;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (points[middle].timestamp < timestamp) left = middle + 1;
    else right = middle;
  }
  if (left === 0) return 0;
  const before = points[left - 1];
  const after = points[left];
  return timestamp - before.timestamp <= after.timestamp - timestamp ? left - 1 : left;
}

function useCompactChart() {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

function PowerChartComponent({ readings, averageDailyUsage, recharges = NO_RECHARGES }: PowerChartProps) {
  const compact = useCompactChart();
  const [selection, setSelection] = useState<{ readings: Reading[]; index: number } | null>(null);
  const activeIndex = selection?.readings === readings ? selection.index : null;
  const width = compact ? 380 : 760;
  const height = compact ? 238 : 280;
  const padding = { top: 20, right: compact ? 12 : 22, bottom: 42, left: compact ? 38 : 48 };

  const data = useMemo<ChartPoint[]>(() => {
    const sorted = readings.flatMap((item) => {
      const time = item.provider_updated_at ?? item.read_at;
      const timestamp = Date.parse(time);
      const balance = finiteNumber(item.balance);
      if (!Number.isFinite(timestamp) || balance == null) return [];
      return [{
        time, timestamp, balance,
        readAt: Date.parse(item.read_at), id: item.id,
        providerTime: item.provider_updated_at != null,
        usageDate: item.reported_usage_date,
        reportedDailyUsage: finiteNumber(item.reported_daily_usage),
        powerStatus: item.power_status, provider: item.provider
      }];
    }).sort((a, b) => a.timestamp - b.timestamp || a.readAt - b.readAt || a.id - b.id);
    // One HWGL source update may be fetched more than once. Keep one chart point for
    // that real upstream timestamp instead of drawing overlapping artificial points.
    const unique = Array.from(new Map(sorted.map((item) => [`${item.provider ?? "unknown"}:${item.timestamp}`, item])).values());
    return unique.map((item, index) => ({
      ...item,
      charging: index > 0 && item.provider === unique[index - 1].provider && Math.round(item.balance * 100) - Math.round(unique[index - 1].balance * 100) > 5
    }));
  }, [readings]);

  const chart = useMemo(() => {
    const firstTimestamp = data[0]?.timestamp ?? 0;
    const domainEnd = data[data.length - 1]?.timestamp ?? firstTimestamp;
    const totalSpan = domainEnd - firstTimestamp;
    const average = Number(averageDailyUsage);
    const showAverage = Number.isFinite(average) && average > 0 && totalSpan > 0 && totalSpan <= 45 * 24 * 60 * 60 * 1000 && data[0].balance >= 0;
    const trendStart = data[0]?.balance ?? 0;
    const trendEnd = Math.max(0, trendStart - (average * totalSpan) / (24 * 60 * 60 * 1000));
    const rawMinimum = data.reduce((min, point) => Math.min(min, point.balance), 0);
    const rawMaximum = data.reduce((max, point) => Math.max(max, point.balance), 1);
    const valuePadding = Math.max(0.5, (rawMaximum - rawMinimum) * 0.1);
    const minimum = rawMinimum < 0 ? rawMinimum - valuePadding : 0;
    const maximum = rawMaximum + valuePadding;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xFor = (timestamp: number) => padding.left + (totalSpan ? (timestamp - firstTimestamp) / totalSpan : 0.5) * plotWidth;
    const yFor = (balance: number) => padding.top + ((maximum - balance) / (maximum - minimum)) * plotHeight;
    const points = data.map<PositionedPoint>((point) => ({ ...point, x: xFor(point.timestamp), y: yFor(point.balance) }));
    const renderedPoints = reducePositionedPoints(points);
    const path = renderedPoints.map((p, index) => `${index ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
    const baseline = padding.top + plotHeight;
    const lastPoint = renderedPoints[renderedPoints.length - 1];
    const areaPath = renderedPoints.length
      ? `${path} L ${lastPoint.x} ${baseline} L ${renderedPoints[0].x} ${baseline} Z`
      : "";
    const regularPoints = renderedPoints.filter((point) => !point.charging);
    const chargingPoints = renderedPoints.filter((point) => point.charging);
    const rechargeMarkers: RechargeMarker[] = recharges
      .map((recharge) => ({
        id: recharge.id,
        timestamp: Date.parse(recharge.paid_at ?? ""),
        amount: finiteNumber(recharge.amount)
      }))
      .filter((marker) => Number.isFinite(marker.timestamp) && marker.timestamp >= firstTimestamp && marker.timestamp <= domainEnd);
    return {
      firstTimestamp,
      domainEnd,
      minimum,
      maximum,
      plotWidth,
      plotHeight,
      baseline,
      xFor,
      yFor,
      points,
      path,
      areaPath,
      regularDotsPath: dotsPath(regularPoints, compact ? 2.4 : 2.7),
      chargingDotsPath: dotsPath(chargingPoints, compact ? 3.3 : 3.7),
      rechargeMarkers,
      periods: buildTimePeriods(firstTimestamp, domainEnd, data.length, compact),
      showAverage,
      trendStart,
      trendEnd
    };
  }, [averageDailyUsage, compact, data, height, width, padding.bottom, padding.left, padding.right, padding.top, recharges]);

  const selectIndex = (index: number) => {
    setSelection((current) => current?.readings === readings && current.index === index ? current : { readings, index });
  };
  const selectFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const viewBoxX = ((event.clientX - bounds.left) / bounds.width) * width;
    const plotX = Math.min(width - padding.right, Math.max(padding.left, viewBoxX));
    const ratio = (plotX - padding.left) / chart.plotWidth;
    const timestamp = chart.firstTimestamp + ratio * (chart.domainEnd - chart.firstTimestamp);
    const index = nearestPointIndex(data, timestamp);
    selectIndex(index);
  };

  const activePoint = activeIndex === null ? null : chart.points[activeIndex];
  const yTicks = Array.from({ length: compact ? 4 : 5 }, (_, index) => index / (compact ? 3 : 4));
  if (!data.length) return <p role="status" className="py-12 text-center text-sm text-muted-foreground">暂无有效的电量读数。</p>;
  const selected = activePoint ?? chart.points[0];
  function describePoint(point: ChartPoint) {
    return [
      `${point.providerTime ? "数据更新于" : "查询于"} ${formatDateTime(point.time)}`,
      `${point.balance.toFixed(2)} 度`,
      point.usageDate && `用电日期 ${point.usageDate}`,
      point.reportedDailyUsage != null && `上游日用电 ${point.reportedDailyUsage.toFixed(2)} 度`,
      point.powerStatus,
      point.charging && "余额上升，可能发生充值"
    ].filter(Boolean).join(" · ");
  }

  return (
    <div className="power-chart w-full rounded-sm border border-border bg-muted/20 p-3">
      <svg
        className="block h-auto w-full touch-pan-y select-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        role="slider" tabIndex={0}
        aria-label={`电量走势，共 ${data.length} 个读数${chart.showAverage ? "，含日均趋势参考线" : ""}，方向键逐条查看`}
        aria-valuemin={1} aria-valuemax={data.length} aria-valuenow={(activeIndex ?? 0) + 1}
        aria-valuetext={describePoint(selected)}
        onFocus={() => selectIndex(activeIndex ?? 0)}
        onBlur={() => setSelection(null)}
        onKeyDown={(event) => {
          const current = activeIndex ?? 0;
          switch (event.key) {
            case "ArrowLeft": case "ArrowDown": selectIndex(Math.max(0, current - 1)); break;
            case "ArrowRight": case "ArrowUp": selectIndex(Math.min(data.length - 1, current + 1)); break;
            case "Home": selectIndex(0); break;
            case "End": selectIndex(data.length - 1); break;
            case "Escape": setSelection(null); break;
            default: return;
          }
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          selectFromPointer(event);
        }}
        onPointerMove={selectFromPointer}
        onPointerCancel={() => setSelection(null)}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") setSelection(null); }}
        viewBox={`0 0 ${width} ${height}`}
      >

        {yTicks.map((ratio) => {
          const y = padding.top + chart.plotHeight * (1 - ratio);
          const value = chart.minimum + (chart.maximum - chart.minimum) * ratio;
          return (
            <g key={ratio}>
              <line className="power-chart-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="power-chart-axis" textAnchor="end" x={padding.left - 8} y={y + 4}>{value.toFixed(value >= 10 ? 0 : 1)}</text>
            </g>
          );
        })}

        {chart.periods.map((period) => (
          <text
            key={period.tick}
            className="power-chart-axis"
            textAnchor={chart.periods.length === 1 ? "middle" : period.tick === chart.firstTimestamp ? "start" : period.tick === chart.domainEnd ? "end" : "middle"}
            x={chart.xFor(period.tick)}
            y={height - 13}
          >
            {period.label}
          </text>
        ))}

        {chart.areaPath ? <path className="power-chart-area" d={chart.areaPath} fill="hsl(var(--primary) / 0.12)" /> : null}
        {chart.showAverage ? (
          <g className="power-chart-average">
            <line
              x1={chart.xFor(chart.firstTimestamp)}
              x2={chart.xFor(chart.domainEnd)}
              y1={chart.yFor(chart.trendStart)}
              y2={chart.yFor(chart.trendEnd)}
            />
            {!compact ? <text x={width - padding.right} y={chart.yFor(chart.trendEnd) - 7} textAnchor="end">日均趋势参考</text> : null}
          </g>
        ) : null}
        {chart.rechargeMarkers.map((marker) => {
          const x = chart.xFor(marker.timestamp);
          return (
            <g key={marker.id} className="power-chart-recharge">
              <title>{marker.amount != null ? `充值 ¥${marker.amount.toFixed(2)}` : "充值记录"}</title>
              <line x1={x} x2={x} y1={padding.top} y2={chart.baseline} />
              <circle cx={x} cy={padding.top + 5} r={3.5} />
            </g>
          );
        })}
        {chart.path ? <path className="power-chart-line" d={chart.path} fill="none" /> : null}
        {chart.regularDotsPath ? <path className="power-chart-dots" d={chart.regularDotsPath} /> : null}
        {chart.chargingDotsPath ? (
          <path className="power-chart-dots power-chart-dots-charge" d={chart.chargingDotsPath} />
        ) : null}

        {activePoint ? (
          <circle
            className={activePoint.charging ? "power-chart-active-dot power-chart-active-dot-charge" : "power-chart-active-dot"}
            cx={activePoint.x}
            cy={activePoint.y}
            r={6}
          />
        ) : null}

        {activePoint ? (
          <line className="power-chart-crosshair" x1={activePoint.x} x2={activePoint.x} y1={padding.top} y2={chart.baseline} />
        ) : null}
      </svg>
      <div className="mt-2 min-h-[2.5rem] text-xs leading-5 text-muted-foreground">
        {activePoint ? describePoint(activePoint) : (
          <>{formatDateTime(data[0].time)}{data.length > 1 && ` 至 ${formatDateTime(data[data.length - 1].time)}`} · 点击曲线或使用方向键查看读数，Home / End 跳至首尾。</>
        )}
      </div>
    </div>
  );
}

export const PowerChart = memo(PowerChartComponent);
