/**
 * @file SmsStatusBadge.tsx
 * @description Badge colorato per lo stato di un messaggio SMS transazionale.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { Badge } from "@/components/ui/badge";
import type { SmsStatus } from "@/types/sms";
import { SMS_STATUS_LABELS } from "@/types/sms";

interface SmsStatusBadgeProps {
  status: SmsStatus;
  className?: string;
}

const STATUS_VARIANTS: Record<SmsStatus, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  queued:    { variant: "outline",     className: "text-gray-500 border-gray-300" },
  sending:   { variant: "secondary",   className: "text-blue-700 bg-blue-50 border-blue-200" },
  sent:      { variant: "secondary",   className: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  delivered: { variant: "default",     className: "text-green-700 bg-green-50 border-green-200" },
  failed:    { variant: "destructive", className: "" },
  received:  { variant: "secondary",   className: "text-purple-700 bg-purple-50 border-purple-200" },
};

export function SmsStatusBadge({ status, className = "" }: SmsStatusBadgeProps) {
  const { variant, className: variantClass } = STATUS_VARIANTS[status] ?? STATUS_VARIANTS.queued;

  return (
    <Badge variant={variant} className={`text-xs ${variantClass} ${className}`}>
      {SMS_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
