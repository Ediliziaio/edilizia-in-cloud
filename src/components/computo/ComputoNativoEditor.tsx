import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CloudUpload, Copy, Download, Eye, FileDown, FileSpreadsheet, Loader2, Plus, Trash2, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuotePageHeader, QuotePrimaryButton } from "@/components/marketing/preventivi/ui/builderUI";
import { CorpoPreventivatore } from "@/components/preventivatore/CorpoPreventivatore";
import { BarraFasi } from "@/components/preventivatore/BarraFasi";
import ComputoProgetto from "./ComputoProgetto";
import ComputoCapitoli from "./ComputoCapitoli";
import ComputoMisure from "./ComputoMisure";
import ComputoUnitaSelect from "./ComputoUnitaSelect";
import ComputoIva from "./ComputoIva";
import { calcolaIvaComputo } from "@/lib/computo/ivaComputo";
import { ComputoFormatoSelect, ComputoOpzione } from "./ComputoPdfControls";
import type { PickedVoce } from "@/components/ristrutturazione/ComputoEditor/types";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { allegatiDaIncludere } from "@/lib/computo/allegatiLocali";
import { creaBackupComputo, MAX_BACKUP_COMPUTO, ripristinaBackupComputo } from "@/lib/computo/backupComputo";
import { applicaVarianteComputo } from "@/lib/computo/variantiPdf";
import { formatEuro } from "@/lib/computo/computoStrutturato";
import {
  bozzaVuota, calcolaVoce, leggiBozzaComputo, salvaBozzaComputo, voceVuota, vociDaBozza, vociPerAnteprima, ConflittoBozzaComputo,
  type BozzaComputo, type VoceEditor,
} from "@/lib/computo/editorNativo";

const desktopSnapshot = () => window.matchMedia("(min-width: 1280px)").matches;
const AddVocePicker = lazy(() => import("@/components/ristrutturazione/ComputoEditor/AddVocePicker"));
const subscribeDesktop = (notify: () => void) => {
  const m = window.matchMedia("(min-width: 1280px)"); m.addEventListener("change", notify);
  return () => m.removeEventListener("change", notify);
};

