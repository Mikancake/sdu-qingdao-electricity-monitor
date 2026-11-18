import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, X } from "lucide-react";

import type { AdminView } from "./utils";

export interface AdminNavItem {
  key: AdminView;
  label: string;
  icon: ReactNode;
}

const primaryKeys: AdminView[] = ["status", "users", "rooms", "settings"];

export function MobileAdminNav({
  items,
  activeView,
  onChange
}: {
  items: AdminNavItem[];
  activeView: AdminView;
  onChange: (view: AdminView) => void;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const primaryItems = items.filter((item) => primaryKeys.includes(item.key));
  const secondaryItems = items.filter((item) => !primaryKeys.includes(item.key));
  const secondaryActive = !primaryKeys.includes(activeView);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (previousFocus ?? moreButtonRef.current)?.focus({ preventScroll: true });
    };
  }, [open]);

  const select = (view: AdminView) => {
    onChange(view);
    setOpen(false);
  };

  return createPortal(
    <>
      <nav
        aria-label="管理后台移动导航"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-panel px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 text-foreground lg:hidden"
      >
        {primaryItems.map((item) => (
          <button
            key={item.key}
            aria-current={activeView === item.key ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1.5 border-t-2 px-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeView === item.key ? "border-primary bg-primary/5 font-semibold text-primary" : "border-transparent text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => select(item.key)}
            type="button"
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
        <button
          ref={moreButtonRef}
          aria-expanded={open}
          aria-controls={open ? "admin-more-menu" : undefined}
          aria-label={secondaryActive ? `更多管理模块，当前：${items.find((item) => item.key === activeView)?.label}` : "更多管理模块"}
          aria-haspopup="dialog"
          className={`flex min-h-14 flex-col items-center justify-center gap-1.5 border-t-2 px-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${secondaryActive ? "border-primary bg-primary/5 font-semibold text-primary" : "border-transparent text-muted-foreground hover:bg-muted"}`}
          onClick={() => setOpen(true)}
          type="button"
        >
          <MoreHorizontal size={18} />
          <span>{secondaryActive ? items.find((item) => item.key === activeView)?.label : "更多"}</span>
        </button>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/50 text-foreground lg:hidden" onClick={() => setOpen(false)}>
          <div
            ref={sheetRef}
            id="admin-more-menu"
            aria-labelledby="admin-more-title"
            aria-modal="true"
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-xl border border-border bg-panel px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4 shadow-xl sm:px-6"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="eyebrow mb-4">全部管理模块</div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div id="admin-more-title" className="font-serif text-2xl">管理工作区</div>
                <div className="mt-1 text-xs text-muted-foreground">服务配置、内容发布与安全管理</div>
              </div>
              <button
                ref={closeRef}
                aria-label="关闭更多菜单"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={19} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {secondaryItems.map((item) => (
                <button
                  key={item.key}
                  aria-current={activeView === item.key ? "page" : undefined}
                  className={`flex min-w-0 items-center gap-2 rounded-md border px-3 py-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeView === item.key ? "border-primary/40 bg-primary/10 font-semibold text-primary" : "border-border bg-background text-foreground hover:border-primary/30"}`}
                  onClick={() => select(item.key)}
                  type="button"
                >
                  <span className="shrink-0 text-primary">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body
  );
}
