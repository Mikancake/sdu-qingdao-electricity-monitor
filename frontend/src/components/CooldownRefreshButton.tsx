import { memo, useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";

import { Button } from "./ui/button";

import { cn } from "../lib/utils";

interface CooldownRefreshButtonProps {
  availableAt?: string | null;
  roomLabel: string;
  busyElsewhere?: boolean;
  checking: boolean;
  compact?: boolean;
  className?: string;
  onClick: () => void;
}

function useCooldownSeconds(availableAt?: string | null) {
  const deadline = availableAt ? Date.parse(availableAt) : NaN;
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!Number.isFinite(deadline)) return;
    let timer: number | undefined;

    const update = () => {
      const current = Date.now();
      const remaining = deadline - current;
      setNow(current);
      if (remaining > 0) {
        timer = window.setTimeout(update, (remaining - 1) % 1000 + 1);
      }
    };

    update();
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [deadline]);

  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

export const CooldownRefreshButton = memo(function CooldownRefreshButton({
  availableAt,
  roomLabel,
  busyElsewhere = false,
  checking,
  compact = false,
  className,
  onClick
}: CooldownRefreshButtonProps) {
  const cooldownSeconds = useCooldownSeconds(availableAt);
  const blocked = checking || busyElsewhere || cooldownSeconds > 0;
  const countdown = cooldownSeconds < 60
    ? `${cooldownSeconds} 秒`
    : `${Math.floor(cooldownSeconds / 60)} 分 ${cooldownSeconds % 60} 秒`;
  const label = checking ? "正在刷新" : busyElsewhere ? "其他宿舍正在刷新" : cooldownSeconds > 0 ? `${countdown}后可刷新` : "立即刷新";
  const title = `${roomLabel}：${label}`;
  const iconOnly = compact && !blocked;

  return (
    <Button
      type="button"
      className={cn(blocked && "cursor-not-allowed opacity-60", className)}
      size={iconOnly ? "icon" : "sm"}
      variant="secondary"
      aria-disabled={blocked}
      aria-busy={checking}
      aria-label={title}
      onClick={() => { if (!blocked) onClick(); }}
      title={title}
    >
      {checking ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : <RefreshCcw aria-hidden="true" size={15} />}
      {iconOnly ? null : label}
    </Button>
  );
});
