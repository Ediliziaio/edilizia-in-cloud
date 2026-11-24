import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * Editor delle planimetrie, pensato per il titolare d'impresa: stanze, pareti,
 * porte e finestre, misure scritte sopra la parete, stato di oggi e progetto.
 *
 * Sul telefono (o con `soloVista`) si guarda, si sposta, si ingrandisce e si
 * correggono le misure toccando una parete o una stanza; non si disegna.
 *
 * Disegno in SVG (vedi README.md in questa cartella per il perché), logica nei
 * comandi puri di comandi.ts, annulla/ripeti in storia.ts.
 */
import { RilievoTerreno } from "./RilievoTerreno";
import { materialiDelProgetto } from "../../../../shared/planimetrie/materialiProgetto.ts";
import { TelaioStrutturale } from "./TelaioStrutturale";
import { generaTelaio, type ParametriTelaio } from "./telaio";
import type { Rilievo } from "../../../../shared/planimetrie/rilievo.ts";
import { altezzeLocale, falde, type AltezzeSottotetto } from "../../../../shared/planimetrie/sottotetto.ts";
import { calcolaQuantita } from "../../../../shared/planimetrie/quantita.ts";
import type { ArchivioRicalco } from "@/lib/planimetrie/ricalco";
import { calibraRicalco, riallineaPianoAllaTavola } from "@/lib/planimetrie/calibrazioneTavola";
import { FINITURE_TETTO, NOMI_FINITURA_TETTO, scalaModelloDaVerificare, validaPlanimetria, type FinituraTetto, type Ricalco, type RiscontroScalaModello, type Tetto } from "../../../../shared/planimetrie/modello.ts";
import { eAmbienteInterno, funzionePareteDaVerificare, NOMI_AREA, TIPI_AREA, type CollettoreRadiante, type TipoArea, type ZonaRadiante } from "../../../../shared/planimetrie/modello.ts";
import { baricentro, STILE_AREA } from "./disegno";
import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { flushSync } from "react-dom";
import { AppWindow, Armchair, Ellipsis, Eraser, Grid3x3, Hexagon, ImageIcon, Layers, Trees, DoorOpen, Magnet, Maximize2, MessageSquare, Minus, Mountain, MousePointer2, MoveHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PenLine, Play, Plus, Redo2, Ruler, Scissors, SlidersHorizontal, Square, StretchHorizontal, Type, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { messaggioParetiBloccate, paretiBloccateToccate } from "../../../../shared/planimetrie/vincoli.ts";
import {
  DESTINAZIONI,
  aPlanimetria,
  ID_PROPOSTA,
  aggiungiLivello,
  aggiornaQuote,
  daPlanimetria,
  datiVista,
  duplicaProposta,
  prossimaProposta,
  eliminaLivello,
  eliminaProposta,
  rinominaProposta,
  piantaVuota,
  rinominaLivello,
  impostaRicalco,
  type BaseNuovoPiano,
  type Destinazione,
  type Pianta,
  type Planimetria,
  type Punto,
  type TipoApertura,
} from "./adattatore";
import { copiaGruppoSuTuttiIPiani, copiaSuTuttiIPiani } from "@/lib/planimetrie/copiaSuiPiani";
import * as C from "./comandi";
import { applicaModificaCad, NOMI_COMANDI_CAD, preparaModificaCad, riferimentoCadVisibile, type ComandoCad } from "./comandiCad";
import { aggancia, angoliEsistenti, direzione, dist, muroPiuVicino, puntoSulMuro, type Aggancio } from "./geometria";
import { contornoIncrociato } from "../../../../shared/planimetrie/geometria.ts";
import { leggiMisura, scriviMetri } from "./misure";
import { PannelloDettagli, type AzioniPannello } from "./PannelloDettagli";
import { CATALOGO, GRUPPI_CATALOGO, urlImmagineSimbolo, type VoceCatalogo } from "./catalogo";
import { SimboloArredo } from "./SimboloArredo";
import { arredaStanza, climaStanza, impiantoElettrico, magliaPilastri, riscaldamentoStanza } from "./arreda";
import { attraversamentiImpianto, btuConsigliati, chiaveTratto, metriConSfrido, percorsoConVertici, percorsiImpianti } from "../../../../shared/planimetrie/impianti.ts";
import { COLORE_RADIANTE, zoneRadianti } from "../../../../shared/planimetrie/pavimentoRadiante.ts";
import { puntoNelPoligono } from "../../../../shared/planimetrie/geometria.ts";
import { COLORI_LINEE } from "./TelaPlanimetria";
import { annulla, esegui, nuovaStoria, ripeti, type Storia } from "./storia";
import { TelaPlanimetria, type AnimazioneChatTela, type Camera, type Selezione, type SfondoRicalco, type Sovrapposizioni } from "./TelaPlanimetria";
import { ConfrontoDocumentoPianta, type SorgenteDocumentoPianta } from "../ConfrontoDocumentoPianta";
import { FrazionamentoDialog } from "./FrazionamentoDialog";
import { StudioBilocaliDialog } from "./StudioBilocaliDialog";
import type { AvvioStudioBilocali } from "@/lib/planimetrie/studioBilocali";
import { nuovoFascicoloUrbanistico } from "../../../../shared/planimetrie/urbanistica.ts";
import { ChatDisegnoPlanimetria } from "./ChatDisegnoPlanimetria";
import type { PassoChatDisegno, VistaChatDisegno } from "./comandiChat";
import { muriSottoPennello, segnaDemolizioniDalPennello } from "./pennelloDemolizioni";
import { NOMI_LINEE, TracciatiImpianti } from "./TracciatiImpianti";
import { AccessoAbachiPianta } from "../AccessoAbachiPianta";
import { DisegnoLayerDwg, LayerDwg, vistaLayerDwgIniziale } from "./LayerDwg";
import { CoordinateDisegno } from "./CoordinateDisegno";
import { creaAlternativaInterventi, piantaDaApplicare, propostaChatApplicabile } from "./interventiChat";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { Anteprima3DEditor } from "./Anteprima3DEditor";
import { DivisoreAnteprima3D, QUOTA_PIANTA_INIZIALE } from "./DivisoreAnteprima3D";
import { NordPianta } from "./NordPianta";
import "./anteprima-3d.css";
import { useSottoLarghezza } from "@/hooks/useSottoLarghezza";

const NESSUN_LATO_MODIFICABILE: ReadonlySet<string> = new Set();
const VISTE_CONFRONTO_CHAT = [["prima", "Prima"], ["differenze", "Differenze"], ["dopo", "Dopo"]] as const;

export type Strumento = "seleziona" | "stanza" | "poligono" | "area" | "parete" | "demolizioni" | "porta" | "finestra" | "arredo" | "quota" | "testo" | ComandoCad;

const eComandoCad = (s: Strumento): s is ComandoCad => s === "taglia" || s === "estendi" || s === "offset";
const ICONE_COMANDI_CAD = { taglia: Scissors, estendi: MoveHorizontal, offset: StretchHorizontal };

type StrumentoPunto = "parete" | "quota" | "poligono" | "area";
const eStrumentoPunto = (s: Strumento): s is StrumentoPunto => s === "parete" || s === "quota" || s === "poligono" || s === "area";
const NOMI_STRUMENTI_PUNTO: Record<StrumentoPunto, string> = { parete: "Parete", quota: "Quota", poligono: "Stanza libera", area: "Area esterna" };

type Calibrazione = { fase: "primo" } | { fase: "secondo"; primo: Punto }
  | { fase: "misura"; primo: Punto; secondo: Punto; metri: string; ridimensiona: boolean; diProva: boolean; errore?: string };

export type ControlliEditorPlanimetria = { evidenzia: (oggetto: Selezione, vista: C.Vista) => void };

interface Props {
  companyId?: string;
  /** Il documento della fase 1 (`shared/planimetrie/modello.ts`); senza, una pianta vuota. */
  piantaIniziale?: Planimetria;
  livelloIniziale?: string;
  propostaIniziale?: string;
  muroIniziale?: string;
  /** Ogni modifica completa dà il documento aggiornato, pronto per il salvataggio. */
  onChange?: (planimetria: Planimetria) => void;
  onContesto?: (livelloId: string | undefined, ambito: string) => void;
  onAnteprimaChat?: (occupata: boolean) => void;
  /** Quando il disegno è aperto da un computo, lavoriamo nel suo piano e nella sua variante. */
  ambitoComputo?: { livelloId: string; propostaId: string | null };
  inSilvio?: boolean;
  onSelezione?: (oggetto: Selezione | null) => void;
  controlli?: Ref<ControlliEditorPlanimetria>;
  onPropostaComputo?: (anteprima: { documento: Planimetria; applicabile: boolean } | null) => void;
  onRivediNelComputo?: () => void;
  puoRivedereNelComputo?: boolean;
  onVisteChat?: (tipo: VistaChatDisegno, documento: Planimetria, vista: C.Vista, propostaId: string, livelloId?: string) => void;
  anteprima3DAperta?: boolean;
  onChiudiAnteprima3D?: () => void;
  onApri3DCompleto?: (documento: Planimetria, vista: C.Vista, propostaId: string, livelloId?: string) => void;
  onSalvaDaChat?: (destinazione: "studio" | "computo") => void;
  consentiComputoChat?: boolean;
  consentiListinoChat?: boolean;
  /** Forza la vista da telefono (solo guardare e correggere misure). */
  soloVista?: boolean;
  className?: string;
  /** Dove si salva l'immagine da ricalcare; senza, resta solo finché la pagina è aperta. */
  ricalco?: ArchivioRicalco;
  sorgenteDocumento?: SorgenteDocumentoPianta;
}

type Gesto =
  | { tipo: "pan"; da: Punto; camera: Camera; mosso: boolean; bersaglio: Bersaglio | null; tracciato?: boolean }
  | { tipo: "pinch"; distanza: number; centro: Punto; camera: Camera }
  | { tipo: "demolizioni"; ultimo: Punto; prima: Sovrapposizioni["demolizioni"] }
  | { tipo: "rettangolo"; a: Punto }
  | { tipo: "riquadro"; a: Punto }
  | { tipo: "sposta-gruppo"; da: Punto; base: Pianta; gruppo: C.Gruppo; mosso: boolean }
  | { tipo: "sposta-muro"; id: string; da: Punto; base: Pianta; normale: Punto }
  | { tipo: "maniglia"; id: string; da: Punto; altro: Punto; base: Pianta }
  | { tipo: "sposta-apertura"; id: string; base: Pianta; da: Punto; mosso: boolean; eraSelezionata: boolean }
  | { tipo: "apertura-nuova"; quale: TipoApertura; da: Punto; mosso: boolean }
  | { tipo: "sposta-elemento"; id: string; da: Punto; centro: Punto; base: Pianta; mosso: boolean }
  | { tipo: "sposta-testo"; id: string; da: Punto; posizione: Punto; base: Pianta; mosso: boolean }
  | { tipo: "sposta-area"; id: string; da: Punto; contorno: Punto[]; base: Pianta; mosso: boolean }
  | { tipo: "sposta-quota"; id: string; da: Punto; base: Pianta; normale: Punto; scostamento: number; mosso: boolean };

interface Bersaglio {
  tipo: string;
  id?: string;
  lato?: number;
  estremo?: "p1" | "p2";
  elemento: Element;
}

interface MisuraInModifica {
  chiave: string;
  x: number;
  y: number;
  testo: string;
  applica: (cm: number) => void;
}

const SUGGERIMENTI: Record<Exclude<Strumento, ComandoCad>, string> = {
  demolizioni: "Passa sui tramezzi da segnare nella variante. Controlla il gruppo prima di confermarlo.",
  seleziona: "Tocca una stanza, una parete o una porta per vederne le misure. Trascina una parete per spostarla. Clic su una misura per correggerla. Maiusc+trascina seleziona più arredi, quote e testi.",
  stanza: "Trascina per disegnare la stanza: le misure compaiono mentre la disegni. Oppure usa «Scrivi le misure».",
  parete: "Clic per l'inizio, clic per la fine: la parete va dritta da sola. Puoi anche scrivere la lunghezza e premere Invio. Esc per finire.",
  porta: "Trascina la porta su una parete (o clicca sulla parete). Poi un clic sulla porta selezionata ne gira il verso.",
  finestra: "Trascina la finestra su una parete (o clicca sulla parete).",
  poligono: "Clic su ogni angolo della stanza; clic sul primo punto (o Invio) per chiuderla. Le pareti vanno dritte a 90° e 45° da sole. Esc per annullare.",
  area: "Clic su ogni angolo dell'area (lotto, prato, vialetto…); clic sul primo punto o Invio per chiuderla. Esc per annullare.",
  arredo: "Clic sul foglio per posare l'arredo scelto. Poi trascinalo per spostarlo; R lo ruota di 90°.",
  quota: "Clicca due punti. Se agganci un estremo, un punto medio o un’intersezione, la quota segue la parete.",
  testo: "Clic dove vuoi la scritta, poi scrivila nel pannello a destra.",
};

/** Sul telefono: niente tastiera, niente clic e Maiusc; si tocca e si trascina col dito. */
const SUGGERIMENTI_TELEFONO: Record<Exclude<Strumento, ComandoCad>, string> = {
  demolizioni: "Passa con il dito sui tramezzi e controlla il gruppo prima di confermarlo.",
  seleziona: "Tocca una stanza, una parete o una porta: sotto compaiono le misure da correggere. Trascina una parete per spostarla.",
  stanza: "Trascina col dito per disegnare la stanza, oppure usa «Scrivi le misure».",
  parete: "Tocca l'inizio e poi la fine: la parete va dritta da sola.",
  porta: "Tocca la parete dove va la porta. Toccala di nuovo per girarne il verso.",
  finestra: "Tocca la parete dove va la finestra.",
  poligono: "Tocca ogni angolo della stanza; tocca il primo punto per chiuderla.",
  area: "Tocca ogni angolo dell'area; tocca il primo punto per chiuderla.",
  arredo: "Tocca il foglio per posare l'arredo, poi trascinalo dove va.",
  quota: "Tocca il primo punto e poi il secondo: la quota misura da sola.",
  testo: "Tocca dove vuoi la scritta, poi scrivila qui sotto.",
};

export default function EditorPlanimetria({ companyId, piantaIniziale, livelloIniziale, propostaIniziale, muroIniziale, onChange, onContesto,
  onAnteprimaChat, onVisteChat, anteprima3DAperta, onChiudiAnteprima3D, onApri3DCompleto,
  onSalvaDaChat, consentiComputoChat, consentiListinoChat, soloVista, className, ricalco: archivio, sorgenteDocumento,
  ambitoComputo, inSilvio, onSelezione, controlli, onPropostaComputo, onRivediNelComputo, puoRivedereNelComputo }: Props) {
  const telefono = useIsMobile();
  // Tablet (sotto 1280 px, iPad in orizzontale compreso): gli strumenti restano tutti, ma la barra scorre su una riga e il pannello delle stanze
  // sta sopra al disegno solo quando serve, invece di toglierne un terzo.
  const compatto = useSottoLarghezza(1280);
  const [pannelloAperto, setPannelloAperto] = useState(false);
  const anteprimaAffiancata = !!(anteprima3DAperta && onChiudiAnteprima3D);
  const idPianta2D = useId();
  const bottonePianta2D = useRef<HTMLButtonElement>(null);
  const focusMostraPianta = useRef(false);
  const [quotaPianta, setQuotaPianta] = useState(QUOTA_PIANTA_INIZIALE);
  const [piantaRipiegata, setPiantaRipiegata] = useState(false);
  const piantaNascosta = anteprimaAffiancata && piantaRipiegata;
  const mostraSolo3D = () => {
    focusMostraPianta.current = true;
    setPiantaRipiegata(true);
  };
  useLayoutEffect(() => {
    if (!piantaNascosta || !focusMostraPianta.current) return;
    focusMostraPianta.current = false;
    bottonePianta2D.current?.focus();
  }, [piantaNascosta]);
  const [confrontoAperto, setConfrontoAperto] = useState(!ambitoComputo && !!piantaIniziale?.letturaDocumento);
  const [frazionamento, setFrazionamento] = useState(false);
  const [studioBilocali, setStudioBilocali] = useState<AvvioStudioBilocali | null>(null);
  const [evidenzaId, setEvidenzaId] = useState<string>();
  const [schizzoSessione, setSchizzoSessione] = useState<SorgenteDocumentoPianta>();
  // Sul telefono di serie si guarda e si correggono le misure; «Modifica» apre tutti gli strumenti
  // (per chi disegna in cantiere, col dito: un tocco per gli angoli, due dita per spostarsi).
  const [modificaTelefono, setModificaTelefono] = useState(false);
  const sola = soloVista ?? (telefono && !modificaTelefono);

  // Il piano su cui si lavora (fase 5): ogni piano ha il suo annulla/ripeti.
  const pianoDiApertura = piantaIniziale?.livelli.find(piano => piano.id === (ambitoComputo?.livelloId ?? livelloIniziale)) ?? piantaIniziale?.livelli[0];
  const propostaRichiesta = pianoDiApertura?.proposte.find(p => p.id === (ambitoComputo ? ambitoComputo.propostaId : propostaIniziale))?.id;
  const propostaDiApertura = ambitoComputo ? propostaRichiesta : propostaRichiesta ?? pianoDiApertura?.proposte[0]?.id;
  const [livelloId, setLivelloId] = useState<string | undefined>(pianoDiApertura?.id);
  // L'alternativa di progetto su cui si lavora (A, B, C…).
  const [propostaId, setPropostaId] = useState<string>(propostaDiApertura ?? ID_PROPOSTA);
  const [storia, setStoria] = useState<Storia>(() => nuovaStoria(piantaIniziale ? daPlanimetria(piantaIniziale, pianoDiApertura?.id, propostaDiApertura) : piantaVuota()));
  const [anteprima, setAnteprima] = useState<Pianta | null>(null);
  const idChat = useId();
  const [chatAperta, setChatAperta] = useState(() => Boolean(inSilvio && !compatto && ambitoComputo?.propostaId && !soloVista));
  const [strumentiAperti, setStrumentiAperti] = useState(false);
  const strumentiVisibili = !ambitoComputo || strumentiAperti;
  // Sul telefono resta una sola riga in alto: piani, varianti, sfondo, comandi CAD e abachi stanno dietro «Altro».
  const [altroAperto, setAltroAperto] = useState(false);
  const idAltro = useId();
  const altroNascosto = telefono && !altroAperto;
  const [chatInCorso, setChatInCorso] = useState(false);
  const [passoChat, setPassoChat] = useState<PassoChatDisegno | null>(null);
  const [confrontoChat, setConfrontoChat] = useState<(typeof VISTE_CONFRONTO_CHAT)[number][0]>("differenze");
  const [applicazioneChat, setApplicazioneChat] = useState<{ pianta: Pianta; annullabile: boolean } | null>(null);
  const [animazioneChat, setAnimazioneChat] = useState<(AnimazioneChatTela & { quadro?: Pianta }) | null>(null);
  const numeroAnimazioneChat = useRef(0);
  const bottoneChat = useRef<HTMLButtonElement>(null);
  const [mostraFonteChat, setMostraFonteChat] = useState(false);
  const propostaChat = chatAperta ? passoChat : null;
  const bloccoChat = chatAperta && (chatInCorso || !!propostaChat);
  const propostaPronta = !!propostaChat && propostaChat.pianta !== storia.presente && !chatInCorso;
  const vistaPrimaChat = propostaPronta && confrontoChat === "prima";
  const vistaDifferenzeChat = propostaPronta && confrontoChat === "differenze";
  const applicataDallaChat = applicazioneChat?.pianta === storia.presente;
  const pianta = anteprima ?? propostaChat?.pianta ?? storia.presente;
  // L'ultimo documento prodotto: tiene titolo, arredi, altre proposte e gli id dei locali del progetto.
  const [baseDisegno, setBaseDisegno] = useState(() => ({
    documento: piantaIniziale ?? aPlanimetria(storia.presente, undefined, livelloId, propostaId),
    pianta: storia.presente,
  }));
  const documentoBase = useRef(baseDisegno.documento);
  // Immagine da ricalcare (mappa catastale, foto aerea, rilievo del lotto), per piano: si salva
  // nel documento (`Livello.ricalco`) se c'è un archivio, altrimenti resta finché la pagina è aperta.
  const [ricalco, setRicalco] = useState<Ricalco | null>(() => pianoDiApertura?.ricalco ?? null);
  const pianoDwg = /^cad-\d+$/.test(livelloId ?? "") || ricalco?.bloccata !== undefined;
  const ricalcoBloccato = ricalco?.bloccata ?? (pianoDwg && !!ricalco);
  const ricalcoCorrente = useRef({ ricalco, bloccata: ricalcoBloccato, livelloId });
  useLayoutEffect(() => {
    ricalcoCorrente.current = { ricalco, bloccata: ricalcoBloccato, livelloId };
  }, [ricalco, ricalcoBloccato, livelloId]);
  const [vistaLayerDwg, setVistaLayerDwg] = useState(vistaLayerDwgIniziale);
  const [riscontroScala, setRiscontroScala] = useState<RiscontroScalaModello | undefined>(pianoDiApertura?.riscontroScala);
  const [verificaScala, setVerificaScala] = useState<{ muroId: string; misura: string; errore?: string } | null>(null);
  const aggiornaSfondo = (nuovo: Ricalco | null) => {
    const prima = ricalcoCorrente.current;
    if (prima.bloccata && prima.ricalco) {
      if (nuovo) setRicalco({ ...prima.ricalco, opacita: nuovo.opacita });
      return;
    }
    const cambiaScala = nuovo ? nuovo.percorso !== ricalco?.percorso || nuovo.larghezzaCm !== ricalco?.larghezzaCm
      || nuovo.calibrata !== ricalco?.calibrata : ricalco?.calibrata === false;
    if (cambiaScala && (storia.presente.muri.length || storia.presente.locali.length)) setRiscontroScala({ stato: "da_verificare" });
    setRicalco(nuovo);
  };
  const caricaRicalco = async (file: File, signal?: AbortSignal) => {
    const piano = ricalcoCorrente.current.livelloId;
    const verifica = () => {
      if (ricalcoCorrente.current.livelloId !== piano) throw new Error("Il piano attivo è cambiato durante il caricamento.");
      if (documentoBase.current?.livelli.find(l => l.id === piano)?.tavolaDwg) throw new Error("Per sovrapporre un altro DWG o una foto usa una nuova planimetria.");
      if (ricalcoCorrente.current.bloccata) throw new Error("Sblocca l’originale dalla barra Layer DWG per sostituirlo.");
    };
    verifica();
    const proporzione = await new Promise<number>((ok, ko) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); ok(img.naturalHeight / Math.max(1, img.naturalWidth)); };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("Immagine non leggibile.")); };
      img.src = url;
    });
    signal?.throwIfAborted();
    verifica();
    const percorso = archivio ? await archivio.carica(file) : URL.createObjectURL(file);
    signal?.throwIfAborted();
    verifica();
    setCalibra(null);
    aggiornaSfondo({ percorso, x: 0, y: 0, larghezzaCm: ricalco?.larghezzaCm ?? 3000, proporzione, opacita: 0.5, calibrata: false });
  };
  const documentoConfermato = useMemo(() => {
    // Quando si registra un riscontro senza ridisegnare, conserva i contorni importati.
    const d = baseDisegno.pianta === storia.presente
      ? baseDisegno.documento
      : aPlanimetria(storia.presente, baseDisegno.documento, livelloId, propostaId, baseDisegno.pianta);
    // l'immagine locale (senza archivio) non entra nel documento
    const lid = livelloId ?? d.livelli[0]?.id;
    if (!lid) return d;
    const conSfondo = impostaRicalco(d, lid, ricalco && !ricalco.percorso.startsWith("blob:") ? ricalco : null);
    return { ...conSfondo, livelli: conSfondo.livelli.map(l => l.id === lid ? { ...l, riscontroScala } : l) };
  }, [storia.presente, livelloId, propostaId, ricalco, riscontroScala, baseDisegno]);
  const documento = useMemo(() => pianta !== storia.presente
    ? aPlanimetria(pianta, documentoConfermato, livelloId, propostaId, storia.presente)
    : documentoConfermato, [pianta, storia.presente, documentoConfermato, livelloId, propostaId]);
  const mostraProposta3D = !!propostaChat && propostaChat.pianta !== storia.presente && !vistaPrimaChat;
  const documento3D = mostraProposta3D ? documento : documentoConfermato;
  // l'ultimo stato del documento, per le azioni del pannello che lavorano su tutti i piani
  const pianiRef = useRef({ documento, livelloId, propostaId });
  useLayoutEffect(() => { pianiRef.current = { documento, livelloId, propostaId }; }, [documento, livelloId, propostaId]);
  const vaiAlPianoRef = useRef<(id: string, doc: Planimetria, proposta?: string) => void>(() => {});
  const [strumento, setStrumentoStato] = useState<Strumento>("seleziona");
  const [precisione, setPrecisione] = useState(true);
  const [riferimentoCad, setRiferimentoCad] = useState<string | null>(null);
  const [offsetCm, setOffsetCm] = useState("100");
  const [vista, setVista] = useState<C.Vista>(propostaRichiesta ? "progetto" : "fatto");
  const pavimentoComune = materialiDelProgetto(documento, vista === "fatto" ? "fatto" : `progetto:${propostaId}`).pavimento;
  const [selezione, setSelezione] = useState<Selezione | null>(muroIniziale ? { tipo: "muro", id: muroIniziale } : null);
  // Più arredi, quote e testi insieme (Maiusc+clic o Maiusc+trascina).
  const [gruppo, setGruppo] = useState<C.Gruppo>(C.gruppoVuoto);
  // Linee stimate degli impianti, dal quadro / collettore / colonna / unità esterna.
  const [mostraLinee, setMostraLinee] = useState(false);
  const [posaCollettore, setPosaCollettore] = useState<Omit<CollettoreRadiante, "posizione"> | null>(null);
  const [pannelloTracciati, setPannelloTracciati] = useState(false);
  const [trattoId, setTrattoId] = useState("");
  const [verticiTracciato, setVerticiTracciato] = useState<Punto[] | null>(null);
  const [puntoDaSpostare, setPuntoDaSpostare] = useState<number | null>(null);
  const scegliTratto = useCallback((chiave: string) => {
    setTrattoId(chiave);
    setVerticiTracciato(null);
    setPuntoDaSpostare(null);
  }, [setTrattoId, setVerticiTracciato, setPuntoDaSpostare]);
  const chiudiTracciati = useCallback(() => {
    setPannelloTracciati(false);
    setPosaCollettore(null);
    scegliTratto("");
  }, [scegliTratto, setPannelloTracciati, setPosaCollettore]);
  // La stanza appena disegnata: il suo nome è pronto da scrivere (solo per lei).
  const [stanzaNuova, setStanzaNuova] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>({ s: 0.8, tx: 80, ty: 80 });
  const [dimensioni, setDimensioni] = useState({ w: 800, h: 560 });
  const [sovrapposizioni, setSovrapposizioni] = useState<Sovrapposizioni>({});
  const [inizioParete, setInizioParete] = useState<Punto | null>(null);
  const [misura, setMisura] = useState<MisuraInModifica | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  // Arredo scelto dal catalogo, da posare col prossimo clic; primo punto della quota in corso.
  const [arredoScelto, setArredoScelto] = useState<VoceCatalogo | null>(null);
  const [inizioQuota, setInizioQuota] = useState<Aggancio | null>(null);
  const [puntiPoligono, setPuntiPoligono] = useState<Punto[]>([]);
  // Lotto e aree esterne: il tipo che lo strumento «area» disegna.
  const [tipoArea, setTipoArea] = useState<TipoArea>("prato");
  const [urlRicalco, setUrlRicalco] = useState<{ percorso: string; url: string } | null>(null);
  useEffect(() => {
    const p = ricalco?.percorso;
    if (!p || p.startsWith("blob:") || !archivio || urlRicalco?.percorso === p) return;
    let annullato = false;
    archivio.url(p).then((url) => { if (!annullato) setUrlRicalco({ percorso: p, url }); }).catch((): void => undefined);
    return () => { annullato = true; };
  }, [ricalco?.percorso, archivio, urlRicalco?.percorso]);
  // sulla tela: coordinate dell'editor (y in giù)
  const sfondo: SfondoRicalco | null = useMemo(() => {
    if (!ricalco) return null;
    const url = ricalco.percorso.startsWith("blob:") ? ricalco.percorso : urlRicalco?.percorso === ricalco.percorso ? urlRicalco.url : null;
    return url ? { url, x: ricalco.x, y: -ricalco.y, larghezzaCm: ricalco.larghezzaCm, proporzione: ricalco.proporzione, opacita: ricalco.opacita } : null;
  }, [ricalco, urlRicalco]);
  const fonteChat = propostaChat?.riferimento;
  const fileFonteChat = fonteChat?.file;
  const [urlFonteChat, setUrlFonteChat] = useState<{ file: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!fileFonteChat) return;
    const url = URL.createObjectURL(fileFonteChat);
    const frame = requestAnimationFrame(() => setUrlFonteChat({ file: fileFonteChat, url }));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(url); };
  }, [fileFonteChat]);
  const sfondoChat = fonteChat && urlFonteChat && urlFonteChat.file === fileFonteChat && (chatInCorso || mostraFonteChat)
    ? { ...fonteChat, url: urlFonteChat.url }
    : null;
  // Metti in scala con due punti: i punti cliccati sul foglio (null = non si sta misurando).
  const [calibra, setCalibra] = useState<Calibrazione | null>(null);
  const avviaCalibrazione = () => {
    if (ricalcoCorrente.current.bloccata) return;
    setPiantaRipiegata(false);
    setCalibra({ fase: "primo" });
  };
  const metriCalibrazione = calibra?.fase === "misura" ? Number(calibra.metri.trim().replace(",", ".")) : 0;
  const distanzaValida = Number.isFinite(metriCalibrazione * 100) && metriCalibrazione > 0;
  const pianoCalibrabile = documentoConfermato.livelli.find(l => l.id === (livelloId ?? documentoConfermato.livelli[0]?.id));
  const ridimensionabile = !!pianoCalibrabile && !pianoCalibrabile.tavolaDwg
    && [pianoCalibrabile.fatto, ...pianoCalibrabile.proposte].some(s => s.muri.length || s.locali.length || s.elementi.length || s.aree?.length);

  const confermaCalibrazione = () => {
    if (!ricalco || ricalcoBloccato || calibra?.fase !== "misura" || !distanzaValida) return;
    const { primo, secondo } = calibra;
    try {
      const nuovo = calibraRicalco(ricalco, { x: primo.x, y: -primo.y }, { x: secondo.x, y: -secondo.y },
        metriCalibrazione * 100, !calibra.diProva);
      if (calibra.ridimensiona && pianoCalibrabile && ridimensionabile) {
        const aggiornato = riallineaPianoAllaTavola(documentoConfermato, pianoCalibrabile.id, ricalco, nuovo);
        vaiAlPiano(pianoCalibrabile.id, aggiornato, propostaId);
      } else {
        aggiornaSfondo(nuovo);
      }
      setCalibra(null);
      setAvviso(`${calibra.diProva ? "Applicata scala di prova" : "Tavola in scala"} · larghezza ${scriviMetri(nuovo.larghezzaCm)} m`);
    } catch (e) {
      setCalibra({ ...calibra, errore: e instanceof Error ? e.message : "La scala non è stata applicata." });
    }
  };

  const svgRef = useRef<SVGSVGElement>(null);
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const gesto = useRef<Gesto | null>(null);
  const puntatori = useRef(new Map<number, Punto>());
  /** Pennino (Apple Pencil) appoggiato: il palmo della mano, che arriva come tocco, va ignorato. */
  const penne = useRef(new Set<number>());
  const ultimoCursore = useRef<Punto | null>(null);
  const spazioPremuto = useRef(false);

  // Stanze, mq e problemi come li calcola il modello della fase 1.
  // pannelli e kWp sul tetto (solo se c'è il fotovoltaico: il calcolo delle quantità costa)
  const fotovoltaicoInfo = useMemo(() => {
    if (!documento.livelli.some((l) => l.tetto?.fotovoltaico)) return null;
    const q = calcolaQuantita(documento);
    const n = q["fatto:impianti:fotovoltaico.pannelli"]?.valore ?? 0;
    return { pannelli: n, kwp: q["fatto:impianti:fotovoltaico.kwp"]?.valore ?? 0 };
  }, [documento]);
  const dati = useMemo(() => datiVista(pianta, documento, vista, livelloId, propostaId), [pianta, documento, vista, livelloId, propostaId]);
  const datiPrimaChat = useMemo(() => propostaPronta
    ? datiVista(storia.presente, documentoConfermato, vista, livelloId, propostaId) : null,
    [propostaPronta, storia.presente, documentoConfermato, vista, livelloId, propostaId]);
  const primaChat = useMemo(() => datiPrimaChat && { pianta: storia.presente, locali: datiPrimaChat.locali }, [datiPrimaChat, storia.presente]);
  const computoDaChat = useMemo(() => {
    if (!consentiComputoChat || !applicataDallaChat || vista !== "progetto") return false;
    const proposta = studioVariante(documentoConfermato, propostaId);
    return !!proposta.righe.length && !proposta.bagniDaRivedere.length && !proposta.cucineDaRivedere.length;
  }, [consentiComputoChat, applicataDallaChat, vista, documentoConfermato, propostaId]);
  const pianoAttivo = livelloId ?? documento.livelli[0]?.id;
  useEffect(() => { onContesto?.(pianoAttivo, dati.ambito); }, [pianoAttivo, dati.ambito, onContesto]);
  // Mansarda: altezze e superficie utile di ogni stanza sotto le falde (per il pannello)
  const sottotetto = useMemo(() => {
    const liv = documento.livelli.find((l) => l.id === (livelloId ?? documento.livelli[0]?.id));
    if (!liv?.tetto?.mansarda) return undefined;
    const out = new Map<string, AltezzeSottotetto>();
    for (const stato of [liv.fatto, ...liv.proposte]) {
      const f = falde(liv, stato);
      if (!f) continue;
      for (const l of stato.locali) if (!out.has(l.id)) { const a = altezzeLocale(l, f); if (a) out.set(l.id, a); }
    }
    return out;
  }, [documento, livelloId]);
  const latiModificabili = useMemo(
    () => new Set(pianta.locali.filter((l) => C.modificabile(l.stato, vista) && dati.locali.some((x) => x.id === l.id)).map((l) => l.id)),
    [pianta, vista, dati],
  );

  // Riferimenti sempre aggiornati per i gestori registrati una volta sola.
  const stato = useRef({ pianta, camera, strumento, vista, selezione, inizioParete, storia, dati, arredoScelto, inizioQuota, puntiPoligono, gruppo, precisione });
  useLayoutEffect(() => { stato.current = { pianta, camera, strumento, vista, selezione, inizioParete, storia, dati, arredoScelto, inizioQuota, puntiPoligono, gruppo, precisione }; }, [pianta, camera, strumento, vista, selezione, inizioParete, storia, dati, arredoScelto, inizioQuota, puntiPoligono, gruppo, precisione]);

  useEffect(() => {
    onChange?.(documentoConfermato);
  }, [documentoConfermato, onChange]);
  useLayoutEffect(() => { documentoBase.current = documentoConfermato; }, [documentoConfermato]);

  useEffect(() => { onAnteprimaChat?.(bloccoChat); }, [bloccoChat, onAnteprimaChat]);
  useEffect(() => { onSelezione?.(selezione); }, [onSelezione, selezione]);
  useEffect(() => {
    if (!onPropostaComputo) return;
    if (!propostaChat || !chatAperta || propostaChat.riferimento || vista !== "progetto") {
      onPropostaComputo(null);
      return;
    }
    const contesto = { documento: documentoConfermato, livelloId, propostaId };
    onPropostaComputo({
      documento: aPlanimetria(piantaDaApplicare(propostaChat, contesto), documentoConfermato, livelloId, propostaId),
      applicabile: !chatInCorso && !sola && propostaChatApplicabile(propostaChat),
    });
  }, [chatAperta, chatInCorso, documentoConfermato, livelloId, onPropostaComputo, propostaChat, propostaId, sola, vista]);
  useEffect(() => {
    if (!animazioneChat) return;
    const timer = setTimeout(() => setAnimazioneChat(null), 570);
    return () => clearTimeout(timer);
  }, [animazioneChat]);

  useEffect(() => {
    if (!avviso) return;
    const t = setTimeout(() => setAvviso(null), 4500);
    return () => clearTimeout(t);
  }, [avviso]);

  const applica = useCallback((nuova: Pianta, daChat?: { annullabile: boolean }) => {
    setAnteprima(null);
    setPassoChat(null);
    setAnimazioneChat(null);
    setMostraFonteChat(false);
    const confermata = aggiornaQuote(nuova);
    // Una parete bloccata non si sposta né si demolisce, da qualunque comando arrivi la modifica:
    // si confronta con la pianta di adesso e, se la tocca, non entra nella storia.
    setStoria(s => {
      const bloccate = paretiBloccateToccate(s.presente.muri, confermata.muri);
      if (!bloccate.length) return esegui(s, confermata);
      queueMicrotask(() => { toast.error(messaggioParetiBloccate(bloccate), { id: "parete-bloccata" }); setApplicazioneChat(null); });
      return s;
    });
    if (daChat) setApplicazioneChat({ pianta: confermata, annullabile: daChat.annullabile });
  }, []);

  // Il passaggio al documento ricostruisce solo i locali CAD toccati dai nuovi muri.
  const chiudiDopoParete = useCallback((nuova: Pianta, vista: C.Vista) =>
    pianoDwg ? nuova : C.chiudiStanze(nuova, vista), [pianoDwg]);

  // Correzione guidata: confermata una misura stimata, si passa alla prossima (o si dice che è finita)
  const avanti = useCallback((nuova: Pianta) => {
    const dopo = C.prossimaStimata(nuova);
    setSelezione(dopo);
    setAvviso(dopo ? `Ancora ${C.contaStimate(nuova)} da controllare: eccone un'altra.` : "Tutte le misure stimate sono controllate.");
  }, [setSelezione, setAvviso]);

  const setStrumento = useCallback((s: Strumento) => {
    if (gesto.current?.tipo === "demolizioni") gesto.current = null;
    setStrumentoStato(s);
    setInizioParete(null);
    setInizioQuota(null);
    setRiferimentoCad(null);
    setPuntiPoligono([]);
    setSovrapposizioni({});
    setMisura(null);
    chiudiTracciati();
    if (s !== "seleziona") {
      setPiantaRipiegata(false);
      setSelezione(null);
      setGruppo(C.gruppoVuoto());
    }
  }, [chiudiTracciati, setStrumentoStato, setInizioParete, setInizioQuota, setRiferimentoCad, setPuntiPoligono, setSovrapposizioni, setMisura, setPiantaRipiegata, setSelezione, setGruppo]);
  useImperativeHandle(controlli, () => ({
    evidenzia(oggetto, prossimaVista) {
      setStrumento("seleziona");
      if (!bloccoChat) setVista(prossimaVista);
      setSelezione(oggetto);
    },
  }), [bloccoChat, setStrumento]);

  // ─── dimensioni e inquadratura ─────────────────────────────────────────────
  useEffect(() => {
    const el = contenitoreRef.current;
    if (!el || piantaNascosta) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.max(200, e.contentRect.width), h = Math.max(200, e.contentRect.height);
      setDimensioni(prima => prima.w === w && prima.h === h ? prima : { w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [piantaNascosta]);

  const cameraAdattata = useRef<Camera | null>(null);
  const cameraRef = useRef(camera);
  useLayoutEffect(() => { cameraRef.current = camera; }, [camera]);
  const dimensioniRef = useRef(dimensioni);
  useLayoutEffect(() => { dimensioniRef.current = dimensioni; }, [dimensioni]);
  const ricalcoRef = useRef(ricalco);
  useLayoutEffect(() => { ricalcoRef.current = ricalco; }, [ricalco]);
  const inquadra = useCallback((piantaDaInquadrare: Pianta) => {
    const ps = angoliEsistenti(piantaDaInquadrare);
    const sfondo = ricalcoRef.current;
    if (!ps.length && sfondo) {
      ps.push(
        { x: sfondo.x, y: -sfondo.y },
        { x: sfondo.x + sfondo.larghezzaCm, y: -sfondo.y + sfondo.larghezzaCm * sfondo.proporzione },
      );
    }
    if (!ps.length) {
      setCamera({ s: 0.8, tx: 80, ty: 80 });
      return;
    }
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    // margine: le porte aperte verso fuori sporgono dalla pianta
    // (sullo schermo stretto se ne tiene poco più di mezza: con tutta, la pianta restava piccola)
    const quota = dimensioniRef.current.w < 600 ? 0.6 : 1;
    const margine = 25 + quota * Math.max(0, ...piantaDaInquadrare.aperture.map((a) => a.larghezza));
    const minX = Math.min(...xs) - margine;
    const maxX = Math.max(...xs) + margine;
    const minY = Math.min(...ys) - margine;
    const maxY = Math.max(...ys) + margine;
    const { w, h } = dimensioniRef.current;
    const s = Math.max(0.05, Math.min(3, Math.min(w / (maxX - minX), h / (maxY - minY))));
    const inquadrata = { s, tx: (w - (maxX - minX) * s) / 2 - minX * s, ty: (h - (maxY - minY) * s) / 2 - minY * s };
    cameraAdattata.current = inquadrata;
    setCamera(inquadrata);
  }, [setCamera]);
  const adatta = useCallback(() => inquadra(stato.current.pianta), [inquadra]);
  useEffect(() => {
    if (!chatAperta || !passoChat || !animazioneChat?.quadro) return;
    const prima = angoliEsistenti(animazioneChat.prima.pianta);
    const punti = angoliEsistenti(animazioneChat.quadro);
    if (!punti.length) return;
    if (!prima.length) {
      const quadro = animazioneChat.quadro;
      const frame = requestAnimationFrame(() => inquadra(quadro));
      return () => cancelAnimationFrame(frame);
    }
    const minX = Math.min(...prima.map(p => p.x)), maxX = Math.max(...prima.map(p => p.x));
    const minY = Math.min(...prima.map(p => p.y)), maxY = Math.max(...prima.map(p => p.y));
    const { s, tx, ty } = stato.current.camera;
    const { w, h } = dimensioniRef.current;
    if (punti.some(p => ((p.x < minX || p.x > maxX) && (p.x * s + tx < 12 || p.x * s + tx > w - 12))
      || ((p.y < minY || p.y > maxY) && (p.y * s + ty < 12 || p.y * s + ty > h - 12)))) inquadra(animazioneChat.quadro);
  }, [chatAperta, passoChat, animazioneChat, inquadra]);

  const apriChatDisegno = () => {
    setPassoChat(null);
    setConfrontoChat("differenze");
    setChatInCorso(false);
    setStrumento("seleziona");
    setGruppo(C.gruppoVuoto());
    setCalibra(null);
    setConfrontoAperto(false);
    if (telefono) setModificaTelefono(true);
    setChatAperta(true);
  };
  const chiudiChatDisegno = () => {
    setChatAperta(false);
    setChatInCorso(false);
    if (passoChat) setSelezione(null);
    setPassoChat(null);
    setAnimazioneChat(null);
    setMostraFonteChat(false);
    setEvidenzaId(undefined);
    bottoneChat.current?.focus({ preventScroll: true });
  };

  const inquadraPuntoChat = (centro: Punto) => {
    setPiantaRipiegata(false);
    setConfrontoChat("differenze");
    setAnimazioneChat(null);
    const { w, h } = dimensioniRef.current;
    setCamera(c => {
      const s = Math.max(c.s, Math.min(1.1, w / 670, h / 480));
      return { s, tx: w / 2 - centro.x * s, ty: h / 2 - centro.y * s };
    });
  };
  const evidenziaDaChat = (evidenza: Selezione, centra = false) => {
    setSelezione(evidenza);
    if (vistaPrimaChat) setConfrontoChat("differenze");
    setAnimazioneChat({ numero: ++numeroAnimazioneChat.current, prima: { pianta, locali: dati.locali }, evidenza });
    const stanza = evidenza.tipo === "locale" ? dati.locali.find(l => l.id === evidenza.id) : undefined;
    const area = evidenza.tipo === "area" ? pianta.aree?.find(a => a.id === evidenza.id) : undefined;
    const elemento = evidenza.tipo === "elemento" ? pianta.elementi?.find(e => e.id === evidenza.id) : undefined;
    const apertura = evidenza.tipo === "apertura" ? pianta.aperture.find(a => a.id === evidenza.id) : undefined;
    const muroId = evidenza.tipo === "muro" ? evidenza.id : apertura?.muroId;
    const muro = muroId ? pianta.muri.find(m => m.id === muroId) : undefined;
    const contorno = stanza?.contorno ?? area?.contorno;
    const centro = contorno ? baricentro(contorno) : muro ? puntoSulMuro(muro, apertura?.posizione ?? dist(muro.p1, muro.p2) / 2) : elemento?.centro;
    if (!centro) return;
    if (centra) return inquadraPuntoChat(centro);
    const x = centro.x * camera.s + camera.tx, y = centro.y * camera.s + camera.ty;
    if (x < 35 || x > dimensioni.w - 35 || y < 35 || y > dimensioni.h - 35) {
      setCamera({ ...camera, tx: dimensioni.w / 2 - centro.x * camera.s, ty: dimensioni.h / 2 - centro.y * camera.s });
    }
  };
  const applicaSchizzo = async (passo: PassoChatDisegno, signal?: AbortSignal) => {
    const fonte = passo.riferimento;
    const lettura = passo.pianta.letturaDocumento;
    if (!fonte?.schizzo || !lettura) return;
    const nome = fonte.schizzo.slice(0, 250);
    const file = new File([fonte.file], nome, { type: fonte.file.type });
    const percorso = archivio ? await archivio.carica(file) : undefined;
    signal?.throwIfAborted();
    if (!percorso) setSchizzoSessione({ file, nome });
    applica({ ...passo.pianta, letturaDocumento: { ...lettura, ...(percorso ? { sorgente: { percorso, nome } } : {}) } }, { annullabile: true });
    setEvidenzaId(undefined);
  };
  const applicaDwg = async (passo: PassoChatDisegno, signal?: AbortSignal) => {
    const fonte = passo.riferimento;
    if (!fonte?.dwg) return;
    const idAttivo = ricalcoCorrente.current.livelloId;
    const piano = documentoConfermato.livelli.find(l => l.id === idAttivo) ?? documentoConfermato.livelli[0];
    if (ricalcoCorrente.current.bloccata || piano.tavolaDwg) throw new Error("Apri un nuovo piano per importare la tavola DWG.");
    const file = new File([fonte.file], fonte.dwg.nome.slice(0, 220).replace(/\.dwg$/i, "") + ".png", { type: fonte.file.type });
    const percorso = archivio ? await archivio.carica(file) : URL.createObjectURL(file);
    signal?.throwIfAborted();
    if (ricalcoCorrente.current.livelloId !== idAttivo) throw new Error("Il piano attivo è cambiato durante il caricamento.");
    const { fatto, tavolaDwg, controlloDwg } = fonte.dwg.livello;
    setBaseDisegno({ documento: { ...documentoConfermato, livelli: documentoConfermato.livelli.map(l => l.id === piano.id
      ? { ...l, fatto, tavolaDwg, controlloDwg } : l) }, pianta: storia.presente });
    setRicalco({ percorso, x: fonte.x, y: -fonte.y, larghezzaCm: fonte.larghezzaCm,
      proporzione: fonte.proporzione, opacita: fonte.opacita, calibrata: true, bloccata: true });
    setRiscontroScala({ stato: "da_verificare" });
    setVistaLayerDwg(vistaLayerDwgIniziale);
    setCalibra(null);
    applica(passo.pianta, { annullabile: false });
    requestAnimationFrame(adatta);
  };
  const giaAdattata = useRef(false);
  useEffect(() => {
    if (giaAdattata.current || (dimensioni.w === 800 && dimensioni.h === 560)) return;
    giaAdattata.current = true;
    if (storia.presente.muri.length || ricalcoRef.current) adatta();
  }, [dimensioni, adatta, storia.presente.muri.length]);

  // Sul telefono il pannello in basso ruba spazio: si reinquadra la pianta. Altrove (tablet ruotato, schermo intero)
  // si reinquadra solo se chi disegna non ha ancora spostato o ingrandito la vista.
  useEffect(() => {
    if (!giaAdattata.current) return;
    const c = cameraAdattata.current;
    const ora = cameraRef.current;
    const intatta = !!c && c.s === ora.s && c.tx === ora.tx && c.ty === ora.ty;
    if (telefono || intatta) adatta();
  }, [telefono, dimensioni.w, dimensioni.h, adatta]);
  // Sul tablet toccare una stanza o una parete apre il pannello con le sue misure.
  useEffect(() => {
    if (compatto && !telefono && selezione) setPannelloAperto(true);
  }, [selezione, compatto, telefono]);

  const zoomAttorno = useCallback((fattore: number, schermo: Punto) => {
    setCamera((c) => {
      const s = Math.max(0.05, Math.min(6, c.s * fattore));
      const k = s / c.s;
      return { s, tx: schermo.x - (schermo.x - c.tx) * k, ty: schermo.y - (schermo.y - c.ty) * k };
    });
  }, [setCamera]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ruota = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const punto = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2) {
        zoomAttorno(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), punto);
      } else {
        setCamera((c) => ({ ...c, tx: c.tx - e.deltaX, ty: c.ty - e.deltaY }));
      }
    };
    svg.addEventListener("wheel", ruota, { passive: false });
    return () => svg.removeEventListener("wheel", ruota);
  }, [zoomAttorno, piantaNascosta]);

  // ─── conversioni ───────────────────────────────────────────────────────────
  const schermo = useCallback((e: { clientX: number; clientY: number }): Punto => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);
  const inPianta = useCallback(
    (e: { clientX: number; clientY: number }): Punto => {
      const p = schermo(e);
      const c = stato.current.camera;
      return { x: (p.x - c.tx) / c.s, y: (p.y - c.ty) / c.s };
    },
    [schermo],
  );
  const tolleranza = useCallback(() => 12 / stato.current.camera.s, []);
  const aggancioDisegno = useCallback((pianta: Pianta, p: Punto, da?: Punto) => aggancia(pianta, p, {
    tolleranza: tolleranza(), da, precisione: stato.current.precisione,
    visibile: s => riferimentoCadVisibile(s, stato.current.vista),
  }), [tolleranza]);

  const bersaglioDi = (el: EventTarget | null): Bersaglio | null => {
    const t = (el as Element | null)?.closest?.("[data-tipo]");
    if (!t) return null;
    const tipo = t.getAttribute("data-tipo")!;
    return {
      tipo,
      id: t.getAttribute("data-id") ?? undefined,
      lato: t.hasAttribute("data-lato") ? Number(t.getAttribute("data-lato")) : undefined,
      estremo: (t.getAttribute("data-estremo") as "p1" | "p2" | null) ?? undefined,
      elemento: t,
    };
  };

  const gestoCad = (comando: ComandoCad, p: Punto, b: Bersaglio | null, conferma: boolean) => {
    const { vista, storia } = stato.current;
    const base = storia.presente;
    const visibile = (m: Pianta["muri"][number]) => riferimentoCadVisibile(m.stato, vista);
    const riferimento = base.muri.find(m => m.id === riferimentoCad && visibile(m));
    const id = b?.tipo === "muro" || b?.tipo === "quota-muro" ? b.id
      : b?.tipo === "apertura" ? base.aperture.find(a => a.id === b.id)?.muroId : undefined;
    // Su tavole fitte una quota o un'etichetta può coprire la parete sotto il cursore.
    const bersaglio = riferimento && comando === "offset" ? undefined
      : muroPiuVicino(base, p, tolleranza() * 0.7, visibile)?.muro ?? base.muri.find(m => m.id === id && visibile(m));
    if (!riferimento) {
      if (conferma && bersaglio) setRiferimentoCad(bersaglio.id);
      setSovrapposizioni(bersaglio ? { cad: { riferimento: bersaglio } } : {});
      return;
    }
    const r = preparaModificaCad(base, {
      comando, vista, riferimento, bersaglio, cursore: p,
      distanzaCm: Number(offsetCm.trim().replace(",", ".")),
    });
    if (!conferma) {
      setSovrapposizioni({ cad: { riferimento, esito: r.ok ? r : undefined } });
      return;
    }
    if (r.ok === false) {
      setAvviso(r.messaggio);
      return;
    }
    const esito = applicaModificaCad(base, r);
    applica(chiudiDopoParete(esito.pianta, vista));
    setStrumento("seleziona");
    setSelezione({ tipo: "muro", id: esito.id });
    setAvviso(`${NOMI_COMANDI_CAD[comando]} completato · ${scriviMetri(dist(r.muro.p1, r.muro.p2))} m`);
  };

  // ─── misure scritte sulla pianta ──────────────────────────────────────────
  const apriMisura = useCallback(
    (b: Bersaglio) => {
      const { pianta: p, vista: v } = stato.current;
      const r = b.elemento.getBoundingClientRect();
      const base = svgRef.current!.getBoundingClientRect();
      const posizione = { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top };
      if (b.tipo === "lato" && b.id != null && b.lato != null) {
        const l = p.locali.find((x) => x.id === b.id);
        if (!l) return;
        setSelezione({ tipo: "locale", id: l.id });
        if (!C.modificabile(l.stato, v)) {
          setAvviso("Nel progetto le stanze di oggi non si allargano: demolisci la parete e disegnane una nuova.");
          return;
        }
        const testo = b.elemento.textContent?.replace("≈ ", "") ?? "";
        const lato = b.lato;
        setMisura({
          chiave: `lato:${l.id}:${lato}`,
          ...posizione,
          testo,
          applica: (cm) => applica(C.impostaLatoStanza(stato.current.storia.presente, l.id, lato, cm)),
        });
      } else if (b.tipo === "quota-muro" && b.id) {
        const m = p.muri.find((x) => x.id === b.id);
        if (!m) return;
        setSelezione({ tipo: "muro", id: m.id });
        if (!C.modificabile(m.stato, v)) {
          setAvviso("Le pareti di oggi nel progetto non si spostano: puoi demolirle e disegnarne di nuove.");
          return;
        }
        setMisura({
          chiave: `muro:${m.id}`,
          ...posizione,
          testo: scriviMetri(dist(m.p1, m.p2)),
          applica: (cm) => applica(C.impostaLunghezzaParete(stato.current.storia.presente, m.id, cm)),
        });
      }
    },
    [applica, setSelezione, setAvviso, setMisura],
  );

  // ─── gesti ────────────────────────────────────────────────────────────────
  const iniziaPinch = () => {
    const [a, b] = [...puntatori.current.values()];
    const precedente = gesto.current?.tipo === "demolizioni" ? gesto.current.prima : sovrapposizioniRef.current.demolizioni;
    gesto.current = { tipo: "pinch", distanza: dist(a, b), centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, camera: stato.current.camera };
    setAnteprima(null);
    setSovrapposizioni(precedente ? { demolizioni: precedente } : {});
  };

  const tracciaDemolizioni = (da: Punto, a: Punto, inizio = false) => {
    const toccati = muriSottoPennello(stato.current.storia.presente.muri, da, a, 7 / stato.current.camera.s);
    setSovrapposizioni(prev => ({
      demolizioni: {
        traccia: inizio ? [a] : [...(prev.demolizioni?.traccia ?? []).slice(-239), a],
        daSegnare: [...new Set([...(prev.demolizioni?.daSegnare ?? []), ...toccati.daSegnare])],
        protetti: [...new Set([...(prev.demolizioni?.protetti ?? []), ...toccati.protetti])],
      },
    }));
  };

  /** Chiude la stanza libera: crea il locale e le pareti che mancano (fase 4). */
  const chiudiPoligono = (punti: Punto[]) => {
    setPuntiPoligono([]);
    setSovrapposizioni({});
    if (stato.current.strumento === "area") {
      if (punti.length < 3) return setAvviso("Servono almeno tre angoli per fare un'area.");
      if (contornoIncrociato(punti)) return setAvviso("Il contorno si incrocia: ridisegna l'area senza che i lati si taglino.");
      const r = C.aggiungiArea(stato.current.storia.presente, tipoArea, punti, stato.current.vista);
      applica(r.pianta);
      setStrumento("seleziona");
      setSelezione({ tipo: "area", id: r.id });
      return;
    }
    if (punti.length < 3) return setAvviso("Servono almeno tre angoli per fare una stanza.");
    if (contornoIncrociato(punti)) return setAvviso("Il contorno si incrocia: ridisegna la stanza senza che i lati si taglino.");
    const r = C.aggiungiStanza(stato.current.storia.presente, punti, { stato: C.statoNuovo(stato.current.vista) });
    applica(r.pianta);
    setStrumento("seleziona");
    setSelezione({ tipo: "locale", id: r.id });
    setStanzaNuova(r.id);
  };

  const ultimoPunto = (str: Strumento) => str === "parete" ? inizioParete ?? undefined
    : str === "quota" ? inizioQuota?.punto : puntiPoligono.at(-1);

  const posaPuntoDisegno = (str: StrumentoPunto, a: Aggancio, numerico = false): boolean => {
    const { vista, storia, inizioParete, inizioQuota, puntiPoligono } = stato.current;
    if (str === "poligono" || str === "area") {
      const ultimo = puntiPoligono.at(-1);
      if (puntiPoligono.length >= 3 && dist(puntiPoligono[0], a.punto) <= 0.02) {
        chiudiPoligono(puntiPoligono);
        return true;
      }
      if (ultimo && dist(ultimo, a.punto) < 5) return false;
      const punti = [...puntiPoligono, a.punto];
      setPuntiPoligono(punti);
      setSovrapposizioni({ poligonoInCorso: { punti, cursore: a.punto }, aggancio: a });
      return false;
    }
    if (str === "parete") {
      if (!inizioParete) {
        setInizioParete(a.punto);
        setSovrapposizioni({ pareteInCorso: { a: a.punto, b: a.punto }, aggancio: a });
        return false;
      }
      if (dist(inizioParete, a.punto) < 5) {
        if (numerico) { setAvviso("Indica un secondo punto ad almeno 5 cm dall’inizio della parete."); return false; }
        setInizioParete(null);
        setSovrapposizioni({});
        return true;
      }
      const r = C.aggiungiParete(storia.presente, inizioParete, a.punto, { stato: C.statoNuovo(vista) });
      applica(chiudiDopoParete(r.pianta, vista));
      if (a.guida === "angolo" || a.ancora) {
        setInizioParete(null);
        setSovrapposizioni({});
      } else {
        setInizioParete(a.punto);
        setSovrapposizioni({ pareteInCorso: { a: a.punto, b: a.punto }, aggancio: a });
      }
      return true;
    }
    if (!inizioQuota) {
      setInizioQuota(a);
      setSovrapposizioni({ quotaInCorso: { a: a.punto, b: a.punto }, aggancio: a });
      return false;
    }
    if (dist(inizioQuota.punto, a.punto) < 1) return false;
    const riferimenti = { ...(inizioQuota.ancora && { p1: inizioQuota.ancora }), ...(a.ancora && { p2: a.ancora }) };
    const r = C.aggiungiQuota(storia.presente, inizioQuota.punto, a.punto, 40, {
      ...(vista === "progetto" && { soloProgetto: true }),
      ...((riferimenti.p1 || riferimenti.p2) && { riferimenti }),
    });
    applica(r.pianta);
    setStrumento("seleziona");
    setSelezione({ tipo: "quota", id: r.id });
    return true;
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    if (e.pointerType === "pen") penne.current.add(e.pointerId);
    else if (e.pointerType === "touch" && penne.current.size > 0) return;
    // Il clic sul disegno chiude le caselle aperte (e ne salva il valore), ma non deve
    // spostare il fuoco dopo: la casella della misura che si apre adesso lo tiene.
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setMisura(null);
    const s = schermo(e);
    puntatori.current.set(e.pointerId, s);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (puntatori.current.size === 2) return iniziaPinch();
    if (puntatori.current.size > 2) return;

    const b = bersaglioDi(e.target);
    const p = inPianta(e);
    const { pianta: pi, vista: v, strumento: str, selezione: sel } = stato.current;
    const pan = () => (gesto.current = { tipo: "pan", da: s, camera: stato.current.camera, mosso: false, bersaglio: b });

    if (sola || bloccoChat || e.button === 1 || spazioPremuto.current) return pan();

    if (posaCollettore) {
      const posizione = { x: Math.round(p.x), y: -Math.round(p.y) };
      if (!statoImpianti.locali.some(l => eAmbienteInterno(l) && puntoNelPoligono(posizione, l.contorno))) {
        setAvviso("Scegli un punto all’interno di un locale.");
        return;
      }
      aggiornaCollettore({ ...posaCollettore, posizione });
      setPosaCollettore(null);
      setAvviso(null);
      return;
    }

    // Metti in scala l'immagine da ricalcare: due clic, poi la distanza vera
    if (calibra !== null && ricalco) {
      if (calibra.fase === "primo") setCalibra({ fase: "secondo", primo: p });
      if (calibra.fase === "secondo") {
        if (dist(calibra.primo, p) < 1) setAvviso("Scegli un secondo punto più distante.");
        else setCalibra({
          fase: "misura", primo: calibra.primo, secondo: p, metri: "",
          ridimensiona: ridimensionabile && pianoCalibrabile?.letturaAssistita?.percorso === ricalco.percorso, diProva: false,
        });
      }
      return;
    }
    if (pannelloTracciati) {
      gesto.current = { tipo: "pan", da: s, camera: stato.current.camera, mosso: false, bersaglio: b, tracciato: true };
      return;
    }

    if (eComandoCad(str)) {
      gestoCad(str, p, b, true);
      return;
    }

    if (str === "demolizioni" && v === "progetto") {
      gesto.current = { tipo: "demolizioni", ultimo: p, prima: sovrapposizioniRef.current.demolizioni };
      tracciaDemolizioni(p, p, true);
      return;
    }
    if (str === "stanza") {
      const a = aggancioDisegno(pi, p);
      gesto.current = { tipo: "rettangolo", a: a.punto };
      setSovrapposizioni({ rettangolo: { a: a.punto, b: a.punto }, aggancio: a });
      return;
    }
    if (eStrumentoPunto(str)) {
      const pts = stato.current.puntiPoligono;
      if ((str === "poligono" || str === "area") && pts.length >= 3 && dist(p, pts[0]) <= tolleranza() * 1.2) return chiudiPoligono(pts);
      posaPuntoDisegno(str, aggancioDisegno(pi, p, ultimoPunto(str)));
      return;
    }
    if (str === "porta" || str === "finestra") {
      mettiApertura(str, p);
      return;
    }
    if (str === "arredo") {
      const voce = stato.current.arredoScelto;
      if (!voce) return;
      const r = C.aggiungiElemento(stato.current.storia.presente, voce, p, { stato: C.statoNuovo(v) });
      applica(r.pianta);
      setSovrapposizioni({});
      setStrumento("seleziona");
      setSelezione({ tipo: "elemento", id: r.id });
      return;
    }
    if (str === "testo") {
      const r = C.aggiungiTesto(stato.current.storia.presente, p);
      applica(r.pianta);
      setStrumento("seleziona");
      setSelezione({ tipo: "testo", id: r.id });
      return;
    }

    // seleziona — più oggetti insieme
    const gr = stato.current.gruppo;
    const multiplo = b && (b.tipo === "elemento" || b.tipo === "quota" || b.tipo === "testo") && b.id ? (b as { tipo: "elemento" | "quota" | "testo"; id: string }) : null;
    if (e.shiftKey && (!b || b.tipo === "sfondo" || b.tipo === "locale")) {
      gesto.current = { tipo: "riquadro", a: p };
      setSovrapposizioni({ riquadro: { a: p, b: p } });
      return;
    }
    if (e.shiftKey && multiplo) {
      const base: C.Gruppo = C.quantiNelGruppo(gr) ? gr : C.gruppoVuoto();
      if (!C.quantiNelGruppo(gr) && sel && (sel.tipo === "elemento" || sel.tipo === "quota" || sel.tipo === "testo")) {
        base[chiaveGruppo(sel.tipo)] = [sel.id];
      }
      const k = chiaveGruppo(multiplo.tipo);
      const lista = base[k].includes(multiplo.id) ? base[k].filter((x) => x !== multiplo.id) : [...base[k], multiplo.id];
      setGruppo({ ...base, [k]: lista });
      setSelezione(null);
      return;
    }
    if (C.quantiNelGruppo(gr)) {
      if (multiplo && gr[chiaveGruppo(multiplo.tipo)].includes(multiplo.id)) {
        gesto.current = { tipo: "sposta-gruppo", da: p, base: stato.current.storia.presente, gruppo: C.gruppoModificabile(pi, gr, v), mosso: false };
        return;
      }
      setGruppo(C.gruppoVuoto());
    }
    if (!b || b.tipo === "sfondo") {
      setSelezione(null);
      return pan();
    }
    if (b.tipo === "lato" || b.tipo === "quota-muro") {
      apriMisura(b);
      return;
    }
    if (b.tipo === "maniglia" && b.id && b.estremo) {
      const m = pi.muri.find((x) => x.id === b.id);
      if (!m) return;
      if (!C.modificabile(m.stato, v)) return avvisaProgetto();
      gesto.current = { tipo: "maniglia", id: m.id, da: m[b.estremo], altro: b.estremo === "p1" ? m.p2 : m.p1, base: stato.current.storia.presente };
      return;
    }
    if (b.tipo === "muro" && b.id) {
      const m = pi.muri.find((x) => x.id === b.id);
      if (!m) return;
      setSelezione({ tipo: "muro", id: m.id });
      if (!C.modificabile(m.stato, v)) return;
      const u = direzione(m);
      gesto.current = { tipo: "sposta-muro", id: m.id, da: p, base: stato.current.storia.presente, normale: { x: -u.y, y: u.x } };
      return;
    }
    if (b.tipo === "apertura" && b.id) {
      const a = pi.aperture.find((x) => x.id === b.id);
      if (!a) return;
      const eraSelezionata = sel?.tipo === "apertura" && sel.id === a.id;
      setSelezione({ tipo: "apertura", id: a.id });
      if (!C.modificabile(a.stato, v)) return;
      gesto.current = { tipo: "sposta-apertura", id: a.id, base: stato.current.storia.presente, da: s, mosso: false, eraSelezionata };
      return;
    }
    if (b.tipo === "elemento" && b.id) {
      const el = (pi.elementi ?? []).find((x) => x.id === b.id);
      if (!el) return;
      setSelezione({ tipo: "elemento", id: el.id });
      if (!C.modificabile(el.stato, v)) return;
      gesto.current = { tipo: "sposta-elemento", id: el.id, da: p, centro: el.centro, base: stato.current.storia.presente, mosso: false };
      return;
    }
    if (b.tipo === "testo" && b.id) {
      const t = (pi.testi ?? []).find((x) => x.id === b.id);
      if (!t) return;
      setSelezione({ tipo: "testo", id: t.id });
      gesto.current = { tipo: "sposta-testo", id: t.id, da: p, posizione: t.posizione, base: stato.current.storia.presente, mosso: false };
      return;
    }
    if (b.tipo === "quota" && b.id) {
      const q = (pi.quote ?? []).find((x) => x.id === b.id);
      if (!q) return;
      setSelezione({ tipo: "quota", id: q.id });
      const l = dist(q.p1, q.p2) || 1;
      gesto.current = { tipo: "sposta-quota", id: q.id, da: p, base: stato.current.storia.presente, normale: { x: -(q.p2.y - q.p1.y) / l, y: (q.p2.x - q.p1.x) / l }, scostamento: q.scostamento, mosso: false };
      return;
    }
    if (b.tipo === "locale" && b.id) {
      setSelezione({ tipo: "locale", id: b.id });
      return pan();
    }
    if (b.tipo === "area" && b.id) {
      const ar = (pi.aree ?? []).find((x) => x.id === b.id);
      if (!ar) return;
      setSelezione({ tipo: "area", id: ar.id });
      if (!C.modificabile(ar.stato, v)) return pan();
      gesto.current = { tipo: "sposta-area", id: ar.id, da: p, contorno: ar.contorno, base: stato.current.storia.presente, mosso: false };
      return;
    }
  };

  const avvisaProgetto = () =>
    setAvviso("Nel progetto le pareti di oggi non si spostano: selezionala e premi «Demolisci», poi disegna quella nuova.");

  const mettiApertura = (quale: TipoApertura, p: Punto) => {
    const { vista: v } = stato.current;
    const base = stato.current.storia.presente;
    const vicino = muroPiuVicino(base, p, tolleranza() * 1.5, (m) => C.visibile(m.stato, v) && m.stato !== "da_demolire");
    if (!vicino) {
      setAvviso(quale === "finestra" ? "La finestra va messa su una parete." : "La porta va messa su una parete.");
      return;
    }
    const r = C.aggiungiApertura(base, vicino.muro.id, quale, vicino.t, { stato: C.statoNuovo(v) });
    applica(r.pianta);
    if (r.id) {
      setStrumento("seleziona");
      setSelezione({ tipo: "apertura", id: r.id });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch" && penne.current.size > 0) return;
    const s = schermo(e);
    if (puntatori.current.has(e.pointerId)) puntatori.current.set(e.pointerId, s);
    const g = gesto.current;
    const p = inPianta(e);
    ultimoCursore.current = p;
    const { pianta: pi, strumento: str } = stato.current;

    if (g?.tipo === "demolizioni") {
      if (dist(g.ultimo, p) * stato.current.camera.s >= 2) {
        tracciaDemolizioni(g.ultimo, p);
        g.ultimo = p;
      }
      return;
    }
    if (g?.tipo === "pinch") {
      if (puntatori.current.size < 2) return;
      const [a, b] = [...puntatori.current.values()];
      const d = dist(a, b);
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const c0 = g.camera;
      const sNuova = Math.max(0.05, Math.min(6, (c0.s * d) / (g.distanza || 1)));
      const k = sNuova / c0.s;
      setCamera({ s: sNuova, tx: centro.x - (g.centro.x - c0.tx) * k, ty: centro.y - (g.centro.y - c0.ty) * k });
      return;
    }
    if (g?.tipo === "pan") {
      if (!g.mosso && dist(s, g.da) < 5) return;
      g.mosso = true;
      setCamera({ ...g.camera, tx: g.camera.tx + s.x - g.da.x, ty: g.camera.ty + s.y - g.da.y });
      return;
    }
    if (g?.tipo === "rettangolo") {
      const a = aggancioDisegno(pi, p);
      setSovrapposizioni({ rettangolo: { a: g.a, b: a.punto }, aggancio: a });
      return;
    }
    if (g?.tipo === "riquadro") {
      setSovrapposizioni({ riquadro: { a: g.a, b: p } });
      return;
    }
    if (g?.tipo === "sposta-gruppo") {
      if (!g.mosso && dist(p, g.da) * stato.current.camera.s < 4) return;
      g.mosso = true;
      setAnteprima(C.spostaGruppo(g.base, g.gruppo, { x: Math.round((p.x - g.da.x) / 5) * 5, y: Math.round((p.y - g.da.y) / 5) * 5 }));
      return;
    }
    if (g?.tipo === "sposta-muro") {
      const d = (p.x - g.da.x) * g.normale.x + (p.y - g.da.y) * g.normale.y;
      const passo = Math.round(d / 5) * 5;
      setAnteprima(C.spostaParete(g.base, g.id, { x: g.normale.x * passo, y: g.normale.y * passo }));
      return;
    }
    if (g?.tipo === "maniglia") {
      const senza = { ...g.base, muri: g.base.muri.filter((m) => m.id !== g.id) };
      const a = aggancioDisegno(senza, p, g.altro);
      setSovrapposizioni({ aggancio: a });
      setAnteprima(C.spostaAngolo(g.base, g.da, a.punto));
      return;
    }
    if (g?.tipo === "sposta-elemento") {
      if (!g.mosso && dist(p, g.da) * stato.current.camera.s < 4) return;
      g.mosso = true;
      const centro = { x: Math.round((g.centro.x + p.x - g.da.x) / 5) * 5, y: Math.round((g.centro.y + p.y - g.da.y) / 5) * 5 };
      setAnteprima(C.modificaElemento(g.base, g.id, { centro }));
      return;
    }
    if (g?.tipo === "sposta-area") {
      if (!g.mosso && dist(p, g.da) * stato.current.camera.s < 4) return;
      g.mosso = true;
      const dx = Math.round((p.x - g.da.x) / 5) * 5, dy = Math.round((p.y - g.da.y) / 5) * 5;
      setAnteprima(C.modificaArea(g.base, g.id, { contorno: g.contorno.map((q) => ({ x: q.x + dx, y: q.y + dy })) }));
      return;
    }
    if (g?.tipo === "sposta-testo") {
      if (!g.mosso && dist(p, g.da) * stato.current.camera.s < 4) return;
      g.mosso = true;
      setAnteprima(C.modificaTesto(g.base, g.id, { posizione: { x: Math.round(g.posizione.x + p.x - g.da.x), y: Math.round(g.posizione.y + p.y - g.da.y) } }));
      return;
    }
    if (g?.tipo === "sposta-quota") {
      if (!g.mosso && dist(p, g.da) * stato.current.camera.s < 4) return;
      g.mosso = true;
      const d = (p.x - g.da.x) * g.normale.x + (p.y - g.da.y) * g.normale.y;
      setAnteprima(C.modificaQuota(g.base, g.id, { scostamento: Math.round((g.scostamento + d) / 5) * 5 }));
      return;
    }
    if (g?.tipo === "sposta-apertura") {
      if (!g.mosso && dist(s, g.da) < 5) return;
      g.mosso = true;
      const v = stato.current.vista;
      const vicino = muroPiuVicino(g.base, p, tolleranza() * 2, (m) => C.visibile(m.stato, v) && m.stato !== "da_demolire");
      if (vicino) setAnteprima(C.spostaApertura(g.base, g.id, vicino.muro.id, vicino.t));
      return;
    }

    // passaggio del mouse, senza tasti premuti
    if (eComandoCad(str)) {
      gestoCad(str, p, bersaglioDi(e.target), false);
    } else if (str === "parete") {
      const inizio = stato.current.inizioParete;
      const a = aggancioDisegno(pi, p, inizio ?? undefined);
      setSovrapposizioni(inizio ? { pareteInCorso: { a: inizio, b: a.punto }, aggancio: a } : { aggancio: a });
    } else if (str === "stanza") {
      setSovrapposizioni({ aggancio: aggancioDisegno(pi, p) });
    } else if (str === "poligono" || str === "area") {
      const pts = stato.current.puntiPoligono;
      const a = aggancioDisegno(pi, p, pts[pts.length - 1]);
      setSovrapposizioni(pts.length ? { poligonoInCorso: { punti: pts, cursore: a.punto }, aggancio: a } : { aggancio: a });
    } else if (str === "arredo" && stato.current.arredoScelto) {
      const v0 = stato.current.arredoScelto;
      setSovrapposizioni({ arredoFantasma: { tipo: v0.tipo, centro: p, larghezza: v0.larghezza, profondita: v0.profondita } });
    } else if (str === "quota") {
      const inizio = stato.current.inizioQuota?.punto;
      const a = aggancioDisegno(pi, p, inizio);
      setSovrapposizioni(inizio ? { quotaInCorso: { a: inizio, b: a.punto }, aggancio: a } : { aggancio: a });
    } else if (str === "porta" || str === "finestra") {
      const v = stato.current.vista;
      const vicino = muroPiuVicino(pi, p, tolleranza() * 1.5, (m) => C.visibile(m.stato, v) && m.stato !== "da_demolire");
      setSovrapposizioni(vicino ? { aperturaFantasma: { muroId: vicino.muro.id, t: vicino.t, tipo: str } } : {});
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    penne.current.delete(e.pointerId);
    if (e.pointerType === "touch" && !puntatori.current.has(e.pointerId)) return;
    puntatori.current.delete(e.pointerId);
    const g = gesto.current;
    if (g?.tipo === "pinch") {
      if (puntatori.current.size === 0) gesto.current = null;
      else {
        const [rimasto] = [...puntatori.current.values()];
        gesto.current = { tipo: "pan", da: rimasto, camera: stato.current.camera, mosso: true, bersaglio: null };
      }
      return;
    }
    gesto.current = null;
    if (!g) return;

    if (g.tipo === "demolizioni") {
      if (e.type === "pointercancel") setSovrapposizioni(g.prima ? { demolizioni: g.prima } : {});
      else tracciaDemolizioni(g.ultimo, inPianta(e));
      return;
    }
    if (g.tipo === "pan") {
      if (g.tracciato && !g.mosso && e.type !== "pointercancel") {
        if (verticiTracciato && trattoId) {
          const p = inPianta(e);
          const vertice = { x: Math.round(p.x), y: Math.round(p.y) };
          setVerticiTracciato(puntoDaSpostare === null ? [...verticiTracciato, vertice] : verticiTracciato.map((v, i) => i === puntoDaSpostare ? vertice : v));
          setPuntoDaSpostare(null);
        } else if (g.bersaglio?.tipo === "tratto-impianto" && g.bersaglio.id) scegliTratto(g.bersaglio.id);
        return;
      }
      // un tocco senza trascinare: sul telefono seleziona e apre la misura
      if (!g.mosso && sola && g.bersaglio) {
        const b = g.bersaglio;
        if (b.tipo === "lato" || b.tipo === "quota-muro") apriMisura(b);
        else if ((b.tipo === "muro" || b.tipo === "locale" || b.tipo === "apertura" || b.tipo === "elemento" || b.tipo === "quota" || b.tipo === "testo") && b.id) setSelezione({ tipo: b.tipo, id: b.id });
        else setSelezione(null);
      }
      return;
    }
    if (g.tipo === "rettangolo") {
      const fine = sovrapposizioniRef.current.rettangolo?.b ?? g.a;
      setSovrapposizioni({});
      if (Math.abs(fine.x - g.a.x) < 60 || Math.abs(fine.y - g.a.y) < 60) {
        setAvviso("Trascina per disegnare la stanza (almeno 50 cm per lato), oppure scrivi le misure.");
        return;
      }
      const r = C.aggiungiStanza(stato.current.storia.presente, C.rettangolo(g.a, fine), { stato: C.statoNuovo(stato.current.vista) });
      applica(r.pianta);
      setStrumento("seleziona");
      setSelezione({ tipo: "locale", id: r.id });
      setStanzaNuova(r.id);
      return;
    }
    if (g.tipo === "riquadro") {
      const fine = sovrapposizioniRef.current.riquadro?.b ?? g.a;
      setSovrapposizioni({});
      const trovati = C.gruppoNelRiquadro(stato.current.storia.presente, g.a, fine, stato.current.vista);
      const gr = stato.current.gruppo;
      // Maiusc+trascina aggiunge a quello che c'è già
      const unione: C.Gruppo = {
        elementi: [...new Set([...gr.elementi, ...trovati.elementi])],
        quote: [...new Set([...gr.quote, ...trovati.quote])],
        testi: [...new Set([...gr.testi, ...trovati.testi])],
      };
      if (C.quantiNelGruppo(unione) === 0) setAvviso("Nel riquadro non ci sono arredi, quote o testi. Pareti e stanze si scelgono una per volta.");
      setGruppo(unione);
      setSelezione(null);
      return;
    }
    if (g.tipo === "sposta-gruppo") {
      if (g.mosso && anteprimaRef.current) applica(anteprimaRef.current);
      else setAnteprima(null);
      return;
    }
    if (g.tipo === "sposta-elemento" || g.tipo === "sposta-testo" || g.tipo === "sposta-quota" || g.tipo === "sposta-area") {
      if (g.mosso && anteprimaRef.current) applica(anteprimaRef.current);
      else setAnteprima(null);
      return;
    }
    if (g.tipo === "sposta-muro" || g.tipo === "maniglia") {
      setSovrapposizioni({});
      if (anteprimaRef.current) applica(anteprimaRef.current);
      return;
    }
    if (g.tipo === "sposta-apertura") {
      if (!g.mosso) {
        setAnteprima(null);
        if (g.eraSelezionata) applica(C.giraApertura(stato.current.storia.presente, g.id));
        return;
      }
      if (anteprimaRef.current) applica(anteprimaRef.current);
    }
  };

  const chiudiPoligonoRef = useRef(chiudiPoligono);
  useLayoutEffect(() => { chiudiPoligonoRef.current = chiudiPoligono; }, [chiudiPoligono]);
  const sovrapposizioniRef = useRef(sovrapposizioni);
  useLayoutEffect(() => { sovrapposizioniRef.current = sovrapposizioni; }, [sovrapposizioni]);
  const anteprimaRef = useRef(anteprima);
  useLayoutEffect(() => { anteprimaRef.current = anteprima; }, [anteprima]);

  // ─── porta e finestra trascinate dalla barra ──────────────────────────────
  const trascinaDallaBarra = (quale: "porta" | "finestra") => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    setPiantaRipiegata(false);
    const da = { x: e.clientX, y: e.clientY };
    let mosso = false;
    const muovi = (ev: PointerEvent) => {
      if (!mosso && Math.hypot(ev.clientX - da.x, ev.clientY - da.y) < 6) return;
      mosso = true;
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const dentro = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!dentro) return setSovrapposizioni({});
      const p = inPianta(ev);
      const v = stato.current.vista;
      const vicino = muroPiuVicino(stato.current.pianta, p, tolleranza() * 2, (m) => C.visibile(m.stato, v) && m.stato !== "da_demolire");
      setSovrapposizioni(vicino ? { aperturaFantasma: { muroId: vicino.muro.id, t: vicino.t, tipo: quale } } : {});
    };
    const lascia = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", muovi);
      window.removeEventListener("pointerup", lascia);
      setSovrapposizioni({});
      if (!mosso) {
        setStrumento(quale);
        return;
      }
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
      const p = inPianta(ev);
      const v = stato.current.vista;
      const base = stato.current.storia.presente;
      const vicino = muroPiuVicino(base, p, tolleranza() * 2, (m) => C.visibile(m.stato, v) && m.stato !== "da_demolire");
      if (!vicino) return setAvviso(quale === "finestra" ? "La finestra va lasciata sopra una parete." : "La porta va lasciata sopra una parete.");
      const r2 = C.aggiungiApertura(base, vicino.muro.id, quale, vicino.t, { stato: C.statoNuovo(v) });
      applica(r2.pianta);
      setStrumento("seleziona");
      if (r2.id) setSelezione({ tipo: "apertura", id: r2.id });
    };
    window.addEventListener("pointermove", muovi);
    window.addEventListener("pointerup", lascia);
  };

  // ─── tastiera ─────────────────────────────────────────────────────────────
  const elimina = useCallback(
    (sel: Selezione) => {
      const { vista: v } = stato.current;
      const base = stato.current.storia.presente;
      const parete = sel.tipo === "muro" && v === "progetto" ? base.muri.find(m => m.id === sel.id) : undefined;
      if (parete?.stato === "esistente" && funzionePareteDaVerificare(parete)) {
        setAvviso("Riscontra la funzione della parete in «Com’è oggi» prima di proporre la demolizione.");
        return;
      }
      const nuova =
        sel.tipo === "muro" ? C.eliminaMuro(base, sel.id, v)
          : sel.tipo === "apertura" ? C.eliminaApertura(base, sel.id, v)
          : sel.tipo === "elemento" ? C.eliminaElemento(base, sel.id, v)
          : sel.tipo === "quota" ? C.eliminaQuota(base, sel.id)
          : sel.tipo === "testo" ? C.eliminaTesto(base, sel.id)
          : sel.tipo === "area" ? C.eliminaArea(base, sel.id, v)
          : C.eliminaLocale(base, sel.id, v);
      applica(nuova);
      const ancora = [...nuova.muri, ...nuova.aperture, ...nuova.locali, ...(nuova.elementi ?? []), ...(nuova.quote ?? []), ...(nuova.testi ?? []), ...(nuova.aree ?? [])].some((x) => x.id === sel.id);
      if (!ancora) setSelezione(null);
    },
    [applica, setSelezione, setAvviso],
  );

  const pareteScritta = useCallback(
    (cm: number) => {
      const inizio = stato.current.inizioParete;
      const cursore = ultimoCursore.current;
      if (!inizio || !cursore) return;
      const a = aggancioDisegno(stato.current.pianta, cursore, inizio);
      const u = direzione({ p1: inizio, p2: dist(inizio, a.punto) > 1 ? a.punto : { x: inizio.x + 1, y: inizio.y } });
      const fine = { x: inizio.x + u.x * cm, y: inizio.y + u.y * cm };
      const r = C.aggiungiParete(stato.current.storia.presente, inizio, fine, { stato: C.statoNuovo(stato.current.vista) });
      applica(chiudiDopoParete(r.pianta, stato.current.vista));
      setInizioParete(fine);
      setSovrapposizioni({ pareteInCorso: { a: fine, b: fine } });
    },
    [aggancioDisegno, applica, chiudiDopoParete, setInizioParete, setSovrapposizioni],
  );

  useEffect(() => {
    if (sola || bloccoChat) return;
    const tasto = (e: KeyboardEvent) => {
      const campo = (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true], [role=combobox], [role=listbox]");
      if (e.code === "Space" && !campo) {
        spazioPremuto.current = e.type === "keydown";
        return;
      }
      if (e.type !== "keydown" || campo) return;
      if (e.key === "Escape" && calibra && calibra.fase !== "misura") {
        e.preventDefault();
        setCalibra(null);
        return;
      }
      if (e.key === "Escape" && pannelloTracciati) {
        e.preventDefault();
        if (verticiTracciato) scegliTratto(trattoId);
        else chiudiTracciati();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (verticiTracciato) {
          scegliTratto(trattoId);
          return;
        }
        setAnteprima(null);
        setStoria((s) => (e.shiftKey ? ripeti(s) : annulla(s)));
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setStoria(ripeti);
      } else if (C.quantiNelGruppo(stato.current.gruppo) && (e.key === "Delete" || e.key === "Backspace" || e.key === "Escape" || (!mod && (e.key === "r" || e.key === "R" || e.key === "m" || e.key === "M")) || (mod && e.key.toLowerCase() === "d"))) {
        e.preventDefault();
        const k = e.key.toLowerCase();
        azioneGruppoRef.current(k === "escape" ? "deseleziona" : k === "r" ? "ruota" : k === "m" ? "specchia" : k === "d" ? "copia" : "elimina");
      } else if (!mod && (e.key === "r" || e.key === "R") && stato.current.selezione?.tipo === "elemento") {
        e.preventDefault();
        const sel = stato.current.selezione;
        const el = (stato.current.storia.presente.elementi ?? []).find((x) => x.id === sel.id);
        if (el && C.modificabile(el.stato, stato.current.vista)) applica(C.ruotaElemento(stato.current.storia.presente, sel.id, e.shiftKey ? -90 : 90));
      } else if (mod && e.key.toLowerCase() === "d" && stato.current.selezione?.tipo === "elemento") {
        e.preventDefault();
        const r = C.duplicaElemento(stato.current.storia.presente, stato.current.selezione.id, stato.current.vista);
        applica(r.pianta);
        if (r.id) setSelezione({ tipo: "elemento", id: r.id });
      } else if (e.key === "Enter" && (stato.current.strumento === "poligono" || stato.current.strumento === "area") && stato.current.puntiPoligono.length >= 3) {
        e.preventDefault();
        chiudiPoligonoRef.current(stato.current.puntiPoligono);
      } else if (e.key === "Escape" && stato.current.puntiPoligono.length) {
        setPuntiPoligono([]);
        setSovrapposizioni({});
      } else if (e.key === "Escape" && stato.current.inizioQuota) {
        setInizioQuota(null);
        setSovrapposizioni({});
      } else if (e.key === "Escape") {
        if (stato.current.inizioParete) {
          setInizioParete(null);
          setSovrapposizioni({});
        } else if (stato.current.strumento !== "seleziona") setStrumento("seleziona");
        else setSelezione(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && stato.current.selezione) {
        e.preventDefault();
        elimina(stato.current.selezione);
      } else if (stato.current.strumento === "parete" && stato.current.inizioParete && /^[0-9]$/.test(e.key) && !mod) {
        // si comincia a scrivere la lunghezza della parete: la casella nasce subito
        // (flushSync) e prende il fuoco, così i tasti seguenti finiscono lì dentro
        e.preventDefault();
        const c = stato.current.camera;
        const cur = ultimoCursore.current ?? stato.current.inizioParete;
        flushSync(() => setMisura({
          chiave: "parete-in-corso",
          x: cur.x * c.s + c.tx,
          y: cur.y * c.s + c.ty - 30,
          testo: e.key,
          applica: pareteScritta,
        }));
      }
    };
    window.addEventListener("keydown", tasto);
    window.addEventListener("keyup", tasto);
    return () => {
      window.removeEventListener("keydown", tasto);
      window.removeEventListener("keyup", tasto);
    };
  }, [sola, bloccoChat, elimina, setStrumento, pareteScritta, applica, calibra, pannelloTracciati, verticiTracciato, trattoId, scegliTratto, chiudiTracciati]);

  // ─── azioni sul gruppo ─────────────────────────────────────────────────────
  const azioneGruppo = useCallback((azione: "ruota" | "specchia" | "copia" | "elimina" | "deseleziona") => {
    const { storia: st, vista: v, gruppo: gr } = stato.current;
    if (azione === "deseleziona") return setGruppo(C.gruppoVuoto());
    const tocca = C.gruppoModificabile(st.presente, gr, v);
    if (azione === "copia") {
      const r = C.duplicaGruppo(st.presente, gr, v);
      applica(r.pianta);
      setGruppo(r.gruppo);
      return;
    }
    if (!C.quantiNelGruppo(tocca)) return setAvviso("Nel progetto gli arredi di oggi non si spostano: si tolgono e se ne mettono di nuovi.");
    if (azione === "ruota") applica(C.ruotaGruppo(st.presente, tocca, 90));
    else if (azione === "specchia") applica(C.specchiaGruppo(st.presente, tocca));
    else {
      applica(C.eliminaGruppo(st.presente, gr, v));
      setGruppo(C.gruppoVuoto());
    }
  }, [applica, setGruppo, setAvviso]);
  const azioneGruppoRef = useRef(azioneGruppo);
  useLayoutEffect(() => { azioneGruppoRef.current = azioneGruppo; }, [azioneGruppo]);

  // il gruppo perde ciò che non c'è più (annulla, cambio di vista o di piano)
  useEffect(() => {
    if (!C.quantiNelGruppo(gruppo)) return;
    const el = new Set((pianta.elementi ?? []).filter((x) => C.visibile(x.stato, vista)).map((x) => x.id));
    const qu = new Set((pianta.quote ?? []).map((x) => x.id));
    const te = new Set((pianta.testi ?? []).map((x) => x.id));
    const resto = { elementi: gruppo.elementi.filter((x) => el.has(x)), quote: gruppo.quote.filter((x) => qu.has(x)), testi: gruppo.testi.filter((x) => te.has(x)) };
    if (C.quantiNelGruppo(resto) !== C.quantiNelGruppo(gruppo)) setGruppo(resto);
  }, [pianta, vista, gruppo]);

  // la selezione sparisce se non si vede più (annulla, cambio di vista)
  useEffect(() => {
    if (!selezione) return;
    const esiste =
      selezione.tipo === "muro"
        ? pianta.muri.find((m) => m.id === selezione.id)
        : selezione.tipo === "apertura"
          ? pianta.aperture.find((a) => a.id === selezione.id)
          : selezione.tipo === "elemento"
            ? (pianta.elementi ?? []).find((x) => x.id === selezione.id)
            : selezione.tipo === "quota"
              ? (pianta.quote ?? []).find((x) => x.id === selezione.id)
              : selezione.tipo === "testo"
                ? (pianta.testi ?? []).find((x) => x.id === selezione.id)
                : selezione.tipo === "area"
                  ? (pianta.aree ?? []).find((x) => x.id === selezione.id)
                  : dati.locali.find((l) => l.id === selezione.id);
    if (!esiste || ("stato" in esiste && !C.visibile(esiste.stato, vista))) setSelezione(null);
  }, [pianta, dati, selezione, vista]);

  useEffect(() => {
    if (stanzaNuova && !(selezione?.tipo === "locale" && selezione.id === stanzaNuova)) setStanzaNuova(null);
  }, [selezione, stanzaNuova]);

  // ─── azioni del pannello ──────────────────────────────────────────────────
  const azioni: AzioniPannello = useMemo(() => {
    const p = () => stato.current.storia.presente;
    return {
      nomeStanza: (id, nome) => {
        const l = stato.current.dati.locali.find((x) => x.id === id);
        if (l) applica(C.rinominaStanza(p(), id, l, { nome }, stato.current.vista));
      },
      destinazioneStanza: (id, d) => {
        const l = stato.current.dati.locali.find((x) => x.id === id);
        if (!l) return;
        const etichetta = DESTINAZIONI.find((x) => x.valore === d)?.etichetta;
        // se il nome era quello automatico («Stanza 2», o il tipo di prima), prende il tipo nuovo
        const tipoDiPrima = DESTINAZIONI.find((x) => x.valore === l.destinazione)?.etichetta ?? "";
        const automatico = /^Stanza( \d+)?$/.test(l.nome) || new RegExp(`^${tipoDiPrima}( \\d+)?$`).test(l.nome);
        const altri = stato.current.dati.locali.filter((x) => x.id !== id);
        const nome = automatico && etichetta && d !== "altro" ? nomeUnico(altri, etichetta) : undefined;
        applica(C.rinominaStanza(p(), id, l, nome ? { destinazione: d, nome } : { destinazione: d }, stato.current.vista));
      },
      finitureStanza: (id, finiture) => {
        const l = stato.current.dati.locali.find((x) => x.id === id);
        if (l) applica(C.rinominaStanza(p(), id, l, { finiture }, stato.current.vista));
      },
      latoStanza: (id, lato, cm) => applica(C.impostaLatoStanza(p(), id, lato, cm)),
      lunghezzaParete: (id, cm) => applica(C.impostaLunghezzaParete(p(), id, cm)),
      spessoreParete: (id, cm) => applica(C.modificaMuro(p(), id, { spessore: cm })),
      funzioneParete: (id, tipo) => applica(C.modificaMuro(p(), id, tipo === "da_verificare"
        ? { funzioneDaVerificare: true } : { tipo, funzioneDaVerificare: false })),
      bloccaParete: (id, bloccato) => applica(C.modificaMuro(p(), id, { bloccato: bloccato || undefined })),
      altezzaParete: (id, cm) => applica(C.modificaMuro(p(), id, { altezza: cm, origineAltezza: "rilevata" })),
      modificaApertura: (id, campi) => applica("zanzariera" in campi
        ? C.impostaZanzariera(p(), id, stato.current.vista, campi.zanzariera)
        : C.modificaApertura(p(), id, { ...campi, origine: "rilevata" })),
      giraApertura: (id) => applica(C.giraApertura(p(), id)),
      elimina,
      conferma: (sel) => {
        if (sel.tipo === "locale") {
          // la stanza e le sue pareti
          let nuova = C.confermaMisura(p(), "locale", sel.id);
          const l = nuova.locali.find((x) => x.id === sel.id);
          if (l) {
            for (const m of nuova.muri) {
              if (m.origine === "stimata" && l.contorno.some((a, i) => sulLato(m, a, l.contorno[(i + 1) % l.contorno.length]))) {
                nuova = C.confermaMisura(nuova, "muro", m.id);
              }
            }
          }
          applica(nuova);
          avanti(nuova);
        } else if (sel.tipo === "muro" || sel.tipo === "apertura") {
          const nuova = C.confermaMisura(p(), sel.tipo, sel.id);
          applica(nuova);
          avanti(nuova);
        }
      },
      confermaTutte: () => applica(C.confermaTutte(p())),
      seleziona: setSelezione,
      modificaElemento: (id, campi) => applica(C.modificaElemento(p(), id, campi)),
      ruotaElemento: (id, gradi) => applica(C.ruotaElemento(p(), id, gradi)),
      duplicaElemento: (id) => {
        const r = C.duplicaElemento(p(), id, stato.current.vista);
        applica(r.pianta);
        if (r.id) setSelezione({ tipo: "elemento", id: r.id });
      },
      copiaSuiPiani: (id) => {
        const { documento: d, livelloId: lid, propostaId: pid } = pianiRef.current;
        const r = copiaSuTuttiIPiani(d, lid ?? d.livelli[0].id, id, () => C.nuovoId("arredo"));
        if (!r) return;
        if (!r.aggiunti) { setAvviso(r.giaPresenti ? "È già su tutti i piani." : "Non ci sono altri piani: aggiungine uno dal menu dei piani."); return; }
        vaiAlPianoRef.current(lid ?? d.livelli[0].id, r.documento, pid);
        setAvviso(`Messo anche su ${r.aggiunti} ${r.aggiunti === 1 ? "altro piano" : "altri piani"}, nello stesso punto.`);
      },
      modificaQuota: (id, campi) => applica(C.modificaQuota(p(), id, campi)),
      modificaTesto: (id, campi) => applica(C.modificaTesto(p(), id, campi)),
      riscaldamento: (id) => {
        const r = riscaldamentoStanza(p(), id, stato.current.vista);
        if (!r.aggiunti.length) { setAvviso(r.giaPresenti.length ? "La stanza ha già il suo termosifone." : "Non c'è una parete libera per il termosifone."); return; }
        applica(r.pianta);
        setSelezione(null);
        setGruppo({ elementi: r.aggiunti, quote: [], testi: [] });
        setAvviso(`Aggiunti ${r.aggiunti.length} termosifoni.${(p().elementi ?? []).some((e) => e.tipo === "caldaia" || e.tipo === "pompa_calore") ? "" : " Metti la caldaia o la pompa di calore (Arredi → Energia): da lì partono i tubi nel computo."}`);
      },
      modificaArea: (id, campi) => applica(C.modificaArea(p(), id, campi)),
      curvaParete: (id, freccia) => {
        const r = C.curvaParete(p(), id, freccia);
        if (!r.ok) { setAvviso(r.motivo ?? "La parete non si curva."); return; }
        applica(r.pianta);
        setSelezione(null);
        setAvviso("Parete curvata: la stanza segue la curva. Ctrl+Z per tornare com'era.");
      },
      unitaStanza: (id, unita) => {
        const l = stato.current.dati.locali.find(x => x.id === id);
        if (l) applica(C.rinominaStanza(p(), id, l, { unita: unita || undefined }, stato.current.vista));
      },
      magliaPilastri: (id, passo) => {
        const r = magliaPilastri(p(), id, stato.current.vista, passo);
        if (!r.aggiunti.length) {
          setAvviso("Con questo passo non ci sta nessun pilastro lontano dai muri: prova un passo più piccolo.");
          return;
        }
        applica(r.pianta);
        setSelezione(null);
        setGruppo({ elementi: r.aggiunti, quote: [], testi: [] });
        setAvviso(`Messi ${r.aggiunti.length} pilastri: trascinane uno per spostarli tutti, Canc per toglierli.`);
      },
      impiantoElettrico: (id, destinazione) => {
        const r = impiantoElettrico(p(), id, stato.current.vista, destinazione);
        if (!r.aggiunti.length) {
          setAvviso(r.giaPresenti.length ? "La stanza ha già la dotazione minima." : "Non c'è posto per i punti: le pareti sono occupate da porte e finestre.");
          return;
        }
        applica(r.pianta);
        setSelezione(null);
        setGruppo({ elementi: r.aggiunti, quote: [], testi: [] });
        setAvviso(`Aggiunti ${r.aggiunti.length} punti (prese, luci, interruttori). Con «Linee impianti» vedi i percorsi dal quadro.${r.saltati.length ? ` Non ci stavano: ${r.saltati.join(", ").toLowerCase()}.` : ""}`);
      },
      clima: (id, destinazione) => {
        const l = p().locali.find((x) => x.id === id);
        if (!l) return;
        const r = climaStanza(p(), id, stato.current.vista, destinazione, btuConsigliati(l));
        if (!r.aggiunti.length) {
          setAvviso(r.giaPresenti.length ? "Nella stanza c'è già lo split." : "Non c'è una parete libera per lo split.");
          return;
        }
        applica(r.pianta);
        setSelezione({ tipo: "elemento", id: r.aggiunti[0] });
        setAvviso((p().elementi ?? []).some((e) => e.tipo === "unita_esterna") ? "Split aggiunto." : "Split aggiunto. Metti l'unità esterna (Arredi → Impianti) sul balcone o in facciata: da lì si contano rame e condensa.");
      },
      arreda: (id, destinazione) => {
        const r = arredaStanza(p(), id, stato.current.vista, destinazione);
        if (!r.aggiunti.length) {
          setAvviso(r.giaPresenti.length ? "La stanza è già arredata: sposta o elimina i mobili a mano." : `Non c'è posto per ${r.saltati.join(", ").toLowerCase() || "gli arredi"}: la stanza è piccola o le pareti sono occupate da porte e finestre.`);
          return;
        }
        applica(r.pianta);
        setSelezione(null);
        setGruppo({ elementi: r.aggiunti, quote: [], testi: [] });
        setAvviso(`Aggiunti ${r.aggiunti.length} arredi: trascinane uno per spostarli tutti, oppure Esc e sistemali uno per uno.${r.saltati.length ? ` Non ci stavano: ${r.saltati.join(", ").toLowerCase()}.` : ""}`);
      },
    };
  }, [applica, elimina]);

  // ─── piani ────────────────────────────────────────────────────────────────
  const vaiAlPiano = (id: string, doc: Planimetria = documento, proposta?: string) => {
    setAnteprima(null);
    setLivelloId(id);
    const pid = proposta ?? doc.livelli.find((l) => l.id === id)?.proposte[0]?.id ?? ID_PROPOSTA;
    setPropostaId(pid);
    const piantaPiano = daPlanimetria(doc, id, pid);
    setBaseDisegno({ documento: doc, pianta: piantaPiano });
    setStoria(nuovaStoria(piantaPiano));
    const destinazione = doc.livelli.find((l) => l.id === id);
    setRicalco(destinazione?.ricalco ?? null);
    if (id !== livelloId) setVistaLayerDwg(vistaLayerDwgIniziale);
    setRiscontroScala(destinazione?.riscontroScala);
    setVerificaScala(null);
    setCalibra(null);
    setSelezione(null);
    setStrumento("seleziona");
    setTimeout(adatta, 0);
    return piantaPiano;
  };
  useLayoutEffect(() => { vaiAlPianoRef.current = vaiAlPiano; }, [vaiAlPiano]);
  const [telaioAperto, setTelaioAperto] = useState(false);
  const creaTelaio = (par: Omit<ParametriTelaio, "origine" | "stato">, suTuttiIPiani: boolean) => {
    const muri = stato.current.storia.presente.muri;
    // la griglia parte dall'angolo in alto a sinistra della casa (o da zero su un foglio vuoto)
    const origine = muri.length
      ? { x: Math.min(...muri.flatMap((m) => [m.p1.x, m.p2.x])), y: Math.min(...muri.flatMap((m) => [m.p1.y, m.p2.y])) }
      : { x: 0, y: 0 };
    const r = generaTelaio(stato.current.storia.presente, { ...par, origine, stato: C.statoNuovo(stato.current.vista) });
    if (!suTuttiIPiani) {
      applica(r.pianta);
      setAvviso("Telaio creato: ogni pilastro, trave o solaio si sposta e si cambia come un arredo.");
      return;
    }
    const lid = livelloId ?? documento.livelli[0].id;
    const d = aPlanimetria(r.pianta, documentoConfermato, livelloId, propostaId);
    const copiato = copiaGruppoSuTuttiIPiani(d, lid, r.elementi, () => C.nuovoId("arredo"));
    vaiAlPiano(lid, copiato.documento, propostaId);
    setAvviso(`Telaio creato su ${copiato.documento.livelli.length} piani, nello stesso punto.`);
  };
  const nuovoPiano = (o: { nome: string; quota: number; base: BaseNuovoPiano }) => {
    const r = aggiungiLivello(documento, { ...o, daLivelloId: livelloId });
    vaiAlPiano(r.id, r.documento);
  };
  // rilievo del topografo: è di tutta la pianta (come il terreno), si cambia come un piano
  const [rilievoAperto, setRilievoAperto] = useState(false);
  const cambiaRilievo = (r: Rilievo | null) => {
    const { rilievo: _prima, ...senza } = documento;
    vaiAlPiano(livelloId ?? documento.livelli[0].id, r ? { ...senza, rilievo: r } : senza);
  };
  const centroPianta = () => {
    const ps = documento.livelli.flatMap((l) => l.fatto.muri.flatMap((m) => [m.p1, m.p2]));
    if (!ps.length) return { x: 0, y: 0 };
    const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };
  // gli spigoli esterni della casa (rettangolo dei muri con il loro spessore), y in su come il modello
  const angoliPianta = () => {
    const muri = documento.livelli.flatMap((l) => l.fatto.muri);
    if (!muri.length) return [];
    const xs = muri.flatMap((m) => [m.p1.x - m.spessore / 2, m.p1.x + m.spessore / 2, m.p2.x - m.spessore / 2, m.p2.x + m.spessore / 2]);
    const ys = muri.flatMap((m) => [m.p1.y - m.spessore / 2, m.p1.y + m.spessore / 2, m.p2.y - m.spessore / 2, m.p2.y + m.spessore / 2]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return [
      { nome: "Spigolo nord-ovest", x: x0, y: y1 }, { nome: "Spigolo nord-est", x: x1, y: y1 },
      { nome: "Spigolo sud-est", x: x1, y: y0 }, { nome: "Spigolo sud-ovest", x: x0, y: y0 },
    ];
  };
  const modificaPiano = (campi: { nome?: string; quota?: number; tetto?: Tetto | null }) => {
    if (!livelloId) return;
    const doc = rinominaLivello(documento, livelloId, campi);
    vaiAlPiano(livelloId, doc);
  };
  const togliPiano = () => {
    if (!livelloId || documento.livelli.length <= 1) return;
    const doc = eliminaLivello(documento, livelloId);
    vaiAlPiano(doc.livelli[0].id, doc);
  };

  // ─── alternative di progetto ──────────────────────────────────────────────
  const livelloCorrente = documento.livelli.find((l) => l.id === livelloId) ?? documento.livelli[0];
  const tavolaDwg = livelloCorrente?.tavolaDwg;
  const apriRiscontroScala = () => {
    const muri = livelloCorrente?.fatto.muri ?? [];
    const precedente = livelloCorrente?.riscontroScala;
    const riferimento = muri.find(m => m.id === (precedente?.stato === "confermata" ? precedente.muroId : selezione?.id)) ?? muri[0];
    if (riferimento) setVerificaScala({ muroId: riferimento.id, misura: "" });
  };
  const statoPerFrazionamento = livelloCorrente && ((vista === "progetto" ? livelloCorrente.proposte.find(p => p.id === propostaId) : undefined) ?? livelloCorrente.fatto);
  const vaiAllaProposta = (id: string, doc: Planimetria = documento) => {
    if (!livelloCorrente) return;
    vaiAlPiano(livelloCorrente.id, doc, id);
    setVista("progetto");
  };
  const nuovaProposta = () => {
    if (!livelloCorrente) return;
    const r = duplicaProposta(documento, livelloCorrente.id, propostaId);
    vaiAllaProposta(r.id, r.documento);
  };
  const rinominaPropostaCorrente = (nome: string) => {
    if (!livelloCorrente) return;
    const doc = rinominaProposta(documento, livelloCorrente.id, propostaId, nome);
    vaiAllaProposta(propostaId, doc);
  };
  const togliPropostaCorrente = () => {
    if (!livelloCorrente || livelloCorrente.proposte.length <= 1) return;
    const doc = eliminaProposta(documento, livelloCorrente.id, propostaId);
    const resta = doc.livelli.find((l) => l.id === livelloCorrente.id)?.proposte[0]?.id ?? ID_PROPOSTA;
    vaiAllaProposta(resta, doc);
  };

  const cambiaVista = (v: C.Vista) => {
    chiudiTracciati();
    setVista(v);
    setPassoChat(null);
    setInizioParete(null);
    setInizioQuota(null);
    setRiferimentoCad(null);
    setSovrapposizioni({});
    setMisura(null);
  };

  const annullaPasso = () => {
    setAnteprima(null);
    setPassoChat(null);
    scegliTratto(trattoId);
    setStoria(annulla);
  };
  const ripetiPasso = () => { setPassoChat(null); scegliTratto(trattoId); setStoria(ripeti); };

  const vuota = !(pianta.muri.length || pianta.locali.length || pianta.elementi?.length || pianta.aree?.length);
  const comandoCad = eComandoCad(strumento) ? strumento : null;
  const riferimentoPronto = !!riferimentoCad && pianta.muri.some(m => m.id === riferimentoCad && riferimentoCadVisibile(m.stato, vista));
  const istruzioneCad = !riferimentoPronto ? "Seleziona la parete di riferimento." : comandoCad === "offset"
    ? "Indica il lato sul disegno per creare la parallela." : comandoCad === "taglia"
    ? "Clicca la parte di parete da rimuovere." : "Clicca l’estremità della parete da estendere.";
  const cursore =
    posaCollettore || calibra || verticiTracciato || comandoCad || strumento === "stanza" || strumento === "poligono" || strumento === "area" || strumento === "parete" || strumento === "demolizioni" || strumento === "quota" ? "crosshair"
      : strumento === "porta" || strumento === "finestra" || strumento === "arredo" ? "copy"
      : strumento === "testo" ? "text" : "default";

  // ─── interfaccia ──────────────────────────────────────────────────────────
  const { statoImpianti, impianti } = useMemo(() => {
    const statoImpianti = (vista === "progetto" && livelloCorrente.proposte.find(p => p.id === propostaId)) || livelloCorrente.fatto;
    return { statoImpianti, impianti: percorsiImpianti(statoImpianti) };
  }, [livelloCorrente, propostaId, vista]);
  const impiantiPrimaChat = useMemo(() => {
    if (!vistaPrimaChat || !mostraLinee) return undefined;
    const pianoPrima = documentoConfermato.livelli.find(l => l.id === livelloId) ?? documentoConfermato.livelli[0];
    const statoPrima = (vista === "progetto" && pianoPrima.proposte.find(p => p.id === propostaId)) || pianoPrima.fatto;
    return { linee: percorsiImpianti(statoPrima).percorsi, stato: statoPrima };
  }, [vistaPrimaChat, mostraLinee, documentoConfermato, livelloId, propostaId, vista]);
  const totaleRadiante = mostraLinee ? zoneRadianti(statoImpianti).reduce((totale, zona) => totale + zona.superficieMq, 0) : 0;
  const totaliLinee = useMemo(() => {
    const t = new Map<(typeof impianti.percorsi)[number]["linea"], number>();
    for (const p of impianti.percorsi) t.set(p.linea, (t.get(p.linea) ?? 0) + p.lunghezzaCm);
    return t;
  }, [impianti]);
  const NOMI_PARTENZE: Record<string, string> = { quadro_elettrico: "il quadro elettrico", collettore: "il collettore (o la caldaia)", colonna_scarico: "la colonna di scarico", unita_esterna: "l'unità esterna del clima", generatore: "la caldaia o la pompa di calore (Arredi → Energia)" };
  const tratto = pannelloTracciati ? impianti.percorsi.find(p => chiaveTratto(p) === trattoId) : undefined;
  const anteprimaTratto = tratto && verticiTracciato ? percorsoConVertici(tratto, verticiTracciato.map(p => ({ x: p.x, y: -p.y }))) : undefined;
  const confrontoScarico = propostaChat?.confrontoScarico;
  const tracciatoVisibile = anteprimaTratto ?? tratto ?? confrontoScarico?.dopo;
  const attraversamenti = tracciatoVisibile ? attraversamentiImpianto(tracciatoVisibile, statoImpianti) : [];
  const aggiornaRadiante = (localeId: string, zona: ZonaRadiante | null) => {
    const corrente = stato.current.storia.presente;
    const zone = (statoImpianti.pavimentoRadiante ?? []).filter(z => z.localeId !== localeId);
    if (zona) zone.push(zona);
    applica({ ...corrente, pavimentoRadiante: { ...corrente.pavimentoRadiante, [vista]: zone } });
  };
  const aggiornaCollettore = (collettore: CollettoreRadiante | null) => {
    const corrente = stato.current.storia.presente;
    applica({ ...corrente, collettoriRadianti: { ...corrente.collettoriRadianti, [vista]: collettore } });
  };
  const aggiornaTracciato = (chiave: string, vertici?: Punto[]) => {
    const corrente = stato.current.storia.presente;
    const tracciati = (corrente.tracciatiImpianti ?? []).filter(t => chiaveTratto(t) !== chiave);
    if (tratto && vertici) tracciati.push({ linea: tratto.linea, daId: tratto.daId, aId: tratto.aId, vertici });
    applica({ ...corrente, tracciatiImpianti: tracciati });
    scegliTratto(chiave);
  };

  const barraVista = (
    <div className="inline-flex rounded-md border bg-muted/60 p-0.5 text-xs" role="radiogroup" aria-label="Quale pianta">
      {(
        [
          ["fatto", "Com'è oggi"],
          ["progetto", "Progetto"],
        ] as const
      ).filter(([v]) => !ambitoComputo || ambitoComputo.propostaId || v === "fatto").map(([v, etichetta]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={vista === v}
          aria-label={telefono ? etichetta : undefined}
          onClick={() => cambiaVista(v)}
          className={cn("rounded px-2.5 py-1.5 font-medium transition-colors", telefono && "h-10 whitespace-nowrap px-2 py-0", vista === v ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {/* sul telefono la riga è una sola: «Oggi» al posto di «Com'è oggi» */}
          {telefono && v === "fatto" ? "Oggi" : etichetta}
        </button>
      ))}
    </div>
  );

  const zoom = (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="outline" className={telefono ? "min-h-10 min-w-10" : "h-9 w-9"} aria-label="Rimpicciolisci" onClick={() => zoomAttorno(1 / 1.25, { x: dimensioni.w / 2, y: dimensioni.h / 2 })}>
        <Minus />
      </Button>
      <Button size="icon" variant="outline" className={telefono ? "min-h-10 min-w-10" : "h-9 w-9"} aria-label="Ingrandisci" onClick={() => zoomAttorno(1.25, { x: dimensioni.w / 2, y: dimensioni.h / 2 })}>
        <Plus />
      </Button>
      <Button size="sm" variant="outline" className={telefono ? "min-h-10 min-w-10 px-0" : undefined} onClick={() => { setPiantaRipiegata(false); adatta(); }} aria-label="Vedi tutta la pianta">
        <Maximize2 /> <span className="hidden lg:inline">Tutta</span>
      </Button>
    </div>
  );

  const annullaRipeti = (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" className={telefono ? "min-h-10 min-w-10 px-0" : undefined} onClick={annullaPasso} disabled={!storia.passato.length} aria-label="Annulla">
        <Undo2 /> <span className="hidden sm:inline">Annulla</span>
      </Button>
      <Button size="sm" variant="outline" className={telefono ? "min-h-10 min-w-10 px-0" : undefined} onClick={ripetiPasso} disabled={!storia.futuro.length} aria-label="Ripeti">
        <Redo2 /> <span className="hidden sm:inline">Ripeti</span>
      </Button>
    </div>
  );

  const confrontoAttivo = piantaNascosta && vistaDifferenzeChat ? "dopo" : confrontoChat;
  const confrontoVisteChat = propostaPronta && (
    <div role="group" aria-label={piantaNascosta ? "Confronta la proposta in 3D" : "Confronta sulla pianta"}
      className={cn("flex flex-wrap items-center gap-0.5", !piantaNascosta && "w-fit rounded-lg border bg-background/95 p-1 shadow-md")}>
      {VISTE_CONFRONTO_CHAT.filter(([id]) => !piantaNascosta || id !== "differenze").map(([id, etichetta]) => <Button
        key={id} type="button" size="sm"
        variant={confrontoAttivo === id ? "secondary" : "ghost"}
        className="pl-chat-controllo h-8 px-2 text-xs sm:px-3 sm:text-sm"
        aria-pressed={confrontoAttivo === id}
        onClick={() => { setAnimazioneChat(null); setConfrontoChat(id); }}>{etichetta}</Button>)}
      {!piantaNascosta && <Button type="button" size="icon" variant="ghost" className="pl-chat-controllo size-8" aria-label="Riproduci le modifiche" title="Riproduci le modifiche"
        disabled={!primaChat} onClick={() => {
          if (!primaChat) return;
          setConfrontoChat("differenze");
          setAnimazioneChat({ numero: ++numeroAnimazioneChat.current, prima: primaChat, evidenza: propostaChat?.evidenza });
        }}><Play className="size-3.5" /></Button>}
    </div>
  );

  return (
    <div className={cn("flex h-full min-h-[480px] flex-col overflow-hidden rounded-xl border bg-background shadow-sm", confrontoAperto && "max-lg:min-h-[800px]", chatAperta && "max-lg:min-h-[830px]", className)}>
      <div className="flex shrink-0 flex-col border-b bg-background">
        <div className={cn("flex flex-wrap items-start justify-between gap-2 px-2.5 py-2.5", telefono && "flex-nowrap items-center gap-1 px-2 py-1.5")}>
          {telefono && soloVista === undefined && (
            <Button size="sm" variant={modificaTelefono ? "default" : "outline"} className="min-h-10 shrink-0 px-2.5" disabled={chatAperta}
              aria-label={modificaTelefono ? "Fine modifica" : "Modifica"} onClick={() => { setModificaTelefono((v) => !v); setStrumento("seleziona"); }}>
              <PenLine /> {modificaTelefono ? "Fine" : "Modifica"}
            </Button>
          )}
          {ambitoComputo && !sola && <Button type="button" size="sm" variant={strumentiAperti ? "secondary" : "outline"}
            className={telefono ? "min-h-10 min-w-10 shrink-0 px-0" : undefined} aria-label={telefono ? "Strumenti del disegno" : undefined}
            aria-expanded={strumentiAperti} onClick={() => setStrumentiAperti(aperti => !aperti)}>
            <SlidersHorizontal aria-hidden="true" /> {!telefono && "Strumenti del disegno"}
          </Button>}
          {telefono && sola && barraVista}
          {!sola && strumentiVisibili && (
            <fieldset disabled={bloccoChat} aria-label="Strumenti di disegno"
              className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-1",
                telefono && "flex-nowrap overflow-x-auto [scrollbar-width:none] [&_button]:min-h-10 [&_button]:shrink-0 [&>div]:shrink-0 [&>div]:flex-nowrap")}>
              <div className="flex flex-wrap items-center gap-1">
                <BottoneStrumento attivo={strumento === "seleziona"} onClick={() => setStrumento("seleziona")} icona={<MousePointer2 />} etichetta="Seleziona" />
                <BottoneStrumento attivo={strumento === "stanza"} onClick={() => setStrumento("stanza")} icona={<Square />} etichetta="Stanza" />
                <StanzaDaMisure
                  onAggiungi={(w, l, nome, destinazione) => {
                    const r = C.aggiungiStanzaDaMisure(storia.presente, w, l, { nome, destinazione, stato: C.statoNuovo(vista) });
                    applica(r.pianta);
                    setStrumento("seleziona");
                    setGruppo(C.gruppoVuoto());
                    setSelezione({ tipo: "locale", id: r.id });
                    setTimeout(adatta, 0);
                  }}
                />
                <BottoneStrumento attivo={strumento === "poligono"} onClick={() => setStrumento("poligono")} icona={<Hexagon />} etichetta="Stanza libera" titolo="Una stanza di qualunque forma: clic su ogni angolo" />
                <BottoneStrumento attivo={strumento === "parete"} onClick={() => setStrumento("parete")} icona={<PenLine />} etichetta="Parete" />
                {!!pianta.muri.length && <BottoneStrumento attivo={strumento === "demolizioni"} icona={<Eraser />}
                  etichetta="Segna demolizioni" titolo="Passa sui tramezzi e conferma nella variante"
                  onClick={() => { setVista("progetto"); setCalibra(null); setStrumento("demolizioni"); }} />}
              </div>
              <div className="flex items-center gap-1 border-l pl-1">
                <BottoneStrumento
                  attivo={strumento === "porta"}
                  onPointerDown={trascinaDallaBarra("porta")}
                  onClick={() => setStrumento("porta")}
                  icona={<DoorOpen />}
                  etichetta="Porta"
                  titolo="Trascinala su una parete"
                />
                <BottoneStrumento
                  attivo={strumento === "finestra"}
                  onPointerDown={trascinaDallaBarra("finestra")}
                  onClick={() => setStrumento("finestra")}
                  icona={<AppWindow />}
                  etichetta="Finestra"
                  titolo="Trascinala su una parete"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1 border-l pl-1">
                <StrumentoEsterni
                  attivo={strumento === "area"}
                  onRilievo={() => setRilievoAperto(true)}
                  conRilievo={!!documento.rilievo}
                  tipo={tipoArea}
                  onScegli={(t) => {
                    setTipoArea(t);
                    setStrumento("area");
                  }}
                />
                <CatalogoArredi
                  attivo={strumento === "arredo"}
                  onScegli={(voce) => {
                    setStrumento("arredo");
                    setArredoScelto(voce);
                  }}
                  onTelaio={() => setTelaioAperto(true)}
                />
                <BottoneStrumento attivo={strumento === "quota"} onClick={() => setStrumento("quota")} icona={<MoveHorizontal />} etichetta="Quota" titolo="Misura fra due punti" />
                <BottoneStrumento attivo={strumento === "testo"} onClick={() => setStrumento("testo")} icona={<Type />} etichetta="Testo" />
              </div>
            </fieldset>
          )}
          {telefono && <Button type="button" size="icon" variant={altroAperto ? "secondary" : "outline"} className="ml-auto min-h-10 min-w-10 shrink-0"
            aria-label="Altri comandi" title="Piani, varianti, sfondo, comandi delle pareti e abachi"
            aria-controls={`${idAltro}-piano ${idAltro}-pareti`} aria-expanded={altroAperto} onClick={() => setAltroAperto(v => !v)}>
            <Ellipsis aria-hidden="true" />
          </Button>}
          {soloVista !== true && <Button ref={bottoneChat} type="button" size="sm" variant={(inSilvio ? !chatAperta : chatAperta) ? "default" : "outline"}
            className={cn("ml-auto shrink-0 gap-2", !inSilvio && !chatAperta && "border-primary/25 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary", telefono && "ml-0 min-h-10 min-w-10 px-0")}
            aria-controls={idChat} aria-expanded={chatAperta} disabled={inSilvio && bloccoChat} onClick={chatAperta ? chiudiChatDisegno : apriChatDisegno}>
            <MessageSquare aria-hidden="true" className="h-4 w-4" /> {telefono
              ? <span className="sr-only">{inSilvio ? chatAperta ? "Nascondi Silvio" : "Chiedi a Silvio" : "Chat del disegno"}</span>
              : inSilvio ? chatAperta ? "Nascondi Silvio" : "Chiedi a Silvio" : "Chat del disegno"}
          </Button>}
        </div>
        <div id={`${idAltro}-piano`} className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t bg-slate-50/70 px-2.5 py-2", telefono && "[&_button]:min-h-10", altroNascosto && "hidden")}>
          <fieldset disabled={bloccoChat} className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Piano e visualizzazione">
            {!sola && !ambitoComputo && (
              <BarraPiani
                livelli={documento.livelli.map((l) => ({ id: l.id, nome: l.nome, quota: l.quota, tetto: l.tetto }))}
                fotovoltaico={fotovoltaicoInfo}
                livelloId={livelloId ?? documento.livelli[0]?.id}
                onScegli={(id) => vaiAlPiano(id)}
                onNuovo={nuovoPiano}
                onModifica={modificaPiano}
                onTogli={togliPiano}
              />
            )}
            {!(telefono && sola) && barraVista}
            {!sola && strumentiVisibili && (
              <SfondoDaRicalcare
                ricalco={ricalco}
                bloccata={ricalcoBloccato}
                riferimentoDwg={!!tavolaDwg}
                onCambia={(sfondoAggiornato) => { setCalibra(null); aggiornaSfondo(sfondoAggiornato); }}
                onCarica={caricaRicalco}
                calibrando={calibra !== null}
                onCalibra={avviaCalibrazione}
                onVerifica={livelloCorrente?.fatto.muri.length && !bloccoChat && ricalco?.calibrata!==false
                  && !scalaModelloDaVerificare(livelloCorrente) ? apriRiscontroScala : undefined}
              />
            )}
            {(tavolaDwg || pianoDwg && ricalco) && <LayerDwg key={livelloCorrente.id} tavola={tavolaDwg}
              vista={vistaLayerDwg} onVista={setVistaLayerDwg} bloccata={ricalcoBloccato || !ricalco}
              onBlocca={ricalco && !sola ? () => {
                setCalibra(null);
                setRicalco({ ...ricalco, bloccata: !ricalcoBloccato });
              } : undefined} />}
            {!sola && !ambitoComputo && !!statoPerFrazionamento?.locali.length && <Button type="button" size="sm" variant="outline" onClick={() => {
              if (!livelloCorrente?.fatto.locali.length) {
                setFrazionamento(true);
                return;
              }
              setStudioBilocali({ unita: documento.urbanistica?.intervento?.unitaPreviste === 3 ? 3 : 2 });
            }}>Fraziona</Button>}
            {studioBilocali && !sola && livelloCorrente && <StudioBilocaliDialog piano={livelloCorrente} documento={documento} avvio={studioBilocali}
              onChiudi={() => setStudioBilocali(null)}
              onCalibra={() => {
                setStudioBilocali(null);
                cambiaVista("fatto");
                if (ricalco?.calibrata === false) avviaCalibrazione();
                else apriRiscontroScala();
              }}
              onDisegnaPorta={() => {
                setStudioBilocali(null);
                cambiaVista("fatto");
                setStrumento("porta");
                setAvviso("Posiziona la porta esistente sulla parete perimetrale.");
              }}
              onDividiAmbiente={() => {
                setStudioBilocali(null);
                setFrazionamento(true);
              }}
              onCrea={({ proposta, intervento, profilo, daRivedere }) => {
                const id = prossimaProposta({ proposte: documento.livelli.flatMap(l => l.proposte) });
                const fascicolo = documento.urbanistica ?? nuovoFascicoloUrbanistico();
                const riferimentiMilano = profilo === "milano" && !fascicolo.comune
                  ? { comune: "Milano", codiceIstat: "015146", regione: "Lombardia" } : {};
                const doc = {
                  ...documento,
                  urbanistica: { ...fascicolo, ...riferimentiMilano, intervento },
                  livelli: documento.livelli.map(l => l.id === livelloCorrente.id
                    ? { ...l, proposte: [...l.proposte, { ...proposta, id }] } : l),
                };
                setStudioBilocali(null);
                vaiAllaProposta(id, doc);
                if (daRivedere.length) setAvviso("Arredi da rivedere in " + daRivedere.length + " ambienti.");
              }} />}
            {frazionamento && !sola && livelloCorrente && statoPerFrazionamento && (
              <FrazionamentoDialog
                companyId={companyId}
                scalaDaVerificare={scalaModelloDaVerificare(livelloCorrente)}
                base={{ ...statoPerFrazionamento, id: prossimaProposta({proposte:documento.livelli.flatMap(l=>l.proposte)}), nome: "" }}
                localeIniziale={selezione?.tipo === "locale" ? selezione.id : undefined}
                onChiudi={() => setFrazionamento(false)}
                onApplica={(variante) => {
                  const doc = { ...documento, livelli: documento.livelli.map(l => {
                    const origine = vista === "progetto" ? l.proposte.find(p=>p.id===propostaId) : undefined;
                    const aggiunta = l.id === livelloCorrente.id ? variante : origine ? {...origine,id:variante.id,nome:variante.nome} : null;
                    return aggiunta ? {...l,proposte:[...l.proposte,aggiunta]} : l;
                  }) };
                  setFrazionamento(false);
                  vaiAllaProposta(variante.id, doc);
                }}
              />
            )}
            {documento.letturaDocumento && <Button type="button" size="sm" variant={confrontoAperto ? "secondary" : "outline"} aria-pressed={confrontoAperto} onClick={() => {
              if (chatAperta) chiudiChatDisegno();
              chiudiTracciati();
              if (!confrontoAperto) setPiantaRipiegata(false);
              setConfrontoAperto(!confrontoAperto);
            }}>Confronta foto e pianta</Button>}
            {!sola && !ambitoComputo && vista === "progetto" && livelloCorrente && livelloCorrente.proposte.length > 0 && (
              <BarraProposte
                proposte={livelloCorrente.proposte.map((x) => ({ id: x.id, nome: x.nome }))}
                propostaId={propostaId}
                onScegli={(id) => vaiAllaProposta(id)}
                onNuova={nuovaProposta}
                onRinomina={rinominaPropostaCorrente}
                onTogli={togliPropostaCorrente}
              />
            )}
            {!sola && strumentiVisibili && (
              <Button size="sm" variant={mostraLinee ? "default" : "outline"} aria-pressed={mostraLinee} onClick={() => { if (mostraLinee) chiudiTracciati(); setMostraLinee(v => !v); }} title="Mostra percorsi e zone radianti sulla pianta">
                Linee impianti
              </Button>
            )}
            {!sola && strumentiVisibili && <Button size="sm" variant={pannelloTracciati ? "secondary" : "outline"} aria-pressed={pannelloTracciati}
              onClick={() => {
                if (pannelloTracciati) { chiudiTracciati(); return; }
                if (chatAperta) chiudiChatDisegno();
                setConfrontoAperto(false);
                setStrumento("seleziona");
                setSelezione(null);
                setGruppo(C.gruppoVuoto());
                setCalibra(null);
                setMostraLinee(true);
                setPiantaRipiegata(false);
                setPannelloTracciati(true);
              }}>{vista === "progetto" ? "Tracciati impianti" : "Pavimento radiante"}</Button>}
            {!sola && strumentiVisibili && <NordPianta nord={documentoConfermato.nord} onCambia={nord => {
              setBaseDisegno({ documento: { ...documentoConfermato, nord }, pianta: storia.presente });
            }} />}
            {strumentiVisibili && <div className="flex items-center gap-1.5 pl-0.5 text-xs">
              {/* Sul telefono resta la sola tendina: la parola «Ambito» mandava la barra a capo. */}
              <label htmlFor="ambito-documento-pianta" className="font-medium text-muted-foreground max-md:sr-only">Ambito</label>
              <UniformSelect id="ambito-documento-pianta" aria-label="Cosa rappresenta la pianta?"
                title={documento.ambitoDocumento === "ambiente" ? "Verifiche sui locali rappresentati" : documento.ambitoDocumento === "alloggio" ? "Verifiche sui locali e sull’intero alloggio" : "Specifica se la tavola mostra un ambiente o tutto l’alloggio."}
                className="h-8 rounded-md border bg-background px-2 font-normal" value={documento.ambitoDocumento ?? ""}
                disabled={soloVista || bloccoChat} onChange={(e) => applica({ ...pianta, ambitoDocumento: e.target.value === "ambiente" ? "ambiente" : e.target.value === "alloggio" ? "alloggio" : undefined })}>
                <option value="">Da specificare</option><option value="ambiente">Singolo ambiente</option><option value="alloggio">Alloggio completo</option>
              </UniformSelect>
            </div>}
          </fieldset>
          {/* sul telefono annulla/ripeti stanno sulla pianta, accanto allo zoom */}
          {!telefono && <div className="ml-auto flex flex-wrap items-center gap-2">
            <fieldset className="min-w-0" disabled={bloccoChat} aria-label="Cronologia">{annullaRipeti}</fieldset>
            {!telefono && zoom}
            {compatto && !telefono && !chatAperta && (
              <Button size="sm" variant={pannelloAperto ? "default" : "outline"} onClick={() => setPannelloAperto((v) => !v)} aria-pressed={pannelloAperto}>
                {pannelloAperto ? <PanelRightClose /> : <PanelRightOpen />} Stanze
              </Button>
            )}
          </div>}
        </div>
        {strumentiVisibili && <div id={`${idAltro}-pareti`} className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-2.5 py-1.5", telefono && "[&_button]:min-h-10", altroNascosto && "hidden")}>
          {!sola && <fieldset disabled={bloccoChat} className="flex flex-wrap items-center gap-1" aria-label="Modifica pareti">
            {(Object.keys(NOMI_COMANDI_CAD) as ComandoCad[]).map(comando => {
              const Icona = ICONE_COMANDI_CAD[comando];
              return <Button key={comando} type="button" size="sm" variant={strumento === comando ? "default" : "ghost"}
                aria-pressed={strumento === comando} disabled={!pianta.muri.length}
                onClick={() => { setCalibra(null); setStrumento(strumento === comando ? "seleziona" : comando); }}>
                <Icona />{NOMI_COMANDI_CAD[comando]}
              </Button>;
            })}
            <Button size="sm" type="button" variant={precisione ? "secondary" : "ghost"} aria-pressed={precisione}
              title="Attiva o disattiva punti medi e intersezioni"
              onClick={() => { setPrecisione(p => !p); setSovrapposizioni({}); }}><Magnet /> Agganci precisi</Button>
            <CoordinateDisegno etichetta={NOMI_STRUMENTI_PUNTO[eStrumentoPunto(strumento) ? strumento : "parete"]}
              precedente={eStrumentoPunto(strumento) ? ultimoPunto(strumento) : undefined}
              onApri={() => { setCalibra(null); if (!eStrumentoPunto(strumento)) setStrumento("parete"); }}
              onPunto={punto => posaPuntoDisegno(eStrumentoPunto(strumento) ? strumento : "parete", { punto, guida: "griglia" }, true)} />
          </fieldset>}
          <AccessoAbachiPianta documento={documento} livelloId={livelloCorrente.id} ambito={dati.ambito} quantita={dati.quantita}
            nomeContesto={`${livelloCorrente.nome} · ${vista === "fatto" ? "Com’è oggi" : livelloCorrente.proposte.find(p => p.id === propostaId)?.nome ?? "Progetto"}`} />
        </div>}
        {!sola && comandoCad && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-primary/15 bg-primary/5 px-3 py-1.5 text-xs">
          <span role="status" className="font-medium text-primary">{istruzioneCad}</span>
          {comandoCad === "offset" && <Label className="flex items-center gap-2 text-xs font-normal">Distanza (cm)
            <Input className="h-8 w-24 bg-background" inputMode="decimal" value={offsetCm}
              onChange={e => { setOffsetCm(e.target.value); setSovrapposizioni({}); }} />
          </Label>}
          {riferimentoPronto && <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setRiferimentoCad(null); setSovrapposizioni({}); }}>Cambia riferimento</Button>}
        </div>}
      </div>

      {!sola && ricalco && (ricalco.calibrata === false || calibra) && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-primary/15 bg-primary/5 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Ruler className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div aria-live="polite">
              <p className="text-sm font-semibold">{calibra ? "Imposta la scala" : "Scala da impostare"}</p>
              <p className="text-xs text-muted-foreground">{calibra?.fase === "primo" ? "Seleziona il primo estremo di una quota nota sulla tavola."
                : calibra?.fase === "secondo" ? "Seleziona l’altro estremo della stessa quota."
                : calibra?.fase === "misura" ? "Inserisci la misura riportata sulla tavola."
                : "Usa una quota nota per ricalcare con le misure corrette."}</p>
            </div>
          </div>
          {calibra ? <Button type="button" size="sm" variant="ghost" onClick={() => setCalibra(null)}>Annulla calibrazione</Button>
            : <Button type="button" size="sm" disabled={!sfondo || ricalcoBloccato} onClick={avviaCalibrazione}>Imposta scala</Button>}
        </div>
      )}

      {!sola && livelloCorrente && ricalco?.calibrata !== false && scalaModelloDaVerificare(livelloCorrente) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span>Scala del modello da verificare. Confronta la lunghezza di una parete con una quota nota.</span>
          <Button size="sm" variant="outline" onClick={apriRiscontroScala} disabled={bloccoChat || !livelloCorrente.fatto.muri.length}>Verifica scala del modello</Button>
        </div>
      )}

      {verificaScala && livelloCorrente && (() => {
        const muri = livelloCorrente.fatto.muri;
        const muro = muri.find(m => m.id === verificaScala.muroId);
        const lunghezza = muro ? dist(muro.p1, muro.p2) : 0;
        return <Dialog open onOpenChange={aperto => { if (!aperto) setVerificaScala(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Verifica scala del modello</DialogTitle>
              <DialogDescription>Scegli una parete disegnata e confronta la lunghezza all’asse con la misura nota.</DialogDescription>
            </DialogHeader>
            <form className="space-y-3" onSubmit={e => {
              e.preventDefault();
              const misura = Number(verificaScala.misura.trim().replace(",", ".")) * 100;
              if (!muro || !Number.isFinite(misura) || misura <= 0 || Math.abs(misura - lunghezza) > 1) {
                if (muro && Number.isFinite(misura) && misura>0) setRiscontroScala({stato:"da_verificare"});
                setVerificaScala({ ...verificaScala, errore: "La misura non coincide con la parete. Seleziona il riferimento corretto o correggi la quota nel disegno." });
                return;
              }
              setRiscontroScala({ stato: "confermata", muroId: muro.id, distanzaCm: misura, verificataIl: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }) });
              setVerificaScala(null);
              setAvviso("Scala del modello riscontrata sulla parete selezionata.");
            }}>
              <Label className="block space-y-1.5"><span>Parete di riferimento</span>
                <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={verificaScala.muroId} onChange={e =>
                  setVerificaScala({ ...verificaScala, muroId: e.target.value, errore: undefined })}>
                  {muri.map((m, i) => <option key={m.id} value={m.id}>Parete {i + 1} · {scriviMetri(dist(m.p1, m.p2))} m</option>)}
                </select>
              </Label>
              <Label className="block space-y-1.5"><span>Misura nota in metri</span>
                <Input value={verificaScala.misura} inputMode="decimal" onChange={e => setVerificaScala({ ...verificaScala, misura: e.target.value, errore: undefined })} />
              </Label>
              {verificaScala.errore && <p role="alert" className="text-sm text-destructive">{verificaScala.errore}</p>}
              <DialogFooter><Button type="submit" disabled={!verificaScala.misura.trim()}>Conferma riscontro</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>;
      })()}

      {!sola && calibra?.fase === "misura" && (
        <Dialog open onOpenChange={(aperto) => { if (!aperto) setCalibra(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Scala della tavola</DialogTitle>
              <DialogDescription>Inserisci la distanza fra i due punti selezionati sulla tavola.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); confermaCalibrazione(); }}>
              <div className="space-y-2">
                <Label htmlFor="distanza-scala-tavola">Distanza in metri</Label>
                <Input id="distanza-scala-tavola" inputMode="decimal" value={calibra.metri} placeholder="Es. 4,20"
                  onChange={(e) => setCalibra({ ...calibra, metri: e.target.value, errore: undefined })} />
              </div>
              {ridimensionabile && <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-primary" checked={calibra.ridimensiona}
                  onChange={e => setCalibra({ ...calibra, ridimensiona: e.target.checked, errore: undefined })} />
                <span>Ridimensiona il disegno con la tavola
                  <span className="block text-xs text-muted-foreground">Aggiorna le misure in pianta, comprese le larghezze dei vani. Dopo il ricalcolo riparte la cronologia del piano.</span>
                </span>
              </label>}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-primary" checked={calibra.diProva}
                  onChange={e => setCalibra({ ...calibra, diProva: e.target.checked, errore: undefined })} />
                <span>Usa una quota di prova<span className="block text-xs text-muted-foreground">La scala resta da confermare.</span></span>
              </label>
              {calibra.errore && <p role="alert" className="text-sm text-destructive">{calibra.errore}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCalibra({ fase: "primo" })}>Scegli di nuovo i punti</Button>
                <Button type="submit" disabled={!distanzaValida}>Applica scala</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <div className="relative flex min-h-0 flex-1 max-lg:flex-col">
        {confrontoAperto && !chatAperta && documento.letturaDocumento && <ConfrontoDocumentoPianta documento={documento} livelloId={livelloId}
          sorgente={sorgenteDocumento ?? (documento.letturaDocumento.sorgente ? undefined : schizzoSessione)} archivio={archivio} solaLettura={soloVista}
          onAggiorna={(d) => {
            if (soloVista) return;
            const stessiLivelli = d.livelli === documento.livelli;
            const piantaVerificata = stessiLivelli ? storia.presente : daPlanimetria(d, livelloId, propostaId);
            setBaseDisegno({ documento: d, pianta: piantaVerificata });
            if (!stessiLivelli) applica(piantaVerificata);
          }}
          onSeleziona={(v) => { setEvidenzaId(v.id); const r = v.riferimento; if (!r) return; if (r.livelloId !== (livelloId ?? documento.livelli[0]?.id)) vaiAlPiano(r.livelloId); setVista("fatto"); setSelezione({ tipo: r.tipo, id: r.oggettoId }); setPannelloAperto(true); }} />}
        <div className={cn("flex min-h-0 min-w-0 flex-1", anteprimaAffiancata && "pl-editor-viste")}>
        <div className={cn("flex min-h-0 min-w-0 flex-1", anteprimaAffiancata && "pl-editor-viste-con-3d")}
          data-pianta-nascosta={piantaNascosta || undefined}
          style={anteprimaAffiancata ? { "--peso-pianta": `${quotaPianta}fr`, "--peso-anteprima": `${100 - quotaPianta}fr` } as CSSProperties : undefined}>
        {anteprimaAffiancata && !piantaNascosta && <div className="pl-editor-solo-3d">
          <Button type="button" size="sm" variant="outline" className="h-8" aria-controls={idPianta2D} onClick={mostraSolo3D}>
            <PanelLeftClose aria-hidden="true" /> Solo 3D
          </Button>
        </div>}
        <div ref={contenitoreRef} id={idPianta2D} hidden={piantaNascosta}
          className="relative min-h-[280px] min-w-0 flex-1 lg:min-h-0" style={{ cursor: cursore }}>
          {!piantaNascosta && <>
          <TelaPlanimetria
            ref={svgRef}
            pianta={vistaPrimaChat ? storia.presente : pianta}
            dati={vistaPrimaChat && datiPrimaChat ? datiPrimaChat : dati}
            latiModificabili={bloccoChat ? NESSUN_LATO_MODIFICABILE : latiModificabili}
            misureSoloSelezione={sola || telefono}
            vista={vista}
            selezione={vistaPrimaChat ? null : selezione}
            animazioneChat={chatAperta && !vistaPrimaChat ? animazioneChat : null}
            confrontoChat={vistaDifferenzeChat && !animazioneChat ? primaChat : null}
            confrontoTramezzo={vistaDifferenzeChat ? propostaChat?.confrontoTramezzo : undefined}
            verificaEvidenziata={vista === "fatto" && !vistaPrimaChat && (confrontoAperto || chatAperta) ? documento.letturaDocumento?.verifiche?.find((v) => v.id === evidenzaId && v.riferimento?.livelloId === (livelloId ?? documento.livelli[0]?.id) && v.riferimento?.oggettoId === selezione?.id) : undefined}
            gruppo={gruppo}
            lineeImpianti={vistaPrimaChat ? impiantiPrimaChat?.linee : mostraLinee ? impianti.percorsi : undefined}
            statoRadiante={vistaPrimaChat ? impiantiPrimaChat?.stato : mostraLinee ? statoImpianti : undefined}
            modificaTracciati={pannelloTracciati && !verticiTracciato}
            tracciato={vistaPrimaChat ? undefined : tracciatoVisibile}
            tracciatoPrima={vistaDifferenzeChat ? confrontoScarico?.prima : undefined}
            attraversamentiTracciato={vistaPrimaChat ? undefined : attraversamenti}
            puntoTracciatoAttivo={puntoDaSpostare}
            sfondo={(!vistaPrimaChat && sfondoChat) || (!tavolaDwg && vistaLayerDwg.mostra ? sfondo : null)}
            layerDwg={tavolaDwg && (vistaPrimaChat || !sfondoChat) ? <DisegnoLayerDwg tavola={tavolaDwg} vista={vistaLayerDwg} ricalco={ricalco} /> : null}
            camera={camera}
            larghezza={dimensioni.w}
            altezza={dimensioni.h}
            sovrapposizioni={sovrapposizioni}
            inModifica={misura?.chiave}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />

          {strumento === "demolizioni" && vista === "progetto" && !bloccoChat && sovrapposizioni.demolizioni && (
            <section aria-label="Demolizioni da confermare" className="absolute bottom-3 left-3 right-3 z-[1] w-auto max-w-lg space-y-2 rounded-lg border border-amber-200 bg-background p-3 shadow-md">
              <p role="status" className="text-sm font-medium">
                {sovrapposizioni.demolizioni.daSegnare.length} {sovrapposizioni.demolizioni.daSegnare.length === 1 ? "tramezzo selezionato" : "tramezzi selezionati"}
                {!!sovrapposizioni.demolizioni.protetti.length && " · " + sovrapposizioni.demolizioni.protetti.length
                  + (sovrapposizioni.demolizioni.protetti.length === 1 ? " parete protetta" : " pareti protette")}
              </p>
              <p className="text-xs text-muted-foreground">Verifica la natura dei tramezzi sul rilievo. Le pareti portanti, esterne o da classificare restano protette.</p>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" disabled={!sovrapposizioni.demolizioni.daSegnare.length} onClick={() => {
                  const corrente = stato.current.storia.presente;
                  applica(segnaDemolizioniDalPennello(corrente, sovrapposizioni.demolizioni!.daSegnare));
                  setStrumento("seleziona");
                }}>Conferma demolizioni</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSovrapposizioni({})}>Azzera segni</Button>
              </div>
            </section>
          )}

          {vista === "progetto" && (
            <div className="pointer-events-none absolute left-2 top-2 flex gap-3 rounded-md bg-background/90 px-2 py-1 text-xs shadow-sm">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-slate-700" /> com'è oggi
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-yellow-400" /> da demolire
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-red-600" /> da costruire
              </span>
            </div>
          )}

          {vuota && !ricalco && !sola && !chatAperta && strumento === "seleziona" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="pointer-events-auto max-w-sm rounded-lg border bg-background/95 p-5 text-center shadow-sm">
                <p className="font-semibold">Comincia dalla prima stanza</p>
                <p className="mt-1 text-sm text-muted-foreground">Dai le misure alla chat oppure traccia la stanza sulla tavola.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={apriChatDisegno}><MessageSquare className="h-4 w-4" /> Descrivi la pianta</Button>
                  <Button size="sm" variant="outline" onClick={() => setStrumento("stanza")}>
                    <Square /> Disegna una stanza
                  </Button>
                </div>
              </div>
            </div>
          )}
          {vuota && sola && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <p>La pianta è vuota.</p>
              {/* sul telefono si comincia con un tocco, senza cercare «Modifica» in alto */}
              {telefono && soloVista === undefined && (
                <Button size="sm" className="pointer-events-auto" onClick={() => { setModificaTelefono(true); setStrumento("stanza"); }}>
                  <Square /> Disegna la prima stanza
                </Button>
              )}
            </div>
          )}

          {misura && (
            <CasellaMisura
              key={misura.chiave}
              misura={misura}
              onChiudi={() => setMisura(null)}
            />
          )}

          {confrontoScarico && vistaDifferenzeChat && <div aria-label="Confronto dello scarico" className="absolute left-3 top-9 max-w-[90%] space-y-1 rounded-lg border bg-background/95 p-2.5 text-xs shadow-sm">
            <p className="font-semibold">Percorso dello scarico</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-amber-700" />Prima</span>
              <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-emerald-700" />Proposta</span>
            </div>
          </div>}
          {mostraLinee && !vistaPrimaChat && !pannelloTracciati && !confrontoScarico && (
            <div className="pointer-events-none absolute right-2 top-2 max-w-xs space-y-1 rounded-md bg-background/95 p-2 text-xs shadow-sm">
              <p className="font-semibold">Impianti in pianta</p>
              {totaliLinee.size > 0 && <p className="text-muted-foreground">Metri delle linee con 10% di sfrido</p>}
              {[...totaliLinee].map(([l, cm]) => (
                <p key={l} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: COLORI_LINEE[l] }} />{NOMI_LINEE[l] ?? l}: {metriConSfrido(cm).toLocaleString("it-IT")} m</p>
              ))}
              {totaleRadiante > 0 && <p className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: COLORE_RADIANTE }} />Pavimento radiante · {totaleRadiante.toLocaleString("it-IT", { maximumFractionDigits: 2 })} m²</p>}
              {!totaliLinee.size && !impianti.mancano.length && !totaleRadiante && <p className="text-muted-foreground">Posa simboli impianto o aggiungi un pavimento radiante.</p>}
              {impianti.mancano.map(m => {
                const unita = impianti.mancanoPerUnita.filter(v => v.partenza === m).map(v => v.unita);
                return <p key={m} className="text-amber-700">Manca {NOMI_PARTENZE[m]}{unita.length ? ` · ${unita.join(", ")}` : ""} (Arredi → Impianti).</p>;
              })}
            </div>
          )}

          {avviso && (
            <div role="status" className="absolute bottom-12 left-1/2 max-w-md -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">
              {avviso}
            </div>
          )}
          {chatInCorso && chatAperta && <div className="pl-chat-proposta pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border bg-background/95 px-2.5 py-1.5 text-xs font-medium text-primary shadow-sm">
            <span className="pl-chat-attivita size-2 rounded-full bg-primary" aria-hidden="true" /> Silvio lavora sulla tavola
          </div>}
          {propostaPronta && <div className="pl-chat-proposta absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] space-y-1.5">
            {vistaDifferenzeChat && <div className="flex w-fit items-center gap-3 rounded-md border bg-background/95 px-2.5 py-1 text-xs shadow-sm" aria-hidden="true">
              <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[#b45309]" />Prima</span>
              <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-[#0f766e]" />Modifiche</span>
            </div>}
            {confrontoVisteChat}
          </div>}

          {telefono && <div className={cn("absolute right-2 flex items-center gap-1", propostaPronta ? "bottom-14" : "bottom-2")}>
            <fieldset className="min-w-0" disabled={bloccoChat} aria-label="Cronologia">{annullaRipeti}</fieldset>{zoom}
          </div>}
          </>}
        </div>
        {anteprimaAffiancata && !piantaNascosta && <DivisoreAnteprima3D idPianta={idPianta2D} quota={quotaPianta} onCambia={setQuotaPianta}
          onNascondi={mostraSolo3D} />}
        {anteprimaAffiancata && onChiudiAnteprima3D && <Anteprima3DEditor documento={documento3D} livelloId={livelloId} propostaId={propostaId} vista={vista}
          fase={vistaPrimaChat ? "prima" : mostraProposta3D ? "proposta" : "corrente"} selezione={vistaPrimaChat ? null : selezione}
          comandoPianta={<Button ref={bottonePianta2D} type="button" size={piantaNascosta ? "sm" : "icon"}
            variant={piantaNascosta ? "outline" : "ghost"} className={cn("h-8 shrink-0", !piantaNascosta && "pl-editor-nascondi-pianta w-8")}
            aria-label={piantaNascosta ? "Mostra pianta 2D" : "Nascondi pianta 2D"}
            aria-controls={idPianta2D} aria-expanded={!piantaNascosta}
            title={piantaNascosta ? "Mostra pianta 2D" : "Nascondi pianta 2D"}
            onClick={() => setPiantaRipiegata(v => !v)}>
            {piantaNascosta ? <><PanelLeftOpen aria-hidden="true" />Mostra pianta</>
              : <><PanelLeftClose aria-hidden="true" /><span>Nascondi pianta</span></>}
          </Button>}
          confronto={piantaNascosta ? confrontoVisteChat : undefined}
          onCompleta={onApri3DCompleto && (() => onApri3DCompleto(documento3D, vista, propostaId, livelloId))}
          onSeleziona={vistaPrimaChat || chatInCorso || calibra ? undefined : oggetto => {
            setStrumento("seleziona");
            setGruppo(C.gruppoVuoto());
            setSelezione(oggetto);
          }}
          onChiudi={onChiudiAnteprima3D} />}
        </div>
        </div>

        {/* pannello */}
        {pannelloTracciati && <TracciatiImpianti percorsi={impianti.percorsi} daRicollegare={impianti.tracciatiDaRicollegare} elementi={statoImpianti.elementi}
          selezionato={tratto} anteprima={anteprimaTratto} vertici={verticiTracciato} sposta={puntoDaSpostare}
          attraversamenti={attraversamenti} scalaIncerta={scalaModelloDaVerificare(livelloCorrente)}
          stato={statoImpianti} soloRadiante={vista === "fatto"} onCambiaRadiante={aggiornaRadiante}
          posaCollettore={!!posaCollettore} onPosaCollettore={setPosaCollettore} onCambiaCollettore={aggiornaCollettore}
          onScegli={scegliTratto} onModifica={() => setVerticiTracciato(tratto?.vertici?.map(p => ({ x: p.x, y: -p.y })) ?? [])}
          onSposta={setPuntoDaSpostare} onTogliUltimo={() => { setVerticiTracciato(v => v?.slice(0, -1) ?? null); setPuntoDaSpostare(null); }}
          onAzzera={() => { setVerticiTracciato([]); setPuntoDaSpostare(null); }}
          onAnnulla={() => scegliTratto(trattoId)} onApplica={() => { if (tratto && verticiTracciato) aggiornaTracciato(trattoId, verticiTracciato); }}
          onRipristina={aggiornaTracciato} onChiudi={chiudiTracciati} />}
        {!pannelloTracciati && !chatAperta && !telefono && (!compatto || pannelloAperto) && (
          <aside className={cn("shrink-0 overflow-y-auto border-l p-3", compatto ? "absolute inset-y-0 right-0 z-10 w-72 bg-background shadow-xl" : "w-72 xl:w-80")}>
            {compatto && (
              <div className="mb-2 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setPannelloAperto(false)}>Chiudi</Button>
              </div>
            )}
            {C.quantiNelGruppo(gruppo) > 0 ? (
              <PannelloGruppo gruppo={gruppo} onAzione={azioneGruppo} />
            ) : (
              <PannelloDettagli pianta={pianta} dati={dati} sottotetto={sottotetto} latiModificabili={latiModificabili} vista={vista} selezione={selezione} azioni={azioni} focusNome={selezione?.tipo === "locale" && selezione.id === stanzaNuova} essenziale={sola} pavimentoComune={pavimentoComune} />
            )}
          </aside>
        )}
        <ChatDisegnoPlanimetria id={idChat} aperta={chatAperta} base={storia.presente} passo={passoChat} inSilvio={inSilvio}
          piano={livelloCorrente?.nome ?? "Piano terra"} vista={vista} selezione={selezione}
          contesto={{ documento: documentoConfermato, livelloId, propostaId }} localiVisibili={dati.locali}
          superfici={{ locali: dati.locali.length, metriQuadri: dati.locali.reduce((somma, l) => somma + l.mq, 0), stimata: dati.locali.some(l => l.stimata),
            prima: datiPrimaChat?.locali.reduce((somma, l) => somma + l.mq, 0) }}
          applicata={applicataDallaChat}
          consentiListino={!!consentiListinoChat}
          consentiComputo={computoDaChat}
          onRivediNelComputo={propostaChat?.riferimento ? undefined : onRivediNelComputo}
          puoRivedereNelComputo={puoRivedereNelComputo}
          onSalvaDaChat={soloVista ? undefined : onSalvaDaChat}
          onAnnullaApplicazione={applicataDallaChat && applicazioneChat?.annullabile && storia.passato.length && !soloVista ? () => {
            annullaPasso();
            setSelezione(null);
            setAnimazioneChat(null);
          } : undefined}
          mostraFonte={mostraFonteChat} onCambiaFonte={() => setMostraFonteChat(v => !v)}
          onEvidenzia={evidenziaDaChat}
          onInquadraPunto={inquadraPuntoChat}
          onMostra={(passo, quadro) => {
            setPassoChat(passo && (passo.pianta !== storia.presente || passo.revisioneInterventi) ? passo : null);
            if (passo && passoChat && !quadro && passo.revisioneInterventi && passo.pianta === passoChat.pianta) return;
            if (!passo || passo.pianta !== stato.current.pianta) setConfrontoChat("differenze");
            if (passo?.mostraImpianti) setMostraLinee(true);
            setSelezione(passo?.evidenza ?? null);
            setEvidenzaId(undefined);
            if (!passo) setAnimazioneChat(null);
            else if (passo.pianta !== stato.current.pianta || !passoChat) setAnimazioneChat({ numero: ++numeroAnimazioneChat.current,
              prima: { pianta: stato.current.pianta, locali: stato.current.dati.locali }, evidenza: passo.evidenza, quadro: quadro ?? passo.pianta });
            if (!passo?.riferimento) setMostraFonteChat(false);
          }}
          onInCorso={setChatInCorso}
          onApplica={(passo, signal) => {
            if (soloVista || !propostaChatApplicabile(passo) || (passo.revisioneInterventi && passo.revisioneInterventi.base !== storia.presente)) return;
            if (passo.riferimento?.schizzo) return applicaSchizzo(passo, signal);
            if (passo.riferimento?.dwg) return applicaDwg(passo, signal);
            applica(piantaDaApplicare(passo, { documento: documentoConfermato, livelloId, propostaId }), { annullabile: true });
            setSelezione(passo.evidenza ?? null);
          }}
          onCreaAlternativa={soloVista || ambitoComputo ? undefined : (passo, nome) => {
            if (vista !== "progetto" || !propostaChatApplicabile(passo) || passo.revisioneInterventi?.base !== storia.presente) return false;
            const lid = livelloId ?? documentoConfermato.livelli[0].id;
            const piantaNuova = piantaDaApplicare(passo, { documento: documentoConfermato, livelloId: lid, propostaId });
            const alternativa = creaAlternativaInterventi(documentoConfermato, lid, propostaId, piantaNuova, nome);
            const verifica = validaPlanimetria(alternativa.documento);
            if (verifica.ok === false) { setAvviso(verifica.errori[0]); return false; }
            setPassoChat(null);
            setAnimazioneChat(null);
            setMostraFonteChat(false);
            const piantaAlternativa = vaiAlPiano(lid, alternativa.documento, alternativa.id);
            setApplicazioneChat({ pianta: piantaAlternativa, annullabile: false });
            return true;
          }}
          onVerifica={v => {
            setEvidenzaId(v?.id);
            if (v?.riferimento) evidenziaDaChat({ tipo: v.riferimento.tipo, id: v.riferimento.oggettoId });
          }}
          onApriConfronto={() => { chiudiChatDisegno(); setVista("fatto"); setPiantaRipiegata(false); setConfrontoAperto(true); }}
          onApriStudioBilocali={soloVista ? undefined : (studio) => {
            if (telefono) setModificaTelefono(true);
            setStudioBilocali(studio);
          }}
          onVista={onVisteChat ? tipo => onVisteChat(tipo, documentoConfermato, vista, propostaId, livelloId) : undefined}
          onRiferimento={async (file, signal) => {
            await caricaRicalco(file, signal);
            requestAnimationFrame(adatta);
          }}
          onChiudi={chiudiChatDisegno} />
      </div>

      {!chatAperta && telefono && selezione && (
        <div className="max-h-[42vh] overflow-y-auto border-t bg-background p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setSelezione(null)}>
              Chiudi
            </Button>
          </div>
          <PannelloDettagli pianta={pianta} dati={dati} sottotetto={sottotetto} latiModificabili={latiModificabili} vista={vista} selezione={selezione} azioni={azioni} essenziale pavimentoComune={pavimentoComune} />
        </div>
      )}

      {telaioAperto && <TelaioStrutturale aperto onChiudi={() => setTelaioAperto(false)} piani={documento.livelli.length} onCrea={creaTelaio} />}
      {rilievoAperto && <RilievoTerreno aperto onChiudi={() => setRilievoAperto(false)} rilievo={documento.rilievo} centroPianta={centroPianta()} angoliPianta={angoliPianta()} onCambia={cambiaRilievo} />}
      {!sola && !chatAperta && !pannelloTracciati && !eComandoCad(strumento) && <div className="border-t bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">{telefono ? SUGGERIMENTI_TELEFONO[strumento] : SUGGERIMENTI[strumento]}</div>}
    </div>
  );
}

