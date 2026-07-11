import { useEffect, useRef } from "react";
import { AlertCircle, X } from "lucide-react";

interface NoticeDialogProps {
  message?: string | null;
  onClose: () => void;
  autoCloseMs?: number;
}

export function NoticeDialog({ message, onClose, autoCloseMs = 5000 }: NoticeDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => onCloseRef.current(), autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, message]);

  useEffect(() => {
    if (!message) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );
      if (!focusable.length) return;
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
      previousFocus?.focus({ preventScroll: true });
    };
  }, [message]);

  if (!message) return null;

  return (
    <div className="notice-backdrop fixed inset-0 z-[80] flex items-center justify-center px-4">
      <div
        ref={dialogRef}
        aria-describedby="notice-dialog-message"
        aria-labelledby="notice-dialog-title"
        aria-modal="true"
        className="notice-dialog w-full max-w-[440px] rounded-xl border border-border bg-panel/98 p-5 text-foreground shadow-2xl"
        role="alertdialog"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <AlertCircle size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div id="notice-dialog-title" className="text-sm font-semibold">提示</div>
            <div id="notice-dialog-message" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {message}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="关闭提示"
            className="app-control -mr-1 -mt-1 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onCloseRef.current()}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
