/**
 * Passo «Economia» del preventivo con computo (29/10/2026): quanto pesa ogni
 * capitolo, lo sconto, l'IVA e il totale, con le modalità di pagamento. Prima
 * l'IVA stava in fondo al passo Documento, mescolata con le scelte di stampa,
 * e lo sconto non c'era: lo si faceva abbassando i prezzi delle voci.
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { codiciSenzaCosto } from "@/lib/computo/costiDalListino";
import { Button } from "@/components/ui/button";
import ComputoIva from "./ComputoIva";
import { MOMENTI_RATA, analizzaEconomia, pianiPredefiniti, type MomentoRata, type Rata } from "@/lib/computo/economiaComputo";
import { durataTotale } from "@/lib/computo/cronoprogramma";
import { calcolaVoce, type BozzaComputo } from "@/lib/computo/editorNativo";
import { calcolaSconto } from "@/lib/computo/scontoComputo";
import { formatEuro } from "@/lib/computo/computoStrutturato";

export default function ComputoEconomia({ bozza, totale, onChange, vediMargini = false, onCronoprogramma, onCostiDalListino }: {
  bozza: BozzaComputo; totale: number; onChange: (patch: Partial<BozzaComputo>) => void;
  /** Chi ha i permessi «costi» e «margini»: vede costo stimato, margini, cassa e rischi. */
  vediMargini?: boolean;
  /** Porta al cronoprogramma (passo Documento), che serve al flusso di cassa. */
  onCronoprogramma?: () => void;
  /** Cerca nel listino aziendale il costo delle voci che non ce l'hanno; risponde quante ne ha trovate. */
  onCostiDalListino?: () => Promise<number>;
}) {
  const daCercare = codiciSenzaCosto(bozza.voci).length;
  const senzaCostoNeCodice = bozza.voci.filter(v => !v.opzionale && (!v.costo.trim() || Number(v.costo.replace(",", ".")) <= 0) && !v.tariffa.trim()).length;
  const [cerca, setCerca] = useState<{ stato: "fermo" | "cerca" | "fatto"; trovate?: number; errore?: string }>({ stato: "fermo" });
  const cercaCosti = async () => {
    if (!onCostiDalListino) return;
    setCerca({ stato: "cerca" });
    try { setCerca({ stato: "fatto", trovate: await onCostiDalListino() }); }
    catch (e) { setCerca({ stato: "fatto", errore: e instanceof Error ? e.message : "Listino non raggiungibile: riprova." }); }
  };
  const analisi = analizzaEconomia(bozza);
  const rate = bozza.pianoPagamenti.rate;
  const durata = durataTotale(bozza.cronoprogramma);
  const cambiaRate = (r: Rata[]) => onChange({ pianoPagamenti: { rate: r } });
  const cambiaRata = (id: string, patch: Partial<Rata>) => cambiaRate(rate.map(r => r.id === id ? { ...r, ...patch } : r));
  const capitoli = new Map<string, { voci: number; importo: number; daCompletare: number }>();
  let sicurezza = 0;
  for (const v of bozza.voci) {
    if (v.opzionale) continue;
    const nome = v.capitolo.trim() || "Opere edili";
    const c = capitoli.get(nome) ?? { voci: 0, importo: 0, daCompletare: 0 };
    const r = calcolaVoce(v);
    c.voci++; if (r.importo == null || r.errori.length) c.daCompletare++; else c.importo += r.importo;
    if (v.sicurezza && r.importo != null) sicurezza += r.importo;
    capitoli.set(nome, c);
  }
  // Gli oneri della sicurezza non si scontano: lo sconto vale sul resto (calcolaSconto).
  const sconto = calcolaSconto(totale, bozza.sconto, sicurezza);
  const netto = totale - sconto.importo;
  const s = bozza.sconto;
  const cambiaSconto = (patch: Partial<BozzaComputo["sconto"]>) => onChange({ sconto: { ...s, ...patch } });

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 className="text-base font-semibold">Economia del preventivo</h2>
        <p className="text-xs text-muted-foreground">Il peso dei capitoli, lo sconto e l'IVA. Le voci restano ai loro prezzi: lo sconto è una riga del riepilogo.</p></div>
      <div className="text-right tabular-nums"><span className="block text-xs text-muted-foreground">{sconto.importo > 0 ? "Imponibile scontato" : "Imponibile"}</span><strong className="text-lg">{formatEuro(netto)} €</strong></div>
    </div>

    <section aria-label="Riepilogo per capitolo" className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full min-w-[480px] text-sm">
        <thead><tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <th className="px-3 py-2 font-medium">Capitolo</th><th className="w-16 px-2 py-2 text-right font-medium">Voci</th><th className="w-40 px-2 py-2 font-medium">Incidenza</th><th className="w-32 px-3 py-2 text-right font-medium">Importo</th>{vediMargini && <th className="w-24 px-3 py-2 text-right font-medium">Margine</th>}
        </tr></thead>
        <tbody>{[...capitoli].map(([nome, c]) => {
          const perc = totale > 0 ? c.importo / totale * 100 : 0;
          return <tr key={nome} className="border-b last:border-0">
            <td className="px-3 py-2">{nome}{!!c.daCompletare && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">{c.daCompletare} da completare</span>}</td>
            <td className="px-2 py-2 text-right tabular-nums">{c.voci}</td>
            <td className="px-2 py-2"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded bg-slate-100" aria-hidden="true"><div className="h-full rounded bg-orange-500" style={{ width: `${Math.min(100, Math.max(0, perc))}%` }} /></div><span className="w-11 text-right text-xs tabular-nums text-muted-foreground">{perc.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</span></div></td>
            <td className="px-3 py-2 text-right font-medium tabular-nums">{formatEuro(c.importo)} €</td>
            {vediMargini && (() => { const m = analisi.perCapitolo.get(nome); const p = m && m.costo > 0 && m.ricavo > 0 ? (m.ricavo - m.costo) / m.ricavo * 100 : null;
              return <td className={`px-3 py-2 text-right text-xs tabular-nums ${p == null ? "text-muted-foreground" : p < 10 ? "text-red-700" : p < 20 ? "text-amber-700" : "text-emerald-700"}`}>{p == null ? "senza costo" : `${p.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`}</td>; })()}
          </tr>;
        })}</tbody>
        <tfoot><tr className="border-t bg-slate-50 font-semibold"><td className="px-3 py-2" colSpan={3}>Totale dei lavori{sicurezza > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">di cui oneri della sicurezza {formatEuro(sicurezza)} €</span>}</td><td className="px-3 py-2 text-right tabular-nums">{formatEuro(totale)} €</td>{vediMargini && <td />}</tr></tfoot>
      </table>
    </section>

    <section aria-label="Sconto" className="space-y-3 rounded-lg border bg-white p-3">
      <h3 className="text-sm font-semibold">Sconto</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="sconto-tipo" className="text-xs">Tipo di sconto</Label>
          <Select value={s.tipo} onValueChange={tipo => cambiaSconto({ tipo: tipo as BozzaComputo["sconto"]["tipo"] })}>
            <SelectTrigger id="sconto-tipo" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="nessuno">Nessuno sconto</SelectItem><SelectItem value="percentuale">In percentuale</SelectItem><SelectItem value="importo">In euro</SelectItem></SelectContent>
          </Select></div>
        {s.tipo !== "nessuno" && <>
          <div className="space-y-1"><Label htmlFor="sconto-valore" className="text-xs">{s.tipo === "percentuale" ? "Percentuale" : "Importo in euro"}</Label>
            <Input id="sconto-valore" className="h-9 tabular-nums" inputMode="decimal" maxLength={40} placeholder={s.tipo === "percentuale" ? "Es. 5" : "Es. 1.500"} value={s.valore} aria-invalid={!!sconto.errore} onChange={e => cambiaSconto({ valore: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="sconto-descrizione" className="text-xs">Come si legge nel PDF</Label>
            <Input id="sconto-descrizione" className="h-9" maxLength={120} placeholder="Sconto" value={s.descrizione} onChange={e => cambiaSconto({ descrizione: e.target.value })} /></div>
        </>}
      </div>
      {sconto.errore && <p role="alert" className="text-sm text-amber-800">{sconto.errore}</p>}
      {sconto.importo > 0 && <p className="text-xs text-muted-foreground">{sicurezza > 0 && <>Calcolato su {formatEuro(totale - sicurezza)} €: gli oneri della sicurezza ({formatEuro(sicurezza)} €) non sono soggetti a ribasso. </>}{sconto.etichetta}: -{formatEuro(sconto.importo)} €{sconto.percentuale != null && s.tipo === "importo" ? `, pari al ${sconto.percentuale.toLocaleString("it-IT")}% dei lavori` : ""}.</p>}
    </section>

    <ComputoIva value={bozza} imponibile={netto} onChange={patch => onChange(patch)}
      righePrima={sconto.importo > 0 ? [["Totale dei lavori", `${formatEuro(totale)} €`], [`${sconto.etichetta}${s.tipo === "percentuale" ? ` ${s.valore.trim()}%` : ""}`, `-${formatEuro(sconto.importo)} €`]] : []} />

    <section aria-label="Piano dei pagamenti" className="space-y-3 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-sm font-semibold">Piano dei pagamenti</h3>
          <p className="text-xs text-muted-foreground">Acconto, SAL e saldo sull'imponibile{bozza.ivaModalita === "applicata" ? " (più IVA)" : ""}. Esce nel PDF con gli importi.</p></div>
        <div className="flex flex-wrap gap-1.5">{pianiPredefiniti(durata).map(piano => <Button key={piano.nome} type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => cambiaRate(piano.rate())}>{piano.nome}</Button>)}</div>
      </div>
      {!!rate.length && <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="min-w-[10rem] py-1 pr-2 font-medium">Rata</th><th className="w-20 py-1 pr-2 font-medium">%</th><th className="w-64 py-1 pr-2 font-medium">Quando</th><th className="w-24 py-1 pr-2 font-medium">Pagata entro</th><th className="w-28 py-1 text-right font-medium">Importo</th><th className="w-8" /></tr></thead>
        <tbody>{analisi.rate.map(({ rata: r, importo }, k) => <tr key={r.id} className="border-t align-top">
          <td className="py-1.5 pr-2"><Input aria-label={`Nome della rata ${k + 1}`} className="h-8" maxLength={200} value={r.descrizione} onChange={e => cambiaRata(r.id, { descrizione: e.target.value })} /></td>
          <td className="py-1.5 pr-2"><Input aria-label={`Percentuale della rata ${k + 1}`} className="h-8 tabular-nums" inputMode="decimal" maxLength={20} value={r.percentuale} onChange={e => cambiaRata(r.id, { percentuale: e.target.value })} /></td>
          <td className="py-1.5 pr-2"><div className="flex gap-1.5">
            <Select value={r.quando} onValueChange={quando => cambiaRata(r.id, { quando: quando as MomentoRata })}>
              <SelectTrigger aria-label={`Quando si paga la rata ${k + 1}`} className="h-8 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(MOMENTI_RATA) as MomentoRata[]).map(m => <SelectItem key={m} value={m}>{MOMENTI_RATA[m]}</SelectItem>)}</SelectContent>
            </Select>
            {r.quando === "sal" && <Input aria-label={`Giorno del SAL della rata ${k + 1}`} title="Giorno lavorativo del cantiere" className="h-8 w-16 tabular-nums" inputMode="numeric" placeholder="gg" value={r.giorno == null ? "" : String(r.giorno)} onChange={e => { const n = Number.parseInt(e.target.value, 10); cambiaRata(r.id, { giorno: Number.isFinite(n) && n > 0 ? Math.min(2000, n) : null }); }} />}
          </div></td>
          <td className="py-1.5 pr-2"><Select value={String(r.giorniPagamento)} onValueChange={v => cambiaRata(r.id, { giorniPagamento: Number(v) })}>
            <SelectTrigger aria-label={`Termine di pagamento della rata ${k + 1}`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{[0, 15, 30, 60, 90].map(g => <SelectItem key={g} value={String(g)}>{g ? `${g} giorni` : "A vista"}</SelectItem>)}</SelectContent>
          </Select></td>
          <td className="py-1.5 text-right font-medium tabular-nums">{formatEuro(importo)} €</td>
          <td className="py-1.5 pl-1"><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Togli la rata ${k + 1}`} onClick={() => cambiaRate(rate.filter(x => x.id !== r.id))}><Trash2 className="h-4 w-4" /></Button></td>
        </tr>)}</tbody>
        <tfoot><tr className="border-t text-sm"><td className="py-1.5 font-medium">Totale</td><td className={`py-1.5 tabular-nums ${analisi.errorePiano ? "text-amber-700" : ""}`}>{analisi.sommaPercentuali.toLocaleString("it-IT")}%</td><td colSpan={2} /><td className="py-1.5 text-right font-semibold tabular-nums">{formatEuro(analisi.rate.reduce((t, r) => t + r.importo, 0))} €</td><td /></tr></tfoot>
      </table></div>}
      {analisi.errorePiano && <p role="alert" className="text-sm text-amber-800">{analisi.errorePiano}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={rate.length >= 24} onClick={() => cambiaRate([...rate, { id: crypto.randomUUID(), descrizione: `Rata ${rate.length + 1}`, percentuale: "", quando: "sal", giorno: null, giorniPagamento: 0 }])}><Plus className="mr-1 h-4 w-4" />Aggiungi rata</Button>
        {!!rate.length && rate.some(r => r.quando === "sal") && !durata && <span className="text-xs text-muted-foreground">I SAL si collocano nel tempo col cronoprogramma{onCronoprogramma && <> · <button type="button" className="underline" onClick={onCronoprogramma}>crealo</button></>}.</span>}
      </div>
      <div className="space-y-1"><Label htmlFor="native-pagamenti" className="text-xs">Altre condizioni di pagamento</Label>
        <Textarea id="native-pagamenti" rows={2} maxLength={3000} placeholder="Es. bonifico a 30 giorni data fattura, ritenuta a garanzia del 5% sul saldo" value={bozza.pagamenti} onChange={e => onChange({ pagamenti: e.target.value })} /></div>
    </section>

    {vediMargini && <section aria-label="Margini e cassa" className="space-y-3 rounded-lg border border-slate-300 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-1.5 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-slate-500" />Margini e cassa</h3>
        <span className="text-[11px] text-muted-foreground">Solo per chi vede costi e margini · mai nel PDF</span></div>
      {onCostiDalListino && (daCercare > 0 || cerca.stato === "fatto") && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-2 py-1.5 text-xs">
        <span className="text-muted-foreground">
          {cerca.stato === "fatto"
            ? cerca.errore ?? (cerca.trovate ? `${cerca.trovate === 1 ? "1 voce ha preso" : `${cerca.trovate} voci hanno preso`} il costo dal listino.` : "Nessun codice delle voci senza costo è nel listino aziendale.")
            : `${daCercare === 1 ? "1 codice" : `${daCercare} codici`} senza costo: il listino aziendale può averlo.`}
          {senzaCostoNeCodice > 0 && ` ${senzaCostoNeCodice === 1 ? "1 voce" : `${senzaCostoNeCodice} voci`} senza costo né codice: il costo va scritto a mano.`}
        </span>
        {daCercare > 0 && <Button type="button" size="sm" variant="outline" className="h-7" disabled={cerca.stato === "cerca"} onClick={cercaCosti}>
          <Search className="mr-1 h-3.5 w-3.5" />{cerca.stato === "cerca" ? "Cerco…" : "Prendi i costi dal listino"}
        </Button>}
      </div>}
      {analisi.costo <= 0
        ? <p className="text-sm text-muted-foreground">Scrivi il costo stimato delle voci (si apre la voce nel passo Computo, campo «Costo unitario stimato») per vedere margini, cassa e rischi.</p>
        : <>
          <dl className="grid gap-2 sm:grid-cols-4">
            {([["Costo stimato", `${formatEuro(analisi.costo)} €`], ["Margine", `${formatEuro(analisi.margine)} €`], ["Margine %", analisi.marginePerc == null ? "—" : `${analisi.marginePerc.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`],
              ["Esposizione massima", analisi.cassa ? (analisi.esposizioneMassima < 0 ? `${formatEuro(-analisi.esposizioneMassima)} €` : "Nessuna") : "—"]] as const).map(([k, val]) =>
              <div key={k} className="rounded-md border bg-white p-2"><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{val}</dd></div>)}
          </dl>
          {analisi.cassa && <GraficoCassa punti={analisi.cassa} />}
          {!analisi.cassa && <p className="text-xs text-muted-foreground">Per il flusso di cassa servono il cronoprogramma{onCronoprogramma && <> (<button type="button" className="underline" onClick={onCronoprogramma}>passo Documento</button>)</>} e un piano dei pagamenti che fa 100%.</p>}
          {!!analisi.rischi.length && <ul className="space-y-1">{analisi.rischi.map(r => <li key={r.testo} className={`flex items-start gap-1.5 text-sm ${r.livello === "alto" ? "text-red-800" : "text-amber-800"}`}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{r.testo}</li>)}</ul>}
          {analisi.accontoConsigliato != null && <Button type="button" size="sm" variant="outline" onClick={() => {
            const acconto = analisi.accontoConsigliato!;
            const altre = rate.filter(r => r.quando !== "firma");
            const resto = altre.reduce((t, r) => t + (Number(r.percentuale.replace(",", ".")) || 0), 0);
            const scala = resto > 0 ? (100 - acconto) / resto : 0;
            cambiaRate([{ id: crypto.randomUUID(), descrizione: "Acconto", percentuale: String(acconto), quando: "firma", giorno: null, giorniPagamento: 0 },
              ...altre.map(r => ({ ...r, percentuale: String(Math.round((Number(r.percentuale.replace(",", ".")) || 0) * scala * 100) / 100).replace(".", ",") }))]);
          }}>Porta l'acconto al {analisi.accontoConsigliato}% e riproporziona le altre rate</Button>}
        </>}
    </section>}
  </div>;
}

/** Il saldo di cassa del cantiere giorno per giorno: sotto lo zero l'impresa anticipa di tasca sua. */
function GraficoCassa({ punti }: { punti: { giorno: number; saldo: number }[] }) {
  const W = 600, H = 120, pad = 6;
  const min = Math.min(0, ...punti.map(p => p.saldo)), max = Math.max(0, ...punti.map(p => p.saldo));
  const x = (g: number) => pad + (g / Math.max(1, punti.at(-1)!.giorno)) * (W - pad * 2);
  const y = (v: number) => pad + (max - v) / Math.max(1, max - min) * (H - pad * 2);
  const linea = punti.map((p, k) => `${k ? "L" : "M"}${x(p.giorno).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(" ");
  return <figure className="rounded-md border bg-white p-2">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label="Saldo di cassa del cantiere giorno per giorno">
      <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeDasharray="4 3" />
      <path d={`${linea} L${x(punti.at(-1)!.giorno).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`} fill="#f97316" fillOpacity={0.08} />
      <path d={linea} fill="none" stroke="#ea580c" strokeWidth={2} />
    </svg>
    <figcaption className="flex justify-between text-[11px] text-muted-foreground"><span>Inizio</span><span>Saldo di cassa (incassi meno costi), giorno per giorno</span><span>Fine</span></figcaption>
  </figure>;
}
