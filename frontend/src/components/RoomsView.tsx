import { FormEvent, useEffect, useState } from "react";
import { Building2, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";

import type { Building, UserRoomBinding } from "../lib/types";
import { formatDateTime, formatKwh } from "../lib/utils";
import { EmptyState } from "./EmptyState";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Label, Select } from "./ui/input";

interface RoomsViewProps {
  buildings: Building[];
  bindings: UserRoomBinding[];
  loading: boolean;
  saving: boolean;
  checkingId?: number | null;
  manualCheckAvailableAtByBinding?: Record<number, string | null | undefined>;
  onBindRoom: (payload: {
    building_key: string;
    room_number: string;
    alert_days: number;
    low_power_threshold?: string | null;
  }) => void;
  onCheckRoom: (bindingId: number) => void;
  onToggleRoom: (binding: UserRoomBinding) => void;
  onDeleteRoom: (bindingId: number) => void;
}

function cooldownSecondsUntil(value?: string | null, now = Date.now()) {
  if (!value) {
    return 0;
  }
  return Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
}

export function RoomsView({
  buildings,
  bindings,
  loading,
  saving,
  checkingId,
  manualCheckAvailableAtByBinding = {},
  onBindRoom,
  onCheckRoom,
  onToggleRoom,
  onDeleteRoom
}: RoomsViewProps) {
  const [now, setNow] = useState(() => Date.now());
  const [buildingKey, setBuildingKey] = useState("fenghuang_11_13");
  const [roomNumber, setRoomNumber] = useState("");
  const [alertDays, setAlertDays] = useState(3);
  const [threshold, setThreshold] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    onBindRoom({
      building_key: buildingKey,
      room_number: roomNumber.trim(),
      alert_days: alertDays,
      low_power_threshold: threshold.trim() ? threshold.trim() : null
    });
    setRoomNumber("");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>绑定宿舍</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">选择宿舍楼并填写宿舍号，平台会自动匹配学校查询参数。</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="building">宿舍楼</Label>
              <Select id="building" value={buildingKey} onChange={(event) => setBuildingKey(event.target.value)}>
                {buildings.map((building) => (
                  <option key={building.key} value={building.key}>
                    {building.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="room">宿舍号</Label>
              <Input
                id="room"
                value={roomNumber}
                onChange={(event) => setRoomNumber(event.target.value)}
                placeholder="例如 213 / a219"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="days">提醒天数</Label>
                <Input
                  id="days"
                  type="number"
                  min={1}
                  max={30}
                  value={alertDays}
                  onChange={(event) => setAlertDays(Number(event.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="threshold">固定阈值</Label>
                <Input
                  id="threshold"
                  type="number"
                  min={0}
                  step="0.1"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                  placeholder="可选"
                />
              </div>
            </div>
            <Button className="w-full" disabled={saving || !roomNumber.trim()}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              添加宿舍
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已绑定宿舍</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={18} />
              正在读取宿舍
            </div>
          ) : bindings.length === 0 ? (
            <EmptyState
              title="暂无绑定"
              description="添加宿舍后，可以在这里启用提醒、手动刷新电量或删除绑定。"
              icon={<Building2 size={28} />}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">宿舍</th>
                    <th className="px-4 py-3 font-medium">提醒</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">创建时间</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {bindings.map((binding) => {
                    const cooldownSeconds = cooldownSecondsUntil(manualCheckAvailableAtByBinding[binding.id], now);
                    const checking = checkingId === binding.id;

                    return (
                    <tr key={binding.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {binding.room.building_name} {binding.room.room_number}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {binding.low_power_threshold ? formatKwh(binding.low_power_threshold) : `${binding.alert_days} 天余量`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={binding.enabled ? "success" : "muted"}>{binding.enabled ? "启用" : "停用"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(binding.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="secondary"
                            title={cooldownSeconds > 0 ? `${cooldownSeconds}s 后可刷新` : "刷新电量"}
                            disabled={checking || cooldownSeconds > 0}
                            onClick={() => onCheckRoom(binding.id)}
                          >
                            {checking ? <Loader2 className="animate-spin" size={15} /> : <RefreshCcw size={15} />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onToggleRoom(binding)}>
                            {binding.enabled ? "停用" : "启用"}
                          </Button>
                          <Button size="icon" variant="ghost" title="删除绑定" onClick={() => onDeleteRoom(binding.id)}>
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
