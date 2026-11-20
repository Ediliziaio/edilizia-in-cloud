/**
 * Conteggi da un disegno CAD: DXF nel browser, DWG convertito dal motore locale.
 *   1. Il file si legge nel browser, in un Web Worker: la pagina non si
 *      blocca anche con disegni da centinaia di MB. Tra i documenti della
 *      commessa si salva solo se l'utente lo chiede (con un avviso per i file
 *      grandi): i conteggi salvati dopo riferiscono quel documento.
 *   2. Ogni blocco (PRESA_10A, LUCE_LED…) è contato esattamente, per locale.
 *      Il simbolo di ogni blocco si sceglie una volta per l'azienda
 *      (dwg_mappa_blocchi): la volta dopo è già pronto.
 *   3. Le lunghezze: la somma delle linee dei layer scelti, in metri.
 * I conteggi entrano come bozza (metodo «dwg»): diventano materiali solo
 * quando qualcuno li conferma, come gli altri.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DisegnoCad } from "@/lib/distinta/cad/leggiDxf";
import { nomeVersione, riconosciFormato } from "@/lib/distinta/cad/leggiDxf";
import { AVVISO_MB_DOCUMENTO, caricaDocumentoCommessa } from "@/lib/commesse/caricaDocumentoCommessa";
import { MAX_BYTES_PER_FILE, MAX_MB_PER_FILE } from "@/lib/commesse/documentiCommessa";
import { attachmentStorage } from "@/components/orders/filePreviewUtils";
import { ISTRUZIONI_DWG, leggiDisegnoCad } from "@/lib/distinta/cad/leggiDisegnoCad";
import { conversioneDwgLocaleDisponibile, convertiDwgLocale } from "@/lib/distinta/cad/convertiDwg";
import type { ProvenienzaConversioneDwg } from "@/lib/distinta/cad/protocolloDwg";
import { affidabilitaDisegno, fattoreScalaCad, misureCadPronte } from '@/lib/distinta/cad/affidabilitaDisegno';
import {
  SENZA_LOCALE, UNITA_DISEGNO, contaSimboli, lunghezzePerLayer, metriPerUnita, misuraLunghezze, nomeUnita, trovaLocali,
} from "@/lib/distinta/cad/contaDisegno";
import {
  type SceltaSimbolo, type VoceMappa, righeConteggio, scelteIniziali, vociDaSalvare,
} from "@/lib/distinta/cad/mappaBlocchi";

const NESSUNO = "_nessuno";
const SENZA_FASE = "_senza";
const fmt = (n: number, d = 2) => n.toLocaleString("it-IT", { maximumFractionDigits: d });

interface Props {
  orderId: string;
  companyId: string;
  fasi: { id: string; name: string }[];
  puoScrivere: boolean;
  /** Dopo il salvataggio, per ricaricare l'elenco dei conteggi. */
  onSalvati: () => void;
  documenti?: { id: string; file_name: string; file_url: string }[];
  puoArchiviare?: boolean;
  scopeDocumento?: "operativo" | "riservato";
}

