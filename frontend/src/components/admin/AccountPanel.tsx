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
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>管理员资料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>用户名</Label>
            <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">{admin?.username ?? "--"}</div>
          </div>
          <div>
            <Label htmlFor="admin-display-name">显示名</Label>
            <Input id="admin-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </div>
          <Button disabled={savingProfile} onClick={() => onUpdateProfile({ display_name: displayName.trim() || null })}>
            {savingProfile ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存资料
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="admin-old-password">旧密码</Label>
            <Input
              id="admin-old-password"
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="admin-new-password">新密码</Label>
            <Input
              id="admin-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
            />
          </div>
          <Button
            disabled={savingPassword || oldPassword.length === 0 || newPassword.length < 8}
            onClick={() => {
              onUpdatePassword({ old_password: oldPassword, new_password: newPassword });
              setOldPassword("");
              setNewPassword("");
            }}
          >
            {savingPassword ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
            更新密码
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
