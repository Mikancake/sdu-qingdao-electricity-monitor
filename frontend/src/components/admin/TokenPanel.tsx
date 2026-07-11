import { AdminAuthToken, AdminAuthTokenHealthLog } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label } from "../ui/input";
import { ListSkeleton } from "../ui/skeleton";
import { ListToolbar, LogToolbar } from "./toolbars";
import { compareDate, compareNumber, compareText, healthLabel, healthTone, LogFilters, matchesSearch } from "./utils";
import { Edit3, Loader2, Play, Save, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

export function TokenPanel({
  tokens,
  logs,
  loading,
  onCreate,
  onUpdate,
  onTest,
  onToggle,
  onDelete,
  saving,
  testingTokenId,
  logsLoading,
  logFilters,
  onLogFiltersChange
}: {
  tokens: AdminAuthToken[];
  logs: AdminAuthTokenHealthLog[];
  loading: boolean;
  onCreate: (payload: { name: string; token_value: string; min_interval_seconds: number; enabled: boolean }) => void;
  onUpdate: (
    tokenId: number,
    payload: { name?: string; token_value?: string; min_interval_seconds?: number; enabled?: boolean }
  ) => void;
  onTest: (tokenId: number) => void;
  onToggle: (token: AdminAuthToken) => void;
  onDelete: (tokenId: number) => void;
  saving: boolean;
  testingTokenId: number | null;
  logsLoading: boolean;
  logFilters: LogFilters;
  onLogFiltersChange: (filters: LogFilters) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [interval, setInterval] = useState(10);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editInterval, setEditInterval] = useState(10);
  const [editEnabled, setEditEnabled] = useState(true);
  const [tokenSearch, setTokenSearch] = useState("");
  const [tokenSort, setTokenSort] = useState("last_used_desc");

  const visibleTokens = useMemo(() => {
    return [...tokens]
      .filter((token) =>
        matchesSearch(tokenSearch, [
          token.id,
          token.name,
          token.token_preview,
          token.enabled ? "启用" : "停用",
          healthLabel(token.health_status),
          token.last_error_kind,
          token.last_error_msg
        ])
      )
      .sort((a, b) => {
        if (tokenSort === "name_asc") return compareText(a.name, b.name, "asc");
        if (tokenSort === "name_desc") return compareText(a.name, b.name, "desc");
        if (tokenSort === "interval_asc") return compareNumber(a.min_interval_seconds, b.min_interval_seconds, "asc");
        if (tokenSort === "interval_desc") return compareNumber(a.min_interval_seconds, b.min_interval_seconds, "desc");
        if (tokenSort === "failures_desc") return compareNumber(a.failure_count, b.failure_count, "desc");
        if (tokenSort === "last_used_asc") return compareDate(a.last_used_at, b.last_used_at, "asc");
        return compareDate(a.last_used_at, b.last_used_at, "desc");
      });
  }, [tokens, tokenSearch, tokenSort]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({ name: name.trim(), token_value: value.trim(), min_interval_seconds: interval, enabled: true });
    setName("");
    setValue("");
  }

  function startEdit(token: AdminAuthToken) {
    setEditingId(token.id);
    setEditName(token.name);
    setEditValue("");
    setEditInterval(token.min_interval_seconds);
    setEditEnabled(token.enabled);
  }

  function saveEdit(tokenId: number) {
    onUpdate(tokenId, {
      name: editName.trim(),
      token_value: editValue.trim() || undefined,
      min_interval_seconds: editInterval,
      enabled: editEnabled
    });
    setEditingId(null);
    setEditValue("");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>添加 Token</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="token-name">名称</Label>
              <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="token-1" required />
            </div>
            <div>
              <Label htmlFor="token-value">Token</Label>
              <Input id="token-value" value={value} onChange={(event) => setValue(event.target.value)} placeholder="bearer ..." required />
            </div>
            <div>
              <Label htmlFor="token-interval">最小间隔（秒）</Label>
              <Input
                id="token-interval"
                type="number"
                min={0}
                value={interval}
                onChange={(event) => setInterval(Number(event.target.value))}
              />
            </div>
            <Button className="w-full" disabled={saving || !name.trim() || !value.trim()}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              保存 Token
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Token 池</CardTitle>
        </CardHeader>
        <CardContent>
          <ListToolbar
            search={tokenSearch}
            onSearchChange={setTokenSearch}
            sort={tokenSort}
            onSortChange={setTokenSort}
            placeholder="搜索 Token 名称、状态或错误"
            sortOptions={[
              { value: "last_used_desc", label: "最近使用从新到旧" },
              { value: "last_used_asc", label: "最近使用从旧到新" },
              { value: "name_asc", label: "名称 A-Z" },
              { value: "name_desc", label: "名称 Z-A" },
              { value: "failures_desc", label: "失败次数从多到少" },
              { value: "interval_asc", label: "间隔从短到长" },
              { value: "interval_desc", label: "间隔从长到短" }
            ]}
          />
          {loading ? (
            <ListSkeleton rows={4} />
          ) : (
            <div className="responsive-table-shell rounded-lg border border-border">
              <table className="responsive-table w-full border-collapse text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">名称</th>
                    <th className="px-4 py-3 font-medium">Token</th>
                    <th className="px-4 py-3 font-medium">间隔</th>
                    <th className="px-4 py-3 font-medium">健康</th>
                    <th className="px-4 py-3 font-medium">最近使用</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTokens.length === 0 ? (
                    <tr>
                      <td className="responsive-table-empty px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                        没有匹配的 Token
                      </td>
                    </tr>
                  ) : (
                    visibleTokens.map((token) => (
                    <tr key={token.id} className="border-t border-border">
                      {editingId === token.id ? (
                        <>
                          <td data-label="名称" className="px-4 py-3">
                            <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                className="h-4 w-4 accent-primary"
                                type="checkbox"
                                checked={editEnabled}
                                onChange={(event) => setEditEnabled(event.target.checked)}
                              />
                              启用
                            </label>
                          </td>
                          <td data-label="Token" className="px-4 py-3">
                            <Input
                              value={editValue}
                              onChange={(event) => setEditValue(event.target.value)}
                              placeholder="留空则不替换 Token"
                            />
                            <div className="mt-1 text-xs text-muted-foreground">当前：{token.token_preview}</div>
                          </td>
                          <td data-label="间隔" className="px-4 py-3">
                            <Input
                              type="number"
                              min={0}
                              value={editInterval}
                              onChange={(event) => setEditInterval(Number(event.target.value))}
                            />
                          </td>
                          <td data-label="健康" className="px-4 py-3 text-muted-foreground">
                            <Badge tone={healthTone(token.health_status)}>{healthLabel(token.health_status)}</Badge>
                            <div className="mt-1 text-xs">失败 {token.failure_count}</div>
                          </td>
                          <td data-label="最近使用" className="px-4 py-3 text-muted-foreground">{formatDateTime(token.last_used_at)}</td>
                          <td data-label="操作" className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button size="icon" variant="secondary" title="保存" onClick={() => saveEdit(token.id)}>
                                <Save size={15} />
                              </Button>
                              <Button size="icon" variant="ghost" title="取消" onClick={() => setEditingId(null)}>
                                <X size={15} />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td data-label="名称" className="px-4 py-3">
                            <div className="font-medium">{token.name}</div>
                            <Badge className="mt-1" tone={token.enabled ? "success" : "muted"}>
                              {token.enabled ? "启用" : "停用"}
                            </Badge>
                          </td>
                          <td data-label="Token" className="px-4 py-3 text-muted-foreground">{token.token_preview}</td>
                          <td data-label="间隔" className="px-4 py-3 text-muted-foreground">{token.min_interval_seconds}s</td>
                          <td data-label="健康" className="px-4 py-3">
                            <Badge tone={healthTone(token.health_status)}>{healthLabel(token.health_status)}</Badge>
                            <div className="mt-1 text-xs text-muted-foreground">失败 {token.failure_count}</div>
                            {token.last_error_msg ? (
                              <div className="mt-1 max-w-[220px] truncate text-xs text-danger" title={token.last_error_msg}>
                                {token.last_error_kind}: {token.last_error_msg}
                              </div>
                            ) : null}
                          </td>
                          <td data-label="最近使用" className="px-4 py-3 text-muted-foreground">{formatDateTime(token.last_used_at)}</td>
                          <td data-label="操作" className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button size="icon" variant="secondary" title="测试 Token" onClick={() => onTest(token.id)}>
                                {testingTokenId === token.id ? <Loader2 className="animate-spin" size={15} /> : <Play size={15} />}
                              </Button>
                              <Button size="icon" variant="secondary" title="编辑" onClick={() => startEdit(token)}>
                                <Edit3 size={15} />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => onToggle(token)}>
                                {token.enabled ? "停用" : "启用"}
                              </Button>
                              <Button size="icon" variant="ghost" title="删除" onClick={() => onDelete(token.id)}>
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Token 健康日志</CardTitle>
        </CardHeader>
        <CardContent>
          <LogToolbar filters={logFilters} onChange={onLogFiltersChange} />
          {logsLoading ? (
            <ListSkeleton rows={4} />
          ) : (
            <div className="responsive-table-shell rounded-lg border border-border">
            <table className="responsive-table w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">Token</th>
                  <th className="px-4 py-3 font-medium">来源</th>
                  <th className="px-4 py-3 font-medium">结果</th>
                  <th className="px-4 py-3 font-medium">错误</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td className="responsive-table-empty px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      暂无健康日志
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t border-border">
                      <td data-label="时间" className="px-4 py-3 text-muted-foreground">{formatDateTime(log.created_at)}</td>
                      <td data-label="Token" className="px-4 py-3">{log.token_name ?? `#${log.token_id ?? "-"}`}</td>
                      <td data-label="来源" className="px-4 py-3 text-muted-foreground">{log.source}</td>
                      <td data-label="结果" className="px-4 py-3">
                        <Badge tone={log.success ? "success" : healthTone(log.health_status)}>
                          {log.success ? "成功" : healthLabel(log.health_status)}
                        </Badge>
                      </td>
                      <td data-label="错误" className="px-4 py-3 text-muted-foreground">
                        {log.error_kind ? `${log.error_kind}: ${log.error_msg ?? ""}` : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
