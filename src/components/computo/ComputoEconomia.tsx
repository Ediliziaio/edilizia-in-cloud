/**
 * Passo «Economia» del preventivo con computo (29/10/2026): quanto pesa ogni
 * capitolo, lo sconto, l'IVA e il totale, con le modalità di pagamento. Prima
 * l'IVA stava in fondo al passo Documento, mescolata con le scelte di stampa,
 * e lo sconto non c'era: lo si faceva abbassando i prezzi delle voci.
 */
import { calcolaIvaComputo } from "@/lib/computo/ivaComputo";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, Ruler, Search, Trash2, TrendingUp } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { codiciSenzaCosto } from "@/lib/computo/costiDalListino";
import { Button } from "@/components/ui/button";
import ComputoIva from "./ComputoIva";
import { MOMENTI_RATA, MOMENTI_SAL, TERMINI_RATA, analizzaEconomia, pianiPredefiniti, rataVuota, testoTermine, type MomentoRata, type Rata, type RitenutaGaranzia } from "@/lib/computo/economiaComputo";
import { durataTotale } from "@/lib/computo/cronoprogramma";
import { calcolaVoce, type BozzaComputo } from "@/lib/computo/editorNativo";
import { calcolaSconto } from "@/lib/computo/scontoComputo";
import { formatEuro } from "@/lib/computo/computoStrutturato";

// Legge l'azienda dal contesto: si carica solo dove il preventivo è agganciato a un'azienda vera.
const ModelliPagamentoAzienda = lazy(() => import("./ComputoModelliPagamento"));

