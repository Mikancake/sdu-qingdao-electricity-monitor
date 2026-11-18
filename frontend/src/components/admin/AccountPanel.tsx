import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label } from "../ui/input";
import { KeyRound, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";

export function AccountPanel({
  admin,
  onUpdateProfile,
  onUpdatePassword,
  savingProfile,
  savingPassword
}: {
  admin?: { username: string; display_name?: string | null };
  onUpdateProfile: (payload: { display_name?: string | null }) => void;
  onUpdatePassword: (payload: { old_password: string; new_password: string }) => void;
  savingProfile: boolean;
  savingPassword: boolean;
}) {
  const [displayName, setDisplayName] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    setDisplayName(admin?.display_name ?? "");
  }, [admin?.display_name]);

  return (
    <section className="admin-page-section space-y-4" aria-labelledby="account-workspace-title">
      <div className="border-b border-border pb-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">身份与安全</p><h2 id="account-workspace-title" className="mt-1 font-[family-name:var(--font-display)] text-xl tracking-tight">账户工作台</h2><p className="mt-1 text-sm text-muted-foreground">更新管理员资料或轮换登录凭据。</p></div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <Card className="border-border bg-panel shadow-sm">
        <CardHeader>
          <CardTitle>管理员资料</CardTitle>
        </CardHeader>
        <CardContent><form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          onUpdateProfile({ display_name: displayName.trim() || null });
        }}>
          <div>
            <div className="text-sm font-medium">用户名</div>
            <div className="rounded-md border border-border bg-muted/35 px-3 py-2 text-sm">{admin?.username ?? "--"}</div>
          </div>
          <div>
            <Label htmlFor="admin-display-name">显示名</Label>
            <Input id="admin-display-name" maxLength={120} disabled={savingProfile} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </div>
          <Button type="submit" disabled={savingProfile}>
            {savingProfile ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存资料
          </Button>
        </form></CardContent>
      </Card>

      <Card className="border-border bg-panel shadow-sm">
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
        </CardHeader>
        <CardContent><form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          onUpdatePassword({ old_password: oldPassword, new_password: newPassword });
        }}>
          <p className="text-xs text-muted-foreground">更新后，其他管理会话将失效。</p>
          <div>
            <Label htmlFor="admin-old-password">旧密码</Label>
            <Input
              id="admin-old-password"
              type="password"
              autoComplete="current-password" required maxLength={128} disabled={savingPassword}
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="admin-new-password">新密码</Label>
            <Input
              id="admin-new-password"
              type="password"
              autoComplete="new-password" required maxLength={128} disabled={savingPassword}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={savingPassword || !oldPassword || newPassword.length < 8}>
            {savingPassword ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
            更新密码
          </Button>
        </form></CardContent>
      </Card>
      </div>
    </section>
  );
}
