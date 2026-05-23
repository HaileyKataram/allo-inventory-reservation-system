"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, target - Date.now()));
  const didExpire = useRef(false);

  useEffect(() => {
    didExpire.current = false;
    const interval = window.setInterval(() => {
      const next = Math.max(0, target - Date.now());
      setRemainingMs(next);
      if (next === 0 && !didExpire.current) {
        didExpire.current = true;
        onExpire?.();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [onExpire, target]);

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const urgencyClass =
    remainingMs === 0
      ? "text-red-700"
      : remainingMs < 60000
        ? "text-red-700"
        : remainingMs < 120000
          ? "text-orange-700"
          : "text-teal-700";

  return (
    <span className={cn("inline-flex min-w-12 justify-end font-mono font-medium", urgencyClass)}>
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}
