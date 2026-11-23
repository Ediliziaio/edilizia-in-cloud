/**
 * «A cosa si riferisce»: il movimento diviso in quote, dentro «Nuova registrazione» (23/11/2026).
 * Si cerca il cliente o il fornitore, si toccano le sue fatture aperte e l'importo di ognuna si
 * propone da solo (il residuo, o quello che manca se è meno). Le voci senza fattura portano
 * categoria e commessa. La barra in fondo dice quanto manca; se una combinazione di fatture fa
 * esattamente l'importo, la propone.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  bilancio, chiaveDocumento, combinazioniEsatte, daCentesimi, ETICHETTA_TIPO, euro, filtraDocumenti, importoProposto,
  type DocumentoAperto, type Quota,
} from "@/lib/primaNota/quoteMovimento";

export const CATEGORIE_QUOTA = {
  entrata: [
    { value: "incasso", label: "Incasso senza fattura" },
    { value: "finanziamento", label: "Finanziamento" },
    { value: "giroconto", label: "Giroconto" },
    { value: "altro", label: "Altro" },
  ],
  uscita: [
    { value: "fornitore", label: "Fornitore senza fattura" },
    { value: "stipendi", label: "Stipendi" },
    { value: "fiscale", label: "Tasse / F24" },
    { value: "costo", label: "Costo aziendale" },
    { value: "utenze", label: "Utenze" },
    { value: "affitto", label: "Affitto" },
    { value: "commissioni", label: "Commissioni bancarie" },
    { value: "altro", label: "Altro" },
  ],
} as const;

const dataIt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
let progressivo = 0;
const nuovaChiave = () => `q${++progressivo}`;

export function useDocumentiAperti(companyId: string | undefined, direction: "entrata" | "uscita", attivo: boolean) {
  return useQuery({
    queryKey: ["prima-nota-documenti-aperti", companyId, direction],
    enabled: attivo && !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("prima_nota_documenti_aperti" as never, { p_company: companyId, p_direction: direction } as never);
      if (error) throw error;
      return ((data ?? []) as DocumentoAperto[]).map(d => ({ ...d, residuo: Number(d.residuo), totale: d.totale == null ? null : Number(d.totale) }));
    },
  });
}

interface Props {
  companyId: string | undefined;
  direction: "entrata" | "uscita";
  importo: string;
  quote: Quota[];
  onQuote: (q: Quota[]) => void;
}

export function QuoteMovimento({ companyId, direction, importo, quote, onQuote }: Props) {
  const documenti = useDocumentiAperti(companyId, direction, true);
  const [cerca, setCerca] = useState("");
  const usati = useMemo(() => new Set(quote.flatMap(q => (q.tipo === "libera" ? [] : [chiaveDocumento(q.documento)]))), [quote]);
  const conti = bilancio(importo, quote);
  const risultati = useMemo(() => (cerca.trim() ? filtraDocumenti(documenti.data ?? [], cerca, usati, 12) : []), [documenti.data, cerca, usati]);
  // La proposta serve quando non si è ancora scelto niente e l'importo c'è.
  const proposte = useMemo(
    () => (quote.length === 0 && conti.totale > 0 ? combinazioniEsatte(documenti.data ?? [], importo, usati) : []),
    [documenti.data, importo, quote.length, conti.totale, usati],
  );

  const aggiungi = (d: DocumentoAperto) => {
    onQuote([...quote, { chiave: nuovaChiave(), tipo: d.tipo, documento: d, importo: importoProposto(d.residuo, conti.mancano) }]);
    setCerca("");
  };
  const aggiungiTutte = (docs: DocumentoAperto[]) =>
    onQuote([...quote, ...docs.map(d => ({ chiave: nuovaChiave(), tipo: d.tipo, documento: d, importo: daCentesimi(Math.round(d.residuo * 100)) }) as Quota)]);
  const aggiungiLibera = (importoQuota = conti.mancano > 0 ? daCentesimi(conti.mancano) : "") =>
    onQuote([...quote, { chiave: nuovaChiave(), tipo: "libera", categoria: "", orderId: null, descrizione: "", importo: importoQuota }]);
  const cambia = (chiave: string, campi: Partial<Quota>) => onQuote(quote.map(q => (q.chiave === chiave ? ({ ...q, ...campi } as Quota) : q)));
  const togli = (chiave: string) => onQuote(quote.filter(q => q.chiave !== chiave));

  const chi = direction === "entrata" ? "cliente" : "fornitore";
  return (
    <section aria-label="A cosa si riferisce" className="space-y-3 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">A cosa si riferisce</h3>
        <span className="text-xs text-muted-foreground">{direction === "entrata" ? "fatture emesse da incassare" : "fatture ricevute da pagare"}</span>
      </div>

      <div className="relative">
        <Input value={cerca} onChange={e => setCerca(e.target.value)} placeholder={`Cerca ${chi}, numero fattura o commessa`} aria-label={`Cerca ${chi} o fattura`} />
        {cerca.trim() && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md" role="listbox">
            {documenti.isPending && <li className="px-3 py-2 text-sm text-muted-foreground">Carico le fatture aperte…</li>}
            {documenti.isError && <li className="px-3 py-2 text-sm text-destructive">Fatture non caricate: {(documenti.error as Error).message}</li>}
            {documenti.isSuccess && risultati.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nessuna fattura aperta trovata.</li>}
            {risultati.map(d => (
              <li key={chiaveDocumento(d)}>
                <button type="button" role="option" aria-selected={false} onClick={() => aggiungi(d)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{d.controparte ?? "—"}</span>
                    <span className="text-muted-foreground"> · n. {d.numero} del {dataIt(d.data)}{d.order_code ? ` · ${d.order_code}` : ""}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{euro(d.residuo)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {proposte.length > 0 && (
        <div className="space-y-1.5">
          {proposte.map(p => (
            <button key={p.map(chiaveDocumento).join()} type="button" onClick={() => aggiungiTutte(p)}
              className="flex w-full items-start gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left text-sm hover:bg-primary/10">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="font-medium">{p.length === 1 ? "Questa fattura fa" : `Queste ${p.length} fatture fanno`} esattamente {euro(conti.totale / 100)}</span>
                <span className="block truncate text-xs text-muted-foreground">{p[0].controparte} · {p.map(d => d.numero).join(", ")}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {quote.length > 0 && (
        <ul className="divide-y rounded-md border">
          {quote.map(q => (
            <li key={q.chiave} className="space-y-2 px-3 py-2">
              {q.tipo === "libera" ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Select value={q.categoria} onValueChange={v => cambia(q.chiave, { categoria: v })}>
                    <SelectTrigger aria-label="Categoria della voce"><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>{CATEGORIE_QUOTA[direction].map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <CommessaCombobox value={q.orderId} onChange={id => cambia(q.chiave, { orderId: id ?? null })} ariaLabel="Commessa della voce" nessunaLabel="Nessuna commessa" />
                  <Input className="sm:col-span-2" value={q.descrizione} onChange={e => cambia(q.chiave, { descrizione: e.target.value })} placeholder="Descrizione (es. commissioni RiBa)" aria-label="Descrizione della voce" />
                </div>
              ) : (
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{q.documento.controparte ?? "—"}</span>
                  <span className="text-muted-foreground"> · {ETICHETTA_TIPO[q.tipo]} n. {q.documento.numero} del {dataIt(q.documento.data)}</span>
                  <span className="block text-xs text-muted-foreground">
                    Residuo {euro(q.documento.residuo)}{q.documento.order_code ? ` · commessa ${q.documento.order_code}` : ""}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex h-9 flex-1 items-center gap-1 rounded-md border px-2">
                  <Input type="number" inputMode="decimal" step="0.01" min="0.01" value={q.importo} aria-label="Importo della quota"
                    onWheel={e => e.currentTarget.blur()} onChange={e => cambia(q.chiave, { importo: e.target.value })}
                    className="h-full border-0 px-0 text-right tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                  <span className="text-sm text-muted-foreground">€</span>
                </div>
                {q.tipo !== "libera" && Math.round(Number(q.importo) * 100) < Math.round(q.documento.residuo * 100) && Number(q.importo) > 0 && (
                  <span className="whitespace-nowrap text-xs text-amber-700 dark:text-amber-400">acconto</span>
                )}
                <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label="Togli la quota" onClick={() => togli(q.chiave)}><X className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => aggiungiLibera()}>
          <Plus className="mr-1 h-3.5 w-3.5" />Voce senza fattura
        </Button>
        {conti.mancano > 0 && quote.length > 0 && (
          <span className="text-xs text-muted-foreground">es. commissioni, arrotondamento, una commessa</span>
        )}
      </div>

      <Barra totale={conti.totale} assegnato={conti.assegnato} />
    </section>
  );
}

function Barra({ totale, assegnato }: { totale: number; assegnato: number }) {
  if (totale <= 0) return <p className="text-xs text-muted-foreground">Scrivi prima l'importo del movimento.</p>;
  const mancano = totale - assegnato;
  const perc = Math.min(100, Math.max(0, (assegnato / totale) * 100));
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full transition-all", mancano === 0 ? "bg-emerald-600" : mancano < 0 ? "bg-destructive" : "bg-primary")} style={{ width: `${perc}%` }} />
      </div>
      <p className={cn("text-xs tabular-nums", mancano === 0 ? "text-emerald-700 dark:text-emerald-400" : mancano < 0 ? "text-destructive" : "text-muted-foreground")}>
        Assegnati {euro(assegnato / 100)} di {euro(totale / 100)}
        {mancano > 0 ? ` · mancano ${euro(mancano / 100)}` : mancano < 0 ? ` · ${euro(-mancano / 100)} in più` : " · tutto assegnato"}
      </p>
    </div>
  );
}
