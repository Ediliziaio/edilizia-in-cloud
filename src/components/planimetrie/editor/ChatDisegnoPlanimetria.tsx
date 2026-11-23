import { lazy, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { AppWindow, Armchair, ArrowUpRight, Box, Check, ClipboardList, DoorOpen, Droplet, Eraser, FileText, Focus, ImageIcon, MessageSquare, Mic, MicOff, Paperclip, Rows3, Ruler, ScanLine, ScanSearch, SquareDashed, TriangleAlert, Undo2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThinkingPromptInput } from "@/components/ui/thinking-prompt-input";
import { ConversazioneProgettoSilvio } from "@/components/quotes/conversazioneProgettoSilvio";
import { isQuoteProviderNotice } from "@/lib/preventivi/quoteChatPresentation";
import { creaRiconoscitore, dettaturaDisponibile, type Riconoscitore } from "@/lib/planimetrie/dettatura";
import { ACCETTA_DOCUMENTO_PIANTA, normalizzaDocumento, type RitaglioPianta } from "@/lib/planimetrie/documentoImmagine";
import { dwgDisponibile, eDwg, leggiTavolaDwg, ricostruisciModelloDwg, type LetturaDwg } from "@/lib/planimetrie/dwgLocale";
import { ritaglioInCoordinateDwg, UNITA_DWG, unitaDwgValida, validaRichiestaModelloDwg } from "@/lib/planimetrie/coordinateDwg";
import type { AngoliSchizzo } from "@/lib/planimetrie/prospettivaSchizzo";
import { controllaAccessiPiano } from "@/lib/planimetrie/accessiPlanimetria";
import { definizioneCampo } from "@/lib/planimetrie/campiSport";
import { leggiRichiestaStudioBilocali, miglioreBilocali, simulaBilocali, sintetizzaBilocali, type AvvioStudioBilocali } from "@/lib/planimetrie/studioBilocali";
import type { LetturaSchizzo, ScalaSchizzo } from "@/lib/planimetrie/schizzoSopralluogo";
import type { VerificaLettura } from "../../../../shared/planimetrie/letturaTipi.ts";
import { eAmbienteInterno, funzionePareteDaVerificare } from "../../../../shared/planimetrie/modello.ts";
import { useBlobRef } from "../useBlobRef";
import { AnalisiProgettoPlanimetria } from "../AnalisiProgettoPlanimetria";
import { aPlanimetria, daPlanimetria, ID_PROPOSTA, type LocaleVista, type Pianta, type Punto } from "./adattatore";
import { visibile, type Vista } from "./comandi";
import { comandiDaChatDisegno, type ConfrontoTramezzoChat, type ContestoChatDisegno, type PassoChatDisegno, type VistaChatDisegno } from "./comandiChat";
import { anteprimaFoglio, preparaImmagine } from "./generazione";
import { SchizzoChatScheda } from "./SchizzoChatScheda";
import { SchizzoVerificheChat } from "./SchizzoVerificheChat";
import { leggiMisura, scriviMetri } from "./misure";
import type { Selezione } from "./TelaPlanimetria";
import { InterventiChatDisegno } from "./InterventiChatDisegno";
import { anteprimaInterventi, preparaInterventi, propostaChatApplicabile, type RevisioneInterventi } from "./interventiChat";
import "./chat-disegno.css";

const RitaglioDocumentoPianta = lazy(() => import("../RitaglioDocumentoPianta"));
const RaddrizzaSchizzo = lazy(() => import("./RaddrizzaSchizzo"));
const MAX_TESTO = 2200;
const MAX_QUADRI = 5;
const TEMPO_QUADRO_MS = 170;
const FORMATO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const ESEMPIO = [
  "Cucina 3,20 × 4,10 m",
  "Ingresso 2 × 2,50 m a destra della cucina",
  "Porta tra ingresso e cucina da 80 cm",
  "Finestra cucina sul lato alto da 120 cm",
].join("\n");
const ESEMPIO_CAMPI = [
  "Lotto 90 × 65 m",
  "Aggiungi un campo da calcio a 5, uno da padel e uno da tennis",
  "Fai il render dei campi",
].join("\n");
const etichettaVista = (v: VistaChatDisegno) => {
  if (v === "3d") return "Apri anteprima 3D";
  if (v.startsWith("foto:")) return "Confronta 3D e fotorealistico";
  if (v === "render-edificio") return "Apri render dell’edificio";
  if (v === "render-sport" || v.startsWith("render:")) return "Apri render dei campi";
  return "Apri render della casa";
};

interface Messaggio {
  id?: string;
  dalPreventivo?: true;
  ruolo: "utente" | "assistente";
  testo: string;
  fatti?: Risultato[];
  avvisi?: string[];
  viste?: VistaChatDisegno[];
  studio?: AvvioStudioBilocali;
}

type Risultato = Pick<PassoChatDisegno, "testo" | "evidenza">;
type Fase = { testo: string; ultimo?: string; completati: number; totale: number };

function statoChat(pianta: Pianta, vista: Vista, contesto: ContestoChatDisegno) {
  const id = contesto.propostaId ?? ID_PROPOSTA;
  const { livelli } = aPlanimetria(pianta, contesto.documento, contesto.livelloId, id);
  const livello = livelli.find(l => l.id === contesto.livelloId) ?? livelli[0];
  return { stato: (vista === "progetto" && livello.proposte.find(p => p.id === id)) || livello.fatto, quota: livello.quota };
}

function verificaIngressiChat(pianta: Pianta, vista: Vista, contesto: ContestoChatDisegno): Messaggio {
  const { stato, quota } = statoChat(pianta, vista, contesto);
  const { ingressi, senzaUnita, interni, recinzioniChiuse } = controllaAccessiPiano(stato, contesto.documento.ambitoDocumento === "alloggio", quota);
  if (!ingressi.length) return {
    ruolo: "assistente",
    testo: interni ? "Assegna i locali alle unità nelle proprietà della stanza e indica le parti comuni. Poi posso seguire le porte dalla pianta."
      : "Servono i locali e le aperture del piano per verificare i percorsi.",
  };
  const fatti: Risultato[] = [];
  const avvisi: string[] = [];
  for (const a of ingressi) {
    const nome = a.sigla === "Alloggio" ? a.sigla : "Unità " + a.sigla;
    if (a.tipo === "mancante") avvisi.push(nome + " · nessun ingresso dal perimetro o dalle parti comuni. Controlla porta e percorso esterno.");
    else if (a.ambientiScollegati.length) avvisi.push(nome + " · collega " + a.ambientiScollegati.join(", ") + " al percorso d’ingresso.");
    else fatti.push({
      testo: nome + (a.tipo === "diretto" ? " · porta sul perimetro" : " · porta dalle parti comuni")
        + (a.porta ? " · " + FORMATO.format(a.porta.larghezza) + " cm di vano" : ""),
      evidenza: a.porta ? { tipo: "apertura", id: a.porta.id } : undefined,
    });
  }
  if (recinzioniChiuse.length) avvisi.push(`${recinzioniChiuse.join(", ")} · disegna il cancello del cortile e verifica il percorso dalla strada.`);
  else if (fatti.length) avvisi.push("Riscontro sul piano attivo. Verifica il tratto dalla strada, le parti comuni e i collegamenti tra i piani.");
  if (senzaUnita.length) avvisi.push("Assegna i locali senza unità o indica se fanno parte del percorso comune.");
  return { ruolo: "assistente", testo: "Controllo degli ingressi sul piano attivo", fatti, avvisi };
}

function accessiInterrotti(prima: Pianta, dopo: Pianta, vista: Vista, contesto: ContestoChatDisegno): string[] {
  if (vista !== "progetto" || (prima.muri === dopo.muri && prima.aperture === dopo.aperture)) return [];
  const alloggio = contesto.documento.ambitoDocumento === "alloggio";
  const statoPrima = statoChat(prima, vista, contesto);
  const esitoPrima = controllaAccessiPiano(statoPrima.stato, alloggio, statoPrima.quota);
  const collegati = esitoPrima.ingressi.filter(a => a.tipo !== "mancante" && !a.ambientiScollegati.length);
  if (!collegati.length) return [];
  const statoDopo = statoChat(dopo, vista, contesto);
  const esitoDopo = controllaAccessiPiano(statoDopo.stato, alloggio, statoDopo.quota);
  return collegati.flatMap(a => {
    const esito = esitoDopo.ingressi.find(b => b.sigla === a.sigla);
    if (!esito) return [`La modifica fa sparire l’unità ${a.sigla} dalla tavola. Controlla i suoi locali.`];
    if (esito.tipo === "mancante") return [`La modifica interrompe l’ingresso ${a.sigla === "Alloggio" ? "dell’alloggio" : "dell’unità " + a.sigla}. Ripristina una porta sul percorso.`];
    return esito.ambientiScollegati.length ? [`La modifica scollega ${esito.ambientiScollegati.join(", ")} dall’ingresso dell’unità ${a.sigla}.`] : [];
  });
}

interface Props {
  id: string;
  aperta: boolean;
  base: Pianta;
  passo: PassoChatDisegno | null;
  piano: string;
  vista: Vista;
  selezione: Selezione | null;
  contesto: ContestoChatDisegno;
  localiVisibili: LocaleVista[];
  superfici: { locali: number; metriQuadri: number; stimata: boolean; prima?: number };
  applicata: boolean;
  consentiListino?: boolean;
  onAnnullaApplicazione?: () => void;
  mostraFonte: boolean;
  onCambiaFonte: () => void;
  onEvidenzia: (evidenza: Selezione, centra?: boolean) => void;
  onInquadraPunto: (punto: Punto) => void;
  onMostra: (passo: PassoChatDisegno | null, quadro?: Pianta) => void;
  onInCorso: (inCorso: boolean) => void;
  onApplica: (passo: PassoChatDisegno, signal?: AbortSignal) => void | Promise<void>;
  onRivediNelComputo?: () => void;
  puoRivedereNelComputo?: boolean;
  inSilvio?: boolean;
  onCreaAlternativa?: (passo: PassoChatDisegno, nome: string) => boolean;
  onSalvaDaChat?: (destinazione: "studio" | "computo") => void;
  consentiComputo?: boolean;
  onVerifica: (v: VerificaLettura | null) => void;
  onApriConfronto: () => void;
  onRiferimento: (file: File, signal: AbortSignal) => Promise<void>;
  onVista?: (tipo: VistaChatDisegno) => void;
  onApriStudioBilocali?: (studio: AvvioStudioBilocali) => void;
  onChiudi: () => void;
}

export function ChatDisegnoPlanimetria({
  id, aperta, base, passo, piano, vista, selezione, contesto, localiVisibili, superfici, applicata, consentiListino, onAnnullaApplicazione, mostraFonte,
  onCambiaFonte, onEvidenzia, onInquadraPunto, onMostra, onInCorso, onApplica, onRivediNelComputo, puoRivedereNelComputo, inSilvio, onCreaAlternativa, onSalvaDaChat, consentiComputo,
  onVerifica, onApriConfronto, onRiferimento, onVista, onApriStudioBilocali, onChiudi,
}: Props) {
  const companyId = useEffectiveCompanyId();
  const [testo, setTesto] = useState("");
  const conversazione = useContext(ConversazioneProgettoSilvio);
  const [messaggiDisegno, setMessaggiDisegno] = useState<Messaggio[]>([]);
  const messaggi = useMemo(() => {
    if (!inSilvio || !conversazione) return messaggiDisegno;
    const storia = conversazione.messaggi.filter(m => !isQuoteProviderNotice(m));
    if (storia.length === 1 && storia[0].role === "assistant" && !storia[0].origineProgetto) return [];
    const dettagli = new Map(messaggiDisegno.map(m => [m.id, m]));
    return storia.map((m): Messaggio => dettagli.get(m.replyKey) ?? {
      id: m.replyKey, ruolo: m.role === "user" ? "utente" : "assistente", testo: m.text,
      dalPreventivo: !m.origineProgetto ? true : undefined,
    });
  }, [conversazione, inSilvio, messaggiDisegno]);
  const [fase, setFase] = useState<Fase | null>(null);
  const [detta, setDetta] = useState(false);
  const [avviso, setAvviso] = useState("");
  const [nomeAlternativa, setNomeAlternativa] = useState<string | null>(null);
  const [cad, setCad] = useState<{ originale: File; lettura: LetturaDwg } | null>(null);
  const [schizzo, setSchizzo] = useState<{
    file: File; nome: string; pagine: number;
    raddrizzato?: { file: File; angoli: AngoliSchizzo };
    lettura?: LetturaSchizzo; ritaglioFile?: File;
  } | null>(null);
  const [misuraSchizzo, setMisuraSchizzo] = useState("");
  const [scalaSchizzo, setScalaSchizzo] = useState<string>();
  const [piuQuote, setPiuQuote] = useState(true);
  const [verificheAperte, setVerificheAperte] = useState(false);
  const [analisi, setAnalisi] = useState(false);
  const [unita, setUnita] = useState("");
  const [ritaglio, setRitaglio] = useState<RitaglioPianta | null>(null);
  const [ritagliando, setRitagliando] = useState(false);
  const [raddrizzando, setRaddrizzando] = useState(false);
  const anteprimaCad = useBlobRef<HTMLImageElement>(cad?.lettura.file, "src");
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const testoCorrente = useRef(testo);
  useLayoutEffect(() => { testoCorrente.current = testo; }, [testo]);
  const fondo = useRef<HTMLDivElement>(null);
  const titoloEsito = useRef<HTMLHeadingElement>(null);
  const spostaFocusEsito = useRef(false);
  const seguiConversazione = useRef(true);
  const riconoscitore = useRef<Riconoscitore | null>(null);
  const lavoro = useRef<AbortController | null>(null);
  const precedente = useRef<PassoChatDisegno | null>(null);
  const saltaAnimazione = useRef<(() => void) | null>(null);
  const proposta = passo && (passo.pianta !== base || passo.revisioneInterventi) ? passo : null;
  const bozzaAnalisi = proposta?.pianta;
  const documentoAnalisi = useMemo(() => analisi && bozzaAnalisi
    ? aPlanimetria(bozzaAnalisi, contesto.documento, contesto.livelloId, contesto.propostaId) : contesto.documento,
    [analisi, bozzaAnalisi, contesto.documento, contesto.livelloId, contesto.propostaId]);
  const pianta = proposta?.pianta ?? base;
  const tramezzoSelezionato = vista === "progetto" && selezione?.tipo === "muro"
    ? base.muri.find(m => m.id === selezione.id && m.tipo === "tramezzo" && m.stato === "esistente" && !funzionePareteDaVerificare(m)) : undefined;
  const pianoVuoto = !(base.muri.length || base.locali.length || base.aperture.length
    || base.elementi?.length || base.quote?.length || base.testi?.length || base.aree?.length);
  const campiVisibili = base.elementi?.some(e => definizioneCampo(e.tipo)
    && visibile(e.stato, vista) && (vista === "fatto" || e.stato !== "da_demolire"));
  const livelloAttivo = contesto.documento.livelli.find(l => l.id === contesto.livelloId) ?? contesto.documento.livelli[0];
  const originaleProtetto = !!livelloAttivo?.tavolaDwg || !!livelloAttivo?.ricalco?.bloccata;
  const puoRicostruire = vista === "fatto" && pianoVuoto && !proposta && !originaleProtetto && !!cad?.lettura.riferimento;
  const puoLeggereSchizzo = vista === "fatto" && pianoVuoto && !proposta && !base.letturaDocumento;
  const riferimentoSchizzo = schizzo?.lettura?.riferimenti.find(r => r.id === scalaSchizzo);
  const esitoSchizzo = proposta?.riferimento?.schizzo && proposta.pianta.letturaDocumento ? proposta.riferimento : null;
  const deltaMetratura = superfici.prima === undefined ? 0 : Math.round((superfici.metriQuadri - superfici.prima) * 100) / 100;

  function aggiungi(m: Messaggio) {
    if (!inSilvio || !conversazione) {
      setMessaggiDisegno(corrente => [...corrente, m]);
      return;
    }
    const id = crypto.randomUUID();
    setMessaggiDisegno(corrente => [...corrente, { ...m, id }].slice(-50));
    const testo = [m.testo, ...m.fatti?.map(f => f.testo) ?? [], ...m.avvisi ?? []].filter(Boolean).join("\n").slice(0, 6000);
    conversazione.setMessaggi(corrente => [...corrente, {
      role: m.ruolo === "utente" ? "user" as const : "assistant" as const, text: testo, replyKey: id,
      diagnostic: true, origineProgetto: true as const,
    }].slice(-50));
  }

  function interrompiDettatura() {
    const r = riconoscitore.current;
    if (!r) return;
    r.onend = null;
    r.onresult = null;
    r.onerror = null;
    riconoscitore.current = null;
    r.stop();
  }

  useEffect(() => {
    if (aperta) {
      seguiConversazione.current = true;
      textarea.current?.focus({ preventScroll: true });
      if (inSilvio && window.matchMedia("(max-width: 1279px)").matches) {
        textarea.current?.scrollIntoView({ block: "nearest" });
      }
      return () => {
        lavoro.current?.abort();
        lavoro.current = null;
        saltaAnimazione.current = null;
        spostaFocusEsito.current = false;
        interrompiDettatura();
        setDetta(false);
        setFase(null);
        setRitagliando(false);
        setRaddrizzando(false);
        setVerificheAperte(false);
        setNomeAlternativa(null);
      };
    }

  }, [aperta, inSilvio]);

  useEffect(() => {
    const pannello = fondo.current;
    if (aperta && pannello && seguiConversazione.current) {
      pannello.scrollTop = inSilvio && !messaggi.length && !fase ? 0 : pannello.scrollHeight;
    }
  }, [aperta, applicata, cad, schizzo, fase, inSilvio, messaggi, proposta, verificheAperte]);

  useEffect(() => {
    if (!aperta || fase || !spostaFocusEsito.current) return;
    spostaFocusEsito.current = false;
    (titoloEsito.current ?? textarea.current)?.focus({ preventScroll: true });
  }, [aperta, applicata, fase, proposta]);

  function inizia(titolo: string) {
    if (lavoro.current) return null;
    const controller = new AbortController();
    lavoro.current = controller;
    precedente.current = passo;
    setAvviso("");
    setFase({ testo: titolo, completati: 0, totale: 0 });
    onInCorso(true);
    return controller;
  }

  function finisci(controller: AbortController) {
    if (lavoro.current !== controller) return;
    lavoro.current = null;
    saltaAnimazione.current = null;
    setFase(null);
    onInCorso(false);
  }

  function ferma() {
    const controller = lavoro.current;
    if (!controller) return;
    controller.abort();
    onMostra(precedente.current);
    finisci(controller);
    aggiungi({ ruolo: "assistente", testo: "Operazione interrotta. Ho ripristinato la tavola precedente." });
  }

  function mostraPassi(controller: AbortController, passi: PassoChatDisegno[], avvisi: string[] = [], viste: VistaChatDisegno[] = [], revisione?: RevisioneInterventi) {
    const preferenza = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const fatti: Risultato[] = [];
    for (const corrente of passi) {
      const ultimo = fatti.at(-1);
      if (ultimo?.testo !== corrente.testo || ultimo.evidenza?.id !== corrente.evidenza?.id) {
        fatti.push({ testo: corrente.testo, evidenza: corrente.evidenza });
      }
    }
    const partenza = passo?.confrontoTramezzo?.interferenze.length ? base : passo?.pianta ?? base;
    const cambiaPianta = passi.some(p => p.pianta !== partenza);
    const quadri = cambiaPianta ? Math.min(MAX_QUADRI, passi.length) : 0;
    const risultato = passi.at(-1);
    const quadroFinale = revisione ? anteprimaInterventi(revisione) : risultato;
    const mostraImpianti = passi.some(p => p.mostraImpianti);
    const ultimiPassi = [...passi].reverse();
    const confrontoScarico = ultimiPassi.find(p => p.confrontoScarico && p.pianta === risultato?.pianta)?.confrontoScarico;
    const confrontoTramezzo = ultimiPassi.find(p => p.confrontoTramezzo && p.pianta === risultato?.pianta)?.confrontoTramezzo;
    let quadro = 0;
    let piantaPrecedente = partenza;
    let timer: ReturnType<typeof setTimeout> | undefined;
    controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    function concludi() {
      if (controller.signal.aborted || lavoro.current !== controller) return;
      clearTimeout(timer);
      if (revisione && quadroFinale) onMostra(quadroFinale);
      else if (risultato) {
        if (cambiaPianta || !passo) onMostra({ ...risultato, mostraImpianti, confrontoScarico, confrontoTramezzo });
        else onMostra({ ...passo, mostraImpianti: mostraImpianti || passo.mostraImpianti, evidenza: risultato.evidenza ?? passo.evidenza });
      }
      finisci(controller);
      aggiungi({
        ruolo: "assistente",
        testo: risultato ? cambiaPianta ? "Proposta pronta da rivedere" : "Risultato sulla tavola"
          : "Mi serve un’indicazione più precisa",
        fatti,
        avvisi,
        viste,
      });
    }
    function prossimo() {
      if (controller.signal.aborted || lavoro.current !== controller) return;
      if (++quadro >= quadri || preferenza?.matches) {
        concludi();
        return;
      }
      const completati = Math.ceil(passi.length * quadro / quadri);
      const corrente = passi[completati - 1];
      onMostra(corrente, quadroFinale?.pianta);
      setFase({
        testo: corrente.pianta === piantaPrecedente ? "Misure sulla tavola" : "Aggiorno la tavola",
        ultimo: corrente.testo, completati, totale: passi.length,
      });
      piantaPrecedente = corrente.pianta;
      timer = setTimeout(prossimo, TEMPO_QUADRO_MS);
    }
    saltaAnimazione.current = concludi;
    prossimo();
  }

  function invia(richiesta?: string) {
    const comando = (richiesta ?? testo).trim();
    if (!comando || detta) return;
    seguiConversazione.current = true;
    const studio = onApriStudioBilocali && leggiRichiestaStudioBilocali(comando);
    if (!studio && !lavoro.current && !comando.includes("\n")
      && /^(?:verific|controll|ogni|tutte le unit)/i.test(comando) && /\b(?:ingress[oi]|access[oi]|porte)\b/i.test(comando)) {
      setTesto("");
      aggiungi({ ruolo: "utente", testo: comando });
      aggiungi(verificaIngressiChat(pianta, vista, contesto));
      return;
    }
    if (studio && !lavoro.current) {
      setTesto("");
      aggiungi({ ruolo: "utente", testo: comando });
      if (proposta) {
        aggiungi({ ruolo: "assistente", studio, testo: "Concludi l’anteprima del disegno per aprire lo studio dei bilocali." });
        return;
      }
      const livello = contesto.documento.livelli.find(l => l.id === contesto.livelloId) ?? contesto.documento.livelli[0];
      const profilo = studio.profilo ?? (contesto.documento.urbanistica?.codiceIstat === "015146" ? "milano" : "generico");
      const { unita, tipoAccesso } = studio;
      const prima = simulaBilocali(livello, { unita, profilo, tipoAccesso });
      const esito = sintetizzaBilocali(prima);
      const fatti = [{ testo: `${unita} bilocali · ${esito.testo}` }];
      if (studio.soloVerifica && (prima.ok === true || prima.causa === "indipendenti")) {
        const altre = unita === 3 ? 2 : 3;
        const confronto = sintetizzaBilocali(simulaBilocali(livello, { unita: altre, profilo, tipoAccesso }));
        fatti.push({ testo: `${altre} bilocali · ${confronto.testo}` });
      }
      const migliore = prima.ok ? miglioreBilocali(prima.alternative) : undefined;
      aggiungi({ ruolo: "assistente", studio, testo: "Verifica preliminare · " + livello.nome, fatti,
        avvisi: migliore?.criticita.slice(0, 2) });
      if (!studio.soloVerifica) onApriStudioBilocali?.(studio);
      return;
    }
    const controller = inizia("Leggo le indicazioni");
    if (!controller) return;
    setVerificheAperte(false);
    onVerifica(null);
    aggiungi({ ruolo: "utente", testo: comando });
    if (richiesta === undefined) setTesto("");
    const piantaDiPartenza = passo?.confrontoTramezzo?.interferenze.length ? base : passo?.pianta ?? base;
    const nuovoContesto = { ...contesto, selezione };
    const lavorazione = !passo?.riferimento ? preparaInterventi(base, vista, comando, nuovoContesto, passo?.revisioneInterventi) : null;
    const esito = lavorazione ?? comandiDaChatDisegno(piantaDiPartenza, vista, comando, nuovoContesto);
    const candidata = lavorazione?.revisione;
    const revisione = candidata && (passo?.revisioneInterventi || candidata.interventi.some(i => i.passo)) ? candidata : undefined;
    const viste = [...new Set(esito.passi.flatMap(p => p.vistaRichiesta ? [p.vistaRichiesta] : []))];
    const sulDisegno = esito.passi.filter(p => !p.vistaRichiesta);
    if (viste.length && !sulDisegno.length) {
      finisci(controller);
      if (!onVista) {
        aggiungi({ ruolo: "assistente", testo: "Per aprire le viste, usa l’editor della planimetria." });
      } else {
        aggiungi({
          ruolo: "assistente",
          testo: proposta ? "Applica le modifiche alla pianta per vederle in 3D."
            : viste[0].startsWith("foto:") ? "Preparo il render fotorealistico e la vista 3D dalla stessa inquadratura."
            : viste[0] !== "3d" && viste.length === 1 ? "Preparo le inquadrature 3D dalla pianta corrente." : "Puoi esplorare la geometria corrente della pianta.",
          viste, avvisi: esito.avvisi,
        });
        if (!proposta && viste.length === 1) onVista(viste[0]);
      }
      return;
    }
    const passi = passo?.riferimento ? sulDisegno.map(p => ({ ...p, riferimento: passo.riferimento })) : sulDisegno;
    const ultimo = revisione ? { pianta: revisione.piantaValida } : passi.at(-1);
    const accessi = ultimo ? accessiInterrotti(base, ultimo.pianta, vista, contesto) : [];
    mostraPassi(controller, passi, [...esito.avvisi, ...accessi], onVista ? viste : [], revisione);
  }

  function cambiaDettatura() {
    if (detta) {
      riconoscitore.current?.stop();
      return;
    }
    setAvviso("");
    const r = creaRiconoscitore();
    if (!r) {
      setAvviso("La dettatura non è disponibile in questo browser. Puoi scrivere nel campo qui sotto.");
      return;
    }
    riconoscitore.current = r;
    r.lang = "it-IT";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = e => {
      const finali = Array.from(e.results).slice(e.resultIndex).filter(risultato => risultato.isFinal)
        .map(risultato => risultato[0]?.transcript?.trim()).filter(Boolean);
      if (finali.length) setTesto(corrente => [corrente.trim(), ...finali].filter(Boolean).join("\n").slice(0, MAX_TESTO));
    };
    r.onend = () => { riconoscitore.current = null; setDetta(false); textarea.current?.focus({ preventScroll: true }); };
    r.onerror = e => {
      setDetta(false);
      setAvviso(e.error === "not-allowed" ? "Consenti l’uso del microfono nel browser per dettare." : "Dettatura interrotta. Puoi riprovare o continuare a scrivere.");
    };
    try {
      r.start();
      setDetta(true);
    } catch {
      interrompiDettatura();
      setAvviso("Impossibile avviare il microfono.");
    }
  }

  async function allega(file: File) {
    const controller = inizia("Apro il file");
    if (!controller) return;
    try {
      if (/\.txt$/i.test(file.name) || file.type === "text/plain") {
        if (file.size > MAX_TESTO * 4) throw new Error("Il file di testo è troppo lungo. Carica fino a 2.200 caratteri.");
        const note = (await file.text()).trim();
        controller.signal.throwIfAborted();
        if (!note) throw new Error("Il file di testo è vuoto.");
        const completo = [testoCorrente.current.trim(), note].filter(Boolean).join("\n");
        if (completo.length > MAX_TESTO) throw new Error("Il testo e l’allegato insieme superano 2.200 caratteri.");
        setTesto(completo);
        setAvviso(file.name + " aggiunto al messaggio.");
        return;
      }
      if (eDwg(file)) {
        const lettura = await leggiTavolaDwg(file, controller.signal, { companyId });
        controller.signal.throwIfAborted();
        setCad({ originale: file, lettura });
        setSchizzo(null);
        setUnita(lettura.riferimento?.unita?.toString() ?? "");
        setRitaglio(null);
        aggiungi({ ruolo: "assistente", testo: "DWG aperto. Scegli il piano della tavola e controlla l’unità prima di ricostruirlo." });
        return;
      }
      const pronto = await normalizzaDocumento(file);
      const foglio = pronto.type === "application/pdf" ? await anteprimaFoglio(pronto, 1, 0, null) : { file: pronto, pagine: 1 };
      controller.signal.throwIfAborted();
      const immagine = foglio.file instanceof File ? foglio.file : new File([foglio.file], pronto.name.replace(/\.pdf$/i, ".png"), { type: foglio.file.type });
      setCad(null);
      setRitaglio(null);
      setPiuQuote(true);
      setSchizzo({ file: immagine, nome: file.name, pagine: foglio.pagine });
      aggiungi({ ruolo: "assistente", testo: "Schizzo allegato. Puoi leggerlo per ricostruire la pianta o usarlo come sfondo." });
    } catch (e) {
      if (!controller.signal.aborted) setAvviso(e instanceof Error ? e.message : "Caricamento non riuscito.");
    } finally {
      finisci(controller);
    }
  }

  function scegliScala(scelta: ScalaSchizzo) {
    setScalaSchizzo(scelta.id);
    setMisuraSchizzo(scelta.scritto ? scriviMetri(scelta.scritto.cm) + " m" : "");
  }

  async function immagineSchizzo(file: File) {
    const pronta = await preparaImmagine(file, 0, undefined, ritaglio, { squadra: false });
    if (!pronta) throw new Error("Schizzo illeggibile. Scegli un’immagine nitida o ritaglia la zona del disegno.");
    return new File([pronta.file], file.name, { type: pronta.mime });
  }

  async function analizzaSchizzo() {
    if (!schizzo || !puoLeggereSchizzo) return;
    const controller = inizia("Leggo i tratti e le scritte dello schizzo");
    if (!controller) return;
    try {
      const { leggiSchizzo } = await import("@/lib/planimetrie/schizzoSopralluogo");
      const file = await immagineSchizzo(schizzo.raddrizzato?.file ?? schizzo.file);
      controller.signal.throwIfAborted();
      const lettura = await leggiSchizzo(file, controller.signal);
      controller.signal.throwIfAborted();
      const scala = lettura.riferimenti.find(r => r.scritto) ?? lettura.riferimenti[0];
      scegliScala(scala);
      setSchizzo({ ...schizzo, lettura, ritaglioFile: file });
      const restano = lettura.nonRicostruiti?.length ?? 0;
      aggiungi({ ruolo: "assistente", testo: `Ho ricostruito ${lettura.stanze.length} ${lettura.stanze.length === 1 ? "contorno" : "contorni"}.`
        + (restano ? ` Restano da tracciare ${restano} ${restano === 1 ? "contorno con un nome leggibile" : "contorni con un nome leggibile"}.` : "")
        + (scala.scritto ? " Verifica la quota proposta per impostare la scala." : " Indica una distanza reale per impostare la scala.") });
    } catch (e) {
      if (!controller.signal.aborted) setAvviso(e instanceof Error ? e.message : "Impossibile leggere lo schizzo.");
    } finally {
      finisci(controller);
    }
  }

  async function costruisciSchizzo() {
    const cm = leggiMisura(misuraSchizzo);
    if (!schizzo?.lettura || !schizzo.ritaglioFile || !riferimentoSchizzo || !puoLeggereSchizzo || !cm) return;
    const controller = inizia("Imposto la scala del disegno");
    if (!controller) return;
    try {
      const { generaDaSchizzo } = await import("@/lib/planimetrie/schizzoSopralluogo");
      controller.signal.throwIfAborted();
      const livelloId = contesto.livelloId ?? contesto.documento.livelli[0].id;
      const { conMuri, conLocali, completa, larghezzaCm, altezzaCm, quoteDiScala } = generaDaSchizzo(base, schizzo.lettura, riferimentoSchizzo, cm, livelloId, piuQuote);
      const lettura = completa.letturaDocumento!;
      const fonte = { file: schizzo.ritaglioFile, schizzo: schizzo.raddrizzato ? schizzo.ritaglioFile.name : schizzo.nome, x: 0, y: 0, larghezzaCm,
        proporzione: altezzaCm / larghezzaCm, proporzioneFoto: schizzo.lettura.altezza / schizzo.lettura.larghezza, opacita: .46 };
      const porte = completa.aperture.filter(a => a.tipo === "porta").length;
      const finestre = completa.aperture.filter(a => a.tipo === "finestra").length;
      const vani = completa.aperture.filter(a => a.tipo === "varco").length;
      const scala = quoteDiScala > 1 ? quoteDiScala + " quote sui due assi" : "una quota";
      aggiungi({ ruolo: "utente", testo: "Costruisci la bozza usando " + riferimentoSchizzo.nome.toLocaleLowerCase("it") + " a " + scriviMetri(cm) + " m"
        + (piuQuote ? " e verifica le altre quote lette." : ".") });
      setVerificheAperte(false);
      mostraPassi(controller, [
        { pianta: conMuri, testo: "Muri tracciati · " + conMuri.muri.length + " tratti · scala da " + scala, riferimento: fonte },
        { pianta: conLocali, testo: "Ambienti chiusi · " + conLocali.locali.length + " locali", riferimento: fonte },
        { pianta: completa, testo: `Aperture sulla bozza · ${porte} ${porte === 1 ? "porta" : "porte"} e ${finestre} ${finestre === 1 ? "finestra" : "finestre"}${vani ? " · vani da identificare " + vani : ""}`, riferimento: fonte },
        { pianta: completa, testo: "Confronto con l’originale · " + lettura.verifiche!.length + " controlli", riferimento: fonte },
      ], [
        ...(piuQuote && quoteDiScala === 1 ? ["Servono almeno due quote concordanti sull’altro asse. Per questa bozza ho usato la scala del riferimento scelto."] : []),
        lettura.avvisiIniziali[0],
      ]);
    } catch (e) {
      if (!controller.signal.aborted) setAvviso(e instanceof Error ? e.message : "Impossibile costruire la pianta.");
      finisci(controller);
    }
  }

  async function usaSchizzoComeSfondo() {
    if (!schizzo) return;
    const controller = inizia("Preparo lo schizzo da ricalcare");
    if (!controller) return;
    try {
      const file = schizzo.ritaglioFile ?? await immagineSchizzo(schizzo.raddrizzato?.file ?? schizzo.file);
      controller.signal.throwIfAborted();
      await onRiferimento(file, controller.signal);
      controller.signal.throwIfAborted();
      setSchizzo(null);
      aggiungi({ ruolo: "assistente", testo: "Schizzo aggiunto come sfondo. Imposta la scala per ricalcarlo." });
    } catch (e) {
      if (!controller.signal.aborted) setAvviso(e instanceof Error ? e.message : "Impossibile aprire lo schizzo.");
    } finally {
      finisci(controller);
    }
  }

  async function applicaProposta(p: PassoChatDisegno) {
    if (!propostaChatApplicabile(p)) return;
    spostaFocusEsito.current = true;
    if (!p.riferimento?.schizzo && !p.riferimento?.dwg) {
      onApplica(p);
      aggiungi({ ruolo: "assistente", testo: "Modifiche applicate al disegno." });
      return;
    }
    const controller = inizia(p.riferimento.dwg ? "Collego il DWG alla pianta" : "Collego lo schizzo alla bozza");
    if (!controller) return;
    setVerificheAperte(false);
    try {
      await onApplica(p, controller.signal);
      controller.signal.throwIfAborted();
      setSchizzo(null);
      setVerificheAperte(false);
      aggiungi({ ruolo: "assistente", testo: p.riferimento.dwg
        ? "Pianta modificabile inserita. Trovi l’originale bloccato in Layer DWG. Verifica la scala su una misura della tavola."
        : "Pianta modificabile inserita. Apri le verifiche dell’originale per confermare o correggere quote e aperture." });
    } catch (e) {
      if (!controller.signal.aborted) setAvviso(e instanceof Error ? e.message : "Impossibile applicare la bozza.");
    } finally {
      finisci(controller);
    }
  }

  async function ricostruisciCad() {
    const riferimento = cad?.lettura.riferimento;
    const misura = Number(unita);
    if (!cad || !riferimento || !puoRicostruire || !unitaDwgValida(misura)) return;
    const controller = inizia("Leggo muri e aperture dal DWG");
    if (!controller) return;
    aggiungi({ ruolo: "utente", testo: "Ricostruisci " + cad.originale.name });
    try {
      const rettangolo = ritaglio ? ritaglioInCoordinateDwg(riferimento.rettangolo, ritaglio) : riferimento.rettangolo;
      const richiesta = validaRichiestaModelloDwg({ unita: misura, altezza: 270, piani: [{ nome: piano, quota: 0, rettangolo }], controlloGeometria: true });
      const { documento, piani } = await ricostruisciModelloDwg(cad.originale, richiesta, controller.signal, { companyId });
      const immagine = ritaglio ? await preparaImmagine(cad.lettura.file, 0, undefined, ritaglio, { squadra: false }) : null;
      controller.signal.throwIfAborted();
      if (ritaglio && !immagine) throw new Error("Il ritaglio della tavola non si è preparato. Riprova.");
      const p = daPlanimetria(documento);
      if (!p.muri.length) throw new Error("Non ho trovato pareti nel ritaglio. Seleziona una porzione diversa della tavola.");
      const completo = { ...base, muri: p.muri, locali: p.locali, aperture: p.aperture,
        elementi: p.elementi, quote: p.quote, testi: p.testi, aree: p.aree };
      const frame = piani[0];
      const fonte = {
        file: immagine?.file ?? cad.lettura.file, x: frame.origine[0], y: -frame.origine[1],
        larghezzaCm: frame.larghezza, proporzione: frame.altezza / frame.larghezza, opacita: 0.3,
        dwg: { nome: cad.originale.name, livello: documento.livelli[0] },
      };
      const passi = [
        { pianta: { ...base, muri: p.muri }, testo: "Pareti lette · " + p.muri.length + " tratti", riferimento: fonte },
        { pianta: { ...base, muri: p.muri, locali: p.locali }, testo: "Locali ricostruiti · " + p.locali.length, riferimento: fonte },
        { pianta: completo, testo: "Aperture lette · " + p.aperture.length, riferimento: fonte },
      ];
      setCad(null);
      mostraPassi(controller, passi, ["Verifica geometria e aperture sulla fonte. Altezza iniziale delle pareti 2,70 m da controllare."]);
    } catch (e) {
      if (!controller.signal.aborted) setAvviso(e instanceof Error ? e.message : "Ricostruzione DWG non riuscita.");
      finisci(controller);
    }
  }

  async function usaCadComeRiferimento() {
    if (!cad) return;
    const controller = inizia("Preparo la tavola da ricalcare");
    if (!controller) return;
    try {
      const foglio = ritaglio ? (await anteprimaFoglio(cad.lettura.file, 1, 0, ritaglio)).file : cad.lettura.file;
      controller.signal.throwIfAborted();
      await onRiferimento(new File([foglio], cad.lettura.file.name, { type: foglio.type }), controller.signal);
      controller.signal.throwIfAborted();
      setCad(null);
      aggiungi({ ruolo: "assistente", testo: "Tavola DWG aggiunta come riferimento. Imposta la scala per ricalcarla." });
    } catch (e) {
      if (!controller.signal.aborted) setAvviso(e instanceof Error ? e.message : "Impossibile aprire la tavola.");
    } finally {
      finisci(controller);
    }
  }

  const localizzabile = (e: Selezione) => {
    if (e.tipo === "locale") return localiVisibili.some(l => l.id === e.id);
    const oggetti = e.tipo === "muro" ? pianta.muri : e.tipo === "apertura" ? pianta.aperture
      : e.tipo === "area" ? pianta.aree ?? [] : e.tipo === "elemento" ? pianta.elementi ?? [] : [];
    return oggetti.some(o => o.id === e.id && visibile(o.stato, vista));
  };

  const altriComandi = <>
    {onVista && (pianoVuoto || campiVisibili) && <Button variant="outline" size="sm" className="w-full justify-start bg-background"
      disabled={!!fase || detta || !!proposta} onClick={() => {
        if (campiVisibili) onVista("render-sport");
        else { setTesto(ESEMPIO_CAMPI); textarea.current?.focus(); }
      }}>
      <ImageIcon className="h-4 w-4 text-primary" /> {campiVisibili ? "Render dei campi" : "Prova un centro sportivo"}
    </Button>}
    {onVista && !pianoVuoto && !campiVisibili && contesto.documento.livelli.length > 1 && <Button variant="outline" size="sm" className="w-full justify-start bg-background"
      disabled={!!fase || detta || !!proposta} onClick={() => onVista("render-edificio")}>
      <Box className="h-4 w-4 text-primary" /> Render dell’edificio
    </Button>}
    {vista === "progetto" && localiVisibili[0] && <Button variant="outline" size="sm" className="w-full justify-start bg-background"
      disabled={!!fase || detta} onClick={() => { setTesto(`Tramezzo in ${localiVisibili[0].nome} a 1,50 m dal lato sinistro alto 2,80 m`); textarea.current?.focus(); }}>
      <Ruler className="h-4 w-4 text-primary" /> Proponi un tramezzo <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
    </Button>}
    {vista === "progetto" && localiVisibili.some(eAmbienteInterno) && <div className="flex flex-wrap gap-1.5">
      {[
        { nome: "Elettrico", richiesta: "Impianto elettrico per tutto il piano", Icona: Zap },
        { nome: "Idrico", richiesta: "Impianto idrico per tutto il piano", Icona: Droplet },
        { nome: "Controlla impianti", richiesta: "Controlla gli impianti", Icona: ScanSearch },
        { nome: "Lavori", richiesta: "Riepiloga i lavori", Icona: ClipboardList },
      ].map(({nome, richiesta, Icona}) => <Button key={nome} type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs"
        disabled={!!fase || detta} onClick={() => { setTesto(richiesta); textarea.current?.focus(); }}>
        <Icona className="size-3.5 text-primary" />{nome}
      </Button>)}
    </div>}
    {vista === "progetto" && base.tracciatiImpianti?.some(t=>t.linea==="scarico") && <Button variant="outline" size="sm" className="w-full justify-start bg-background"
      disabled={!!fase || detta} onClick={() => { setTesto("Proponi un percorso dello scarico che eviti gli incroci"); textarea.current?.focus(); }}>
      <Droplet className="h-4 w-4 text-primary" />Evita gli incroci dello scarico
    </Button>}
    {localiVisibili.some(eAmbienteInterno) && <Button variant="outline" size="sm" className="w-full justify-start bg-background"
      disabled={!!fase || detta} onClick={() => { setTesto("Arreda tutte le stanze"); textarea.current?.focus(); }}>
      <Armchair className="h-4 w-4 text-primary" /> Proponi gli arredi <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
    </Button>}
    {!!onApriStudioBilocali && !!localiVisibili.length && <Button variant="outline" size="sm" className="w-full justify-start bg-background"
      disabled={!!fase || detta} onClick={() => { setTesto("Posso ricavare tre bilocali?"); textarea.current?.focus(); }}>
      <Rows3 className="h-4 w-4 text-primary" /> Verifica un frazionamento <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
    </Button>}
    {!!localiVisibili.length && <Button variant="outline" size="sm" className="w-full justify-start bg-background"
      disabled={!!fase || detta} onClick={() => { setTesto("Controlla gli ingressi"); textarea.current?.focus(); }}>
      <DoorOpen className="h-4 w-4 text-primary" /> Controlla gli ingressi <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
    </Button>}
  </>;

  const azioneAnalisi = !pianoVuoto && <Button type="button" variant={analisi ? "secondary" : "outline"} size="sm"
    aria-expanded={analisi} className={inSilvio ? "h-8 shrink-0 gap-1.5 px-2 text-xs" : "w-full justify-start gap-2"}
    onClick={() => { setVerificheAperte(false); setAnalisi(v => !v); }}>
    <ScanSearch className={inSilvio ? "size-3.5" : "size-4"} />Analizza progetto
  </Button>;

  return <aside id={id} aria-label="Chat del disegno" className={aperta
    ? "pl-chat-panel z-10 flex h-[390px] min-h-0 shrink-0 flex-col border-t border-slate-200 bg-slate-50/90 lg:h-auto lg:w-[352px] lg:border-l lg:border-t-0 xl:w-[400px]"
    : "hidden"}>
    <div className={inSilvio ? "flex items-center gap-2 border-b bg-background px-3 py-2" : "flex items-center gap-3 border-b bg-background px-4 py-3.5"}>
      <span className={inSilvio
        ? "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/[.075] text-primary"
        : "grid size-10 shrink-0 place-items-center rounded-xl border border-primary/10 bg-primary/[.075] text-primary"}>
        <MessageSquare aria-hidden="true" className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{inSilvio ? "Silvio · Progetto" : "Chat del disegno"}</h2>
        {!inSilvio && <p className="truncate text-xs text-muted-foreground">{piano} · {vista === "fatto" ? "Com’è oggi" : "Progetto"}</p>}
      </div>
      {inSilvio && azioneAnalisi}
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Chiudi chat del disegno"
        disabled={inSilvio && (!!proposta || !!fase)} title={proposta ? "Scarta l’anteprima per chiudere la chat" : "Chiudi la chat"} onClick={onChiudi}><X className="h-4 w-4" /></Button>
    </div>
    {!inSilvio && azioneAnalisi && <div className="border-b px-3.5 py-2">{azioneAnalisi}</div>}

    <div ref={fondo} role="log" aria-label="Conversazione sulla planimetria" onScroll={e => {
      const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
      seguiConversazione.current = scrollHeight - clientHeight - scrollTop < 48;
    }} className={esitoSchizzo && verificheAperte
      ? "hidden" : proposta?.revisioneInterventi ? "min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-1.5" : "min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5"}>
      {aperta && analisi && <AnalisiProgettoPlanimetria
        documento={documentoAnalisi}
        ambito={vista === "progetto" ? `progetto:${contesto.propostaId ?? ID_PROPOSTA}` : "fatto"}
        anteprima={!!proposta} occupato={!!fase} />}
      {tramezzoSelezionato && !proposta && <Button variant="outline" size="sm" className="w-full justify-start gap-2"
        disabled={!!fase || detta} onClick={() => {
          setTesto(`Demolisci il tramezzo ${tramezzoSelezionato.id}`);
          textarea.current?.focus();
        }}><Eraser className="size-3.5 text-primary" />Proponi demolizione del tratto</Button>}
      {!messaggi.length && <div className="space-y-2.5">
        <div className={inSilvio ? "rounded-lg border border-primary/15 bg-background px-3 py-2.5" : "rounded-xl border border-primary/15 bg-gradient-to-br from-background to-primary/[.035] px-3.5 py-4"}>
          <h3 className="text-base font-semibold tracking-tight">{inSilvio ? "Cosa vuoi cambiare?" : "Cosa vuoi disegnare?"}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{inSilvio
            ? "Indica il lavoro e il locale per vedere cosa cambia nella pianta e nel computo."
            : "Descrivi il lavoro o detta le misure. Puoi vedere e rivedere ogni modifica direttamente sulla tavola."}</p>
        </div>
        {(pianoVuoto || !!localiVisibili.length) && <Button variant="outline" size="sm" className="w-full justify-start bg-background text-muted-foreground hover:text-foreground" disabled={!!fase || detta}
          onClick={() => { setTesto(localiVisibili[0] ? "Misura " + localiVisibili[0].nome : ESEMPIO); textarea.current?.focus(); }}>
          <ScanLine className="h-4 w-4 text-primary" /> {localiVisibili[0] ? "Misura un locale" : "Prova cucina e ingresso"} <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
        </Button>}
        {inSilvio && vista === "progetto" && base.muri.some(m => m.tipo === "tramezzo" && m.stato === "nuovo" && !funzionePareteDaVerificare(m)) && <Button
          type="button" variant="outline" size="sm" className="w-full justify-start bg-background"
          disabled={!!fase || detta} onClick={() => { setTesto("Sposta il tramezzo di 20 cm verso "); textarea.current?.focus(); }}>
          <Ruler aria-hidden="true" className="h-4 w-4 text-primary" /> Sposta un tramezzo <ArrowUpRight aria-hidden="true" className="ml-auto h-3.5 w-3.5" />
        </Button>}
        {inSilvio ? <details className="rounded-lg border bg-background px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-700">Altri comandi</summary>
          <div className="mt-2 space-y-2">{altriComandi}</div>
        </details> : altriComandi}
      </div>}
      {messaggi.map((m, i) => <div key={m.id ?? i} className={`pl-chat-message rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${m.ruolo === "utente"
        ? "ml-auto max-w-[94%] rounded-br-sm bg-primary/10"
        : "mr-auto w-full rounded-bl-sm border bg-background shadow-sm"}`}>
        {m.dalPreventivo && <p className="mb-0.5 text-xs font-medium text-muted-foreground">Chat preventivo</p>}
        <p className={m.fatti?.length ? "flex items-center gap-2 font-semibold" : "whitespace-pre-wrap break-words"}>
          {!!m.fatti?.length && <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />}{m.testo}
        </p>
        {!!m.fatti?.length && <ul className="mt-2 divide-y divide-border/60 border-t border-border/70" aria-label="Risultati sulla tavola">
          {m.fatti.map((fatto, j) => {
            const e = fatto.evidenza;
            const attiva = !!e && selezione?.id === e.id && selezione.tipo === e.tipo;
            return <li key={j}><RisultatoRiga risultato={fatto} attiva={attiva}
              onEvidenzia={e && !fase && localizzabile(e) ? () => onEvidenzia(e) : undefined} /></li>;
          })}
        </ul>}
        {!!m.viste?.length && <div className="mt-2 flex flex-wrap gap-2">
          {m.viste.map(v => <Button key={v} variant="outline" size="sm" disabled={!!fase || !!proposta || detta} onClick={() => onVista?.(v)}>
            {v === "3d" ? <Box className="size-4" /> : <ImageIcon className="size-4" />}
            {etichettaVista(v)}
          </Button>)}
        </div>}
        {m.studio && <Button variant="outline" size="sm" className="mt-2" disabled={!!fase || !!proposta || detta}
          onClick={() => onApriStudioBilocali?.(m.studio!)}>Apri studio bilocali</Button>}
        {!!m.avvisi?.length && <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-xs leading-relaxed text-amber-900">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
          <ul className="min-w-0 space-y-1 break-words">{m.avvisi.map((nota, j) => <li key={j}>{nota}</li>)}</ul>
        </div>}
      </div>)}
      {schizzo && !proposta && <SchizzoChatScheda file={schizzo.ritaglioFile ?? schizzo.raddrizzato?.file ?? schizzo.file} nome={schizzo.nome} primaPagina={schizzo.pagine > 1} ritagliato={!!ritaglio} raddrizzato={!!schizzo.raddrizzato}
        abilitato={puoLeggereSchizzo} occupato={!!fase || detta} lettura={schizzo.lettura ?? null} riferimento={riferimentoSchizzo} misura={misuraSchizzo}
        piuQuote={piuQuote} onPiuQuote={setPiuQuote}
        onMisura={setMisuraSchizzo} onRiferimento={id => {
          const scelto = schizzo.lettura?.riferimenti.find(r => r.id === id);
          if (scelto) scegliScala(scelto);
        }}
        onLeggi={() => void analizzaSchizzo()} onCostruisci={() => void costruisciSchizzo()}
        onRitaglia={() => setRitagliando(true)} onRaddrizza={() => setRaddrizzando(true)}
        onSfondo={() => void usaSchizzoComeSfondo()} onRimuovi={() => setSchizzo(null)} />}
      {!proposta && !fase && base.letturaDocumento && <Button type="button" variant="outline" size="sm" className="w-full justify-start bg-background"
        onClick={onApriConfronto}><Focus className="h-4 w-4" /> Apri verifiche dell’originale</Button>}
      {cad && <div className="space-y-2.5 rounded-xl border bg-background p-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate" title={cad.originale.name}>{cad.originale.name}</span>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={!!fase} aria-label="Rimuovi allegato DWG" onClick={() => setCad(null)}><X className="h-3.5 w-3.5" /></Button>
        </div>
        <img ref={anteprimaCad} alt="Anteprima della tavola DWG" className="max-h-32 w-full rounded border bg-muted/30 object-contain" />
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={!!fase} onClick={() => setRitagliando(true)}>{ritaglio ? "Modifica ritaglio" : "Ritaglia il piano"}</Button>
          <Button size="sm" variant="ghost" disabled={!!fase || !!proposta || originaleProtetto} onClick={() => void usaCadComeRiferimento()}>Usa come sfondo</Button>
        </div>
        {puoRicostruire ? <>
          <label className="flex items-center justify-between gap-2 text-xs">Unità del DWG
            <select className="h-8 min-w-28 rounded-md border bg-background px-2" disabled={!!fase} value={unita} onChange={e => setUnita(e.target.value)}>
              <option value="">Scegli</option>
              {Object.entries(UNITA_DWG).map(([chiave, nome]) => <option key={chiave} value={chiave}>{nome}</option>)}
            </select>
          </label>
          <Button size="sm" className="w-full" disabled={!!fase || !unitaDwgValida(Number(unita))} onClick={() => void ricostruisciCad()}>Ricostruisci il piano</Button>
        </> : <p className="text-xs text-muted-foreground">{originaleProtetto ? "Questo piano ha già un DWG di riferimento. Apri un piano vuoto per importare la nuova tavola." : "La ricostruzione richiede un piano vuoto in «Com’è oggi» e una tavola DWG con coordinate leggibili."}</p>}
      </div>}
    </div>
    {esitoSchizzo && proposta && verificheAperte && <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
      <SchizzoVerificheChat file={esitoSchizzo.file} proporzione={esitoSchizzo.proporzioneFoto ?? esitoSchizzo.proporzione}
        pianta={proposta.pianta} fotoRaddrizzata={!!schizzo?.raddrizzato} seleziona={onVerifica} />
    </div>}

    {fase && <div className="pl-chat-proposta shrink-0 space-y-2 border-t border-primary/20 bg-background px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ScanLine className="size-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p role="status" className="text-xs font-semibold text-primary">{fase.testo}</p>
          {fase.ultimo && <p key={fase.completati} className="pl-chat-message truncate text-xs text-muted-foreground" title={fase.ultimo}>{fase.ultimo.split("\n")[0]}</p>}
        </div>
        {fase.totale > 0 && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fase.completati}/{fase.totale}</span>}
      </div>
      {fase.totale > 0 && <div className="h-1 overflow-hidden rounded-full bg-primary/10" role="progressbar"
        aria-label="Passaggi del disegno" aria-valuemin={0} aria-valuemax={fase.totale} aria-valuenow={fase.completati}>
        <div className="pl-chat-progress-value h-full rounded-full bg-primary" style={{ transform: `scaleX(${fase.completati / fase.totale})` }} />
      </div>}
      {fase.totale > 1 && <button type="button" className="rounded text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-primary"
        onClick={() => { spostaFocusEsito.current = true; saltaAnimazione.current?.(); }}>Vai al risultato</button>}
    </div>}
    {proposta && !fase && <div className={`pl-chat-proposta flex flex-col gap-2 overflow-hidden border-t border-primary/20 bg-primary/[.055] px-3.5 py-3 ${inSilvio ? "min-h-0 shrink" : "shrink-0"} ${proposta.revisioneInterventi ? "max-h-[74%]" : "max-h-[65%]"}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
        <h3 ref={titoloEsito} tabIndex={-1} className="rounded font-semibold text-primary focus-visible:outline-primary">Anteprima modifiche</h3>
        <span className="tabular-nums text-muted-foreground">{superfici.locali} {superfici.locali === 1 ? "locale" : "locali"} · {FORMATO.format(superfici.metriQuadri)} m² netti{superfici.stimata || proposta.riferimento?.schizzo ? " stimati" : ""}</span>
      </div>
      {deltaMetratura !== 0 && <div aria-label="Superficie netta prima e dopo" className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted-foreground">
        <span>{FORMATO.format(superfici.prima!)} → {FORMATO.format(superfici.metriQuadri)} m²</span>
        <span className="rounded-md bg-background px-1.5 py-0.5 font-semibold text-foreground">{deltaMetratura > 0 ? "+" : "−"}{FORMATO.format(Math.abs(deltaMetratura))} m²</span>
      </div>}
      {proposta.revisioneInterventi ? <InterventiChatDisegno proposta={proposta} revisione={proposta.revisioneInterventi} vista={vista} contesto={contesto}
        consentiListino={!!consentiListino} onModifica={r => onMostra(anteprimaInterventi(r))} onPosizione={onInquadraPunto}
        onEvidenzia={e => onEvidenzia(e, true)} />
        : proposta.confrontoTramezzo && <EsitoSpostamentoTramezzo confronto={proposta.confrontoTramezzo} />}
      <div className="flex shrink-0 flex-wrap gap-1.5 lg:flex-nowrap">
        <Button size="sm" className={`pl-chat-controllo flex-1 px-2 text-xs ${inSilvio && onRivediNelComputo ? "xl:hidden" : ""}`} disabled={!propostaChatApplicabile(proposta) || (!!onRivediNelComputo && !puoRivedereNelComputo)}
          onClick={onRivediNelComputo ?? (() => void applicaProposta(proposta))}><Check className="hidden size-3.5 xl:block" />
          {onRivediNelComputo ? inSilvio ? "Rivedi modifiche" : "Rivedi nel computo" : "Applica alla pianta"}</Button>
        {vista === "progetto" && onCreaAlternativa && proposta.revisioneInterventi && <Button type="button" variant="outline" size="sm" className="gap-1 px-2 text-xs"
          disabled={!propostaChatApplicabile(proposta)} onClick={() => setNomeAlternativa("")}><Rows3 className="hidden size-3.5 xl:block" /> Crea alternativa</Button>}
        <Button size="sm" variant="outline" className="pl-chat-controllo px-2 text-xs" onClick={() => {
          onMostra(null);
          setVerificheAperte(false);
          aggiungi({ ruolo: "assistente", testo: "Anteprima scartata." });
          textarea.current?.focus({ preventScroll: true });
        }}>Scarta</Button>
      </div>
      {(esitoSchizzo || proposta.riferimento) && <div className="flex shrink-0 flex-wrap gap-1">
        {esitoSchizzo && <Button type="button" variant={verificheAperte ? "secondary" : "ghost"} size="sm" className="h-7 gap-1.5 px-1.5 text-xs"
          aria-expanded={verificheAperte} disabled={!!fase} onClick={() => { setVerificheAperte(v => !v); onVerifica(null); }}>
          <Focus className="h-3.5 w-3.5" /> {verificheAperte ? "Torna alla chat" : "Verifiche sullo schizzo (" + (proposta.pianta.letturaDocumento?.verifiche?.length ?? 0) + ")"}
        </Button>}
        {proposta.riferimento && <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-1.5 text-xs"
        aria-pressed={mostraFonte} disabled={!!fase} onClick={onCambiaFonte}>
          <ScanLine className="h-3.5 w-3.5" /> {proposta.riferimento.schizzo ? "Sovrapponi lo schizzo" : "Sovrapponi la tavola DWG"}
        </Button>}
      </div>}
    </div>}
    <Dialog open={nomeAlternativa !== null && !!proposta} onOpenChange={open => { if (!open) setNomeAlternativa(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Crea alternativa</DialogTitle><DialogDescription>Inserisci il nome della nuova variante per ritrovarla nel confronto.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          const nome = nomeAlternativa?.trim();
          if (!nome || !proposta || !propostaChatApplicabile(proposta) || !onCreaAlternativa?.(proposta, nome)) return;
          setNomeAlternativa(null);
          aggiungi({ ruolo: "assistente", testo: `Alternativa «${nome}» pronta da salvare.` });
        }}>
          <label className="block text-sm font-medium">Nome alternativa<Input className="mt-1" value={nomeAlternativa ?? ""} onChange={e => setNomeAlternativa(e.target.value)} maxLength={80} /></label>
          <DialogFooter><Button type="submit" disabled={!nomeAlternativa?.trim()}>Aggiungi alternativa</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {applicata && !proposta && !fase && <section aria-label="Dopo l’applicazione" className="pl-chat-proposta shrink-0 border-t border-emerald-600/20 bg-emerald-500/[.07] px-3.5 py-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
          <Check className="size-3.5" aria-hidden="true" />
        </span>
        <h3 ref={titoloEsito} tabIndex={-1} className="rounded focus-visible:outline-primary">Modifiche applicate · da salvare</h3>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {onVista && !!pianta.muri.length && <Button type="button" variant="outline" size="sm" className="pl-chat-controllo h-7 px-2 text-xs" onClick={() => onVista("3d")}><Box className="size-3.5" /> Apri 3D</Button>}
        {vista === "progetto" && <Button type="button" variant="outline" size="sm" className="pl-chat-controllo h-7 px-2 text-xs" disabled={detta}
          onClick={() => invia("Riepiloga i lavori")}><ClipboardList className="size-3.5" /> Riepiloga lavori</Button>}
        {vista === "progetto" && onSalvaDaChat && <>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onSalvaDaChat("studio")}>Salva e confronta</Button>
          {consentiComputo && <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onSalvaDaChat("computo")}>Salva e apri computo</Button>}
        </>}
        {onAnnullaApplicazione && <Button type="button" variant="ghost" size="sm" className="pl-chat-controllo h-7 px-2 text-xs" onClick={() => {
          onAnnullaApplicazione();
          aggiungi({ ruolo: "assistente", testo: "Ultima modifica annullata." });
          textarea.current?.focus({ preventScroll: true });
        }}><Undo2 className="size-3.5" /> Annulla applicazione</Button>}
      </div>
    </section>}
    <div className={esitoSchizzo && verificheAperte ? "hidden" : "shrink-0 space-y-2 border-t bg-background p-3"}>
      {(avviso || detta) && <p role="status" className="text-xs text-muted-foreground">{detta ? "In ascolto. Tocca il microfono per terminare." : avviso}</p>}
      <ThinkingPromptInput compact inline value={testo} onValueChange={setTesto} onSubmit={() => invia()} onStop={ferma}
        label="Scrivi alla chat del disegno" placeholder={inSilvio ? "Es. Sposta il tramezzo di 20 cm verso il garage" : "Es. Bagno 2,40 × 2,50 m"} busy={!!fase}
        disabled={detta} maxLength={MAX_TESTO} textareaRef={el => { textarea.current = el; }}
        tools={<>
          <input ref={fileInput} type="file" className="hidden" aria-label="File per la planimetria"
            accept={`.txt,text/plain,${ACCETTA_DOCUMENTO_PIANTA}${dwgDisponibile() ? ",.dwg" : ""}`}
            onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void allega(file); }} />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Allega alla chat" title={proposta ? "Applica o scarta prima di allegare un file" : "Allega schizzo, PDF, DWG o appunti"}
            disabled={!!fase || !!proposta || detta} onClick={() => fileInput.current?.click()}><Paperclip className="h-4 w-4" /></Button>
          <Button type="button" variant={detta ? "secondary" : "ghost"} size="icon" className="h-8 w-8" aria-pressed={detta}
            aria-label={detta ? "Termina dettatura" : "Detta un comando"} title={dettaturaDisponibile() ? "Detta un comando" : "Dettatura non disponibile in questo browser"}
            disabled={!!fase} onClick={cambiaDettatura}>{detta ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button>
        </>} />
    </div>
    {aperta && ritagliando && (cad || schizzo) && <Suspense fallback={<p role="status" className="sr-only">Apro il ritaglio…</p>}>
      <RitaglioDocumentoPianta file={(cad?.lettura.file ?? schizzo?.raddrizzato?.file ?? schizzo?.file)!} iniziale={ritaglio} onChiudi={() => setRitagliando(false)}
        onConferma={r => {
          setRitaglio(r);
          setSchizzo(s => s && { ...s, lettura: undefined, ritaglioFile: undefined });
          setRitagliando(false);
        }} />
    </Suspense>}
    {aperta && raddrizzando && schizzo && <Suspense fallback={<p role="status" className="sr-only">Apro la correzione della prospettiva…</p>}>
      <RaddrizzaSchizzo file={schizzo.file} iniziali={schizzo.raddrizzato?.angoli} onChiudi={() => setRaddrizzando(false)}
        onConferma={(file, angoli) => {
          setSchizzo(s => s && { ...s, raddrizzato: { file, angoli }, lettura: undefined, ritaglioFile: undefined });
          setRitaglio(null);
          setRaddrizzando(false);
          setAvviso("");
          aggiungi({ ruolo: "assistente", testo: "Foto raddrizzata. Ora posso leggere segni e quote sul foglio corretto." });
        }}
        onRipristina={() => {
          setSchizzo(s => s && { ...s, raddrizzato: undefined, lettura: undefined, ritaglioFile: undefined });
          setRitaglio(null);
          setRaddrizzando(false);
          setAvviso("");
        }} />
    </Suspense>}
  </aside>;
}

function EsitoSpostamentoTramezzo({ confronto }: { confronto: ConfrontoTramezzoChat }) {
  const formato = (n: number | null) => n === null ? "Da verificare" : FORMATO.format(n);
  return <div className="min-h-0 flex-auto space-y-2 overflow-y-auto overscroll-contain rounded-lg border bg-background p-2 text-xs" aria-label="Spostamento del tramezzo">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
      <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed border-amber-700" />Prima</span>
      <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-teal-700" />Proposta · {FORMATO.format(confronto.distanzaCm)} cm</span>
    </div>
    {!!confronto.interferenze.length && <div className="flex gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-950" role="status">
      <TriangleAlert className="size-4 shrink-0" /><div>
        <p className="font-semibold">Rivedi lo spostamento</p>
        {[...new Set(confronto.interferenze.map(i => i.testo))].map(t => <p key={t}>{t}</p>)}
      </div>
    </div>}
    {!!confronto.righe.length && <table className="w-full" aria-label="Quantità del computo prima e dopo">
      <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Voce del computo</th><th className="font-medium">Prima</th><th className="font-medium">Dopo</th></tr></thead>
      <tbody className="divide-y">
        {confronto.righe.map(r => <tr key={r.id}>
          <th scope="row" className="py-1 pr-2 text-left font-normal">{r.descrizione} · {r.unita}</th>
          <td className="whitespace-nowrap pr-2 tabular-nums">{formato(r.prima)}</td>
          <td className="whitespace-nowrap font-medium tabular-nums">{formato(r.dopo)}</td>
        </tr>)}
      </tbody>
    </table>}
  </div>;
}

function RisultatoRiga({ risultato, attiva, onEvidenzia }: { risultato: Risultato; attiva: boolean; onEvidenzia?: () => void }) {
  const [intestazione, ...righe] = risultato.testo.split("\n");
  const [titolo, ...dettagli] = intestazione.split(" · ");
  const Icona = titolo === "Porta" ? DoorOpen : titolo === "Finestra" ? AppWindow : risultato.evidenza?.tipo === "locale" ? SquareDashed
    : risultato.evidenza?.tipo === "muro" ? Ruler : ScanLine;
  const corpo = <>
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/[.07] text-primary"><Icona className="h-3.5 w-3.5" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1">
      <span className="block break-words font-medium leading-snug text-foreground">{titolo}</span>
      {!!dettagli.length && <span className="mt-0.5 block break-words text-xs leading-snug text-muted-foreground">{dettagli.join(" · ")}</span>}
      {!!righe.length && <span className="mt-2 block whitespace-pre-line break-words text-xs leading-relaxed">{righe.join("\n")}</span>}
    </span>
  </>;
  if (!onEvidenzia) return <div className={`flex gap-2 py-2 ${righe.length ? "items-start" : "items-center"}`}>{corpo}</div>;
  return <button type="button" onClick={onEvidenzia} title="Evidenzia sulla tavola" aria-label={`Evidenzia ${titolo} sulla tavola`} aria-pressed={attiva}
    className="flex w-full items-center gap-2 rounded-lg py-2 pr-1 text-left transition-colors hover:bg-primary/[.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 aria-pressed:bg-primary/[.07]">
    {corpo}<Focus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
  </button>;
}
