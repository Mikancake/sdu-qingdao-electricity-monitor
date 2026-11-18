import { ReactNode, useEffect, useMemo, useState } from "react";
import { Activity, CircleStop, Info, Loader2, Play, Radio, Search, TimerReset } from "lucide-react";

import type { AdminHwglProbe, AdminHwglProbeDetail, AdminHwglProbeStartPayload, Room } from "../../lib/types";
import { formatDateTime, formatKwh } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label, Select } from "../ui/input";
import { ListSkeleton } from "../ui/skeleton";

const INTERVAL_PRESETS = [60, 120, 300, 600, 1800, 3600];
const DURATION_PRESETS = [300, 600, 1800, 3600, 7200];
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 3600;
// Matches the backend's default.  The live runtime setting replaces this as
// soon as the admin settings query finishes.
const DEFAULT_MAX_DURATION_SECONDS = 2 * 60 * 60;

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function statusLabel(status: string) {
  return {
    running: "运行中",
    finished: "已完成",
    stopped: "已停止",
    failed: "失败"
  }[status] ?? status;
}

function statusTone(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "running") return "success";
  if (status === "failed") return "danger";
  if (status === "finished") return "success";
  return "muted";
}

function summaryNumber(summary: Record<string, unknown> | null | undefined, key: string) {
  const value = summary?.[key];
  return typeof value === "number" ? value : null;
}

