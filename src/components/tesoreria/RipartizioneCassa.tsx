/**
 * Ripartire un movimento su più voci (15/11/2026): un bonifico solo che paga
 * cose diverse, 1.000 € al fornitore = 700 di materiali + 300 di trasporto.
 *
 * Parte dalle quote già salvate, oppure da quelle che propone la fattura
 * collegata, oppure dalla voce attuale con tutto l'importo. Si salva solo
 * quando le quote fanno l'importo al centesimo: il database ricontrolla.
 */
import { useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/formatEuro";
import { centesimiDaTesto, type VoceCatalogo, type VoceMovimento } from "@/lib/finance/cassaVoci";
import { ScegliVoceCassa } from "./ScegliVoceCassa";

interface Riga {
  chiave: number;
  voce: { id: string; nome: string } | null;
  /** Quando la proposta indica una categoria intera: va precisata. */
  suggerimento?: string;
  importo: string;
}

const inTesto = (cents: number) => (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

function righeIniziali(voce: VoceMovimento | undefined, totale: number): Riga[] {
  const base = voce?.quote?.length ? voce.quote : voce?.proposta_quote?.length ? voce.proposta_quote : null;
  if (base) {
    return base.map((q, i) => {
      const precisa = q.livello === "area" || q.livello === "categoria";
      return { chiave: i, voce: precisa ? null : { id: q.id, nome: q.nome }, suggerimento: precisa ? q.nome : undefined, importo: inTesto(q.cents) };
    });
  }
  const principale = voce && voce.codice.includes(".") ? { id: voce.id, nome: voce.nome } : null;
  return [
    { chiave: 0, voce: principale, importo: inTesto(totale) },
    { chiave: 1, voce: null, importo: "" },
  ];
}

export function RipartizioneCassa({
  catalogo,
  importo,
  voce,
  occupato,
  onSalva,
  onTogli,
  onAnnulla,
}: {
  catalogo: VoceCatalogo[] | undefined;
  /** Con segno, in euro. */
  importo: number;
  voce: VoceMovimento | undefined;
  occupato: boolean;
  onSalva: (quote: { voce: string; cents: number }[]) => void;
  onTogli?: () => void;
  onAnnulla: () => void;
}) {
  const totale = Math.round(Math.abs(importo) * 100);
  const [righe, setRighe] = useState<Riga[]>(() => righeIniziali(voce, totale));
  const [attiva, setAttiva] = useState<number | null>(null);
  const [prossima, setProssima] = useState(100);

  const stato = useMemo(() => {
    const cents = righe.map((r) => centesimiDaTesto(r.importo));
    const somma = cents.reduce<number>((s, c) => s + (c ?? 0), 0);
    const ids = righe.map((r) => r.voce?.id).filter(Boolean);
    const problema =
      righe.length < 2 ? "Servono almeno due voci"
      : righe.some((r) => !r.voce) ? "Scegli la voce di ogni riga"
      : new Set(ids).size !== ids.length ? "Una voce compare due volte"
      : cents.some((c) => c === null || c <= 0) ? "Ogni riga ha un importo maggiore di zero"
      : null;
    return { cents, somma, resta: totale - somma, problema };
  }, [righe, totale]);
  const pronta = !stato.problema && stato.resta === 0;

  const cambia = (chiave: number, p: Partial<Riga>) => setRighe((rs) => rs.map((r) => (r.chiave === chiave ? { ...r, ...p } : r)));

  return (
    <div className="space-y-2" aria-label="Ripartizione su più voci">
      <p className="text-xs text-muted-foreground">
        Dividi i {formatEuro(totale / 100)} del movimento tra più voci. Nel cash flow ogni quota va nella sua riga.
        {!voce?.quote?.length && voce?.proposta_quote?.length ? " Le quote vengono dalla fattura collegata." : ""}
      </p>
      <ul className="space-y-1.5">
        {righe.map((r, i) => (
          <li key={r.chiave} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={cn(
                  "min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 text-left text-sm hover:bg-accent",
                  attiva === r.chiave && "border-primary ring-1 ring-primary",
                  !r.voce && "text-muted-foreground",
                )}
                aria-label={`Voce della riga ${i + 1}: ${r.voce?.nome ?? "da scegliere"}`}
                onClick={() => setAttiva(attiva === r.chiave ? null : r.chiave)}
              >
                {r.voce?.nome ?? (r.suggerimento ? `In «${r.suggerimento}»: scegli la voce` : "Scegli la voce")}
              </button>
              <Input
                className="h-8 w-28 text-right tabular-nums"
                inputMode="decimal"
                aria-label={`Importo della riga ${i + 1}`}
                value={r.importo}
                onChange={(e) => cambia(r.chiave, { importo: e.target.value })}
              />
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                aria-label={`Togli la riga ${i + 1}`}
                disabled={righe.length <= 2}
                onClick={() => setRighe((rs) => rs.filter((x) => x.chiave !== r.chiave))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {attiva === r.chiave && (
              <ScegliVoceCassa
                catalogo={catalogo}
                importo={importo}
                selezionata={r.voce?.id ?? null}
                altezza="max-h-56"
                onScegli={(v) => {
                  cambia(r.chiave, { voce: { id: v.id, nome: v.nome }, suggerimento: undefined });
                  setAttiva(null);
                }}
              />
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={righe.length >= 20}
          onClick={() => {
            setRighe((rs) => [...rs, { chiave: prossima, voce: null, importo: stato.resta > 0 ? inTesto(stato.resta) : "" }]);
            setProssima((n) => n + 1);
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi voce
        </Button>
        <span role="status" className={cn("tabular-nums", stato.resta === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
          {stato.resta === 0 ? "Quadra con il movimento" : stato.resta > 0 ? `Da ripartire: ${formatEuro(stato.resta / 100)}` : `Oltre l'importo di ${formatEuro(-stato.resta / 100)}`}
        </span>
      </div>
      {stato.problema && <p className="text-xs text-muted-foreground">{stato.problema}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {onTogli && voce?.quote?.length ? (
          <Button variant="ghost" size="sm" className="mr-auto text-muted-foreground" disabled={occupato} onClick={onTogli}>
            Togli la ripartizione
          </Button>
        ) : null}
        <Button variant="outline" size="sm" disabled={occupato} onClick={onAnnulla}>Annulla</Button>
        <Button
          size="sm"
          disabled={!pronta || occupato}
          onClick={() => onSalva(righe.map((r, i) => ({ voce: r.voce!.id, cents: stato.cents[i]! })))}
        >
          {occupato && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Salva la ripartizione
        </Button>
      </div>
    </div>
  );
}
