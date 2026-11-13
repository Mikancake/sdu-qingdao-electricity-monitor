import { memo, useEffect, useMemo, useRef, useState } from "react";
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
  label: string;
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
const MAX_RENDERED_POINTS = 900;

function formatClock(timestamp: number) {
  return clockFormatter.format(new Date(timestamp));
}

function formatMonthDay(timestamp: number) {
  return dayFormatter.format(new Date(timestamp));
}

function formatPeriodLabel(start: number, end: number, totalSpan: number) {
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  if (totalSpan <= 36 * 60 * 60 * 1000 && sameDay) {
    return `${formatClock(start)}–${formatClock(end)}`;
  }
  if (totalSpan <= 36 * 60 * 60 * 1000) {
    return `${formatMonthDay(start)} ${formatClock(start)}–${formatClock(end)}`;
  }
  return `${formatMonthDay(start)}–${formatMonthDay(end)}`;
}

function buildTimePeriods(start: number, end: number, pointCount: number, compact: boolean): TimePeriod[] {
  const totalSpan = Math.max(60 * 60 * 1000, end - start);
  const maximumSegments = compact ? 2 : 4;
  const segmentCount = Math.max(1, Math.min(pointCount <= 6 ? 3 : maximumSegments, pointCount - 1 || 1));
  const segmentSize = totalSpan / segmentCount;
  return Array.from({ length: segmentCount }, (_, index) => {
    const periodStart = start + segmentSize * index;
    const periodEnd = index === segmentCount - 1 ? end : start + segmentSize * (index + 1);
    return {
      tick: (periodStart + periodEnd) / 2,
      label: formatPeriodLabel(periodStart, periodEnd, totalSpan)
    };
  });
}

function smoothPath(points: PositionedPoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;
    const controlOneX = current.x + (next.x - previous.x) / 6;
    const controlOneY = current.y + (next.y - previous.y) / 6;
    const controlTwoX = next.x - (afterNext.x - current.x) / 6;
    const controlTwoY = next.y - (afterNext.y - current.y) / 6;
    path += ` C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${next.y}`;
  }
  return path;
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