const chiaveGruppo = (tipo: "elemento" | "quota" | "testo"): keyof C.Gruppo => (tipo === "elemento" ? "elementi" : tipo === "quota" ? "quote" : "testi");

function PannelloGruppo({ gruppo, onAzione }: { gruppo: C.Gruppo; onAzione: (a: "ruota" | "specchia" | "copia" | "elimina" | "deseleziona") => void }) {
  const parti = [
    gruppo.elementi.length && `${gruppo.elementi.length} ${gruppo.elementi.length === 1 ? "arredo" : "arredi"}`,
    gruppo.quote.length && `${gruppo.quote.length} ${gruppo.quote.length === 1 ? "quota" : "quote"}`,
    gruppo.testi.length && `${gruppo.testi.length} ${gruppo.testi.length === 1 ? "testo" : "testi"}`,
  ].filter(Boolean);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{C.quantiNelGruppo(gruppo)} oggetti selezionati</p>
        <p className="text-xs text-muted-foreground">{parti.join(" · ")}</p>
      </div>
      <p className="text-xs text-muted-foreground">Trascina uno di loro per spostarli tutti. Maiusc+clic aggiunge o toglie un oggetto.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => onAzione("ruota")} title="R">Ruota 90°</Button>
        <Button size="sm" variant="outline" onClick={() => onAzione("specchia")} title="M">Specchia</Button>
        <Button size="sm" variant="outline" onClick={() => onAzione("copia")} title="Ctrl+D">Copia</Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => onAzione("elimina")} title="Canc">Elimina</Button>
      </div>
      <Button size="sm" variant="ghost" className="w-full" onClick={() => onAzione("deseleziona")}>Deseleziona (Esc)</Button>
    </div>
  );
}

