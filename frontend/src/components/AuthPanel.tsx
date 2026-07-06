import { FormEvent, useMemo, useState } from "react";
import { BatteryCharging, Bell, Building2, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";

import { ApiError, createApiClient } from "../lib/api";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input, Label } from "./ui/input";

interface AuthPanelProps {
  onLogin: (token: string) => void;
}

type AuthMode = "login" | "register" | "verify";

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.detail === "string") {
      return error.detail;
    }
    return JSON.stringify(error.detail);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败";
}

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "login") {
        const result = await api.login({ email, password });
        onLogin(result.access_token);
        return;
      }

      if (mode === "register") {
        const result = await api.register({ email, password });
        setDevCode(result.dev_verification_code ?? null);
        setMode("verify");
        setMessage(result.email_sent ? "验证码已发送，请检查邮箱。" : "开发模式已返回验证码。");
        return;
      }

      await api.verifyEmail({ email, code });
      setMode("login");
      setMessage("邮箱已验证，可以登录。");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "login" ? "欢迎回来" : mode === "register" ? "创建账号" : "验证邮箱";
  const subtitle =
    mode === "login"
      ? "输入邮箱和密码进入电量控制台。"
      : mode === "register"
        ? "填写邮箱和密码，完成验证后即可使用。"
        : "输入收到的验证码完成账号验证。";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[980px] overflow-hidden rounded-xl border border-border bg-panel shadow-soft">
        <div className="grid min-h-[620px] lg:grid-cols-[1fr_420px]">
          <section className="hidden border-r border-border bg-muted/40 p-8 lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <BatteryCharging size={21} />
                </div>
                <div>
                  <div className="text-sm font-semibold">Electricity Monitor</div>
                </div>
              </div>

              <div className="mt-12 max-w-md">
                <h1 className="text-3xl font-semibold tracking-normal text-foreground">宿舍用电，准时知道</h1>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  登录后绑定宿舍、查看电量变化，并在余额不足前收到邮件提醒。
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-lg border border-border bg-panel p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Mail size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">邮箱账号</div>
                    <div className="mt-1 text-xs text-muted-foreground">用于登录、验证和接收提醒</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-panel p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">宿舍绑定</div>
                    <div className="mt-1 text-xs text-muted-foreground">一个账号可以绑定多个宿舍</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-panel p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Bell size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">低电量提醒</div>
                    <div className="mt-1 text-xs text-muted-foreground">每个宿舍可以设置独立提醒策略</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-center p-6 sm:p-8">
            <Card className="w-full border-0 shadow-none">
              <CardContent className="p-0">
                <div className="mb-8 lg:hidden">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <BatteryCharging size={21} />
                  </div>
                  <div className="mt-4 text-sm font-semibold">Electricity Monitor</div>
                </div>

                <div className="mb-6">
                  <h2 className="text-2xl font-semibold tracking-normal">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
                </div>

                <div className="mb-6 flex rounded-lg border border-border bg-muted p-1">
                  <button
                    className={`h-8 flex-1 rounded-md text-sm transition ${
                      mode === "login" ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                    onClick={() => setMode("login")}
                    type="button"
                  >
                    登录
                  </button>
                  <button
                    className={`h-8 flex-1 rounded-md text-sm transition ${
                      mode !== "login" ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                    onClick={() => setMode("register")}
                    type="button"
                  >
                    注册
                  </button>
                </div>

                <form className="space-y-4" onSubmit={submit}>
                  <div>
                    <Label htmlFor="email">邮箱</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      autoComplete="email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>

                  {mode !== "verify" ? (
                    <div>
                      <Label htmlFor="password">密码</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={8}
                        required
                      />
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="code">验证码</Label>
                      <Input id="code" value={code} onChange={(event) => setCode(event.target.value)} required />
                    </div>
                  )}

                  {devCode ? (
                    <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                      开发验证码：<span className="font-semibold">{devCode}</span>
                    </div>
                  ) : null}

                  {message ? (
                    <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
                      <ShieldCheck size={15} />
                      {message}
                    </div>
                  ) : null}

                  {error ? <div className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div> : null}

                  <Button className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="animate-spin" size={16} /> : mode === "login" ? <KeyRound size={16} /> : <Mail size={16} />}
                    {mode === "login" ? "登录" : mode === "register" ? "继续" : "完成验证"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
