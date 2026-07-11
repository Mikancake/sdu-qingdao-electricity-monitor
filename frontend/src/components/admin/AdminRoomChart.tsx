import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

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
            当前 {formatKwh(room.latest_balance)} · 最近读数 {formatDateTime(room.latest_read_at)} · 共 {room.reading_count ?? 0} 条记录
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
          <PowerChart readings={readingsQuery.data} />
        ) : (
          <EmptyState className="min-h-[260px]" title="暂无电量记录" description="该时间范围内还没有保存的电量读数。" />
        )}
      </CardContent>
    </Card>
  );
}
