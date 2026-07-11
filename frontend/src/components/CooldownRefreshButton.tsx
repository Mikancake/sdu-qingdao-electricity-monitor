import { memo, useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";

import { Button } from "./ui/button";

interface CooldownRefreshButtonProps {
  availableAt?: string | null;
  checking: boolean;
  compact?: boolean;
  className?: string;
  onClick: () => void;
}

function secondsUntil(value?: string | null) {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function useCooldownSeconds(availableAt?: string | null) {
  const [seconds, setSeconds] = useState(() => secondsUntil(availableAt));

  useEffect(() => {
    let timer: number | undefined;

    const update = () => {
      const next = secondsUntil(availableAt);
      setSeconds((current) => (current === next ? current : next));
      if (next > 0) {
        timer = window.setTimeout(update, Math.min(1000, next * 1000));
      }
    };

    update();
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [availableAt]);

  return seconds;
}

export const CooldownRefreshButton = memo(function CooldownRefreshButton({
  availableAt,
  checking,
  compact = false,
  className,
  onClick
}: CooldownRefreshButtonProps) {
  const cooldownSeconds = useCooldownSeconds(availableAt);
  const coolingDown = cooldownSeconds > 0;
  const title = coolingDown
    ? compact
      ? `${cooldownSeconds}s 后可刷新`
      : "手动同步有 5 分钟冷却"
    : "立即同步一次当前电量";

  return (
    <Button
      className={className}
      size={compact ? "icon" : "sm"}
      variant="secondary"
      disabled={checking || coolingDown}
      onClick={onClick}
      title={title}
    >
      {checking ? <Loader2 className="animate-spin" size={15} /> : <RefreshCcw size={15} />}
      {!compact ? (coolingDown ? `${cooldownSeconds}s 后可刷新` : "立即刷新") : null}
    </Button>
  );
});
