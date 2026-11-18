import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

interface ActionNoticeProps {
  message?: string | null;
  onClose: () => void;
}

export function ActionNotice({ message, onClose }: ActionNoticeProps) {
  if (!message) return null;
  return createPortal(
    <aside aria-label="操作反馈" className="action-notice fixed z-40 flex items-start gap-3 rounded-xl border border-border bg-panel p-4 text-foreground shadow-lg">
      <Info aria-hidden="true" size={18} className="mt-1 shrink-0 text-primary" />
      <p role="status" className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-6">{message}</p>
      <button type="button" onClick={onClose} aria-label="关闭提示" className="-my-2 grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-muted">
        <X aria-hidden="true" size={18} />
      </button>
    </aside>,
    document.body
  );
}