function BarraProposte({ proposte, propostaId, onScegli, onNuova, onRinomina, onTogli }: {
  proposte: Array<{ id: string; nome: string }>;
  propostaId: string;
  onScegli: (id: string) => void;
  onNuova: () => void;
  onRinomina: (nome: string) => void;
  onTogli: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const attuale = proposte.find((x) => x.id === propostaId) ?? proposte[0];
  return (
    <div className="flex items-center gap-1">
      {proposte.length > 1 && (
        <Select value={attuale?.id} onValueChange={onScegli}>
          <SelectTrigger className="h-9 w-40" aria-label="Alternativa di progetto"><SelectValue /></SelectTrigger>
          <SelectContent>{proposte.map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Popover open={aperto} onOpenChange={setAperto}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">{proposte.length > 1 ? "Alternative" : "Altra proposta"}</Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3" align="end">
          {attuale && (
            <div className="space-y-1">
              <Label htmlFor="nome-proposta">Nome di questa proposta</Label>
              <Input id="nome-proposta" key={attuale.id} defaultValue={attuale.nome}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== attuale.nome && onRinomina(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </div>
          )}
          <Button size="sm" className="w-full" onClick={() => { onNuova(); setAperto(false); }}>Duplica in una nuova alternativa</Button>
          <p className="text-[11px] text-muted-foreground">Parte dalla proposta che vedi: cambi solo quello che è diverso, e il confronto lo fai nella scheda.</p>
          {proposte.length > 1 && attuale && (
            <Button size="sm" variant="ghost" className="w-full text-destructive" onClick={() => { if (window.confirm(`Togliere «${attuale.nome}»?`)) { onTogli(); setAperto(false); } }}>
              Togli questa alternativa
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function BarraPiani({ livelli, livelloId, onScegli, onNuovo, onModifica, onTogli, fotovoltaico }: {
  /** Pannelli e kWp di tutto l'edificio (dal computo della pianta). */
  fotovoltaico?: { pannelli: number; kwp: number } | null;
  livelli: Array<{ id: string; nome: string; quota: number; tetto?: Tetto }>;
  livelloId?: string;
  onScegli: (id: string) => void;
  onNuovo: (o: { nome: string; quota: number; base: BaseNuovoPiano }) => void;
  onModifica: (campi: { nome?: string; quota?: number; tetto?: Tetto | null }) => void;
  onTogli: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const attuale = livelli.find((l) => l.id === livelloId) ?? livelli[0];
  const [nome, setNome] = useState("");
  const [quota, setQuota] = useState("");
  const [base, setBase] = useState<BaseNuovoPiano>("esterni");
  const metri = (cm: number) => (cm / 100).toLocaleString("it-IT", { maximumFractionDigits: 2 });
  return (
    <div className="flex items-center gap-1">
      {livelli.length > 1 && (
        <Select value={attuale?.id} onValueChange={onScegli}>
          <SelectTrigger className="h-9 w-40" aria-label="Piano"><SelectValue /></SelectTrigger>
          <SelectContent>{livelli.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Popover open={aperto} onOpenChange={setAperto}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" aria-label="Piani">
            <Layers /> <span className="hidden lg:inline">{livelli.length > 1 ? "Piani" : attuale?.nome ?? "Piano"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-4" align="end">
          {attuale && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Questo piano</p>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <Input key={`n-${attuale.id}`} defaultValue={attuale.nome} aria-label="Nome del piano" onBlur={(e) => e.target.value.trim() !== attuale.nome && onModifica({ nome: e.target.value })} />
                <Input key={`q-${attuale.id}`} defaultValue={metri(attuale.quota)} aria-label="Quota del pavimento in metri" inputMode="decimal"
                  onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v) && Math.round(v * 100) !== attuale.quota) onModifica({ quota: Math.round(v * 100) }); }} />
              </div>
              <p className="text-[11px] text-muted-foreground">Quota del pavimento in metri (0 = piano terra, −3 = interrato).</p>
              <div className="grid grid-cols-[1fr_6rem] items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tetto sopra questo piano</Label>
                  <Select value={attuale.tetto?.tipo ?? "nessuno"} onValueChange={(v) => onModifica({ tetto: v === "nessuno" ? null : { tipo: v as Tetto["tipo"], pendenza: attuale.tetto?.pendenza ?? 30, sporto: attuale.tetto?.sporto ?? 50, ...(attuale.tetto?.finitura ? { finitura: attuale.tetto.finitura } : {}) } })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nessuno">Nessuno (c'è un piano sopra)</SelectItem>
                      <SelectItem value="due_falde">A due falde (capanna)</SelectItem>
                      <SelectItem value="padiglione">A padiglione (quattro falde)</SelectItem>
                      <SelectItem value="una_falda">A una falda</SelectItem>
                      <SelectItem value="shed">A shed (dente di sega, capannoni)</SelectItem>
                      <SelectItem value="piano">Piano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {attuale.tetto && attuale.tetto.tipo !== "piano" && (
                  <Input key={`t-${attuale.id}-${attuale.tetto.pendenza}`} defaultValue={String(attuale.tetto.pendenza)} aria-label="Pendenza in percento" inputMode="decimal"
                    onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (attuale.tetto && Number.isFinite(v) && v >= 0 && v <= 150 && v !== attuale.tetto.pendenza) onModifica({ tetto: { ...attuale.tetto, pendenza: v } }); }} />
                )}
              </div>
              {attuale.tetto && attuale.tetto.tipo !== "piano" && <p className="text-[11px] text-muted-foreground">Pendenza in % (30% è tipica per le tegole). Si vede nel 3D e nei render.</p>}
              {attuale.tetto && (
                <div className="space-y-1">
                  <Label className="text-xs">Copertura</Label>
                  <Select
                    value={attuale.tetto.finitura ?? "predefinita"}
                    onValueChange={(v) => {
                      if (!attuale.tetto) return;
                      const { finitura: _f, ...senza } = attuale.tetto;
                      onModifica({ tetto: v === "predefinita" ? senza : { ...senza, finitura: v as FinituraTetto } });
                    }}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="predefinita">{attuale.tetto.tipo === "piano" ? "Predefinita (cemento)" : "Predefinita (tegole)"}</SelectItem>
                      {FINITURE_TETTO.map((f) => <SelectItem key={f} value={f}>{NOMI_FINITURA_TETTO[f]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {(attuale.tetto.finitura === "verde" || attuale.tetto.finitura === "verde_intensivo") && <p className="text-[11px] text-muted-foreground">Substrato {attuale.tetto.finitura === "verde" ? "10" : "25"} cm. Nel computo: coltivo, strato drenante e telo antiradice. Controlla la portata del solaio.</p>}
                </div>
              )}
              {attuale.tetto && attuale.tetto.tipo !== "piano" && (
                <div className="space-y-1 rounded-md border p-2">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input type="checkbox" checked={!!attuale.tetto.mansarda} onChange={(e) => { if (!attuale.tetto) return; const { mansarda: _m, ...senza } = attuale.tetto; onModifica({ tetto: e.target.checked ? { ...senza, mansarda: { imposta: 140 } } : senza }); }} />
                    Mansarda: le stanze stanno sotto le falde
                  </label>
                  {attuale.tetto.mansarda && (
                    <>
                      <Input key={`imp-${attuale.id}-${attuale.tetto.mansarda.imposta}`} defaultValue={metri(attuale.tetto.mansarda.imposta)} aria-label="Altezza d'imposta in metri" inputMode="decimal"
                        onBlur={(e) => { const v = Math.round(Number(e.target.value.replace(",", ".")) * 100); if (attuale.tetto?.mansarda && Number.isFinite(v) && v >= 0 && v <= 500 && v !== attuale.tetto.mansarda.imposta) onModifica({ tetto: { ...attuale.tetto, mansarda: { imposta: v } } }); }} />
                      <p className="text-[11px] text-muted-foreground">Altezza del soffitto sui muri di gronda, in metri (la più bassa). Da lì il soffitto sale con la pendenza: nella stanza vedi altezza minima, massima e media e la superficie utile (sopra 1,50 m).</p>
                    </>
                  )}
                </div>
              )}
              {attuale.tetto && (
                <div className="space-y-1 rounded-md border p-2">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input type="checkbox" checked={!!attuale.tetto.fotovoltaico} onChange={(e) => attuale.tetto && onModifica({ tetto: e.target.checked ? { ...attuale.tetto, fotovoltaico: { potenzaPannelloW: 430 } } : { tipo: attuale.tetto.tipo, pendenza: attuale.tetto.pendenza, sporto: attuale.tetto.sporto, ...(attuale.tetto.finitura ? { finitura: attuale.tetto.finitura } : {}), ...(attuale.tetto.mansarda ? { mansarda: attuale.tetto.mansarda } : {}) } })} />
                    Fotovoltaico sul tetto
                  </label>
                  {attuale.tetto.fotovoltaico && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Input key={`fvw-${attuale.id}-${attuale.tetto.fotovoltaico.potenzaPannelloW ?? 430}`} defaultValue={String(attuale.tetto.fotovoltaico.potenzaPannelloW ?? 430)} aria-label="Watt per pannello" inputMode="numeric"
                          onBlur={(e) => { const v = Number(e.target.value); if (attuale.tetto?.fotovoltaico && v > 0 && v !== (attuale.tetto.fotovoltaico.potenzaPannelloW ?? 430)) onModifica({ tetto: { ...attuale.tetto, fotovoltaico: { ...attuale.tetto.fotovoltaico, potenzaPannelloW: v } } }); }} />
                        <Input key={`fvn-${attuale.id}-${attuale.tetto.fotovoltaico.pannelliMax ?? ""}`} defaultValue={attuale.tetto.fotovoltaico.pannelliMax ? String(attuale.tetto.fotovoltaico.pannelliMax) : ""} placeholder="tutti" aria-label="Pannelli al massimo" inputMode="numeric"
                          onBlur={(e) => { const v = Number(e.target.value); if (!attuale.tetto?.fotovoltaico) return; const { pannelliMax: _m, ...resto } = attuale.tetto.fotovoltaico; onModifica({ tetto: { ...attuale.tetto, fotovoltaico: v > 0 ? { ...resto, pannelliMax: Math.round(v) } : resto } }); }} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">W per pannello e pannelli al massimo (vuoto: quanti ne stanno). Prima la falda a sud, poi est e ovest.{fotovoltaico ? ` Sul tetto: ${fotovoltaico.pannelli} pannelli, ${fotovoltaico.kwp.toLocaleString("it-IT")} kWp.` : ""}</p>
                    </>
                  )}
                </div>
              )}
              {livelli.length > 1 && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm(`Togliere «${attuale.nome}» con tutto quello che c'è disegnato?`)) { onTogli(); setAperto(false); } }}>
                  Togli questo piano
                </Button>
              )}
            </div>
          )}
          <form className="space-y-2 border-t pt-3" onSubmit={(e) => {
            e.preventDefault();
            const q = Number((quota || "").replace(",", "."));
            const sopra = Math.max(...livelli.map((l) => l.quota), 0) + 300;
            onNuovo({ nome: nome.trim() || `Piano ${livelli.length}`, quota: Number.isFinite(q) && quota.trim() ? Math.round(q * 100) : sopra, base });
            setNome(""); setQuota(""); setAperto(false);
          }}>
            <p className="text-sm font-semibold">Aggiungi un piano</p>
            <div className="flex flex-wrap gap-1">
              {([
                ["Primo piano", Math.max(...livelli.map((l) => l.quota), 0) + 300, "esterni"],
                ["Interrato", Math.min(...livelli.map((l) => l.quota), 0) - 300, "esterni"],
                ["Sottotetto", Math.max(...livelli.map((l) => l.quota), 0) + 300, "esterni"],
                ["Piano tipo uguale", Math.max(...livelli.map((l) => l.quota), 0) + 300, "identico"],
              ] as const).map(([n, q, b]) => (
                <button key={n} type="button" className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted"
                  onClick={() => { setNome(n === "Piano tipo uguale" ? `Piano ${livelli.length}` : n); setQuota(metri(q)); setBase(b); }}>
                  {n}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Primo piano" aria-label="Nome del nuovo piano" />
              <Input value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="3,00" inputMode="decimal" aria-label="Quota del nuovo piano in metri" />
            </div>
            <div className="space-y-1" role="radiogroup" aria-label="Da dove partire">
              {([
                ["esterni", "Dal perimetro", "Le pareti esterne e portanti del piano attuale"],
                ["identico", "Piano identico", "Tutto: stanze, arredi e impianti (piano tipo, appartamenti uguali)"],
                ["tutto", "Copia le pareti", "Pareti, porte e finestre del piano attuale"],
                ["vuoto", "Vuoto", "Si disegna da zero"],
              ] as const).map(([v, t, d]) => (
                <button key={v} type="button" role="radio" aria-checked={base === v} onClick={() => setBase(v)}
                  className={cn("w-full rounded-md border p-2 text-left text-xs", base === v ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                  <span className="font-medium">{t}</span> <span className="text-muted-foreground">— {d}</span>
                </button>
              ))}
            </div>
            <Button type="submit" size="sm" className="w-full">Aggiungi il piano</Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Immagine da ricalcare: si carica (PNG, JPG, WEBP: un PDF va salvato prima come immagine), la
 * si mette in scala (larghezza vera, oppure due punti a distanza nota) e la si lascia sotto il
 * disegno, semitrasparente. Si salva con il piano.
 */
function SfondoDaRicalcare({ ricalco, bloccata, riferimentoDwg, onCambia, onCarica, calibrando, onCalibra, onVerifica }: {
  ricalco: Ricalco | null;
  bloccata: boolean;
  riferimentoDwg: boolean;
  onCambia: (r: Ricalco | null) => void;
  onCarica: (file: File) => Promise<void>;
  calibrando: boolean;
  onCalibra: () => void;
  onVerifica?: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const numero = (v: string) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={ricalco ? "default" : "outline"} title="Un'immagine sotto il disegno da ricalcare: mappa catastale, foto aerea, rilievo del lotto">
          <ImageIcon /> <span className="hidden lg:inline">Ricalca</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="end">
        <p className="text-sm font-semibold">{bloccata ? "Originale DWG bloccato" : "Immagine da ricalcare"}</p>
        {!bloccata && !riferimentoDwg && <Input type="file" accept="image/png,image/jpeg,image/webp" disabled={caricando}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setCaricando(true); setErrore(null);
            try { await onCarica(f); } catch (err) { setErrore(err instanceof Error ? err.message : "Immagine non caricata."); } finally { setCaricando(false); }
          }} />}
        {caricando && <p className="text-xs text-muted-foreground">Carico l'immagine…</p>}
        {errore && <p className="text-xs text-destructive">{errore}</p>}
        {onVerifica && <Button type="button" size="sm" variant="outline" className="w-full" onClick={()=>{setAperto(false);onVerifica();}}>Verifica scala del modello</Button>}
        {ricalco && (
          <>
            {!bloccata && <>
            <div className="grid grid-cols-[1fr_6rem] items-end gap-2">
              <Label className="text-xs" htmlFor="sfondo-larghezza">Larghezza reale (m)</Label>
              <Input id="sfondo-larghezza" key={`l-${ricalco.larghezzaCm}`} defaultValue={String(ricalco.larghezzaCm / 100).replace(".", ",")} inputMode="decimal"
                onBlur={(e) => { const v = numero(e.target.value); if (v && v > 0 && Math.round(v * 100) !== ricalco.larghezzaCm) onCambia({ ...ricalco, larghezzaCm: Math.round(v * 100), calibrata:true }); }} />
            </div>
            <Button size="sm" variant="outline" className="w-full" onClick={() => { onCalibra(); setAperto(false); }} disabled={calibrando}>
              {calibrando ? "Clicca i due punti sul foglio…" : "Metti in scala con due punti"}
            </Button>
            </>}
            <div className="space-y-1">
              <Label className="text-xs">Trasparenza</Label>
              <input type="range" min={0.1} max={1} step={0.05} value={ricalco.opacita} className="w-full" onChange={(e) => onCambia({ ...ricalco, opacita: Number(e.target.value) })} />
            </div>
            {!bloccata && <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Sposta a destra (m)</Label>
                <Input key={`x-${ricalco.x}`} defaultValue={String(ricalco.x / 100)} inputMode="decimal" onBlur={(e) => { const v = numero(e.target.value); if (v != null) onCambia({ ...ricalco, x: Math.round(v * 100) }); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sposta in basso (m)</Label>
                <Input key={`y-${ricalco.y}`} defaultValue={String(-ricalco.y / 100)} inputMode="decimal" onBlur={(e) => { const v = numero(e.target.value); if (v != null) onCambia({ ...ricalco, y: -Math.round(v * 100) }); }} />
              </div>
            </div>}
            {!bloccata && !riferimentoDwg && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onCambia(null)}>Togli l'immagine</Button>}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Lotto e aree esterne: si sceglie cosa disegnare, poi clic sugli angoli. */
function StrumentoEsterni({ attivo, tipo, onScegli, onRilievo, conRilievo }: { attivo: boolean; tipo: TipoArea; onScegli: (t: TipoArea) => void; onRilievo?: () => void; conRilievo?: boolean }) {
  const [aperto, setAperto] = useState(false);
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={attivo ? "default" : "outline"} aria-pressed={attivo} title="Lotto, prato, vialetti, ghiaia, parcheggio">
          <Trees />
          <span>Esterni</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <p className="px-1 pb-2 text-xs text-muted-foreground">Cosa disegni? Poi clic su ogni angolo. Comincia dal lotto (il confine del terreno), poi prato, vialetti e il resto. Piscine, alberi e pergole sono in «Arredi».</p>
        <div className="grid grid-cols-2 gap-1">
          {TIPI_AREA.map((t) => (
            <button key={t} type="button" onClick={() => { onScegli(t); setAperto(false); }}
              className={cn("flex items-center gap-2 rounded-md border p-2 text-left text-xs hover:bg-muted", attivo && tipo === t && "border-primary bg-primary/5")}>
              <span className="inline-block h-3 w-3 shrink-0 rounded-sm border" style={{ background: t === "lotto" ? "transparent" : STILE_AREA[t].fill, borderColor: STILE_AREA[t].bordo, borderStyle: t === "lotto" ? "dashed" : "solid" }} />
              {NOMI_AREA[t]}
            </button>
          ))}
        </div>
        {onRilievo && (
          <button type="button" onClick={() => { onRilievo(); setAperto(false); }} className="mt-2 flex w-full items-center gap-2 rounded-md border border-dashed p-2 text-left text-xs hover:bg-muted">
            <Mountain className="h-4 w-4 shrink-0" />
            <span><span className="font-medium">{conRilievo ? "Rilievo del topografo (caricato)" : "Rilievo del topografo…"}</span><br /><span className="text-muted-foreground">Punti battuti da CSV, TXT o DXF: terreno e curve di livello</span></span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CatalogoArredi({ attivo, onScegli, onTelaio }: { attivo: boolean; onScegli: (voce: VoceCatalogo) => void; onTelaio?: () => void }) {
  const [aperto, setAperto] = useState(false);
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={attivo ? "default" : "outline"} aria-pressed={attivo}>
          <Armchair />
          Arredi
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-2" align="start">
        <p className="px-1 pb-1 text-xs text-muted-foreground">Scegli e poi clicca sul foglio per posarlo.</p>
        {onTelaio && (
          <button type="button" onClick={() => { onTelaio(); setAperto(false); }} className="mb-2 flex w-full items-center gap-2 rounded-md border border-dashed p-2 text-left text-xs hover:bg-muted">
            <Grid3x3 className="h-4 w-4 shrink-0" />
            <span><span className="font-medium">Telaio strutturale…</span><br /><span className="text-muted-foreground">Griglia di pilastri, travi e solaio dalle campate</span></span>
          </button>
        )}
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {GRUPPI_CATALOGO.map((g) => (
            <div key={g}>
              <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
              <div className="grid grid-cols-3 gap-1">
                {CATALOGO.filter((v) => v.gruppo === g).map((v) => {
                  const lato = Math.max(v.larghezza, v.profondita);
                  return (
                    <button
                      key={v.tipo}
                      type="button"
                      className="flex flex-col items-center gap-1 rounded-md border p-1.5 text-[11px] hover:border-primary hover:bg-primary/5"
                      onClick={() => {
                        onScegli(v);
                        setAperto(false);
                      }}
                    >
                      {urlImmagineSimbolo(v.tipo) ? (
                        <img src={urlImmagineSimbolo(v.tipo)!} alt="" className="h-10 w-10 object-contain" loading="lazy" />
                      ) : (
                        <svg viewBox={`${-lato / 2 - 4} ${-lato / 2 - 4} ${lato + 8} ${lato + 8}`} className="h-10 w-10" aria-hidden="true">
                          <SimboloArredo tipo={v.tipo} larghezza={v.larghezza} profondita={v.profondita} colore="#334155" spessore={lato / 40} />
                        </svg>
                      )}
                      <span className="leading-tight">{v.nome}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function sulLato(m: { p1: Punto; p2: Punto }, a: Punto, b: Punto) {
  const su = (p: Punto) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / (dist(a, b) || 1) < 0.5;
  return su(m.p1) && su(m.p2);
}

function nomeUnico(locali: ReadonlyArray<{ nome: string }>, base: string) {
  if (!locali.some((l) => l.nome === base)) return base;
  let n = 2;
  while (locali.some((l) => l.nome === `${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function BottoneStrumento({
  attivo,
  onClick,
  onPointerDown,
  icona,
  etichetta,
  titolo,
}: {
  attivo: boolean;
  onClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  icona: React.ReactNode;
  etichetta: string;
  titolo?: string;
}) {
  return (
    <Button
      size="sm"
      variant={attivo ? "default" : "outline"}
      onClick={onClick}
      onPointerDown={onPointerDown}
      aria-pressed={attivo}
      aria-label={etichetta}
      title={titolo}
      className={onPointerDown ? "touch-none" : undefined}
    >
      {icona}
      {etichetta}
    </Button>
  );
}

function CasellaMisura({ misura, onChiudi }: { misura: MisuraInModifica; onChiudi: () => void }) {
  const [testo, setTesto] = useState(misura.testo);
  const [errore, setErrore] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const fatto = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (misura.chiave === "parete-in-corso") el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
  }, [misura.chiave]);
  const conferma = () => {
    if (fatto.current) return;
    if (testo.trim() === misura.testo.trim()) {
      fatto.current = true;
      onChiudi();
      return;
    }
    const cm = leggiMisura(testo);
    if (!cm) {
      setErrore(true);
      return;
    }
    fatto.current = true;
    misura.applica(cm);
    onChiudi();
  };
  return (
    <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: misura.x, top: misura.y }}>
      <Input
        ref={ref}
        inputMode="decimal"
        value={testo}
        aria-label="Misura in metri"
        className={cn("h-9 w-24 text-center font-semibold tabular-nums shadow-lg", errore && "border-destructive")}
        onChange={(e) => {
          setTesto(e.target.value);
          setErrore(false);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") conferma();
          if (e.key === "Escape") {
            fatto.current = true;
            onChiudi();
          }
        }}
        onBlur={conferma}
      />
      <div className="mt-1 whitespace-nowrap rounded bg-background/95 px-1.5 text-center text-[11px] text-muted-foreground shadow-sm">
        {errore ? <span className="text-destructive">Es. 4,20 o 420 cm</span> : "metri · Invio per confermare"}
      </div>
    </div>
  );
}

function StanzaDaMisure({ onAggiungi }: { onAggiungi: (larghezza: number, lunghezza: number, nome: string | undefined, destinazione: Destinazione) => void }) {
  const [aperto, setAperto] = useState(false);
  const [nome, setNome] = useState("");
  const [destinazione, setDestinazione] = useState<Destinazione>("altro");
  const [larghezza, setLarghezza] = useState("");
  const [lunghezza, setLunghezza] = useState("");
  const [errore, setErrore] = useState(false);
  const aggiungi = () => {
    const w = leggiMisura(larghezza);
    const l = leggiMisura(lunghezza);
    if (!w || !l || w < 50 || l < 50) {
      setErrore(true);
      return;
    }
    const etichetta = DESTINAZIONI.find((d) => d.valore === destinazione)?.etichetta.split(" /")[0];
    onAggiungi(w, l, nome.trim() || (destinazione !== "altro" ? etichetta : undefined), destinazione);
    setAperto(false);
    setNome("");
    setLarghezza("");
    setLunghezza("");
    setDestinazione("altro");
    setErrore(false);
  };
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          Scrivi le misure
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start" aria-labelledby="pl-nuova-stanza-titolo" aria-describedby="pl-nuova-stanza-aiuto">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            aggiungi();
          }}
        >
          <p id="pl-nuova-stanza-titolo" className="text-sm font-semibold">Nuova stanza a misure</p>
          <div className="space-y-1">
            <Label htmlFor="pl-nuovo-tipo">Che stanza è</Label>
            <Select value={destinazione} onValueChange={(v) => setDestinazione(v as Destinazione)}>
              <SelectTrigger id="pl-nuovo-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DESTINAZIONI.map((d) => (
                  <SelectItem key={d.valore} value={d.valore}>
                    {d.etichetta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pl-nuovo-nome">Nome (facoltativo)</Label>
            <Input id="pl-nuovo-nome" value={nome} placeholder="es. Camera matrimoniale" onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="pl-larghezza">Larghezza (m)</Label>
              <Input id="pl-larghezza" aria-invalid={errore} aria-describedby={errore ? "pl-misure-errore" : undefined} inputMode="decimal" placeholder="3,50" value={larghezza} onChange={(e) => setLarghezza(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-lunghezza">Lunghezza (m)</Label>
              <Input id="pl-lunghezza" aria-invalid={errore} aria-describedby={errore ? "pl-misure-errore" : undefined} inputMode="decimal" placeholder="4,00" value={lunghezza} onChange={(e) => setLunghezza(e.target.value)} />
            </div>
          </div>
          <p id="pl-nuova-stanza-aiuto" className="text-xs text-muted-foreground">Misure interne, da muro a muro. La stanza si mette accanto alle altre.</p>
          {errore && <p id="pl-misure-errore" role="alert" className="text-xs text-destructive">Scrivi larghezza e lunghezza, almeno 0,50 m ciascuna.</p>}
          <Button type="submit" size="sm" className="w-full">
            Aggiungi la stanza
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

