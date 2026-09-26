/**
 * ScontoGlobaleField — il campo "Sconto globale" dei preventivatori verticali,
 * con le regole di scontistica aziendale applicate davvero.
 *
 * Prima le regole di `/azienda/impostazioni/scontistica` valevano in due
 * verticali su dieci (serramenti e fotovoltaico). Negli altri otto — Bagni,
 * Tetti, Elettrico, Termoidraulico, Pavimenti, Piscine, Climatizzazione,
 * Ristrutturazione — il campo era un numero libero: si poteva scrivere 60% e
 * il preventivo usciva così. Un limite che vale in due posti su dieci non è un
 * limite, è un suggerimento.
 *
 * Comportamento oltre il massimo consentito: NON si scrive il valore e non lo
 * si riporta di nascosto al massimo (sarebbe un numero plausibile mai chiesto).
 * Si dice che è oltre il limite e si offre di portarlo al massimo con un clic.
 * Chi ha il permesso di approvare sconti non viene bloccato: vede solo il limite.
 *
 * Il vincolo vero deve stare anche sul database (C3): finché non c'è, questo
 * controllo copre l'interfaccia ma non una scrittura fatta per altra via.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, Tag } from "lucide-react";
import { useDiscountRules } from "@/hooks/useDiscountRules";
import { evaluateDiscountRules, classifyDiscount } from "@/lib/serramenti/discountRules";
import { usePermissions } from "@/hooks/usePermissions";

interface Props {
  /** id dell'input, per l'etichetta (resta quello già usato dal verticale). */
  id: string;
  /** Sconto globale corrente, in percentuale. */
  value: number;
  /** Chiamata solo con un valore ammesso. */
  onCommit: (value: number) => void;
  /**
   * Imponibile PRIMA dello sconto globale: è l'importo su cui le regole
   * ragionano (fascia importo), lo stesso che usa il preventivatore serramenti.
   */
  imponibileLordo: number;
  /** Verticale, per le regole legate a un `tipo_lavoro` specifico. */
  tipoLavoro: string;
}

/** Stessa coercizione dei PctField dei verticali: vuoto → 0, clamp [0,100]. */
function toPct(raw: string): number {
  const t = raw.trim();
  if (t === "") return 0;
  const v = Number(t.replace(",", "."));
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

export function ScontoGlobaleField({ id, value, onCommit, imponibileLordo, tipoLavoro }: Props) {
  const { data: regole = [] } = useDiscountRules();
  const { canApproveDiscounts } = usePermissions();

  const esito = evaluateDiscountRules(regole, {
    importo: imponibileLordo,
    tipoLavoro,
  });

  // Bozza locale: serve perché un valore oltre il limite si vede scritto ma non
  // viene propagato al preventivo finché non rientra.
  const [bozza, setBozza] = useState<number | null>(null);
  const mostrato = bozza ?? value;
  const verdetto = classifyDiscount(mostrato, esito);
  const bloccato = verdetto === "blocked" && !canApproveDiscounts;
  const daApprovare = verdetto === "approve" && !canApproveDiscounts;

  const scrivi = (raw: string) => {
    const v = toPct(raw);
    if (classifyDiscount(v, esito) === "blocked" && !canApproveDiscounts) {
      setBozza(v); // resta a schermo con l'avviso, ma non entra nel preventivo
      return;
    }
    setBozza(null);
    onCommit(v);
  };

  const portaAlMassimo = () => {
    setBozza(null);
    onCommit(esito.scontoMaxPct);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="flex items-center gap-1 text-xs">
          Sconto globale
        </Label>
        <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
          <Tag className="h-3 w-3" />
          max {esito.scontoMaxPct.toFixed(1)}%
          {esito.approvaOltrePct != null && ` · ok fino a ${esito.approvaOltrePct.toFixed(1)}%`}
        </span>
      </div>

      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.5"
          value={Number.isFinite(mostrato) ? String(mostrato) : "0"}
          onChange={(e) => scrivi(e.target.value)}
          aria-invalid={bloccato}
          className={`h-9 pr-7 text-sm tabular-nums ${bloccato ? "border-destructive focus-visible:ring-destructive" : ""}`}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>

      {bloccato && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-4 text-destructive">
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Oltre il massimo consentito: non applicato al preventivo.
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-[10px] underline"
            onClick={portaAlMassimo}
          >
            Porta a {esito.scontoMaxPct.toFixed(1)}%
          </Button>
        </div>
      )}

      {!bloccato && daApprovare && (
        <p className="flex items-start gap-1 text-[10px] leading-4 text-amber-700">
          <Info className="mt-px h-3 w-3 shrink-0" />
          Sopra {esito.approvaOltrePct?.toFixed(1)}%: richiede l'approvazione del titolare.
        </p>
      )}

      {/* Telefono no: è una nota per chi configura, non per chi fa il preventivo. */}
      {!bloccato && !daApprovare && esito.isFallback && (
        <p className="text-[10px] leading-4 text-muted-foreground max-sm:hidden">
          Nessuna regola di scontistica configurata: vale il massimo predefinito.
        </p>
      )}
    </div>
  );
}
