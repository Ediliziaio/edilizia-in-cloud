/**
 * Mattoncini comuni alle pagine dell'area Fatturato e aziende del super admin
 * (Insoluti, Cohort, Modelli recupero, Produttori, Commercialisti, Piani…).
 *
 * Stessa forma ovunque, così l'occhio impara la pagina una volta:
 *   1. IntestazioneArea — titolo + una riga di spiegazione + azioni a destra.
 *      Da telefono la spiegazione sparisce (regola del progetto: niente testi
 *      descrittivi su mobile) e le azioni secondarie restano icone.
 *   2. RigaRiepilogo — le card con i numeri che contano, due per riga da
 *      telefono e fino a cinque su schermo largo: niente spazi vuoti.
 *   3. StatoVuoto — cosa manca e cosa fare, non solo «nessun dato».
 */
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface IntestazioneAreaProps {
  icona: LucideIcon;
  titolo: string;
  /** Una riga sola: cosa trovi qui. Nascosta da telefono. */
  spiegazione?: string;
  /** Pulsanti a destra: le secondarie icon-only su telefono le decide chi chiama. */
  azioni?: React.ReactNode;
  /** Piccolo badge accanto al titolo (es. «12 aziende»). */
  badge?: React.ReactNode;
}

export function IntestazioneArea({ icona: Icona, titolo, spiegazione, azioni, badge }: IntestazioneAreaProps) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icona className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">{titolo}</h1>
          {badge}
        </div>
        {spiegazione && <p className="hidden truncate text-sm text-muted-foreground sm:block">{spiegazione}</p>}
      </div>
      {azioni && <div className="flex shrink-0 items-center gap-2">{azioni}</div>}
    </div>
  );
}

export type TonoRiepilogo = "neutro" | "buono" | "attenzione" | "critico" | "spento";

export interface VoceRiepilogo {
  etichetta: string;
  valore: React.ReactNode;
  dettaglio?: React.ReactNode;
  tono?: TonoRiepilogo;
  icona?: LucideIcon;
  /** Link interno: la card porta al dettaglio. */
  to?: string;
  /** Oppure un'azione (es. filtro): la card diventa un pulsante. */
  onClick?: () => void;
  /** Filtro applicato: bordo evidenziato. */
  attivo?: boolean;
}

const COLORE_VALORE: Record<TonoRiepilogo, string> = {
  neutro: "text-foreground",
  buono: "text-emerald-600 dark:text-emerald-400",
  attenzione: "text-amber-600 dark:text-amber-400",
  critico: "text-destructive",
  spento: "text-muted-foreground",
};

const COLONNE: Record<3 | 4 | 5 | 6, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-3 xl:grid-cols-6",
};

export function RigaRiepilogo({ voci, colonne = 4, className }: { voci: VoceRiepilogo[]; colonne?: 3 | 4 | 5 | 6; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3", COLONNE[colonne], className)}>
      {voci.map((v) => {
        const Icona = v.icona;
        const contenuto = (
          <>
            <div className="flex items-center gap-1.5">
              {Icona && <Icona className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{v.etichetta}</p>
            </div>
            <p className={cn("mt-1 text-xl font-semibold leading-tight tabular-nums md:text-2xl", COLORE_VALORE[v.tono ?? "neutro"])}>{v.valore}</p>
            {v.dettaglio && <p className="mt-0.5 truncate text-xs text-muted-foreground">{v.dettaglio}</p>}
          </>
        );
        const base = cn(
          "block min-w-0 rounded-lg border bg-card p-3 text-left",
          (v.to || v.onClick) && "transition-colors hover:bg-muted/50",
          v.attivo && "border-primary ring-1 ring-primary/40",
        );
        if (v.to) return <Link key={v.etichetta} to={v.to} className={base}>{contenuto}</Link>;
        if (v.onClick) {
          return (
            <button key={v.etichetta} type="button" onClick={v.onClick} aria-pressed={v.attivo} className={base}>
              {contenuto}
            </button>
          );
        }
        return <div key={v.etichetta} className={base}>{contenuto}</div>;
      })}
    </div>
  );
}

export function StatoVuoto({ icona: Icona, titolo, testo, azione }: { icona: LucideIcon; titolo: string; testo?: string; azione?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icona className="h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
      <p className="text-sm font-medium">{titolo}</p>
      {testo && <p className="max-w-md text-sm text-muted-foreground">{testo}</p>}
      {azione}
    </div>
  );
}
