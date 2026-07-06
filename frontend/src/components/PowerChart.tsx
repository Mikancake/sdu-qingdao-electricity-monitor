import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Reading } from "../lib/types";
import { formatDateTime } from "../lib/utils";

interface PowerChartProps {
  readings: Reading[];
}

interface ChartPoint {
  time: string;
  timestamp: number;
  label: string;
  balance: number;
}

interface TimePeriod {
  start: number;
  end: number;
  tick: number;
  label: string;
}

function formatClock(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatMonthDay(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

function formatPeriodLabel(start: number, end: number, totalSpan: number) {
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  if (totalSpan <= 36 * 60 * 60 * 1000 && sameDay) {
    return `${formatClock(start)}-${formatClock(end)}`;
  }
  if (totalSpan <= 36 * 60 * 60 * 1000) {
    return `${formatMonthDay(start)} ${formatClock(start)}-${formatMonthDay(end)} ${formatClock(end)}`;
  }
  return `${formatMonthDay(start)}-${formatMonthDay(end)}`;
}

function buildTimePeriods(start: number, end: number, pointCount: number): TimePeriod[] {
  const safeStart = Number.isFinite(start) ? start : Date.now() - 60 * 60 * 1000;
  const safeEnd = Number.isFinite(end) ? end : Date.now();
  const paddedEnd = safeEnd > safeStart ? safeEnd : safeStart + 60 * 60 * 1000;
  const totalSpan = paddedEnd - safeStart;
  const segmentCount = Math.max(1, Math.min(pointCount <= 6 ? 3 : 4, pointCount - 1 || 1));
  const segmentSize = totalSpan / segmentCount;

  return Array.from({ length: segmentCount }, (_, index) => {
    const periodStart = safeStart + segmentSize * index;
    const periodEnd = index === segmentCount - 1 ? paddedEnd : safeStart + segmentSize * (index + 1);
    return {
      start: periodStart,
      end: periodEnd,
      tick: Math.round((periodStart + periodEnd) / 2),
      label: formatPeriodLabel(periodStart, periodEnd, totalSpan)
    };
  });
}

export function PowerChart({ readings }: PowerChartProps) {
  const data: ChartPoint[] = [...readings]
    .sort((first, second) => new Date(first.read_at).getTime() - new Date(second.read_at).getTime())
    .map((item) => ({
      time: item.read_at,
      timestamp: new Date(item.read_at).getTime(),
      label: formatDateTime(item.read_at),
      balance: Number(item.balance)
    }));
  const firstTimestamp = data[0]?.timestamp ?? Date.now() - 60 * 60 * 1000;
  const lastTimestamp = data[data.length - 1]?.timestamp ?? Date.now();
  const domainEnd = lastTimestamp > firstTimestamp ? lastTimestamp : firstTimestamp + 60 * 60 * 1000;
  const periods = buildTimePeriods(firstTimestamp, domainEnd, data.length);
  const periodLabels = new Map(periods.map((period) => [period.tick, period.label]));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={[firstTimestamp, domainEnd]}
            ticks={periods.map((period) => period.tick)}
            tickFormatter={(value) => periodLabels.get(Number(value)) ?? formatDateTime(new Date(Number(value)).toISOString())}
            height={38}
            interval={0}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <YAxis
            width={42}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              background: "hsl(var(--panel))",
              color: "hsl(var(--foreground))"
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            labelFormatter={(value) => formatDateTime(new Date(Number(value)).toISOString())}
            formatter={(value) => [`${Number(value).toFixed(2)} 度`, "电量"]}
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "4 4" }}
          />
          <Line
            type="monotone"
            dataKey="balance"
            name="电量"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            dot={{ r: 3.5, strokeWidth: 2, fill: "hsl(var(--panel))" }}
            activeDot={{ r: 6, strokeWidth: 2, fill: "hsl(var(--primary))" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
