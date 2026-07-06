import { ReactNode } from "react";
import {
  BatteryCharging,
  Building2,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  RefreshCcw,
  Settings,
  Sun,
  UserRound
} from "lucide-react";

import type { User } from "../lib/types";
import { Button } from "./ui/button";

export type ViewKey = "dashboard" | "rooms" | "records" | "settings";

interface AppShellProps {
  activeView: ViewKey;
  children: ReactNode;
  darkMode: boolean;
  user?: User;
  onChangeView: (view: ViewKey) => void;
  onLogout: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
}

const navItems: Array<{ key: ViewKey; label: string; icon: ReactNode }> = [
  { key: "dashboard", label: "总览", icon: <LayoutDashboard size={17} /> },
  { key: "rooms", label: "宿舍", icon: <Building2 size={17} /> },
  { key: "records", label: "记录", icon: <History size={17} /> },
  { key: "settings", label: "设置", icon: <Settings size={17} /> }
];

export function AppShell({
  activeView,
  children,
  darkMode,
  user,
  onChangeView,
  onLogout,
  onRefresh,
  onToggleTheme
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-border bg-panel lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BatteryCharging size={19} />
          </div>
          <div>
            <div className="text-sm font-semibold">Electricity Monitor</div>
            <div className="text-xs text-muted-foreground">Community Edition</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm transition ${
                activeView === item.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => onChangeView(item.key)}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted px-3 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-panel text-muted-foreground">
              <UserRound size={16} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{user?.email ?? "未登录"}</div>
              <div className="text-xs text-muted-foreground">已验证账号</div>
            </div>
          </div>
          <Button className="w-full justify-start" variant="ghost" onClick={onLogout}>
            <LogOut size={16} />
            退出登录
          </Button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
          <div className="min-w-0">
            <div className="text-sm font-semibold">
              {activeView === "dashboard"
                ? "电量总览"
                : activeView === "rooms"
                  ? "宿舍绑定"
                  : activeView === "records"
                    ? "查询记录"
                    : "账号设置"}
            </div>
            <div className="truncate text-xs text-muted-foreground">{user?.email ?? "正在读取账号"}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="secondary" onClick={onRefresh} title="刷新">
              <RefreshCcw size={16} />
            </Button>
            <Button size="icon" variant="secondary" onClick={onToggleTheme} title="切换主题">
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button className="lg:hidden" size="icon" variant="secondary" onClick={onLogout} title="退出登录">
              <LogOut size={16} />
            </Button>
          </div>
        </header>

        <nav className="grid grid-cols-4 gap-2 border-b border-border bg-panel px-3 py-2 lg:hidden">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`flex h-9 items-center justify-center gap-2 rounded-md text-xs transition ${
                activeView === item.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => onChangeView(item.key)}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
