import { useId, useRef } from "react";
import { ChevronDown, Megaphone, X } from "lucide-react";

import type { Announcement } from "../lib/types";
import { cn, formatDateTime } from "../lib/utils";

interface AnnouncementsNoticeProps {
  announcements: Announcement[];
  className?: string;
  heading?: string;
}

function PublishedTime({ item }: { item: Announcement }) {
  const value = item.published_at ?? item.created_at;
  if (!Number.isFinite(Date.parse(value))) return null;
  return <time dateTime={value} className="block text-xs text-muted-foreground">发布于 {formatDateTime(value)}</time>;
}

export function AnnouncementsNotice({ announcements, className, heading = "公告" }: AnnouncementsNoticeProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const latest = announcements[0];
  if (!latest) return null;

  return (
    <section aria-labelledby={`${id}-heading`} className={cn("announcement-rail min-w-0 rounded-sm border border-border bg-muted/25", className)}>
      <h2 id={`${id}-heading`} className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
        <Megaphone size={15} aria-hidden="true" className="shrink-0 text-primary" />
        {heading}（{announcements.length}）
      </h2>
      <div className="space-y-2 px-4 py-3">
        <h3 className="line-clamp-2 break-words text-sm font-medium">{latest.title}</h3>
        <p className="line-clamp-5 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{latest.content}</p>
        <PublishedTime item={latest} />
      </div>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={event => {
          event.currentTarget.focus({ preventScroll: true });
          dialog.current?.showModal();
        }}
        className="flex min-h-11 w-full items-center justify-center gap-1 border-t border-border px-4 py-2 text-xs font-medium text-primary hover:bg-primary/5"
      >
        查看全部{heading} <ChevronDown size={14} aria-hidden="true" />
      </button>
      <dialog
        id={id}
        ref={dialog}
        aria-labelledby={`${id}-title`}
        onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
        className="fixed inset-0 m-auto w-[min(35rem,calc(100%-2rem))] max-w-full overflow-hidden rounded-lg border border-border bg-panel p-0 text-foreground shadow-lg backdrop:bg-black/50"
      >
        <div className="flex max-h-[80dvh] flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
            <h2 id={`${id}-title`} className="font-semibold">全部{heading}（{announcements.length}）</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label={`关闭${heading}`} className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div role="region" aria-label={`${heading}列表`} tabIndex={0} className="space-y-5 overflow-y-auto overscroll-contain p-4">
            {announcements.map(item => (
              <article key={item.id} className="space-y-1.5 break-words">
                <h3 className="text-sm font-medium">{item.title}</h3>
                <p className="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
                <PublishedTime item={item} />
              </article>
            ))}
          </div>
        </div>
      </dialog>
    </section>
  );
}
