import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
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
  const activeNavIndex = Math.max(0, navItems.findIndex((item) => item.key === activeView));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeView]);

  return (
    <div className="app-background user-app-shell min-h-screen text-foreground">
      <aside className="app-sidebar liquid-surface glass-panel fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-border/70 lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BatteryCharging size={19} />
          </div>
          <div>
            <div className="text-sm font-semibold">Electricity Monitor</div>
          </div>
        </div>

        <nav
          aria-label="用户主导航"
          className="user-sidebar-nav relative flex flex-1 flex-col gap-1 px-3 py-4"
          style={{ "--app-nav-offset": `${activeNavIndex * 2.75}rem` } as CSSProperties}
        >
          <span aria-hidden="true" className="app-sidebar-nav-indicator" />
          {navItems.map((item) => (
            <button
              key={item.key}
              aria-current={activeView === item.key ? "page" : undefined}
              className={`app-nav-item relative z-[1] flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm ${
                activeView === item.key
                  ? "app-nav-item-active text-primary"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
          <div className="glass-tile mb-3 flex items-center gap-3 rounded-lg border border-border/60 px-3 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-panel/70 text-muted-foreground">
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
        <header className="app-topbar liquid-surface glass-panel sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border/70 px-4 lg:px-6">
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

        <nav
          aria-label="用户移动导航"
          className="mobile-liquid-nav liquid-surface glass-panel fixed grid grid-cols-4 gap-1 lg:hidden"
          style={{ "--app-nav-offset": `${activeNavIndex * 100}%` } as CSSProperties}
        >
          <span aria-hidden="true" className="mobile-nav-indicator" />
          {navItems.map((item) => (
            <button
              key={item.key}
              aria-current={activeView === item.key ? "page" : undefined}
              className={`app-nav-item mobile-nav-item relative z-[1] flex items-center justify-center gap-1 text-xs ${
                activeView === item.key
                  ? "app-nav-item-active text-primary"
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

        <main className="app-main-content mx-auto w-full max-w-7xl px-4 pb-24 pt-5 lg:px-6 lg:pb-5">
          <div key={activeView} className="page-transition">{children}</div>
        </main>
      </div>
    </div>
  );
}
