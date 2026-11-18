import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";

import { Input } from "../ui/input";
import type { LogFilters, SortDirection } from "./utils";


function ToolbarSelect({
  ariaLabel,
  value,
  onChange,
  children
}: {
  ariaLabel: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-panel px-3 py-1.5 text-muted-foreground transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
      <span className="sr-only">{ariaLabel}</span>
      <select className="min-w-0 flex-1 appearance-none bg-transparent text-sm text-foreground outline-none [&>option]:bg-panel" aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={16} />
    </label>
  );
}

export function ListToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  sortOptions,
  placeholder
}: {
  search: string;
  onSearchChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
  sortOptions: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-muted/25 p-3 sm:flex-row">
      <div className="flex min-w-0 flex-1 items-center rounded-lg border border-border bg-panel px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <Search aria-hidden="true" className="shrink-0 text-muted-foreground" size={17} />
        <Input aria-label={placeholder} className="h-10 min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder} />
      </div>
      <ToolbarSelect ariaLabel="排序方式" value={sort} onChange={onSortChange}>
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </ToolbarSelect>
    </div>
  );
}

export function LogToolbar({ filters, onChange }: { filters: LogFilters; onChange: (filters: LogFilters) => void }) {
  const [search, setSearch] = useState(filters.q);
  useEffect(() => {
    if (search === filters.q) return;
    const timer = window.setTimeout(() => onChange({ ...filters, q: search }), 300);
    return () => window.clearTimeout(timer);
  }, [filters, onChange, search]);
  function patch(next: Partial<LogFilters>) {
    onChange({ ...filters, q: search, ...next });
  }

  return (
    <div className="mb-5 flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-muted/25 p-3 sm:flex-row sm:flex-wrap">
      <div className="flex min-w-0 flex-[2] items-center rounded-lg border border-border bg-panel px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <Search aria-hidden="true" className="shrink-0 text-muted-foreground" size={17} />
        <Input aria-label="搜索日志" className="h-10 min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、来源、邮箱或错误" />
      </div>
      <ToolbarSelect ariaLabel="日志时间范围" value={filters.days} onChange={(value) => patch({ days: Number(value) })}>
        <option value={1}>最近 1 天</option><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option><option value={90}>最近 90 天</option><option value={365}>最近 365 天</option><option value={0}>全部时间</option>
      </ToolbarSelect>
      <ToolbarSelect ariaLabel="日志排序方式" value={filters.sort} onChange={(value) => patch({ sort: value as SortDirection })}>
        <option value="desc">时间从新到旧</option><option value="asc">时间从旧到新</option>
      </ToolbarSelect>
      <ToolbarSelect ariaLabel="日志显示条数" value={filters.limit} onChange={(value) => patch({ limit: Number(value) })}>
        <option value={100}>最多 100 条</option><option value={200}>最多 200 条</option><option value={500}>最多 500 条</option><option value={1000}>最多 1000 条</option><option value={0}>显示全部</option>
      </ToolbarSelect>
    </div>
  );
}
