/**
 * @file SmsTriggerBadge.tsx
 * @description Badge per il tipo di trigger di un messaggio SMS.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { Badge } from "@/components/ui/badge";
import { User, Zap, Code } from "lucide-react";
import type { SmsTriggerType } from "@/types/sms";

interface SmsTriggerBadgeProps {
  triggerType: SmsTriggerType | null;
  className?: string;
}

const TRIGGER_CONFIG: Record<SmsTriggerType, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  manual:     { label: "Manuale",     icon: User,  className: "text-gray-700 bg-gray-100" },
  automation: { label: "Automazione", icon: Zap,   className: "text-orange-700 bg-orange-50" },
  api:        { label: "API",         icon: Code,  className: "text-teal-700 bg-teal-50" },
};

export function SmsTriggerBadge({ triggerType, className = "" }: SmsTriggerBadgeProps) {
  if (!triggerType) return null;

  const config = TRIGGER_CONFIG[triggerType];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1 text-xs ${config.className} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
