import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { formatDecimalIT, parseDecimalIT } from "@/lib/parseDecimalIT";
import type { EconomiaFase, VociCosto } from "@/lib/orders/economiaFasi";
import { Input } from "@/components/ui/input";

const eur = { format: formatCurrency };
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

/** «manodopera 1.140,00 € · materiali e forniture 320,00 €»: solo le voci che ci sono. */
export function dettaglioVoci(voci: VociCosto): string {
  const parti = [
    voci.manodopera ? `manodopera ${eur.format(voci.manodopera)}` : null,
    voci.ditte ? `ditte ${eur.format(voci.ditte)}` : null,
    voci.materiali ? `materiali e forniture ${eur.format(voci.materiali)}` : null,
  ].filter(Boolean);
  return parti.length > 0 ? parti.join(" · ") : "nessun costo";
}

/** Il costo consuntivo ha superato il previsto (con un previsto da confrontare). */
export function costoSforato(e: EconomiaFase): boolean {
  return e.costoPrevisto > 0 && e.scostamento > 0;
}

/**
 * Il margine da leggere per una fase: sul consuntivo quando la fase è chiusa
 * (i costi sono quelli) o quando ha già superato il previsto (può solo
 * peggiorare); altrimenti quello previsto, perché un consuntivo a metà lavori
 * farebbe un margine finto, più alto del vero.
 */
export function margineDaMostrare(e: EconomiaFase, completata: boolean): { pct: number | null; su: "consuntivo" | "previsto" } {
  return completata || costoSforato(e)
    ? { pct: e.margineConsuntivoPct, su: "consuntivo" }
    : { pct: e.marginePrevistoPct, su: "previsto" };
}

/** Il testo di un importo scritto a mano: vuoto = nessun importo; «errore» se non è un numero da zero in su. */
export function leggiImporto(testo: string): number | null | "errore" {
  const t = testo.trim();
  if (!t) return null;
  if (!/^[\d.,\s€]+$/.test(t) || !/\d/.test(t)) return "errore";
  const v = parseDecimalIT(t);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : "errore";
}

/**
 * Il venduto della fase, scritto dall'ufficio: si salva uscendo dal campo o con
 * Invio, Esc annulla. Vuoto torna al venduto delle righe del contratto, che il
 * campo mostra in grigio.
 */
export function CampoVenduto({
  economia,
  nomeFase,
  onSalva,
  inTabella = false,
}: {
  economia: EconomiaFase;
  nomeFase: string;
  onSalva: (importo: number | null) => void;
  /** In una tabella il campo sembra testo finché non ci si passa sopra o lo si usa. */
  inTabella?: boolean;
}) {
  const scritto = economia.fonteVenduto === "fase" ? economia.venduto : null;
  const testoDi = (v: number | null) => (v == null ? "" : formatDecimalIT(v));
  const [testo, setTesto] = useState(() => testoDi(scritto));
  const [errore, setErrore] = useState(false);
  const inScrittura = useRef(false);
  const annulla = useRef(false);

  // Un salvataggio (o un collega) cambia l'importo: il campo si riallinea, ma
  // non mentre lo si sta scrivendo.
  useEffect(() => {
    if (!inScrittura.current) setTesto(testoDi(scritto));
  }, [scritto]);

  const esci = () => {
    inScrittura.current = false;
    if (annulla.current) {
      annulla.current = false;
      setTesto(testoDi(scritto));
      setErrore(false);
      return;
    }
    const valore = leggiImporto(testo);
    if (valore === "errore") {
      setErrore(true);
      return;
    }
    setErrore(false);
    setTesto(testoDi(valore));
    if (valore !== scritto) onSalva(valore);
  };

  return (
    <span className="relative inline-flex items-center">
      <Input
        value={testo}
        inputMode="decimal"
        autoComplete="off"
        aria-label={`Venduto di ${nomeFase}`}
        aria-invalid={errore || undefined}
        title={errore ? "Scrivi un importo, per esempio 8.500 o 8.500,50" : undefined}
        placeholder={economia.fonteVenduto === "righe" ? formatDecimalIT(economia.vendutoRighe) : "da inserire"}
        onFocus={() => { inScrittura.current = true; }}
        onChange={(e) => { setTesto(e.target.value); setErrore(false); }}
        onBlur={esci}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            annulla.current = true;
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "h-8 w-36 pr-7 text-right font-semibold tabular-nums placeholder:font-normal",
          inTabella && "border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-input",
          errore && "border-rose-400 focus-visible:ring-rose-400",
        )}
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">€</span>
    </span>
  );
}

