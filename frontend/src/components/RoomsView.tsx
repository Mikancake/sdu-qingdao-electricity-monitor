import { FormEvent, useEffect, useState } from "react";
import { Building2, Edit3, Loader2, Plus, RefreshCcw, Save, Trash2, X } from "lucide-react";

import type { Building, UserRoomBinding } from "../lib/types";
import { formatDateTime, formatKwh } from "../lib/utils";
import { EmptyState } from "./EmptyState";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Label, Select } from "./ui/input";

type RoomBindingPayload = {
  building_key?: string | null;
  building_name?: string | null;
  building_param?: string | null;
  campus?: string | null;
  campus_param?: string | null;
  room_number: string;
  alert_days: number;
  alert_threshold_mode?: "days" | "average" | "fixed";
  low_power_threshold?: string | null;
};

interface RoomsViewProps {
  buildings: Building[];
  bindings: UserRoomBinding[];
  loading: boolean;
  saving: boolean;
  updatingId?: number | null;
  checkingId?: number | null;
  manualCheckAvailableAtByBinding?: Record<number, string | null | undefined>;
  onBindRoom: (payload: RoomBindingPayload) => void;
  onUpdateRoom: (bindingId: number, payload: RoomBindingPayload) => void;
  onCheckRoom: (bindingId: number) => void;
  onToggleRoom: (binding: UserRoomBinding) => void;
  onDeleteRoom: (bindingId: number) => void;
}

const DEFAULT_BUILDING_KEY = "fenghuang_11_13";

function cooldownSecondsUntil(value?: string | null, now = Date.now()) {
  if (!value) {
    return 0;
  }
  return Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
}

function resolveBindingBuildingKey(buildings: Building[], binding: UserRoomBinding) {
  return binding.room.building_key ?? buildings.find((building) => building.param === binding.room.building_param)?.key ?? "";
}