export default function DisegnoCadPannello({ orderId, companyId, fasi, puoScrivere, onSalvati, documenti = [], puoArchiviare = puoScrivere, scopeDocumento }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const annulla = useRef<(() => void) | null>(null);
  const generazione = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [avanzamento, setAvanzamento] = useState<number | null>(null);
  const [stato, setStato] = useState<"conversione" | "lettura" | null>(null);
  const [conversione, setConversione] = useState<ProvenienzaConversioneDwg | null>(null);
  const [disegnoSalvatoId, setDisegnoSalvatoId] = useState("");
  const [scaricando, setScaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [disegno, setDisegno] = useState<DisegnoCad | null>(null);

  const [unita, setUnita] = useState<number>(4);
  const [scala, setScala] = useState("1");
  const [scalaConfermata, setScalaConfermata] = useState(false);
  const [layerLocali, setLayerLocali] = useState<string>(NESSUNO);
  const [cerchi, setCerchi] = useState(false);
  const [scelte, setScelte] = useState<Record<string, SceltaSimbolo>>({});
  const [layerLunghezze, setLayerLunghezze] = useState<Set<string>>(new Set());
  const [nomiLunghezze, setNomiLunghezze] = useState<Record<string, string>>({});
  const [maggiorazione, setMaggiorazione] = useState("10");
  const [fase, setFase] = useState(SENZA_FASE);
  const [salvo, setSalvo] = useState(false);
  const { user } = useAuth();
  // Il disegno salvato tra i documenti (solo se l'utente lo chiede).
  const [documento, setDocumento] = useState<{ id: string; nome: string } | null>(null);
  const [confermaGrande, setConfermaGrande] = useState(false);
  const [caricoDocumento, setCaricoDocumento] = useState(false);

  useEffect(() => () => { generazione.current++; annulla.current?.(); }, []);
  const interrompi = () => {
    generazione.current++; annulla.current?.(); annulla.current = null;
    setStato(null); setAvanzamento(null); setConversione(null);
    setErrore("Lettura annullata. Puoi aprire un altro disegno o riprovare.");
  };

  const mappa = useQuery({
    queryKey: ["dwg-mappa-blocchi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dwg_mappa_blocchi").select("nome_blocco, simbolo, descrizione, scomposizione_id, ignora").eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as VoceMappa[];
    },
  });

  const apri = async (f: File, salvato?: { id: string; nome: string }) => {
    const corrente = ++generazione.current;
    annulla.current?.();
    const ctrl = new AbortController();
    annulla.current = () => ctrl.abort();
    setFile(f); setDisegno(null); setErrore(null); setDocumento(salvato ?? null); setConfermaGrande(false);
    setConversione(null); setStato("lettura"); setAvanzamento(0);
    setScalaConfermata(false); setScelte({}); setCerchi(false); setLayerLunghezze(new Set()); setNomiLunghezze({});
    try {
      const testa = new Uint8Array(await f.slice(0, 64).arrayBuffer());
      if (corrente !== generazione.current) return;
      let daLeggere = f;
      if (riconosciFormato(testa) === "dwg") {
        if (!conversioneDwgLocaleDisponibile() && !orderId) throw new Error(ISTRUZIONI_DWG);
        setStato("conversione"); setAvanzamento(null);
        const risultato = await convertiDwgLocale(f, companyId, ctrl.signal, orderId);
        if (corrente !== generazione.current || ctrl.signal.aborted) return;
        daLeggere = risultato.file; setConversione(risultato.provenienza);
      }
      setStato("lettura"); setAvanzamento(0);
      const lettura = leggiDisegnoCad(daLeggere, x => { if (corrente === generazione.current) setAvanzamento(x); });
      annulla.current = () => { ctrl.abort(); lettura.annulla(); };
      const d = await lettura.promessa;
      if (corrente !== generazione.current || ctrl.signal.aborted) return;
      setDisegno(d);
      setUnita(metriPerUnita(d.insunits) ? d.insunits : 4);
      setScala("1");
      // Layer dei locali: quello con più contorni chiusi e un nome che lo dice.
      const conContorni = new Map<string, number>();
      for (const c of d.contorni) conContorni.set(c.layer, (conContorni.get(c.layer) ?? 0) + 1);
      const probabile = [...conContorni.keys()].find((l) => /LOCAL|ROOM|STANZ|AMBIENT|VANI|SPAZ/i.test(l));
      setLayerLocali(probabile ?? NESSUNO);
      // A circle may be a marker, hatch, furnishing or light symbol: opt-in only.
      setCerchi(false);
      setLayerLunghezze(new Set(lunghezzePerLayer(d).map((l) => l.layer).filter((l) => /CORRUG|CAVI|CAVO|TUBO|TUBAZ|CANAL|PASSER|LINEA|DORSAL/i.test(l))));
    } catch (e) {
      if (corrente === generazione.current) { setConversione(null); setErrore(e instanceof Error ? e.message : String(e)); }
    } finally {
      if (corrente === generazione.current) { setStato(null); setAvanzamento(null); annulla.current = null; }
    }
  };

  const qualita = useMemo(() => disegno ? affidabilitaDisegno(disegno) : null, [disegno]);
  const scalaValida = fattoreScalaCad(scala);
  const misurePronte = !!disegno && (!conversione || scalaConfermata) && misureCadPronte(disegno, scala, scalaConfermata);
  const metri = (metriPerUnita(unita) ?? 0.001) * (scalaValida ?? 0);
  const locali = useMemo(() => disegno ? trovaLocali(disegno, { layerLocali: layerLocali === NESSUNO ? [] : [layerLocali] }) : null, [disegno, layerLocali]);
  const simboli = useMemo(() => disegno && locali ? contaSimboli(disegno, locali, { cerchi }) : [], [disegno, locali, cerchi]);
  // Le scelte nuove (o al cambio di file) partono dalla mappa salvata o dal suggerimento.
  const scelteEffettive = useMemo(() => {
    const iniziali = scelteIniziali(simboli, mappa.data ?? []);
    for (const k of Object.keys(iniziali)) if (scelte[k]) iniziali[k] = scelte[k];
    return iniziali;
  }, [simboli, mappa.data, scelte]);
  const layerConLunghezza = useMemo(() => disegno ? lunghezzePerLayer(disegno) : [], [disegno]);
  const lunghezze = useMemo(() => disegno && locali && misurePronte
    ? misuraLunghezze(disegno, [...layerLunghezze], locali, { metri, maggiorazionePct: Number(maggiorazione.replace(",", ".")) || 0 })
    : [], [disegno, locali, layerLunghezze, metri, maggiorazione, misurePronte]);
  const righe = useMemo(() => file && !qualita?.statiSovrapposti ? righeConteggio(simboli, scelteEffettive, lunghezze, nomiLunghezze, {
    file: file.name, unita_disegno: nomeUnita(unita), scala: scalaValida,
    maggiorazione_pct: Number(maggiorazione.replace(",", ".")) || 0, layer_locali: layerLocali === NESSUNO ? null : layerLocali,
    ...(conversione ? { conversione: { ...conversione, misure_calibrate: scalaConfermata } } : {}),
  }) : [], [file, simboli, scelteEffettive, lunghezze, nomiLunghezze, unita, scalaValida, maggiorazione, layerLocali, qualita, conversione, scalaConfermata]);

  const cambia = (chiave: string, patch: Partial<SceltaSimbolo>) =>
    setScelte((s) => ({ ...s, [chiave]: { ...scelteEffettive[chiave], ...patch } }));

  const salva = async () => {
    if (!file || !righe.length || qualita?.statiSovrapposti || !puoScrivere) return;
    setSalvo(true);
    try {
      const riferimento = documento ?? (puoArchiviare && file.size <= MAX_BYTES_PER_FILE ? await salvaDocumento() : null);
      if (!documento && puoArchiviare && file.size <= MAX_BYTES_PER_FILE && !riferimento) throw new Error("Salva il documento originale prima di registrare i conteggi.");
      const voci = vociDaSalvare(Object.values(scelteEffettive).filter((s) => s.origine !== "vuoto" || s.simbolo.trim()));
      if (voci.length) {
        const { error } = await supabase.from("dwg_mappa_blocchi").upsert(voci.map((v) => ({ ...v, company_id: companyId })), { onConflict: "company_id,nome_blocco" });
        if (error) throw error;
      }
      const sha = conversione?.sha256_originale ?? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())), b => b.toString(16).padStart(2,"0")).join("");
      const { error } = await supabase.rpc("planimetrie_salva_conteggi" as never, { p_order: orderId, p_documento: riferimento?.id ?? null, p_nome: file.name, p_sha256: sha, p_righe: righe.map((r) => ({
        company_id: companyId, order_id: orderId, phase_id: fase === SENZA_FASE ? null : fase,
        documento_id: riferimento?.id ?? null, documento_nome: file.name, simbolo: r.simbolo, descrizione_legenda: r.descrizione_legenda,
        locale: r.locale, quantita: r.quantita, unita: r.unita, metodo: "dwg", confidenza: 1,
        scomposizione_id: r.scomposizione_id, dettaglio: r.dettaglio as Json,
      })) } as never);
      if (error) throw error;
      toast.success(`${righe.length} conteggi salvati come bozza`, { description: "Controllali e confermali qui sotto: solo i confermati diventano materiali." });
      mappa.refetch();
      onSalvati();
    } catch (e) {
      toast.error("Conteggi non salvati", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvo(false);
    }
  };

  const salvaDocumento = async () => {
    if (!file || !user) return;
    setCaricoDocumento(true);
    try {
      const d = await caricaDocumentoCommessa({ orderId, companyId, userId: user.id, file, tipo: conversione ? "application/octet-stream" : "application/dxf", accessScope: scopeDocumento });
      setDocumento({ id: d.id, nome: file.name });
      setConfermaGrande(false);
      toast.success("Disegno salvato tra i documenti della commessa");
      onSalvati();
      return { id: d.id, nome: file.name };
    } catch (e) {
      toast.error("Disegno non salvato tra i documenti", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCaricoDocumento(false);
    }
  };
  const apriSalvato = async () => {
    const d = documenti.find(d => d.id === disegnoSalvatoId); if (!d || scaricando) return;
    const token = ++generazione.current; annulla.current?.(); setScaricando(true); setErrore(null);
    try {
      const { bucket, path } = attachmentStorage(d.file_url);
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (token !== generazione.current) return;
      if (error || !data) throw error ?? new Error("Documento non disponibile.");
      await apri(new File([data], d.file_name, { type: d.file_name.toLowerCase().endsWith(".dwg") ? "application/octet-stream" : "application/dxf" }), { id: d.id, nome: d.file_name });
    } catch (e) { if (token === generazione.current) setErrore(e instanceof Error ? e.message : "Non riesco a scaricare il disegno della commessa."); }
    finally { setScaricando(false); }
  };
  const mbFile = file ? file.size / 1_048_576 : 0;
  const troppoGrande = !!file && file.size > MAX_BYTES_PER_FILE;
  const grande = mbFile > AVVISO_MB_DOCUMENTO;

  const layerContorni = useMemo(() => disegno ? [...new Set(disegno.contorni.map((c) => c.layer))].sort() : [], [disegno]);
  const daContare = simboli.filter((s) => { const c = scelteEffettive[s.chiave]; return c && !c.ignora && c.simbolo.trim(); });

  return (
    <section aria-label="Disegno CAD" className="space-y-3 rounded border p-2 text-sm">
      {documenti.length > 0 && <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-xs">Disegno tra i documenti della commessa<select aria-label="Disegno salvato" className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={disegnoSalvatoId} disabled={stato !== null || scaricando || salvo} onChange={e => setDisegnoSalvatoId(e.target.value)}><option value="">Scegli un DWG o DXF già caricato</option>{documenti.map(d => <option key={d.id} value={d.id}>{d.file_name}</option>)}</select></label><Button size="sm" variant="outline" disabled={!disegnoSalvatoId || stato !== null || scaricando || salvo} onClick={() => void apriSalvato()}>{scaricando ? "Scarico…" : "Leggi disegno salvato"}</Button></div>}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept=".dxf,.dwg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) apri(f); e.target.value = ""; }} />
        <Button size="sm" className="h-8" disabled={stato !== null || scaricando || salvo || caricoDocumento} onClick={() => input.current?.click()}>
          <FileUp className="mr-1.5 h-3.5 w-3.5" /> Apri un disegno DXF / DWG
        </Button>
        {file && <span className="text-xs text-slate-600">{file.name} · {fmt(file.size / 1_048_576, 1)} MB</span>}
      </div>
      <p className="text-xs text-slate-500">
        {conversioneDwgLocaleDisponibile() ? "Il DWG viene convertito sul tuo computer, poi letto nel browser. Puoi caricare anche un DXF." : "Il DWG viene inviato al servizio protetto del gestionale e convertito per questa commessa (massimo 4 MB). Il DXF si legge nel browser."}
        {" "}Classifica i blocchi e verifica le misure. Salvando i conteggi, conservi anche l’originale nella commessa entro il limite dei documenti.
      </p>

      {stato !== null && (
        <div className="flex items-center gap-2" role="status">
          {stato === "lettura" && <Progress value={Math.round((avanzamento ?? 0) * 100)} className="h-2 w-64" />}
          <span className="text-xs text-slate-600">{stato === "conversione" ? (conversioneDwgLocaleDisponibile() ? "Converto il DWG sul tuo computer…" : "Converto il DWG per questa commessa…") : `Leggo il disegno… ${Math.round((avanzamento ?? 0) * 100)}%`}</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={interrompi}><X className="mr-1 h-3.5 w-3.5" /> Annulla</Button>
        </div>
      )}
      {errore && <p role="alert" className="rounded bg-amber-50 p-2 text-xs text-amber-900">{errore}</p>}

      {disegno && locali && (
        <>
          {conversione && <div aria-label="Conversione DWG" className="space-y-1 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <p><strong>DWG convertito e letto.</strong> L’originale resta il tuo file DWG. La conversione non consuma crediti AI.</p>
            {conversione.segnalazioni && <p className="text-amber-900">Il convertitore ha segnalato oggetti CAD non completamente supportati. Confronta il risultato con la tavola originale prima di usare i conteggi.</p>}
            <p>Gli elementi grafici non sono ancora articoli da comprare. Per le lunghezze, conferma unità e scala su una quota nota.</p>
          </div>}
          {qualita?.statiSovrapposti && <p role="alert" className="rounded border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">Il file contiene sia «Stato di fatto» sia «Stato di progetto»: non sommo tavole, piani o alternative. Per salvare conteggi carica un DXF separato con il solo stato e intervento da computare. Puoi comunque ispezionare questo disegno.</p>}
          {qualita?.pdfImportato && <p className="rounded bg-blue-50 p-2 text-xs text-blue-900">Layer riconducibili a PDF importati: curve e cerchi non sono automaticamente serramenti, luci o materiali. L’unità dichiarata dal file può non coincidere con la scala delle tavole.</p>}
          {puoArchiviare && (
            <div aria-label="Disegno tra i documenti" className="flex flex-wrap items-center gap-2 rounded bg-slate-50 p-2 text-xs">
              {documento ? (
                <span className="text-emerald-700">Salvato tra i documenti della commessa: i conteggi che salvi lo riferiscono.</span>
              ) : troppoGrande ? (
                <span className="text-amber-800">Il file supera {MAX_MB_PER_FILE} MB e non si può salvare tra i documenti: i conteggi restano senza documento.</span>
              ) : confermaGrande ? (
                <>
                  <span className="text-amber-800">Il file è grande ({fmt(mbFile, 1)} MB): il caricamento può richiedere qualche minuto e occupa spazio dell'azienda. Lo salvo?</span>
                  <Button size="sm" className="h-7" disabled={caricoDocumento} onClick={salvaDocumento}>{caricoDocumento ? "Salvo…" : "Sì, salvalo"}</Button>
                  <Button size="sm" variant="ghost" className="h-7" disabled={caricoDocumento} onClick={() => setConfermaGrande(false)}>No</Button>
                </>
              ) : (
                <>
                  <span className="text-slate-600">Vuoi tenere il disegno tra i documenti della commessa (cartella del progetto)?</span>
                  <Button size="sm" variant="outline" className="h-7" disabled={caricoDocumento}
                    onClick={() => (grande ? setConfermaGrande(true) : salvaDocumento())}>
                    {caricoDocumento ? "Salvo…" : `Salva tra i documenti (${fmt(mbFile, 1)} MB)`}
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-3">
            <div className="text-xs text-slate-600">
              <p><strong>{nomeVersione(disegno.versione) ?? "DXF"}</strong> · {fmt(disegno.blocchi.length, 0)} blocchi · {fmt(disegno.testi.length, 0)} scritte · {disegno.layer.length} layer</p>
              {disegno.blocchi.length === 0 && (
                <p className="mt-1 text-amber-800">Nessun blocco nel disegno: è probabilmente un PDF importato nel CAD, con i simboli fatti di linee e cerchi.
                  Si possono contare i cerchi (per layer e diametro); per il resto serve il disegno originale con i blocchi.</p>
              )}
            </div>
            <label className="space-y-1 text-xs">
              <span>Unità del disegno {disegno.insunits ? `(il file dice: ${nomeUnita(disegno.insunits)})` : "(il file non la dice)"}</span>
              <div className="flex gap-1">
                <Select value={String(unita)} onValueChange={(v) => { setUnita(Number(v)); setScalaConfermata(false); }}>
                  <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITA_DISEGNO.map((u) => <SelectItem key={u.valore} value={String(u.valore)}>{u.etichetta}</SelectItem>)}</SelectContent>
                </Select>
                <span className="self-center">× scala</span>
                <Input className="h-8 w-20" value={scala} onChange={(e) => { setScala(e.target.value); setScalaConfermata(false); }} aria-label="Scala del disegno" />
              </div>
              <span className="text-slate-500">Disegno nativo in scala reale: 1. Per tavole reimportate verifica unità e fattore su una quota nota: «1:200» da solo non basta.</span>
              {scalaValida === null && <span role="alert" className="block text-orange-800">Indica un fattore di scala positivo e finito.</span>}
              {(conversione || qualita?.richiedeCalibrazione) && <span className="flex items-start gap-1"><Checkbox aria-label="Conferma calibrazione CAD" checked={scalaConfermata} disabled={scalaValida === null || qualita?.statiSovrapposti} onCheckedChange={v => setScalaConfermata(v === true)} />Ho verificato unità e scala su una quota nota dello stato da computare.</span>}
            </label>
            <label className="space-y-1 text-xs">
              <span>Stanze</span>
              <Select value={layerLocali} onValueChange={setLayerLocali}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNO}>Nessun layer: nome del locale scritto più vicino</SelectItem>
                  {layerContorni.map((l) => <SelectItem key={l} value={l}>Contorni del layer {l}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-slate-500">
                {locali.modo === "contorni" ? `${locali.stanze.length} stanze disegnate` : locali.modo === "testo_vicino" ? `${new Set(locali.nomi.map((n) => n.s)).size} nomi di locali scritti: è una stima, controllala` : "Nessun nome di locale trovato"}
              </span>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <section aria-label="Blocchi trovati" className="rounded border p-2">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="font-semibold">Elementi grafici da classificare</h4>
                <label className="flex items-center gap-1 text-xs"><Checkbox checked={cerchi} onCheckedChange={(v) => setCerchi(!!v)} /> conta anche i cerchi</label>
              </div>
              <p className="mb-1 text-xs text-slate-500">Scrivi una volta il simbolo di ogni blocco: l'azienda lo ricorda per i prossimi disegni.</p>
              {simboli.length ? (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-slate-600"><tr><th className="py-1">Conta</th><th>Blocco</th><th className="text-right">N.</th><th className="pl-2">Simbolo / materiale</th></tr></thead>
                    <tbody className="divide-y">
                      {simboli.map((s) => {
                        const c = scelteEffettive[s.chiave];
                        return (
                          <tr key={s.chiave} className={c?.ignora ? "text-slate-400" : ""}>
                            <td className="py-1"><Checkbox checked={!c?.ignora} aria-label={`Conta ${s.nome}`} onCheckedChange={(v) => cambia(s.chiave, { ignora: !v })} /></td>
                            <td className="max-w-[12rem] truncate" title={`${s.nome} — layer: ${Object.keys(s.perLayer).join(", ")}`}>{s.nome}</td>
                            <td className="text-right tabular-nums">{fmt(s.quantita, 0)}</td>
                            <td className="pl-2">
                              <Input className="h-7" value={c?.simbolo ?? ""} placeholder="es. Punto presa 10/16A" disabled={c?.ignora}
                                aria-label={`Simbolo di ${s.nome}`} onChange={(e) => cambia(s.chiave, { simbolo: e.target.value })} />
                              {c?.origine === "mappa" && <span className="text-[10px] text-emerald-700">salvato per l'azienda</span>}
                              {c?.origine === "suggerito" && <span className="text-[10px] text-slate-500">{c.ignora ? "escluso dal conteggio: puoi classificarlo" : "suggerito dal nome"}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-xs text-slate-500">Nessun simbolo da contare.</p>}
            </section>

            <section aria-label="Lunghezze" className="rounded border p-2">
              <h4 className="mb-1 font-semibold">Lunghezze (metri)</h4>
              <p className="mb-1 text-xs text-slate-500">
                È la lunghezza del percorso disegnato sul layer, convertita in metri. Non conta le risalite alle scatole né gli sfridi:
                aggiungili con la maggiorazione.
              </p>
              <label className="mb-1 flex items-center gap-2 text-xs">
                Maggiorazione per risalite e sfridi
                <Input className="h-7 w-16" value={maggiorazione} onChange={(e) => setMaggiorazione(e.target.value)} aria-label="Maggiorazione percentuale" /> %
              </label>
              <ul className="max-h-64 space-y-1 overflow-auto text-xs">
                {layerConLunghezza.slice(0, 200).map((l) => (
                  <li key={l.layer} className="flex items-center gap-2">
                    <Checkbox checked={layerLunghezze.has(l.layer)} aria-label={`Misura ${l.layer}`} onCheckedChange={(v) => {
                      const n = new Set(layerLunghezze); if (v) n.add(l.layer); else n.delete(l.layer); setLayerLunghezze(n);
                    }} />
                    <span className="min-w-0 flex-1 truncate" title={l.layer}>{l.layer}</span>
                    <span className="tabular-nums text-slate-600">{misurePronte ? `${fmt(l.lunghezza * metri)} m` : 'Da verificare'}</span>
                    {layerLunghezze.has(l.layer) && (
                      <Input className="h-7 w-40" placeholder="es. Corrugato Ø20" value={nomiLunghezze[l.layer] ?? ""} aria-label={`Materiale del layer ${l.layer}`}
                        onChange={(e) => setNomiLunghezze({ ...nomiLunghezze, [l.layer]: e.target.value })} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section aria-label="Anteprima per locale" className="rounded border p-2">
            <h4 className="mb-1 font-semibold">Anteprima: {righe.length} conteggi da {daContare.length} simboli e {lunghezze.length} layer</h4>
            {righe.length ? (
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-600"><tr><th className="py-1">Simbolo</th><th>Locale</th><th className="text-right">Quantità</th></tr></thead>
                  <tbody className="divide-y">
                    {righe.map((r, i) => (
                      <tr key={i}><td className="py-1">{r.simbolo}</td><td>{r.locale ?? SENZA_LOCALE}</td><td className="text-right tabular-nums">{fmt(r.quantita)} {r.unita}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-slate-500">Scrivi il simbolo dei blocchi da contare o scegli un layer da misurare.</p>}
            {puoScrivere && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span>Fase dei conteggi</span>
                <Select value={fase} onValueChange={setFase}>
                  <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SENZA_FASE}>Senza fase</SelectItem>
                    {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" disabled={!righe.length || salvo} onClick={salva}>{salvo ? "Salvo…" : "Salva i conteggi come bozza"}</Button>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
