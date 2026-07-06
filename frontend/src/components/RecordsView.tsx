import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { CheckAttempt } from "../lib/types";
import { formatDateTime, formatKwh } from "../lib/utils";
import { EmptyState } from "./EmptyState";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface RecordsViewProps {
  attempts: CheckAttempt[];
  loading: boolean;
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    user: "手动",
    worker: "自动",
    admin: "管理",
    cli: "命令行"
  };
  return labels[source] ?? source;
}

export function RecordsView({ attempts, loading }: RecordsViewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>查询记录</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">每次向学校接口查询都会写入一条记录，包括失败原因。</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 animate-spin" size={18} />
            正在读取查询记录
          </div>
        ) : attempts.length === 0 ? (
          <EmptyState title="暂无查询记录" description="绑定宿舍并刷新电量后，这里会显示每次查询的结果。" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">宿舍</th>
                  <th className="px-4 py-3 font-medium">来源</th>
                  <th className="px-4 py-3 font-medium">电量</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">详情</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => (
                  <tr key={attempt.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(attempt.started_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {attempt.room.building_name} {attempt.room.room_number}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{sourceLabel(attempt.source)}</td>
                    <td className="px-4 py-3">{attempt.success ? formatKwh(attempt.balance) : "--"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={attempt.success ? "success" : "danger"}>
                        {attempt.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {attempt.success ? "成功" : "失败"}
                      </Badge>
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-muted-foreground">
                      {attempt.success ? "已保存读数" : attempt.error_msg ?? attempt.error_kind ?? "未知错误"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
