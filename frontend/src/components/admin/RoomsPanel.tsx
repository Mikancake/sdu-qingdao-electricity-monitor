import { AdminRoom } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ListToolbar } from "./toolbars";
import { compareDate, compareNumber, compareText, matchesSearch } from "./utils";
import { Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

export function AdminRoomsPanel({
  rooms,
  loading,
  deletingBindingId,
  onDeleteBinding
}: {
  rooms: AdminRoom[];
  loading: boolean;
  deletingBindingId?: number | null;
  onDeleteBinding: (userId: number, bindingId: number) => void;
}) {
  const [roomSearch, setRoomSearch] = useState("");
  const [roomSort, setRoomSort] = useState("newest_desc");

  function newestBindingAt(item: AdminRoom) {
    return item.bindings.reduce<string | null>((latest, binding) => {
      if (!latest || new Date(binding.created_at).getTime() > new Date(latest).getTime()) {
        return binding.created_at;
      }
      return latest;
    }, null);
  }

  const visibleRooms = useMemo(() => {
    return [...rooms]
      .filter((item) =>
        matchesSearch(roomSearch, [
          item.room.id,
          item.room.campus,
          item.room.building_name,
          item.room.room_number,
          item.binding_count,
          ...item.bindings.flatMap((binding) => [
            binding.email,
            binding.notification_email,
            binding.enabled ? "启用" : "停用",
            binding.notification_email_verified ? "已验证" : "未验证"
          ])
        ])
      )
      .sort((a, b) => {
        if (roomSort === "building_asc") {
          return compareText(`${a.room.building_name} ${a.room.room_number}`, `${b.room.building_name} ${b.room.room_number}`, "asc");
        }
        if (roomSort === "building_desc") {
          return compareText(`${a.room.building_name} ${a.room.room_number}`, `${b.room.building_name} ${b.room.room_number}`, "desc");
        }
        if (roomSort === "bindings_desc") return compareNumber(a.binding_count, b.binding_count, "desc");
        if (roomSort === "bindings_asc") return compareNumber(a.binding_count, b.binding_count, "asc");
        if (roomSort === "newest_asc") return compareDate(newestBindingAt(a), newestBindingAt(b), "asc");
        return compareDate(newestBindingAt(a), newestBindingAt(b), "desc");
      });
  }, [rooms, roomSearch, roomSort]);

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
          sort={roomSort}
          onSortChange={setRoomSort}
          placeholder="搜索楼栋、房间、绑定邮箱"
          sortOptions={[
            { value: "newest_desc", label: "最近绑定从新到旧" },
            { value: "newest_asc", label: "最近绑定从旧到新" },
            { value: "building_asc", label: "宿舍名称 A-Z" },
            { value: "building_desc", label: "宿舍名称 Z-A" },
            { value: "bindings_desc", label: "绑定人数从多到少" },
            { value: "bindings_asc", label: "绑定人数从少到多" }
          ]}
        />
        {loading ? (
          <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 animate-spin" size={18} />
            正在读取宿舍
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex h-44 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
            暂无宿舍绑定
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">宿舍</th>
                  <th className="px-4 py-3 font-medium">绑定人数</th>
                  <th className="px-4 py-3 font-medium">绑定账号邮箱</th>
                  <th className="px-4 py-3 font-medium">提醒邮箱</th>
                  <th className="px-4 py-3 font-medium">最近绑定</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRooms.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                      没有匹配的宿舍
                    </td>
                  </tr>
                ) : (
                  visibleRooms.map((item) => {
                    const newestBinding = newestBindingAt(item);
                    return (
                    <tr key={item.room.id} className="border-t border-border align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {item.room.building_name} {item.room.room_number}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.room.campus}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="success">{item.binding_count}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {item.bindings.map((binding) => (
                            <div key={binding.binding_id} className="break-all text-muted-foreground">
                              {binding.email}
                              {!binding.enabled ? <span className="ml-2 text-xs text-warning">停用</span> : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {item.bindings.map((binding) => (
                            <div key={binding.binding_id} className="break-all text-muted-foreground">
                              {binding.notification_email || binding.email}
                              <span className={binding.notification_email_verified ? "ml-2 text-xs text-success" : "ml-2 text-xs text-muted-foreground"}>
                                {binding.notification_email_verified ? "已验证" : "账号邮箱"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(newestBinding)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1">
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
        )}
      </CardContent>
    </Card>
  );
}
