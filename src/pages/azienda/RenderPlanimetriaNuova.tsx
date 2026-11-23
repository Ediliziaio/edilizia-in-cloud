/**
 * Render AI → Planimetrie → «Nuova pianta»:
 * - `?da=disegno`: l'editor vuoto; la pianta si crea al primo salvataggio;
 * - `?da=documento`: si carica un PDF, una foto oppure un DWG nella prova locale;
 * - `?da=testo`: una chat raccoglie le misure e gli appunti;
 * - `?da=sopralluogo`: un rilievo nuovo o una scheda salvata, con misure e schizzo.
 * Tutti i percorsi confluiscono nello stesso editor prima del salvataggio.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, ClipboardList, Crop, FileUp, Loader2, MessageSquareText, PenLine, Ruler, ScanLine, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { EditorConSalvataggio } from "@/components/planimetrie/editor/EditorConSalvataggio";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { leggiMisura } from "@/components/planimetrie/editor/misure";
import {
  confermaScala,
  anteprimaFoglio,
  fotoPerRilievo,
  inBase64,
  leggiRispostaAI,
  misureImmagine,
  paginaPdf,
  preparaImmagine,
  preparaTavolePdf,
  type Rotazione,
  scalaDaConfermare,
  type EsitoAI,
  type IngressoAI,
  type RichiestaAI,
} from "@/components/planimetrie/editor/generazione";
import type { CollegamentiPlanimetria, OrigineVersione } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie, ritornoProgettoValido, type ModoNuovaPianta } from "@/lib/planimetrie/render/percorsi";
import { ACCETTA_DOCUMENTO_PIANTA, eHeic, normalizzaDocumento, notaLetturaPianta, type RitaglioPianta } from "@/lib/planimetrie/documentoImmagine";
import { AttesaLetturaPianta } from "@/components/planimetrie/AttesaLetturaPianta";
import { EsitoLetturaPianta } from "@/components/planimetrie/EsitoLetturaPianta";
import { dwgLocaleDisponibile, eDwg, erroreDwg, leggiTavolaDwg, ricostruisciModelloDwg } from "@/lib/planimetrie/dwgLocale";
import { METRI_PER_UNITA_DWG, UNITA_DWG, validaRichiestaModelloDwg, type RiferimentoDwg, type RichiestaModelloDwg, type RiscontroQuotaDwg } from "@/lib/planimetrie/coordinateDwg";
import { PianiDaDwg } from "@/components/planimetrie/PianiDaDwg";
import { PianiDaPdf, type PianoPdf } from "@/components/planimetrie/PianiDaPdf";
import { ChatAvvioPlanimetria } from "@/components/planimetrie/ChatAvvioPlanimetria";
import { TaccuinoPlanimetria } from "@/components/planimetrie/TaccuinoPlanimetria";
import { SchizzoSopralluogo } from "@/components/planimetrie/SchizzoSopralluogo";
import { SopralluogoSalvatoPlanimetria, type DatiSopralluogoPlanimetria } from "@/components/planimetrie/SopralluogoSalvatoPlanimetria";
import { ambientiDaAppunti, bozzaDaAmbienti, chiaveAmbienteGuida } from "@/lib/planimetrie/avvioGuidato";
import { creaRiconoscitore, dettaturaDisponibile, type Riconoscitore } from "@/lib/planimetrie/dettatura";
import { PERCORSO_TAVOLA_NON_SALVATA } from "@/lib/planimetrie/ricalco";
import { AnalisiTavolaImportata, ImmagineTecnica, SelettoreLivelliTecnici } from "@/components/planimetrie/AnalisiTavolaImportata";
import { immagineVistaTecnica, leggiTavolaTecnica, verificheTavolaTecnica, type LetturaTavolaTecnica } from "@/lib/planimetrie/analisiTavola";
import type { AreaTavola, VistaTavolaTecnica } from "@/lib/planimetrie/tavolaTecnica";
import { nuovaPlanimetria, statoVuoto, type Livello, type Planimetria } from "../../../shared/planimetrie/modello";

const RitaglioDocumentoPianta = lazy(() => import("@/components/planimetrie/RitaglioDocumentoPianta"));
const DocumentoPiantaIngrandito = lazy(() => import("@/components/planimetrie/DocumentoPiantaIngrandito"));

interface DaDove {
  collegamenti?: CollegamentiPlanimetria;
  sopralluogo?: string;
  titolo: string;
  indietro: string;
  percorso: (modo?: ModoNuovaPianta) => string;
}
type Generata = Extract<EsitoAI, { ok: true }> & { ingresso: IngressoAI; titolo: string; sorgente?: { file: Blob; nome: string }; richiesta?: RichiestaAI; letturaId?: string; collegamenti?: CollegamentiPlanimetria };
type ImportazioneEditor = {
  documento: Planimetria;
  titolo: string;
  tavole?: Record<string, File>;
  avvisi: string[];
  modello?: boolean;
  sottotitolo?: string;
  origine?: OrigineVersione;
  collegamenti?: CollegamentiPlanimetria;
  sorgente?: Generata["sorgente"];
};
type PreparazioneTavola = { rotazione: Rotazione; ritaglio: RitaglioPianta | null };
const TAVOLA_INTERA: PreparazioneTavola = { rotazione: 0, ritaglio: null };

function quotaInCentimetri(testo: string): number | null {
  if (!testo.trim()) return null;
  const cm = Math.round(Number(testo.replace(",", ".")) * 100);
  return Number.isSafeInteger(cm) ? cm : null;
}

const ORIGINI = [
  {modo:"documento",titolo:"Importa tavola",icona:FileUp},
  {modo:"disegno",titolo:"Disegna",icona:PenLine},
  {modo:"testo",titolo:"Descrivi a parole",icona:MessageSquareText},
  {modo:"sopralluogo",titolo:"Dal sopralluogo",icona:ClipboardList},
] as const;

const TITOLO_NUOVA = "Nuova planimetria";

async function chiediAllAI(richiesta: RichiestaAI): Promise<EsitoAI> {
  const { data, error } = await supabase.functions.invoke("planimetria-genera", { body: richiesta });
  // Diagnostica locale del collaudo: nessuna immagine, credenziale o dato del cliente.
  if (import.meta.env.DEV && data?.success) console.debug("[planimetria-lettura]", JSON.stringify({
    versione: data.versione_prompt, tentativi: data.tentativi, generazione: data.generazione,
    controlli_documento: data.planimetria?.letturaDocumento,
    livelli: data.planimetria?.livelli?.map((l: { fatto: { locali: unknown[]; aperture: unknown[]; elementi: unknown[]; muri: unknown[] } }) => l.fatto),
  }));
  if (!error) return leggiRispostaAI(data, 200);
  // l'errore della funzione ha il motivo nel corpo della risposta
  const risposta = (error as { context?: Response }).context;
  if (risposta && typeof risposta.json === "function") {
    const corpo: unknown = await risposta.json().catch((): unknown => null);
    return leggiRispostaAI(corpo, risposta.status);
  }
  return leggiRispostaAI(null, null);
}

export default function RenderPlanimetriaNuova() {
  const [params] = useSearchParams();
  const { effectiveCompany } = useAuth();
  const modo=ORIGINI.find(o=>o.modo===params.get("da"))?.modo;
  const companyId = effectiveCompany?.id;
  if (!companyId) return null;
  // Arrivando da un'unità di una commessa generale: la pianta nasce collegata alla sua commessa.
  const commessa = params.get("commessa");
  const sopralluogo = modo === "sopralluogo" ? params.get("sopralluogo") ?? "" : "";
  const indietro = ritornoProgettoValido(params.get("torna")) ?? percorsiPlanimetrie.elenco;
  const titolo = params.get("titolo") ?? "";
  const percorso = (origine?: ModoNuovaPianta) => {
    const query = new URLSearchParams(params);
    if (origine) query.set("da", origine);
    else query.delete("da");
    const base=percorsiPlanimetrie.nuova();
    return `${base}${query.size ? `?${query}` : ""}`;
  };
  const per: DaDove = {
    collegamenti: commessa ? { orderId: commessa } : undefined,
    sopralluogo: /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(sopralluogo) ? sopralluogo : undefined,
    titolo, indietro, percorso,
  };
  return <NuovaPiantaAzienda key={`${companyId}:${modo}:${per.sopralluogo ?? ""}`} companyId={companyId} modo={modo} per={per} />;
}

export function LeggiPlanimetria({ companyId, per, fileIniziale, onSalvata }: {
  companyId: string; per: { titolo: string }; fileIniziale?: File; onSalvata: (id: string) => void;
}) {
  return <NuovaPiantaAzienda companyId={companyId} modo="documento" fileIniziale={fileIniziale}
    per={{ ...per, indietro: percorsiPlanimetrie.elenco, percorso: () => percorsiPlanimetrie.elenco }}
    onSalvata={onSalvata} />;
}

function NuovaPiantaAzienda({ companyId, modo, per, fileIniziale, onSalvata }: {
  companyId: string; modo?: ModoNuovaPianta; per: DaDove; fileIniziale?: File; onSalvata?: (id: string) => void;
}) {
  const [generata, setGenerata] = useState<Generata | null>(null);
  const [importata, setImportata] = useState<ImportazioneEditor | null>(null);

  if (importata) {
    return <EditorConSalvataggio
      companyId={companyId}
      titoloPagina={TITOLO_NUOVA}
      sottotitoloPagina={importata.sottotitolo ?? (importata.modello ? "Editor · Modello dal DWG"
        : importata.documento.livelli.length > 1 ? "Editor · Tavole da ricalcare" : "Editor · Tavola da ricalcare")}
      indietro={onSalvata ? undefined : per.percorso()}
      tornaDopoSalvataggio={per.indietro}
      collegamenti={importata.collegamenti ? { ...importata.collegamenti, ...per.collegamenti } : per.collegamenti}
      titoloProposto={per.titolo || importata.titolo}
      origine={importata.origine ?? "importazione"}
      iniziale={importata.documento}
      tavoleDaRicalcare={importata.tavole}
      sorgenteDocumento={importata.sorgente}
      avvisi={importata.avvisi}
      onSalvata={onSalvata && (esito => onSalvata(esito.id))}
    />;
  }
  if (modo === "disegno") {
    return <EditorConSalvataggio companyId={companyId} titoloPagina={TITOLO_NUOVA} sottotitoloPagina="Editor · Disegno libero"
      indietro={per.percorso()} tornaDopoSalvataggio={per.indietro} collegamenti={per.collegamenti} titoloProposto={per.titolo} />;
  }
  if (generata) return <PiantaGenerata companyId={companyId} generata={generata} onAggiorna={setGenerata} per={per} onSalvata={onSalvata} />;
  if (onSalvata) return <ChiediPianta companyId={companyId} modo="documento" percorsoDisegno={per.percorso("disegno")}
    fileIniziale={fileIniziale} onPronta={setGenerata} onImportata={setImportata} />;
  return <div className="mx-auto max-w-5xl space-y-5 pb-12 sm:space-y-6">
    <TestataPlanimetrie indietro={per.indietro} titolo={TITOLO_NUOVA} sottotitolo="Scegli come partire. La pianta si apre nell’editor prima del salvataggio."/>
    <nav aria-label="Origine della planimetria" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {ORIGINI.map(({modo:valore,titolo,icona:Icona})=>{
        const attiva=modo===valore;
        const descrizione=valore==="documento" ? (dwgLocaleDisponibile() ? "DWG, PDF o foto" : "PDF o foto")
          : valore==="disegno" ? "Parti da un foglio vuoto"
          : valore==="testo" ? "Descrivi le stanze in chat" : "Rilievo, schizzo o scheda salvata";
        return <Link key={valore} to={per.percorso(valore)} aria-current={attiva ? "page" : undefined}
          className={cn("min-w-0 rounded-xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4",
            attiva ? "border-primary bg-primary/[0.07] ring-1 ring-primary/30" : "bg-card hover:border-primary/40 hover:bg-muted/40")}>
          <span className={cn("mb-2.5 grid h-8 w-8 place-items-center rounded-md",attiva ? "bg-primary text-primary-foreground" : "bg-muted text-primary")}>
            <Icona className="h-4 w-4" aria-hidden="true"/>
          </span>
          <span className="block text-sm font-semibold">{titolo}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{descrizione}</span>
        </Link>;
      })}
    </nav>
    {modo && <ChiediPianta companyId={companyId} modo={modo} orderId={per.collegamenti?.orderId} sopralluogo={per.sopralluogo}
      percorsoDisegno={per.percorso("disegno")} onPronta={setGenerata} onImportata={setImportata} />}
  </div>;
}

const MASSIMO_FOTO = 6;

function ChiediPianta({ companyId, modo, orderId, sopralluogo, percorsoDisegno, onPronta, onImportata, fileIniziale }: {
  companyId: string;
  modo: "documento" | "testo" | "sopralluogo";
  orderId?: string | null;
  sopralluogo?: string;
  percorsoDisegno: string;
  fileIniziale?: File;
  onPronta: (g: Generata) => void;
  onImportata: (importazione: ImportazioneEditor) => void;
}) {
  const importaDwg = modo === "documento" && dwgLocaleDisponibile();
  const provaSenzaAI = import.meta.env.DEV && import.meta.env.MODE === "planimetria-locale";
  const [foto, setFoto] = useState<File[]>([]);
  const [dettando, setDettando] = useState(false);
  const riconoscitore = useRef<Riconoscitore | null>(null);
  const puoDettare = dettaturaDisponibile();
  useEffect(() => () => riconoscitore.current?.stop(), []);
  const detta = () => {
    if (dettando) { riconoscitore.current?.stop(); return; }
    const r = creaRiconoscitore();
    if (!r) return;
    r.lang = "it-IT";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const frasi: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) frasi.push(e.results[i][0].transcript.trim());
      if (frasi.length) setTesto((t) => `${t}${t && !/\n$/.test(t) ? "\n" : ""}${frasi.join("\n")}`.slice(0, 6000));
    };
    r.onend = () => setDettando(false);
    r.onerror = (e) => {
      setDettando(false);
      if (e.error === "not-allowed") setErrore("Consenti l’accesso al microfono per dettare.");
      else if (e.error !== "aborted") setErrore("Dettatura interrotta. Riprova o aggiungi le misure a mano.");
    };
    riconoscitore.current = r;
    try {
      r.start();
      setErrore(null);
      setDettando(true);
    } catch {
      setErrore("Impossibile avviare la dettatura. Puoi scrivere le misure a mano.");
    }
  };
  const [tipo, setTipo] = useState<"documento" | "schizzo">("documento");
  const [file, setFile] = useState<File | null>(fileIniziale ?? null);
  const [fonteCad, setFonteCad] = useState<{ originale: File; riferimento: RiferimentoDwg | null } | null>(null);
  const [testo, setTesto] = useState("");
  const [messaggi, setMessaggi] = useState<string[]>([]);
  const [sorgenteRilievo, setSorgenteRilievo] = useState<"nuovo" | "salvato">(sopralluogo ? "salvato" : "nuovo");
  const [datiSopralluogo, setDatiSopralluogo] = useState<DatiSopralluogoPlanimetria | null>(null);
  const [schizzoAperto, setSchizzoAperto] = useState(false);
  const limiteChat = Math.max(0, 2000 - messaggi.join("\n").length - (messaggi.length ? 1 : 0));
  const testoCompleto = [...messaggi, testo.trim()].filter(Boolean).join("\n").slice(0, modo === "testo" ? 2000 : 6000);
  const ambienti = Array.from(new Map([...(datiSopralluogo?.ambienti ?? []), ...ambientiDaAppunti(testoCompleto)]
    .map((a) => [chiaveAmbienteGuida(a), a])).values());
  const collegamentiSopralluogo = datiSopralluogo ? { surveyId: datiSopralluogo.id, orderId: datiSopralluogo.orderId } : undefined;
  const invia = () => {
    const messaggio = testo.trim().slice(0, limiteChat);
    if (!messaggio) return;
    setMessaggi((correnti) => [...correnti, messaggio]);
    setTesto("");
  };
  const [inCorso, setInCorso] = useState(false);
  const [ricalcando, setRicalcando] = useState(false);
  const [modellando, setModellando] = useState(false);
  const [fase, setFase] = useState<"preparazione" | "lettura">("preparazione");
  const [preparandoFile, setPreparandoFile] = useState(false);
  const [nomeOriginale, setNomeOriginale] = useState(fileIniziale?.name ?? "");
  const [convertitoHeic, setConvertitoHeic] = useState(false);
  const daDwg = importaDwg && eDwg({ name: nomeOriginale });
  const [ambito, setAmbito] = useState<"completa" | "ambiente">("completa");
  const [nomeAmbiente, setNomeAmbiente] = useState("");
  const [nota, setNota] = useState("");
  const sceltaFile = useRef(0);
  const conversione = useRef<AbortController | null>(null);
  useEffect(() => () => { sceltaFile.current++; conversione.current?.abort(); }, []);
  const avvioInCorso = useRef(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Ogni pagina conserva ritaglio e orientamento mentre si sfoglia il PDF.
  const [pagina, setPagina] = useState(1);
  const [pagine, setPagine] = useState(1);
  const [preparazioni, setPreparazioni] = useState<Record<number, PreparazioneTavola>>({});
  const { rotazione, ritaglio } = preparazioni[pagina] ?? TAVOLA_INTERA;
  const preparaPagina = (modifica: Partial<PreparazioneTavola>) => {
    setPreparazioni((correnti) => ({ ...correnti, [pagina]: { ...(correnti[pagina] ?? TAVOLA_INTERA), ...modifica } }));
  };
  const [pianiPdf, setPianiPdf] = useState<PianoPdf[]>([]);
  const quotePdf = pianiPdf.map((piano) => quotaInCentimetri(piano.quota));
  const errorePianiPdf = pianiPdf.some((piano) => !piano.nome.trim()) || quotePdf.includes(null)
    ? "Compila nome e quota di ogni piano."
    : new Set(quotePdf).size !== quotePdf.length ? "Assegna quote diverse ai piani." : "";
  const aggiungiPagina = () => setPianiPdf((correnti) => {
    if (correnti.some((piano) => piano.pagina === pagina)) return correnti;
    const numero = correnti.length;
    const occupate = new Set(correnti.map((piano) => quotaInCentimetri(piano.quota)));
    let quota = numero * 300;
    while (occupate.has(quota)) quota += 300;
    const nomeProposto = numero === 0 ? "Piano terra" : numero === 1 ? "Primo piano" : `Piano ${numero}`;
    const nome = correnti.some((piano) => piano.nome === nomeProposto) ? `Pagina ${pagina}` : nomeProposto;
    return [...correnti, { pagina, nome, quota: String(quota / 100) }];
  });
  const modificaPianoPdf = (paginaDaCambiare: number, campi: Partial<Pick<PianoPdf, "nome" | "quota">>) => {
    setPianiPdf((correnti) => correnti.map((piano) => piano.pagina === paginaDaCambiare ? { ...piano, ...campi } : piano));
  };
  const [ritagliando, setRitagliando] = useState<Blob | null>(null);
  const [ingrandita, setIngrandita] = useState(false);
  const [vista, setVista] = useState<{ file: File; pagina: number; rotazione: Rotazione; ritaglio: RitaglioPianta | null; url: string | null; raster: Blob | null } | null>(null);
  const vistaAttuale = vista?.file === file && vista?.pagina === pagina && vista?.rotazione === rotazione && vista?.ritaglio === ritaglio;
  const anteprima = vistaAttuale ? vista?.url ?? null : null;
  const rasterAnteprima = vistaAttuale ? vista?.raster ?? null : null;
  const anteprimaInCorso = !!file && !vistaAttuale;
  useSettingsDraftGuard(!!file || !!testoCompleto || foto.length > 0);
  const [letturaTecnica, setLetturaTecnica] = useState<{ raster: Blob; valore: LetturaTavolaTecnica } | null>(null);
  const [ritaglioTecnico, setRitaglioTecnico] = useState<{ file: File; pagina: number; ritaglio: RitaglioPianta; lettura: NonNullable<typeof letturaTecnica> } | null>(null);
  const [analisiInCorso, setAnalisiInCorso] = useState(false);
  const [erroreAnalisi, setErroreAnalisi] = useState("");
  const controllerAnalisi = useRef<AbortController | null>(null);
  const [livelloTecnico, setLivelloTecnico] = useState<VistaTavolaTecnica | "originale">("originale");
  const [evidenzaTecnica, setEvidenzaTecnica] = useState<AreaTavola | null>(null);
  const [originaleAperto, setOriginaleAperto] = useState<{ raster: Blob; url: string } | null>(null);
  const pannelloAnteprima = useRef<HTMLElement>(null);
  const letturaCorrente = rasterAnteprima && letturaTecnica?.raster === rasterAnteprima ? letturaTecnica : null;
  const ritaglioApplicato = ritaglioTecnico && ritaglioTecnico.ritaglio === ritaglio && ritaglioTecnico.file === file
    && ritaglioTecnico.pagina === pagina && rotazione === 0 ? ritaglioTecnico : null;
  const analisiTavola = (letturaCorrente ?? ritaglioApplicato?.lettura)?.valore;
  const [vistaTecnica, setVistaTecnica] = useState<{ lettura: LetturaTavolaTecnica; livello: VistaTavolaTecnica; url: string } | null>(null);
  const srcTecnica = vistaTecnica?.lettura === analisiTavola && vistaTecnica?.livello === livelloTecnico ? vistaTecnica.url : null;
  const zonaRitaglio = !ritaglio && rotazione === 0 && analisiTavola?.tavola.tipo === "composita" ? analisiTavola.tavola.area : null;
  const rasterOriginale = ritaglioApplicato?.lettura.raster;
  const urlRitaglioOriginale = originaleAperto?.raster === rasterOriginale ? originaleAperto?.url : undefined;

  useEffect(() => {
    let vivo = true;
    let url: string | null = null;
    if (!file) return;
    anteprimaFoglio(file, pagina, rotazione, ritaglio, { squadra: modo !== "documento" || daDwg }).then((r) => {
      if (!vivo) return;
      url = URL.createObjectURL(r.file);
      setVista({ file, pagina, rotazione, ritaglio, url, raster: r.file });
      setPagine(r.pagine);
      setErrore(null);
      setAnalisiInCorso(false);
      setErroreAnalisi("");
      setLivelloTecnico("originale");
      setEvidenzaTecnica(null);
      setVistaTecnica(null);
    }).catch((e: unknown) => { if (vivo) { setVista({ file, pagina, rotazione, ritaglio, url: null, raster: null }); setErrore(e instanceof Error ? e.message : "Non riesco a preparare l’anteprima."); } });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [file, pagina, rotazione, ritaglio, modo, daDwg]);

  useEffect(() => () => { controllerAnalisi.current?.abort(); controllerAnalisi.current = null; }, [rasterAnteprima]);

  useEffect(() => {
    if (!analisiTavola || livelloTecnico === "originale") return;
    let vivo = true;
    let url: string | undefined;
    void immagineVistaTecnica(analisiTavola, livelloTecnico).then((blob) => {
      if (!vivo || !blob) return;
      url = URL.createObjectURL(blob);
      setVistaTecnica({ lettura: analisiTavola, livello: livelloTecnico, url });
    }).catch(() => { if (vivo) { setLivelloTecnico("originale"); setErroreAnalisi("Non riesco a visualizzare il livello selezionato."); } });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [analisiTavola, livelloTecnico]);

  useEffect(() => () => { if (originaleAperto) URL.revokeObjectURL(originaleAperto.url); }, [originaleAperto]);

  const analizzaTavola = async () => {
    if (!rasterAnteprima || controllerAnalisi.current) return;
    const controller = new AbortController();
    controllerAnalisi.current = controller;
    setAnalisiInCorso(true);
    setErroreAnalisi("");
    try {
      const valore = await leggiTavolaTecnica(rasterAnteprima, controller.signal, { quoteVerticali: !ritaglio && rotazione === 0 });
      if (!controller.signal.aborted) setLetturaTecnica({ raster: rasterAnteprima, valore });
    } catch (e) {
      if (!controller.signal.aborted) setErroreAnalisi(e instanceof Error ? e.message : "Non riesco ad analizzare la tavola.");
    } finally {
      if (controllerAnalisi.current === controller) { controllerAnalisi.current = null; setAnalisiInCorso(false); }
    }
  };

  const usaRitaglioTecnico = (area: AreaTavola) => {
    if (!file || !letturaCorrente || ritaglio || rotazione !== 0) return;
    const selezione = { x: area.x * 100, y: area.y * 100, width: area.larghezza * 100, height: area.altezza * 100 };
    setRitaglioTecnico({ file, pagina, ritaglio: selezione, lettura: letturaCorrente });
    preparaPagina({ ritaglio: selezione });
  };

  const mostraEvidenzaTecnica = (zona: AreaTavola | null) => {
    setLivelloTecnico("originale");
    setEvidenzaTecnica(zona);
    if (zona) pannelloAnteprima.current?.scrollIntoView({ block: "nearest" });
  };

  const selezionaLivelloTecnico = (livello: VistaTavolaTecnica | "originale") => {
    setEvidenzaTecnica(null);
    if (livello === livelloTecnico) return;
    setVistaTecnica(null);
    setLivelloTecnico(livello);
  };

  const scegliFile = async (f: File | null) => {
    const numero = ++sceltaFile.current;
    conversione.current?.abort();
    conversione.current = null;
    const cad = !!f && modo === "documento" && eDwg(f);
    const erroreFile = f && cad ? erroreDwg(f) : null;
    setErrore(erroreFile);
    setFile(null); setFonteCad(null); setConvertitoHeic(false); setNomeOriginale(f?.name ?? "");
    setLetturaTecnica(null); setRitaglioTecnico(null); setOriginaleAperto(null);
    setPreparazioni({});
    setPianiPdf([]);
    setPagina(1);
    setPagine(1);
    if (!f || erroreFile) { setPreparandoFile(false); return; }
    if (cad) setTipo("documento");
    setPreparandoFile(true);
    const controller = new AbortController();
    conversione.current = controller;
    try {
      const pronta = cad ? await leggiTavolaDwg(f, controller.signal) : { file: await normalizzaDocumento(f), riferimento: null };
      if (numero !== sceltaFile.current) return;
      setFile(pronta.file);
      if (cad) setFonteCad({ originale: f, riferimento: pronta.riferimento });
      setConvertitoHeic(eHeic(f));
    } catch (e) {
      if (numero === sceltaFile.current) setErrore(e instanceof Error ? e.message : "Non riesco a leggere il file.");
    } finally { if (numero === sceltaFile.current) setPreparandoFile(false); }
  };

  const scegliFoto = async (files: File[]) => {
    setErrore(null); setPreparandoFile(true);
    try {
      const pronte: File[] = [];
      // Una foto alla volta: evita sei decodifiche HEIC da 24 MP in parallelo sul telefono.
      for (const f of files.slice(0, MASSIMO_FOTO - foto.length)) pronte.push(await normalizzaDocumento(f));
      setFoto((v) => [...v, ...pronte].slice(0, MASSIMO_FOTO));
    } catch (e) { setErrore(e instanceof Error ? e.message : "Una delle foto non si legge."); }
    finally { setPreparandoFile(false); }
  };

  const apriRitaglio = async () => {
    if (!file || preparandoFile) return;
    if (file.type !== "application/pdf") { setRitagliando(file); return; }
    const numero = sceltaFile.current;
    setErrore(null);
    setPreparandoFile(true);
    try {
      const {canvas}=await paginaPdf(file,pagina);
      const foglio=await preparaImmagine(file,0,canvas,null,{squadra:false});
      if (!foglio) throw new Error();
      if (numero===sceltaFile.current) setRitagliando(foglio.file);
    } catch {
      if (numero===sceltaFile.current) setErrore("La pagina del PDF non si è preparata per il ritaglio.");
    } finally {
      if (numero===sceltaFile.current) setPreparandoFile(false);
    }
  };
  const cambiaPagina = (delta: number) => setPagina((corrente) => Math.min(pagine, Math.max(1, corrente + delta)));

  const apriBozzaGuidata = (dati?: DatiSopralluogoPlanimetria) => {
    const ingresso = modo === "sopralluogo" ? "sopralluogo" : "testo";
    const scheda = dati ?? datiSopralluogo;
    const misure = dati?.ambienti ?? ambienti;
    const appunti = dati?.appunti ?? testoCompleto;
    if (!misure.length && !appunti) return;
    try {
      const documento = misure.length ? bozzaDaAmbienti(misure, ingresso, appunti) : nuovaPlanimetria();
      if (!misure.length) documento.riferimenti = { note: appunti };
      riconoscitore.current?.stop();
      onImportata({
        documento,
        titolo: scheda?.titolo ?? (ingresso === "sopralluogo" ? "Pianta dal sopralluogo" : "Pianta da descrizione"),
        sottotitolo: ingresso === "sopralluogo" ? "Editor · Dal sopralluogo" : "Editor · Da una descrizione",
        origine: ingresso === "sopralluogo" ? "sopralluogo" : "manuale",
        collegamenti: scheda ? { surveyId: scheda.id, orderId: scheda.orderId } : undefined,
        avvisi: misure.length ? ["Completa la disposizione delle stanze e aggiungi porte e finestre nell’editor."] : ["Gli appunti sono disponibili nella pianta. Puoi iniziare il disegno dall’editor."],
      });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non riesco a preparare la bozza.");
    }
  };

  const riprendiSopralluogo = (dati: DatiSopralluogoPlanimetria) => {
    setTesto((attuale) => {
      const appunti = dati.appunti.trim();
      if (!appunti || attuale.includes(appunti)) return attuale;
      return [attuale.trim(), appunti].filter(Boolean).join("\n").slice(0, 6000);
    });
    setSorgenteRilievo("nuovo");
    setDatiSopralluogo(dati);
    setErrore(null);
  };

  const avvia = async () => {
    if (avvioInCorso.current || provaSenzaAI) return;
    avvioInCorso.current = true;
    setInCorso(true);
    setFase("preparazione");
    try {
      setErrore(null);
      riconoscitore.current?.stop();
      const misureDellaScheda = datiSopralluogo?.ambienti.map((a) => [
        a.piano ? `${a.piano}\n${a.nome}` : a.nome,
        a.larghezzaM && a.profonditaM ? `${a.larghezzaM} × ${a.profonditaM} m` : `${a.superficieMq} m²`,
        a.altezzaM ? `altezza ${a.altezzaM} m` : "",
      ].filter(Boolean).join(" ")).join("\n");
      const appunti = [misureDellaScheda, testoCompleto].filter(Boolean).join("\n").slice(0, 6000);
      const ingresso: IngressoAI = modo === "testo" ? "descrizione" : modo === "sopralluogo" ? (appunti ? "rilievo" : "schizzo") : tipo;
      const richiesta: RichiestaAI = { company_id: companyId, ingresso };
      if (modo === "documento" || ingresso === "schizzo") richiesta.nota = notaLetturaPianta(ambito, nomeAmbiente, nota, ingresso === "schizzo");
      let sorgente: Generata["sorgente"];
      if (ingresso === "descrizione" || ingresso === "rilievo") {
        richiesta.testo = appunti;
      }
      if (ingresso === "rilievo" && foto.length) {
        try {
          richiesta.foto_base64 = [];
          for (const f of foto.slice(0, MASSIMO_FOTO)) richiesta.foto_base64.push(await fotoPerRilievo(f));
        } catch {
          setErrore("Una delle foto non si legge: toglila e riprova.");
          return;
        }
      }
      if (modo !== "testo" && file) {
        // Foto enormi e schermate CAD a sfondo nero: ridotte e portate a fondo bianco; il foglio
        // raddrizzato come l'ha girato l'utente e reso quadrato con margini bianchi (l'AI sbaglia la scala
        // sui fogli larghi o alti). Anche i PDF si disegnano e si squadrano; se non si riesce parte il PDF così com'è.
        const pdf = file.type === "application/pdf";
        const pronta = pdf
          ? await paginaPdf(file, pagina).then((r) => preparaImmagine(file, rotazione, r.canvas, ritaglio))
          : await preparaImmagine(file, rotazione, undefined, ritaglio);
        if (!pronta) throw new Error("Il documento non è leggibile.");
        richiesta.mime = pronta.mime;
        richiesta.file_base64 = await inBase64(pronta.file);
        sorgente = { file: pronta.file, nome: daDwg ? file.name : nomeOriginale || file.name };
        richiesta.larghezza = pronta.larghezza;
        richiesta.altezza = pronta.altezza;
      }
      setFase("lettura");
      const esito = await chiediAllAI(richiesta).catch(() => leggiRispostaAI(null, null));
      if (esito.ok === false) {
        setErrore(esito.messaggio);
        return;
      }
      const titolo = esito.planimetria.titolo ?? (modo === "sopralluogo" ? datiSopralluogo?.titolo ?? "Pianta dal sopralluogo" : ambito === "ambiente" && nomeAmbiente.trim() ? nomeAmbiente.trim() : file ? (nomeOriginale || file.name).replace(/\.[^.]+$/, "") : "Pianta da descrizione");
      // Il PDF viene rasterizzato per la lettura, ma l'origine resta il file scelto.
      const origine = modo === "sopralluogo" ? "sopralluogo" : daDwg ? "importazione" : ingresso === "documento" && file?.type === "application/pdf" ? "ai_pdf" : esito.origine;
      onPronta({ ...esito, planimetria: { ...esito.planimetria, ...(modo === "documento" ? { ambitoDocumento: ambito === "ambiente" ? "ambiente" as const : "alloggio" as const } : {}) }, origine, ingresso, titolo, sorgente, richiesta, letturaId: crypto.randomUUID(), collegamenti: collegamentiSopralluogo });
    } catch {
      setErrore("Non riesco a preparare il documento: controlla il file e riprova.");
    } finally {
      avvioInCorso.current = false;
      setInCorso(false);
    }
  };

  const titoloImportazione = nomeOriginale.replace(/\.[^.]+$/, "").slice(0, 200) || "Nuova planimetria";

  const apriRicalco = async () => {
    if (!file || avvioInCorso.current || errorePianiPdf) return;
    const numero = sceltaFile.current;
    const controller = new AbortController();
    conversione.current = controller;
    avvioInCorso.current = true;
    setRicalcando(true);
    setErrore(null);
    try {
      const documento = nuovaPlanimetria();
      const [pianoVuoto] = documento.livelli;
      const daPdf = file.type === "application/pdf";
      const assegnate = daPdf && pianiPdf.length > 0;
      const selezione = assegnate ? pianiPdf.map((piano, indice) => ({
        pagina: piano.pagina, id: `pdf-${piano.pagina}`, nome: piano.nome.trim(), quota: quotePdf[indice]!,
      })) : [{ pagina, id: pianoVuoto.id, nome: pianoVuoto.nome, quota: pianoVuoto.quota }];
      const fogli = assegnate
        ? await preparaTavolePdf(file, selezione.map((piano) => ({ pagina: piano.pagina, ...(preparazioni[piano.pagina] ?? TAVOLA_INTERA) })), controller.signal)
        : [await preparaImmagine(file, rotazione, daPdf ? (await paginaPdf(file, pagina)).canvas : undefined, ritaglio, { squadra: false })];
      if (numero !== sceltaFile.current || controller.signal.aborted) return;

      const tavole: Record<string, File> = {};
      documento.livelli = selezione.map<Livello>((piano, indice) => {
        const foglio = fogli[indice];
        if (!foglio || !foglio.altezza || !foglio.larghezza) throw new Error("Non riesco a preparare il ritaglio. Prova un’altra selezione.");
        const percorso = assegnate ? `${PERCORSO_TAVOLA_NON_SALVATA}-${piano.id}` : PERCORSO_TAVOLA_NON_SALVATA;
        const nomeFile = daPdf ? `${titoloImportazione} - pagina ${piano.pagina}.png`
          : foglio.mime === file.type ? file.name : file.name.replace(/\.[^.]+$/, "") + ".png";
        tavole[percorso] = new File([foglio.file], nomeFile, { type: foglio.mime });
        return {
          id: piano.id, nome: piano.nome, quota: piano.quota, fatto: statoVuoto(), proposte: [],
          ricalco: { percorso, x: 0, y: 0, larghezzaCm: 1000, proporzione: foglio.altezza / foglio.larghezza, opacita: 0.8, calibrata: false },
        };
      }).sort((a, b) => a.quota - b.quota);
      const daRilievo = modo === "sopralluogo";
      if (daRilievo && testoCompleto) documento.riferimenti = { note: testoCompleto };
      if (!assegnate && modo === "documento" && analisiTavola) {
        documento.letturaDocumento = verificheTavolaTecnica(analisiTavola.tavola, !!ritaglioApplicato);
      }
      const sorgente = documento.letturaDocumento && (rasterOriginale ?? rasterAnteprima);
      onImportata({
        documento, titolo: datiSopralluogo?.titolo ?? titoloImportazione, tavole,
        sottotitolo: daRilievo ? "Editor · Schizzo del sopralluogo" : undefined,
        origine: daRilievo ? "sopralluogo" : undefined,
        collegamenti: collegamentiSopralluogo,
        sorgente: sorgente ? { file: sorgente, nome: nomeOriginale || file.name } : undefined,
        avvisi: [],
      });
    } catch (error) {
      if (numero === sceltaFile.current && !controller.signal.aborted) {
        setErrore(error instanceof Error ? error.message : "Non riesco a preparare la tavola per l’editor.");
      }
    } finally {
      avvioInCorso.current = false;
      if (numero === sceltaFile.current) setRicalcando(false);
    }
  };

  const ricavaDalCad = async (richiesta: RichiestaModelloDwg, ritagli: RitaglioPianta[], quoteConfermate: RiscontroQuotaDwg[]) => {
    if (!fonteCad || !file || avvioInCorso.current) return;
    const numero = sceltaFile.current;
    avvioInCorso.current = true;
    const controller = new AbortController();
    conversione.current = controller;
    setModellando(true);
    setErrore(null);
    try {
      const { documento, piani } = await ricostruisciModelloDwg(
        fonteCad.originale, validaRichiestaModelloDwg({ ...richiesta, controlloGeometria: true }), controller.signal,
      );
      const tavole: Record<string, File> = {};
      for (const [i, piano] of documento.livelli.entries()) {
        const foglio = await preparaImmagine(file, 0, undefined, ritagli[i], { squadra: false });
        if (!foglio) throw new Error("Il modello è stato letto, ma il ritaglio della tavola non si è preparato. Riprova.");
        const percorso = `${PERCORSO_TAVOLA_NON_SALVATA}-${piano.id}`;
        const posizione = piani[i];
        piano.ricalco = {
          percorso, x: posizione.origine[0], y: posizione.origine[1], larghezzaCm: posizione.larghezza,
          proporzione: posizione.altezza / posizione.larghezza, opacita: 0.3, calibrata: true, bloccata: true,
        };
        if (!quoteConfermate.length) piano.riscontroScala = { stato: "da_verificare" };
        tavole[percorso] = new File([foglio.file], file.name, { type: foglio.mime });
      }
      if (numero !== sceltaFile.current || controller.signal.aborted) return;
      documento.riferimenti = { note: `Ricostruito da ${nomeOriginale.slice(0, 160)}. Confrontare la geometria con le tavole originali.` };
      const muri = documento.livelli.reduce((totale, p) => totale + p.fatto.muri.length, 0);
      const vani = documento.livelli.reduce((totale, p) => totale + p.fatto.aperture.length, 0);
      const scale = documento.livelli.reduce((totale, p) => totale + p.fatto.elementi.filter((e) => e.alzateCad).length, 0);
      const avvisi = [
        [documento.livelli.length === 1 ? "1 piano" : `${documento.livelli.length} piani`, `${muri} tratti di muro`, `${vani} aperture`, ...(scale ? [scale === 1 ? "1 scala" : `${scale} scale`] : [])].join(" · "),
        "Confronta il modello con la tavola e controlla contorni e altezze.",
      ];
      if (documento.livelli.some(p => p.controlloDwg?.length)) {
        avvisi.push("Dopo aver salvato, apri Verifica tavola per esaminare i riscontri DWG e applicare le rettifiche ai contorni.");
      }
      const formatoQuota = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 });
      const scartoMassimo = Math.max(0, ...quoteConfermate.map(({ quota, metri }) =>
        Math.abs(quota.lunghezza * METRI_PER_UNITA_DWG[richiesta.unita] - metri) * 100));
      const unitaDichiarata = fonteCad.riferimento?.unita;
      const differenzaUnita = unitaDichiarata && unitaDichiarata !== richiesta.unita
        ? ` Il file dichiarava ${UNITA_DWG[unitaDichiarata].toLowerCase()}.` : "";
      const quoteRiscontrate = quoteConfermate.map(q => formatoQuota.format(q.metri) + " m").join(" e ");
      const scarto = scartoMassimo < 0.1 ? "inferiore a 1 mm" : formatoQuota.format(Math.round(scartoMassimo * 10) / 10) + " cm";
      const scala = quoteConfermate.length
        ? `Scala DWG riscontrata su ${quoteRiscontrate} · ${UNITA_DWG[richiesta.unita]} · scarto massimo ${scarto}.${differenzaUnita}`
        : "Scala del DWG da riscontrare. Le quantità metriche restano sospese nel computo.";
      avvisi.push(scala);
      documento.riferimenti.note += " " + scala;
      if (piani.some((p) => p.allineamento === "ritaglio")) {
        avvisi.push("Per i piani senza assi comuni è stato usato l’angolo del ritaglio. Verifica la sovrapposizione nel 3D.");
      }
      if (piani.some((p) => p.allineamento === "pareti")) {
        const messaggio = "I piani sono stati sovrapposti usando le pareti che coincidono nelle due tavole. Riscontra l’allineamento sul vano scala o su un altro riferimento comune.";
        avvisi.push(messaggio);
        documento.riferimenti.note += " " + messaggio;
      }
      const contorniDaVerificare = piani.reduce((tot, piano) => tot + (piano.contorniDaVerificare ?? 0), 0);
      if (contorniDaVerificare > 0) {
        const trovati = contorniDaVerificare === 1 ? "Un contorno di locale stimato" : `${contorniDaVerificare} contorni di locali stimati`;
        const messaggio = `${trovati}. Confronta il DWG originale per verificare destinazioni, aperture e locali mancanti prima di usare le superfici nel computo.`;
        avvisi.push(messaggio);
        documento.riferimenti.note += " " + messaggio;
      }
      if (piani.some(piano => (piano.scaleDaVerificare ?? 0) > 0)) {
        const messaggio = "Le scale individuate in tavola da misurare sono segnate sulla pianta. Controlla quote e verso di salita sulle sezioni.";
        avvisi.push(messaggio);
        documento.riferimenti.note += " " + messaggio;
      }
      onImportata({ documento, tavole, titolo: titoloImportazione, avvisi, modello: true });
    } catch (error) {
      if (numero === sceltaFile.current && !controller.signal.aborted) setErrore(error instanceof Error ? error.message : "Ricostruzione CAD non riuscita.");
    } finally {
      avvioInCorso.current = false;
      if (numero === sceltaFile.current) setModellando(false);
    }
  };

  const pronto = !preparandoFile && !anteprimaInCorso && (modo === "documento" ? !!file && !!anteprima : testoCompleto.length >= 10 || (modo === "sopralluogo" && !!anteprima));
  const occupato = inCorso || ricalcando || modellando || preparandoFile;
  const puoRicalcare = pianiPdf.length ? !!file && !errorePianiPdf && !anteprimaInCorso : pronto;
  const letturaAi = <Button type="button" variant={daDwg || provaSenzaAI || modo !== "documento" ? "outline" : "default"}
    className={modo === "documento" ? "w-full" : undefined} disabled={provaSenzaAI || !pronto || occupato} onClick={avvia}>
    {inCorso ? <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" /> : modo === "sopralluogo" ? <ClipboardList className="mr-2 h-4 w-4" /> : <Wand2 className="mr-2 h-4 w-4" />}
    {inCorso ? "Lettura in corso…" : daDwg && !provaSenzaAI ? "Ricava la pianta con AI · 1 credito" : "Ricava la pianta"}
  </Button>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className={cn("space-y-5 p-4 sm:p-6", modo !== "documento" && "pb-0 sm:pb-0")}>
          <fieldset disabled={occupato} aria-busy={occupato} className="min-w-0 space-y-5">
          {modo === "sopralluogo" ? (
            <>
              <div role="group" aria-label="Origine del sopralluogo" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
                <Button type="button" size="sm" variant="ghost" aria-pressed={sorgenteRilievo === "nuovo"}
                  className="gap-2 aria-pressed:bg-background aria-pressed:shadow-sm" onClick={() => { setSorgenteRilievo("nuovo"); setErrore(null); }}>
                  <PenLine className="h-4 w-4" /> Nuovo rilievo
                </Button>
                <Button type="button" size="sm" variant="ghost" aria-pressed={sorgenteRilievo === "salvato"}
                  className="gap-2 aria-pressed:bg-background aria-pressed:shadow-sm" onClick={() => { riconoscitore.current?.stop(); setSorgenteRilievo("salvato"); setErrore(null); }}>
                  <ClipboardList className="h-4 w-4" /> Sopralluogo salvato
                </Button>
              </div>
              {sorgenteRilievo === "salvato" ? <SopralluogoSalvatoPlanimetria companyId={companyId} orderId={orderId} iniziale={datiSopralluogo?.id ?? sopralluogo}
                onApri={async (dati, schizzo) => {
                  if (schizzo) {
                    riprendiSopralluogo(dati);
                    await scegliFile(schizzo);
                  } else {
                    apriBozzaGuidata(dati);
                  }
                }} onAppunti={riprendiSopralluogo} />
                : <>
                  {datiSopralluogo && <p className="flex items-center gap-2 rounded-lg border bg-muted/25 p-3 text-sm"><ClipboardList className="h-4 w-4 shrink-0 text-primary" />{datiSopralluogo.titolo}</p>}
                  <TaccuinoPlanimetria testo={testo} ambienti={ambienti} foto={foto} puoDettare={puoDettare} dettando={dettando}
                    anteprima={anteprima} nomeFile={nomeOriginale} pagina={pagina} pagine={pagine} onTesto={setTesto} onDetta={detta}
                    onFoto={(files) => { void scegliFoto(files); }} onTogliFoto={(i) => setFoto((correnti) => correnti.filter((_, k) => k !== i))}
                    onFile={(f) => { void scegliFile(f); }} onDisegna={() => setSchizzoAperto(true)} onTogliSchizzo={() => { void scegliFile(null); }}
                    onIngrandisci={() => setIngrandita(true)} onPagina={cambiaPagina} />
                </>}
            </>
          ) : modo === "documento" ? (
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.53fr)]">
              <div className="min-w-0 space-y-3">
                <div className="space-y-3 rounded-xl border border-dashed border-primary/30 bg-primary/[0.035] p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileUp className="h-5 w-5" aria-hidden="true" /></span>
                    <div>
                      <Label htmlFor="file-pianta" className="text-sm font-semibold">{importaDwg ? "DWG, PDF o foto della pianta" : "PDF o foto della pianta"}</Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">{importaDwg ? "DWG fino a 64 MB · PDF e foto fino a 10 MB" : "PDF, JPG, PNG, WebP, HEIC e HEIF fino a 10 MB"}</p>
                    </div>
                  </div>
                  <Input id="file-pianta" type="file" className="bg-card" accept={importaDwg ? `.dwg,${ACCETTA_DOCUMENTO_PIANTA}` : ACCETTA_DOCUMENTO_PIANTA} onClick={(e) => { e.currentTarget.value = ""; }} onChange={(e) => { void scegliFile(e.target.files?.[0] ?? null); }} />
                </div>
                {file && anteprima && (
                  <section ref={pannelloAnteprima} aria-label="Anteprima della tavola" className="space-y-3 rounded-xl border bg-muted/20 p-3 motion-safe:animate-in motion-safe:fade-in-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 break-all text-xs font-medium"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />{nomeOriginale}{convertitoHeic && <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-emerald-700">HEIC convertito</span>}</p>
                      {pagine > 1 && (
                        <div className="flex shrink-0 items-center gap-1 rounded-md border bg-card text-xs">
                          <Button type="button" size="sm" variant="ghost" aria-label="Pagina precedente" disabled={pagina <= 1} onClick={() => cambiaPagina(-1)}>‹</Button>
                          <span>Pagina {pagina} di {pagine}</span>
                          <Button type="button" size="sm" variant="ghost" aria-label="Pagina successiva" disabled={pagina >= pagine} onClick={() => cambiaPagina(1)}>›</Button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Button type="button" size="sm" variant="outline" aria-label="Ruota a sinistra" onClick={() => preparaPagina({ rotazione: ((rotazione + 270) % 360) as Rotazione })}>Ruota ↺</Button>
                      <Button type="button" size="sm" variant="outline" aria-label="Ruota a destra" onClick={() => preparaPagina({ rotazione: ((rotazione + 90) % 360) as Rotazione })}>Ruota ↻</Button>
                      <Button type="button" size="sm" variant="outline" onClick={()=>void apriRitaglio()}><Crop className="mr-1.5 h-3.5 w-3.5" />{ritaglio ? "Modifica ritaglio" : daDwg ? "Ritaglia una pianta" : "Ritaglia foglio"}</Button>
                      {ritaglio && <Button type="button" size="sm" variant="ghost" onClick={() => preparaPagina({ ritaglio: null })}>Togli ritaglio</Button>}
                      {!daDwg && !analisiTavola && <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={analisiInCorso}
                        onClick={() => { void analizzaTavola(); }}>
                        {analisiInCorso ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />}
                        {analisiInCorso ? "Analisi in corso…" : "Analizza tavola"}
                      </Button>}
                    </div>
                    {erroreAnalisi && <p role="alert" className="text-xs text-destructive">{erroreAnalisi}</p>}
                    {analisiTavola?.tavola.tipo === "hvac" && analisiTavola.tavola.colori && <SelettoreLivelliTecnici
                      vista={livelloTecnico} legendaLetta={!!analisiTavola.tavola.codiceMandata}
                      onVista={selezionaLivelloTecnico} />}
                    <button type="button" aria-label="Ingrandisci il foglio" onClick={() => setIngrandita(true)} className="grid h-[clamp(16rem,36vh,28rem)] w-full cursor-zoom-in place-items-center overflow-hidden rounded-lg bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {analisiTavola && (evidenzaTecnica || zonaRitaglio) ? <ImmagineTecnica src={anteprima}
                        larghezza={analisiTavola.tavola.raster.larghezza} altezza={analisiTavola.tavola.raster.altezza}
                        zona={(evidenzaTecnica ?? zonaRitaglio)!} ritaglio={!!zonaRitaglio} />
                        : <img src={srcTecnica ?? anteprima} alt="Anteprima del foglio" className="h-full min-h-0 w-full object-contain" />}
                    </button>
                    <p className="text-xs text-muted-foreground">{daDwg
                      ? "Tieni visibili la pianta e le sue quote. Se ci sono più piani, ritagliali uno alla volta."
                      : livelloTecnico === "pianta" && srcTecnica ? "Le zone coperte dai canali vanno confrontate con la tavola architettonica."
                        : "Tieni visibili il disegno e le sue quote."}</p>
                  </section>
                )}
              </div>
              <aside aria-label="Azioni di importazione" className="min-w-0 space-y-3">
                {analisiTavola && <AnalisiTavolaImportata lettura={analisiTavola} ritaglioApplicato={!!ritaglioApplicato}
                  puoRitagliare={!!zonaRitaglio} evidenza={evidenzaTecnica} onEvidenza={mostraEvidenzaTecnica} onRitaglia={usaRitaglioTecnico}
                  onOriginale={() => { if (rasterOriginale) setOriginaleAperto({ raster: rasterOriginale, url: URL.createObjectURL(rasterOriginale) }); }} />}
                {fonteCad?.riferimento && (
                  <PianiDaDwg riferimento={fonteCad.riferimento} ritaglio={ritaglio} occupato={modellando} onAggiunto={() => preparaPagina({ ritaglio: null })}
                    onRicostruisci={(richiesta, tagli, quote) => { void ricavaDalCad(richiesta, tagli, quote); }} />
                )}
                <section className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <h2 className="text-sm font-semibold">Ricalco manuale</h2>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Usa la tavola come sfondo. Imposta la scala e disegna muri e ambienti.</p>
                    </div>
                  </div>
                  {file?.type === "application/pdf" && pagine > 1 && (
                    <PianiDaPdf piani={pianiPdf} pagina={pagina} pronto={pronto} errore={errorePianiPdf} onAggiungi={aggiungiPagina}
                      onMostra={setPagina} onModifica={modificaPianoPdf}
                      onRimuovi={(paginaDaTogliere) => setPianiPdf((correnti) => correnti.filter((piano) => piano.pagina !== paginaDaTogliere))} />
                  )}
                  <Button type="button" variant={daDwg || provaSenzaAI || pianiPdf.length ? "default" : "outline"} className="w-full gap-2"
                    disabled={!puoRicalcare || occupato} onClick={apriRicalco}>
                    {pianiPdf.length > 1 ? `Apri ${pianiPdf.length} piani nell’editor` : pianiPdf.length ? "Apri il piano nell’editor" : "Ricalca nell’editor"}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </section>
                <section className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <h2 className="text-sm font-semibold">Lettura automatica</h2>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {provaSenzaAI ? "Lettura AI disattivata in questa prova locale."
                          : pagine > 1 ? "Ricava una bozza dalla pagina visibile. La lettura usa 1 credito AI."
                          : "Ricava una bozza da controllare nell’editor. La lettura usa 1 credito AI."}
                      </p>
                    </div>
                  </div>
                  {!provaSenzaAI && <details className="rounded-lg border bg-muted/30 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium">Opzioni di lettura</summary>
                    <div className="mt-3 space-y-3">
                      {!daDwg && <div className="space-y-1.5">
                        <Label htmlFor="tipo-tavola">Che cosa carichi?</Label>
                        <Select value={tipo} onValueChange={(valore: "documento" | "schizzo") => setTipo(valore)}>
                          <SelectTrigger id="tipo-tavola"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="documento">Disegno in scala</SelectItem><SelectItem value="schizzo">Schizzo con misure</SelectItem></SelectContent>
                        </Select>
                      </div>}
                      <div className="space-y-1.5"><Label htmlFor="ambito-pianta">Cosa rappresenta?</Label><Select value={ambito} onValueChange={(v) => setAmbito(v as "completa" | "ambiente")}><SelectTrigger id="ambito-pianta"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="completa">Pianta completa</SelectItem><SelectItem value="ambiente">Un solo ambiente</SelectItem></SelectContent></Select></div>
                      {ambito === "ambiente" && <div className="space-y-1.5"><Label htmlFor="nome-ambiente-pianta">Quale ambiente?</Label><Input id="nome-ambiente-pianta" value={nomeAmbiente} maxLength={60} placeholder="Es. Bagno" onChange={(e) => setNomeAmbiente(e.target.value)} /></div>}
                      <div className="space-y-1.5"><Label htmlFor="nota-lettura-pianta">Indicazioni per l’AI</Label><Textarea id="nota-lettura-pianta" rows={2} maxLength={tipo === "schizzo" ? 120 : 300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Facoltativo. Es. leggi solo la cucina." /></div>
                    </div>
                  </details>}
                  {letturaAi}
                </section>
              </aside>
            </div>
          ) : <ChatAvvioPlanimetria messaggi={messaggi} testo={testo} limite={limiteChat} ambienti={ambienti} onTesto={setTesto} onInvia={invia}
            onTogli={(indice) => setMessaggi((correnti) => correnti.filter((_, i) => i !== indice))} />}
          </fieldset>

          {(preparandoFile || anteprimaInCorso || ricalcando) && <p role="status" className="flex items-center gap-2 rounded-lg bg-primary/5 p-3 text-sm"><Loader2 className="h-4 w-4 motion-safe:animate-spin" />{ricalcando ? "Preparo la tavola per l’editor…" : preparandoFile && daDwg ? "Leggo il disegno DWG…" : preparandoFile ? "Preparo il file…" : "Aggiorno l’anteprima del foglio…"}</p>}
          {modellando && <p role="status" className="flex items-center gap-2 rounded-lg bg-primary/5 p-3 text-sm"><Loader2 className="h-4 w-4 motion-safe:animate-spin" />Leggo geometrie e scritte dei piani selezionati…</p>}
          {inCorso && <AttesaLetturaPianta fase={fase} anteprima={anteprima} />}

          {errore && (
            <div role="alert" className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p>{errore}</p>
              {modo==="documento" && puoRicalcare ? <Button size="sm" variant="outline" disabled={occupato} onClick={() => void apriRicalco()}>
                <PenLine className="mr-2 h-4 w-4" /> Ricalca la stessa tavola
              </Button> : <Button asChild size="sm" variant="outline">
                <Link to={percorsoDisegno}>
                  <PenLine className="mr-2 h-4 w-4" /> Disegnala a mano
                </Link>
              </Button>}
            </div>
          )}

          {(modo === "testo" || (modo === "sopralluogo" && sorgenteRilievo === "nuovo")) &&
            <div className="-mx-4 flex flex-wrap items-center gap-2 rounded-b-lg border-t bg-card px-4 py-3 sm:-mx-6 sm:px-6">
              {modo === "sopralluogo" && !!file && !!anteprima &&
                <Button type="button" disabled={occupato} onClick={() => void apriRicalco()}><PenLine className="mr-2 h-4 w-4" />Apri schizzo da ricalcare</Button>}
              <Button type="button" variant={file && anteprima ? "outline" : "default"} disabled={occupato || (!testoCompleto && !ambienti.length)} onClick={() => apriBozzaGuidata()}>
                <ArrowRight className="mr-2 h-4 w-4" />{ambienti.length ? "Apri bozza nell’editor" : "Apri editor con appunti"}
              </Button>
              {!provaSenzaAI && <div className="flex flex-wrap items-center gap-2">
                {letturaAi}
                <p className="text-xs text-muted-foreground">Lettura AI · 1 credito</p>
              </div>}
            </div>}
        </CardContent>
      </Card>
      {schizzoAperto && <SchizzoSopralluogo onChiudi={() => setSchizzoAperto(false)} onUsa={(f) => { setSchizzoAperto(false); void scegliFile(f); }} />}
      {ritagliando && <Suspense fallback={<p role="status">Apro il ritaglio…</p>}><RitaglioDocumentoPianta file={ritagliando} iniziale={ritaglio} onChiudi={() => setRitagliando(null)} onConferma={(r) => { preparaPagina({ ritaglio: r }); setRitagliando(null); }} /></Suspense>}
      {ingrandita && anteprima && <Suspense fallback={<p role="status">Ingrandisco il foglio…</p>}><DocumentoPiantaIngrandito src={srcTecnica ?? anteprima} onChiudi={() => setIngrandita(false)} /></Suspense>}
      {urlRitaglioOriginale && <Suspense fallback={<p role="status">Ingrandisco il foglio…</p>}>
        <DocumentoPiantaIngrandito src={urlRitaglioOriginale} onChiudi={() => setOriginaleAperto(null)} />
      </Suspense>}
    </div>
  );
}

function PiantaGenerata({ companyId, generata, onAggiorna, per, onSalvata }: {
  per: DaDove; companyId: string; generata: Generata; onAggiorna: (g: Generata) => void; onSalvata?: (id: string) => void;
}) {
  const serveScala = scalaDaConfermare(generata.ingresso, generata.generazione);
  const [rileggendo, setRileggendo] = useState(false);
  const [erroreRilettura, setErroreRilettura] = useState<string | null>(null);
  const [indicazioniRilettura, setIndicazioniRilettura] = useState("");
  const riletturaAvviata = useRef(false);
  const rileggi = async () => {
    if (!generata.sorgente || riletturaAvviata.current) return;
    riletturaAvviata.current = true; setRileggendo(true); setErroreRilettura(null);
    let url: string | null = null;
    try {
      url = URL.createObjectURL(generata.sorgente.file);
      const dimensioni = await misureImmagine(url);
      if (!dimensioni) throw new Error("Il documento originale non è più leggibile.");
      const nota = [indicazioniRilettura.trim(), generata.richiesta?.nota ?? notaLetturaPianta("ambiente", generata.titolo, "", generata.ingresso === "schizzo")].filter(Boolean).join(" ").slice(0, 500);
      const richiesta: RichiestaAI = { ...generata.richiesta, company_id: companyId, ingresso: generata.ingresso, mime: generata.sorgente.file.type, file_base64: await inBase64(generata.sorgente.file), nota, ...dimensioni };
      const esito = await chiediAllAI(richiesta);
      if (esito.ok === false) { setErroreRilettura(esito.messaggio); return; }
      onAggiorna({ ...generata, ...esito, origine: generata.origine, planimetria: { ...esito.planimetria, ambitoDocumento: generata.planimetria.ambitoDocumento }, richiesta, letturaId: crypto.randomUUID() });
    } catch (e) { setErroreRilettura(e instanceof Error ? e.message : "La nuova lettura non è riuscita. La bozza precedente è rimasta disponibile."); }
    finally { if (url) URL.revokeObjectURL(url); riletturaAvviata.current = false; setRileggendo(false); }
  };
  return (
    <EditorConSalvataggio
      // dopo la conferma della scala l'editor riparte dalla pianta adeguata
      key={`${generata.letturaId ?? "prima-lettura"}:${generata.generazione.scala?.cm_per_unita ?? "senza-scala"}`}
      companyId={companyId}
      titoloPagina={TITOLO_NUOVA}
      sottotitoloPagina={generata.ingresso==="descrizione" ? "Editor · Da una descrizione" : generata.origine==="sopralluogo" ? "Editor · Dal sopralluogo" : "Editor · Da una tavola"}
      indietro={onSalvata ? undefined : per.percorso()}
      tornaDopoSalvataggio={per.indietro}
      collegamenti={generata.collegamenti ? { ...generata.collegamenti, ...per.collegamenti } : per.collegamenti}
      iniziale={generata.planimetria}
      sorgenteDocumento={generata.sorgente}
      titoloProposto={per.titolo || generata.titolo}
      origine={generata.origine}
      onSalvata={onSalvata && (esito => onSalvata(esito.id))}
      avvisi={[
        "Le misure in viola con «≈» sono stimate: controllale e correggile toccandole.",
      ]}
      sopra={<div className="space-y-3"><EsitoLetturaPianta pianta={generata.planimetria} sorgente={generata.sorgente} avvisi={generata.planimetria.letturaDocumento ? [] : generata.generazione.avvisi} />
        {generata.sorgente && <div className="flex flex-wrap items-center justify-between gap-2"><Input aria-label="Indicazioni per la rilettura" className="h-8 min-w-[200px] flex-1 text-xs" maxLength={250} disabled={rileggendo} value={indicazioniRilettura} onChange={(e) => setIndicazioniRilettura(e.target.value)} placeholder="Indicazioni facoltative per la nuova lettura dello stesso foglio" /><Button type="button" size="sm" variant="outline" disabled={rileggendo} onClick={() => { void rileggi(); }}>{rileggendo ? <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}{rileggendo ? "Rilettura in corso…" : "Rileggi il documento · 1 credito"}</Button></div>}
        {rileggendo && <AttesaLetturaPianta fase="lettura" />}
        {erroreRilettura && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{erroreRilettura}</p>}
        {serveScala && <ConfermaScala generata={generata} onConferma={onAggiorna} />}</div>}
    />
  );
}

/** «Questa stanza è larga 4,20»: tutta la pianta in scala si adegua. */
function ConfermaScala({ generata, onConferma }: { generata: Generata; onConferma: (g: Generata) => void }) {
  const locali = generata.planimetria.livelli[0]?.fatto.locali ?? [];
  const [localeId, setLocaleId] = useState(locali[0]?.id ?? "");
  const [asse, setAsse] = useState<"x" | "y">("x");
  const [valore, setValore] = useState("");
  const [nascosta, setNascosta] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  if (nascosta || !locali.length) return null;

  const applica = () => {
    const cm = leggiMisura(valore);
    if (!cm) {
      setErrore("Scrivi una misura, es. 4,20.");
      return;
    }
    try {
      const r = confermaScala(generata.planimetria, generata.generazione, localeId, asse, cm);
      onConferma({ ...generata, ...r });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Misura non applicata.");
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
      <div className="w-full flex items-center gap-2 font-medium text-foreground">
        <Ruler className="h-4 w-4" /> Metti la pianta in scala: scrivi una misura vera di una stanza, tutto il resto si adegua.
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Stanza</Label>
        <Select value={localeId} onValueChange={setLocaleId}>
          <SelectTrigger className="h-9 w-44 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locali.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Quale misura</Label>
        <Select value={asse} onValueChange={(v) => setAsse(v as "x" | "y")}>
          <SelectTrigger className="h-9 w-56 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="x">Larghezza (da sinistra a destra)</SelectItem>
            <SelectItem value="y">Profondità (dall'alto in basso)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="misura-scala" className="text-xs">Metri</Label>
        <Input id="misura-scala" inputMode="decimal" className="h-9 w-24 bg-white" placeholder="4,20" value={valore} onChange={(e) => setValore(e.target.value)} />
      </div>
      <Button size="sm" onClick={applica}>Applica</Button>
      <Button size="sm" variant="ghost" onClick={() => setNascosta(true)}>Lo faccio dopo</Button>
      {errore && <p className="w-full text-xs text-destructive">{errore}</p>}
    </div>
  );
}
