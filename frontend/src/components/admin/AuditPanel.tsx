import { AdminAuditLog } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { LogToolbar } from "./toolbars";
import { LogFilters } from "./utils";
import { ListSkeleton } from "../ui/skeleton";

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
          <ListSkeleton rows={5} />
        ) : (
          <div className="responsive-table-shell rounded-lg border border-border">
            <table className="responsive-table w-full border-collapse text-sm">
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
                    <td className="responsive-table-empty px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                      暂无审计日志
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                  <tr key={log.id} className="border-t border-border">
                    <td data-label="时间" className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(log.created_at)}</td>
                    <td data-label="动作" className="px-4 py-3 font-medium">{log.action}</td>
                    <td data-label="目标" className="px-4 py-3 text-muted-foreground">
                      {log.target_type} {log.target_id ?? ""}
                    </td>
                    <td data-label="详情" className="max-w-[420px] truncate px-4 py-3 text-muted-foreground">{log.detail ?? "--"}</td>
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
