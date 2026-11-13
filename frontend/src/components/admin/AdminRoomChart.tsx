import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, Receipt, X } from "lucide-react";

import { createApiClient } from "../../lib/api";
import type { AdminRoom } from "../../lib/types";
import { formatDateTime, formatKwh } from "../../lib/utils";
import { EmptyState } from "../EmptyState";
import { PowerChart } from "../PowerChart";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { ADMIN_TOKEN_KEY } from "./utils";

type RoomChartRange = "1d" | "7d" | "30d" | "all";

const ranges: Array<{ key: RoomChartRange; label: string }> = [
  { key: "1d", label: "1 天" },
  { key: "7d", label: "7 天" },
  { key: "30d", label: "近一月" },
  { key: "all", label: "全部" }
];

function rangeParams(range: RoomChartRange) {
  if (range === "1d") return { days: 1, limit: 5000 };
  if (range === "7d") return { days: 7, limit: 5000 };
  if (range === "30d") return { days: 30, limit: 5000 };
  return { limit: 5000 };
}

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

export function AdminRoomChart({ room, onClose }: { room: AdminRoom; onClose: () => void }) {
  const [range, setRange] = useState<RoomChartRange>("7d");
  const api = useMemo(() => createApiClient(window.localStorage.getItem(ADMIN_TOKEN_KEY)), []);
  const readingsQuery = useQuery({
    queryKey: ["admin-room-readings", room.room.id, range],
    queryFn: () => api.listAdminRoomReadings(room.room.id, rangeParams(range)),
    staleTime: 60_000
  });

  return (
    <Card className="admin-room-chart-card admin-dashboard-enter">
      <CardHeader className="relative pr-14">
        <div>
          <CardTitle>{room.room.building_name} {room.room.room_number} · 电量曲线</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            当前 {formatKwh(room.latest_balance)} · 数据更新 {formatDateTime(room.latest_provider_updated_at ?? room.latest_read_at)} · 共 {room.reading_count ?? 0} 条记录
          </p>
        </div>
        <Button
          aria-label="关闭宿舍曲线"
          className="absolute right-3 top-3"
          size="icon"
          variant="ghost"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {ranges.map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant={range === item.key ? "primary" : "secondary"}
              onClick={() => setRange(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {readingsQuery.isLoading ? (
          <div className="space-y-3 py-3" role="status" aria-label="正在读取宿舍电量曲线">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-[280px] w-full rounded-xl" />
          </div>
        ) : readingsQuery.isError ? (
          <EmptyState className="min-h-[260px]" title="曲线读取失败" description="请稍后重试，或检查后端服务日志。" />
        ) : readingsQuery.data?.length ? (
          <PowerChart readings={readingsQuery.data} recharges={room.recent_recharges} />
        ) : (
          <EmptyState className="min-h-[260px]" title="暂无电量记录" description="该时间范围内还没有保存的电量读数。" />
        )}
        {room.room.provider === "hwgl" ? (
          <div className="border border-border/70 bg-primary/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CircleDollarSign className="text-primary" size={16} />电量构成</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              {[["免费", formatKwh(room.latest_free_electricity)], ["付费", formatKwh(room.latest_paid_electricity)], ["欠费", formatKwh(room.latest_arrears_electricity)], ["电价", formatPrice(room.latest_electricity_price)]].map(([label, value]) => <div key={label} className="border-b border-border/50 pb-1"><div className="text-muted-foreground">{label}</div><div className="mt-1 font-medium tabular-nums">{value}</div></div>)}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">上游日用电：{formatKwh(room.latest_reported_daily_usage)} · 记录日期：{room.latest_reported_usage_date || "--"} · 余额折算：{formatMoney(room.latest_estimated_amount)}</div>
            <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-2 text-xs"><Receipt className="text-success" size={14}/>最近充值：{room.recent_recharges?.length ? room.recent_recharges.slice(0, 2).map((item) => formatMoney(item.amount)).join(" · ") : "暂无充值记录"}</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
