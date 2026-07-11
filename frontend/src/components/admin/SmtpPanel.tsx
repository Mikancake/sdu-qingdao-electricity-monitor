import { SmtpHealthLog, SmtpSettings } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label } from "../ui/input";
import { ListSkeleton } from "../ui/skeleton";
import { ListToolbar, LogToolbar } from "./toolbars";
import { compareDate, compareNumber, compareText, healthLabel, healthTone, LogFilters, matchesSearch } from "./utils";
import { Edit3, Loader2, Mail, Save, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

export function SmtpPanel({
  accounts,
  logs,
  onCreate,
  onUpdate,
  onDelete,
  onTest,
  saving,
  testingSmtpId,
  logsLoading,
  logFilters,
  onLogFiltersChange
}: {
  accounts: SmtpSettings[];
  logs: SmtpHealthLog[];
  onCreate: (payload: {
    name: string;
    host: string;
    port: number;
    username?: string | null;
    password?: string | null;
    from_email: string;
    enabled: boolean;
    min_interval_seconds: number;
    use_ssl: boolean;
    use_starttls: boolean;
  }) => void;
  onUpdate: (
    smtpId: number,
    payload: Partial<SmtpSettings> & { password?: string | null }
  ) => void;
  onDelete: (smtpId: number) => void;
  onTest: (smtpId: number, email: string) => void;
  saving: boolean;
  testingSmtpId: number | null;
  logsLoading: boolean;
  logFilters: LogFilters;
  onLogFiltersChange: (filters: LogFilters) => void;
}) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(465);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [interval, setInterval] = useState(0);
  const [useSsl, setUseSsl] = useState(true);
  const [useStarttls, setUseStarttls] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editHost, setEditHost] = useState("");
  const [editPort, setEditPort] = useState(465);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editFromEmail, setEditFromEmail] = useState("");
  const [editInterval, setEditInterval] = useState(0);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editUseSsl, setEditUseSsl] = useState(true);
  const [editUseStarttls, setEditUseStarttls] = useState(false);
  const [testEmails, setTestEmails] = useState<Record<number, string>>({});
  const [smtpSearch, setSmtpSearch] = useState("");
  const [smtpSort, setSmtpSort] = useState("last_used_desc");

  const visibleAccounts = useMemo(() => {
    return [...accounts]
      .filter((item) =>
        matchesSearch(smtpSearch, [
          item.id,
          item.name,
          item.host,
          item.port,
          item.username,
          item.from_email,
          item.enabled ? "启用" : "停用",
          healthLabel(item.health_status),
          item.last_error_kind,
          item.last_error_msg
        ])
      )
      .sort((a, b) => {
        if (smtpSort === "name_asc") return compareText(a.name, b.name, "asc");
        if (smtpSort === "name_desc") return compareText(a.name, b.name, "desc");
        if (smtpSort === "host_asc") return compareText(`${a.host}:${a.port}`, `${b.host}:${b.port}`, "asc");
        if (smtpSort === "host_desc") return compareText(`${a.host}:${a.port}`, `${b.host}:${b.port}`, "desc");
        if (smtpSort === "failures_desc") return compareNumber(a.failure_count, b.failure_count, "desc");
        if (smtpSort === "last_used_asc") return compareDate(a.last_used_at, b.last_used_at, "asc");
        return compareDate(a.last_used_at, b.last_used_at, "desc");
      });
  }, [accounts, smtpSearch, smtpSort]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({
      name: name.trim(),
      host: host.trim(),
      port,
      username: username.trim() || null,
      password: password || null,
      from_email: fromEmail.trim(),
      enabled: true,
      min_interval_seconds: interval,
      use_ssl: useSsl,
      use_starttls: useStarttls
    });
    setName("");
    setHost("");
    setUsername("");
    setPassword("");
    setFromEmail("");
  }

  function startEdit(item: SmtpSettings) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditHost(item.host ?? "");
    setEditPort(item.port);
    setEditUsername(item.username ?? "");
    setEditPassword("");
    setEditFromEmail(item.from_email ?? "");
    setEditInterval(item.min_interval_seconds);
    setEditEnabled(item.enabled);
    setEditUseSsl(item.use_ssl);
    setEditUseStarttls(item.use_starttls);
  }

  function saveEdit(item: SmtpSettings) {
    onUpdate(item.id, {
      name: editName.trim(),
      host: editHost.trim(),
      port: editPort,
      username: editUsername.trim() || null,
      password: editPassword || undefined,
      from_email: editFromEmail.trim(),
      enabled: editEnabled,
      min_interval_seconds: editInterval,
      use_ssl: editUseSsl,
      use_starttls: editUseStarttls
    });
    setEditingId(null);
    setEditPassword("");
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>添加 SMTP 发件邮箱</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
            <div>
              <Label htmlFor="smtp-name">名称</Label>
              <Input id="smtp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="smtp-1" required />
            </div>
            <div>
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input id="smtp-host" value={host} onChange={(event) => setHost(event.target.value)} required />
            </div>
            <div>
              <Label htmlFor="smtp-port">端口</Label>
              <Input id="smtp-port" type="number" value={port} onChange={(event) => setPort(Number(event.target.value))} />
            </div>
            <div>
              <Label htmlFor="smtp-user">用户名</Label>
              <Input id="smtp-user" value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="smtp-from">发件邮箱</Label>
              <Input id="smtp-from" type="email" value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} required />
            </div>
            <div>
              <Label htmlFor="smtp-password">密码 / 授权码</Label>
              <Input id="smtp-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="smtp-interval">最小间隔（秒）</Label>
              <Input id="smtp-interval" type="number" min={0} value={interval} onChange={(event) => setInterval(Number(event.target.value))} />
            </div>
            <div className="flex items-end gap-4 pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input className="h-4 w-4 accent-primary" type="checkbox" checked={useSsl} onChange={(event) => setUseSsl(event.target.checked)} />
                SSL
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input className="h-4 w-4 accent-primary" type="checkbox" checked={useStarttls} onChange={(event) => setUseStarttls(event.target.checked)} />
                STARTTLS
              </label>
            </div>
            <Button className="md:col-span-2" disabled={saving || !name.trim() || !host.trim() || !fromEmail.trim()}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              保存 SMTP
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMTP 池</CardTitle>
        </CardHeader>
        <CardContent>
          <ListToolbar
            search={smtpSearch}
            onSearchChange={setSmtpSearch}
            sort={smtpSort}
            onSortChange={setSmtpSort}
            placeholder="搜索 SMTP 名称、地址、发件邮箱或错误"
            sortOptions={[
              { value: "last_used_desc", label: "最近使用从新到旧" },
              { value: "last_used_asc", label: "最近使用从旧到新" },
              { value: "name_asc", label: "名称 A-Z" },
              { value: "name_desc", label: "名称 Z-A" },
              { value: "host_asc", label: "地址 A-Z" },
              { value: "host_desc", label: "地址 Z-A" },
              { value: "failures_desc", label: "失败次数从多到少" }
            ]}
          />
          <div className="responsive-table-shell rounded-lg border border-border">
            <table className="responsive-table w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">地址</th>
                  <th className="px-4 py-3 font-medium">健康</th>
                  <th className="px-4 py-3 font-medium">测试</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td className="responsive-table-empty px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      暂无后台 SMTP 配置；如果 .env 配了 SMTP，系统仍会用 .env 作为兜底。
                    </td>
                  </tr>
                ) : visibleAccounts.length === 0 ? (
                  <tr>
                    <td className="responsive-table-empty px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      没有匹配的 SMTP
                    </td>
                  </tr>
                ) : (
                  visibleAccounts.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      {editingId === item.id ? (
                        <>
                          <td data-label="名称" className="px-4 py-3">
                            <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                              <input className="h-4 w-4 accent-primary" type="checkbox" checked={editEnabled} onChange={(event) => setEditEnabled(event.target.checked)} />
                              启用
                            </label>
                          </td>
                          <td data-label="地址" className="px-4 py-3">
                            <div className="grid gap-2">
                              <Input value={editHost} onChange={(event) => setEditHost(event.target.value)} placeholder="SMTP Host" />
                              <Input type="number" value={editPort} onChange={(event) => setEditPort(Number(event.target.value))} placeholder="端口" />
                              <Input value={editUsername} onChange={(event) => setEditUsername(event.target.value)} placeholder="用户名" />
                              <Input type="email" value={editFromEmail} onChange={(event) => setEditFromEmail(event.target.value)} placeholder="发件邮箱" />
                              <Input type="password" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} placeholder={item.password_configured ? "已保存，留空不修改" : "密码 / 授权码"} />
                              <Input type="number" min={0} value={editInterval} onChange={(event) => setEditInterval(Number(event.target.value))} placeholder="最小间隔" />
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <label className="inline-flex items-center gap-2">
                                  <input className="h-4 w-4 accent-primary" type="checkbox" checked={editUseSsl} onChange={(event) => setEditUseSsl(event.target.checked)} />
                                  SSL
                                </label>
                                <label className="inline-flex items-center gap-2">
                                  <input className="h-4 w-4 accent-primary" type="checkbox" checked={editUseStarttls} onChange={(event) => setEditUseStarttls(event.target.checked)} />
                                  STARTTLS
                                </label>
                              </div>
                            </div>
                          </td>
                          <td data-label="健康" className="px-4 py-3">
                            <Badge tone={healthTone(item.health_status)}>{healthLabel(item.health_status)}</Badge>
                          </td>
                          <td data-label="测试" className="px-4 py-3 text-muted-foreground">保存后测试</td>
                          <td data-label="操作" className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button size="icon" variant="secondary" title="保存" onClick={() => saveEdit(item)}>
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
                            <div className="font-medium">{item.name}</div>
                            <Badge className="mt-1" tone={item.enabled ? "success" : "muted"}>
                              {item.enabled ? "启用" : "停用"}
                            </Badge>
                          </td>
                          <td data-label="地址" className="px-4 py-3 text-muted-foreground">
                            <div>{item.host}:{item.port}</div>
                            <div className="mt-1">{item.from_email}</div>
                            <div className="mt-1 text-xs">间隔 {item.min_interval_seconds}s，最近使用 {formatDateTime(item.last_used_at)}</div>
                          </td>
                          <td data-label="健康" className="px-4 py-3">
                            <Badge tone={healthTone(item.health_status)}>{healthLabel(item.health_status)}</Badge>
                            <div className="mt-1 text-xs text-muted-foreground">失败 {item.failure_count}</div>
                            {item.last_error_msg ? (
                              <div className="mt-1 max-w-[240px] truncate text-xs text-danger" title={item.last_error_msg}>
                                {item.last_error_kind}: {item.last_error_msg}
                              </div>
                            ) : null}
                          </td>
                          <td data-label="测试" className="px-4 py-3">
                            <div className="flex min-w-0 gap-2 sm:min-w-[240px]">
                              <Input
                                type="email"
                                value={testEmails[item.id] ?? ""}
                                onChange={(event) => setTestEmails((prev) => ({ ...prev, [item.id]: event.target.value }))}
                                placeholder="测试收件邮箱"
                              />
                              <Button
                                size="icon"
                                variant="secondary"
                                disabled={testingSmtpId === item.id || !(testEmails[item.id] ?? "").trim()}
                                title="测试 SMTP"
                                onClick={() => onTest(item.id, (testEmails[item.id] ?? "").trim())}
                              >
                                {testingSmtpId === item.id ? <Loader2 className="animate-spin" size={15} /> : <Mail size={15} />}
                              </Button>
                            </div>
                          </td>
                          <td data-label="操作" className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button size="icon" variant="secondary" title="编辑" onClick={() => startEdit(item)}>
                                <Edit3 size={15} />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => onUpdate(item.id, { enabled: !item.enabled })}>
                                {item.enabled ? "停用" : "启用"}
                              </Button>
                              <Button size="icon" variant="ghost" title="删除" onClick={() => onDelete(item.id)}>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMTP 健康日志</CardTitle>
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
                  <th className="px-4 py-3 font-medium">SMTP</th>
                  <th className="px-4 py-3 font-medium">来源</th>
                  <th className="px-4 py-3 font-medium">收件人</th>
                  <th className="px-4 py-3 font-medium">结果</th>
                  <th className="px-4 py-3 font-medium">错误</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td className="responsive-table-empty px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                      暂无 SMTP 健康日志
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t border-border">
                      <td data-label="时间" className="px-4 py-3 text-muted-foreground">{formatDateTime(log.created_at)}</td>
                      <td data-label="SMTP" className="px-4 py-3">{log.smtp_name ?? `#${log.smtp_id ?? "-"}`}</td>
                      <td data-label="来源" className="px-4 py-3 text-muted-foreground">{log.source}</td>
                      <td data-label="收件人" className="px-4 py-3 text-muted-foreground">{log.recipient_email ?? "-"}</td>
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
