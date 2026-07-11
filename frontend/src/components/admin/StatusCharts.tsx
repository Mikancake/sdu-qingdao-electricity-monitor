import { memo } from "react";
import type { CSSProperties } from "react";

import type { AdminActivityPoint } from "../../lib/types";

const series = [
  { key: "readings", label: "电量读数", className: "admin-chart-bar-readings" },
  { key: "emails_sent", label: "成功发信", className: "admin-chart-bar-emails" },
  { key: "new_users", label: "新增用户", className: "admin-chart-bar-users" }
] as const;

function compactDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function chartScale(maximum: number) {
  const step = Math.max(1, Math.ceil(maximum / 4));
  return { maximum: step * 4, step };
}

export const ActivityChart = memo(function ActivityChart({ points }: { points: AdminActivityPoint[] }) {
  const width = 760;
  const height = 248;
  const padding = { top: 18, right: 18, bottom: 38, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const rawMaximum = Math.max(1, ...points.flatMap((point) => series.map((item) => point[item.key])));
  const scale = chartScale(rawMaximum);
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(18, Math.max(8, (groupWidth - 20) / series.length));
  const totalReadings = points.reduce((total, point) => total + point.readings, 0);
  const totalEmails = points.reduce((total, point) => total + point.emails_sent, 0);
  const totalUsers = points.reduce((total, point) => total + point.new_users, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">近 7 天平台活动</div>
          <div className="mt-1 text-xs text-muted-foreground">每根柱子都来自数据库中的实际记录</div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
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
          <svg
            aria-label={`最近七天共记录 ${totalReadings} 次电量读数、发送 ${totalEmails} 封邮件、新增 ${totalUsers} 名用户`}
            className="admin-chart-canvas block h-auto w-full"
            role="img"
            viewBox={`0 0 ${width} ${height}`}
          >
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

          {points.map((point, pointIndex) => {
            const groupStart = padding.left + pointIndex * groupWidth + (groupWidth - barWidth * series.length) / 2;
            return (
              <g key={point.day}>
                <g
                  className="admin-chart-bar-group"
                  style={{ "--admin-chart-delay": `${pointIndex * 34}ms` } as CSSProperties}
                >
                  {series.map((item, seriesIndex) => {
                    const value = point[item.key];
                    const barHeight = value > 0 ? Math.max(3, (value / scale.maximum) * plotHeight) : 0;
                    const x = groupStart + seriesIndex * barWidth;
                    const y = padding.top + plotHeight - barHeight;
                    return (
                      <rect
                        key={item.key}
                        className={`admin-chart-bar ${item.className}`}
                        height={barHeight}
                        rx={Math.min(5, barWidth / 2)}
                        width={Math.max(4, barWidth - 3)}
                        x={x}
                        y={y}
                      >
                        <title>{`${point.day} · ${item.label} ${value}`}</title>
                      </rect>
                    );
                  })}
                </g>
                <text
                  className="admin-chart-axis-label"
                  textAnchor="middle"
                  x={padding.left + pointIndex * groupWidth + groupWidth / 2}
                  y={height - 14}
                >
                  {compactDay(point.day)}
                </text>
              </g>
            );
          })}
          </svg>
        ) : (
          <div className="admin-chart-empty">暂无活动数据</div>
        )}
      </div>
    </div>
  );
});

function safeRatio(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / total));
}

function HealthBar({
  label,
  detail,
  value,
  total,
  tone = "primary"
}: {
  label: string;
  detail: string;
  value: number;
  total: number;
  tone?: "primary" | "success" | "warning";
}) {
  const ratio = safeRatio(value, total);
  return (
    <div className="admin-health-item">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{detail}</span>
      </div>
      <div className="admin-health-track">
        <span
          className={`admin-health-fill admin-health-fill-${tone}`}
          style={{ "--admin-health-ratio": ratio } as CSSProperties}
        />
      </div>
    </div>
  );
}

export const HealthOverview = memo(function HealthOverview({
  verifiedUsers,
  totalUsers,
  enabledTokens,
  tokenCount,
  enabledSmtp,
  smtpCount,
  recentSentEmails,
  recentFailedEmails
}: {
  verifiedUsers: number;
  totalUsers: number;
  enabledTokens: number;
  tokenCount: number;
  enabledSmtp: number;
  smtpCount: number;
  recentSentEmails: number;
  recentFailedEmails: number;
}) {
  const recentEmailTotal = recentSentEmails + recentFailedEmails;
  return (
    <div>
      <div className="mb-5">
        <div className="text-sm font-semibold">运行健康度</div>
        <div className="mt-1 text-xs text-muted-foreground">账号、查询凭据与邮件服务的可用情况</div>
      </div>
      <div className="grid gap-5">
        <HealthBar detail={`${verifiedUsers}/${totalUsers}`} label="用户验证率" total={totalUsers} value={verifiedUsers} />
        <HealthBar detail={`${enabledTokens}/${tokenCount}`} label="可用 Token" tone="warning" total={tokenCount} value={enabledTokens} />
        <HealthBar detail={`${enabledSmtp}/${smtpCount}`} label="可用 SMTP" tone="success" total={smtpCount} value={enabledSmtp} />
        <HealthBar
          detail={recentEmailTotal ? `${Math.round((recentSentEmails / recentEmailTotal) * 100)}%` : "暂无数据"}
          label="24h 发信成功率"
          tone="success"
          total={recentEmailTotal}
          value={recentSentEmails}
        />
      </div>
    </div>
  );
});
