import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Calculator, Copy, Download, History, Eye, FileDown, FileSpreadsheet, FileUp, LayoutPanelTop, Loader2, Map as MapIcon, Maximize2, MoreHorizontal, Sparkles, Table2, Trash2, Undo2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TestoCheCresce } from "@/components/ui/testo-che-cresce";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuotePageHeader, QuotePrimaryButton } from "@/components/marketing/preventivi/ui/builderUI";
import { CorpoPreventivatore } from "@/components/preventivatore/CorpoPreventivatore";
import { BarraFasi } from "@/components/preventivatore/BarraFasi";
import { STICKY_ALTO, STICKY_BASSO } from "@/components/preventivatore/posizione";
import ComputoProgetto from "./ComputoProgetto";
import type { RipristinoProgettoComputo } from "./ComputoDallaPianta";
import type { PropostaPdfComputo } from "./AnteprimaComputoSilvio";
import ComputoDati, { indirizzoDaCantiere } from "./ComputoDati";
import ComputoEconomia from "./ComputoEconomia";
import ComputoDocumento from "./ComputoDocumento";
import ComputoRevisioni from "./ComputoRevisioni";
import { InviaFirmaCard } from "@/components/moduli/InviaFirmaCard";
import type { ModuleQuoteInput } from "@/lib/moduli/quoteBridge";
const FirmatoSuCartaDialog = lazy(() => import("@/components/marketing/preventivi/FirmatoSuCarta").then(m => ({ default: m.FirmatoSuCartaDialog })));
import { calcolaDetrazione } from "@/lib/computo/detrazioneComputo";
import { calcolaSconto } from "@/lib/computo/scontoComputo";
import { analizzaEconomia, eventoPerCommessa, testoQuando, testoTermine } from "@/lib/computo/economiaComputo";
import ComputoCapitoli from "./ComputoCapitoli";
import { destinazioneVoceComputo } from "@/lib/computo/destinazioniPdf";
import ComputoMisure from "./ComputoMisure";
import ComputoUnitaSelect from "./ComputoUnitaSelect";
import { nomeCointestatario } from "@/lib/preventivatore/cointestatario";
import { bozzaDalModello, fotoPerCopertina, leggiLogoPerPdf, vesteDalModello, type ModelloComputo, type VesteComputo } from "@/lib/computo/modelloComputo";
import { applicaImportComputo, type EsitoImportComputo } from "@/lib/computo/importaComputo";
import type { VoceImportata } from "@/lib/computo/importaVoci";
import { calcolaIvaComputo } from "@/lib/computo/ivaComputo";
import { ComputoFormatoSelect, ComputoOpzione } from "./ComputoPdfControls";
import type { PickedVoce } from "@/components/ristrutturazione/ComputoEditor/types";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { allegatiDaIncludere, leggiAllegatoLocale, type AllegatoPdfComputo } from "@/lib/computo/allegatiLocali";
import { creaBackupComputo, MAX_BACKUP_COMPUTO, ripristinaBackupComputo } from "@/lib/computo/backupComputo";
import { applicaVarianteComputo } from "@/lib/computo/variantiPdf";
import { formatEuro } from "@/lib/computo/computoStrutturato";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { personalizzazioneDocumento } from "../../../supabase/functions/_shared/personalizzazioneDocumenti";
import {
  bozzaVuota, calcolaVoce, datiFiscaliBozza, misuraSenzaCollegamento, numeroEditor, leggiBozzaComputo, salvaBozzaComputo, voceVuota, vociDaBozza, vociPerAnteprima, ConflittoBozzaComputo,
  type BozzaComputo, type VoceEditor,
} from "@/lib/computo/editorNativo";
import { rigaDatiFiscali } from "@/lib/preventivatore/datiFiscaliCliente";
import { economiaAnalisiComputo } from "@/lib/preventivi/analisiCostiEditor";
import { downloadQuotePdf } from "@/lib/preventivi/quotePdfDownload";
import { controlliPreventivo } from "@/lib/computo/controlliPreventivo";
import type { AggiornamentoProgettoComputo } from "@/lib/computo/cloudComputo";
import type { OrigineComputoPianta } from "@/lib/computo/computoDallaPianta";
import type { WizardAiSnapshot } from "@/lib/preventivi/wizardAiMemory";
import { preparaComputoConPlanimetria, verificaComputoConPlanimetria } from "@/lib/planimetrie/computoConPlanimetria";
import { percorsoMisuraSullaPianta } from "@/lib/planimetrie/studioImmobiliare";
import { percorsoVariantePlanimetria } from "@/lib/planimetrie/render/percorsi";
import { ComputoVerificaPlanimetria } from "./ComputoVerificaPlanimetria";
import { misuraRigaStudio, NOTA_QUANTITA_RIPRESA, type RigaStudio } from "@/lib/planimetrie/studioImmobiliare";

const desktopSnapshot = () => window.matchMedia("(min-width: 1024px)").matches;
const AddVocePicker = lazy(() => import("@/components/ristrutturazione/ComputoEditor/AddVocePicker"));
// Gli stessi strumenti AI di Ristrutturazione e degli altri moduli; si caricano solo quando si aprono.
const ImportaVociDialog = lazy(() => import("./ImportaVociDialog"));
const ComputoSilvioAi = lazy(() => import("./ComputoSilvioAi"));
const AnalisiCostiComputoDialog = lazy(() => import("./AnalisiCostiComputoDialog"));
const ComputoDallaPianta = lazy(() => import("./ComputoDallaPianta"));
const ProgettoPlanimetria = lazy(() => import("./ProgettoPlanimetria"));
const MAX_VOCI_SILVIO = 100;
const subscribeDesktop = (notify: () => void) => {
  const m = window.matchMedia("(min-width: 1024px)"); m.addEventListener("change", notify);
  return () => m.removeEventListener("change", notify);
};

function vociDelDocumento(bozza: BozzaComputo) {
  return bozza.voci.filter(v => !bozza.capitoliEsclusiPdf.includes(v.capitolo.trim() || "Opere edili"));
}

function opzionaliDelDocumento(bozza: BozzaComputo, senzaPrezzi: boolean) {
  return vociDelDocumento(bozza).filter(v => v.opzionale).map(v => {
    const c = calcolaVoce(v, senzaPrezzi);
    return { descrizione: v.descrizione.trim() || "Voce opzionale", unita: v.unita, quantita: c.quantita, prezzo: c.prezzo, importo: c.importo };
  });
}

function pianoDelDocumento(bozza: BozzaComputo) {
  const a = analizzaEconomia(bozza);
  const rate = a.rate.map(r => r.rata);
  const quanteAMisura = a.rate.filter(r => r.rata.base === "avanzamento").length;
  const r0 = bozza.pianoPagamenti.ritenuta;
  return {
    pianoErrore: a.errorePiano,
    ritenutaPdf: a.ritenuta ? { percentuale: a.ritenuta.percentuale, totale: a.ritenuta.totale,
      svincolo: r0.svincolo === "collaudo" ? "al collaudo" : `${r0.mesi} mesi dopo la fine dei lavori` } : null,
    pianoPdf: a.rate.map(r => ({
      descrizione: r.rata.descrizione.trim() || "Rata",
      quando: testoQuando(r.rata, rate),
      percentuale: r.percentuale, importo: r.importo,
      imponibile: r.rata.base === "avanzamento" ? null : r.importoNetto,
      termine: r.rata.termineGiorni || r.rata.termineFineMese ? testoTermine(r.rata.termineGiorni, r.rata.termineFineMese) : "",
      aMisura: r.rata.base === "avanzamento",
      quotaIndicativa: r.rata.base === "avanzamento" && quanteAMisura ? Math.round(a.quotaAMisura / quanteAMisura * 100) / 100 : null,
    })),
    // Una rata a misura arriva nella commessa con il suo evento e con la previsione di cassa.
    rateCommessa: a.rate.map(r => ({
      descrizione: r.rata.descrizione.trim() || "Rata",
      percentuale: r.percentuale, importo: r.importo ?? r.stima, aMisura: r.rata.base === "avanzamento",
      termineGiorni: r.rata.termineGiorni, termineFineMese: r.rata.termineFineMese,
      ...eventoPerCommessa(r.rata, rate),
    })),
    netto: a.netto, totaleCliente: a.totaleCliente,
  };
}

function aggiornaVoceManuale(voce: VoceEditor, patch: Partial<VoceEditor>): VoceEditor {
  const prezzoModificato = patch.prezzo !== undefined && numeroEditor(patch.prezzo) !== numeroEditor(voce.prezzo);
  return {
    ...voce,
    ...(prezzoModificato ? { fonte: numeroEditor(patch.prezzo!) === null ? "" : "Prezzo inserito manualmente" } : {}),
    ...patch,
  };
}

