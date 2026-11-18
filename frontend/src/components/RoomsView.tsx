import { type FormEvent, useEffect, useRef, useState } from "react";
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
  room_number: string;
  alert_days: number;
  alert_threshold_mode?: "days" | "average" | "fixed";
  low_power_threshold?: string | null;
};

interface RoomsViewProps {
  buildings: Building[];
  bindings: UserRoomBinding[];
  loading: boolean;
  bindingsError?: boolean;
  buildingsError?: boolean;
  deletingId?: number | null;
  saving: boolean;
  updatingId?: number | null;
  checkingId?: number | null;
  manualCheckAvailableAtByBinding?: Record<number, string | null | undefined>;
  onBindRoom: (payload: RoomBindingPayload, onSuccess?: () => void) => void;
  onUpdateRoom: (bindingId: number, payload: Partial<RoomBindingPayload>, onSuccess?: () => void) => void;
  onCheckRoom: (bindingId: number) => void;
  onToggleRoom: (binding: UserRoomBinding) => void;
  onDeleteRoom: (bindingId: number) => void;
}

function resolveBindingBuildingKey(buildings: Building[], binding: UserRoomBinding) {
  return buildings.find((building) => building.key === binding.room.building_key || building.param === binding.room.building_param)?.key ?? "";
}

