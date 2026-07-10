import { AdminAuditLog } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { LogToolbar } from "./toolbars";
import { LogFilters } from "./utils";
import { Loader2 } from "lucide-react";

export function AuditPanel({
  logs,
  loading,
  filters,
  onFiltersChange
}: {
  logs: AdminAuditLog[];
  loading: boolean;
  filters: LogFilters;
  onFiltersChange: (filters: LogFilters) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>审计日志</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">记录管理员最近的配置修改操作。</p>
      </CardHeader>
      <CardContent>
        <LogToolbar filters={filters} onChange={onFiltersChange} />
        {loading ? (
          <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 animate-spin" size={18} />
            正在读取审计日志
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">动作</th>
                  <th className="px-4 py-3 font-medium">目标</th>
                  <th className="px-4 py-3 font-medium">详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                      暂无审计日志
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                  <tr key={log.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-3 font-medium">{log.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.target_type} {log.target_id ?? ""}
                    </td>
                    <td className="max-w-[420px] truncate px-4 py-3 text-muted-foreground">{log.detail ?? "--"}</td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