function scaricaBozza(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "computo-metrico.bozza.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Il costo unitario stimato di una voce presa dal listino AZIENDALE: materiali + manodopera, i costi che
 * l'azienda ha scritto nel listino. Dal prezzario regionale (ha una `fonte`) no: lì materiali e manodopera
 * sono il prezzo scomposto con l'incidenza della manodopera, non un costo dell'impresa.
 */
function costoDaListino(p: PickedVoce): string {
  if (p.fonte) return "";
  const costo = (p.costo_materiali || 0) + (p.costo_manodopera || 0);
  return costo > 0 ? String(Math.round(costo * 100) / 100).replace(".", ",") : "";
}

export default function ComputoNativoEditor({ storageKey, companyId, azienda, dettagliAzienda, datiAzienda, datiIniziali, colore: coloreMarchio, onBack, onComputoDaPlanimetria, fase, initialFase = 0, onFaseChange, consentiListini = false, consentiRiuso = false, ai, cloud, modello, logoUrl, vediMargini = false, firmaOnline, puoRiscrivereCondizioni = true, analisiCosti, puoAggiornarePianta = false }: {
  storageKey: string; companyId?: string; azienda?: string; dettagliAzienda?: string; colore?: string; onBack?: () => void;
  datiAzienda?: import("@/lib/computo/esportaComputo").IntestazioneComputo["datiAzienda"];
  /** Il modello del computo dell'azienda: veste del PDF e condizioni con cui parte un computo nuovo. */
  modello?: ModelloComputo; logoUrl?: string | null;
  datiIniziali?: Partial<BozzaComputo>;
  onComputoDaPlanimetria?: () => void;
  /** Permessi «costi» e «margini»: costo stimato delle voci, margini e cassa nel passo Economia. */
  vediMargini?: boolean;
  analisiCosti?: { draftId: string; modifica: boolean };
  /** Permesso «Riscrivere le condizioni su un documento»: senza, le condizioni contrattuali si leggono e basta. */
  puoRiscrivereCondizioni?: boolean;
  /** Firma elettronica: il preventivo si salva nel gestionale e si manda in firma come gli altri. */
  firmaOnline?: { companyId: string; draftId: string; userId?: string; onApriCommessa?: (quoteId: string) => void };
  fase?: number; initialFase?: number; onFaseChange?: (fase: number) => void;
  consentiListini?: boolean;
  consentiRiuso?: boolean;
  puoAggiornarePianta?: boolean;
  /** Silvio AI e «Importa con l'AI» (consumano crediti AI dell'azienda): l'azienda e la bozza su cui lavorano. */
  ai?: { companyId: string; draftId: string };
  /** Salvataggio nel gestionale (Demo 2): avviene da solo, qui arrivano solo lo stato da mostrare e le modifiche. */
  cloud?: {
    status: string; onChange: (bozza: BozzaComputo) => void;
    salvaProgetto?: (aggiornamento: AggiornamentoProgettoComputo) => Promise<BozzaComputo>;
    progettoPronto?: boolean;
  };
}) {
  const [dettagliEconomici, setDettagliEconomici] = useState(false);
  const mostraDatiInterni = vediMargini && dettagliEconomici;
  const puoUsareAnalisi = vediMargini && !!companyId && !!analisiCosti;
  const [analisiAperta, apriAnalisi] = useState<{ voce?: string; stima?: boolean } | null>(null);
  const [faseLocale, setFaseLocale] = useState(initialFase);
  const [vistaPianta, setVistaPianta] = useState(false);
  const [piantaInModifica, setPiantaInModifica] = useState(false);
  const [ripristinoProgetto, setRipristinoProgetto] = useState<RipristinoProgettoComputo | null>(null);
  const [anteprimePassi, setAnteprimePassi] = useState<Record<number, boolean>>({ 4: true });
  const step = fase ?? faseLocale;
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, () => false);
  const [caricando, setCaricando] = useState(false);
  // Il passo nuovo si apre in cima (11/11/2026): su un computo di 164 lavorazioni «Avanti» sta in fondo
  // alla pagina, e prima il passo cambiava lasciando l'utente davanti al fondo di una pagina che non c'era più.
  const testaFasi = useRef<HTMLDivElement | null>(null);
  const cambiaFase = (n: number, scorriInizio = true) => {
    if (caricando || esportando) return;
    if (piantaInModifica && n !== step) {
      toast.info("Salva la pianta o annulla le modifiche per cambiare passo.");
      return;
    }
    setFaseLocale(n); onFaseChange?.(n);
    if (scorriInizio) requestAnimationFrame(() => {
      const dolce = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      testaFasi.current?.scrollIntoView({ behavior: dolce ? "smooth" : "auto", block: "start" });
    });
  };
  const [iniziale] = useState(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
      const nuova = modello ? bozzaDalModello(bozzaVuota(), modello) : bozzaVuota();
      return { raw, bozza: raw ? leggiBozzaComputo(raw) : { ...nuova, ...datiIniziali }, errore: "" };
    } catch { return { raw, bozza: bozzaVuota(), errore: "La bozza locale non è leggibile. Conserva l'originale o apri una copia valida." }; }
  });
  const [bozza, setBozza] = useState(iniziale.bozza);
  const affiancata = step === 2 && vistaPianta && !!bozza.piantaOrigine;
  const anteprimaVisibile = !affiancata && (anteprimePassi[step] ?? false);
  const affidabilita = useMemo(() => step === 4 ? controlliPreventivo(bozza.voci.filter(v => !bozza.capitoliEsclusiPdf.includes(v.capitolo.trim() || "Opere edili"))) : null,
    [bozza.voci, bozza.capitoliEsclusiPdf, step]);
  const colore = modello?.colorePrimario || coloreMarchio;
  const [logo, setLogo] = useState<VesteComputo["logo"]>(null);
  useEffect(() => {
    let attivo = true;
    if (modello?.mostraLogo === false || !logoUrl) return;
    void leggiLogoPerPdf(logoUrl).then(l => { if (attivo) setLogo(l); });
    return () => { attivo = false; };
  }, [logoUrl, modello?.mostraLogo]);
  // La foto di copertina scelta nel passo Progetto, ritagliata alle proporzioni della copertina.
  const [fotoCopertina, setFotoCopertina] = useState<Awaited<ReturnType<typeof fotoPerCopertina>>>(null);
  const idFoto = bozza.fotoCopertina && (bozza.allegati ?? []).some(a => a.id === bozza.fotoCopertina) ? bozza.fotoCopertina : "";
  useEffect(() => {
    let attivo = true;
    if (!idFoto) return;
    void leggiAllegatoLocale(storageKey, idFoto).catch((): null => null).then(b => fotoPerCopertina(b, 595.28 / (841.89 * 0.44))).then(f => { if (attivo) setFotoCopertina(f); });
    return () => { attivo = false; };
  }, [idFoto, storageKey]);
  const veste = useMemo(() => modello ? { ...vesteDalModello(modello), logo: modello.mostraLogo === false || !logoUrl ? null : logo } : undefined, [modello, logo, logoUrl]);
  const cloudChange = cloud?.onChange;
  useEffect(() => { cloudChange?.(bozza); }, [bozza, cloudChange]);
  const [storico, setStorico] = useState<BozzaComputo[]>([]);
  const [scelta, setScelta] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ capitolo?: string } | null>(null);
  const [aiAperta, setAiAperta] = useState<{
    capitolo?: string; file?: File; progetto?: boolean; sessione?: number;
    bozzaDaProgetto?: BozzaComputo; continuazione?: WizardAiSnapshot; chiediChiusura?: boolean;
  } | null>(null);
  const [vociAggiornateDaSilvio, setVociAggiornateDaSilvio] = useState<ReadonlySet<string> | undefined>();
  useEffect(() => {
    if (!vociAggiornateDaSilvio?.size) return;
    const timer = window.setTimeout(() => setVociAggiornateDaSilvio(undefined), 2200);
    return () => window.clearTimeout(timer);
  }, [vociAggiornateDaSilvio]);
  const [importAperto, setImportAperto] = useState(false);
  const [revisioniAperte, setRevisioniAperte] = useState(false);
  const [errore, setErrore] = useState(iniziale.errore);
  const [avvisoXpwe, setAvvisoXpwe] = useState(false);
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
    return createPdfPreviewUrl(anteprima);
  }, [anteprima]);
  const precedente = useRef(iniziale.raw);
  const importInput = useRef<HTMLInputElement>(null);
  const [vocePdf, setVocePdf] = useState<{ id: string; richiesta: number } | null>(null);
  const puntaVocePdf = useCallback((id: string) => setVocePdf(prima => ({ id, richiesta: (prima?.richiesta ?? 0) + 1 })), []);
  const apriVoce = (id: string) => { setScelta(id); puntaVocePdf(id); };

  const modificato = useRef(false);
  const corrente = useRef(bozza);
  useEffect(() => { corrente.current = bozza; }, [bozza]);
  // Il numero del preventivo nuovo (solo per chi ha la numerazione automatica): alla prima modifica, così aprire e
  // chiudere non consuma un numero. Le bozze già esistenti (iniziale.raw) restano come sono.
  const numeroChiesto = useRef(false);
  const aziendaNumero = firmaOnline?.companyId;
  useEffect(() => {
    if (numeroChiesto.current || !aziendaNumero || iniziale.raw || !modificato.current || bozza.numero.trim()) return;
    if (!personalizzazioneDocumento(aziendaNumero).numeroAutomaticoComputo) return;
    numeroChiesto.current = true;
    void (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.rpc("generate_quote_number", { p_company_id: aziendaNumero } as never);
      if (typeof data === "string" && data.trim()) setBozza(b => (b.numero.trim() ? b : { ...b, numero: data }));
    })();
  }, [bozza, aziendaNumero, iniziale.raw]);
  // Nessuna voce aperta finché l'utente non ne sceglie una: i dettagli si aprono sotto la riga solo a richiesta.
  const v = scelta ? bozza.voci.find(r => r.id === scelta) : undefined;
  const risultati = useMemo(() => bozza.voci.map(r => calcolaVoce(r, senzaPrezzi)), [bozza.voci, senzaPrezzi]);
  const invalide = risultati.filter(r => r.errori.length).length;
  // Le voci opzionali si propongono ma non entrano nel totale.
  const totale = risultati.reduce((s, r, k) => s + (bozza.voci[k]?.opzionale ? 0 : r.importo ?? 0), 0);
  // Il piano dei pagamenti come va nel PDF: rata, momento, percentuale e importo sull'imponibile scontato.
  // Il documento: senza i capitoli spenti nel passo Documento. Totali, piano e detrazione del PDF stanno su questo.
  const bozzaPdf = useMemo(() => bozza.capitoliEsclusiPdf.length || bozza.voci.some(r => r.opzionale)
    ? { ...bozza, voci: vociDelDocumento(bozza).filter(v => !v.opzionale) } : bozza, [bozza]);
  const vociOpzionali = useMemo(() => opzionaliDelDocumento(bozza, senzaPrezzi), [bozza, senzaPrezzi]);
  const lordoDocumento = useMemo(() => bozzaPdf.voci.reduce((t, r) => t + (calcolaVoce(r, senzaPrezzi).importo ?? 0), 0), [bozzaPdf, senzaPrezzi]);
  const sicurezzaDocumento = useMemo(() => bozzaPdf.voci.reduce((s, r) => s + (r.sicurezza ? calcolaVoce(r, senzaPrezzi).importo ?? 0 : 0), 0), [bozzaPdf, senzaPrezzi]);
  const sconto = calcolaSconto(lordoDocumento, senzaPrezzi ? undefined : bozza.sconto, sicurezzaDocumento);
  const totaleDocumento = lordoDocumento - sconto.importo;
  const fiscaleDocumento = calcolaIvaComputo(totaleDocumento, bozza);
  const spesaCliente = fiscaleDocumento.totale ?? fiscaleDocumento.imponibile ?? 0;
  const { pianoPdf, pianoErrore, ritenutaPdf, rateCommessa } = useMemo(() => pianoDelDocumento(bozzaPdf), [bozzaPdf]);
  const erroreIva = bozza.formatoPdf !== "senza-prezzi" && bozza.mostraImportiPdf !== false ? fiscaleDocumento.errore : "";
  const daQuantificare = bozza.voci.filter(r => r.daQuantificare).length;
  /** Quello che ferma davvero il documento. Il piano dei pagamenti no: ferma la firma e la commessa. */
  const bloccaDocumento = !bozza.titolo.trim() || !bozza.voci.length || !!invalide || !!erroreIva || !!sconto.errore;
  const idAzienda = companyId ?? firmaOnline?.companyId ?? ai?.companyId;
  const fonte = bozza.fontePlanimetria;
  const opzioniPlanimetria = useMemo(() => queryOptions({
    queryKey: ["computo-variante-planimetria", idAzienda, fonte?.planimetriaId, fonte?.versione, fonte?.varianteId],
    queryFn: () => preparaComputoConPlanimetria(idAzienda!, fonte!),
    staleTime: Infinity,
    retry: false,
  }), [idAzienda, fonte]);
  const queryClient = useQueryClient();
  const collegamento = useQuery({ ...opzioniPlanimetria, enabled: !!fonte && !!idAzienda });
  const datiPianta = collegamento.data;
  const rigaDellaVoce = v && datiPianta?.righe.find(r => r.id === v.id);
  const percorsoMisura = fonte && rigaDellaVoce ? percorsoMisuraSullaPianta(fonte, rigaDellaVoce) : undefined;
  const percorsoPiano = fonte && rigaDellaVoce && !percorsoMisura
    ? percorsoVariantePlanimetria(fonte, {livello:rigaDellaVoce.livelloId}) : undefined;
  const righeVerificate = useMemo(() => datiPianta ? verificaComputoConPlanimetria(bozza.voci, datiPianta.righe) : undefined, [datiPianta, bozza.voci]);
  const intestazione = useMemo(() => ({ companyId: idAzienda, titolo: bozza.titolo, committente: bozza.mostraDatiCliente === false ? null : [bozza.committente.trim(), nomeCointestatario(bozza)].filter(Boolean).join(" e "), oggetto: bozza.oggetto,
    datiFiscaliCommittente: bozza.mostraDatiCliente === false ? null : rigaDatiFiscali(datiFiscaliBozza(bozza)),
    stato: "Bozza - non ancora inviata", senzaPrezzi, presentazione, azienda, dettagliAzienda, datiAzienda, colore,
    datiCliente: { codiceFiscale: bozza.clienteCodiceFiscale, partitaIva: bozza.clientePartitaIva, email: bozza.clienteEmail, telefono: bozza.clienteTelefono, indirizzo: bozza.indirizzo, sdi: bozza.clienteSdi },
    numero: bozza.numero, ivaModalita: bozza.ivaModalita, ivaAliquota: bozza.ivaAliquota, ivaNota: bozza.ivaNota,
    indirizzoIntervento: bozza.mostraDatiCliente === false ? "" : bozza.indirizzo,
    nascondiCliente: bozza.mostraDatiCliente === false, condizioni: bozza.mostraCondizioni === false ? "" : bozza.condizioni,
    // Fino al 29/10/2026 era sempre «editoriale»: scegliere «Computo dettagliato» dava lo stesso documento del preventivo cliente.
    impaginazione: bozza.formatoPdf === "elenco-prezzi" ? "elenco-prezzi" as const : bozza.formatoPdf === "tecnico" || bozza.formatoPdf === "senza-prezzi" ? "primus" as const : "editoriale" as const,
    dettaglioMisure: bozza.mostraMisurePdf, dataDocumento: bozza.dataDocumento, revisione: bozza.revisione,
    tecnico: bozza.tecnico, riferimentoPrezzi: bozza.riferimentoPrezzi,
    mostraPrezziUnitari: bozza.mostraPrezziUnitariPdf, mostraImporti: bozza.mostraImportiPdf,
    mostraCodici: bozza.mostraCodiciPdf, mostraFonti: bozza.mostraFontiPdf, soloRiepilogo: bozza.formatoPdf === "riepilogo" || bozza.sezioniPdf.lavorazioni === false,
    inclusioni: bozza.mostraCondizioni === false ? "" : bozza.inclusioni, esclusioni: bozza.mostraCondizioni === false ? "" : bozza.esclusioni,
    tempi: bozza.mostraCondizioni === false ? "" : bozza.tempi, pagamenti: bozza.mostraCondizioni === false ? "" : bozza.pagamenti,
    veste: veste && { ...veste, premessa: bozza.sezioniPdf.premessa === false ? "" : veste.premessa }, sezioni: bozza.sezioniPdf,
    contrattoOrigine: bozza.contrattoOrigine,
    cronoprogramma: bozza.mostraCronoprogrammaPdf === false || bozza.sezioniPdf.cronoprogramma === false ? null : bozza.cronoprogramma, sconto: bozza.sconto,
    ratePagamento: bozza.mostraCondizioni === false || bozza.sezioniPdf.pagamenti === false || pianoErrore ? [] : pianoPdf,
    ritenutaPagamenti: bozza.mostraCondizioni === false || bozza.sezioniPdf.pagamenti === false || pianoErrore ? null : ritenutaPdf,
    calcoloDetrazione: bozza.sezioniPdf.detrazione === false || senzaPrezzi ? null : calcolaDetrazione(bozza.detrazione, spesaCliente, fiscaleDocumento.totale != null),
    condizioniContrattuali: bozza.mostraCondizioni === false || bozza.sezioniPdf.contrattuali === false ? "" : bozza.condizioniContrattuali,
    firmaCommittente: bozza.committente.trim(), firmaCointestatario: nomeCointestatario(bozza) ?? "",
    immagineCopertina: idFoto ? fotoCopertina : null, vociOpzionali }),
  [bozza, senzaPrezzi, presentazione, idAzienda, azienda, dettagliAzienda, datiAzienda, colore, veste, pianoPdf, pianoErrore, ritenutaPdf, spesaCliente, fiscaleDocumento.totale, idFoto, fotoCopertina, vociOpzionali]);
  const intestazionePdf = useCallback(async () => {
    if (!fonte || bozza.piantaOrigine) return intestazione;
    const dati = idAzienda ? await queryClient.fetchQuery(opzioniPlanimetria).catch((): null => null) : null;
    return { ...intestazione, planimetria: dati?.pdf ?? { versione: fonte.versione, variante: `Variante ${fonte.varianteId}`, numeroPiani: 0, tavole: [] } };
  }, [fonte, bozza.piantaOrigine, idAzienda, intestazione, opzioniPlanimetria, queryClient]);
  const liveKey = useMemo(() => JSON.stringify([bozza, intestazione]), [bozza, intestazione]);
  const preparaProgettoPdf = useMemo(() => {
    const origine = bozza.piantaOrigine;
    const scelta = bozza.progettoNelPdf;
    if (!origine || scelta === "nessuno") return null;
    let inPreparazione: Promise<AllegatoPdfComputo> | undefined;
    return () => {
      if (!companyId) throw new Error("Seleziona l’azienda per allegare il progetto.");
      inPreparazione ??= Promise.all([
        import("@/lib/computo/progettoNelPdf"),
        import("@/lib/planimetrie/esporta/cartiglio"),
      ]).then(async ([{ allegatoProgettoComputo }, { caricaLogo }]) => allegatoProgettoComputo(companyId, origine, scelta, {
        azienda: { nome: azienda ?? "", ...datiAzienda, colore, logo: await caricaLogo(logoUrl) },
        cliente: bozza.mostraDatiCliente ? bozza.committente.trim() || undefined : undefined,
        indirizzoCantiere: bozza.mostraDatiCliente ? bozza.indirizzo || undefined : undefined,
        data: bozza.dataDocumento || undefined,
      })).catch(e => { inPreparazione = undefined; throw e; });
      return inPreparazione;
    };
  }, [azienda, bozza.committente, bozza.dataDocumento, bozza.indirizzo, bozza.mostraDatiCliente,
    bozza.piantaOrigine, bozza.progettoNelPdf, colore, companyId, datiAzienda, logoUrl]);
  const allegatiDocumento = useCallback(async () => {
    const allegati = await allegatiDaIncludere(storageKey, bozza.allegati);
    if (!preparaProgettoPdf) return allegati;
    if (bozza.voci.some(v => v.misure.some(m => m.dallaPianta && m.dallaPianta.versione !== bozza.piantaOrigine?.versione))) {
      throw new Error("Il computo usa più versioni della pianta. Rivedi le misure o scegli «Solo computo» prima di esportare.");
    }
    return [...allegati, await preparaProgettoPdf()];
  }, [bozza.allegati, bozza.piantaOrigine?.versione, bozza.voci, preparaProgettoPdf, storageKey]);
  const renderLive = useCallback(async (proposta?: PropostaPdfComputo) => {
    const { generaDocumentoComputo } = await import("@/lib/computo/esportaComputo");
    const bozzaLive = proposta ? { ...bozza, voci: proposta.voci } : bozza;
    const documento = proposta ? { ...bozzaLive, voci: vociDelDocumento(bozzaLive).filter(v => !v.opzionale) } : bozzaPdf;
    const anteprima = vociPerAnteprima(documento, senzaPrezzi);
    const allegati = proposta?.dallaPianta ? await allegatiDaIncludere(storageKey, bozza.allegati) : await allegatiDocumento();
    const parziale = anteprima.incomplete ? `Bozza parziale: ${anteprima.incomplete} lavorazioni da completare. Importi mancanti non inclusi nel parziale.` : !bozzaLive.voci.length ? "Bozza in compilazione - nessuna lavorazione inserita." : undefined;
    const datiPdf = { ...await intestazionePdf() };
    if (proposta) {
      const piano = pianoDelDocumento(documento);
      datiPdf.stato = "Anteprima modifiche · da confermare";
      datiPdf.vociOpzionali = opzionaliDelDocumento(bozzaLive, senzaPrezzi);
      const mostraRate = bozza.mostraCondizioni !== false && bozza.sezioniPdf.pagamenti !== false && !piano.pianoErrore;
      datiPdf.ratePagamento = mostraRate ? piano.pianoPdf : [];
      datiPdf.ritenutaPagamenti = mostraRate ? piano.ritenutaPdf : null;
      if (datiPdf.calcoloDetrazione) {
        datiPdf.calcoloDetrazione = calcolaDetrazione(bozza.detrazione, piano.totaleCliente ?? piano.netto, piano.totaleCliente != null);
      }
    }
    const blob = await generaDocumentoComputo(anteprima.voci, { ...datiPdf, titolo: bozza.titolo.trim() || "Preventivo in compilazione", parziale }, allegati);
    return createPdfPreviewUrl(blob);
  }, [bozza, bozzaPdf, senzaPrezzi, storageKey, allegatiDocumento, intestazionePdf]);
  /** Dal preventivo alla commessa: righe e rate sul preventivo, poi la commessa nuova precompilata (`commessaDaComputo`). */
  const [daFirmare, setDaFirmare] = useState<{ id: string; company_id: string; client_name: string | null; quote_number: string | null } | null>(null);
  const preparaPreventivoComputo = async (invio?: ModuleQuoteInput) => {
    const companyId = invio?.companyId ?? firmaOnline?.companyId;
    const userId = invio?.userId ?? firmaOnline?.userId;
    const draftId = invio?.progettoId ?? firmaOnline?.draftId;
    if (!companyId || !userId || !draftId) throw new Error("Dati del preventivo non disponibili.");
    if (pianoErrore) throw new Error(`Sistema il piano dei pagamenti nel passo Economia. ${pianoErrore}`);
    const { preparaCommessaDaComputo } = await import("@/lib/computo/commessaDaComputo");
    const aliquota = bozza.ivaModalita === "applicata" ? numeroEditor(bozza.ivaAliquota) : bozza.ivaModalita === "non-applicabile" ? 0 : null;
    let bozzaPerCommessa = bozzaPdf;
    if (puoUsareAnalisi) {
      const { leggiAnalisiCostiPreventivo } = await import("@/hooks/useAnalisiCostiPreventivo");
      const salvata = await leggiAnalisiCostiPreventivo({ companyId, tipo: "computo", id: draftId });
      if (salvata) {
        const { analizzaPreventivo, budgetAnalisi } = await import("@/lib/preventivi/analisiCosti");
        const { voci, imponibile } = economiaAnalisiComputo(bozza);
        const costi = budgetAnalisi(analizzaPreventivo(salvata.analisi, voci, imponibile));
        bozzaPerCommessa = { ...bozzaPdf, voci: bozzaPdf.voci.map(r => costi[r.id] == null ? r : { ...r, costo: String(costi[r.id]) }) };
      }
    }
    return preparaCommessaDaComputo({
      companyId, userId, draftId, bozza: bozzaPerCommessa,
      subtotal: fiscaleDocumento.imponibile ?? 0, vatAmount: fiscaleDocumento.iva ?? 0, total: fiscaleDocumento.totale ?? fiscaleDocumento.imponibile ?? 0, aliquotaIva: aliquota,
      rate: rateCommessa, validityDays: modello?.giorniValidita ?? 30,
      conCosti: vediMargini,
      generaPdf: invio ? async () => invio.pdfBlob : generaPdfDefinitivo,
      recapitiFirma: invio ? {
        clientEmail: invio.clientEmail, clientPhone: invio.clientPhone, clientTipo: invio.clientTipo,
        clientCompany: invio.clientCompany, clientVat: invio.clientVat,
      } : undefined,
    });
  };
  const creaCommessa = async () => {
    if (!firmaOnline?.userId || !firmaOnline.onApriCommessa) return;
    const quoteId = await preparaPreventivoComputo();
    // La commessa nasce dal preventivo firmato (il firmato è il contratto): se non lo è ancora,
    // prima la firma su carta, poi la commessa. Senza, il modulo della commessa rifiutava il salvataggio (17/11/2026).
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: q, error } = await supabase.from("quotes").select("id, company_id, status, signed_at, client_name, quote_number").eq("id", quoteId).maybeSingle();
    if (error || !q) throw new Error("Non riesco a leggere il preventivo: riprova.");
    if (q.signed_at || ["accettata", "convertita"].includes(String(q.status))) { firmaOnline.onApriCommessa(quoteId); return; }
    setDaFirmare({ id: q.id, company_id: q.company_id, client_name: q.client_name, quote_number: q.quote_number });
  };
  /** I costi delle voci senza costo dal listino aziendale, col codice della voce (31/10/2026). */
  const costiDalListino = async (): Promise<number> => {
    const { codiciSenzaCosto, applicaCostiListino } = await import("@/lib/computo/costiDalListino");
    const codici = codiciSenzaCosto(corrente.current.voci);
    if (!codici.length || !firmaOnline?.companyId) return 0;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.from("tariffe_aziendali").select("codice, prezzo_costo, costo_interno")
      .eq("company_id", firmaOnline.companyId).in("codice", codici.slice(0, 500));
    if (error) throw new Error("Non riesco a leggere il listino: riprova.");
    const listino = (data ?? []).map(t => ({ codice: String(t.codice ?? ""), costo: Number(t.prezzo_costo) || Number(t.costo_interno) || 0 }));
    const esito = applicaCostiListino(corrente.current.voci, listino);
    if (esito.trovate) cambiaParte({ voci: esito.voci });
    return esito.trovate;
  };
  /** Il PDF che va al cliente, anche per la firma online: senza «Bozza», con gli allegati. */
  const generaPdfDefinitivo = async () => {
    if (erroreIva || sconto.errore) throw new Error(erroreIva || sconto.errore);
    const { generaDocumentoComputo } = await import("@/lib/computo/esportaComputo");
    return generaDocumentoComputo(vociDaBozza(bozzaPdf, senzaPrezzi), { ...await intestazionePdf(), stato: "" }, await allegatiDocumento());
  };
  const rivalutaErroreLavorazioni = (nuova: BozzaComputo) => {
    if (nuova.voci.some(r => !r.opzionale && !nuova.capitoliEsclusiPdf.includes(r.capitolo.trim() || "Opere edili"))) {
      setErrore(attuale => attuale === "Aggiungi almeno una lavorazione." ? "" : attuale);
    }
  };
  const cambia = (nuova: BozzaComputo) => {
    if (conflitto) return;
    rivalutaErroreLavorazioni(nuova);
    setDocumentoPronto(false);
    setStorico(h => [...h.slice(-29), bozza]);
    setBozza(nuova); modificato.current = true; setSalvato(false);
  };
  /** Più modifiche nello stesso giro (il contatto del CRM riempie nome, recapiti e indirizzo): si sommano invece di cancellarsi. */
  const cambiaParte = (patch: Partial<BozzaComputo>) => {
    const nuova = { ...corrente.current, ...patch };
    if (Object.keys(patch).some(k => k.startsWith("cantiere_"))) nuova.indirizzo = indirizzoDaCantiere(nuova);
    corrente.current = nuova; cambia(nuova);
  };

  async function applicaDallaPianta(
    origine: OrigineComputoPianta, voci: VoceEditor[], prima: VoceEditor[],
    disegno?: Pick<AggiornamentoProgettoComputo, "documento" | "versioneAttesa">,
  ) {
    const attuale = corrente.current;
    if (attuale.voci !== prima || conflitto || erroreLettura || localStorage.getItem(storageKey) !== precedente.current) {
      throw new Error("Il computo è cambiato. Riapri il confronto.");
    }
    const aggiornato = { ...attuale, voci, piantaOrigine: origine };
    if (disegno) {
      if (!cloud?.salvaProgetto) throw new Error("Apri la bozza nel gestionale per salvare insieme disegno e misure.");
      const esito = await cloud.salvaProgetto({ ...disegno, prima: attuale, dopo: aggiornato });
      cambia(esito);
      corrente.current = esito;
      setStorico([]);
      toast.success(`Progetto v${origine.versione} e stessa bozza aggiornati`);
      setAiAperta(sessione => sessione && { ...sessione, bozzaDaProgetto: esito });
      return esito.voci;
    } else {
      corrente.current = aggiornato;
      cambia(aggiornato);
      setAiAperta(sessione => sessione && { ...sessione, bozzaDaProgetto: aggiornato });
      toast.success("Misure aggiornate nel computo");
    }
  }

  function vistaProgetto(affiancata: boolean, inSilvio = false) {
    const origine = bozza.piantaOrigine;
    return origine && <Suspense fallback={<p role="status" className="text-sm">Apro il collegamento alla planimetria…</p>}>
      <ComputoDallaPianta origine={origine} companyId={companyId} voci={bozza.voci}
        modifica={puoAggiornarePianta && !conflitto && !erroreLettura} affiancata={affiancata} onModificaPianta={setPiantaInModifica}
        ripristino={ripristinoProgetto} onRipristino={setRipristinoProgetto}
        inSilvio={inSilvio} conSalvataggioCongiunto={!!cloud?.salvaProgetto} computoSalvato={cloud?.progettoPronto} onApply={applicaDallaPianta}
        renderPdf={inSilvio ? renderLive : undefined} chiavePdf={liveKey}
        tavolaNelPdf={bozza.progettoNelPdf !== "nessuno"} />
    </Suspense>;
  }
  const modificaVoce = (patch: Partial<VoceEditor>) => v && cambia({ ...bozza, voci: bozza.voci.map(r => r.id === v.id ? aggiornaVoceManuale(r, patch) : r) });
  const usaMisuraDallaVariante = (riga: RigaStudio) => cambia({
    ...bozza,
    voci: bozza.voci.map(voce => voce.id === riga.id ? {
      ...voce, ...misuraRigaStudio(riga),
      noteMisure: voce.noteMisure.replaceAll(NOTA_QUANTITA_RIPRESA, "").trim(),
    } : voce),
  });

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
      if (!preview && (erroreIva || sconto.errore)) throw new Error(erroreIva || sconto.errore);
      const datiAnteprima = preview ? vociPerAnteprima(bozzaPdf, senzaPrezzi) : null;
      const voci = datiAnteprima?.voci ?? vociDaBozza(bozzaPdf, senzaPrezzi);
      const allegati = await allegatiDocumento();
      const { esportaComputoPdf, generaDocumentoComputo } = await import("@/lib/computo/esportaComputo");
      const datiDocumento = await intestazionePdf();
      if (preview) {
        const parziale = datiAnteprima?.incomplete ? `BOZZA PARZIALE: ${datiAnteprima.incomplete} lavorazioni da completare. Importi mancanti non inclusi nel parziale. Non è un'offerta definitiva.`
          : sconto.errore || erroreIva || undefined;
        const blob = await generaDocumentoComputo(voci, { ...datiDocumento, parziale }, allegati);
        setAnteprimaParziale(!!parziale);
        setAnteprima(blob);
      // Il documento scaricato è quello che va al cliente: niente «Bozza» stampato sopra.
      } else await esportaComputoPdf(voci, { ...datiDocumento, stato: "" }, allegati);
      setDocumentoPronto(!invalide && !erroreIva && !sconto.errore);
      setErrore("");
    } catch (e) { setErrore(e instanceof Error ? e.message : "PDF non generato. Riprova."); }
    finally { setEsportando(false); }
  };
  /** Il computo in Excel (lo stesso foglio della commessa) e in XPWE, da riaprire in PriMus. */
  const scaricaExcel = async () => {
    try {
      const { esportaComputoXlsx } = await import("@/lib/computo/esportaComputo");
      await esportaComputoXlsx(vociPerAnteprima(bozzaPdf, senzaPrezzi).voci, { ...intestazione, stato: "" });
    } catch (e) { setErrore(e instanceof Error ? e.message : "Excel non generato. Riprova."); }
  };
  const scaricaXpwe = () => {
    setAvvisoXpwe(true);
    void import("@/lib/computo/scriviXpwe").then(({ scriviComputoXpwe }) => {
      const blob = new Blob([scriviComputoXpwe(bozza, azienda ?? "")], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${(bozza.titolo.trim() || "computo").replace(/[^\w\-àèéìòù ]+/gi, "").trim().replace(/\s+/g, "-").slice(0, 80) || "computo"}.xpwe`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch((e: unknown) => setErrore(e instanceof Error ? e.message : "XPWE non generato. Riprova."));
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
  const aggiungi = (capitolo: string) => {
    if (conflitto || bozza.voci.length >= 5000) return;
    const nuova = { ...voceVuota(), capitolo };
    cambia({ ...bozza, voci: [...bozza.voci, nuova] });
    setScelta("");
    return nuova.id;
  };
  const daListino = (scelte: PickedVoce[]): void | false => {
    if (bozza.voci.length + scelte.length > 5000) { toast.error("Il computo supererebbe le 5000 lavorazioni: togli qualche voce."); return false; }
    const nuove = scelte.map(picked => {
      const unita = picked.unita_originale?.trim() || picked.unita_misura;
      return { ...voceVuota(), capitolo: picker?.capitolo || picked.capitolo_nome || "Opere edili",
        descrizione: [picked.descrizione, picked.descrizione_estesa].filter((s, n, all) => !!s && all.indexOf(s) === n).join("\n"),
        unita, quantita: String(picked.quantita ?? 1), prezzo: String(picked.prezzo_unitario),
        tariffa: picked.codice_tariffa || "", fonte: picked.fonte || "", corpo: unita === "corpo" || unita === "a corpo",
        costo: costoDaListino(picked) };
    });
    if (!nuove.length) { setPicker(null); return; }
    cambia({ ...bozza, voci: [...bozza.voci, ...nuove] }); apriVoce(nuove[nuove.length - 1].id); setPicker(null);
  };
  /** Le voci rivedute nel popup «Importa voci»: in coda, e l'intestazione del documento solo dove la bozza è vuota. */
  const daImport = (importate: VoceImportata[], esito: EsitoImportComputo | null) => {
    setImportAperto(false);
    if (!importate.length || conflitto || erroreLettura || bozza.voci.length + importate.length > 5000) return;
    const voci = importate.map(({ avvisi: _a, origine: _o, valoriDocumento: _d, ...voce }) => voce);
    try {
      cambia(esito ? applicaImportComputo(bozza, { ...esito, voci }) : { ...bozza, voci: [...bozza.voci, ...voci] });
    } catch (e) { setErrore(e instanceof Error ? e.message : "Import non riuscito."); return; }
    setScelta("");
    toast.success(`${voci.length} ${voci.length === 1 ? "voce aggiunta" : "voci aggiunte"} al computo`, { description: "Con «Annulla» si torna indietro." });
  };
  const riordina = (delta: number) => {
    if (!v) return;
    const i = bozza.voci.indexOf(v); const j = i + delta;
    if (j < 0 || j >= bozza.voci.length) return;
    const righe = [...bozza.voci]; [righe[i], righe[j]] = [righe[j], righe[i]];
    cambia({ ...bozza, voci: righe });
  };

  const dettaglioVoce = <fieldset disabled={conflitto || erroreLettura || esportando || caricando} aria-label="Modifica lavorazione nella riga" className="min-w-0" onFocusCapture={() => { if (v) puntaVocePdf(v.id); }}>{v && <div className="min-w-0 space-y-4">
    {puoUsareAnalisi && mostraDatiInterni && <Button type="button" size="sm" variant="outline" onClick={() => apriAnalisi({ voce: v.id })}><Calculator className="mr-1.5 h-4 w-4" />Analizza costi</Button>}
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Voce {v.numero || bozza.voci.indexOf(v) + 1}</h3><div className="flex flex-wrap items-center gap-1"><Button type="button" variant="ghost" size="sm" aria-label="Chiudi dettagli" className="h-8 gap-1 max-md:h-10 max-md:w-10 max-md:p-0" onClick={() => setScelta("")}><X className="h-3.5 w-3.5" /><span className="max-md:hidden">Chiudi dettagli</span></Button>
              <Button variant="ghost" size="icon" aria-label="Sposta voce su" title="Sposta su" disabled={bozza.voci.indexOf(v) === 0} onClick={() => riordina(-1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Sposta voce giù" title="Sposta giù" disabled={bozza.voci.indexOf(v) === bozza.voci.length - 1} onClick={() => riordina(1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Duplica voce" title="Duplica voce" disabled={bozza.voci.length >= 5000} onClick={() => {
                const copia = { ...v, id: crypto.randomUUID(), misure: v.misure.map(m => ({ ...misuraSenzaCollegamento(m), id: crypto.randomUUID() })) };
                const i = bozza.voci.indexOf(v);
                cambia({ ...bozza, voci: [...bozza.voci.slice(0, i + 1), copia, ...bozza.voci.slice(i + 1)] }); setScelta(copia.id);
              }}><Copy className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Elimina voce" title="Elimina voce" onClick={() => { cambia({ ...bozza, voci: bozza.voci.filter(r => r.id !== v.id) }); setScelta(""); }}><Trash2 className="h-4 w-4" /></Button>
            </div></div>
            <div className="space-y-1"><Label htmlFor="voce-descrizione">Descrizione della lavorazione</Label><TestoCheCresce id="voce-descrizione" minRighe={2} maxLength={30000} value={v.descrizione} onChange={e => modificaVoce({ descrizione: e.target.value })} /></div>
            {percorsoMisura && <Button asChild size="sm" variant="outline"><Link to={percorsoMisura}>Vedi la misura sulla pianta</Link></Button>}
            {percorsoPiano && <Button asChild size="sm" variant="outline"><Link to={percorsoPiano}>Vedi il piano di origine</Link></Button>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([['Codice tariffa', 'tariffa'], ['Unità di misura', 'unita'], ['Quantità', 'quantita'], ['Prezzo unitario', 'prezzo']] as const).map(([label, key]) =>
              <div key={key} className="min-w-0 space-y-1"><Label htmlFor={`voce-${key}`}>{label}</Label>{key === "unita"
                ? <ComputoUnitaSelect key={v.id} value={v.unita} onChange={unita => modificaVoce({ unita, corpo: unita === "corpo" || unita === "a corpo" })} />
                : <Input id={`voce-${key}`} maxLength={key === "tariffa" ? 160 : 40} inputMode={key === "quantita" || key === "prezzo" ? "decimal" : "text"}
                  disabled={key === "quantita" && !!v.misure.length} value={key === "quantita" && v.misure.length ? String(calcolaVoce(v).quantita ?? "").replace(".", ",") : v[key]} onChange={e => modificaVoce({ [key]: e.target.value })} />}</div>)}</div>
            {mostraDatiInterni && (() => {
              const r = calcolaVoce(v); const cu = numeroEditor(v.costo ?? "");
              const margine = cu != null && r.prezzo != null && r.prezzo > 0 ? (r.prezzo - cu) / r.prezzo * 100 : null;
              return <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed bg-white p-2">
                <div className="w-44 max-w-full space-y-1"><Label htmlFor="voce-costo" className="text-xs">Costo unitario stimato</Label>
                  <Input id="voce-costo" className="h-9" inputMode="decimal" maxLength={40} placeholder="€ per unità" value={v.costo ?? ""} onChange={e => modificaVoce({ costo: e.target.value })} /></div>
                <p className="pb-2 text-xs text-muted-foreground">{margine == null ? "Serve per margini e cassa nel passo Economia. Non va nel PDF." : <>Margine sulla voce <strong className={margine < 10 ? "text-red-700" : margine < 20 ? "text-amber-700" : "text-emerald-700"}>{margine.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</strong> · non va nel PDF</>}</p>
              </div>;
            })()}
            <ComputoMisure misure={v.misure} unita={v.unita} onChange={misure => modificaVoce({ misure })} />
            <details className="border-y py-3"><summary className="cursor-pointer text-sm font-medium">Classificazione e opzioni tecniche</summary><div className="mt-3 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">{([['Capitolo', 'capitolo'], ['Categoria', 'categoria'], ['Sottocategoria', 'sottocategoria']] as const).map(([label, key]) =>
                <div key={key} className="min-w-0 space-y-1"><Label htmlFor={`voce-${key}`}>{label}</Label><Input id={`voce-${key}`} maxLength={300} value={v[key]} onChange={e => modificaVoce({ [key]: e.target.value })} /></div>)}</div>
              <div className="space-y-1"><Label htmlFor="voce-fonte">Fonte del prezzo</Label><Input id="voce-fonte" maxLength={500} value={v.fonte ?? ""} onChange={e => modificaVoce({ fonte: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="voce-note-misure">Misure di riferimento originali (non usate nel calcolo)</Label><TestoCheCresce id="voce-note-misure" minRighe={4} maxLength={30000} value={v.noteMisure ?? ""} onChange={e => modificaVoce({ noteMisure: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="voce-comune">Descrizione comune del gruppo</Label><TestoCheCresce id="voce-comune" minRighe={4} maxLength={30000} value={v.descrizioneComune ?? ""} onChange={e => modificaVoce({ descrizioneComune: e.target.value })} /></div>
              <div>{([['Opzionale (fuori dal totale)', 'opzionale'], ['Da quantificare più avanti', 'daQuantificare'], ['A corpo', 'corpo'], ['Oneri sicurezza', 'sicurezza'], ['Detrazione', 'detrazione']] as const).map(([label, key]) =>
                <ComputoOpzione key={key} label={label} checked={v[key]} onChange={value => modificaVoce({ [key]: value })} />)}</div>
            </div></details>
            <div className="flex flex-wrap justify-between gap-3 text-sm"><ul className="text-amber-800">{calcolaVoce(v, senzaPrezzi).errori.map(e => <li key={e}>{e}</li>)}</ul><strong>Importo voce: {calcolaVoce(v).importo == null ? "Da completare" : `${formatEuro(calcolaVoce(v).importo!)} €`}</strong></div>
          </div>}</fieldset>;

  const anteprimaDisponibile = !!bozza.voci.length && !!bozza.titolo.trim();
  const comandoPdf = <Button type="button" variant="outline" size="sm" className="aria-pressed:bg-slate-100 aria-pressed:text-slate-900 max-lg:min-h-11 max-lg:px-2.5"
    aria-pressed={desktop && !affiancata ? anteprimaVisibile : undefined}
    title={desktop && !affiancata ? anteprimaVisibile ? "Nascondi il PDF affiancato" : "Mostra il PDF affiancato" : "Apri l’anteprima PDF"}
    disabled={caricando || esportando || ((!desktop || affiancata) && !anteprimaDisponibile)}
    onClick={() => { if (desktop && !affiancata) setAnteprimePassi(v => ({ ...v, [step]: !anteprimaVisibile })); else void esporta(true); }}>
    <Eye className="mr-1.5 h-4 w-4" />Anteprima
  </Button>;
  const titoloPreventivo = bozza.titolo.trim() || "Preventivo / computo metrico";
  const statoSalvataggio = conflitto || erroreLettura ? "Salvataggio sospeso" : cloud ? cloud.status
    : salvato ? "Salvato su questo dispositivo" : "Modifiche da salvare…";
  const importiVisibili = !!bozza.voci.length && !senzaPrezzi;

  return <section className="min-w-0 space-y-2" aria-label="Editor computo metrico">
    {onBack && <Button variant="ghost" size="sm" disabled={caricando || esportando} onClick={() => {
      if (piantaInModifica) { toast.info("Salva la pianta o annulla le modifiche prima di uscire."); return; }
      onBack();
    }}><ArrowLeft className="mr-1 h-4 w-4" />Preventivi</Button>}
    <header className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <QuotePageHeader className="rounded-none border-0 px-3 py-3 shadow-none sm:px-4 sm:py-3 [&_h1]:text-lg sm:[&_h1]:text-xl [&_h1+p]:block [&_h1+p]:whitespace-normal"
      title={<span title={titoloPreventivo}>{titoloPreventivo}</span>}
      subtitle={<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {bozza.committente.trim() && <span className="max-w-full truncate font-medium text-slate-700">{bozza.committente.trim()}</span>}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">{bozza.numero.trim() || "Bozza"}</span>
        <span role="status" aria-label="Salvataggio bozza" className="text-muted-foreground">{statoSalvataggio}</span>
      </span>}
      icon={<FileSpreadsheet className="h-5 w-5" />} actions={<>
        {onComputoDaPlanimetria && <Button type="button" variant="outline" size="sm" disabled={caricando || esportando}
          onClick={onComputoDaPlanimetria}><LayoutPanelTop className="mr-1 h-4 w-4" />Da planimetria</Button>}
        {/* Le copie di sicurezza servono di rado: stanno qui. Quando c'è un problema compaiono nell'avviso. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Altro" className="max-sm:w-9 max-sm:px-0" disabled={caricando || esportando}>
            <MoreHorizontal className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Altro</span>
          </Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {vediMargini && <>
              {puoUsareAnalisi && <DropdownMenuItem onSelect={() => apriAnalisi({})}><Calculator className="mr-2 h-4 w-4" />Analisi costi</DropdownMenuItem>}
              <DropdownMenuCheckboxItem checked={mostraDatiInterni} onCheckedChange={setDettagliEconomici} className="max-md:min-h-11">
                Mostra costi e margini nell’editor
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
            </>}
            <DropdownMenuItem onSelect={() => setRevisioniAperte(true)}><History className="mr-2 h-4 w-4" />Revisioni e confronto{bozza.revisioni.length ? ` (${bozza.revisioni.length})` : ""}</DropdownMenuItem>
            <DropdownMenuItem disabled={!bozza.voci.length} onSelect={() => { void scaricaExcel(); }}><FileSpreadsheet className="mr-2 h-4 w-4" />Scarica in Excel</DropdownMenuItem>
            <DropdownMenuItem disabled={!bozza.voci.length} onSelect={() => scaricaXpwe()}><FileDown className="mr-2 h-4 w-4" />Scarica per PriMus (XPWE)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void copiaBozza(); }}><Download className="mr-2 h-4 w-4" />Scarica una copia della bozza</DropdownMenuItem>
            <DropdownMenuItem disabled={conflitto} onSelect={() => importInput.current?.click()}><Upload className="mr-2 h-4 w-4" />Riapri una copia salvata…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {comandoPdf}
        <QuotePrimaryButton aria-label="Scarica preventivo" className="max-lg:hidden" size="sm" disabled={esportando || caricando || !bozza.voci.length || !!invalide || !!erroreIva || !!sconto.errore || !bozza.titolo.trim()} onClick={() => esporta()}>
          {esportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Scarica PDF
        </QuotePrimaryButton>
      </>} />
      {importiVisibili && <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium text-slate-700">Importi del documento</span>
          {!!invalide && <span className="text-amber-800">Parziale</span>}
          {!!bozza.capitoliEsclusiPdf.length && <span className="text-muted-foreground">Capitoli inclusi nel PDF</span>}
        </div>
        <dl aria-label="Importi del documento" className="grid grid-cols-3 divide-x divide-slate-200 tabular-nums sm:w-[27rem]">
          <div className="min-w-0 px-2 sm:px-3">
            <dt className="text-xs text-muted-foreground">Imponibile</dt>
            <dd className="break-words text-sm font-medium">{formatEuro(fiscaleDocumento.imponibile ?? 0)} €</dd>
          </div>
          <div className="min-w-0 px-2 sm:px-3">
            <dt className="text-xs text-muted-foreground">IVA</dt>
            <dd className={fiscaleDocumento.iva == null ? "text-xs text-amber-800" : "break-words text-sm font-medium"}>
              {fiscaleDocumento.iva == null ? fiscaleDocumento.errore ? "Da correggere" : "Da definire" : `${formatEuro(fiscaleDocumento.iva)} €`}
            </dd>
          </div>
          <div className="min-w-0 px-2 sm:px-3">
            <dt className="text-xs text-muted-foreground">{fiscaleDocumento.modalita === "applicata" ? "Totale IVA inclusa" : "Totale cliente"}</dt>
            <dd className="break-words text-sm font-semibold text-blue-900 sm:text-base">{fiscaleDocumento.totale == null ? "—" : `${formatEuro(fiscaleDocumento.totale)} €`}</dd>
          </div>
        </dl>
      </div>}
    </header>
    {avvisoXpwe && <div role="status" className="rounded-md border p-3 text-sm">
      Il file XPWE conserva quantità e prezzi, ma non tutte le formule originali o i costi interni.
      Per riaprire il computo completo in Edilizia in Cloud usa «Scarica una copia della bozza» e poi «Riapri una copia salvata».
      <Button variant="outline" size="sm" className="ml-2" onClick={() => { void copiaBozza(); }}>Scarica copia completa</Button>
    </div>}
    <div ref={testaFasi} aria-hidden="true" className="scroll-mt-4" />
    <BarraFasi passi={[{ key: "0", label: "Dati" }, { key: "1", label: "Progetto" }, { key: "2", label: "Computo" }, { key: "3", label: "Economia" }, { key: "4", label: "Documento" }]}
      corrente={String(step)} completati={new Set([!!bozza.titolo.trim() && !!bozza.committente.trim(), true, !!bozza.voci.length && !invalide, !!bozza.voci.length && !invalide && !erroreIva && !sconto.errore, documentoPronto].flatMap((ok, n) => ok ? [String(n)] : []))}
      onSelect={n => cambiaFase(Number(n))} className={`max-lg:sticky max-lg:z-30 ${STICKY_ALTO}`} ariaLabel="Fasi del preventivo / computo metrico" />
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
      <span>{errore}</span>
      <span className="flex flex-wrap gap-2">
        {(erroreLettura || conflitto || errore.startsWith("Salvataggio locale")) && <Button variant="outline" size="sm" disabled={caricando} onClick={() => { void copiaBozza(); }}><Download className="mr-1 h-4 w-4" />{erroreLettura ? "Conserva il file originale" : "Scarica una copia della bozza"}</Button>}
        {conflitto && <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Ricarica versione salvata</Button>}
      </span>
    </div>}
    <CorpoPreventivatore anteprimaCompatta className="gap-3 px-0 py-0 sm:px-0" anteprimaNascosta={!anteprimaVisibile} anteprima={<div className="flex h-[65dvh] min-h-[420px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><ComputoFormatoSelect label="Variante anteprima PDF" value={bozza.formatoPdf} disabled={esportando || caricando || conflitto || erroreLettura} onChange={value => cambia(applicaVarianteComputo(bozza, value))} /></div>
        <Button type="button" variant="outline" size="icon" aria-label="Ingrandisci anteprima" title="Ingrandisci anteprima"
          disabled={!anteprimaDisponibile || caricando || esportando} onClick={() => void esporta(true)}><Maximize2 className="h-4 w-4" /></Button>
      </div>
      <div className="min-h-0 flex-1"><PdfBlobLivePreviewPanel renderBlobUrl={renderLive} depsKey={liveKey} debounceMs={900} enabled={desktop && anteprimaVisibile} downloadFileName="preventivo-computo.pdf"
        activeDestination={step === 2 && vocePdf ? destinazioneVoceComputo(vocePdf.id) : null} destinationRequest={vocePdf?.richiesta}
        destinationLabel={`Voce ${bozza.voci.find(r => r.id === vocePdf?.id)?.numero || bozza.voci.findIndex(r => r.id === vocePdf?.id) + 1}`} /></div>
    </div>}>
    <fieldset disabled={conflitto || erroreLettura || esportando || caricando} className="min-w-0 space-y-4">
      {step === 0 && <ComputoDati bozza={bozza} onChange={cambiaParte} />}
      {step === 1 && <>
        {companyId && puoAggiornarePianta && <Suspense fallback={<p role="status" className="text-sm">Apro il collegamento alla planimetria…</p>}>
          <ProgettoPlanimetria companyId={companyId} scope={storageKey} titolo={bozza.titolo} allegati={bozza.allegati ?? []}
            origine={bozza.piantaOrigine} puoCambiare={!bozza.voci.some(v => v.misure.some(m => m.dallaPianta))}
            onApriSilvio={ai && bozza.voci.length <= MAX_VOCI_SILVIO ? () => setAiAperta({ progetto: true }) : undefined}
            onCollega={piantaOrigine => {
              if (corrente.current.voci.some(v => v.misure.some(m => m.dallaPianta))) throw new Error("Il computo contiene già misure collegate a una pianta.");
              cambiaParte({ piantaOrigine, progettoNelPdf: "nessuno" }); setVistaPianta(true); cambiaFase(2);
            }}
            onApriComputo={() => { setVistaPianta(true); cambiaFase(2); }} />
        </Suspense>}
        <ComputoProgetto scope={storageKey} allegati={bozza.allegati ?? []} onBusy={setCaricando} onChange={allegati => cambiaParte({ allegati })}
          fotoCopertina={idFoto} onFotoCopertina={id => cambiaParte({ fotoCopertina: id })} />
      </>}
      {step === 2 && bozza.piantaOrigine && <div role="group" aria-label="Vista del computo" className="flex w-fit flex-wrap items-center gap-1 rounded-lg border bg-slate-50 p-1">
        <Button type="button" size="sm" variant={affiancata ? "ghost" : "secondary"} aria-pressed={!affiancata} onClick={() => {
          if (piantaInModifica) { toast.info("Salva la pianta o annulla le modifiche per tornare alla tabella."); return; }
          setVistaPianta(false);
        }}><Table2 aria-hidden="true" className="size-4" /> Tabella voci</Button>
        <Button type="button" size="sm" variant={affiancata ? "secondary" : "ghost"} aria-pressed={affiancata} onClick={() => setVistaPianta(true)}>
          <MapIcon aria-hidden="true" className="size-4" /> Pianta e computo
        </Button>
      </div>}
      {(step === 2 || step === 4) && !aiAperta && vistaProgetto(affiancata)}
      {step === 2 && !affiancata && <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 py-1">
        <h2 className="text-base font-semibold">Lavorazioni</h2>
        <div aria-label="Riepilogo del computo" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <span>{bozza.voci.length} {bozza.voci.length === 1 ? "voce" : "voci"}</span>
          {!!invalide && <span className="text-amber-800">· {invalide} da completare</span>}
          {(!importiVisibili || totale !== totaleDocumento) && <span>· Totale lavori <strong className="text-slate-800">{formatEuro(totale)} €</strong></span>}
        </div>
      </div>
      {fonte && <ComputoVerificaPlanimetria fonte={fonte} righe={righeVerificate} variante={datiPianta?.pdf.variante} scalaIncerta={datiPianta?.scalaIncerta}
        onUsaMisura={usaMisuraDallaVariante}
        avviso={!idAzienda || collegamento.isError || (datiPianta && !datiPianta.pdf.tavole.length) ? "Tavola non disponibile per questa versione." : collegamento.isPending ? "Caricamento della variante…" : undefined} />}
      {/* Una riga sola (29/10/2026): prima erano un riquadro arancione con tre righe di spiegazione e, sotto, un'altra riga di pulsanti. */}
      <div>
        <div role="group" aria-label="Azioni del computo" className="flex flex-wrap items-center gap-1.5 [&>button]:h-8 [&>button]:text-xs [&>span>button]:h-8 [&>span>button]:text-xs">
          {ai && <>
            <Button size="sm" className="bg-blue-950 text-white hover:bg-blue-900" disabled={bozza.voci.length > MAX_VOCI_SILVIO}
              title={bozza.voci.length > MAX_VOCI_SILVIO ? `Silvio lavora su preventivi fino a ${MAX_VOCI_SILVIO} voci: questo ne ha ${bozza.voci.length}.` : "Descrivi il lavoro, anche a voce: Silvio propone le voci e tu le rivedi"}
              onClick={() => setAiAperta({})}><Sparkles className="mr-1 h-4 w-4 text-orange-300" />Apri Silvio AI</Button>
          </>}
          <Button size="sm" variant="outline" className="bg-white" disabled={bozza.voci.length >= 5000} onClick={() => setImportAperto(true)}><FileUp className="mr-1 h-4 w-4" />Importa voci</Button>
          <span className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" title="Annulla ultima modifica" aria-label="Annulla ultima modifica" disabled={!storico.length} onClick={() => {
              const ripristinata = storico.at(-1)!;
              rivalutaErroreLavorazioni(ripristinata);
              setBozza(ripristinata); setStorico(h => h.slice(0, -1)); modificato.current = true; setSalvato(false); setDocumentoPronto(false);
            }}><Undo2 className="h-4 w-4" /></Button>
          </span>
        </div>
      </div>
      {/* I file del passo Progetto lavorano anche qui: Silvio legge la pianta e propone le voci con le misure. */}
      {ai && (bozza.allegati ?? []).some(a => a.tipo === "planimetria" || a.mime.startsWith("image/")) && <div role="group" aria-label="File del progetto" className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-white px-3 py-2 text-xs">
        <span className="text-muted-foreground">Dal progetto:</span>
        {(bozza.allegati ?? []).filter(a => a.tipo === "planimetria" || a.mime.startsWith("image/")).slice(0, 6).map(a => <Button key={a.id} type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={bozza.voci.length > MAX_VOCI_SILVIO}
          title={`Fai leggere «${a.nome}» a Silvio`} onClick={async () => {
            const blob = await leggiAllegatoLocale(storageKey, a.id).catch((): null => null);
            if (!blob) { toast.error(`«${a.nome}» non è disponibile in questo browser: ricaricalo nel passo Progetto.`); return; }
            setAiAperta({ file: new File([blob], a.nome, { type: a.mime }) });
          }}><Sparkles className="h-3 w-3 text-orange-500" />{a.nome.length > 28 ? `${a.nome.slice(0, 26)}…` : a.nome}</Button>)}
        <span className="text-muted-foreground">· Silvio la legge e propone le voci</span>
      </div>}
      <ComputoCapitoli indiceLaterale={!anteprimaVisibile} voci={bozza.voci} capitoliVuoti={bozza.capitoli ?? []} aperta={v?.id}
        vociAggiornateDaSilvio={vociAggiornateDaSilvio}
        onAttiva={puntaVocePdf}
        onStima={puoUsareAnalisi && mostraDatiInterni && !conflitto ? voce => apriAnalisi({ voce, stima: true }) : undefined}
        onSilvio={ai && bozza.voci.length < MAX_VOCI_SILVIO ? capitolo => setAiAperta({ capitolo }) : undefined}
        onApri={id => (id ? apriVoce(id) : setScelta(""))} onAdd={aggiungi}
        onModifica={(id, patch) => cambia({ ...bozza, voci: bozza.voci.map(r => r.id === id ? aggiornaVoceManuale(r, patch) : r) })}
        onCapitoli={capitoli => cambia({ ...bozza, capitoli })}
        onRename={(prima, dopo) => cambia({ ...bozza, capitoli: (bozza.capitoli ?? []).map(n => n === prima ? dopo : n), voci: bozza.voci.map(r => (r.capitolo.trim() || "Opere edili") === prima ? { ...r, capitolo: dopo } : r) })}
        onEliminaCapitolo={nome => { cambia({ ...bozza, capitoli: (bozza.capitoli ?? []).filter(n => n !== nome), voci: bozza.voci.filter(r => (r.capitolo.trim() || "Opere edili") !== nome) }); setScelta(""); }}
        onListino={consentiListini ? capitolo => setPicker({ capitolo }) : undefined}
        renderDettaglio={() => dettaglioVoce} />
      </div>}
      {step === 3 && <ComputoEconomia bozza={bozza} totale={totale} onChange={cambiaParte} vediMargini={mostraDatiInterni} onCronoprogramma={() => cambiaFase(4)}
        onCostiDalListino={firmaOnline?.companyId ? costiDalListino : undefined} conModelliAzienda={!!firmaOnline?.companyId} />}
      {step === 4 && <ComputoDocumento bozza={bozza} onChange={cambiaParte} onSostituisci={cambia} spesaCliente={spesaCliente} ivaInclusa={fiscaleDocumento.totale != null}
        controlli={(!bozza.titolo.trim() || !bozza.voci.length || !!invalide || !!erroreIva || !!sconto.errore || !!pianoErrore || !!daQuantificare ||
          !!affidabilita?.daControllare.length || !!affidabilita?.sovrapposizioni.length) && <div role="region" aria-label="Controlli prima del PDF" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
          <h3 className="font-medium">{bloccaDocumento ? "Da completare prima del download" : pianoErrore ? "Da sistemare prima di mandarlo" : "Da sapere su questo preventivo"}</h3>
          {!bozza.titolo.trim() && <Button variant="link" className="h-auto p-0" onClick={() => cambiaFase(0)}>Inserisci il titolo del preventivo</Button>}
          {!bozza.voci.length && <Button variant="link" className="h-auto p-0" onClick={() => cambiaFase(2)}>Inserisci almeno una lavorazione</Button>}
          {(!!erroreIva || !!sconto.errore) && <Button variant="link" className="h-auto p-0" onClick={() => cambiaFase(3)}>Sistema IVA e sconto nel passo Economia</Button>}
          {!!sconto.errore && <p className="text-xs text-amber-800">{sconto.errore} Il calcolo usa i capitoli inclusi nel documento.</p>}
          {/* Un piano incompleto non ferma più il PDF (11/11/2026): il documento esce senza il piano, e lo dice. */}
          {!!pianoErrore && <div className="space-y-0.5">
            <Button variant="link" className="h-auto max-w-full whitespace-normal p-0 text-left" onClick={() => cambiaFase(3)}>Sistema le rate nel passo Economia</Button>
            <p className="text-xs text-muted-foreground">{pianoErrore} Il PDF si scarica lo stesso, ma senza il piano dei pagamenti; per la firma e per la commessa il piano deve quadrare.</p>
          </div>}
          {bozza.voci.flatMap((r, i) => risultati[i].errori.length ? [<div key={r.id} className="space-y-0.5">
            <Button variant="link" className="h-auto max-w-full whitespace-normal p-0 text-left" onClick={() => { setScelta(r.id); cambiaFase(2); }}>Completa lavorazione {i + 1}</Button>
            <p className="text-xs text-muted-foreground">{risultati[i].errori.join(" ")}</p>
          </div>] : []).slice(0, 10)}
          {invalide > 10 && <p className="text-muted-foreground">Altre {invalide - 10} lavorazioni da completare nel computo.</p>}
          {/* Le voci che si misurano dopo non fermano niente: il documento le porta e lo dice (11/11/2026). */}
          {!!daQuantificare && <p className="text-xs text-muted-foreground">{daQuantificare === 1 ? "1 lavorazione è segnata «da quantificare»" : `${daQuantificare} lavorazioni sono segnate «da quantificare»`}: escono nel documento senza importo, si contabilizzano a misura e non bloccano il download.</p>}
          {affidabilita?.daControllare.slice(0, 5).map(({ voce, motivo }) => <div key={`${voce.id}:${motivo}`} className="text-xs">
            <span>{motivo} · </span><Button type="button" variant="link" className="h-auto max-w-full whitespace-normal p-0 text-left"
              onClick={() => { apriVoce(voce.id); cambiaFase(2); }}>{voce.descrizione.split("\n")[0]}</Button>
          </div>)}
          {affidabilita?.sovrapposizioni.slice(0, 5).map(({ voce, altra, motivo }, i) => <div key={`${voce.id}:${altra.id}:${i}`} className="text-xs">
            <span>{motivo} · </span><Button type="button" variant="link" className="h-auto max-w-full whitespace-normal p-0 text-left"
              onClick={() => { apriVoce(voce.id); cambiaFase(2); }}>{voce.descrizione.split("\n")[0]}</Button>
          </div>)}
        </div>} onVaiA={cambiaFase} companyId={ai?.companyId ?? firmaOnline?.companyId} disabilitato={conflitto || erroreLettura || esportando || caricando}
        condizioniDelModello={modello?.condizioniContrattuali}
        puoRiscrivereCondizioni={puoRiscrivereCondizioni}
        invioFirma={firmaOnline && <InviaFirmaCard companyId={firmaOnline.companyId} moduleKey="computo" progettoId={firmaOnline.draftId}
          titolo={bozza.titolo.trim() || "Preventivo con computo"} clientName={bozza.committente.trim() || "Cliente"} clientEmail={bozza.clienteEmail || null} clientPhone={bozza.clienteTelefono || null}
          cointestatario={nomeCointestatario(bozza) ? { nome: nomeCointestatario(bozza)!, email: bozza.cointestatario_email || null, telefono: bozza.cointestatario_telefono || null } : null}
          subtotal={fiscaleDocumento.imponibile ?? 0} vatAmount={fiscaleDocumento.iva ?? 0} total={fiscaleDocumento.totale ?? fiscaleDocumento.imponibile ?? 0}
          numeroDocumento={personalizzazioneDocumento(firmaOnline.companyId).numeroAutomaticoComputo ? bozza.numero : null}
          validityDays={modello?.giorniValidita} pdfDisponibile={!!bozza.voci.length}
          disabled={!bozza.voci.length || !!invalide || !!erroreIva || !!sconto.errore || !!pianoErrore || !bozza.titolo.trim()}
          disabledReason="Completa il preventivo (voci, IVA, sconto e rate) prima di mandarlo in firma."
          generaPdfBlob={generaPdfDefinitivo}
          preparaPreventivo={async (input) => ({ id: await preparaPreventivoComputo(input) })} />}
        creaCommessa={firmaOnline?.userId && firmaOnline.onApriCommessa ? creaCommessa : undefined} />}
      {daFirmare && <Suspense fallback={null}><FirmatoSuCartaDialog open onOpenChange={(o) => { if (!o) setDaFirmare(null); }} quote={daFirmare}
        onFirmato={() => { const id = daFirmare.id; setDaFirmare(null); firmaOnline?.onApriCommessa?.(id); }} /></Suspense>}
    </fieldset>
    </CorpoPreventivatore>
    <nav aria-label="Navigazione fasi" className={`flex items-center justify-between gap-2 border-t pt-4 max-lg:sticky max-lg:z-30 max-lg:rounded-lg max-lg:border max-lg:bg-white max-lg:p-2 max-lg:shadow-md ${STICKY_BASSO}`}>
      <Button variant="outline" disabled={step === 0 || caricando || esportando} onClick={() => cambiaFase(step - 1)} className="min-h-11"><ArrowLeft className="mr-1 h-4 w-4" />Indietro</Button>
      {step < 4 && <QuotePrimaryButton disabled={caricando || esportando} onClick={() => cambiaFase(step === 0 ? 2 : step + 1)} className="min-h-11">{step === 0 ? "Vai al computo" : "Avanti"}</QuotePrimaryButton>}
      {step === 4 && <QuotePrimaryButton className="min-h-11" disabled={caricando || esportando || !bozza.voci.length || !!invalide || !!erroreIva || !!sconto.errore || !bozza.titolo.trim()} onClick={() => esporta()}>
        {esportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Scarica PDF
      </QuotePrimaryButton>}
    </nav>
    {analisiAperta && puoUsareAnalisi && <Suspense fallback={<p role="status">Apro l’analisi…</p>}>
      <AnalisiCostiComputoDialog open onOpenChange={open => { if (!open) apriAnalisi(null); }} voceIniziale={analisiAperta.voce} stimaIniziale={analisiAperta.stima}
        companyId={companyId} draftId={analisiCosti.draftId} modifica={analisiCosti.modifica && !conflitto}
        title={bozza.titolo} numero={bozza.numero} revisione={bozza.revisione ? `Rev. ${bozza.revisione}` : "Bozza"} azienda={azienda}
        contestoStima={{
          companyId,
          indirizzo: bozza.indirizzo || [bozza.cantiere_indirizzo, bozza.cantiere_cap, bozza.cantiere_citta, bozza.cantiere_provincia].filter(Boolean).join(", "),
        }}
        {...economiaAnalisiComputo(bozza)}
        onNuovaVoce={analisiCosti.modifica && !conflitto ? (descrizione, quantita, unita) => {
          const r = { ...voceVuota(), descrizione, quantita: String(quantita), unita, corpo: unita === "a corpo", prezzo: "0",
            capitolo: v?.capitolo || "Opere edili" };
          cambiaParte({ voci: [...bozza.voci, r] });
          return r.id;
        } : undefined}
        onProiettaPrezzo={(id, prezzo) => {
          const riga = bozza.voci.find(r => r.id === id);
          if (!riga || riga.unita.trim() === "%" || !(Number(calcolaVoce(riga).quantita) > 0)) return null;
          const esito = economiaAnalisiComputo(bozza, bozza.voci.map(r => r.id === id ? { ...r, prezzo: String(prezzo) } : r));
          return esito.errore ? null : esito;
        }}
        onPrezzo={analisiCosti.modifica && !conflitto ? (id, prezzo) => cambiaParte({
          voci: bozza.voci.map(r => r.id === id ? { ...r, prezzo: String(prezzo) } : r),
        }) : undefined}
        onScegliAlternativa={analisiCosti.modifica && !conflitto ? (id, opzioni) => cambiaParte({
          voci: bozza.voci.map(r => opzioni.includes(r.id) ? { ...r, opzionale: r.id !== id } : r),
        }) : undefined}
        onScaricaCliente={async () => {
          if (bloccaDocumento) throw new Error("Completa lavorazioni, IVA e sconti prima di scaricare l’offerta.");
          downloadQuotePdf(await generaPdfDefinitivo(), "offerta-" + (bozza.numero || "bozza").replace(/[^a-zA-Z0-9-]/g, "-") + ".pdf");
        }} />
    </Suspense>}
    {revisioniAperte && <ComputoRevisioni bozza={bozza} open onOpenChange={setRevisioniAperte} onChange={cambiaParte} />}
    {aiAperta && ai && <Suspense fallback={<p role="status">Apro Silvio AI…</p>}>
      <ComputoSilvioAi key={aiAperta.sessione ?? 0} open bozza={bozza} fileIniziale={aiAperta.file} capitoloIniziale={aiAperta.capitolo} companyId={ai.companyId} draftId={ai.draftId}
          renderPdf={renderLive} chiavePdf={liveKey}
          apriProgetto={aiAperta.progetto}
          continuazione={aiAperta.continuazione} chiediChiusura={aiAperta.chiediChiusura}
          onAggiornaChatPreventivo={aiAperta.bozzaDaProgetto === bozza && !conflitto && !erroreLettura && bozza.voci.length <= MAX_VOCI_SILVIO
            ? (continuazione, chiusura) => setAiAperta(sessione => sessione && {
              sessione: (sessione.sessione ?? 0) + 1, capitolo: sessione.capitolo, continuazione, chiediChiusura: chiusura,
            }) : undefined}
          progettoOperativo={vistaProgetto(true, true)}
          progettoInModifica={piantaInModifica}
          mostraAnalisiCosti={puoUsareAnalisi && !conflitto && !erroreLettura && ai.companyId === companyId && ai.draftId === analisiCosti.draftId}
          modificaAnalisiCosti={analisiCosti?.modifica === true}
          onOpenChange={open => { if (!open) setAiAperta(null); }}
          onApply={(voci, titolo) => {
            const attuale = corrente.current;
            if (conflitto || erroreLettura || attuale.voci !== bozza.voci || localStorage.getItem(storageKey) !== precedente.current) {
              throw new Error("Riapri il computo aggiornato prima di applicare le modifiche di Silvio.");
            }
            // Il titolo di Silvio vale solo se quello del preventivo è ancora quello di partenza: uno scritto a mano non si tocca.
            const titoloNuovo = titolo && (!attuale.titolo.trim() || attuale.titolo === bozzaVuota().titolo) ? { titolo } : {};
            const prima = new Map(attuale.voci.map(voce => [voce.id, voce]));
            const aggiornate = new Set(voci.filter(voce => prima.get(voce.id) !== voce).map(voce => voce.id));
            setAiAperta(null);
            cambia({ ...attuale, ...titoloNuovo, voci });
            setScelta("");
            setVociAggiornateDaSilvio(aggiornate.size ? aggiornate : undefined);
            if (aggiornate.size && step !== 2) cambiaFase(2, false);
            toast.success("Modifiche di Silvio applicate al computo", { description: "Con «Annulla» si torna indietro." });
          }} />
    </Suspense>}
    {importAperto && <Suspense fallback={<p role="status">Apro l'import…</p>}>
      <ImportaVociDialog open onOpenChange={open => { if (!open) setImportAperto(false); }} onAggiungi={daImport} vociPresenti={bozza.voci.length} consentiAi={!!ai}
        daComputi={consentiRiuso && firmaOnline?.userId ? { companyId: firmaOnline.companyId, draftId: firmaOnline.draftId, userId: firmaOnline.userId } : undefined} />
    </Suspense>}
    {picker && consentiListini && <Suspense fallback={<p role="status">Apertura listini…</p>}><AddVocePicker open onOpenChange={open => { if (!open) setPicker(null); }} onPick={daListino} targetCapitolo={picker.capitolo} vociPresenti={bozza.voci.map(v => v.descrizione)} capitoliComputo={bozza.voci.map(v => v.capitolo)} /></Suspense>}
    <Dialog open={!!anteprima} onOpenChange={open => { if (!open) setAnteprima(null); }}>
      <DialogContent className="flex h-[90dvh] max-w-5xl flex-col max-sm:p-3">
        <DialogHeader><DialogTitle>{anteprimaParziale ? "Anteprima bozza parziale" : "Anteprima preventivo"}</DialogTitle><DialogDescription>{anteprimaParziale ? "Contiene lavorazioni da completare. Il documento definitivo resta bloccato fino alla correzione." : "PDF della bozza, non ancora inviata."}</DialogDescription></DialogHeader>
        {anteprima && <div className="min-h-0 flex-1"><PdfBlobLivePreviewPanel renderBlobUrl={renderAnteprima} depsKey="computo" debounceMs={0} downloadFileName={anteprimaParziale ? "bozza-parziale-computo.pdf" : "preventivo-computo.pdf"} showDownloadOnMobile /></div>}
      </DialogContent>
    </Dialog>
  </section>;
}