export function HwglProbePanel({
  rooms,
  probes,
  selectedProbe,
  listProblem, unavailable,
  roomsLoading,
  probesLoading,
  detailLoading,
  detailProblem,
  creating,
  stopping,
  selectedProbeId,
  maxDurationSeconds,
  onSelectProbe,
  onCreate,
  onStop
}: {
  rooms: Room[];
  probes: AdminHwglProbe[];
  selectedProbe?: AdminHwglProbeDetail;
  listProblem: ReactNode; unavailable: boolean;
  roomsLoading: boolean;
  probesLoading: boolean;
  detailLoading: boolean;
  detailProblem: ReactNode;
  creating: boolean;
  stopping: boolean;
  selectedProbeId: number | null;
  maxDurationSeconds?: number;
  onSelectProbe: (probeId: number | null) => void;
  onCreate: (payload: AdminHwglProbeStartPayload) => void;
  onStop: (probeId: number) => void;
}) {
  const [targetMode, setTargetMode] = useState<"saved" | "custom">("saved");
  const [roomId, setRoomId] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [customRoomNumber, setCustomRoomNumber] = useState("");
  const [buildingSide, setBuildingSide] = useState<"auto" | "11" | "13">("auto");
  const [intervalMode, setIntervalMode] = useState<"preset" | "custom">("preset");
  const [intervalSeconds, setIntervalSeconds] = useState("60");
  const [durationMode, setDurationMode] = useState<"preset" | "custom">("preset");
  const [durationSeconds, setDurationSeconds] = useState("600");
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveMaxDuration = Math.max(60, maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS);
  const maxDurationMinutes = Math.max(1, Math.floor(effectiveMaxDuration / 60));
  const customDurationMinutes = durationSeconds ? String(Number(durationSeconds) / 60) : "";


  const visibleRooms = useMemo(() => {
    const keyword = roomSearch.trim().toLocaleLowerCase();
    if (!keyword) return rooms;
    return rooms.filter((room) => `${room.building_name} ${room.room_number}`.toLocaleLowerCase().includes(keyword));
  }, [roomSearch, rooms]);
  const selectedRoomId = visibleRooms.some((room) => String(room.id) === roomId) ? roomId : "";
  useEffect(() => {
    if (durationMode !== "preset" || Number(durationSeconds) <= effectiveMaxDuration) return;
    const preset = DURATION_PRESETS.find((seconds) => seconds <= effectiveMaxDuration);
    if (!preset) setDurationMode("custom");
    setDurationSeconds(String(preset ?? maxDurationMinutes * 60));
  }, [durationMode, durationSeconds, effectiveMaxDuration, maxDurationMinutes]);

  const runningProbe = useMemo(() => probes.find((probe) => probe.status === "running"), [probes]);
  const latestProbe = selectedProbe ?? (selectedProbeId ? probes.find((probe) => probe.id === selectedProbeId) : undefined);
  const summary = latestProbe?.summary;
  const latency = summary?.latency_ms as Record<string, unknown> | undefined;
  const providerIntervals = summary?.provider_update_intervals_seconds as Record<string, unknown> | undefined;

  function chooseInterval(value: string) {
    if (value === "custom") {
      setIntervalMode("custom");
      if (INTERVAL_PRESETS.includes(Number(intervalSeconds))) setIntervalSeconds("600");
      return;
    }
    setIntervalMode("preset");
    setIntervalSeconds(value);
  }

  function chooseDuration(value: string) {
    if (value === "custom") {
      setDurationMode("custom");
      if (DURATION_PRESETS.includes(Number(durationSeconds))) {
        setDurationSeconds(String(Math.min(15, maxDurationMinutes) * 60));
      }
      return;
    }
    setDurationMode("preset");
    setDurationSeconds(value);
  }

  function startProbe() {
    setFormError(null);
    const interval = Number(intervalSeconds);
    const duration = Number(durationSeconds);
    if (!Number.isInteger(interval) || interval < MIN_INTERVAL_SECONDS || interval > MAX_INTERVAL_SECONDS) {
      setFormError(`请求间隔需要设置为 ${MIN_INTERVAL_SECONDS}–${MAX_INTERVAL_SECONDS} 秒。`);
      return;
    }
    if (!Number.isInteger(duration / 60) || duration < 60 || duration > effectiveMaxDuration) {
      setFormError(`持续时间需要设置为 1 分钟至 ${formatDuration(effectiveMaxDuration)}。`);
      return;
    }

    const payload: AdminHwglProbeStartPayload = {
      interval_seconds: interval,
      duration_seconds: duration
    };
    if (targetMode === "saved") {
      if (!selectedRoomId) {
        setFormError("请先选择一个已保存的 HWGL 宿舍。");
        return;
      }
      payload.room_id = Number(selectedRoomId);
    } else {
      const roomNumber = customRoomNumber.trim();
      if (!roomNumber) {
        setFormError("请输入要验证的测试宿舍号。");
        return;
      }
      payload.room_number = roomNumber;
      payload.building_side = buildingSide;
    }
    onCreate(payload);
  }

  return (
    <div className="grid gap-5">
      <Card className="motion-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="text-primary" size={19} />
            HWGL 实时性探测
          </CardTitle>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            只针对新电费系统宿舍发起实验请求，用来观察接口多久返回一次新快照。探测样本单独保存，不会进入普通电量曲线、日均计算或邮件通知。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="hwgl-probe-target-mode">测试宿舍来源</Label>
              <Select
                id="hwgl-probe-target-mode"
                value={targetMode}
                disabled={Boolean(runningProbe)}
                onChange={(event) => setTargetMode(event.target.value as "saved" | "custom")}
              >
                <option value="saved">从已保存宿舍选择</option>
                <option value="custom">手动输入并验证</option>
              </Select>
            </div>
            {targetMode === "saved" ? (
              <div className="md:col-span-2">
                <Label htmlFor="hwgl-probe-room">测试宿舍</Label>
                <Select
                  id="hwgl-probe-room"
                  value={selectedRoomId}
                  disabled={roomsLoading || Boolean(runningProbe)}
                  onChange={(event) => setRoomId(event.target.value)}
                >
                  <option value="">{roomsLoading ? "正在读取宿舍" : !visibleRooms.length ? (roomSearch ? "没有匹配的宿舍" : "暂无已保存的 HWGL 宿舍") : "请选择宿舍"}</option>
                  {visibleRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.building_name} {room.room_number}{room.probe_only ? "（探测专用）" : ""}
                    </option>
                  ))}
                </Select>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <Input
                    aria-label="筛选测试宿舍"
                    className="pl-8"
                    placeholder="筛选宿舍号，例如 210"
                    value={roomSearch}
                    disabled={Boolean(runningProbe)}
                    onChange={(event) => setRoomSearch(event.target.value)}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  这里来自数据库中已保存的 HWGL 宿舍；历史测试记录也可能出现在列表中。
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:col-span-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="hwgl-custom-room-number">宿舍号</Label>
                  <Input
                    id="hwgl-custom-room-number"
                    placeholder="例如 210"
                    value={customRoomNumber}
                    disabled={Boolean(runningProbe)}
                    onChange={(event) => setCustomRoomNumber(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="hwgl-custom-building-side">楼侧（仅用于上游解析）</Label>
                  <Select
                    id="hwgl-custom-building-side"
                    value={buildingSide}
                    disabled={Boolean(runningProbe)}
                    onChange={(event) => setBuildingSide(event.target.value as "auto" | "11" | "13")}
                  >
                    <option value="auto">自动匹配（建议）</option>
                    <option value="11">11 侧</option>
                    <option value="13">13 侧</option>
                  </Select>
                </div>
                <p className="text-[11px] leading-4 text-muted-foreground sm:col-span-2">
                  平台仍将其归在“凤凰居11/13号楼”下；提交后会先从公开目录验证宿舍是否存在，再开始探测。
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="hwgl-probe-interval">请求间隔</Label>
              <Select
                id="hwgl-probe-interval"
                value={intervalMode === "custom" ? "custom" : intervalSeconds}
                disabled={Boolean(runningProbe)}
                onChange={(event) => chooseInterval(event.target.value)}
              >
                <option value="60">每 1 分钟</option>
                <option value="120">每 2 分钟</option>
                <option value="300">每 5 分钟</option>
                <option value="600">每 10 分钟</option>
                <option value="1800">每 30 分钟</option>
                <option value="3600">每 1 小时</option>
                <option value="custom">自定义</option>
              </Select>
              {intervalMode === "custom" ? (
                <Input
                  className="mt-2"
                  type="number"
                  min={MIN_INTERVAL_SECONDS}
                  max={MAX_INTERVAL_SECONDS}
                  step={1}
                  value={intervalSeconds}
                  disabled={Boolean(runningProbe)}
                  onChange={(event) => setIntervalSeconds(event.target.value)}
                  aria-label="自定义请求间隔（秒）"
                  placeholder="输入秒数"
                />
              ) : null}
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">允许范围：{MIN_INTERVAL_SECONDS}–{MAX_INTERVAL_SECONDS} 秒。</p>
            </div>
            <div>
              <Label htmlFor="hwgl-probe-duration">持续时间</Label>
              <Select
                id="hwgl-probe-duration"
                value={durationMode === "custom" ? "custom" : durationSeconds}
                disabled={Boolean(runningProbe)}
                onChange={(event) => chooseDuration(event.target.value)}
              >
                {DURATION_PRESETS.filter((seconds) => seconds <= effectiveMaxDuration).map((seconds) => <option key={seconds} value={seconds}>{formatDuration(seconds)}</option>)}
                <option value="custom">自定义</option>
              </Select>
              {durationMode === "custom" ? (
                <Input
                  className="mt-2"
                  type="number"
                  min={1}
                  max={maxDurationMinutes}
                  step={1}
                  value={customDurationMinutes}
                  disabled={Boolean(runningProbe)}
                  onChange={(event) => {
                    const minutes = Number(event.target.value);
                    setDurationSeconds(event.target.value ? String(minutes * 60) : "");
                  }}
                  aria-label="自定义持续时间（分钟）"
                  placeholder="输入分钟数"
                />
              ) : null}
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">后台当前上限：{formatDuration(effectiveMaxDuration)}。</p>
            </div>
          </div>

          {formError ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{formError}</div> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={unavailable || creating || Boolean(runningProbe) || (targetMode === "saved" && !selectedRoomId)} onClick={startProbe}>
              {creating ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
              {runningProbe ? "已有探测运行中" : "开始探测"}
            </Button>
            {runningProbe ? (
              <Button disabled={stopping} variant="danger" onClick={() => onStop(runningProbe.id)}>
                {stopping ? <Loader2 className="animate-spin" size={16} /> : <CircleStop size={16} />}
                停止当前探测
              </Button>
            ) : null}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info size={15} />
              同一时间只运行一个探测，避免实验请求影响正常同步。
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="motion-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TimerReset className="text-primary" size={18} />
              最近探测任务
            </CardTitle>
          </CardHeader>
          <CardContent>
            {listProblem || (probesLoading ? (
              <ListSkeleton rows={4} />
            ) : probes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                还没有探测记录。
              </div>
            ) : (
              <div className="space-y-2">
                {probes.map((probe) => (
                  <button
                    key={probe.id}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${selectedProbeId === probe.id ? "border-primary/50 bg-primary/5" : "border-border/70 bg-muted/20 hover:bg-muted/45"}`}
                    aria-pressed={selectedProbeId === probe.id}
                    type="button"
                    onClick={() => onSelectProbe(probe.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {probe.room.building_name} {probe.room.room_number}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDuration(probe.duration_seconds)} · 每 {formatDuration(probe.interval_seconds)} · {formatDateTime(probe.started_at)}
                        </div>
                      </div>
                      <Badge tone={statusTone(probe.status)}>{statusLabel(probe.status)}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                      <span>样本 {probe.sample_count}</span>
                      <span>唯一快照 {probe.unique_snapshot_count}</span>
                      <span>{probe.finished_at ? formatDateTime(probe.finished_at) : "等待中"}</span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="motion-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="text-success" size={18} />
              探测详情
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detailProblem || (detailLoading ? (
              <div role="status" className="flex items-center justify-center py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={17} />正在读取样本</div>
            ) : !latestProbe ? (
              <div className="py-8 text-center text-sm text-muted-foreground">选择一条任务查看详情。</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/35 px-3 py-2"><div className="text-muted-foreground">成功样本</div><div className="mt-1 font-semibold">{summaryNumber(summary, "successful_samples") ?? "--"}</div></div>
                  <div className="rounded-lg bg-muted/35 px-3 py-2"><div className="text-muted-foreground">响应不变比例</div><div className="mt-1 font-semibold">{summaryNumber(summary, "unchanged_response_ratio") == null ? "--" : `${(Number(summaryNumber(summary, "unchanged_response_ratio")) * 100).toFixed(1)}%`}</div></div>
                  <div className="rounded-lg bg-muted/35 px-3 py-2"><div className="text-muted-foreground">平均延迟</div><div className="mt-1 font-semibold">{latency?.average == null ? "--" : `${latency.average} ms`}</div></div>
                  <div className="rounded-lg bg-muted/35 px-3 py-2"><div className="text-muted-foreground">上游更新时间间隔</div><div className="mt-1 font-semibold">{providerIntervals?.average == null ? "--" : `${providerIntervals.average} 秒`}</div></div>
                </div>
                {selectedProbe?.samples?.length ? (
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {selectedProbe.samples.slice().reverse().map((sample) => (
                      <div key={sample.id} className="rounded-lg border border-border/70 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">{formatDateTime(sample.requested_at)}</span>
                          <Badge tone={sample.success ? "success" : "danger"}>{sample.success ? "成功" : sample.error_kind || "失败"}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <span>电量 {formatKwh(sample.balance)}</span>
                          <span>延迟 {sample.latency_ms == null ? "--" : `${sample.latency_ms} ms`}</span>
                          <span>上游时间 {sample.provider_updated_at ? formatDateTime(sample.provider_updated_at) : "--"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">{latestProbe.status === "running" ? "暂时还没有样本，worker 会按设定间隔继续执行。" : "该任务未记录样本。"}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
