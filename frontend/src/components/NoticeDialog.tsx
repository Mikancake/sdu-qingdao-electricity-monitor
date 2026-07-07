import { useEffect } from "react";
import { AlertCircle, X } from "lucide-react";

interface NoticeDialogProps {
  message?: string | null;
  onClose: () => void;
  autoCloseMs?: number;
}

export function NoticeDialog({ message, onClose, autoCloseMs = 5000 }: NoticeDialogProps) {
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, message, onClose]);

  if (!message) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/25 px-4 backdrop-blur-md">
      <div
        aria-modal="true"
        className="w-full max-w-[440px] rounded-xl border border-border bg-panel/95 p-5 text-foreground shadow-2xl"
        role="alertdialog"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <AlertCircle size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">提示</div>
            <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{message}</div>
          </div>
          <button
            aria-label="关闭提示"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