function PowerChartComponent({ readings, averageDailyUsage, recharges = [] }: PowerChartProps) {
  const compact = useCompactChart();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 760;
  const height = compact ? 238 : 280;
  const padding = { top: 20, right: compact ? 12 : 22, bottom: 42, left: compact ? 38 : 48 };

  const data = useMemo<ChartPoint[]>(() => {
    const sorted = readings
      .map((item) => ({
        timestamp: new Date(item.provider_updated_at ?? item.read_at).getTime(),
        label: formatDateTime(item.provider_updated_at ?? item.read_at),
        balance: Number(item.balance),
        reportedDailyUsage: item.reported_daily_usage ? Number(item.reported_daily_usage) : null,
        powerStatus: item.power_status,
        provider: item.provider
      }))
      .filter((item) => Number.isFinite(item.timestamp) && Number.isFinite(item.balance))
      .sort((first, second) => first.timestamp - second.timestamp);
    // One HWGL source update may be fetched more than once. Keep one chart point for
    // that real upstream timestamp instead of drawing overlapping artificial points.
    const unique = Array.from(new Map(sorted.map((item) => [`${item.provider ?? "unknown"}:${item.timestamp}`, item])).values());
    return unique.map((item, index) => ({
      ...item,
      charging: index > 0 && item.balance - unique[index - 1].balance > 0.05
    }));
  }, [readings]);

  const chart = useMemo(() => {
    const firstTimestamp = data[0]?.timestamp ?? Date.now() - 60 * 60 * 1000;
    const lastTimestamp = data[data.length - 1]?.timestamp ?? Date.now();
    const domainEnd = lastTimestamp > firstTimestamp ? lastTimestamp : firstTimestamp + 60 * 60 * 1000;
    const totalSpan = domainEnd - firstTimestamp;
    const average = Number(averageDailyUsage);
    const showAverage = Number.isFinite(average) && average > 0 && totalSpan <= 45 * 24 * 60 * 60 * 1000;
    const trendStart = data[0]?.balance ?? 0;
    const trendEnd = Math.max(0, trendStart - (average * totalSpan) / (24 * 60 * 60 * 1000));
    const values = data.map((point) => point.balance);
    if (showAverage) values.push(trendStart, trendEnd);
    const rawMinimum = Math.min(...values, 0);
    const rawMaximum = Math.max(...values, 1);
    const valuePadding = Math.max(0.5, (rawMaximum - rawMinimum) * 0.1);
    const minimum = Math.max(0, rawMinimum - valuePadding);
    const maximum = rawMaximum + valuePadding;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xFor = (timestamp: number) => padding.left + ((timestamp - firstTimestamp) / totalSpan) * plotWidth;
    const yFor = (balance: number) => padding.top + ((maximum - balance) / (maximum - minimum)) * plotHeight;
    const points = data.map<PositionedPoint>((point) => ({ ...point, x: xFor(point.timestamp), y: yFor(point.balance) }));
    const renderedPoints = reducePositionedPoints(points);
    const path = smoothPath(renderedPoints);
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
        timestamp: new Date(recharge.paid_at ?? recharge.fetched_at).getTime(),
        amount: recharge.amount ? Number(recharge.amount) : null
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
  }, [averageDailyUsage, compact, data, height, padding.bottom, padding.left, padding.right, padding.top, recharges]);

  const selectFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!data.length || !containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const viewBoxX = ((event.clientX - bounds.left) / bounds.width) * width;
    const plotX = Math.min(width - padding.right, Math.max(padding.left, viewBoxX));
    const ratio = (plotX - padding.left) / chart.plotWidth;
    const timestamp = chart.firstTimestamp + ratio * (chart.domainEnd - chart.firstTimestamp);
    const index = nearestPointIndex(data, timestamp);
    setActiveIndex((current) => (current === index ? current : index));
  };

  const activePoint = activeIndex === null ? null : chart.points[activeIndex];
  const yTicks = Array.from({ length: compact ? 4 : 5 }, (_, index) => index / (compact ? 3 : 4));

  return (
    <div
      ref={containerRef}
      className="power-chart relative w-full touch-pan-y select-none rounded-sm border border-border bg-muted/20 p-3"
      onPointerDown={selectFromPointer}
      onPointerMove={selectFromPointer}
      onPointerLeave={() => setActiveIndex(null)}
    >
      <svg
        aria-label={`电量变化曲线，共 ${data.length} 个真实读数${chart.showAverage ? "，包含日均用电趋势参考线" : ""}`}
        className="block h-auto w-full"
        role="img"
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
            textAnchor="middle"
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

      {activePoint ? (
        <div
          aria-live="polite"
          className="power-chart-tooltip"
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            top: `${(activePoint.y / height) * 100}%`,
            transform: activePoint.x > width * 0.72 ? "translate(-100%, -112%)" : "translate(10px, -112%)"
          }}
        >
          <div className="font-semibold tabular-nums">{activePoint.balance.toFixed(2)} 度</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {activePoint.provider === "hwgl" ? "数据更新于 " : "查询于 "}{activePoint.label}
          </div>
          {activePoint.reportedDailyUsage && activePoint.reportedDailyUsage > 0 ? (
            <div className="mt-1 text-[11px] text-muted-foreground">
              上游日用电 {activePoint.reportedDailyUsage.toFixed(2)} 度
            </div>
          ) : null}
          {activePoint.powerStatus ? <div className="mt-1 text-[11px] text-muted-foreground">{activePoint.powerStatus}</div> : null}
          {activePoint.charging ? <div className="mt-1 text-[11px] text-success">余额上升，可能发生充值</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export const PowerChart = memo(PowerChartComponent);
