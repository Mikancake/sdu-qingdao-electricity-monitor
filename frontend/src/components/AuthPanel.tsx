import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, BatteryCharging, Bell, Building2, Eye, EyeOff, Loader2, Mail, ShieldCheck } from "lucide-react";
import type { Announcement } from "../lib/types";
import { ApiError, createApiClient, getApiErrorMessage } from "../lib/api";
import { AnnouncementsNotice } from "./AnnouncementsNotice";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";

interface AuthPanelProps { onLogin: (token: string) => void; }
type AuthMode = "login" | "register" | "verify";

export function AuthPanel({ onLogin }: AuthPanelProps) {
  const api = useMemo(() => createApiClient(), []);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    let active = true;
    api.listAnnouncements().then(items => { if (active) setAnnouncements(items); }).catch(() => {});
    return () => { active = false; };
  }, [api]);

  function changeMode(next: AuthMode) {
    setMode(next);
    setMessage(null);
    setError(null);
    setCode("");
    setDevCode(null);
    setShowPassword(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "login") {
        const response = await api.login({ email, password });
        onLogin(response.access_token);
        return;
      }
      if (mode === "register") {
        const response = await api.register({ email, password });
        setDevCode(response.dev_verification_code ?? null);
        setMode("verify");
        setMessage(response.email_sent ? "验证码已发送，请检查邮箱。" : "开发模式已返回验证码。");
        return;
      }
      if (code.trim().length < 4) {
        setError("验证码至少需要 4 位，请检查后再提交。");
        return;
      }
      await api.verifyEmail({ email, code, password });
      setMode("login");
      setMessage("邮箱已验证，可以登录。");
    } catch (err) {
      if (mode === "register" && err instanceof ApiError && err.detail && typeof err.detail === "object" && "kind" in err.detail && err.detail.kind === "verification_email_cooldown") {
        setMode("verify");
        setMessage("验证码刚刚发送过，请填写刚才收到的验证码。");
        return;
      }
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "login" ? "把日常，接上电。" : mode === "register" ? "从这里开始。" : "确认你的邮箱。";
  const subtitle = mode === "login" ? "登录后，查看宿舍电量与用电提醒。" : mode === "register" ? "用邮箱创建账号，再绑定你的宿舍。" : "输入邮箱收到的验证码，完成账号注册。";

  return (
    <main className="app-background min-h-screen px-4 py-5 text-foreground sm:px-8 sm:py-10 lg:flex lg:items-center lg:py-14">
      <div className="relative z-[2] mx-auto w-full max-w-6xl overflow-hidden border border-border bg-panel shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-9">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-primary/30 text-primary"><BatteryCharging size={23} strokeWidth={1.5} /></span>
            <div>
              <p className="text-sm font-semibold tracking-wide">校园电量监控</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">SDU Qingdao / Electricity Monitor</p>
            </div>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">山东大学 · 青岛校区</span>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="flex min-w-0 flex-col border-b border-border p-5 sm:p-9 lg:border-b-0 lg:border-r lg:p-12">
            <p className="eyebrow">Campus living, thoughtfully connected</p>
            <h1 className="page-heading mt-5 text-3xl leading-[1.35] sm:text-4xl lg:text-5xl">关心每一度电，<br className="hidden sm:block" />也关心日常。</h1>
            <p className="mt-5 hidden max-w-sm text-sm leading-7 text-muted-foreground sm:block">看看余额，了解用电变化。把宿舍用电的小事，放在一个清楚、有序的地方。</p>

            <div className="my-10 hidden flex-1 items-center justify-center lg:flex">
              <svg viewBox="0 0 400 240" fill="none" className="w-full max-w-sm text-foreground" aria-hidden="true">
                <path d="M26 206H374M50 28V214M350 28V214" stroke="currentColor" strokeOpacity=".12" />
                <path d="M50 66H126V102M274 140H350M126 164V206M274 66V28" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
                <rect x="126" y="42" width="148" height="164" rx="3" className="fill-background" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="200" cy="108" r="43" stroke="currentColor" strokeOpacity=".2" />
                <path d="M166 108A34 34 0 0 1 228 88" className="stroke-primary" strokeWidth="5" strokeLinecap="round" />
                <path d="M200 108L219 89" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
                <circle cx="200" cy="108" r="4" className="fill-primary" />
                <path d="M150 165H250M150 180H190M214 180H250" stroke="currentColor" strokeOpacity=".3" strokeWidth="1.5" />
                <circle cx="50" cy="66" r="8" className="fill-panel stroke-primary" strokeWidth="2" />
                <circle cx="350" cy="140" r="8" className="fill-panel stroke-primary" strokeWidth="2" />
                <path d="M66 140H91M78.5 127.5V152.5M305 64H326" stroke="currentColor" strokeOpacity=".3" strokeWidth="1.5" />
                <path d="M305 173L292 193H304L300 211L320 187H307L312 173Z" className="fill-primary" />
                <path d="M25 228H375" stroke="currentColor" strokeOpacity=".12" strokeDasharray="2 6" />
              </svg>
            </div>

            <div className="mt-7 hidden border-t border-border pt-5 sm:block lg:mt-auto">
              <p className="mb-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">A little less to keep in mind</p>
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs">
                <span className="flex items-center gap-2"><Building2 size={15} className="text-primary" />宿舍绑定</span>
                <span className="flex items-center gap-2"><Bell size={15} className="text-primary" />低电预警</span>
                <span className="flex items-center gap-2"><Mail size={15} className="text-primary" />邮箱提醒</span>
              </div>
            </div>
          </section>

          <section className="min-w-0 p-5 sm:p-9 lg:p-12">
            <div className="mx-auto w-full max-w-sm">
              <div className="mb-8 flex items-center border-b border-border" aria-label="账号操作">
                <button type="button" aria-pressed={mode === "login"} onClick={() => changeMode("login")} className={`-mb-px border-b-2 px-1 pb-3 pt-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${mode === "login" ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>登录</button>
                <button type="button" aria-pressed={mode !== "login"} onClick={() => changeMode("register")} className={`-mb-px ml-7 border-b-2 px-1 pb-3 pt-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${mode !== "login" ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>注册账号</button>
                <ShieldCheck className="mb-3 ml-auto text-muted-foreground" size={17} strokeWidth={1.5} />
              </div>

              <div className="mb-8">
                <p className="eyebrow">{mode === "login" ? "Your personal workspace" : mode === "register" ? "Create your account" : "账号注册 / 邮箱验证"}</p>
                <h2 className="page-heading mt-3 text-2xl sm:text-3xl">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{subtitle}</p>
              </div>

              <form className="space-y-5" onSubmit={submit} aria-busy={loading}>
                <div className="space-y-2.5">
                  <Label htmlFor="email">邮箱地址</Label>
                  <Input id="email" type="email" className="h-12 bg-background" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
                </div>
                {mode !== "verify" ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="password">密码</Label>
                      {mode === "register" && <span id="password-hint" className="text-xs text-muted-foreground">至少 8 位字符</span>}
                    </div>
                    <div className="relative">
                      <Input id="password" className="h-12 bg-background pr-12" type={showPassword ? "text" : "password"} value={password} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-describedby={mode === "register" ? "password-hint" : undefined} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
                      <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} className="absolute inset-y-1 right-1 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setShowPassword(value => !value)}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <Label htmlFor="code">邮箱验证码</Label>
                    <Input id="code" className="h-12 bg-background font-mono text-lg tracking-[0.2em]" value={code} autoComplete="one-time-code" inputMode="numeric" minLength={4} maxLength={12} onChange={(event) => setCode(event.target.value)} required />
                  </div>
                )}
                {devCode && <div className="break-all border-l-2 border-primary bg-muted p-4 text-sm text-primary">开发验证码：<b className="font-mono">{devCode}</b></div>}
                {message && <div role="status" className="flex gap-2 border-l-2 border-success bg-muted p-4 text-sm leading-6 text-success"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><span>{message}</span></div>}
                {error && <div role="alert" className="border-l-2 border-danger bg-muted p-4 text-sm leading-6 text-danger">{error}</div>}
                <Button className="h-12 w-full justify-between px-5" disabled={loading}>
                  <span>{loading ? "正在处理…" : mode === "login" ? "登录工作台" : mode === "register" ? "创建账号" : "完成验证"}</span>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                </Button>
              </form>
              <p className="mt-5 text-xs leading-6 text-muted-foreground">{mode === "login" ? "用电趋势、余额变化与提醒，在一个工作台里查看。" : "验证邮箱后，即可登录并设置自己的宿舍用电提醒。"}</p>
              {announcements.length > 0 && <div className="mt-7 border-t border-border pt-5"><AnnouncementsNotice announcements={announcements} /></div>}
            </div>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4 text-[10px] tracking-wide text-muted-foreground sm:px-9">
          <span>山东大学 · 青岛校区宿舍电量监控</span>
          <span className="hidden uppercase tracking-[0.16em] sm:inline">Everyday energy, in view</span>
        </footer>
      </div>
    </main>
  );
}
