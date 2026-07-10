import { createApiClient } from "../../lib/api";
import { formatDateTime } from "../../lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ADMIN_TOKEN_KEY } from "./utils";
import { useQuery } from "@tanstack/react-query";
import { BatteryCharging, Bell, KeyRound, Loader2, Mail, Play, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

export function StatusPanel({
  onRunChecks,
  onRunNotifications,
  runningChecks,
  runningNotifications
}: {
  onRunChecks: () => void;
  onRunNotifications: () => void;
  runningChecks: boolean;
  runningNotifications: boolean;
}) {
  const api = useMemo(() => createApiClient(window.localStorage.getItem(ADMIN_TOKEN_KEY)), []);
  const statusQuery = useQuery({ queryKey: ["admin-status"], queryFn: api.getAdminStatus });
  const status = statusQuery.data;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">注册用户</div>
              <div className="mt-2 text-2xl font-semibold">{status?.total_users ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">已验证 {status?.verified_users ?? "--"}</div>
            </div>
            <ShieldCheck className="text-primary" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">使用宿舍</div>
              <div className="mt-2 text-2xl font-semibold">{status?.total_rooms ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">启用绑定 {status?.active_bindings ?? "--"}</div>
            </div>
            <BatteryCharging className="text-success" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Token</div>
              <div className="mt-2 text-2xl font-semibold">
                {status ? `${status.enabled_token_count}/${status.token_count}` : "--"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">异常 {status?.unhealthy_token_count ?? "--"}</div>
            </div>
            <KeyRound className="text-warning" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">SMTP</div>
              <div className="mt-2 text-2xl font-semibold">
                {status ? `${status.enabled_smtp_count}/${status.smtp_count}` : "--"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">异常 {status?.unhealthy_smtp_count ?? "--"}</div>
            </div>
            <Mail className={status?.smtp_configured ? "text-success" : "text-muted-foreground"} size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">提醒与日报</div>
              <div className="mt-2 text-2xl font-semibold">{status?.sent_notifications ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">业务记录 {status?.total_notifications ?? "--"}</div>
            </div>
            <Mail className="text-primary" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">24h 业务邮件</div>
              <div className="mt-2 text-2xl font-semibold">{status?.recent_sent_notifications ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">失败 {status?.recent_failed_notifications ?? "--"}</div>
            </div>
            <Bell className="text-success" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">全部发信</div>
              <div className="mt-2 text-2xl font-semibold">{status?.all_sent_emails ?? "--"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                24h {status?.recent_sent_emails ?? "--"} · 失败 {status?.recent_failed_emails ?? "--"}
              </div>
            </div>
            <Mail className="text-primary" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">待发通知</div>
              <div className="mt-2 text-2xl font-semibold">{status?.pending_notifications ?? "--"}</div>
            </div>
            <Bell className="text-muted-foreground" size={26} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">失败通知</div>
              <div className="mt-2 text-2xl font-semibold">{status?.failed_notifications ?? "--"}</div>
            </div>
            <Bell className={status?.failed_notifications ? "text-danger" : "text-muted-foreground"} size={26} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>运行控制</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button disabled={runningChecks} onClick={onRunChecks} variant="secondary">
            {runningChecks ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            立即检查到期宿舍
          </Button>
          <Button disabled={runningNotifications} onClick={onRunNotifications} variant="secondary">
            {runningNotifications ? <Loader2 className="animate-spin" size={16} /> : <Bell size={16} />}
            立即扫描提醒
          </Button>
          <div className="flex items-center text-sm text-muted-foreground">
            最新读数：{formatDateTime(status?.latest_read_at)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
