import { createApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label } from "../ui/input";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { describeError } from "./utils";

export function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const api = useMemo(() => createApiClient(), []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: api.adminLogin,
    onSuccess: (result) => onLogin(result.access_token),
    onError: (err) => setError(describeError(err))
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    loginMutation.mutate({ username, password });
  }

  return (
    <main className="app-background flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck size={20} />
          </div>
          <CardTitle>管理后台</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">使用管理员用户名和密码登录。</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="admin-username">用户名</Label>
              <Input id="admin-username" value={username} onChange={(event) => setUsername(event.target.value)} required />
            </div>
            <div>
              <Label htmlFor="admin-password">密码</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <div className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div> : null}
            <Button className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
