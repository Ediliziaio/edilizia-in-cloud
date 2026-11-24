/**
 * @file SmsDirectionIcon.tsx
 * @description Icona direzionale per messaggi SMS in entrata/uscita.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import type { SmsDirection } from "@/types/sms";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface SmsDirectionIconProps {
  direction: SmsDirection;
  className?: string;
  showLabel?: boolean;
}

export function SmsDirectionIcon({ direction, className = "", showLabel = false }: SmsDirectionIconProps) {
  const t = useT();
  const isOutbound = direction === "outbound";

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-medium", className)}
      title={isOutbound ? t("Inviato") : t("Ricevuto")}
    >
      {isOutbound ? (
        <ArrowUpRight className="h-4 w-4 text-blue-600" aria-label={t("Uscita")} />
      ) : (
        <ArrowDownLeft className="h-4 w-4 text-purple-600" aria-label={t("Entrata")} />
      )}
      {showLabel && (
        <span className={isOutbound ? "text-blue-600" : "text-purple-600"}>
          {isOutbound ? t("Uscita") : t("Entrata")}
        </span>
      )}
    </span>
  );
}
