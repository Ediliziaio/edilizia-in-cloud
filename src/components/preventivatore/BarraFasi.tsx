/**
 * La barra delle fasi del preventivatore: fissa in alto, con il totale sempre in
 * vista. È la barra del Fotovoltaico (`lib/fotovoltaico/wizardUI.tsx`) resa
 * uguale per ogni modulo, con in più il totale a destra e il puntino rosso
 * quando in una fase manca qualcosa.
 *
 * - Indietro è sempre libero; avanti solo dove lo decide chi la usa (`bloccati`).
 * - Da telefono le fasi diventano pillole col nome corto, quella attiva si porta
 *   al centro.
 * - La posizione sticky la decide la pagina (`className`): dipende dal padding del
 *   contenitore che scorre (vedi `CompanyLayout`).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { minutiRimasti } from "@/lib/preventivatore/fasi";

export interface PassoPreventivatore {
  key: string;
  /** Il nome per esteso: «Composizione offerta». */
  label: string;
  /** Telefono: il nome corto della pillola: «Offerta». */
  breve?: string;
}

export interface BarraFasiProps {
  passi: PassoPreventivatore[];
  corrente: string;
  /** Fasi con la spunta verde. */
  completati?: ReadonlySet<string>;
  /** Fasi in cui manca qualcosa: puntino rosso. */
  conAvviso?: ReadonlySet<string>;
  /** Fasi che non si aprono ancora (non cliccabili). */
  bloccati?: ReadonlySet<string>;
  onSelect: (key: string) => void;
  /** Il totale sempre in vista; `null` quando non c'è ancora niente da sommare. */
  totale?: { valore: string; etichetta?: string } | null;
  /** In coda alla barra (computer): per esempio il pulsante «Anteprima». */
  destra?: ReactNode;
  /** Sticky e offset: la decide la pagina. */
  className?: string;
  ariaLabel?: string;
}

export function BarraFasi({
  passi, corrente, completati, conAvviso, bloccati, onSelect, totale, destra, className, ariaLabel = "Fasi del preventivo",
}: BarraFasiProps) {
  const indice = Math.max(0, passi.findIndex((p) => p.key === corrente));
  const pct = Math.round(((indice + 1) / Math.max(1, passi.length)) * 100);
  const minuti = minutiRimasti(passi.length, indice);
  const rigaRef = useRef<HTMLElement | null>(null);

  // Telefono: le pillole scorrono; quella della fase attiva si porta al centro.
  useEffect(() => {
    const riga = rigaRef.current;
    const attiva = riga?.querySelector<HTMLElement>(`[data-fase="${corrente}"]`);
    if (!riga || !attiva || riga.scrollWidth <= riga.clientWidth) return;
    riga.scrollTo({ left: attiva.offsetLeft - (riga.clientWidth - attiva.clientWidth) / 2, behavior: "smooth" });
  }, [corrente]);

  return (
    <div className={cn("border-b border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.05)]", className)}>
      <div className="flex items-stretch px-4 sm:px-6 max-md:px-2 lg:max-xl:px-3">
        <nav
          ref={rigaRef}
          aria-label={ariaLabel}
          className="fv-tab-scroll flex min-h-0 min-w-0 flex-1 gap-0 overflow-x-auto max-md:gap-1 max-md:py-1.5 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
        >
          {passi.map((p, i) => {
            const attivo = p.key === corrente;
            const fatto = completati?.has(p.key) ?? false;
            const avviso = !attivo && (conAvviso?.has(p.key) ?? false);
            const cliccabile = !(bloccati?.has(p.key) ?? false);
            return (
              <button
                key={p.key}
                type="button"
                data-fase={p.key}
                aria-label={p.label}
                title={p.label}
                data-state={attivo ? "active" : fatto ? "completed" : "pending"}
                onClick={() => cliccabile && onSelect(p.key)}
                disabled={!cliccabile}
                aria-current={attivo ? "step" : undefined}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] border-transparent px-2.5 py-2.5 text-sm font-medium transition-colors hover:bg-slate-50 lg:max-xl:px-2 xl:gap-2.5 xl:px-4",
                  attivo && "border-orange-500 bg-white font-semibold text-slate-900",
                  fatto && !attivo && "text-slate-700",
                  !attivo && !fatto && "text-slate-500",
                  !cliccabile && "cursor-not-allowed opacity-45 hover:bg-transparent",
                  // Telefono: pillola col nome corto — fatte in verde, l'attiva piena, le altre spente.
                  "tap-compact max-md:gap-0 max-md:rounded-full max-md:border max-md:px-2.5 max-md:py-1 max-md:text-[11px]",
                  attivo && "max-md:border-orange-500 max-md:bg-orange-500 max-md:text-white",
                  fatto && !attivo && "max-md:border-emerald-200 max-md:bg-emerald-50 max-md:text-emerald-800",
                  !attivo && !fatto && "max-md:border-slate-200",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold max-md:hidden",
                    !attivo && !fatto && "border-slate-300 bg-slate-100 text-slate-500",
                    attivo && "border-orange-500 bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_2px_8px_rgba(249,115,22,0.4)]",
                    fatto && !attivo && "border-emerald-600 bg-emerald-600 text-white",
                  )}
                >
                  {fatto && !attivo ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> : i + 1}
                </span>
                <span className="flex flex-col items-start text-left leading-tight">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 max-xl:hidden">Passo {i + 1}</span>
                  <span>{p.breve ?? p.label}</span>
                </span>
                {avviso && (
                  <span
                    role="img"
                    aria-label="Manca qualcosa"
                    className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-red-500 max-md:right-0.5 max-md:top-0.5"
                  />
                )}
              </button>
            );
          })}
        </nav>
        {(totale || destra) && (
          <div className="ml-2 flex shrink-0 items-center gap-3 border-l border-slate-200 pl-4 max-md:hidden">
            {totale && (
              <div className="flex flex-col items-end justify-center leading-tight" aria-live="polite">
                {/* Tra 1024 e 1279 px la barra laterale dell'app toglie 240 px: l'etichetta cede il posto alle fasi. */}
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 lg:max-xl:hidden">{totale.etichetta ?? "Totale IVA incl."}</span>
                <span className="text-xl font-bold tabular-nums tracking-tight text-slate-900">{totale.valore}</span>
              </div>
            )}
            {destra}
          </div>
        )}
      </div>
      {/* Telefono: la fase la dicono già le pillole e il totale sta nella barra in basso. */}
      <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-slate-500 sm:px-6 max-md:hidden lg:max-xl:px-3">
        <span>
          <strong className="text-slate-900">Passo {indice + 1} di {passi.length}</strong> · {passi[indice]?.label}
        </span>
        <div className="h-1 max-w-[200px] flex-1 overflow-hidden rounded-full bg-slate-200" role="presentation">
          <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-eic-amber transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span>
          {pct}%{minuti > 0 && ` · ~${minuti} min`}
        </span>
      </div>
    </div>
  );
}
