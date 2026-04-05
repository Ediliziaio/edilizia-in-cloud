/**
 * Badge colorato per lo stato di una campagna SMS.
 *
 * @param stato - Stato della campagna
 */
import { Badge } from "@/components/ui/badge";
import type { SmsCampagnaStato } from "@/types/sms-marketing";

interface SmsStatsBadgeProps {
  stato: SmsCampagnaStato;
}

const STATO_CONFIG: Record<SmsCampagnaStato, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  bozza: { label: "Bozza", variant: "outline", className: "text-muted-foreground" },
  pianificata: { label: "Pianificata", variant: "secondary", className: "bg-blue-100 text-blue-700 border-blue-200" },
  in_corso: { label: "In corso", variant: "default", className: "bg-amber-100 text-amber-700 border-amber-200" },
  completata: { label: "Completata", variant: "default", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  annullata: { label: "Annullata", variant: "destructive", className: "bg-red-100 text-red-700 border-red-200" },
};

export function SmsStatsBadge({ stato }: SmsStatsBadgeProps) {
  const config = STATO_CONFIG[stato] ?? STATO_CONFIG.bozza;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}
