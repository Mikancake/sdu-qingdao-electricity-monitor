import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "./button";

export function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const safeTotalPages = Math.max(1, totalPages);
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-muted-foreground">
        共 <span className="font-medium tabular-nums text-foreground">{total}</span> 条，第 {page}/{safeTotalPages} 页
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          每页
          <select
            aria-label="每页条数"
            className="glass-control app-input-motion h-11 rounded-md border border-border/75 bg-panel/70 px-2 text-xs outline-none md:h-8"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 20, 30, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <Button aria-label="上一页" disabled={page <= 1} size="icon" variant="secondary" onClick={() => onPageChange(page - 1)}>
            <ChevronLeft size={16} />
          </Button>
          <Button
            aria-label="下一页"
            disabled={page >= safeTotalPages}
            size="icon"
            variant="secondary"
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
