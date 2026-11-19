import { useRef, useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { chiavePrevisto, type PianoPrevisto, type TotalePrevistoSalvato } from "@/lib/orders/previsionaleSalvato";

const ore = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 });
const data = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function PrevisioniRegistrate({ piani, nomi, somme, totale, voce, onTogli, occupato = false }: {
  piani: readonly PianoPrevisto[];
  nomi: ReadonlyMap<string, string>;
  somme: ReadonlyMap<string, TotalePrevistoSalvato>;
  totale?: TotalePrevistoSalvato;
  voce: boolean;
  onTogli?: (chiave: string, operazione: string) => Promise<void>;
  occupato?: boolean;
}) {
  const [richiesta, setRichiesta] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const mutazione = useRef<{ chiave: string; id: string } | null>(null);
  const lock = useRef(false);
  async function togli(chiave: string) {
    if (!onTogli || lock.current) return;
    lock.current = true;
    setInCorso(true);
    setErrore("");
    try {
      if (mutazione.current?.chiave !== chiave) mutazione.current = { chiave, id: crypto.randomUUID() };
      await onTogli(chiave, mutazione.current.id);
      setRichiesta(null);
      mutazione.current = null;
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Impossibile rimuovere la previsione.");
    } finally {
      lock.current = false;
      setInCorso(false);
    }
  }

  if (!piani.length) return null;
  return (
    <section aria-label="Previsioni salvate" className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4 text-primary" />Previsioni salvate</h4>
        {totale && <div className="text-sm" aria-label={voce ? "Totale della voce" : "Totale manodopera pianificata della fase"}>
          {voce ? "Totale voce" : "Totale pianificato in fase"} <strong className="ml-1 tabular-nums">{ore.format(totale.ore)} h · {formatCurrency(totale.costo)}</strong>
          {totale.incompleto && <span className="ml-2 text-xs text-amber-800">Tariffe da completare</span>}
        </div>}
      </div>
      <div className="divide-y rounded-lg border bg-background">
        {piani.map((p) => {
          const chiave = chiavePrevisto(p.ambito);
          const effettivo = somme.get(chiave);
          const dichiarate = p.microOreGiorno * p.giorni.length * p.operai.length / 1e6;
          const assorbite = p.ambito.tipo === "fase" && (effettivo?.ore ?? 0) + 0.000001 < dichiarate;
          const chi = [...p.squadre.map((s) => s.nome), ...p.operai.filter((o) => p.persone.includes(o.id)).map((o) => o.nome)];
          return <div key={chiave} className="space-y-1 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="font-medium">{nomi.get(chiave) ?? "Lavorazione"} · {chi.join(", ")}</p>
                <p className="text-xs text-muted-foreground">{data(p.dal)} – {data(p.al)} · {p.giorni.length} gg · {ore.format(p.microOreGiorno / 1e6)} h al giorno per persona</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{ore.format(effettivo?.ore ?? 0)} h · {formatCurrency(effettivo?.costo ?? 0)}</span>
                {onTogli && <Button variant="ghost" size="icon" type="button" disabled={inCorso || occupato} className="h-7 w-7"
                  aria-label={`Rimuovi previsione per ${nomi.get(chiave) ?? "lavorazione"}`} onClick={() => { setRichiesta(chiave); setErrore(""); }}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
            {assorbite && <p className="text-xs text-muted-foreground">{ore.format(dichiarate - (effettivo?.ore ?? 0))} h comprese nelle previsioni delle voci.</p>}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Tariffe salvate</summary>
              <ul className="mt-1 space-y-0.5">
                {p.operai.map((o) => <li key={o.id}>{o.nome} · {o.tariffa == null ? "Da completare" : `${formatCurrency(o.tariffa)}/h`}</li>)}
              </ul>
            </details>
            {richiesta === chiave && <div className="flex flex-wrap items-center gap-2 pt-2" role="group" aria-label="Conferma rimozione previsione">
              <span className="text-xs">Rimuovere questa previsione?</span>
              <Button type="button" size="sm" variant="outline" disabled={inCorso || occupato} onClick={() => setRichiesta(null)}>Annulla</Button>
              <Button type="button" size="sm" variant="destructive" disabled={inCorso || occupato} onClick={() => void togli(chiave)}>Rimuovi</Button>
            </div>}
          </div>;
        })}
      </div>
      {errore && <p className="text-sm text-destructive" role="alert">{errore}</p>}
    </section>
  );
}
