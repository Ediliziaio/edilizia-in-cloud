/**
 * Impianto visivo del pannello attività: fondo grigio chiaro e SEZIONI a card,
 * ognuna con una barra laterale nei colori del brand (blu navy #1E3A5F /
 * arancio #F97316) alternati, così l'occhio separa i blocchi senza leggere i
 * titoli. `ChipIcona` è l'icona su fondo colorato usata negli header di sezione
 * e accanto ai campi.
 */
import type { ElementType, ReactNode } from "react";

export type Tono = "blu" | "arancio" | "neutro";

const TONO_BARRA: Record<Tono, string> = {
  blu: "border-l-[#1E3A5F]",
  arancio: "border-l-orange-500",
  neutro: "border-l-slate-300 dark:border-l-slate-600",
};

const TONO_CHIP: Record<Tono, string> = {
  blu: "bg-[#1E3A5F]/10 text-[#1E3A5F] dark:bg-blue-400/15 dark:text-blue-300",
  arancio: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
  neutro: "bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export function ChipIcona({ icon: Icon, tono = "blu", className = "" }: { icon: ElementType; tono?: Tono; className?: string }) {
  return (
    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${TONO_CHIP[tono]} ${className}`}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

export function SezioneCard({
  titolo, icon, tono, azione, children, className = "",
}: {
  titolo?: string; icon?: ElementType; tono: Tono; azione?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-l-4 bg-card p-4 shadow-sm ${TONO_BARRA[tono]} ${className}`}>
      {titolo && (
        <div className="mb-3 flex items-center gap-2">
          {icon && <ChipIcona icon={icon} tono={tono} />}
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{titolo}</span>
          {azione}
        </div>
      )}
      {children}
    </section>
  );
}
