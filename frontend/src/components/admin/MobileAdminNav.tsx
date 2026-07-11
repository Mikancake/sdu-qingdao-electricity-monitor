import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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
  const activePrimaryIndex = primaryItems.findIndex((item) => item.key === activeView);
  const indicatorIndex = activePrimaryIndex >= 0 ? activePrimaryIndex : primaryItems.length;
  const secondaryActive = activePrimaryIndex < 0;

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
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (previousFocus ?? moreButtonRef.current)?.focus({ preventScroll: true });
    };
  }, [open]);

  const select = (view: AdminView) => {
    onChange(view);
    setOpen(false);
  };

  return (
    <>
      <nav
        aria-label="管理后台移动导航"
        className="admin-mobile-bottom-nav liquid-surface glass-panel fixed grid grid-cols-5 gap-1 lg:hidden"
        style={{ "--mobile-admin-offset": `${indicatorIndex * 100}%` } as CSSProperties}
      >
        <span aria-hidden="true" className="admin-mobile-nav-indicator" />
        {primaryItems.map((item) => (
          <button
            key={item.key}
            aria-current={activeView === item.key ? "page" : undefined}
            className={`app-nav-item admin-mobile-nav-item relative z-[1] ${
              activeView === item.key ? "text-primary" : "text-muted-foreground"
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
          className={`app-nav-item admin-mobile-nav-item relative z-[1] ${secondaryActive ? "text-primary" : "text-muted-foreground"}`}
          onClick={() => setOpen(true)}
          type="button"
        >
          <MoreHorizontal size={18} />
          <span>更多</span>
        </button>
      </nav>

      {open ? (
        <div className="mobile-sheet-backdrop fixed inset-0 z-[70] flex items-end lg:hidden" onClick={() => setOpen(false)}>
          <div
            ref={sheetRef}
            aria-labelledby="admin-more-title"
            aria-modal="true"
            className="mobile-sheet glass-panel w-full rounded-t-[24px] border border-border px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-foreground/15" />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div id="admin-more-title" className="text-sm font-semibold">更多管理功能</div>
                <div className="mt-1 text-xs text-muted-foreground">Token、邮件、账号与审计</div>
              </div>
              <button
                ref={closeRef}
                aria-label="关闭更多菜单"
                className="app-control flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={19} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {secondaryItems.map((item) => (
                <button
                  key={item.key}
                  aria-current={activeView === item.key ? "page" : undefined}
                  className={`mobile-sheet-action ${activeView === item.key ? "mobile-sheet-action-active" : ""}`}
                  onClick={() => select(item.key)}
                  type="button"
                >
                  <span className="mobile-sheet-action-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