function Cifra({ titolo, children, nota, className }: { titolo: string; children: ReactNode; nota?: ReactNode; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{titolo}</dt>
      <dd className={cn("flex h-8 items-center gap-2 text-sm font-semibold tabular-nums text-foreground", className)}>{children}</dd>
      {nota && <dd className="text-[11px] leading-tight text-muted-foreground">{nota}</dd>}
    </div>
  );
}

/**
 * Riga «Economia» di una fase (06/10/2026): venduto, costo previsto, costo
 * consuntivo e margine in colonna, ognuno col suo permesso. Il venduto si
 * scrive qui (con `onSalvaVenduto`). Le voci dei costi stanno nell'elenco di
 * persone e ditte subito sotto e nel titolo delle cifre. Da telefono non c'è.
 */
export function EconomiaFaseRiga({
  economia,
  nomeFase,
  completata = false,
  vedeVenduto,
  vedeCosti,
  vedeMargini,
  onSalvaVenduto,
}: {
  economia: EconomiaFase;
  nomeFase: string;
  /** Fase chiusa: il margine si legge sul consuntivo. */
  completata?: boolean;
  vedeVenduto: boolean;
  vedeCosti: boolean;
  vedeMargini: boolean;
  /** Chi può scrivere il venduto della fase. */
  onSalvaVenduto?: (importo: number | null) => void;
}) {
  if (!vedeVenduto && !vedeCosti) return null;
  const sforato = vedeCosti && costoSforato(economia);
  const conVenduto = economia.fonteVenduto !== null;
  const margine = margineDaMostrare(economia, completata);
  const mostraMargine = vedeVenduto && vedeMargini && conVenduto && margine.pct != null;
  const notaVenduto =
    economia.fonteVenduto === "righe"
      ? "dalle righe del contratto"
      : economia.fonteVenduto === "fase" && economia.vendutoRighe > 0 && economia.vendutoRighe !== economia.venduto
        ? `righe del contratto ${eur.format(economia.vendutoRighe)}`
        : null;

  return (
    <div className="flex flex-wrap items-start gap-2 max-sm:hidden">
      <span className="w-24 shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Economia</span>
      <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-8 gap-y-3 lg:grid-cols-4">
        {vedeVenduto && (
          <Cifra titolo="Venduto" nota={notaVenduto}>
            {onSalvaVenduto
              ? <CampoVenduto economia={economia} nomeFase={nomeFase} onSalva={onSalvaVenduto} />
              : conVenduto ? eur.format(economia.venduto) : <span className="font-normal text-muted-foreground">—</span>}
          </Cifra>
        )}
        {vedeCosti && (
          <Cifra titolo="Costo previsto">
            <span title={dettaglioVoci(economia.previsto)}>{eur.format(economia.costoPrevisto)}</span>
          </Cifra>
        )}
        {vedeCosti && (
          <Cifra titolo="Costo consuntivo">
            <span className={sforato ? "text-rose-700" : undefined} title={dettaglioVoci(economia.consuntivo)}>{eur.format(economia.costoConsuntivo)}</span>
            {sforato && <span className="text-xs font-medium text-rose-700">+{eur.format(economia.scostamento)}</span>}
          </Cifra>
        )}
        {mostraMargine && (
          <Cifra
            titolo="Margine"
            className={margine.pct != null && margine.pct < 0 ? "text-rose-700" : undefined}
            nota={margine.su === "consuntivo" ? `previsto ${pct(economia.marginePrevistoPct)}` : "previsto, a lavori non finiti"}
          >
            {pct(margine.pct)}
          </Cifra>
        )}
      </dl>
    </div>
  );
}
