import type { ReservationStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles: Record<ReservationStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  CONFIRMED: "border-teal-200 bg-teal-50 text-teal-800",
  RELEASED: "border-zinc-200 bg-zinc-50 text-zinc-700",
  EXPIRED: "border-red-200 bg-red-50 text-red-800"
};

export function ReservationStatusBadge({ status, className }: { status: ReservationStatus; className?: string }) {
  return <Badge className={cn(statusStyles[status], className)}>{status}</Badge>;
}
