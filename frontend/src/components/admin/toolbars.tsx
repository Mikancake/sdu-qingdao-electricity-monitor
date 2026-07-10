import type { ReactNode } from "react";
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
    <label className="admin-toolbar-select">
      <span className="sr-only">{ariaLabel}</span>
      <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
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
    <div className="admin-toolbar mb-3">
      <div className="admin-toolbar-search">
        <Search aria-hidden="true" size={17} />
        <Input
          className="admin-toolbar-input"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
        />
      </div>
      <ToolbarSelect ariaLabel="排序方式" value={sort} onChange={onSortChange}>
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </ToolbarSelect>
    </div>
  );
}

export function LogToolbar({ filters, onChange }: { filters: LogFilters; onChange: (filters: LogFilters) => void }) {
  function patch(next: Partial<LogFilters>) {
    onChange({ ...filters, ...next });
  }

  return (
    <div className="admin-toolbar mb-3">
      <div className="admin-toolbar-search">
        <Search aria-hidden="true" size={17} />
        <Input
          className="admin-toolbar-input"
          value={filters.q}
          onChange={(event) => patch({ q: event.target.value })}
          placeholder="搜索名称、来源、邮箱或错误"
        />
      </div>
      <ToolbarSelect ariaLabel="日志时间范围" value={filters.days} onChange={(value) => patch({ days: Number(value) })}>
        <option value={1}>最近 1 天</option>
        <option value={7}>最近 7 天</option>
        <option value={30}>最近 30 天</option>
        <option value={90}>最近 90 天</option>
        <option value={365}>最近 365 天</option>
        <option value={0}>全部时间</option>
      </ToolbarSelect>
      <ToolbarSelect
        ariaLabel="日志排序方式"
        value={filters.sort}
        onChange={(value) => patch({ sort: value as SortDirection })}
      >
        <option value="desc">时间从新到旧</option>
        <option value="asc">时间从旧到新</option>
      </ToolbarSelect>
      <ToolbarSelect ariaLabel="日志显示条数" value={filters.limit} onChange={(value) => patch({ limit: Number(value) })}>
        <option value={100}>最多 100 条</option>
        <option value={200}>最多 200 条</option>
        <option value={500}>最多 500 条</option>
        <option value={1000}>最多 1000 条</option>
        <option value={0}>显示全部</option>
      </ToolbarSelect>
    </div>
  );
}
