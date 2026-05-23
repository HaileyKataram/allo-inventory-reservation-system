"use client";

import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastMessage = {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  description?: string;
};

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info
};

export function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 grid w-[calc(100%-2rem)] max-w-sm gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];

        return (
          <div
            key={toast.id}
            className={cn(
              "rounded-lg border bg-white p-4 text-sm shadow-lg",
              toast.type === "success" && "border-teal-200",
              toast.type === "error" && "border-red-200",
              toast.type === "info" && "border-zinc-200"
            )}
          >
            <div className="flex gap-3">
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  toast.type === "success" && "text-teal-700",
                  toast.type === "error" && "text-red-700",
                  toast.type === "info" && "text-zinc-600"
                )}
              />
              <div>
                <div className="font-medium text-zinc-950">{toast.title}</div>
                {toast.description && <div className="mt-1 text-zinc-600">{toast.description}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
