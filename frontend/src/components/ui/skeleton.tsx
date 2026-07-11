import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("skeleton rounded-md", className)} {...props} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-label="正在加载" className="grid gap-3" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="rounded-xl border border-border/70 p-4">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="mt-3 h-3 w-4/5" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
      ))}
      <span className="sr-only">正在加载</span>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-label="正在读取电量数据" className="space-y-5" role="status">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="glass-card rounded-lg border border-border p-4 sm:p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-4 h-8 w-28" />
            <Skeleton className="mt-3 h-3 w-36" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="glass-card rounded-lg border border-border p-4 sm:p-5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-5 h-[250px] w-full rounded-xl" />
        </div>
        <div className="glass-card rounded-lg border border-border p-4 sm:p-5">
          <Skeleton className="h-5 w-24" />
          <ListSkeleton rows={3} />
        </div>
      </div>
      <span className="sr-only">正在读取电量数据</span>
    </div>
  );
}