export function RoomsView({
  buildings,
  bindings,
  loading,
  bindingsError = false,
  buildingsError = false,
  deletingId,
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
  const [buildingKey, setBuildingKey] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [alertDays, setAlertDays] = useState("1");
  const [thresholdMode, setThresholdMode] = useState<"days" | "average" | "fixed">("days");
  const [threshold, setThreshold] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);

  const editingBinding = bindings.find((binding) => binding.id === editingBindingId) ?? null;
  const isEditing = editingBinding !== null;
  const formSaving = saving || (editingBindingId !== null && updatingId === editingBindingId);
  const formLocked = formSaving || updatingId != null || deletingId != null || (isEditing && checkingId === editingBindingId);
  const selectedBuilding = buildings.find((building) => building.key === buildingKey);
  const originalBuildingUnavailable = isEditing && !resolveBindingBuildingKey(buildings, editingBinding);
  const keepOriginalBuilding = buildingKey === "" && originalBuildingUnavailable;
  const canSubmit = !formLocked && (Boolean(selectedBuilding) || keepOriginalBuilding) && Boolean(roomNumber.trim());

  useEffect(() => {
    if (!loading && !bindingsError && editingBindingId !== null && !bindings.some((binding) => binding.id === editingBindingId)) {
      resetForm();
    }
  }, [bindings, editingBindingId, loading, bindingsError]);

  function resetForm() {
    setEditingBindingId(null);
    setBuildingKey("");
    setRoomNumber("");
    setAlertDays("1");
    setThresholdMode("days");
    setThreshold("");
  }

  function cancelEdit() {
    resetForm();
    editTrigger.current?.focus();
  }

  function beginEdit(binding: UserRoomBinding, trigger: HTMLButtonElement) {
    editTrigger.current = trigger;
    setEditingBindingId(binding.id);
    setBuildingKey(resolveBindingBuildingKey(buildings, binding));
    setRoomNumber(binding.room.room_number);
    setAlertDays(String(binding.alert_days));
    setThresholdMode(binding.alert_threshold_mode ?? (binding.low_power_threshold != null ? "fixed" : "days"));
    setThreshold(binding.low_power_threshold ?? "");
    formRef.current?.querySelector<HTMLInputElement>("#room")?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || (editingBindingId !== null && !editingBinding)) return;
    const number = roomNumber.trim();
    const strategy = {
      alert_days: thresholdMode === "days" ? Number(alertDays) : editingBinding?.alert_days ?? 1,
      alert_threshold_mode: thresholdMode,
      low_power_threshold: thresholdMode === "fixed" ? threshold : null
    };
    if (editingBinding) {
      const payload: Partial<RoomBindingPayload> = strategy;
      if (number.toLowerCase() !== editingBinding.room.room_number.trim().toLowerCase()) payload.room_number = number;
      if (selectedBuilding && buildingKey !== resolveBindingBuildingKey(buildings, editingBinding)) payload.building_key = buildingKey;
      onUpdateRoom(editingBinding.id, payload, resetForm);
    } else if (selectedBuilding) {
      onBindRoom({ ...strategy, building_key: buildingKey, room_number: number }, () => setRoomNumber(""));
    }
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
              ? "仅修改提醒不占校验次数；更换宿舍楼或宿舍号时，将查询一次电量确认位置。"
              : "选择宿舍楼并填写宿舍号，首次绑定时会查询一次电量。"}
            新绑定和位置变更共用每账号每小时 10 次校验额度。
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <form ref={formRef} aria-label={isEditing ? "编辑宿舍" : "添加宿舍"} aria-busy={formSaving} onSubmit={submit}
            onKeyDown={(event) => {
              if (event.key === "Escape" && isEditing && !formSaving && !event.nativeEvent.isComposing) {
                event.preventDefault();
                cancelEdit();
              }
            }}>
            <fieldset className="min-w-0 space-y-5" disabled={formLocked}>
            <div>
              <Label htmlFor="building">宿舍楼</Label>
              <Select id="building" value={selectedBuilding?.key ?? ""} required={!keepOriginalBuilding}
                disabled={!buildings.length} aria-describedby={buildingsError ? "buildings-error" : undefined}
                onChange={(event) => setBuildingKey(event.target.value)}>
                <option value="" disabled={!originalBuildingUnavailable}>{originalBuildingUnavailable
                  ? `${editingBinding.room.building_name}（当前绑定）`
                  : buildings.length ? "请选择宿舍楼" : loading ? "正在读取宿舍楼…" : "暂无可选宿舍楼"}</option>
                {buildings.map((building) => (
                  <option key={building.key} value={building.key}>
                    {building.name}
                  </option>
                ))}
              </Select>
              {buildingsError && <p id="buildings-error" role="status" className="mt-1 text-xs text-danger">宿舍楼列表读取失败，请刷新重试。</p>}
            </div>
            <div>
              <Label htmlFor="room">宿舍号</Label>
              <Input
                id="room"
                value={roomNumber}
                onChange={(event) => setRoomNumber(event.target.value)}
                maxLength={40}
                aria-describedby="room-hint"
                placeholder="输入完整宿舍号"
                required
              />
              <p id="room-hint" className="mt-1 text-xs text-muted-foreground">按电量查询系统中的宿舍号填写，保留字母前缀和前导零。</p>
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
                    required
                    aria-describedby="days-hint"
                    onChange={(event) => setAlertDays(event.target.value)}
                  />
                  <p id="days-hint" className="mt-1 text-xs text-muted-foreground">填写 1–30 的整数。读数不足时使用平台默认日用电量估算。</p>
                </div>
              ) : null}
              {thresholdMode === "fixed" ? (
                <div>
                  <Label htmlFor="threshold">固定电量阈值</Label>
                  <Input
                    id="threshold"
                    type="number"
                    min={0}
                    max={100000}
                    step="0.01"
                    required
                    aria-describedby="threshold-hint"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    placeholder="例如 10"
                  />
                  <p id="threshold-hint" className="mt-1 text-xs text-muted-foreground">填写 0–100000 度，最多两位小数。电量低于此值时提醒。</p>
                </div>
              ) : null}
              {thresholdMode === "average" ? (
                <div className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  电量低于 1 天用电量时提醒。读数不足时使用平台默认日用电量估算。
                </div>
              ) : null}
            </div>
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {formSaving ? <Loader2 className="animate-spin" size={16} /> : isEditing ? <Save size={16} /> : <Plus size={16} />}
              {isEditing ? "保存修改" : "添加宿舍"}
            </Button>
            {isEditing ? (
              <Button className="w-full" type="button" variant="secondary" onClick={cancelEdit}>
                <X size={16} />
                取消编辑
              </Button>
            ) : null}
            </fieldset>
          </form>
        </CardContent>
      </Card>

      <section aria-labelledby="bound-rooms-heading" className="min-w-0 xl:order-1">
        <div className="rooms-list-heading mb-4 flex items-center justify-between gap-3">
          <h2 id="bound-rooms-heading" className="text-base font-semibold">监测列表</h2>
          {(!loading && !bindingsError || bindings.length > 0) && <Badge tone="muted">{bindings.length} 个已绑定</Badge>}
        </div>
          {bindingsError && <p role="status" className="mb-4 text-sm text-danger">绑定列表读取失败，请刷新重试。{bindings.length > 0 && "以下为上次读取的数据。"}</p>}
          {loading && !bindings.length ? (
            <ListSkeleton rows={3} />
          ) : bindingsError && !bindings.length ? null : bindings.length === 0 ? (
            <EmptyState
              title="暂无绑定"
              description="先选择宿舍楼并填写宿舍号。绑定成功后，就能在这里查询电量、启停提醒或编辑宿舍。"
              action={buildings.length > 0 && <Button variant="secondary" onClick={() => formRef.current?.querySelector<HTMLSelectElement>("#building")?.focus()}>添加第一个宿舍</Button>}
              icon={<Building2 size={28} />}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              {bindings.map((binding) => {
                const checking = checkingId === binding.id;
                const updating = updatingId === binding.id;
                const deleting = deletingId === binding.id;
                const roomName = `${binding.room.building_name} ${binding.room.room_number}`;

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
                            {(binding.alert_threshold_mode === "fixed" || binding.alert_threshold_mode == null) && binding.low_power_threshold != null
                              ? `低于 ${formatKwh(binding.low_power_threshold)}`
                              : binding.alert_threshold_mode === "average"
                                ? "低于 1 天用电量"
                                : `低于约 ${binding.alert_days} 天余量`}
                          </dd>
                        </div>
                        <div className="space-y-2">
                          <dt className="text-muted-foreground">绑定时间</dt>
                          <dd>{Number.isFinite(Date.parse(binding.created_at)) ? formatDateTime(binding.created_at) : "暂无记录"}</dd>
                        </div>
                      </dl>
                      <fieldset aria-label={`${roomName} 操作`} disabled={deleting || saving || updating} className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                        <CooldownRefreshButton
                          roomLabel={roomName}
                          busyElsewhere={checkingId != null && !checking}
                          availableAt={manualCheckAvailableAtByBinding[binding.id]}
                          checking={checking}
                          compact
                          onClick={() => onCheckRoom(binding.id)}
                        />
                        <Button size="sm" variant="secondary" disabled={formLocked} aria-label={`编辑 ${roomName}`} onClick={(event) => beginEdit(binding, event.currentTarget)}>
                          <Edit3 size={14} /> 编辑
                        </Button>
                        <Button size="sm" variant="ghost" disabled={formLocked || checking} aria-label={`${binding.enabled ? "停用" : "启用"} ${roomName}`} onClick={() => onToggleRoom(binding)}>
                          {updating ? <Loader2 className="animate-spin" size={14} /> : null}
                          {binding.enabled ? "停用" : "启用"}
                        </Button>
                        <Button className="ml-auto text-danger hover:text-danger" size="icon" variant="ghost" disabled={formLocked || checking}
                          aria-label={`删除 ${roomName} 绑定`} title="删除绑定" onClick={() => {
                            if (window.confirm(`确定解除 ${roomName} 的绑定吗？此宿舍将从你的监测列表移除。`)) onDeleteRoom(binding.id);
                          }}>
                          {deleting ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                        </Button>
                      </fieldset>
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