export default function ComputoEconomia({ bozza, totale, onChange, vediMargini = false, onCronoprogramma, onCostiDalListino, conModelliAzienda = false }: {
  bozza: BozzaComputo; totale: number; onChange: (patch: Partial<BozzaComputo>) => void;
  /** Chi ha i permessi «costi» e «margini»: vede costo stimato, margini, cassa e rischi. */
  vediMargini?: boolean;
  /** Porta al cronoprogramma (passo Documento), che serve al flusso di cassa. */
  onCronoprogramma?: () => void;
  /** Cerca nel listino aziendale il costo delle voci che non ce l'hanno; risponde quante ne ha trovate. */
  onCostiDalListino?: () => Promise<number>;
  /** Il preventivo è di un'azienda vera: si offrono i suoi modelli di pagamento. */
  conModelliAzienda?: boolean;
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
  const [presetDaConfermare, setPresetDaConfermare] = useState<{ nome: string; rate: Rata[] } | null>(null);
  // L'aliquota IVA del preventivo, se è applicata e valida: le rate si mostrano anche con l'IVA.
  const ivaRate = (() => { const f = calcolaIvaComputo(100, bozza); return f.modalita === "applicata" && !f.errore && f.aliquota != null ? f.aliquota : null; })();
  const durata = durataTotale(bozza.cronoprogramma);
  const cambiaRate = (r: Rata[]) => onChange({ pianoPagamenti: { rate: r, ritenuta: bozza.pianoPagamenti.ritenuta } });
  const cambiaRata = (id: string, patch: Partial<Rata>) => cambiaRate(rate.map(r => r.id === id ? { ...r, ...patch } : r));
  const ritenuta = bozza.pianoPagamenti.ritenuta;
  const conRitenuta = !!analisi.ritenuta;
  const cambiaRitenuta = (patch: Partial<RitenutaGaranzia>) => onChange({ pianoPagamenti: { rate, ritenuta: { ...ritenuta, ...patch } } });
  // Le fasi a cui una rata si può agganciare: quelle del cronoprogramma, se c'è; altrimenti i capitoli del computo.
  const nomiFase = (bozza.cronoprogramma.fasi.map(f => f.nome.trim()).filter(Boolean).length
    ? bozza.cronoprogramma.fasi.map(f => f.nome.trim()).filter(Boolean)
    : [...new Set(bozza.voci.filter(v => !v.opzionale).map(v => v.capitolo.trim() || "Opere edili"))]).slice(0, 60);
  const piani = pianiPredefiniti(durata);
  // Un piano uguale a un piano di partenza si sostituisce senza chiedere; uno scritto a mano no (11/11/2026).
  const comeUnPreset = piani.some(p => {
    const r = p.rate();
    return r.length === rate.length && r.every((x, i) => x.descrizione === rate[i].descrizione && x.percentuale === rate[i].percentuale
      && x.evento === rate[i].evento && x.base === rate[i].base && (x.numero ?? null) === (rate[i].numero ?? null));
  });
  const applicaPiano = (piano: { nome: string; rate: () => Rata[] }) => {
    const nuove = piano.rate();
    // Un piano scritto a mano non si butta via senza chiedere; uno uguale a un piano di partenza sì.
    if (rate.length && !comeUnPreset) { setPresetDaConfermare({ nome: piano.nome, rate: nuove }); return; }
    setPresetDaConfermare(null);
    cambiaRate(nuove);
  };
  /** Le percentuali riportate a 100 in proporzione: l'ultima prende il resto, come fa il calcolo degli importi. */
  const riportaA100 = () => {
    const numero = (r: Rata) => Number(r.percentuale.replace(",", ".")) || 0;
    const somma = rate.reduce((t, r) => t + numero(r), 0);
    const scrivi = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
    const quote = rate.map(r => somma > 0 ? Math.round(numero(r) * 100 / somma * 100) / 100 : Math.round(100 / rate.length * 100) / 100);
    const resto = Math.round((100 - quote.slice(0, -1).reduce((t, n) => t + n, 0)) * 100) / 100;
    cambiaRate(rate.map((r, k) => ({ ...r, percentuale: scrivi(k === rate.length - 1 ? resto : quote[k]) })));
  };
  const percentualiLeggibili = !!rate.length && analisi.rate.every(r => r.percentuale != null);
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
          <p className="text-xs text-muted-foreground">{analisi.totaleCliente == null
            ? "Le percentuali sono sul totale che paga il cliente: decidi l'IVA nel riquadro sopra per vedere gli importi."
            : `Acconto, SAL e saldo sul totale che paga il cliente${ivaRate != null ? `, IVA al ${ivaRate.toLocaleString("it-IT")}% inclusa` : ""}. Esce nel PDF con gli importi.`}</p></div>
        <div className="flex flex-wrap gap-1.5">{piani.map(piano => <Button key={piano.nome} type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => applicaPiano(piano)}>{piano.nome}</Button>)}</div>
      </div>
      {conModelliAzienda && <Suspense fallback={null}><ModelliPagamentoAzienda onScegli={(nome, rateModello) => applicaPiano({ nome, rate: () => rateModello })} /></Suspense>}
      {presetDaConfermare && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
        <span>«{presetDaConfermare.nome}» sostituisce {rate.length === 1 ? "la rata che hai scritto" : `le ${rate.length} rate che hai scritto`}.</span>
        <span className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setPresetDaConfermare(null)}>Annulla</Button>
          <Button type="button" size="sm" className="h-7" onClick={() => { const nuove = presetDaConfermare.rate; setPresetDaConfermare(null); cambiaRate(nuove); }}>Sostituisci</Button>
        </span>
      </div>}
      {!!rate.length && <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="min-w-[10rem] py-1 pr-2 font-medium">Rata</th><th className="w-28 py-1 pr-2 font-medium">%</th><th className="w-72 py-1 pr-2 font-medium">Quando</th><th className="w-40 py-1 pr-2 font-medium">Pagata entro</th><th className="w-28 py-1 text-right font-medium">Importo</th>{conRitenuta && <th className="w-28 py-1 text-right font-medium">Netto incassato</th>}<th className="w-8" /></tr></thead>
        <tbody>{analisi.rate.map(({ rata: r, importo, trattenuta }, k) => { const aMisura = r.base === "avanzamento"; return <tr key={r.id} className="border-t align-top">
          <td className="py-1.5 pr-2"><Input aria-label={`Nome della rata ${k + 1}`} className="h-8" maxLength={200} value={r.descrizione} onChange={e => cambiaRata(r.id, { descrizione: e.target.value })} /></td>
          <td className="py-1.5 pr-2"><div className="flex items-center gap-1">
            {aMisura
              ? <span className="rounded bg-slate-100 px-1.5 py-1 text-[11px] text-slate-700">a misura</span>
              : <Input aria-label={`Percentuale della rata ${k + 1}`} className="h-8 tabular-nums" inputMode="decimal" maxLength={20} value={r.percentuale} onChange={e => cambiaRata(r.id, { percentuale: e.target.value })} />}
            {MOMENTI_SAL.includes(r.evento) && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
              title={aMisura ? "Dai a questa rata una percentuale fissa" : "L'importo lo dirà il SAL: si paga quello che è stato fatto"}
              aria-label={aMisura ? `Dai una percentuale fissa alla rata ${k + 1}` : `Paga a misura la rata ${k + 1}`}
              onClick={() => cambiaRata(r.id, aMisura ? { base: "percentuale" } : { base: "avanzamento", percentuale: "" })}><Ruler className={`h-3.5 w-3.5 ${aMisura ? "text-orange-600" : "text-slate-400"}`} /></Button>}
          </div></td>
          <td className="py-1.5 pr-2"><div className="flex gap-1.5">
            <Select value={r.evento} onValueChange={evento => cambiaRata(r.id, { evento: evento as MomentoRata })}>
              <SelectTrigger aria-label={`Quando si paga la rata ${k + 1}`} className="h-8 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(MOMENTI_RATA) as MomentoRata[]).map(m => <SelectItem key={m} value={m}>{MOMENTI_RATA[m]}</SelectItem>)}</SelectContent>
            </Select>
            {r.evento === "sal_numero" && <Input aria-label={`Numero del SAL della rata ${k + 1}`} title="Quale stato avanzamento lavori" className="h-8 w-14 tabular-nums" inputMode="numeric" placeholder="n°"
              value={r.numero == null ? "" : String(r.numero)} onChange={e => { const n = Number.parseInt(e.target.value, 10); cambiaRata(r.id, { numero: Number.isFinite(n) && n > 0 ? Math.min(60, n) : null }); }} />}
            {r.evento === "sal_percentuale" && <Input aria-label={`Percentuale di avanzamento della rata ${k + 1}`} title="A che punto dei lavori" className="h-8 w-16 tabular-nums" inputMode="decimal" placeholder="%"
              value={r.soglia == null ? "" : String(r.soglia).replace(".", ",")} onChange={e => { const n = Number(e.target.value.replace(",", ".")); cambiaRata(r.id, { soglia: Number.isFinite(n) && n > 0 ? Math.min(100, n) : null }); }} />}
            {r.evento === "fase_completata" && <Select value={r.fasi[0] ?? ""} onValueChange={nome => cambiaRata(r.id, { fasi: nome ? [nome] : [] })}>
              <SelectTrigger aria-label={`Fase della rata ${k + 1}`} className="h-8 w-40 text-xs"><SelectValue placeholder="Quale fase" /></SelectTrigger>
              <SelectContent>{nomiFase.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>}
          </div></td>
          <td className="py-1.5 pr-2"><Select value={`${r.termineGiorni}|${r.termineFineMese}`} onValueChange={v => { const [g, fm] = v.split("|"); cambiaRata(r.id, { termineGiorni: Number(g), termineFineMese: fm === "true" }); }}>
            <SelectTrigger aria-label={`Termine di pagamento della rata ${k + 1}`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{TERMINI_RATA.map(t => <SelectItem key={`${t.giorni}|${t.fineMese}`} value={`${t.giorni}|${t.fineMese}`}>{testoTermine(t.giorni, t.fineMese)}</SelectItem>)}</SelectContent>
          </Select></td>
          <td className="py-1.5 text-right font-medium tabular-nums">{importo == null ? <span className="text-xs font-normal text-muted-foreground">{aMisura ? "dal SAL" : "dipende dall'IVA"}</span> : `${formatEuro(importo)} €`}</td>
          {conRitenuta && <td className="py-1.5 text-right tabular-nums">{importo == null ? "—" : `${formatEuro(importo - trattenuta)} €`}</td>}
          <td className="py-1.5 pl-1"><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Togli la rata ${k + 1}`} onClick={() => cambiaRate(rate.filter(x => x.id !== r.id))}><Trash2 className="h-4 w-4" /></Button></td>
        </tr>; })}</tbody>
        <tfoot><tr className="border-t text-sm"><td className="py-1.5 font-medium">Totale</td><td className={`py-1.5 tabular-nums ${analisi.errorePiano ? "text-amber-700" : ""}`}>{analisi.sommaPercentuali.toLocaleString("it-IT")}%</td><td colSpan={2} className="py-1.5 text-xs text-muted-foreground">{analisi.quotaAMisura > 0 && analisi.rate.some(r => r.rata.base === "avanzamento") ? `più il ${analisi.quotaAMisura.toLocaleString("it-IT")}% che si paga a misura, sull'avanzamento` : ""}</td><td className="py-1.5 text-right font-semibold tabular-nums">{formatEuro(analisi.rate.reduce((t, r) => t + (r.importo ?? 0), 0))} €</td>{conRitenuta && <td className="py-1.5 text-right font-semibold tabular-nums">{formatEuro(analisi.rate.reduce((t, r) => t + ((r.importo ?? 0) - r.trattenuta), 0))} €</td>}<td /></tr></tfoot>
      </table></div>}
      {analisi.errorePiano && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-amber-800">
        <span>{analisi.errorePiano}</span>
        {percentualiLeggibili && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={riportaA100}>Riporta le rate a 100%</Button>}
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={rate.length >= 24} onClick={() => cambiaRate([...rate, rataVuota(`Rata ${rate.length + 1}`)])}><Plus className="mr-1 h-4 w-4" />Aggiungi rata</Button>
        {!!rate.length && rate.some(r => MOMENTI_SAL.includes(r.evento)) && !durata && <span className="text-xs text-muted-foreground">I SAL si collocano nel tempo col cronoprogramma{onCronoprogramma && <> · <button type="button" className="underline" onClick={onCronoprogramma}>crealo</button></>}.</span>}
      </div>

      {/* La ritenuta a garanzia non è una rata: è una trattenuta su ogni pagamento, che torna allo svincolo (11/11/2026). */}
      <div className="space-y-2 rounded-md border border-dashed p-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28 space-y-1"><Label htmlFor="ritenuta-perc" className="text-xs">Ritenuta a garanzia</Label>
            <Input id="ritenuta-perc" className="h-8 tabular-nums" inputMode="decimal" maxLength={10} placeholder="Es. 5" value={ritenuta.percentuale}
              onChange={e => cambiaRitenuta({ percentuale: e.target.value })} /></div>
          {conRitenuta && <>
            <div className="w-40 space-y-1"><Label htmlFor="ritenuta-su" className="text-xs">Su quali pagamenti</Label>
              <Select value={ritenuta.su} onValueChange={su => cambiaRitenuta({ su: su as typeof ritenuta.su })}>
                <SelectTrigger id="ritenuta-su" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="sal">Solo sui SAL</SelectItem><SelectItem value="tutte">Su tutte le rate</SelectItem></SelectContent>
              </Select></div>
            <div className="w-44 space-y-1"><Label htmlFor="ritenuta-svincolo" className="text-xs">Si svincola</Label>
              <Select value={ritenuta.svincolo} onValueChange={sv => cambiaRitenuta({ svincolo: sv as typeof ritenuta.svincolo })}>
                <SelectTrigger id="ritenuta-svincolo" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="collaudo">Al collaudo</SelectItem><SelectItem value="mesi">Dopo la fine lavori</SelectItem></SelectContent>
              </Select></div>
            {ritenuta.svincolo === "mesi" && <div className="w-24 space-y-1"><Label htmlFor="ritenuta-mesi" className="text-xs">Dopo (mesi)</Label>
              <Input id="ritenuta-mesi" className="h-8 tabular-nums" inputMode="numeric" value={String(ritenuta.mesi)}
                onChange={e => { const n = Number.parseInt(e.target.value, 10); cambiaRitenuta({ mesi: Number.isFinite(n) && n >= 0 ? Math.min(60, n) : 0 }); }} /></div>}
          </>}
        </div>
        <p className="text-xs text-muted-foreground">{analisi.ritenuta
          ? `Restano fermi ${formatEuro(analisi.ritenuta.totale)} €, che tornano ${ritenuta.svincolo === "collaudo" ? "al collaudo" : `${ritenuta.mesi} mesi dopo la fine dei lavori`}. Si calcola sull'imponibile, non sull'IVA.`
          : "In percentuale (di solito il 5%): si trattiene su ogni pagamento e torna allo svincolo. Vuoto = nessuna ritenuta."}</p>
      </div>

      <div className="space-y-1"><Label htmlFor="native-pagamenti" className="text-xs">Altre condizioni di pagamento</Label>
        <Textarea id="native-pagamenti" rows={2} maxLength={3000} placeholder="Es. bonifico sul conto indicato in fattura" value={bozza.pagamenti} onChange={e => onChange({ pagamenti: e.target.value })} /></div>
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
            // Le rate a misura non si riproporzionano: non hanno una percentuale da scalare.
            const altre = rate.filter(r => r.evento !== "firma_contratto");
            const resto = altre.reduce((t, r) => t + (r.base === "avanzamento" ? 0 : Number(r.percentuale.replace(",", ".")) || 0), 0);
            const scala = resto > 0 ? (100 - acconto - analisi.quotaAMisura) / resto : 0;
            cambiaRate([{ ...rataVuota("Acconto"), percentuale: String(acconto), evento: "firma_contratto" },
              ...altre.map(r => r.base === "avanzamento" ? r : { ...r, percentuale: String(Math.round((Number(r.percentuale.replace(",", ".")) || 0) * scala * 100) / 100).replace(".", ",") })]);
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
