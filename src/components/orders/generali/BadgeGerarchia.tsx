import { CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { appartenenza, eGenerale, type RigaGerarchia } from "@/lib/orders/generali/gerarchiaScelta";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Etichetta «Generale» accanto al codice, nei selettori di commessa. */
export function BadgeGenerale({ riga, className }: { riga: RigaGerarchia; className?: string }) {
  const t = useT();
  if (!eGenerale(riga)) return null;
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded bg-indigo-50 px-1.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200",
        className,
      )}
    >
      {t("Generale")}
    </span>
  );
}

/** «↳ in O-0003 · Via Lotti» sotto una figlia; niente per le altre commesse. */
export function RigaAppartenenza({ riga, nascondi }: { riga: RigaGerarchia; nascondi?: boolean }) {
  const testo = appartenenza(riga);
  if (!testo || nascondi) return null;
  return (
    <span className="flex items-center gap-1 truncate text-[11px] text-indigo-700">
      <CornerDownRight className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{testo}</span>
    </span>
  );
}
