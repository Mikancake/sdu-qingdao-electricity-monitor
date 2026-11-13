import { useEffect } from "react";
import type { ReactNode } from "react";
import { BatteryCharging, Building2, History, LayoutDashboard, Loader2, LogOut, Moon, RefreshCcw, Settings, Sun, UserRound } from "lucide-react";

import type { User } from "../lib/types";
import { Button } from "./ui/button";

export type ViewKey = "dashboard" | "rooms" | "records" | "settings";

interface AppShellProps {
  activeView: ViewKey;
  children: ReactNode;
  darkMode: boolean;
  user?: User;
  userLoading: boolean;
  userError: boolean;
  onChangeView: (view: ViewKey) => void;
  onLogout: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
}

const navItems: Array<{ key: ViewKey; label: string; description: string; icon: ReactNode }> = [
  { key: "dashboard", label: "总览", description: "用电概况", icon: <LayoutDashboard size={19} /> },
  { key: "rooms", label: "宿舍", description: "房间管理", icon: <Building2 size={19} /> },
  { key: "records", label: "记录", description: "历史查询", icon: <History size={19} /> },
  { key: "settings", label: "设置", description: "账号偏好", icon: <Settings size={19} /> }
];
const viewDescriptions: Record<ViewKey, string> = {
  dashboard: "余额、趋势与宿舍状态",
  rooms: "绑定房间与提醒策略",
  records: "查看每次电量查询结果",
  settings: "账号与通知偏好"
};

export function AppShell({
  activeView,
  children,
  darkMode,
  user,
  userLoading,
  userError,
  onChangeView,
  onLogout,
  onRefresh,
  onToggleTheme
}: AppShellProps) {
  const accountEmail = user?.email ?? (userLoading ? "账号信息加载中" : userError ? "账号信息加载失败" : "未获取到账号");
  const accountStatus = user
    ? "已验证账号"
    : userLoading
      ? "正在读取账号"
      : userError
        ? "请刷新数据或重新登录"
        : "暂无账号信息";
  const activeNav = navItems.find(item => item.key === activeView);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeView]);

  return (
    <div className="app-background min-h-screen text-foreground">
      <aside className="workspace-sidebar fixed inset-y-0 left-0 z-30 hidden w-52 flex-col overflow-y-auto border-r border-border bg-panel lg:flex">
        <div className="px-6 pb-8 pt-8">
          <div className="flex items-center gap-3">
            <BatteryCharging size={28} strokeWidth={1.5} className="text-primary" />
            <span className="text-lg font-semibold tracking-tight">宿舍电量</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">山东大学 · 青岛校区</p>
        </div>
        <nav aria-label="用户主导航" className="space-y-1 px-3">
          {navItems.map(item => (
            <button key={item.key} type="button" aria-current={activeView === item.key ? "page" : undefined} onClick={() => onChangeView(item.key)} className={`group flex w-full items-center gap-3 rounded-md border-l-2 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeView === item.key ? "border-primary bg-muted text-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <span className={activeView === item.key ? "text-primary" : ""}>{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{item.description}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto px-5 pb-5 pt-10">
          <div aria-live="polite" className="border-t border-border pt-5">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              {userLoading && !user ? <Loader2 size={14} className="animate-spin" /> : <UserRound size={14} />}
              <span className={userError && !user ? "text-warning" : ""}>{accountStatus}</span>
            </div>
            <p className="truncate text-xs font-medium" title={accountEmail}>{accountEmail}</p>
            <button type="button" onClick={onLogout} className="mt-4 flex w-full items-center justify-between rounded-md py-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span>退出登录</span><LogOut size={14} /></button>
          </div>
        </div>
      </aside>

      <div className="relative z-[2] min-w-0 lg:pl-52">
        <header className="workspace-topbar sticky top-0 z-20 border-b border-border bg-panel">
          <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-2 px-4 sm:px-7 lg:px-8">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">宿舍电量</span>
                <span className="text-muted-foreground">/</span>
                <span className="font-semibold">{activeNav?.label}</span>
              </div>
              <p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-xs">{viewDescriptions[activeView]}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button aria-label="刷新数据" size="icon" variant="ghost" onClick={onRefresh} title="刷新数据"><RefreshCcw size={16} /></Button>
              <Button aria-label={darkMode ? "切换为浅色主题" : "切换为深色主题"} size="icon" variant="ghost" onClick={onToggleTheme} title={darkMode ? "切换为浅色主题" : "切换为深色主题"}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}</Button>
              <Button aria-label="退出登录" className="lg:hidden" size="icon" variant="ghost" onClick={onLogout} title="退出登录"><LogOut size={16} /></Button>
            </div>
          </div>
          <div aria-live="polite" className="flex min-w-0 items-center gap-2 border-t border-border px-4 py-2 text-[10px] text-muted-foreground sm:px-7 lg:hidden">
            {userLoading && !user ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <UserRound size={12} className="shrink-0" />}
            <span className="min-w-0 truncate" title={accountEmail}>{accountEmail}</span>
            <span className={`ml-auto shrink-0 ${userError && !user ? "text-warning" : "text-muted-foreground"}`}>{accountStatus}</span>
          </div>
        </header>

        <main id="workspace-content" tabIndex={-1} className="workspace-main mx-auto w-full min-w-0 max-w-[1440px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 outline-none sm:px-7 lg:px-8 lg:pb-12 lg:pt-9">
          <div key={activeView} className="page-transition min-w-0">{children}</div>
        </main>

        <nav aria-label="用户移动导航" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-panel px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden">
          {navItems.map(item => (
            <button key={item.key} type="button" aria-current={activeView === item.key ? "page" : undefined} onClick={() => onChangeView(item.key)} className={`mx-2 flex min-h-14 flex-col items-center justify-center gap-1 border-t-2 py-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeView === item.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
