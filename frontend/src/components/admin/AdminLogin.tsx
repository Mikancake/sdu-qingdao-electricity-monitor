import { createApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input, Label } from "../ui/input";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BatteryCharging, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { describeError, STUDENT_HOME } from "./utils";

export function AdminLogin({ message, onLogin }: { message: string | null; onLogin: (token: string) => void }) {
  const api = useMemo(() => createApiClient(), []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const loginMutation = useMutation({ gcTime: 0, mutationFn: api.adminLogin, onSuccess: (result) => onLogin(result.access_token), onError: (e) => setError(describeError(e)) });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (loginMutation.isPending) return;
    setError(null);
    loginMutation.mutate({ username, password });
  }

  return (
    <main className="app-background flex min-h-screen flex-col px-4 py-5 text-foreground sm:px-8 sm:py-9">
      <header className="relative z-[2] mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 border border-border bg-panel px-5 py-4 sm:px-7">
        <a href={STUDENT_HOME} className="flex items-center gap-3">
          <BatteryCharging size={25} strokeWidth={1.5} className="shrink-0 text-primary" />
          <span><span className="block text-sm font-semibold">校园电量监控</span><span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">SDU Qingdao / Administration</span></span>
        </a>
        <a href={STUDENT_HOME} className="flex items-center gap-2 py-1 text-xs text-muted-foreground transition-colors hover:text-primary"><ArrowLeft size={14} />返回电量监控</a>
      </header>

      <div className="relative z-[2] mx-auto flex w-full max-w-5xl flex-1 items-center py-8 sm:py-14">
        <div className="grid w-full overflow-hidden border border-border bg-panel md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <section className="flex min-w-0 flex-col border-b border-border bg-muted p-6 sm:p-9 md:border-b-0 md:border-r">
            <p className="eyebrow">Operations / 管理入口</p>
            <h1 className="page-heading mt-5 text-3xl leading-[1.4] sm:text-4xl">日常服务，<br className="hidden md:block" />有序照看。</h1>
            <p className="mt-4 max-w-xs text-sm leading-7 text-muted-foreground">电量监测、通知与平台设置。<br />从这里进入管理工作台。</p>

            <svg viewBox="0 0 260 220" fill="none" className="mx-auto my-8 hidden w-full max-w-[260px] text-foreground md:block" aria-hidden="true">
              <path d="M20 190H240M35 24V200M225 24V200" stroke="currentColor" strokeOpacity=".15" />
              <rect x="65" y="48" width="130" height="142" rx="3" className="fill-panel" stroke="currentColor" strokeWidth="1.5" />
              <path d="M65 88H195M65 138H195" stroke="currentColor" strokeOpacity=".2" />
              <circle cx="84" cy="68" r="4" className="fill-primary" />
              <path d="M98 68H152M162 68H178M84 112H113M147 112H176M84 164H113M147 164H176" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
              <circle cx="130" cy="112" r="10" className="fill-primary" />
              <circle cx="130" cy="164" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M130 48V27H225V91M65 164H35" className="stroke-primary" strokeWidth="1.5" />
              <circle cx="225" cy="97" r="6" className="fill-muted stroke-primary" strokeWidth="1.5" />
              <path d="M206 148H240M223 131V165" stroke="currentColor" strokeOpacity=".25" />
              <path d="M20 210H240" stroke="currentColor" strokeOpacity=".15" strokeDasharray="2 5" />
            </svg>

            <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground md:mt-auto"><ShieldCheck size={15} className="text-primary" />仅供授权管理员使用</div>
          </section>

          <section className="flex min-w-0 items-center p-6 sm:p-10 lg:p-14">
            <div className="mx-auto w-full max-w-sm">
              <div className="mb-8">
                <div className="mb-6 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center border border-border text-primary"><KeyRound size={18} strokeWidth={1.5} /></span><p className="eyebrow">Administrator access</p></div>
                <h2 className="page-heading text-3xl">登录管理工作台</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">输入管理员账号，继续处理平台事务。</p>
              </div>
              <form aria-label="管理员登录表单" aria-busy={loginMutation.isPending} className="space-y-5" onSubmit={submit}>
                <div className="space-y-2.5"><Label htmlFor="admin-username">用户名</Label><Input id="admin-username" minLength={2} maxLength={80} className="h-12 bg-background" placeholder="输入管理员用户名" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
                <div className="space-y-2.5">
                  <Label htmlFor="admin-password">密码</Label>
                  <div className="relative"><Input id="admin-password" className="h-12 bg-background pr-12" placeholder="输入登录密码" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
                </div>
                {message && !error && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
                {error ? <div role="alert" className="border-l-2 border-danger bg-muted p-4 text-sm leading-6 text-danger">{error}</div> : null}
                <Button aria-busy={loginMutation.isPending} className="h-12 w-full justify-between px-5" disabled={loginMutation.isPending}><span>{loginMutation.isPending ? "正在验证身份…" : "进入工作台"}</span>{loginMutation.isPending ? <Loader2 className="animate-spin" size={17} /> : <ArrowRight size={17} />}</Button>
              </form>
              <p className="mt-7 border-t border-border pt-5 text-xs leading-6 text-muted-foreground">管理员专属入口<br /><a href={STUDENT_HOME} className="inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-primary">学生用户请前往电量监控 <ArrowRight size={12} /></a></p>
            </div>
          </section>
        </div>
      </div>

      <footer className="relative z-[2] mx-auto flex w-full max-w-5xl flex-wrap justify-between gap-2 border border-border bg-panel px-5 py-4 text-[10px] tracking-wide text-muted-foreground sm:px-7"><span>山东大学 · 青岛校区</span><span>校园电量监控 / 管理工作台</span></footer>
    </main>
  );
}