function scaricaBozza(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "computo-metrico.bozza.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ComputoNativoEditor({ storageKey, azienda, dettagliAzienda, colore, onBack, fase, initialFase = 0, onFaseChange, consentiListini = false, cloud }: {
  storageKey: string; azienda?: string; dettagliAzienda?: string; colore?: string; onBack?: () => void;
  fase?: number; initialFase?: number; onFaseChange?: (fase: number) => void;
  consentiListini?: boolean;
  cloud?: { status: string; disabled?: boolean; onSave: (bozza: BozzaComputo) => Promise<void>; onChange: (bozza: BozzaComputo) => void };
}) {
  const [faseLocale, setFaseLocale] = useState(initialFase);
  const step = fase ?? faseLocale;
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, () => false);
  const [caricando, setCaricando] = useState(false);
  const cambiaFase = (n: number) => { if (caricando || esportando) return; setFaseLocale(n); onFaseChange?.(n); };
  const [iniziale] = useState(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
      return { raw, bozza: raw ? leggiBozzaComputo(raw) : bozzaVuota(), errore: "" };
    } catch { return { raw, bozza: bozzaVuota(), errore: "La bozza locale non è leggibile. Conserva l'originale o apri una copia valida." }; }
  });
  const [bozza, setBozza] = useState(iniziale.bozza);
  const cloudChange = cloud?.onChange;
  useEffect(() => { cloudChange?.(bozza); }, [bozza, cloudChange]);
  const [storico, setStorico] = useState<BozzaComputo[]>([]);
  const [scelta, setScelta] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ capitolo?: string } | null>(null);
  const [errore, setErrore] = useState(iniziale.errore);
  const [erroreLettura, setErroreLettura] = useState(!!iniziale.errore);
  const [salvato, setSalvato] = useState(!!iniziale.raw);
  const [conflitto, setConflitto] = useState(false);
  const [esportando, setEsportando] = useState(false);
  const senzaPrezzi = bozza.formatoPdf === "senza-prezzi" || ((bozza.formatoPdf === "riepilogo" || bozza.mostraPrezziUnitariPdf === false) && bozza.mostraImportiPdf === false);
  const [documentoPronto, setDocumentoPronto] = useState(false);
  const presentazione = bozza.formatoPdf === "cliente" || !bozza.formatoPdf ? "preventivo" as const : "tecnico" as const;
  const [anteprima, setAnteprima] = useState<Blob | null>(null);
  const [anteprimaParziale, setAnteprimaParziale] = useState(false);
  const renderAnteprima = useCallback(async () => {
    if (!anteprima) throw new Error("Anteprima non disponibile.");
    return URL.createObjectURL(anteprima);
  }, [anteprima]);
  const precedente = useRef(iniziale.raw);
  const importInput = useRef<HTMLInputElement>(null);
  const dettaglioRef = useRef<HTMLDivElement>(null);
  const apriVoce = (id: string) => {
    setScelta(id);
    requestAnimationFrame(() => dettaglioRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  };
  const modificato = useRef(false);
  const corrente = useRef(bozza);
  useEffect(() => { corrente.current = bozza; }, [bozza]);
  const v = bozza.voci.find(r => r.id === scelta) ?? bozza.voci[0];
  const risultati = useMemo(() => bozza.voci.map(r => calcolaVoce(r, senzaPrezzi)), [bozza.voci, senzaPrezzi]);
  const invalide = risultati.filter(r => r.errori.length).length;
  const totale = risultati.reduce((s, r) => s + (r.importo ?? 0), 0);
  const erroreIva = bozza.formatoPdf !== "senza-prezzi" && bozza.mostraImportiPdf !== false ? calcolaIvaComputo(totale, bozza).errore : "";
  const intestazione = useMemo(() => ({ titolo: bozza.titolo, committente: bozza.mostraDatiCliente === false ? null : bozza.committente, oggetto: bozza.oggetto,
    stato: "BOZZA LOCALE - non inviata", senzaPrezzi, presentazione, azienda, dettagliAzienda, colore,
    numero: bozza.numero, ivaModalita: bozza.ivaModalita, ivaAliquota: bozza.ivaAliquota, ivaNota: bozza.ivaNota,
    indirizzoIntervento: bozza.mostraDatiCliente === false ? "" : bozza.indirizzo,
    nascondiCliente: bozza.mostraDatiCliente === false, condizioni: bozza.mostraCondizioni === false ? "" : bozza.condizioni,
    impaginazione: "editoriale" as const, dettaglioMisure: bozza.mostraMisurePdf, dataDocumento: bozza.dataDocumento, revisione: bozza.revisione,
    tecnico: bozza.tecnico, riferimentoPrezzi: bozza.riferimentoPrezzi,
    mostraPrezziUnitari: bozza.mostraPrezziUnitariPdf, mostraImporti: bozza.mostraImportiPdf,
    mostraCodici: bozza.mostraCodiciPdf, mostraFonti: bozza.mostraFontiPdf, soloRiepilogo: bozza.formatoPdf === "riepilogo",
    inclusioni: bozza.mostraCondizioni === false ? "" : bozza.inclusioni, esclusioni: bozza.mostraCondizioni === false ? "" : bozza.esclusioni,
    tempi: bozza.mostraCondizioni === false ? "" : bozza.tempi, pagamenti: bozza.mostraCondizioni === false ? "" : bozza.pagamenti }),
  [bozza, senzaPrezzi, presentazione, azienda, dettagliAzienda, colore]);
  const liveKey = useMemo(() => JSON.stringify([bozza, intestazione]), [bozza, intestazione]);
  const renderLive = useCallback(async () => {
    const { generaDocumentoComputo } = await import("@/lib/computo/esportaComputo");
    const anteprima = vociPerAnteprima(bozza, senzaPrezzi);
    const allegati = await allegatiDaIncludere(storageKey, bozza.allegati ?? []);
    const parziale = anteprima.incomplete ? `Bozza parziale: ${anteprima.incomplete} lavorazioni da completare. Importi mancanti non inclusi nel parziale.` : !bozza.voci.length ? "Bozza in compilazione - nessuna lavorazione inserita." : undefined;
    const blob = await generaDocumentoComputo(anteprima.voci, { ...intestazione, titolo: bozza.titolo.trim() || "Preventivo in compilazione", parziale }, allegati);
    return URL.createObjectURL(blob);
  }, [bozza, senzaPrezzi, storageKey, intestazione]);
  const cambia = (nuova: BozzaComputo) => {
    if (conflitto) return;
    setDocumentoPronto(false);
    setStorico(h => [...h.slice(-29), bozza]);
    setBozza(nuova); modificato.current = true; setSalvato(false);
  };
  const modificaVoce = (patch: Partial<VoceEditor>) => v && cambia({ ...bozza, voci: bozza.voci.map(r => r.id === v.id ? { ...r, ...patch } : r) });

  useEffect(() => {
    if (!modificato.current || conflitto || erroreLettura) return;
    const id = setTimeout(() => {
      try {
        precedente.current = salvaBozzaComputo(localStorage, storageKey, bozza, precedente.current);
        modificato.current = false; setSalvato(true);
      } catch (e) {
        setErrore(e instanceof ConflittoBozzaComputo ? e.message : "Salvataggio locale non riuscito. Le modifiche restano aperte: conserva una copia dei dati.");
        if (e instanceof ConflittoBozzaComputo) setConflitto(true);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [bozza, storageKey, conflitto, erroreLettura]);

  useEffect(() => {
    const storage = (e: StorageEvent) => {
      if ((e.key === storageKey || e.key === null) && localStorage.getItem(storageKey) !== precedente.current) {
        setConflitto(true); setSalvato(false); setErrore("Bozza modificata in un'altra scheda. Scarica la tua copia o ricarica la versione salvata.");
      }
    };
    const uscita = (e: BeforeUnloadEvent) => { if (modificato.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("storage", storage); window.addEventListener("beforeunload", uscita);
    return () => { window.removeEventListener("storage", storage); window.removeEventListener("beforeunload", uscita); };
  }, [storageKey]);

  useEffect(() => () => {
    if (!modificato.current || erroreLettura) return;
    try { precedente.current = salvaBozzaComputo(localStorage, storageKey, corrente.current, precedente.current); }
    catch { /* Una versione concorrente non viene mai sovrascritta all'uscita. */ }
  }, [storageKey, erroreLettura]);

  const esporta = async (preview = false) => {
    setEsportando(true);
    try {
      if (!preview && erroreIva) throw new Error(erroreIva);
      const datiAnteprima = preview ? vociPerAnteprima(bozza, senzaPrezzi) : null;
      const voci = datiAnteprima?.voci ?? vociDaBozza(bozza, senzaPrezzi);
      const allegati = await allegatiDaIncludere(storageKey, bozza.allegati ?? []);
      const { esportaComputoPdf, generaDocumentoComputo } = await import("@/lib/computo/esportaComputo");
      if (preview) {
        const parziale = datiAnteprima?.incomplete ? `BOZZA PARZIALE: ${datiAnteprima.incomplete} lavorazioni da completare. Importi mancanti non inclusi nel parziale. Non è un'offerta definitiva.` : undefined;
        const blob = await generaDocumentoComputo(voci, { ...intestazione, parziale }, allegati);
        setAnteprimaParziale(!!parziale);
        setAnteprima(blob);
      } else await esportaComputoPdf(voci, intestazione, allegati);
      setDocumentoPronto(!invalide && !erroreIva);
      setErrore("");
    } catch (e) { setErrore(e instanceof Error ? e.message : "PDF non generato. Riprova."); }
    finally { setEsportando(false); }
  };
  const copiaBozza = async () => {
    setCaricando(true);
    try {
      const blob = erroreLettura
        ? new Blob([iniziale.raw ?? ""], { type: "application/json" })
        : await creaBackupComputo(storageKey, bozza);
      scaricaBozza(blob);
      setErrore("");
    } catch (e) { setErrore(e instanceof Error ? e.message : "Copia non riuscita. I dati restano aperti."); }
    finally { setCaricando(false); }
  };
  const aggiungi = (capitolo?: string) => {
    const nuova = { ...voceVuota(), capitolo: capitolo || v?.capitolo || "Opere edili" };
    cambia({ ...bozza, voci: [...bozza.voci, nuova] }); apriVoce(nuova.id);
  };
  const daListino = (picked: PickedVoce) => {
    if (bozza.voci.length >= 5000) { setPicker(null); return; }
    const unita = picked.unita_originale?.trim() || picked.unita_misura;
    const nuova = { ...voceVuota(), capitolo: picker?.capitolo || picked.capitolo_nome || "Opere edili",
      descrizione: [picked.descrizione, picked.descrizione_estesa].filter((s, n, all) => !!s && all.indexOf(s) === n).join("\n"),
      unita, quantita: String(picked.quantita ?? 1), prezzo: String(picked.prezzo_unitario),
      tariffa: picked.codice_tariffa || "", fonte: picked.fonte || "", corpo: unita === "corpo" || unita === "a corpo" };
    cambia({ ...bozza, voci: [...bozza.voci, nuova] }); apriVoce(nuova.id); setPicker(null);
  };
  const riordina = (delta: number) => {
    if (!v) return;
    const i = bozza.voci.indexOf(v); const j = i + delta;
    if (j < 0 || j >= bozza.voci.length) return;
    const righe = [...bozza.voci]; [righe[i], righe[j]] = [righe[j], righe[i]];
    cambia({ ...bozza, voci: righe });
  };
  const campo = (nome: string, key: "titolo" | "committente" | "oggetto" | "numero" | "indirizzo" | "dataDocumento" | "revisione" | "tecnico", max: number) => (
    <div className="min-w-0 space-y-1"><Label htmlFor={`native-${key}`}>{nome}</Label>
      <Input id={`native-${key}`} maxLength={max} value={bozza[key] ?? ""} onChange={e => cambia({ ...bozza, [key]: e.target.value })} /></div>
  );

  return <section className="min-w-0 space-y-4" aria-label="Editor computo metrico">
    {onBack && <Button variant="ghost" size="sm" disabled={caricando || esportando} onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Preventivi</Button>}
    <QuotePageHeader title="Preventivo con computo" numero={bozza.numero || "BOZZA"} subtitle={bozza.committente || "Nuovo preventivo"}
      stato={<Badge variant="outline">{cloud ? "Demo 2 · Supabase" : "Bozza locale"}</Badge>} icon={<FileSpreadsheet className="h-5 w-5" />} actions={<>
        {cloud && <Button variant="outline" size="sm" disabled={cloud.disabled || caricando || esportando || conflitto || erroreLettura} onClick={async () => {
          setCaricando(true); setErrore("");
          try { await cloud.onSave(bozza); } catch (e) { setErrore(e instanceof Error ? e.message : "Salvataggio Supabase non riuscito."); }
          finally { setCaricando(false); }
        }}><CloudUpload className="mr-1 h-4 w-4" />Salva su Supabase</Button>}
        <Button variant="outline" size="sm" disabled={caricando || esportando} onClick={copiaBozza}><Download className="mr-1 h-4 w-4" />{erroreLettura ? "Conserva originale" : "Copia bozza"}</Button>
        <Button variant="outline" size="sm" disabled={conflitto || caricando || esportando} onClick={() => importInput.current?.click()}><Upload className="mr-1 h-4 w-4" />Apri bozza</Button>
        <Button variant="outline" size="sm" disabled={caricando || esportando || !bozza.voci.length || !bozza.titolo.trim()} onClick={() => esporta(true)}><Eye className="mr-1 h-4 w-4" />Anteprima</Button>
        <QuotePrimaryButton aria-label="Scarica preventivo" size="sm" disabled={esportando || caricando || !bozza.voci.length || !!invalide || !!erroreIva || !bozza.titolo.trim()} onClick={() => esporta()}>
          {esportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Scarica PDF
        </QuotePrimaryButton>
      </>} />
      <p role="status" aria-label="Salvataggio bozza" className="text-xs text-muted-foreground">
        {conflitto || erroreLettura ? "Salvataggio sospeso" : salvato ? cloud ? "Copia locale salvata" : "Bozza salvata in questo browser" : "Bozza locale"} · {cloud ? cloud.status : "non sincronizzata con il gestionale"}
      </p>
    <BarraFasi passi={[{ key: "0", label: "Dati" }, { key: "1", label: "Progetto" }, { key: "2", label: "Computo" }, { key: "3", label: "Documento" }]}
      corrente={String(step)} completati={new Set([!!bozza.titolo.trim() && !!bozza.committente.trim(), true, !!bozza.voci.length && !invalide, documentoPronto].flatMap((ok, n) => ok ? [String(n)] : []))}
      onSelect={n => cambiaFase(Number(n))} ariaLabel="Fasi del preventivo con computo" />
    <input type="file" aria-label="File bozza computo" ref={importInput} accept=".json" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      setCaricando(true);
      try {
        if (file.size > MAX_BACKUP_COMPUTO) throw new Error("Bozza troppo grande: massimo 75 MB.");
        const nuova = await ripristinaBackupComputo(storageKey, await file.text()); cambia(nuova); setErroreLettura(false); setScelta(null); setErrore("");
      } catch (e) { setErrore(`${e instanceof Error ? e.message : "File bozza non valido."} Il computo attuale non è stato modificato.`); }
      finally { setCaricando(false); }
    }} />
    {errore && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <span>{errore}</span>{conflitto && <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Ricarica versione salvata</Button>}
    </div>}
    <CorpoPreventivatore className="px-0 py-0 sm:px-0" anteprima={<div className="flex h-[65dvh] min-h-[420px] flex-col gap-2">
      <ComputoFormatoSelect label="Variante anteprima PDF" value={bozza.formatoPdf} disabled={esportando || caricando || conflitto || erroreLettura} onChange={value => cambia(applicaVarianteComputo(bozza, value))} />
      <div className="min-h-0 flex-1"><PdfBlobLivePreviewPanel renderBlobUrl={renderLive} depsKey={liveKey} debounceMs={900} enabled={desktop} downloadFileName="preventivo-computo.pdf" /></div>
    </div>}>
    <fieldset disabled={conflitto || erroreLettura || esportando || caricando} className="min-w-0 space-y-4">
      {step === 0 && <div className="space-y-6">
        <section className="space-y-4"><h2 className="text-lg font-semibold">Cliente e intervento</h2>
          <div className="grid gap-4 sm:grid-cols-2">{campo("Titolo", "titolo", 160)}{campo("Committente", "committente", 160)}
            {campo("Oggetto dei lavori", "oggetto", 500)}{campo("Indirizzo intervento", "indirizzo", 300)}</div>
        </section>
        <section className="space-y-4 border-t pt-5"><h3 className="text-sm font-semibold">Riferimenti del documento</h3>
          <div className="grid gap-4 sm:grid-cols-2">{campo("Numero preventivo", "numero", 80)}{campo("Data del documento", "dataDocumento", 40)}
            {campo("Revisione", "revisione", 80)}{campo("Tecnico o referente", "tecnico", 300)}</div>
          <div className="space-y-2"><Label htmlFor="native-prezzi">Riferimenti dei prezzi</Label><Textarea id="native-prezzi" rows={2} maxLength={2000} value={bozza.riferimentoPrezzi} onChange={e => cambia({ ...bozza, riferimentoPrezzi: e.target.value })} /></div>
        </section>
      </div>}
      {step === 1 && <ComputoProgetto scope={storageKey} allegati={bozza.allegati ?? []} onBusy={setCaricando} onChange={allegati => cambia({ ...bozza, allegati })} />}
      {step === 2 && <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
        <div className="flex flex-wrap gap-2">
          {!!bozza.voci.length && <Button size="sm" disabled={bozza.voci.length >= 5000} onClick={() => consentiListini ? setPicker({}) : aggiungi()}><Plus className="mr-1 h-4 w-4" />Aggiungi lavorazione</Button>}
          <Button variant="outline" size="icon" title="Annulla ultima modifica" aria-label="Annulla ultima modifica" disabled={!storico.length} onClick={() => {
            setBozza(storico.at(-1)!); setStorico(h => h.slice(0, -1)); modificato.current = true; setSalvato(false); setDocumentoPronto(false);
          }}><Undo2 className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>{bozza.voci.length} voci · {invalide ? `${invalide} da completare · parziale ` : "Totale "}<strong>{formatEuro(totale)} €</strong></span>
        </div>
      </div>
      <ComputoCapitoli voci={bozza.voci} capitoliVuoti={bozza.capitoli ?? []} scelta={v?.id} onSelect={apriVoce} onAdd={aggiungi}
        onCapitoli={capitoli => cambia({ ...bozza, capitoli })}
        onRename={(prima, dopo) => cambia({ ...bozza, capitoli: (bozza.capitoli ?? []).map(n => n === prima ? dopo : n), voci: bozza.voci.map(r => (r.capitolo.trim() || "Opere edili") === prima ? { ...r, capitolo: dopo } : r) })}
        onListino={consentiListini ? capitolo => setPicker({ capitolo }) : undefined} />
          {v && <div ref={dettaglioRef} className="min-w-0 scroll-mt-24 space-y-4 rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Voce {bozza.voci.indexOf(v) + 1}</h3><div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label="Sposta voce su" title="Sposta su" disabled={bozza.voci.indexOf(v) === 0} onClick={() => riordina(-1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Sposta voce giù" title="Sposta giù" disabled={bozza.voci.indexOf(v) === bozza.voci.length - 1} onClick={() => riordina(1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Duplica voce" title="Duplica voce" disabled={bozza.voci.length >= 5000} onClick={() => {
                const copia = { ...v, id: crypto.randomUUID(), misure: v.misure.map(m => ({ ...m, id: crypto.randomUUID() })) };
                cambia({ ...bozza, voci: [...bozza.voci, copia] }); setScelta(copia.id);
              }}><Copy className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Elimina voce" title="Elimina voce" onClick={() => cambia({ ...bozza, voci: bozza.voci.filter(r => r.id !== v.id) })}><Trash2 className="h-4 w-4" /></Button>
            </div></div>
            <div className="space-y-1"><Label htmlFor="voce-descrizione">Descrizione della lavorazione</Label><Textarea id="voce-descrizione" rows={4} maxLength={30000} value={v.descrizione} onChange={e => modificaVoce({ descrizione: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([['Codice tariffa', 'tariffa'], ['Unità di misura', 'unita'], ['Quantità', 'quantita'], ['Prezzo unitario', 'prezzo']] as const).map(([label, key]) =>
              <div key={key} className="min-w-0 space-y-1"><Label htmlFor={`voce-${key}`}>{label}</Label>{key === "unita"
                ? <ComputoUnitaSelect key={v.id} value={v.unita} onChange={unita => modificaVoce({ unita, corpo: unita === "corpo" || unita === "a corpo" })} />
                : <Input id={`voce-${key}`} maxLength={key === "tariffa" ? 160 : 40} inputMode={key === "quantita" || key === "prezzo" ? "decimal" : "text"}
                  disabled={key === "quantita" && !!v.misure.length} value={key === "quantita" && v.misure.length ? String(calcolaVoce(v).quantita ?? "").replace(".", ",") : v[key]} onChange={e => modificaVoce({ [key]: e.target.value })} />}</div>)}</div>
            <details className="border-y py-3"><summary className="cursor-pointer text-sm font-medium">Classificazione e opzioni tecniche</summary><div className="mt-3 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">{([['Capitolo', 'capitolo'], ['Categoria', 'categoria'], ['Sottocategoria', 'sottocategoria']] as const).map(([label, key]) =>
                <div key={key} className="min-w-0 space-y-1"><Label htmlFor={`voce-${key}`}>{label}</Label><Input id={`voce-${key}`} maxLength={300} value={v[key]} onChange={e => modificaVoce({ [key]: e.target.value })} /></div>)}</div>
              <div className="space-y-1"><Label htmlFor="voce-fonte">Fonte del prezzo</Label><Input id="voce-fonte" maxLength={500} value={v.fonte ?? ""} onChange={e => modificaVoce({ fonte: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="voce-note-misure">Misure di riferimento originali (non usate nel calcolo)</Label><Textarea id="voce-note-misure" rows={4} maxLength={30000} value={v.noteMisure ?? ""} onChange={e => modificaVoce({ noteMisure: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="voce-comune">Descrizione comune del gruppo</Label><Textarea id="voce-comune" rows={4} maxLength={30000} value={v.descrizioneComune ?? ""} onChange={e => modificaVoce({ descrizioneComune: e.target.value })} /></div>
              <div>{([['A corpo', 'corpo'], ['Oneri sicurezza', 'sicurezza'], ['Detrazione', 'detrazione']] as const).map(([label, key]) =>
                <ComputoOpzione key={key} label={label} checked={v[key]} onChange={value => modificaVoce({ [key]: value })} />)}</div>
            </div></details>
            <ComputoMisure misure={v.misure} onChange={misure => modificaVoce({ misure })} />
            <div className="flex flex-wrap justify-between gap-3 border-t pt-3 text-sm"><ul className="text-amber-800">{calcolaVoce(v, senzaPrezzi).errori.map(e => <li key={e}>{e}</li>)}</ul><strong>Importo voce: {calcolaVoce(v).importo == null ? "Da completare" : `${formatEuro(calcolaVoce(v).importo!)} €`}</strong></div>
          </div>}
      </>}
      {step === 3 && <div className="space-y-6">
        <section className="space-y-4 border-b pb-5" aria-label="Formato del documento">
          <h2 className="text-lg font-semibold">Prepara il documento</h2>
          <div className="space-y-2"><Label htmlFor="native-layout">Documento PDF</Label>
            <ComputoFormatoSelect id="native-layout" label="Documento PDF" value={bozza.formatoPdf} disabled={conflitto || erroreLettura || esportando || caricando} onChange={value => cambia(applicaVarianteComputo(bozza, value))} />
          </div>
        </section>
        <section aria-label="Contenuti da mostrare al cliente">
          <h3 className="mb-1 text-sm font-semibold">Informazioni e importi</h3>
          <ComputoOpzione label="Dati del cliente" checked={bozza.mostraDatiCliente !== false} onChange={value => cambia({ ...bozza, mostraDatiCliente: value })} />
          <ComputoOpzione label="Prezzi unitari" disabled={bozza.formatoPdf === "senza-prezzi" || bozza.formatoPdf === "riepilogo"} checked={bozza.formatoPdf !== "senza-prezzi" && bozza.formatoPdf !== "riepilogo" && bozza.mostraPrezziUnitariPdf !== false} onChange={value => cambia({ ...bozza, mostraPrezziUnitariPdf: value })} />
          <ComputoOpzione label="Importi e totale" disabled={bozza.formatoPdf === "senza-prezzi"} checked={bozza.formatoPdf !== "senza-prezzi" && bozza.mostraImportiPdf !== false} onChange={value => cambia({ ...bozza, mostraImportiPdf: value })} />
          <ComputoOpzione label="Note e condizioni nel PDF" checked={bozza.mostraCondizioni !== false} onChange={value => cambia({ ...bozza, mostraCondizioni: value })} />
        </section>
        <details className="group border-y py-3"><summary className="cursor-pointer py-1 text-sm font-medium">Dettagli tecnici nel PDF</summary>
          <div className="mt-2">
            <ComputoOpzione label="Dettaglio delle misure" disabled={bozza.formatoPdf === "riepilogo"} checked={bozza.formatoPdf !== "riepilogo" && bozza.mostraMisurePdf} onChange={value => cambia({ ...bozza, mostraMisurePdf: value })} />
            <ComputoOpzione label="Codici tariffa" disabled={bozza.formatoPdf === "riepilogo"} checked={bozza.formatoPdf !== "riepilogo" && bozza.mostraCodiciPdf !== false} onChange={value => cambia({ ...bozza, mostraCodiciPdf: value })} />
            <ComputoOpzione label="Fonti e riferimenti dei prezzi" checked={bozza.mostraFontiPdf !== false} onChange={value => cambia({ ...bozza, mostraFontiPdf: value })} />
          </div>
        </details>
        <ComputoIva value={bozza} imponibile={totale} onChange={patch => cambia({ ...bozza, ...patch })} />
        {(bozza.mostraDatiCliente === false || bozza.formatoPdf === "senza-prezzi" || bozza.mostraImportiPdf === false) && (bozza.allegati ?? []).some(a => a.includi) && <p role="note" className="text-xs text-muted-foreground">Gli allegati mantengono il contenuto originale, inclusi eventuali prezzi o dati personali.</p>}
        <div className="grid gap-3 border-y py-4 text-sm sm:grid-cols-3"><div><span className="block text-muted-foreground">Lavorazioni</span><strong>{bozza.voci.length}</strong></div><div><span className="block text-muted-foreground">Allegati nel PDF</span><strong>{(bozza.allegati ?? []).filter(a => a.includi).length}</strong></div><div><span className="block text-muted-foreground">{invalide ? "Parziale imponibile" : "Totale imponibile"}</span><strong>{formatEuro(totale)} €</strong></div></div>
        {(!bozza.titolo.trim() || !bozza.voci.length || !!invalide) && <div role="region" aria-label="Controlli prima del PDF" className="space-y-2 border-l-2 border-amber-400 pl-3 text-sm">
          <h3 className="font-medium">Da completare prima del download</h3>
          {!bozza.titolo.trim() && <Button variant="link" className="h-auto p-0" onClick={() => cambiaFase(0)}>Inserisci il titolo del preventivo</Button>}
          {!bozza.voci.length && <Button variant="link" className="h-auto p-0" onClick={() => cambiaFase(2)}>Inserisci almeno una lavorazione</Button>}
          {bozza.voci.flatMap((r, i) => risultati[i].errori.length ? [<div key={r.id} className="space-y-1">
            <Button variant="link" className="h-auto max-w-full whitespace-normal p-0 text-left" onClick={() => { setScelta(r.id); cambiaFase(2); }}>Completa lavorazione {i + 1}</Button>
            <p className="text-muted-foreground">{risultati[i].errori.join(" ")}</p>
          </div>] : []).slice(0, 10)}
          {invalide > 10 && <p className="text-muted-foreground">Altre {invalide - 10} lavorazioni da completare nel computo.</p>}
        </div>}
        <div className="space-y-1"><Label htmlFor="native-condizioni">Note e condizioni del preventivo</Label><Textarea id="native-condizioni" maxLength={12000} rows={4} value={bozza.condizioni} onChange={e => cambia({ ...bozza, condizioni: e.target.value })} /></div>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Inclusioni, esclusioni, tempi e pagamenti</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
          {([["Lavorazioni incluse", "inclusioni", 6000], ["Esclusioni e limiti", "esclusioni", 6000], ["Tempi di esecuzione", "tempi", 3000], ["Modalità di pagamento", "pagamenti", 3000]] as const).map(([label, key, max]) =>
            <div key={key} className="space-y-1"><Label htmlFor={`native-${key}`}>{label}</Label><Textarea id={`native-${key}`} rows={3} maxLength={max} value={bozza[key]} onChange={e => cambia({ ...bozza, [key]: e.target.value })} /></div>)}
        </div></details>
      </div>}
    </fieldset>
    <nav aria-label="Navigazione fasi" className="flex items-center justify-between border-t pt-4">
      <Button variant="outline" disabled={step === 0 || caricando || esportando} onClick={() => cambiaFase(step - 1)}><ArrowLeft className="mr-1 h-4 w-4" />Indietro</Button>
      {step < 3 && <QuotePrimaryButton disabled={caricando || esportando} onClick={() => cambiaFase(step + 1)}>Avanti</QuotePrimaryButton>}
      {step === 3 && <QuotePrimaryButton disabled={caricando || esportando || !bozza.voci.length || !!invalide || !!erroreIva || !bozza.titolo.trim()} onClick={() => esporta()}>
        {esportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Scarica documento
      </QuotePrimaryButton>}
    </nav>
    </CorpoPreventivatore>
    {picker && consentiListini && <Suspense fallback={<p role="status">Apertura listini…</p>}><AddVocePicker open onOpenChange={open => { if (!open) setPicker(null); }} onPick={daListino} targetCapitolo={picker.capitolo} /></Suspense>}
    <Dialog open={!!anteprima} onOpenChange={open => { if (!open) setAnteprima(null); }}>
      <DialogContent className="flex h-[90dvh] max-w-5xl flex-col">
        <DialogHeader><DialogTitle>{anteprimaParziale ? "Anteprima bozza parziale" : "Anteprima preventivo"}</DialogTitle><DialogDescription>{anteprimaParziale ? "Contiene lavorazioni da completare. Il documento definitivo resta bloccato fino alla correzione." : "PDF della bozza locale, non inviata."}</DialogDescription></DialogHeader>
        {anteprima && <div className="min-h-0 flex-1"><PdfBlobLivePreviewPanel renderBlobUrl={renderAnteprima} depsKey="computo" debounceMs={0} downloadFileName={anteprimaParziale ? "bozza-parziale-computo.pdf" : "preventivo-computo.pdf"} showDownloadOnMobile /></div>}
      </DialogContent>
    </Dialog>
  </section>;
}
