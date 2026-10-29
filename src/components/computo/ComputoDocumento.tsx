/**
 * Passo «Documento» del preventivo con computo (29/10/2026, sul modello di
 * Hausme): si sceglie il documento, quali sezioni escono, quali capitoli, le
 * colonne, la detrazione fiscale e le condizioni; in fondo l'invio per la
 * firma elettronica, come negli altri preventivi. Tutto quello che si accende
 * o si spegne si vede subito nell'anteprima.
 */
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Briefcase, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComputoFormatoSchede, ComputoOpzione } from "./ComputoPdfControls";
import ComputoCronoprogramma from "./ComputoCronoprogramma";
import { calcolaVoce, type BozzaComputo } from "@/lib/computo/editorNativo";
import { applicaVarianteComputo } from "@/lib/computo/variantiPdf";
import { AVVERTENZA_DETRAZIONE, TETTI_ECOBONUS, TIPI_DETRAZIONE, calcolaDetrazione } from "@/lib/computo/detrazioneComputo";
import { formatEuro } from "@/lib/computo/computoStrutturato";

type Sezione = keyof BozzaComputo["sezioniPdf"];

export default function ComputoDocumento({ creaCommessa, bozza, onChange, onSostituisci, spesaCliente, ivaInclusa = true, totaleDocumento, controlli, onVaiA, companyId, disabilitato, condizioniDelModello, invioFirma }: {
  bozza: BozzaComputo;
  onChange: (patch: Partial<BozzaComputo>) => void;
  /** Cambio di formato: tocca più campi insieme (`applicaVarianteComputo`). */
  onSostituisci: (bozza: BozzaComputo) => void;
  /** Quanto paga il cliente (IVA compresa se c'è), sul documento: base della detrazione. */
  spesaCliente: number;
  /** La spesa del cliente comprende l'IVA (è impostata). */
  ivaInclusa?: boolean;
  totaleDocumento: number;
  /** Il riquadro «Da completare prima del download», già pronto. */
  controlli: ReactNode;
  onVaiA: (passo: number) => void;
  companyId?: string;
  disabilitato?: boolean;
  /** Le condizioni contrattuali del modello dell'azienda, per ripristinarle. */
  condizioniDelModello?: string;
  /** L'invio per firma elettronica (InviaFirmaCard), quando il preventivo si salva nel gestionale. */
  invioFirma?: ReactNode;
  /** Prepara righe e rate e apre la commessa nuova precompilata. */
  creaCommessa?: () => Promise<void>;
}) {
  const [creando, setCreando] = useState(false);
  const sez = bozza.sezioniPdf;
  const cambiaSezione = (k: Sezione, v: boolean) => onChange({ sezioniPdf: { ...sez, [k]: v } });
  const capitoli = new Map<string, number>();
  for (const v of bozza.voci) { const n = v.capitolo.trim() || "Opere edili"; capitoli.set(n, (capitoli.get(n) ?? 0) + (v.opzionale ? 0 : calcolaVoce(v).importo ?? 0)); }
  const esclusi = new Set(bozza.capitoliEsclusiPdf);
  const importoEscluso = [...capitoli].filter(([n]) => esclusi.has(n)).reduce((t, [, v]) => t + v, 0);
  const detrazione = calcolaDetrazione(bozza.detrazione, spesaCliente, ivaInclusa);
  const d = bozza.detrazione;
  const senzaPrezzi = bozza.formatoPdf === "senza-prezzi", riepilogo = bozza.formatoPdf === "riepilogo";

  const sezioni: [Sezione, string, string, (() => void) | null][] = [
    ["copertina", "Copertina", "Pagina intera con titolo, cliente e logo", null],
    ["premessa", "Dati del lavoro e premessa", "Committente, luogo, oggetto e la premessa del modello", () => onVaiA(0)],
    ["indice", "Piano dei lavori", "L'elenco dei capitoli con le pagine", null],
    ["lavorazioni", "Lavorazioni", "Il dettaglio delle voci capitolo per capitolo", () => onVaiA(2)],
    ["riepilogo", "Riepilogo economico", "Capitoli, sconto, IVA e totale", () => onVaiA(3)],
    ["cronoprogramma", "Cronoprogramma", "Le fasi del cantiere in giorni lavorativi", null],
    ["pagamenti", "Piano dei pagamenti", "Acconto, SAL e saldo con gli importi", () => onVaiA(3)],
    ["detrazione", "Detrazione fiscale", "Quanto recupera il cliente e il costo effettivo", null],
    ["contrattuali", "Condizioni contrattuali", "Il testo del modello dell'azienda", null],
    ["firme", "Accettazione e firme", "La pagina da firmare, con le clausole da approvare", null],
  ];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 className="text-base font-semibold">Prepara il documento</h2>
        <p className="text-xs text-muted-foreground">Scegli il documento e cosa mostrare: l'anteprima si aggiorna subito.</p></div>
      <dl aria-label="Riepilogo del documento" className="flex gap-5 text-right text-sm tabular-nums">
        <div><dt className="text-xs text-muted-foreground">Lavorazioni</dt><dd className="font-semibold">{bozza.voci.length}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Allegati nel PDF</dt><dd className="font-semibold">{(bozza.allegati ?? []).filter(a => a.includi).length}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Totale imponibile</dt><dd className="font-semibold">{formatEuro(totaleDocumento)} €</dd></div>
      </dl>
    </div>
    {controlli}

    <section className="space-y-2" aria-label="Formato del documento">
      <h3 className="text-sm font-semibold">Documento PDF</h3>
      <ComputoFormatoSchede value={bozza.formatoPdf} disabled={disabilitato} onChange={value => onSostituisci(applicaVarianteComputo(bozza, value))} />
    </section>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-label="Sezioni del documento" className="rounded-lg border bg-white p-3">
        <h3 className="mb-1 text-sm font-semibold">Sezioni del documento</h3>
        <ul className="divide-y">{sezioni.map(([k, titolo, testo, vai]) => <li key={k} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0"><span className="flex items-center gap-1 text-sm">{titolo}
            {vai && <button type="button" aria-label={`Modifica: ${titolo}`} title="Vai dove si modifica" className="text-muted-foreground hover:text-orange-600" onClick={vai}><ArrowUpRight className="h-3.5 w-3.5" /></button>}</span>
            <span className="block text-[11px] text-muted-foreground">{testo}</span></div>
          <Switch aria-label={`Sezione ${titolo}`} checked={sez[k] !== false} disabled={disabilitato || (k === "lavorazioni" && riepilogo)} onCheckedChange={v => cambiaSezione(k, v)} />
        </li>)}</ul>
      </section>

      <div className="space-y-4">
        <section aria-label="Capitoli nel documento" className="rounded-lg border bg-white p-3">
          <h3 className="mb-1 text-sm font-semibold">Capitoli nel documento</h3>
          {!capitoli.size ? <p className="text-xs text-muted-foreground">I capitoli compariranno qui.</p> : <ul className="divide-y">{[...capitoli].map(([nome, importo]) => <li key={nome} className="flex items-center justify-between gap-3 py-1.5">
            <span className={`min-w-0 truncate text-sm ${esclusi.has(nome) ? "text-muted-foreground line-through" : ""}`}>{nome}</span>
            <span className="flex shrink-0 items-center gap-3"><span className="text-xs tabular-nums text-muted-foreground">{formatEuro(importo)} €</span>
              <Switch aria-label={`Capitolo ${nome} nel documento`} checked={!esclusi.has(nome)} disabled={disabilitato} onCheckedChange={v => onChange({ capitoliEsclusiPdf: v ? bozza.capitoliEsclusiPdf.filter(n => n !== nome) : [...bozza.capitoliEsclusiPdf, nome] })} /></span>
          </li>)}</ul>}
          {importoEscluso > 0 && <p className="mt-1 text-xs text-amber-800">Il PDF non mostra {formatEuro(importoEscluso)} € di capitoli spenti: il totale del documento li esclude.</p>}
        </section>
        <section aria-label="Contenuti da mostrare al cliente" className="rounded-lg border bg-white px-3 pt-2">
          <h3 className="text-sm font-semibold">Colonne e dettagli</h3>
          <ComputoOpzione label="Dati del cliente" checked={bozza.mostraDatiCliente !== false} onChange={value => onChange({ mostraDatiCliente: value })} />
          <ComputoOpzione label="Prezzi unitari" disabled={senzaPrezzi || riepilogo} checked={!senzaPrezzi && !riepilogo && bozza.mostraPrezziUnitariPdf !== false} onChange={value => onChange({ mostraPrezziUnitariPdf: value })} />
          <ComputoOpzione label="Importi e totale" disabled={senzaPrezzi} checked={!senzaPrezzi && bozza.mostraImportiPdf !== false} onChange={value => onChange({ mostraImportiPdf: value })} />
          <ComputoOpzione label="Dettaglio delle misure" disabled={riepilogo} checked={!riepilogo && bozza.mostraMisurePdf} onChange={value => onChange({ mostraMisurePdf: value })} />
          <ComputoOpzione label="Codici tariffa" disabled={riepilogo} checked={!riepilogo && bozza.mostraCodiciPdf !== false} onChange={value => onChange({ mostraCodiciPdf: value })} />
          <ComputoOpzione label="Fonti e riferimenti dei prezzi" checked={bozza.mostraFontiPdf !== false} onChange={value => onChange({ mostraFontiPdf: value })} />
          <ComputoOpzione label="Note e condizioni" checked={bozza.mostraCondizioni !== false} onChange={value => onChange({ mostraCondizioni: value })} />
        </section>
      </div>
    </div>
    {(bozza.mostraDatiCliente === false || senzaPrezzi || bozza.mostraImportiPdf === false) && (bozza.allegati ?? []).some(a => a.includi) && <p role="note" className="text-xs text-muted-foreground">Gli allegati mantengono il contenuto originale, inclusi eventuali prezzi o dati personali.</p>}

    <section aria-label="Detrazione fiscale" className="space-y-3 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">Detrazione fiscale</h3>
        {d.tipo !== "nessuna" && sez.detrazione === false && <span className="text-xs text-amber-800">La sezione è spenta: non esce nel PDF.</span>}</div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_6rem_6rem]">
        <div className="space-y-1"><Label htmlFor="detrazione-tipo" className="text-xs">Agevolazione</Label>
          <Select value={d.tipo} onValueChange={tipo => onChange({ detrazione: { ...d, tipo: tipo as BozzaComputo["detrazione"]["tipo"], percentuale: "" } })}>
            <SelectTrigger id="detrazione-tipo" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="nessuna">Nessuna detrazione</SelectItem>
              {(Object.keys(TIPI_DETRAZIONE) as (keyof typeof TIPI_DETRAZIONE)[]).map(k => <SelectItem key={k} value={k}>{TIPI_DETRAZIONE[k].nome}{TIPI_DETRAZIONE[k].percentuale ? ` · ${TIPI_DETRAZIONE[k].percentuale}%` : ""}</SelectItem>)}</SelectContent>
          </Select></div>
        {d.tipo !== "nessuna" && <>
          <div className="space-y-1"><Label htmlFor="detrazione-perc" className="text-xs">Percentuale</Label>
            <Input id="detrazione-perc" className="h-9 tabular-nums" inputMode="decimal" maxLength={10} placeholder={String(TIPI_DETRAZIONE[d.tipo].percentuale ?? "")} value={d.percentuale} onChange={e => onChange({ detrazione: { ...d, percentuale: e.target.value } })} /></div>
          <div className="space-y-1"><Label htmlFor="detrazione-anni" className="text-xs">Anni</Label>
            <Input id="detrazione-anni" className="h-9 tabular-nums" inputMode="numeric" value={String(d.anni)} onChange={e => { const n = Number.parseInt(e.target.value, 10); onChange({ detrazione: { ...d, anni: Number.isFinite(n) && n > 0 ? Math.min(20, n) : 10 } }); }} /></div>
        </>}
      </div>
      {d.tipo.startsWith("ecobonus") && <div className="space-y-1"><Label htmlFor="detrazione-tetto" className="text-xs">Tipo di intervento (tetto della detrazione)</Label>
        <Select value={TETTI_ECOBONUS.some(([v]) => v === d.tetto) ? d.tetto : d.tetto ? "altro" : ""} onValueChange={v => onChange({ detrazione: { ...d, tetto: v === "altro" ? d.tetto || "0" : v } })}>
          <SelectTrigger id="detrazione-tetto" className="h-9"><SelectValue placeholder="Scegli l'intervento" /></SelectTrigger>
          <SelectContent>{TETTI_ECOBONUS.map(([v, nome]) => <SelectItem key={v} value={v}>{nome} · fino a {Number(v).toLocaleString("it-IT")} €</SelectItem>)}<SelectItem value="altro">Altro tetto (lo scrivo)</SelectItem></SelectContent>
        </Select>
        {!!d.tetto && !TETTI_ECOBONUS.some(([v]) => v === d.tetto) && <Input aria-label="Tetto della detrazione in euro" className="h-9 tabular-nums" inputMode="decimal" value={d.tetto} onChange={e => onChange({ detrazione: { ...d, tetto: e.target.value } })} />}
      </div>}
      {detrazione?.errore && <p role="alert" className="text-sm text-amber-800">{detrazione.errore}</p>}
      {!!detrazione?.avvisi.length && <ul className="space-y-0.5 text-xs text-amber-800">{detrazione.avvisi.map(a => <li key={a}>{a}</li>)}</ul>}
      {detrazione && !detrazione.errore && <dl className="grid gap-2 sm:grid-cols-4">
        {([["Spesa detraibile", detrazione.base], ["Detrazione", detrazione.detraibile], [`Rata annua (${detrazione.anni} anni)`, detrazione.rata], ["Costo effettivo", detrazione.netto]] as const).map(([k, v]) =>
          <div key={k} className={`rounded-md border p-2 ${k === "Costo effettivo" ? "border-orange-200 bg-orange-50" : "bg-slate-50"}`}><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{formatEuro(v)} €</dd></div>)}
      </dl>}
      {d.tipo !== "nessuna" && <>
        <Input aria-label="Nota sulla detrazione" className="h-9" maxLength={1000} placeholder="Es. intervento su abitazione principale, pagamento con bonifico parlante" value={d.nota} onChange={e => onChange({ detrazione: { ...d, nota: e.target.value } })} />
        <p className="text-[11px] text-muted-foreground">{AVVERTENZA_DETRAZIONE}</p>
      </>}
    </section>

    <ComputoCronoprogramma bozza={bozza} companyId={companyId} onChange={patch => onChange(patch)} />

    <section aria-label="Condizioni" className="space-y-3 rounded-lg border bg-white p-3">
      <div className="space-y-1"><Label htmlFor="native-condizioni" className="text-sm font-semibold">Note e condizioni del preventivo</Label><Textarea id="native-condizioni" maxLength={12000} rows={3} value={bozza.condizioni} onChange={e => onChange({ condizioni: e.target.value })} /></div>
      <details><summary className="cursor-pointer text-sm font-medium">Inclusioni, esclusioni e tempi</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">
        {([["Lavorazioni incluse", "inclusioni", 6000], ["Esclusioni e limiti", "esclusioni", 6000], ["Tempi di esecuzione", "tempi", 3000]] as const).map(([label, key, max]) =>
          <div key={key} className="space-y-1"><Label htmlFor={`native-${key}`} className="text-xs">{label}</Label><Textarea id={`native-${key}`} rows={3} maxLength={max} value={bozza[key]} onChange={e => onChange({ [key]: e.target.value })} /></div>)}
      </div></details>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="native-contrattuali" className="text-sm font-semibold">Condizioni contrattuali</Label>
          {!!condizioniDelModello?.trim() && condizioniDelModello !== bozza.condizioniContrattuali && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange({ condizioniContrattuali: condizioniDelModello })}><RotateCcw className="mr-1 h-3.5 w-3.5" />Riprendi quelle del modello</Button>}</div>
        <Textarea id="native-contrattuali" rows={5} maxLength={20000} placeholder={"Si impostano una volta in Impostazioni → Modelli preventivi → Computo metrico.\n# Condizioni contrattuali\n## 1. Oggetto\n- …"} value={bozza.condizioniContrattuali} onChange={e => onChange({ condizioniContrattuali: e.target.value })} />
      </div>
    </section>

    {invioFirma}
    {creaCommessa && <section aria-label="Commessa" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3">
      <div className="min-w-0"><h3 className="text-sm font-semibold">Dal preventivo alla commessa</h3>
        <p className="text-xs text-muted-foreground">Apre la commessa nuova con cliente, voci del computo e rate del piano già compilati: la rivedi e la salvi. Un preventivo firmato non si riscrive.</p></div>
      <Button type="button" size="sm" variant="outline" disabled={creando || disabilitato || !bozza.voci.length} onClick={async () => {
        setCreando(true);
        try { await creaCommessa(); } catch (e) { toast.error((e as Error).message); } finally { setCreando(false); }
      }}>{creando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Briefcase className="mr-1 h-4 w-4" />}Crea la commessa</Button>
    </section>}
  </div>;
}