export function RoomsView({
  buildings,
  bindings,
  loading,
  saving,
  updatingId,
  checkingId,
  manualCheckAvailableAtByBinding = {},
  onBindRoom,
  onUpdateRoom,
  onCheckRoom,
  onToggleRoom,
  onDeleteRoom
}: RoomsViewProps) {
  const [now, setNow] = useState(() => Date.now());
  const [editingBindingId, setEditingBindingId] = useState<number | null>(null);
  const [buildingKey, setBuildingKey] = useState(DEFAULT_BUILDING_KEY);
  const [roomNumber, setRoomNumber] = useState("");
  const [alertDays, setAlertDays] = useState(1);
  const [thresholdMode, setThresholdMode] = useState<"days" | "average" | "fixed">("days");
  const [threshold, setThreshold] = useState("");

  const editingBinding = bindings.find((binding) => binding.id === editingBindingId) ?? null;
  const isEditing = editingBinding !== null;
  const formSaving = saving || (editingBindingId !== null && updatingId === editingBindingId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (editingBindingId !== null && !bindings.some((binding) => binding.id === editingBindingId)) {
      resetForm();
    }
  }, [bindings, editingBindingId]);

  function resetForm() {
    setEditingBindingId(null);
    setBuildingKey(DEFAULT_BUILDING_KEY);
    setRoomNumber("");
    setAlertDays(1);
    setThresholdMode("days");
    setThreshold("");
  }

  function beginEdit(binding: UserRoomBinding) {
    setEditingBindingId(binding.id);
    setBuildingKey(resolveBindingBuildingKey(buildings, binding));
    setRoomNumber(binding.room.room_number);
    setAlertDays(binding.alert_days);
    setThresholdMode(binding.alert_threshold_mode ?? (binding.low_power_threshold ? "fixed" : "days"));
    setThreshold(binding.low_power_threshold ? String(binding.low_power_threshold) : "");
  }

  function buildPayload(): RoomBindingPayload {
    const payload: RoomBindingPayload = {
      room_number: roomNumber.trim(),
      alert_days: Math.max(1, Number(alertDays) || 1),
      alert_threshold_mode: thresholdMode,
      low_power_threshold: thresholdMode === "fixed" && threshold.trim() ? threshold.trim() : null
    };

    if (buildingKey) {
      payload.building_key = buildingKey;
      return payload;
    }

    if (editingBinding) {
      payload.campus = editingBinding.room.campus;
      payload.campus_param = editingBinding.room.campus_param;
      payload.building_name = editingBinding.room.building_name;
      payload.building_param = editingBinding.room.building_param;
    }
    return payload;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload();
    if (isEditing) {
      onUpdateRoom(editingBinding.id, payload);
      resetForm();
      return;
    }
    onBindRoom(payload);
    setRoomNumber("");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "编辑宿舍" : "绑定宿舍"}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {isEditing
              ? "修改宿舍楼、宿舍号和提醒阈值，保存时会重新查询一次电量。"
              : "选择宿舍楼并填写宿舍号，添加时会先查询一次电量，用来确认宿舍存在。"}
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="building">宿舍楼</Label>
              <Select id="building" value={buildingKey} onChange={(event) => setBuildingKey(event.target.value)}>
                {isEditing && !buildingKey ? <option value="">{editingBinding.room.building_name}</option> : null}
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
                placeholder="例如 X204 / R305"
                required
              />
            </div>
            <div className="grid gap-3">
              <div>
                <Label htmlFor="threshold-mode">提醒方式</Label>
                <Select
                  id="threshold-mode"
                  value={thresholdMode}
                  onChange={(event) => setThresholdMode(event.target.value as "days" | "average" | "fixed")}
                >
                  <option value="days">按可用天数提醒</option>
                  <option value="average">低于 1 天用电量提醒</option>
                  <option value="fixed">按固定电量提醒</option>
                </Select>
              </div>
              {thresholdMode === "days" ? (
                <div>
                  <Label htmlFor="days">低于多少天用电量时提醒</Label>
                  <Input
                    id="days"
                    type="number"
                    min={1}
                    max={30}
                    value={alertDays}
                    onChange={(event) => setAlertDays(Number(event.target.value))}
                  />
                  <div className="mt-1 text-xs text-muted-foreground">默认 1 天；有效下降读数不足时会先按默认 5 度/天估算。</div>
                </div>
              ) : null}
              {thresholdMode === "fixed" ? (
                <div>
                  <Label htmlFor="threshold">固定电量阈值</Label>
                  <Input
                    id="threshold"
                    type="number"
                    min={0}
                    step="0.1"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    placeholder="例如 10"
                  />
                  <div className="mt-1 text-xs text-muted-foreground">当前电量低于这个数值时发送提醒。</div>
                </div>
              ) : null}
              {thresholdMode === "average" ? (
                <div className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  电量低于 1 天用电量时提醒。有效下降读数不足时，会先按默认 5 度/天估算。
                </div>
              ) : null}
            </div>
            <Button className="w-full" disabled={formSaving || !roomNumber.trim()}>
              {formSaving ? <Loader2 className="animate-spin" size={16} /> : isEditing ? <Save size={16} /> : <Plus size={16} />}
              {isEditing ? "保存修改" : "添加宿舍"}
            </Button>
            {isEditing ? (
              <Button className="w-full" type="button" variant="secondary" onClick={resetForm}>
                <X size={16} />
                取消编辑
              </Button>
            ) : null}
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
              description="添加宿舍后，可以在这里启用提醒、手动刷新电量、编辑或删除绑定。"
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
                    const updating = updatingId === binding.id;

                    return (
                      <tr key={binding.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {binding.room.building_name} {binding.room.room_number}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {binding.alert_threshold_mode === "fixed" && binding.low_power_threshold
                            ? `低于 ${formatKwh(binding.low_power_threshold)}`
                            : binding.alert_threshold_mode === "average"
                              ? "低于 1 天用电量"
                              : `低于约 ${binding.alert_days} 天余量`}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={binding.enabled ? "success" : "muted"}>{binding.enabled ? "启用" : "停用"}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(binding.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button size="icon" variant="ghost" title="编辑宿舍" onClick={() => beginEdit(binding)}>
                              <Edit3 size={15} />
                            </Button>
                            <Button
                              size="icon"
                              variant="secondary"
                              title={cooldownSeconds > 0 ? `${cooldownSeconds}s 后可刷新` : "刷新电量"}
                              disabled={checking || cooldownSeconds > 0}
                              onClick={() => onCheckRoom(binding.id)}
                            >
                              {checking ? <Loader2 className="animate-spin" size={15} /> : <RefreshCcw size={15} />}
                            </Button>
                            <Button size="sm" variant="ghost" disabled={updating} onClick={() => onToggleRoom(binding)}>
                              {updating ? <Loader2 className="animate-spin" size={14} /> : null}
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
