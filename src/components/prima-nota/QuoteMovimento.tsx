/**
 * «A cosa si riferisce»: il movimento diviso in quote, dentro «Nuova registrazione» (23/11/2026).
 * Si cerca il cliente o il fornitore, si toccano le sue fatture aperte e l'importo di ognuna si
 * propone da solo (il residuo, o quello che manca se è meno). Le voci senza fattura portano
 * categoria e commessa. La barra in fondo dice quanto manca; se una combinazione di fatture fa
 * esattamente l'importo, la propone.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Sparkles, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  bilancio, centesimi, chiaveDocumento, combinazioniEsatte, daCentesimi, ETICHETTA_TIPO, euro, filtraDocumenti, importoProposto,
  meseStipendi, nettoBonificoParlante, type DipendenteDaPagare, type DocumentoAperto, type Quota,
} from "@/lib/primaNota/quoteMovimento";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

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
/** Il nome del mese nella lingua di chi guarda (1 = gennaio). */
const nomeMese = (mese: number) => new Date(2024, mese - 1, 1).toLocaleDateString(intlCampo(), { month: "long" });
let progressivo = 0;
const nuovaChiave = () => `q${++progressivo}`;

export function useDocumentiAperti(companyId: string | undefined, direction: "entrata" | "uscita", attivo: boolean) {
  return useQuery({
    queryKey: ["prima-nota-documenti-aperti", companyId, direction],
    enabled: attivo && !!companyId,
    // Le fatture aperte cambiano poco e il calcolo dei residui costa: si tengono 5 minuti
    // (dopo una registrazione la lista si ricarica comunque).
    staleTime: 5 * 60_000,
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
  const t = useT();
  const documenti = useDocumentiAperti(companyId, direction, true);
  const [cerca, setCerca] = useState("");
  const usati = useMemo(() => new Set(quote.flatMap(q => (q.tipo === "libera" || q.tipo === "dipendente" || q.tipo === "f24" ? [] : [chiaveDocumento(q.documento)]))), [quote]);
  const [stipendiAperti, setStipendiAperti] = useState(false);
  const [f24Aperto, setF24Aperto] = useState(false);
  const conti = bilancio(importo, quote);
  const risultati = useMemo(() => (cerca.trim() ? filtraDocumenti(documenti.data ?? [], cerca, usati, 12) : []), [documenti.data, cerca, usati]);
  // La proposta serve quando non si è ancora scelto niente e l'importo c'è.
  const proposte = useMemo(
    () => (quote.length === 0 && conti.totale > 0 ? combinazioniEsatte(documenti.data ?? [], importo, usati) : []),
    [documenti.data, importo, quote.length, conti.totale, usati],
  );

  const stessoFornitore = (a: DocumentoAperto, b: DocumentoAperto) => (a.controparte ?? "").trim().toLowerCase() === (b.controparte ?? "").trim().toLowerCase();
  const aggiungi = (d: DocumentoAperto) => {
    setCerca("");
    if (d.tipo === "nota_credito") {
      // La nota va su una fattura dello stesso fornitore già nel movimento, e ne riduce il pagamento.
      const fattura = [...quote].reverse().find(q => q.tipo === "fattura_ricevuta" && stessoFornitore(q.documento, d));
      const nota = centesimi(d.residuo);
      const nuove = fattura && centesimi(fattura.importo) > nota
        ? quote.map(q => (q.chiave === fattura.chiave ? { ...q, importo: daCentesimi(centesimi(q.importo) - nota) } : q))
        : quote;
      onQuote([...nuove, { chiave: nuovaChiave(), tipo: "nota_credito", documento: d, fatturaChiave: fattura?.chiave ?? null, importo: daCentesimi(nota) }]);
      return;
    }
    onQuote([...quote, { chiave: nuovaChiave(), tipo: d.tipo, documento: d, importo: importoProposto(d.residuo, conti.mancano) }]);
  };
  const aggiungiTutte = (docs: DocumentoAperto[]) =>
    onQuote([...quote, ...docs.map(d => ({ chiave: nuovaChiave(), tipo: d.tipo, documento: d, importo: daCentesimi(Math.round(d.residuo * 100)) }) as Quota)]);
  // Bonifico parlante: si scrive il lordo che la fattura salda, in banca arriva il netto.
  const conRitenuta = (chiave: string, lordo: string) => {
    const { netto } = nettoBonificoParlante(lordo);
    cambia(chiave, { ritenuta: true, lordo, importo: centesimi(lordo) > 0 ? daCentesimi(Math.round(netto * 100)) : "" } as Partial<Quota>);
  };
  const aggiungiLibera = (importoQuota = conti.mancano > 0 ? daCentesimi(conti.mancano) : "") =>
    onQuote([...quote, { chiave: nuovaChiave(), tipo: "libera", categoria: "", orderId: null, descrizione: "", importo: importoQuota }]);
  const cambia = (chiave: string, campi: Partial<Quota>) => onQuote(quote.map(q => (q.chiave === chiave ? ({ ...q, ...campi } as Quota) : q)));
  const togli = (chiave: string) => onQuote(quote.filter(q => q.chiave !== chiave));

  const chi = direction === "entrata" ? t("cliente") : t("fornitore");
  return (
    <section aria-label={t("A cosa si riferisce")} className="space-y-3 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("A cosa si riferisce")}</h3>
        <span className="text-xs text-muted-foreground">{direction === "entrata" ? t("fatture emesse da incassare") : t("fatture ricevute da pagare")}</span>
      </div>

      <div className="relative">
        <Input value={cerca} onChange={e => setCerca(e.target.value)} placeholder={t("Cerca {chi}, numero fattura o commessa", { chi })} aria-label={t("Cerca {chi} o fattura", { chi })} />
        {cerca.trim() && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md" role="listbox">
            {documenti.isPending && <li className="px-3 py-2 text-sm text-muted-foreground">{t("Carico le fatture aperte…")}</li>}
            {documenti.isError && <li className="px-3 py-2 text-sm text-destructive">{t("Fatture non caricate: {message}", { message: (documenti.error as Error).message })}</li>}
            {documenti.isSuccess && risultati.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t("Nessuna fattura aperta trovata.")}</li>}
            {risultati.map(d => (
              <li key={chiaveDocumento(d)}>
                <button type="button" role="option" aria-selected={false} onClick={() => aggiungi(d)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{d.controparte ?? "—"}</span>
                    <span className="text-muted-foreground"> · {d.tipo === "nota_credito" ? t("nota di credito n. {numero} del {data}", { numero: d.numero ?? "", data: dataIt(d.data) }) : t("n. {numero} del {data}", { numero: d.numero ?? "", data: dataIt(d.data) })}{d.order_code ? ` · ${d.order_code}` : ""}</span>
                  </span>
                  <span className={cn("shrink-0 tabular-nums", d.tipo === "nota_credito" && "text-emerald-700 dark:text-emerald-400")}>{d.tipo === "nota_credito" ? "−" : ""}{euro(d.residuo)}</span>
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
                <span className="font-medium">{p.length === 1 ? t("Questa fattura fa esattamente {importo}", { importo: euro(conti.totale / 100) }) : t("Queste {n} fatture fanno esattamente {importo}", { n: p.length, importo: euro(conti.totale / 100) })}</span>
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
              {q.tipo === "f24" ? (
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{q.f24.descrizione}</span>
                  <span className="block text-xs text-muted-foreground">{t("La quietanza del versamento si registra nel modulo F24.")}</span>
                </div>
              ) : q.tipo === "dipendente" ? (
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{q.dipendente.nome}</span>
                  <span className="text-muted-foreground">{" · "}{t("stipendio di {mese} {anno}", { mese: nomeMese(q.mese), anno: String(q.anno) })}</span>
                  {q.dipendente.origine && <span className="block text-xs text-muted-foreground">{q.dipendente.origine === "cedolino" ? t("Netto proposto dal cedolino") : t("Netto proposto dalla scheda del dipendente")}</span>}
                </div>
              ) : q.tipo === "libera" ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Select value={q.categoria} onValueChange={v => cambia(q.chiave, { categoria: v })}>
                    <SelectTrigger aria-label={t("Categoria della voce")}><SelectValue placeholder={t("Categoria")} /></SelectTrigger>
                    <SelectContent>{CATEGORIE_QUOTA[direction].map(c => <SelectItem key={c.value} value={c.value}>{t(c.label)}</SelectItem>)}</SelectContent>
                  </Select>
                  <CommessaCombobox value={q.orderId} onChange={id => cambia(q.chiave, { orderId: id ?? null })} ariaLabel={t("Commessa della voce")} nessunaLabel={t("Nessuna commessa")} />
                  <Input className="sm:col-span-2" value={q.descrizione} onChange={e => cambia(q.chiave, { descrizione: e.target.value })} placeholder={t("Descrizione (es. commissioni RiBa)")} aria-label={t("Descrizione della voce")} />
                </div>
              ) : q.tipo === "nota_credito" ? (
                <div className="min-w-0 space-y-1 text-sm">
                  <div>
                    <span className="font-medium">{q.documento.controparte ?? "—"}</span>
                    <span className="text-muted-foreground">{" · "}{t("nota di credito n. {numero} del {data}", { numero: q.documento.numero ?? "", data: dataIt(q.documento.data) })}</span>
                  </div>
                  {(() => {
                    const fatture = quote.filter(x => x.tipo === "fattura_ricevuta" && stessoFornitore(x.documento, q.documento));
                    return fatture.length ? (
                      <Select value={q.fatturaChiave ?? ""} onValueChange={v => cambia(q.chiave, { fatturaChiave: v } as Partial<Quota>)}>
                        <SelectTrigger className="h-8" aria-label={t("Fattura ridotta dalla nota")}><SelectValue placeholder={t("Riduce la fattura…")} /></SelectTrigger>
                        <SelectContent>{fatture.map(f => <SelectItem key={f.chiave} value={f.chiave}>{t("Riduce la fattura n. {numero}", { numero: ("documento" in f ? f.documento.numero : "") ?? "" })}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <p className="text-xs text-amber-700 dark:text-amber-400">{t("Aggiungi una fattura dello stesso fornitore: la nota ne riduce il pagamento.")}</p>;
                  })()}
                  <p className="text-xs text-muted-foreground">{t("Non è denaro: non entra nel totale, riduce quanto si paga su quella fattura.")}</p>
                </div>
              ) : (
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{q.documento.controparte ?? "—"}</span>
                  <span className="text-muted-foreground">{" · "}{t("{tipo} n. {numero} del {data}", { tipo: t(ETICHETTA_TIPO[q.tipo]), numero: q.documento.numero ?? "", data: dataIt(q.documento.data) })}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("Residuo {importo}", { importo: euro(q.documento.residuo) })}{q.documento.order_code ? ` · ${t("commessa {order_code}", { order_code: q.documento.order_code })}` : ""}
                  </span>
                  {q.tipo === "documento" && direction === "entrata" && (
                    <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={!!q.ritenuta} aria-label={t("Bonifico parlante con ritenuta")}
                        onCheckedChange={v => (v === true
                          ? conRitenuta(q.chiave, daCentesimi(Math.min(centesimi(q.documento.residuo), Math.max(centesimi(q.importo), 0)) || centesimi(q.documento.residuo)))
                          : cambia(q.chiave, { ritenuta: false, importo: q.lordo ?? q.importo } as Partial<Quota>))} />
                      {t("Bonifico parlante: la banca ha trattenuto la ritenuta dell'11%")}
                    </label>
                  )}
                </div>
              )}
              {"ritenuta" in q && q.ritenuta && (
                <p className="text-xs text-muted-foreground tabular-nums">{t("Lordo saldato {valore} · ritenuta {ritenuta} · in banca {valore2}", { valore: euro(centesimi(q.lordo) / 100), ritenuta: euro(nettoBonificoParlante(q.lordo ?? "0").ritenuta), valore2: euro(centesimi(q.importo) / 100) })}</p>
              )}
              <div className="flex items-center gap-2">
                <div className="flex h-9 flex-1 items-center gap-1 rounded-md border px-2">
                  {q.tipo === "nota_credito" && <span className="text-sm text-emerald-700 dark:text-emerald-400">−</span>}
                  {"ritenuta" in q && q.ritenuta ? (
                    <Input type="number" inputMode="decimal" step="0.01" min="0.01" value={q.lordo ?? ""} aria-label={t("Lordo saldato")}
                      onWheel={e => e.currentTarget.blur()} onChange={e => conRitenuta(q.chiave, e.target.value)}
                      className="h-full border-0 px-0 text-right tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                  ) : (
                    <Input type="number" inputMode="decimal" step="0.01" min="0.01" value={q.importo} aria-label={t("Importo della quota")}
                      onWheel={e => e.currentTarget.blur()} onChange={e => cambia(q.chiave, { importo: e.target.value })}
                      className="h-full border-0 px-0 text-right tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                  )}
                  <span className="text-sm text-muted-foreground">€</span>
                </div>
                {q.tipo !== "libera" && q.tipo !== "dipendente" && q.tipo !== "nota_credito" && q.tipo !== "f24" && !q.ritenuta && Math.round(Number(q.importo) * 100) < Math.round(q.documento.residuo * 100) && Number(q.importo) > 0 && (
                  <span className="whitespace-nowrap text-xs text-amber-700 dark:text-amber-400">{t("acconto")}</span>
                )}
                <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label={t("Togli la quota")} onClick={() => togli(q.chiave)}><X className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => aggiungiLibera()}>
          <Plus className="mr-1 h-3.5 w-3.5" />{t("Voce senza fattura")}
        </Button>
        {direction === "uscita" && (
          <Button type="button" variant="outline" size="sm" aria-expanded={stipendiAperti} onClick={() => setStipendiAperti(v => !v)}>
            <Users className="mr-1 h-3.5 w-3.5" />{t("Stipendi")}
          </Button>
        )}
        {direction === "uscita" && (
          <Button type="button" variant="outline" size="sm" aria-expanded={f24Aperto} onClick={() => setF24Aperto(v => !v)}>F24</Button>
        )}
        {conti.mancano > 0 && quote.length > 0 && (
          <span className="text-xs text-muted-foreground">{t("es. commissioni, arrotondamento, una commessa")}</span>
        )}
      </div>

      {f24Aperto && direction === "uscita" && (
        <PannelloF24 companyId={companyId} quote={quote} onAggiungi={nuove => { onQuote([...quote, ...nuove]); setF24Aperto(false); }} />
      )}

      {stipendiAperti && direction === "uscita" && (
        <PannelloStipendi companyId={companyId} quote={quote}
          onAggiungi={nuove => { onQuote([...quote, ...nuove]); setStipendiAperti(false); }} />
      )}

      <Barra totale={conti.totale} assegnato={conti.assegnato} />
      <AggiustaResto quote={quote} mancano={conti.mancano} direction={direction} onQuote={onQuote} />
    </section>
  );
}

/**
 * Pochi euro di differenza sono quasi sempre commissioni: si propongono come voce. Se le fatture
 * superano l'accredito, la differenza resta da incassare sull'ultima fattura (acconto).
 */
function AggiustaResto({ quote, mancano, direction, onQuote }: { quote: Quota[]; mancano: number; direction: "entrata" | "uscita"; onQuote: (q: Quota[]) => void }) {
  const t = useT();
  const documenti = quote.filter(q => q.tipo !== "libera" && q.tipo !== "dipendente" && q.tipo !== "nota_credito" && q.tipo !== "f24");
  if (!documenti.length || mancano === 0) return null;
  if (mancano > 0 && mancano <= 1000) {
    return (
      <button type="button" className="text-left text-xs text-primary underline-offset-2 hover:underline"
        onClick={() => onQuote([...quote, { chiave: `c${Date.now()}`, tipo: "libera", categoria: direction === "uscita" ? "commissioni" : "altro", orderId: null,
          descrizione: direction === "uscita" ? "Commissioni bancarie" : "Arrotondamento", importo: daCentesimi(mancano) }])}>
        {t("Metti i {importo} che mancano su «{voce}»", { importo: euro(mancano / 100), voce: direction === "uscita" ? t("Commissioni bancarie") : t("Arrotondamento") })}
      </button>
    );
  }
  const ultima = documenti[documenti.length - 1];
  if (mancano < 0 && centesimi(ultima.importo) + mancano > 0) {
    return (
      <button type="button" className="text-left text-xs text-primary underline-offset-2 hover:underline"
        onClick={() => onQuote(quote.map(q => (q.chiave === ultima.chiave ? { ...q, importo: daCentesimi(centesimi(q.importo) + mancano) } : q)))}>
        {direction === "entrata" ? t("Lascia {importo} da incassare sull'ultima fattura", { importo: euro(-mancano / 100) }) : t("Lascia {importo} da pagare sull'ultima fattura", { importo: euro(-mancano / 100) })}
      </button>
    );
  }
  return null;
}

function Barra({ totale, assegnato }: { totale: number; assegnato: number }) {
  const t = useT();
  if (totale <= 0) return <p className="text-xs text-muted-foreground">{t("Scrivi prima l'importo del movimento.")}</p>;
  const mancano = totale - assegnato;
  const perc = Math.min(100, Math.max(0, (assegnato / totale) * 100));
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full transition-all", mancano === 0 ? "bg-emerald-600" : mancano < 0 ? "bg-destructive" : "bg-primary")} style={{ width: `${perc}%` }} />
      </div>
      <p className={cn("text-xs tabular-nums", mancano === 0 ? "text-emerald-700 dark:text-emerald-400" : mancano < 0 ? "text-destructive" : "text-muted-foreground")}>
        {t("Assegnati {assegnato} di {totale}", { assegnato: euro(assegnato / 100), totale: euro(totale / 100) })}
        {" · "}{mancano > 0 ? t("mancano {valore}", { valore: euro(mancano / 100) }) : mancano < 0 ? t("{valore} in più", { valore: euro(-mancano / 100) }) : t("tutto assegnato")}
      </p>
    </div>
  );
}

/**
 * Gli stipendi del mese: si spuntano i dipendenti e il netto si propone dal cedolino, o dalla
 * scheda se il cedolino non c'è. Chi non vede le paghe vede i nomi e scrive l'importo a mano.
 */
function PannelloStipendi({ companyId, quote, onAggiungi }: {
  companyId: string | undefined;
  quote: Quota[];
  onAggiungi: (q: Quota[]) => void;
}) {
  const t = useT();
  const [periodo, setPeriodo] = useState(meseStipendi);
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const dipendenti = useQuery({
    queryKey: ["prima-nota-dipendenti", companyId, periodo.anno, periodo.mese],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("prima_nota_dipendenti" as never, { p_company: companyId, p_anno: periodo.anno, p_mese: periodo.mese } as never);
      if (error) throw error;
      return ((data ?? []) as DipendenteDaPagare[]).map(d => ({ ...d, netto_proposto: d.netto_proposto == null ? null : Number(d.netto_proposto) }));
    },
  });
  const giaNelleQuote = new Set(quote.flatMap(q => (q.tipo === "dipendente" && q.anno === periodo.anno && q.mese === periodo.mese ? [q.dipendente.id] : [])));
  const elenco = (dipendenti.data ?? []).filter(d => !giaNelleQuote.has(d.id));
  const daPagare = elenco.filter(d => !d.pagato_il);
  const totale = elenco.filter(d => scelti.has(d.id)).reduce((s, d) => s + centesimi(d.netto_proposto ?? 0), 0);
  const alterna = (id: string) => setScelti(v => { const n = new Set(v); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const mesi = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    return { anno: d.getFullYear(), mese: d.getMonth() + 1 };
  });
  let progressivoStipendi = 0;
  const aggiungi = () => onAggiungi(elenco.filter(d => scelti.has(d.id)).map(d => ({
    chiave: `s${periodo.anno}${periodo.mese}-${d.id}-${++progressivoStipendi}`, tipo: "dipendente" as const,
    dipendente: { id: d.id, nome: d.nome, origine: d.origine }, anno: periodo.anno, mese: periodo.mese,
    importo: d.netto_proposto == null ? "" : daCentesimi(centesimi(d.netto_proposto)),
  })));

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("Stipendi di")}</p>
        <Select value={`${periodo.anno}-${periodo.mese}`} onValueChange={v => { const [a, m] = v.split("-").map(Number); setPeriodo({ anno: a, mese: m }); setScelti(new Set()); }}>
          <SelectTrigger className="h-8 w-44" aria-label={t("Mese degli stipendi")}><SelectValue /></SelectTrigger>
          <SelectContent>{mesi.map(m => <SelectItem key={`${m.anno}-${m.mese}`} value={`${m.anno}-${m.mese}`}>{nomeMese(m.mese)} {m.anno}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {dipendenti.isPending && <p className="text-xs text-muted-foreground">{t("Carico i dipendenti…")}</p>}
      {dipendenti.isError && <p className="text-xs text-destructive">{t("Dipendenti non caricati: {message}", { message: (dipendenti.error as Error).message })}</p>}
      {dipendenti.isSuccess && elenco.length === 0 && <p className="text-xs text-muted-foreground">{t("Nessun dipendente da aggiungere per questo mese.")}</p>}
      {elenco.length > 0 && (
        <>
          <button type="button" className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => setScelti(new Set(daPagare.map(d => d.id)))}>{t("Spunta tutti quelli ancora da pagare ({n})", { n: daPagare.length })}</button>
          <ul className="max-h-56 divide-y overflow-y-auto rounded-md border bg-background">
            {elenco.map(d => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm">
                  <Checkbox checked={scelti.has(d.id)} onCheckedChange={() => alterna(d.id)} aria-label={t("Paga {nome}", { nome: d.nome })} />
                  <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                  {d.pagato_il && <span className="shrink-0 text-xs text-emerald-700 dark:text-emerald-400">{t("pagato il {valore}", { valore: d.pagato_il.split("-").reverse().join("/") })}</span>}
                  <span className="shrink-0 tabular-nums text-muted-foreground">{d.netto_proposto == null ? "—" : euro(d.netto_proposto)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{t("{n} scelti", { n: scelti.size })}{totale > 0 ? ` · ${euro(totale / 100)}` : ""}</span>
            <Button type="button" size="sm" disabled={!scelti.size} onClick={aggiungi}>{scelti.size ? t(scelti.size === 1 ? "Aggiungi {n} stipendio" : "Aggiungi {n} stipendi", { n: scelti.size }) : t("Aggiungi stipendi")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("Gli stipendi non vanno sulle commesse: la manodopera ci arriva già dai rapportini.")}</p>
        </>
      )}
    </div>
  );
}

interface RigaF24 { id: string; tributo_code: string | null; tributo_descrizione: string | null; anno: number; mese: number; importo: number }

/** Le righe dell'F24 ancora da versare: spuntate, diventano quote del movimento. */
function PannelloF24({ companyId, quote, onAggiungi }: { companyId: string | undefined; quote: Quota[]; onAggiungi: (q: Quota[]) => void }) {
  const t = useT();
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const righe = useQuery({
    queryKey: ["prima-nota-f24", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("f24_entries" as never)
        .select("id, tributo_code, tributo_descrizione, anno, mese, importo")
        .eq("company_id" as never, companyId as never).neq("stato" as never, "pagato" as never)
        .order("anno" as never).order("mese" as never);
      if (error) throw error;
      return ((data ?? []) as unknown as RigaF24[]).map(r => ({ ...r, importo: Number(r.importo) }));
    },
  });
  const gia = new Set(quote.flatMap(q => (q.tipo === "f24" ? [q.f24.id] : [])));
  const elenco = (righe.data ?? []).filter(r => !gia.has(r.id));
  const nome = (r: RigaF24) => `F24 ${r.tributo_code ?? ""} ${r.tributo_descrizione ?? ""} · ${String(r.mese).padStart(2, "0")}/${r.anno}`.replace(/\s+/g, " ").trim();
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <p className="text-sm font-medium">{t("F24 da versare")}</p>
      {righe.isPending && <p className="text-xs text-muted-foreground">{t("Carico l'F24…")}</p>}
      {righe.isError && <p className="text-xs text-destructive">{t("F24 non caricato.")}</p>}
      {righe.isSuccess && elenco.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("Nessuna riga F24 da versare nell'app: usa «Voce senza fattura» con la categoria «Tasse / F24».")}</p>
      )}
      {elenco.length > 0 && (
        <>
          <ul className="max-h-48 divide-y overflow-y-auto rounded-md border bg-background">
            {elenco.map(r => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm">
                  <Checkbox checked={scelti.has(r.id)} aria-label={t("Versa {r}", { r: nome(r) })}
                    onCheckedChange={() => setScelti(v => { const n = new Set(v); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                  <span className="min-w-0 flex-1 truncate">{nome(r)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{euro(r.importo)}</span>
                </label>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" disabled={!scelti.size}
            onClick={() => onAggiungi(elenco.filter(r => scelti.has(r.id)).map(r => ({
              chiave: `f${r.id}`, tipo: "f24" as const, f24: { id: r.id, descrizione: nome(r) }, importo: daCentesimi(centesimi(r.importo)),
            })))}>
            {scelti.size ? t("Aggiungi {n} F24", { n: scelti.size }) : t("Aggiungi F24")}
          </Button>
        </>
      )}
    </div>
  );
}
