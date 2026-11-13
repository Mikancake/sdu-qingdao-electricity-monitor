import { FormEvent, useEffect, useState } from "react";
import { Building2, Edit3, Loader2, Plus, Save, Trash2, X } from "lucide-react";

import type { Building, UserRoomBinding } from "../lib/types";
import { formatDateTime, formatKwh } from "../lib/utils";
import { EmptyState } from "./EmptyState";
import { CooldownRefreshButton } from "./CooldownRefreshButton";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input, Label, Select } from "./ui/input";
import { ListSkeleton } from "./ui/skeleton";

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
    <div className="space-y-6">
      <header className="page-section-header">
        <p className="eyebrow">宿舍管理</p>
        <h1 className="page-heading mt-2 text-3xl sm:text-4xl">我的宿舍</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">每个房间，独立监测。管理绑定、手动查询与低电量提醒。</p>
      </header>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="min-w-0 xl:order-2">
        <CardHeader className="border-b border-border bg-muted">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-primary">
            {isEditing ? <Edit3 size={16} /> : <Plus size={16} />}
            <span>{isEditing ? "修改绑定" : "新建绑定"}</span>
          </div>
          <CardTitle className="text-lg">{isEditing ? "编辑宿舍信息" : "添加宿舍"}</CardTitle>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            {isEditing
              ? "修改宿舍楼、宿舍号和提醒阈值，保存时会重新查询一次电量。"
              : "选择宿舍楼并填写宿舍号，添加时会先查询一次电量，用来确认宿舍存在。"}
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <form className="space-y-5" onSubmit={submit}>
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
            <div className="grid gap-4 border-t border-border pt-5">
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

      <section aria-labelledby="bound-rooms-heading" className="min-w-0 xl:order-1">
        <div className="rooms-list-heading mb-4 flex items-center justify-between gap-3">
          <h2 id="bound-rooms-heading" className="text-base font-semibold">监测列表</h2>
          <Badge tone="muted">{bindings.length} 个已绑定</Badge>
        </div>
          {loading ? (
            <ListSkeleton rows={3} />
          ) : bindings.length === 0 ? (
            <EmptyState
              title="暂无绑定"
              description="添加宿舍后，可以在这里启用提醒、手动刷新电量、编辑或删除绑定。"
              icon={<Building2 size={28} />}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              {bindings.map((binding) => {
                const checking = checkingId === binding.id;
                const updating = updatingId === binding.id;

                return (
                  <Card key={binding.id} className={editingBindingId === binding.id ? "border-primary" : undefined}>
                    <CardContent>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-primary"><Building2 size={20} /></div>
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{binding.room.building_name}</p>
                            <h3 className="mt-1 break-words text-xl font-semibold">{binding.room.room_number}</h3>
                          </div>
                        </div>
                        <Badge tone={binding.enabled ? "success" : "muted"}>{binding.enabled ? "监测中" : "已停用"}</Badge>
                      </div>
                      <dl className="mt-5 grid gap-4 border-t border-border pt-4 text-xs sm:grid-cols-2">
                        <div className="space-y-2">
                          <dt className="text-muted-foreground">提醒条件</dt>
                          <dd className="font-medium">
                            {binding.alert_threshold_mode === "fixed" && binding.low_power_threshold
                              ? `低于 ${formatKwh(binding.low_power_threshold)}`
                              : binding.alert_threshold_mode === "average"
                                ? "低于 1 天用电量"
                                : `低于约 ${binding.alert_days} 天余量`}
                          </dd>
                        </div>
                        <div className="space-y-2">
                          <dt className="text-muted-foreground">绑定时间</dt>
                          <dd>{formatDateTime(binding.created_at)}</dd>
                        </div>
                      </dl>
                      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                        <CooldownRefreshButton
                          availableAt={manualCheckAvailableAtByBinding[binding.id]}
                          checking={checking}
                          compact
                          onClick={() => onCheckRoom(binding.id)}
                        />
                        <Button size="sm" variant="secondary" onClick={() => beginEdit(binding)}>
                          <Edit3 size={14} /> 编辑
                        </Button>
                        <Button size="sm" variant="ghost" disabled={updating} onClick={() => onToggleRoom(binding)}>
                          {updating ? <Loader2 className="animate-spin" size={14} /> : null}
                          {binding.enabled ? "停用" : "启用"}
                        </Button>
                        <Button className="ml-auto text-danger hover:text-danger" size="icon" variant="ghost" aria-label={`删除 ${binding.room.building_name} ${binding.room.room_number} 绑定`} title="删除绑定" onClick={() => onDeleteRoom(binding.id)}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
      </section>
      </div>
    </div>
  );
}
