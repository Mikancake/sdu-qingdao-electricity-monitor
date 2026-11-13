import { useMemo, useState } from "react";
import { CheckCircle2, Download, Search, XCircle } from "lucide-react";

import type { CheckAttempt } from "../lib/types";
import { buildRecordsCsv, formatCheckSource } from "../lib/recordsCsv";
import { formatDateTime, formatKwh } from "../lib/utils";
import { EmptyState } from "./EmptyState";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Select } from "./ui/input";
import { ListSkeleton } from "./ui/skeleton";

interface RecordsViewProps {
  attempts: CheckAttempt[];
  loading: boolean;
}

type StatusFilter = "all" | "success" | "failed";


function downloadCsv(attempts: CheckAttempt[]) {
  const csv = buildRecordsCsv(attempts);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `用电查询记录-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function RecordsView({ attempts, loading }: RecordsViewProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredAttempts = useMemo(
    () =>
      attempts.filter((attempt) => {
        const matchesStatus =
          statusFilter === "all" || (statusFilter === "success" ? attempt.success : !attempt.success);
        if (!matchesStatus) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        const searchable = [
          attempt.room.building_name,
          attempt.room.room_number,
          formatCheckSource(attempt.source),
          attempt.error_kind,
          attempt.error_msg
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        return searchable.includes(normalizedQuery);
      }),
    [attempts, normalizedQuery, statusFilter]
  );
  const successCount = attempts.filter((attempt) => attempt.success).length;
  const failureCount = attempts.length - successCount;
  const isFiltered = Boolean(normalizedQuery) || statusFilter !== "all";

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
  }

  return (
    <div className="space-y-6">
      <header className="page-section-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">查询档案</p>
          <h1 id="records-heading" className="page-heading mt-2 text-3xl sm:text-4xl">每一次用电记录</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">查阅同步结果、定位失败原因，或导出所选记录。</p>
        </div>
        <Button className="self-start sm:self-auto" disabled={filteredAttempts.length === 0} onClick={() => downloadCsv(filteredAttempts)} variant="secondary">
          <Download size={16} /> 导出 CSV
        </Button>
      </header>
      <section aria-label="查询统计" className="records-stats-surface grid grid-cols-3 divide-x divide-border/60 rounded-2xl border">
        {[
          { label: "全部查询", count: attempts.length, color: "text-foreground" },
          { label: "查询成功", count: successCount, color: "text-success" },
          { label: "查询失败", count: failureCount, color: "text-danger" }
        ].map((item) => (
          <div key={item.label} className="min-w-0 px-4 py-5 sm:px-6">
            <p className="text-[11px] text-muted-foreground sm:text-xs">{item.label}</p>
            <p className={`metric-value mt-2 break-words ${item.color}`}>{item.count}</p>
          </div>
        ))}
      </section>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="space-y-4 border-b border-border bg-muted">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">记录明细</CardTitle>
            <span aria-live="polite" className="text-xs text-muted-foreground">{filteredAttempts.length} 条记录</span>
          </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <Input
              aria-label="搜索查询记录"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索宿舍、来源或失败原因"
              value={query}
            />
          </div>
          <Select
            aria-label="筛选查询状态"
            className="sm:w-32"
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            value={statusFilter}
          >
            <option value="all">全部状态</option>
            <option value="success">仅成功</option>
            <option value="failed">仅失败</option>
          </Select>
          {isFiltered ? (
            <Button aria-label="清除记录筛选" onClick={resetFilters} size="icon" title="清除筛选" variant="ghost">
              <XCircle size={16} />
            </Button>
          ) : null}
        </div>
        {isFiltered ? (
          <div aria-live="polite" className="text-xs text-muted-foreground">
            当前显示 {filteredAttempts.length} / {attempts.length} 条记录
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="pt-5">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : attempts.length === 0 ? (
          <EmptyState title="暂无查询记录" description="绑定宿舍并刷新电量后，这里会显示每次查询的结果。" />
        ) : filteredAttempts.length === 0 ? (
          <EmptyState
            title="没有匹配记录"
            description="换一个宿舍号、来源或状态筛选条件试试。"
            action={
              <Button onClick={resetFilters} size="sm" variant="secondary">
                清除筛选
              </Button>
            }
          />
        ) : (
          <div className="responsive-table-shell overflow-x-auto">
            <table aria-labelledby="records-heading" className="responsive-table w-full border-collapse text-sm">
              <thead className="border-b border-border bg-panel text-left text-[11px] text-muted-foreground">
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
                {filteredAttempts.map((attempt) => (
                  <tr key={attempt.id} className="border-t border-border transition-colors hover:bg-muted/40">
                    <td data-label="时间" className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(attempt.started_at)}</td>
                    <td data-label="宿舍" className="px-4 py-3">
                      <div className="break-words font-medium">
                        {attempt.room.building_name} {attempt.room.room_number}
                      </div>
                    </td>
                    <td data-label="来源" className="px-4 py-3 text-muted-foreground">{formatCheckSource(attempt.source)}</td>
                    <td data-label="电量" className="px-4 py-3 font-semibold tabular-nums">{attempt.success ? formatKwh(attempt.balance) : "--"}</td>
                    <td data-label="状态" className="px-4 py-3">
                      <Badge tone={attempt.success ? "success" : "danger"}>
                        {attempt.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {attempt.success ? "成功" : "失败"}
                      </Badge>
                    </td>
                    <td data-label="详情" className="max-w-[280px] break-words px-4 py-3 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
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
    </div>
  );
}
