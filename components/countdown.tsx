"use client";

import { useEffect, useMemo, useState } from "react";

export function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = Math.max(0, target - Date.now());
      setRemainingMs(next);
      if (next === 0) {
        onExpire?.();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [onExpire, target]);

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);

  return (
    <span className={remainingMs > 0 ? "font-mono text-teal-700" : "font-mono text-red-700"}>
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}
