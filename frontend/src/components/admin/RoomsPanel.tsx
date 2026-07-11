import type { AdminPageQuery, AdminRoom, AdminRoomPage } from "../../lib/types";
import { formatDateTime, formatKwh } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PaginationControls } from "../ui/pagination";
import { ListSkeleton } from "../ui/skeleton";
import { ListToolbar } from "./toolbars";
import { ChartSpline, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminRoomChart } from "./AdminRoomChart";

export function AdminRoomsPanel({
  pageData,
  query,
  onQueryChange,
  loading,
  deletingBindingId,
  onDeleteBinding
}: {
  pageData?: AdminRoomPage;
  query: AdminPageQuery;
  onQueryChange: (query: AdminPageQuery) => void;
  loading: boolean;
  deletingBindingId?: number | null;
  onDeleteBinding: (userId: number, bindingId: number) => void;
}) {
  const [roomSearch, setRoomSearch] = useState(query.q);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  function newestBindingAt(item: AdminRoom) {
    return item.bindings.reduce<string | null>((latest, binding) => {
      if (!latest || new Date(binding.created_at).getTime() > new Date(latest).getTime()) {
        return binding.created_at;
      }
      return latest;
    }, null);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (roomSearch === query.q) return;
      onQueryChange({ ...query, page: 1, q: roomSearch });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [onQueryChange, query, roomSearch]);

  const visibleRooms = pageData?.items ?? [];
  const selectedRoom = visibleRooms.find((item) => item.room.id === selectedRoomId) ?? null;

  useEffect(() => {
    if (selectedRoomId !== null && !visibleRooms.some((item) => item.room.id === selectedRoomId)) {
      setSelectedRoomId(null);
    }
  }, [selectedRoomId, visibleRooms]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>宿舍列表</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">按当前绑定关系统计宿舍，删除绑定后这里会同步减少。</p>
      </CardHeader>
      <CardContent>
        <ListToolbar
          search={roomSearch}
          onSearchChange={setRoomSearch}
          sort={query.sort}
          onSortChange={(sort) => onQueryChange({ ...query, page: 1, sort })}
          placeholder="搜索楼栋、房间、绑定邮箱"
          sortOptions={[
            { value: "newest_desc", label: "最近绑定从新到旧" },
            { value: "newest_asc", label: "最近绑定从旧到新" },
            { value: "building_asc", label: "宿舍名称 A-Z" },
            { value: "building_desc", label: "宿舍名称 Z-A" },
            { value: "bindings_desc", label: "绑定人数从多到少" },
            { value: "bindings_asc", label: "绑定人数从少到多" },
            { value: "balance_asc", label: "当前电量从低到高" },
            { value: "balance_desc", label: "当前电量从高到低" }
          ]}
        />
        {selectedRoom ? (
          <div className="mb-4">
            <AdminRoomChart room={selectedRoom} onClose={() => setSelectedRoomId(null)} />
          </div>
        ) : null}
        {loading ? (
          <ListSkeleton rows={5} />
        ) : visibleRooms.length === 0 && !query.q ? (
          <div className="flex h-44 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
            暂无宿舍绑定
          </div>
        ) : (
          <>
          <div className="responsive-table-shell rounded-lg border border-border">
            <table className="responsive-table w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">宿舍</th>
                  <th className="px-4 py-3 font-medium">当前电量</th>
                  <th className="px-4 py-3 font-medium">绑定详情</th>
                  <th className="px-4 py-3 font-medium">最近绑定</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRooms.length === 0 ? (
                  <tr>
                    <td className="responsive-table-empty px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      没有匹配的宿舍
                    </td>
                  </tr>
                ) : (
                  visibleRooms.map((item) => {
                    const newestBinding = newestBindingAt(item);
                    return (
                    <tr key={item.room.id} className="border-t border-border align-top">
                      <td data-label="宿舍" className="px-4 py-3">
                        <div className="font-medium">
                          {item.room.building_name} {item.room.room_number}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.room.campus}</div>
                      </td>
                      <td data-label="当前电量" className="whitespace-nowrap px-4 py-3">
                        <div className="font-medium tabular-nums">{formatKwh(item.latest_balance)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.latest_read_at)}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{item.reading_count ?? 0} 条读数</div>
                      </td>
                      <td data-label="绑定详情" className="min-w-[280px] px-4 py-3">
                        <div className="mb-2"><Badge tone="success">{item.binding_count} 个绑定</Badge></div>
                        <div className="space-y-2">
                          {item.bindings.map((binding) => (
                            <div key={binding.binding_id} className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-2">
                              <div className="break-all text-xs font-medium">
                                {binding.email}
                                {!binding.enabled ? <span className="ml-2 text-warning">停用</span> : null}
                              </div>
                              <div className="mt-1 break-all text-[11px] text-muted-foreground">
                                提醒：{binding.notification_email || binding.email}
                                <span className={binding.notification_email_verified ? "ml-2 text-success" : "ml-2"}>
                                  {binding.notification_email_verified ? "已验证" : "账号邮箱"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td data-label="最近绑定" className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(newestBinding)}</td>
                      <td data-label="操作" className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            size="sm"
                            variant={selectedRoomId === item.room.id ? "primary" : "secondary"}
                            onClick={() => setSelectedRoomId((current) => current === item.room.id ? null : item.room.id)}
                          >
                            <ChartSpline size={14} />
                            {selectedRoomId === item.room.id ? "收起曲线" : "查看曲线"}
                          </Button>
                          {item.bindings.map((binding) => (
                            <Button
                              key={binding.binding_id}
                              size="sm"
                              variant="ghost"
                              disabled={deletingBindingId === binding.binding_id}
                              onClick={() => onDeleteBinding(binding.user_id, binding.binding_id)}
                            >
                              {deletingBindingId === binding.binding_id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                              删除绑定
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={pageData?.page ?? query.page}
            pageSize={pageData?.page_size ?? query.page_size}
            total={pageData?.total ?? 0}
            totalPages={pageData?.total_pages ?? 1}
            onPageChange={(page) => onQueryChange({ ...query, page })}
            onPageSizeChange={(pageSize) => onQueryChange({ ...query, page: 1, page_size: pageSize })}
          />
          </>
        )}
      </CardContent>
    </Card>
  );
}
