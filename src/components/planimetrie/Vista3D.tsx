/**
 * Il 3D della pianta: dall'alto, girandoci intorno, o dentro una stanza ad altezza d'occhi.
 *
 * Importa three.js: non importarlo direttamente da pagine dell'app, usare
 * `Vista3DPigra` (lo carica solo quando serve, in un chunk a parte).
 */
import { forwardRef, lazy, Suspense, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Building, Cable, Download, Eye, Focus, Footprints, Layers, Map as MappaIcona, Maximize2, Minimize2, PaintRoller, Rotate3d, SlidersHorizontal, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CircuitiRadiantiElenco } from "./CircuitiRadiantiElenco";
import { COLORI_CIRCUITO } from "../../../shared/planimetrie/circuitiRadianti.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import {
  costruisciScena,
  scenaEdificio,
  esportaObj,
  vistaDallAlto,
  vistaInternaArredata,
  vistaGiroIntorno,
  localeAllaPosizione,
  passoLibero,
  type PiantaPer3D,
  type PianoPer3D,
  type Scena3D,
  type Telecamera3D,
  type V3,
  type Vista3D as VistaLavori,
} from "@/lib/planimetrie/tred";
import { catturaFotogramma, type Fotogramma } from "./tred/fotogramma";
import { esplodiInStrati, STRATI_ESPLOSO, stratoDi } from "@/lib/planimetrie/tred/esploso";
import { vistaEsplosa } from "@/lib/planimetrie/tred/telecamera";
import { vistaDettaglioInterno } from "@/lib/planimetrie/tred/inquadraturaArredi";
import type { StratoEsploso3D } from "@/lib/planimetrie/tred/tipi";
import { adattaAmbiente, aggiornaGruppo, applicaTelecamera, creaGruppo, liberaGruppo, preparaAmbiente } from "./tred/scenaThree";
import { creaAspetto, finestraPerLuce, FACCIATE, ID_FACCIATE, ID_INFISSI, INFISSI, type Aspetto, type OpzioniAspetto } from "./tred/aspetto";
import { leggiAspetto, salvaAspetto } from "@/lib/planimetrie/tred/aspettoOpzioni";
import { fotorealisticoDisponibile } from "@/lib/planimetrie/renderFotorealisticoLocale";
import { esportaGlbConFiniture } from "@/lib/planimetrie/esportaGlbConFiniture";
import { eCampo } from "@/lib/planimetrie/campiSport";
import type { InquadraturaSalvata, StanzaDaInquadrare, VersioneRenderVisita } from "@/lib/planimetrie/renderVisitaArchivio";
import { InquadratureStanza } from "./tred/InquadratureStanza";
import { interpolaPercorso, luogoVisita, mappaVisita, OCCHI_VISITA, percorsoSulPavimentoVisita, percorsoVisita, spostaVisita,
  type PassaggioVisita, type PosizioneVisita } from "@/lib/planimetrie/tred/visita";
import { IndicazioniVisita, MovimentoVisita, PartenzaVisita } from "./tred/ComandiVisita3D";
import { MinimappaVisita, type MinimappaVisitaHandle } from "./tred/MinimappaVisita";
import { TASTI_CAMMINATA, useCamminata3D } from "./tred/useCamminata3D";
import type { InquadraturaRender3D } from "./tred/RenderInquadratura3D";
import type { Punto } from "../../../shared/planimetrie/modello";
import { rettangoliIngombroArredo } from "../../../shared/planimetrie/modelliArredo";
import { LUCI_RENDER_LOCALE, NOMI_LUCE_RENDER_LOCALE, type LuceRenderLocale } from "../../../shared/planimetrie/renderLocale";

const RenderInquadratura3D = lazy(() => import("./tred/RenderInquadratura3D"));

export type ModoVista = "alto" | "giro" | "dentro" | "visita";

export interface SelezioneVista3D { riferimento: string; genere: string; punto: Punto; modo: ModoVista }
export interface PuntoVista3D { livelloId: string; localeId?: string }
export interface InquadraturaVista3D { localeId: string; telecamera: Telecamera3D; aspetto: OpzioniAspetto; proporzioni: number }
interface ComandiStudio3D {
  localeId: string;
  onLocale: (id: string) => void;
  onSelezione: (selezione: SelezioneVista3D) => void;
  vistaAmpia?: boolean;
  onVistaAmpia?: () => void;
  selezionato?: string;
  istruzione?: string;
  posa?: {
    tipo: string; larghezza: number; profondita: number; altezza: number; rotazione: number;
    verifica: (punto: Punto) => "fuori" | "vicino" | "libero";
  };
  onRender?: (inquadratura: InquadraturaVista3D) => void;
  renderLabel?: string;
  renderDisabilitato?: boolean;
  rapide?: { aperte: boolean; onCambia: (aperte: boolean) => void };
}

export interface Vista3DProps {
  /** Stato di fatto e progetto (con gli stati nuovo/da demolire). Senza proposte sono la stessa pianta. */
  piante: { fatto: PiantaPer3D; progetto: PiantaPer3D };
  /** Nome dei file scaricati, senza estensione. */
  nomeFile?: string;
  className?: string;
  /** Se c'è, dentro una stanza compare «Usa questa vista per il render». */
  onFotogramma?: (f: Fotogramma) => void;
  /** Come si apre (predefinito: «gira intorno»). Con «dentro» si entra subito in `localeIniziale`. */
  modoIniziale?: ModoVista;
  /** Stato di fatto o progetto all'apertura (predefinito: progetto). */
  vistaIniziale?: VistaLavori;
  vistaEdificioIniziale?: "fatto" | "progetto";
  /** La stanza scelta all'apertura (predefinito: la prima). */
  localeIniziale?: string;
  /** Tutti i piani (dal più basso): con due o più compare «Tutto l'edificio». */
  piani?: PianoPer3D[];
  livelloIniziale?: string;
  onVediInPianta?: (punto: PuntoVista3D) => void;
  onVisita?: (inVisita: boolean) => void;
  versione?: number;
  archivioRender?: VersioneRenderVisita;
  archivioInquadrature?: Omit<StanzaDaInquadrare, "localeId">;
  edificioIniziale?: boolean;
  esplosoIniziale?: boolean;
  /** Scelte di partenza dell'aspetto realistico (facciata, infissi, ora…). */
  aspettoIniziale?: Partial<OpzioniAspetto>;
  telecameraIniziale?: Telecamera3D;
  proporzioniIniziali?: number;
  studio?: ComandiStudio3D;
  /** Il pannello compatto segue il piano, la vista e la selezione dell'editor 2D. */
  anteprimaEditor?: {
    vista: VistaLavori;
    localeId?: string;
    selezionato?: string;
    onSelezione?: (riferimento: string) => void;
    confronto?: ReactNode;
  };
}

export interface Vista3DHandle {
  /** Telecamera di adesso. */
  telecamera(): Telecamera3D;
  /** Fotogramma della vista di adesso (serve un locale: quello scelto, o il primo). */
  fotogramma(misure?: { larghezza: number; altezza: number }): Promise<Fotogramma>;
  inquadraArredo(id: string): void;
  preparaPosa(): void;
}

interface Motore {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controlli: OrbitControls | null;
  gruppo: THREE.Group | null;
  ambiente: ReturnType<typeof preparaAmbiente>;
  aspetto: Aspetto;
  disegna: () => void;
}

const PASSO_BREVE = .16;
const fovPerProporzioni = (fov: number, da: number, a: number) =>
  Math.min(105, 2 * Math.atan(Math.tan(fov * Math.PI / 360) * Math.max(1, da / a)) * 180 / Math.PI);

function scarica(dati: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([dati], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const Vista3D = forwardRef<Vista3DHandle, Vista3DProps>(function Vista3D({ piante, nomeFile = "planimetria", className, onFotogramma, modoIniziale = "giro", vistaIniziale = "progetto", vistaEdificioIniziale, localeIniziale, piani, livelloIniziale, onVediInPianta, onVisita, versione, archivioRender, archivioInquadrature, edificioIniziale = false, esplosoIniziale = false, aspettoIniziale, telecameraIniziale, proporzioniIniziali, studio, anteprimaEditor }, ref) {
  const schemaCanali = !!piante.progetto.canaliAria;
  const compatta = !!anteprimaEditor;
  const contenitore = useRef<HTMLDivElement>(null);
  const barraVisita = useRef<HTMLDivElement>(null);
  const motore = useRef<Motore | null>(null);
  const [vistaInterna, setVista] = useState<VistaLavori>(vistaIniziale);
  const vista = anteprimaEditor?.vista ?? (studio ? vistaIniziale : vistaInterna);
  const pianta = vista === "fatto" ? piante.fatto : piante.progetto;
  const locali = pianta.locali;
  const [modoInterno, setModo] = useState<ModoVista>(esplosoIniziale ? "giro" : modoIniziale);
  const modo = compatta && modoInterno === "dentro" && !locali.length ? "giro" : modoInterno;
  const [localeInterno, setLocaleInterno] = useState<string>(
    localeIniziale && (vistaIniziale === "fatto" ? piante.fatto : piante.progetto).locali.some((l) => l.id === localeIniziale)
      ? localeIniziale
      : ((vistaIniziale === "fatto" ? piante.fatto : piante.progetto).locali[0]?.id ?? ""),
  );
  const localeId = studio?.localeId ?? anteprimaEditor?.localeId ?? localeInterno;
  const setLocaleId = studio?.onLocale ?? setLocaleInterno;
  const [opzioniVisibili, mostraOpzioni] = useState(false);
  const [ripristini, risistemaInquadratura] = useState(0);
  const [inquadraturaLocale, setInquadraturaLocale] = useState(false);
  const primaCamera = useRef<{ telecamera: Telecamera3D; proporzioni?: number } | undefined>(
    telecameraIniziale ? { telecamera: telecameraIniziale, proporzioni: proporzioniIniziali } : undefined,
  );
  const arredoDaInquadrare = useRef<string | undefined>(undefined);
  const puntatore = useRef<{ x: number; y: number; id: number } | null>(null);
  const raggio = useRef(new THREE.Raycaster());
  const ingombroArredo = useRef<{ gruppo: THREE.Group; parti: THREE.Mesh[]; materiale: THREE.MeshBasicMaterial } | null>(null);
  const minimappa = useRef<MinimappaVisitaHandle>(null);
  const direzioneMappa = useRef(new THREE.Vector3());
  const leggiPosizioneMappa = useCallback(() => {
    const camera = motore.current?.camera;
    if (!camera) return null;
    const d = camera.getWorldDirection(direzioneMappa.current);
    return { x: camera.position.x, z: camera.position.z, dx: d.x, dz: d.z };
  }, []);
  const [soffitto, setSoffitto] = useState(modoIniziale === "dentro");
  const [arredi, setArredi] = useState(true);
  const [impianti, setImpianti] = useState(false);
  const [fondazioni, setFondazioni] = useState(false);
  // Aspetto realistico: tessiture, cielo, ora del giorno, alberi, ombre negli angoli. Sul telefono gli effetti pesanti partono spenti.
  // Le scelte si ricordano nel browser: valgono anche per i render esterni con l'AI.
  const [asp, setAsp] = useState<OpzioniAspetto>(() => ({ ...leggiAspetto(), ...aspettoIniziale,
    ...(compatta ? { realistico: true, alberi: false, effetti: false } : {}),
    ...(schemaCanali ? { realistico: false, alberi: false, effetti: false } : {}) }));
  const cambiaAsp = (campi: Partial<OpzioniAspetto>) => setAsp((a) => { const n = { ...a, ...campi }; salvaAspetto(n); return n; });
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [render, setRender] = useState<InquadraturaRender3D | null>(null);
  const [partenzaVisita, setPartenzaVisita] = useState("");
  const [mostraMappa, setMostraMappa] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const posizione = useRef<PosizioneVisita | null>(null);
  const [luogo, setLuogo] = useState<ReturnType<typeof luogoVisita>>(null);
  const [passaggioVicino, setPassaggioVicino] = useState<PassaggioVisita>();
  const [attraversamento, setAttraversamento] = useState("");
  const [avvisoVisita, setAvvisoVisita] = useState("");
  const framePassaggio = useRef<number | undefined>(undefined);
  const completaPassaggio = useRef<(() => void) | null>(null);
  const ridotto = usePreferisceMenoMovimento();
  const [animaPassaggi, setAnimaPassaggi] = useState(true);
  const movimentoRidotto = ridotto || !animaPassaggi;

  const conStati = useMemo(
    () => piante.progetto.muri.some((m) => m.stato !== "esistente") || piante.progetto.aperture.some((a) => a.stato !== "esistente") || piante.fatto !== piante.progetto,
    [piante],
  );
  // Tutto l'edificio: i piani uno sopra l'altro; staccati («esploso») e tagliati sopra un piano.
  const conPiani = (piani?.length ?? 0) > 1;
  const [edificio, setEdificio] = useState(conPiani && edificioIniziale);
  const [esploso, setEsploso] = useState(false);
  const [strati, setStrati] = useState(esplosoIniziale);
  const [distanzaStrati, setDistanzaStrati] = useState(1.2);
  const distanzaVisuale = useDeferredValue(distanzaStrati);
  const [stratiNascosti, setStratiNascosti] = useState<Set<StratoEsploso3D>>(() => new Set());
  const [finoA, setFinoA] = useState<string>("");
  const tuttiIPiani = conPiani && edificio;
  const inVisita = modo === "visita";
  const vistaVisita = vista === vistaIniziale ? vistaEdificioIniziale ?? vista : vista;
  const strutturaStrati = strati && modo !== "dentro" && !inVisita;
  const mostraSoffitti = soffitto || strutturaStrati;
  const pianiVisita = useMemo(() => piani?.length ? piani : [{ id: "piano", nome: "Piano terra", quota: 0, piante }], [piani, piante]);
  const scenaBase: Scena3D = useMemo(
    () =>
      inVisita ? scenaEdificio(pianiVisita, { vista: vistaVisita, soffitto: true, impianti, passaggiAperti: true, terreno: 4 })
        : tuttiIPiani
        ? scenaEdificio(piani!, { vista, soffitto: mostraSoffitti, elementi: arredi, impianti, fondazioni, esploso: esploso ? 3 : 0, finoA: finoA || undefined })
        : costruisciScena(pianta, { vista, soffitto: mostraSoffitti, elementi: arredi, impianti, fondazioni }),
    [inVisita, tuttiIPiani, piani, pianiVisita, pianta, vista, vistaVisita, mostraSoffitti, arredi, impianti, fondazioni, esploso, finoA],
  );
  const stratiPresenti = useMemo(() => new Set<StratoEsploso3D | null>(strutturaStrati ? scenaBase.mesh.map(stratoDi) : []), [scenaBase, strutturaStrati]);
  const controlliStrati = STRATI_ESPLOSO.filter(s => stratiPresenti.has(s.id));
  const stratiVisibili = controlliStrati.filter(s => !stratiNascosti.has(s.id)).length;
  const scenaCompleta = useMemo(() => strutturaStrati ? esplodiInStrati(scenaBase, distanzaVisuale) : scenaBase, [scenaBase, strutturaStrati, distanzaVisuale]);
  const scenaVisibile = useMemo<Scena3D>(() => !strutturaStrati || !stratiNascosti.size ? scenaCompleta : {
    ...scenaCompleta, mesh: scenaCompleta.mesh.filter(m => {
      const strato = stratoDi(m);
      return !strato || !stratiNascosti.has(strato);
    }),
  }, [scenaCompleta, strutturaStrati, stratiNascosti]);
  const [scenaDettagliata, setScenaDettagliata] = useState<{ base: Scena3D; risultato: Scena3D }>();
  useEffect(() => {
    if (!scenaVisibile.mesh.some(m => m.auto || m.arredoCatalogo)) return;
    let chiuso = false;
    void import("@/lib/planimetrie/tred/modelliDettagliati").then(({ scenaConModelliDettagliati }) => scenaConModelliDettagliati(scenaVisibile))
      .then(risultato => { if (!chiuso) setScenaDettagliata({ base: scenaVisibile, risultato }); })
      .catch(() => {
        if (!chiuso) setScenaDettagliata({ base: scenaVisibile, risultato: { ...scenaVisibile,
          avvisi: [...scenaVisibile.avvisi, "Modelli di dettaglio non disponibili."] } });
      });
    return () => { chiuso = true; };
  }, [scenaVisibile]);
  const scena = scenaDettagliata?.base === scenaVisibile ? scenaDettagliata.risultato : scenaVisibile;
  const mappa = useMemo(() => inVisita ? mappaVisita(pianiVisita, vistaVisita, scena) : null, [inVisita, pianiVisita, vistaVisita, scena]);
  const pianoPartenza = livelloIniziale ?? piani?.find(p => p.piante === piante)?.id;
  const tappaVisita = mappa?.partenza.find(t => t.id === partenzaVisita) ??
    mappa?.partenza.find(t => t.posizione.pianoId === pianoPartenza && t.localeId === (studio ? studio.localeId : localeIniziale) && !!t.localeId) ??
    mappa?.partenza.find(t => t.posizione.pianoId === pianoPartenza) ?? mappa?.partenza[0];
  const pianoInVisita = mappa?.piani.find(p => p.id === posizione.current?.pianoId);
  const aggiornaVisita = useCallback((p: PosizioneVisita) => {
    if (!mappa) return;
    posizione.current = p;
    const nuova = luogoVisita(mappa, p);
    setLuogo(prima => prima?.pianoId === nuova?.pianoId && prima?.nome === nuova?.nome && prima?.localeId === nuova?.localeId && prima?.esterno === nuova?.esterno ? prima : nuova);
    const candidati = mappa.passaggi.filter(a => a.da.pianoId === p.pianoId)
      .map(a => ({ a, metri: Math.hypot(a.da.piedi[0] - p.piedi[0], a.da.piedi[2] - p.piedi[2]) }))
      .filter(a => a.metri <= 1.5).sort((a, b) => a.metri - b.metri);
    setPassaggioVicino(candidati.find(({ a }) => percorsoVisita(mappa, p, a))?.a);
  }, [mappa]);

  useEffect(() => () => {
    if (framePassaggio.current !== undefined) cancelAnimationFrame(framePassaggio.current);
    framePassaggio.current = undefined;
    completaPassaggio.current = null;
  }, [modo]);
  useEffect(() => { if (movimentoRidotto) completaPassaggio.current?.(); }, [movimentoRidotto]);
  useEffect(() => { onVisita?.(inVisita); }, [inVisita, onVisita]);
  useEffect(() => {
    if (!avvisoVisita) return;
    const timeout = window.setTimeout(() => setAvvisoVisita(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [avvisoVisita]);

  // Avvio di three.js, una volta.
  useEffect(() => {
    const div = contenitore.current;
    if (!div) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !compatta });
    } catch {
      setErrore("Questo browser non riesce a mostrare il 3D (WebGL non disponibile).");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compatta ? 1.5 : 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    div.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const ambiente = preparaAmbiente(renderer, scene);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    const aspetto = creaAspetto({ renderer, scene, camera });
    const m: Motore = { renderer, scene, camera, controlli: null, gruppo: null, ambiente, aspetto, disegna: () => {
      aspetto.disegna();
      if (!minimappa.current) return;
      const posa = leggiPosizioneMappa();
      if (posa) minimappa.current.aggiorna(posa);
    } };
    motore.current = m;
    let larghezza = 0, altezza = 0;
    const ridimensiona = () => {
      const w = div.clientWidth, h = div.clientHeight;
      if (!w || !h || (w === larghezza && h === altezza)) return;
      larghezza = w;
      altezza = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      aspetto.dimensiona(w, h);
      m.disegna();
    };
    const ro = new ResizeObserver(ridimensiona);
    ro.observe(div);
    ridimensiona();
    return () => {
      ro.disconnect();
      m.controlli?.dispose();
      if (m.gruppo) liberaGruppo(m.gruppo);
      aspetto.libera();
      ambiente.libera();
      renderer.dispose();
      renderer.domElement.remove();
      motore.current = null;
    };
  }, [leggiPosizioneMappa, compatta]);

  // Sincronizza la scena mantenendo mesh, buffer e materiali ancora validi.
  useEffect(() => {
    const m = motore.current;
    if (!m) return;
    if (m.gruppo) {
      aggiornaGruppo(m.gruppo, scena);
    } else {
      m.gruppo = creaGruppo(scena, { onTextureReady: () => m.disegna() });
      m.scene.add(m.gruppo);
    }
  }, [scena, compatta]);

  // L'aspetto (materiali, cielo, sole, alberi) si rifà quando cambia la scena, il modo o le sue scelte.
  useEffect(() => {
    const m = motore.current;
    if (!m || !m.gruppo) return;
    adattaAmbiente(m.ambiente, scena);
    const dentro = modo === "dentro" || (inVisita && !!luogo && !luogo.esterno);
    const finestra = modo === "dentro" ? finestraPerLuce(pianta, localeId, vista)
      : dentro && luogo?.localeId && pianoInVisita ? finestraPerLuce(pianoInVisita.pianta, luogo.localeId, vistaVisita, pianoInVisita.quota) : undefined;
    m.aspetto.applica(m.gruppo, scena, { ...asp, dentro, sfondoNeutro: (compatta || !!studio) && !inVisita,
      ...(strutturaStrati ? { realistico: false, effetti: false } : {}) }, m.ambiente, finestra);
    if (strutturaStrati) m.ambiente.terreno.visible = false;
    m.disegna();
  }, [scena, asp, modo, inVisita, strutturaStrati, luogo?.esterno, luogo?.localeId, !!luogo, pianoInVisita, pianta, localeId, vista, vistaVisita, !!studio, compatta]);

  // Con tutto l'edificio non si entra nelle stanze (sono del piano scelto): si gira intorno.
  useEffect(() => {
    if (tuttiIPiani && modo === "dentro") setModo("giro");
  }, [tuttiIPiani, modo]);

  // Telecamera e comandi: si rifanno quando cambia il modo o la stanza.
  const limiti = scena.limiti;
  // Nell'editor si confrontano le geometrie dalla stessa inquadratura.
  const chiaveLimiti = compatta || inVisita || (studio && modo === "dentro") ? "" : limiti.min.concat(limiti.max).map((x) => x.toFixed(2)).join(",");
  const vistaCamera = compatta || inVisita || studio ? undefined : vista;
  const localeCamera = inVisita || (compatta && modo !== "dentro") ? undefined : localeId;
  useEffect(() => {
    const m = motore.current;
    if (!m) return;
    const aspetto = m.camera.aspect || 1;
    const locale = locali.find((l) => l.id === localeId) ?? locali[0];
    const fov = studio || compatta ? THREE.MathUtils.clamp(2 * Math.atan(Math.tan((locale?.destinazione === "bagno" ? 52 : 46) * Math.PI / 180) / Math.max(aspetto, 1)) * 180 / Math.PI, 40, 76) : undefined;
    const iniziale = inVisita ? tappaVisita?.vista : primaCamera.current?.telecamera;
    const arredo = arredoDaInquadrare.current;
    const dettaglio = compatta && modo === "dentro" && locale && arredo
      ? vistaDettaglioInterno(pianta, locale.id, { tipo: "arredo", id: arredo }, vista, aspetto) : null;
    let ingombro = limiti;
    if (modo === "alto" && inquadraturaLocale && locale?.contorno.length) {
      const x = locale.contorno.map(p => p.x / 100), z = locale.contorno.map(p => p.y / 100);
      ingombro = { min: [Math.min(...x) - .42, 0, Math.min(...z) - .42],
        max: [Math.max(...x) + .42, locale.altezza / 100, Math.max(...z) + .42] };
    }
    const t = iniziale ? { ...iniziale, fov: fovPerProporzioni(iniziale.fov, primaCamera.current?.proporzioni || aspetto, aspetto) }
      : modo === "alto" ? vistaDallAlto(ingombro, aspetto)
      : modo === "dentro" && locale ? dettaglio ?? vistaInternaArredata(pianta, locale.id, { vista, aspetto, fov, verticale: compatta || !!studio, arredoId: arredo })
      : strutturaStrati ? vistaEsplosa(limiti, aspetto) : vistaGiroIntorno(limiti, aspetto);
    primaCamera.current = undefined;
    arredoDaInquadrare.current = undefined;
    applicaTelecamera(m.camera, t);
    m.controlli?.dispose();
    const c = new OrbitControls(m.camera, m.renderer.domElement);
    c.target.set(...t.guarda);
    if (modo === "alto") {
      c.enableRotate = false;
      c.screenSpacePanning = true;
      c.minDistance = 2;
      c.maxDistance = 200;
    } else if (modo === "giro" || (inVisita && !tappaVisita)) {
      c.maxPolarAngle = Math.PI * 0.49;
      c.minDistance = 1;
      c.maxDistance = 200;
    } else {
      // Dentro la stanza: si gira la testa attorno a un punto appena davanti agli occhi.
      const avanti = new THREE.Vector3(...t.guarda).sub(new THREE.Vector3(...t.posizione)).normalize().multiplyScalar(0.05);
      c.target.copy(m.camera.position).add(avanti);
      c.enableZoom = false;
      c.enablePan = false;
      c.rotateSpeed = -0.35;
      c.minPolarAngle = Math.PI * 0.2;
      c.maxPolarAngle = Math.PI * 0.8;
    }
    c.update();
    c.saveState();
    c.addEventListener("change", m.disegna);
    m.controlli = c;
    m.disegna();
    if (inVisita && tappaVisita) aggiornaVisita(tappaVisita.posizione);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, localeCamera, chiaveLimiti, ripristini, tappaVisita?.id, vistaCamera, inquadraturaLocale, strutturaStrati]);

  const evidenza = anteprimaEditor?.selezionato ?? studio?.selezionato;
  const mostraBordoSelezione = !tuttiIPiani && !inVisita && (!compatta || modo !== "dentro");
  useEffect(() => {
    const m = motore.current;
    if (!m?.gruppo || !evidenza || !mostraBordoSelezione) return;
    const box = new THREE.Box3();
    m.gruppo.children.filter(o => o.userData.riferimento === evidenza).forEach(o => box.expandByObject(o));
    if (box.isEmpty()) return;
    const bordo = new THREE.Box3Helper(compatta ? box.expandByScalar(.035) : box, compatta ? 0x158379 : 0x55b7b0);
    m.scene.add(bordo);
    m.disegna();
    return () => { m.scene.remove(bordo); bordo.dispose(); if (motore.current === m) m.disegna(); };
  }, [scena, evidenza, mostraBordoSelezione, compatta]);

  const mostraIngombro = !!studio?.posa && !inVisita && !tuttiIPiani;
  useEffect(() => {
    const m = motore.current;
    if (!m || !mostraIngombro) return;
    const gruppo = new THREE.Group();
    const geometria = new THREE.BoxGeometry(1, 1, 1);
    const materiale = new THREE.MeshBasicMaterial({
      color: "#24906b", transparent: true, opacity: .36, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const parti = [new THREE.Mesh(geometria, materiale), new THREE.Mesh(geometria, materiale)];
    gruppo.add(...parti);
    gruppo.visible = false;
    m.scene.add(gruppo);
    ingombroArredo.current = { gruppo, parti, materiale };
    return () => {
      ingombroArredo.current = null;
      m.scene.remove(gruppo);
      geometria.dispose();
      materiale.dispose();
      if (motore.current === m) m.disegna();
    };
  }, [mostraIngombro]);

  const intersezioniInScena = (x: number, y: number, m: Motore) => {
    if (!m.gruppo) return [];
    const r = m.renderer.domElement.getBoundingClientRect();
    raggio.current.setFromCamera(new THREE.Vector2(2 * (x - r.left) / r.width - 1, 1 - 2 * (y - r.top) / r.height), m.camera);
    return raggio.current.intersectObjects(m.gruppo.children, false);
  };
  const puntoNellaScena = (x: number, y: number, m: Motore) =>
    intersezioniInScena(x, y, m)
      .find(({ object }) => object.userData.riferimento && object.visible && (!studio?.posa || object.userData.genere === "pavimento"));
  const puntoSullaPianta = (p: THREE.Vector3): Punto => ({ x: Math.round(p.x * 100), y: Math.round(-p.z * 100) });

  const anteprimaIngombro = (e?: React.PointerEvent) => {
    const m = motore.current, guida = ingombroArredo.current, posa = studio?.posa;
    if (!m || !guida || !posa) return;
    const { gruppo, materiale, parti } = guida;
    const eraVisibile = gruppo.visible;
    const r = e?.target === m.renderer.domElement && !puntatore.current && e?.pointerType !== "touch" ? puntoNellaScena(e.clientX, e.clientY, m) : undefined;
    gruppo.visible = !!r && r.object.userData.riferimento === studio.localeId;
    if (r && gruppo.visible) {
      const punto = puntoSullaPianta(r.point), profilo = posa.verifica(punto);
      materiale.color.set(profilo === "fuori" ? "#e14545" : profilo === "vicino" ? "#d68a1a" : "#24906b");
      const h = Math.max(.022, posa.altezza / 100);
      const ingombri = rettangoliIngombroArredo(posa.tipo, posa.larghezza, posa.profondita);
      parti.forEach((parte, i) => {
        const q = ingombri[i];
        parte.visible = !!q;
        if (!q) return;
        parte.scale.set(q.larghezza / 100, h, q.profondita / 100);
        parte.position.set(q.x / 100, h / 2, q.y / 100);
      });
      gruppo.rotation.y = posa.rotazione * Math.PI / 180;
      gruppo.position.set(punto.x / 100, r.point.y + .004, -punto.y / 100);
    }
    if (eraVisibile || gruppo.visible) m.disegna();
  };

  const memorizzaPuntatore = (e: React.PointerEvent<HTMLDivElement>) => {
    puntatore.current = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  };
  const selezionaConPuntatore = (e: React.PointerEvent<HTMLDivElement>) => {
    const inizio = puntatore.current;
    puntatore.current = null;
    const m = motore.current;
    if ((!studio && !anteprimaEditor?.onSelezione) || inVisita || tuttiIPiani || !m?.gruppo || !inizio || e.pointerId !== inizio.id ||
      Math.hypot(e.clientX - inizio.x, e.clientY - inizio.y) > 6 || e.target !== m.renderer.domElement) return;
    const trovato = puntoNellaScena(e.clientX, e.clientY, m);
    if (!trovato) return;
    const { riferimento, genere } = trovato.object.userData as { riferimento: string; genere: string };
    if (studio) studio.onSelezione({ riferimento, genere, modo, punto: puntoSullaPianta(trovato.point) });
    else anteprimaEditor?.onSelezione?.(riferimento);
  };

  // Gli spostamenti sono in metri, relativi alla direzione in cui si guarda.
  const cammina = useCallback((avanti: number, lato: number) => {
    const m = motore.current;
    if (!m?.controlli || completaPassaggio.current) return;
    const dir = new THREE.Vector3();
    m.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const destra = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    let passo = dir.multiplyScalar(avanti).add(destra.multiplyScalar(lato));
    if (mappa && posizione.current) {
      const nuova = spostaVisita(mappa, posizione.current, passo.x, passo.z);
      if (!nuova) return;
      const [x, y, z] = nuova.piedi;
      passo = new THREE.Vector3(x, y + OCCHI_VISITA, z).sub(m.camera.position);
      m.camera.position.add(passo);
      m.controlli.target.add(passo);
      if (!m.controlli.update()) m.disegna();
      aggiornaVisita(nuova);
      return;
    }
    if (mappa) return;
    // Vista della singola stanza per la composizione del render.
    const da = m.camera.position;
    const verso = (v: THREE.Vector3) => passoLibero(pianta, vista, [da.x, da.y, da.z], [da.x + v.x, da.y, da.z + v.z]);
    if (!verso(passo)) {
      const soloX = new THREE.Vector3(passo.x, 0, 0);
      const soloZ = new THREE.Vector3(0, 0, passo.z);
      if (verso(soloX)) passo = soloX;
      else if (verso(soloZ)) passo = soloZ;
      else return;
    }
    m.camera.position.add(passo);
    m.controlli.target.add(passo);
    m.controlli.update();
    m.disegna();
  }, [pianta, vista, mappa, aggiornaVisita]);
  const camminata = useCamminata3D((modo === "dentro" || (inVisita && !!tappaVisita)) && !attraversamento, cammina);

  const giraVisita = (lato: number) => {
    const m = motore.current;
    if (!m?.controlli || completaPassaggio.current) return;
    const davanti = m.camera.getWorldDirection(new THREE.Vector3()).applyAxisAngle(new THREE.Vector3(0, 1, 0), -lato * Math.PI / 10);
    m.controlli.target.copy(m.camera.position).addScaledVector(davanti, .05);
    if (!m.controlli.update()) m.disegna();
  };

  const guardaEdificio = () => {
    const m = motore.current;
    if (!m?.controlli || completaPassaggio.current) return;
    const versoIngresso = passaggioVicino?.tipo === "entra" ? passaggioVicino.a.piedi : undefined;
    const centro = new THREE.Vector3(versoIngresso?.[0] ?? (limiti.min[0] + limiti.max[0]) / 2, m.camera.position.y,
      versoIngresso?.[2] ?? (limiti.min[2] + limiti.max[2]) / 2);
    centro.sub(m.camera.position);
    if (centro.lengthSq() < .001) return;
    m.controlli.target.copy(m.camera.position).addScaledVector(centro.normalize(), .05);
    if (!m.controlli.update()) m.disegna();
    contenitore.current?.focus({ preventScroll: true });
  };

  const animaPercorso = (punti: V3[], arrivo: PosizioneVisita, messaggio: string) => {
    const m = motore.current, c = m?.controlli;
    if (!m || !c || completaPassaggio.current) return;
    camminata.ferma();
    setAvvisoVisita("");
    contenitore.current?.focus({ preventScroll: true });
    const sentiero = interpolaPercorso(punti);
    const verso = m.camera.getWorldDirection(new THREE.Vector3());
    verso.y = 0;
    verso.normalize();
    const mostra = (punto: V3, successivo: V3, peso: number) => {
      const direzione = new THREE.Vector3(successivo[0] - punto[0], 0, successivo[2] - punto[2]);
      if (direzione.lengthSq() > .0001) verso.lerp(direzione.normalize(), peso).normalize();
      m.camera.position.set(punto[0], punto[1] + OCCHI_VISITA, punto[2]);
      c.target.copy(m.camera.position).addScaledVector(verso, .05);
      if (!c.update()) m.disegna();
    };
    const termina = () => {
      if (framePassaggio.current !== undefined) cancelAnimationFrame(framePassaggio.current);
      framePassaggio.current = undefined;
      completaPassaggio.current = null;
      const precedente = sentiero.punto(Math.max(0, sentiero.metri - .22));
      mostra(precedente, arrivo.piedi, 1);
      mostra(arrivo.piedi, arrivo.piedi, 1);
      c.enabled = true;
      setAttraversamento("");
      aggiornaVisita(arrivo);
    };
    if (movimentoRidotto) { termina(); return; }
    completaPassaggio.current = termina;
    c.enabled = false;
    setAttraversamento(messaggio);
    const tempo = Math.max(600, Math.min(4900, sentiero.metri * 700));
    const inizio = performance.now();
    let precedente = inizio;
    const muovi = (ora: number) => {
      const d = Math.min(1, (ora - inizio) / tempo);
      if (d === 1 || motore.current !== m) { if (motore.current === m) termina(); return; }
      const metri = sentiero.metri * (d * d * (3 - 2 * d));
      mostra(sentiero.punto(metri), sentiero.punto(metri + .38), 1 - Math.exp(-.018 * (ora - precedente)));
      precedente = ora;
      framePassaggio.current = requestAnimationFrame(muovi);
    };
    framePassaggio.current = requestAnimationFrame(muovi);
  };

  const percorri = (passaggio: PassaggioVisita) => {
    if (!mappa || !posizione.current) return;
    const punti = percorsoVisita(mappa, posizione.current, passaggio);
    if (!punti) return;
    animaPercorso(punti, passaggio.a, passaggio.tipo === "sali" ? "Salita in corso" : passaggio.tipo === "scendi" ? "Discesa in corso" : "Attraverso la soglia");
  };

  const raggiungiPavimento = (e: React.PointerEvent<HTMLDivElement>) => {
    const inizio = puntatore.current, m = motore.current, p = posizione.current;
    puntatore.current = null;
    if (!m || !mappa || !p || !inizio || completaPassaggio.current || e.pointerId !== inizio.id ||
      e.target !== m.renderer.domElement || Math.hypot(e.clientX - inizio.x, e.clientY - inizio.y) > 6) return;
    const tappeti = new Set(pianoInVisita?.pianta.elementi.filter(a => a.tipo === "tappeto").map(a => a.id));
    const hit = intersezioniInScena(e.clientX, e.clientY, m).find(({ object }) =>
      object.visible && !tappeti.has(object.userData.riferimento));
    if (!hit || hit.object.userData.genere !== "pavimento") return;
    const id = hit.object.userData.id as string;
    if (id !== "terreno" && !id.startsWith(p.pianoId + "/")) return;
    const { x, y, z } = hit.point;
    if (Math.hypot(x - p.piedi[0], z - p.piedi[2]) < .18) return;
    const punti = percorsoSulPavimentoVisita(mappa, p, [x, y, z]);
    const piedi = punti?.at(-1);
    if (!punti || !piedi) {
      setAvvisoVisita("Punto non raggiungibile in linea diretta.");
      return;
    }
    animaPercorso(punti, { pianoId: p.pianoId, piedi }, "Spostamento in corso");
  };

  useEffect(() => {
    const m = motore.current;
    if (!m || (modo !== "dentro" && !inVisita)) return;
    const tela = m.renderer.domElement;
    const rotella = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      if (delta) cammina(THREE.MathUtils.clamp(-delta * .003, -.24, .24), 0);
    };
    tela.addEventListener("wheel", rotella, { passive: false });
    return () => tela.removeEventListener("wheel", rotella);
  }, [modo, inVisita, cammina]);

  const tasto = (e: React.KeyboardEvent) => {
    if ((modo !== "dentro" && !inVisita) || e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "e" && inVisita && passaggioVicino && !e.repeat) { e.preventDefault(); percorri(passaggioVicino); return; }
    const direzione = TASTI_CAMMINATA[k];
    if (direzione) {
      e.preventDefault();
      if (!e.repeat) {
        if (avvisoVisita) setAvvisoVisita("");
        camminata.premi(k, direzione);
      }
    }
  };

  const telecameraAdesso = useCallback((): Telecamera3D => {
    const m = motore.current;
    if (!m) throw new Error("3D non pronto.");
    const dir = new THREE.Vector3();
    m.camera.getWorldDirection(dir);
    const p = m.camera.position;
    return {
      posizione: [p.x, p.y, p.z],
      guarda: [p.x + dir.x, p.y + dir.y, p.z + dir.z],
      alto: [m.camera.up.x, m.camera.up.y, m.camera.up.z],
      fov: m.camera.fov,
    };
  }, []);

  const fotogramma = useCallback(
    async (misure?: { larghezza: number; altezza: number }) => {
      const telecamera = telecameraAdesso();
      // Dentro la casa il render è della stanza dove si trova la telecamera, non di quella scelta nell'elenco:
      // si cammina da una stanza all'altra e si fa il render da dove si è.
      const doveSono = modo === "dentro" ? localeAllaPosizione(pianta, telecamera.posizione) : null;
      const id = doveSono ?? (locali.some((l) => l.id === localeId) ? localeId : locali[0]?.id);
      if (!id) throw new Error("La pianta non ha locali.");
      if (modo === "dentro" && motore.current) {
        telecamera.fov = fovPerProporzioni(telecamera.fov, motore.current.camera.aspect, (misure?.larghezza ?? 1024) / (misure?.altezza ?? 768));
      }
      return catturaFotogramma({ pianta, localeId: id, telecamera, vista, elementi: arredi, aspetto: { ...asp, dentro: modo === "dentro", effetti: false }, ...misure });
    },
    [pianta, locali, localeId, vista, arredi, asp, telecameraAdesso, modo],
  );

  useImperativeHandle(ref, () => ({
    telecamera: telecameraAdesso, fotogramma,
    inquadraArredo(id) {
      arredoDaInquadrare.current = id;
      setArredi(true);
      setSoffitto(true);
      setModo("dentro");
      risistemaInquadratura(n => n + 1);
    },
    preparaPosa() {
      setEdificio(false);
      setStrati(false);
      setSoffitto(false);
      setInquadraturaLocale(true);
      setModo("alto");
      risistemaInquadratura(n => n + 1);
    },
  }), [telecameraAdesso, fotogramma]);

  const cambiaModo = (v: string) => {
    if (!v || attraversamento) return;
    setInquadraturaLocale(false);
    setModo(v as ModoVista);
    setSoffitto(v === "dentro");
    setAvvisoVisita("");
    if (v === "visita") {
      mostraOpzioni(false);
      contenitore.current?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        const tela = contenitore.current;
        if (tela && tela.getBoundingClientRect().bottom > window.innerHeight) barraVisita.current?.scrollIntoView({ block: "start" });
      });
    }
  };

  const cambiaVistaEsplosa = () => {
    if (strutturaStrati) {
      setStrati(false);
      return;
    }
    setStratiNascosti(new Set());
    setStrati(true);
    cambiaModo("giro");
  };

  const preparaRenderDaQui = (salvata?: InquadraturaSalvata) => {
    const m = motore.current;
    if (!m || attraversamento) return;
    const archivio = archivioRender && vista === vistaIniziale ? archivioRender : undefined;
    const telecamera = salvata?.telecamera ?? telecameraAdesso();
    const proporzioni = salvata?.proporzioni ?? m.camera.aspect;
    const piano = pianiVisita.find(p => p.id === pianoPartenza) ?? pianiVisita[0];
    if (modo === "dentro" && !tuttiIPiani) {
      const ambiente = pianta.locali.find(l => l.id === (localeAllaPosizione(pianta, telecamera.posizione) ?? localeId));
      if (!ambiente) return;
      setRender({ scena, pianta, vista, telecamera, proporzioni,
        aspetto: { ...asp, dentro: true, effetti: false }, localeId: ambiente.id,
        nome: ambiente.nome, piano: piano.nome, ambiente: "interni", esterno: false, versione, archivio, pianoId: piano.id });
      return;
    }
    if (!inVisita) {
      const tecnico = modo === "alto" || strutturaStrati;
      const ambiente = tecnico ? "tecnico" : pianta.elementi.some(e => eCampo(e.tipo)) && !pianta.muri.length ? "sport" : "facciata";
      setRender({ scena, pianta, vista, telecamera, proporzioni: m.camera.aspect,
        aspetto: { ...asp, dentro: false, effetti: false }, nome: strutturaStrati ? "Vista esplosa" : tecnico ? "Vista dall’alto" : "Vista esterna",
        piano: tuttiIPiani ? "Tutti i piani" : piano.nome, pianoId: piano.id, ambiente, esterno: !tecnico, versione, archivio });
      return;
    }
    if (!luogo || !pianoInVisita) return;
    setRender({ scena, pianta: pianoInVisita.pianta, vista: vistaVisita, telecamera, proporzioni: m.camera.aspect,
      aspetto: { ...asp, dentro: !luogo.esterno, effetti: false }, localeId: luogo.localeId,
      nome: luogo.nome, piano: luogo.piano, ambiente: luogo.esterno ? "facciata" : "interni",
      esterno: luogo.esterno, versione, archivio, pianoId: pianoInVisita.id, quotaPiano: pianoInVisita.quota });
  };
  const puoRenderDaQui = inVisita && !!luogo && !attraversamento && !errore && fotorealisticoDisponibile();
  const stanzaInquadrature = modo === "dentro" && !errore && !compatta && locali.find(l => l.id === localeId);
  const archivioStanza = archivioInquadrature ?? (archivioRender && livelloIniziale
    ? { planimetriaId: archivioRender.planimetriaId, livelloId: livelloIniziale } : undefined);
  const cameraNellaStanza = (camera: Telecamera3D) => localeAllaPosizione(pianta, camera.posizione) === localeId;

  const esegui = async (lavoro: () => Promise<void> | void) => {
    setOccupato(true);
    try {
      await lavoro();
    } finally {
      setOccupato(false);
    }
  };

  const scaricaObj = () =>
    esegui(async () => {
      const { obj, mtl } = esportaObj(scena, `${nomeFile}.mtl`);
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file(`${nomeFile}.obj`, obj);
      zip.file(`${nomeFile}.mtl`, mtl);
      scarica(await zip.generateAsync({ type: "blob" }), `${nomeFile}-obj.zip`, "application/zip");
    });

  const suggerimento =
    modo === "alto"
      ? "Trascina per spostarti, rotella o due dita per avvicinarti."
      : modo === "giro"
        ? "Trascina per girare intorno, rotella o due dita per avvicinarti, tasto destro per spostarti."
        : inVisita ? "Tocca un punto sul pavimento per raggiungerlo. Trascina per guardarti intorno. Puoi camminare anche con le frecce o WASD."
          : "Trascina per guardarti intorno. Frecce o rotella per camminare.";

  const comandiVista = <ToggleGroup type="single" value={modo} onValueChange={cambiaModo} variant="outline" size="sm" aria-label="Come guardare" className="[&>*]:whitespace-nowrap">
    <ToggleGroupItem value="alto" aria-label="Vista dall'alto">
      <MappaIcona className="mr-1 h-4 w-4" />
      Dall'alto
    </ToggleGroupItem>
    <ToggleGroupItem value="giro" aria-label="Gira intorno">
      <Rotate3d className="mr-1 h-4 w-4" />
      <span className="max-sm:hidden">Gira intorno</span><span className="sm:hidden">Gira</span>
    </ToggleGroupItem>
    {(compatta ? locali.length > 0 : studio || archivioStanza || onFotogramma || modoIniziale === "dentro") && <ToggleGroupItem value="dentro" aria-label="Entra nella stanza" disabled={tuttiIPiani}>
      <Eye className="mr-1 h-4 w-4" />
      {compatta ? "Dentro" : <><span className="max-sm:hidden">Entra nella stanza</span><span className="sm:hidden">Dentro</span></>}
    </ToggleGroupItem>}
    {!schemaCanali && !compatta && <ToggleGroupItem value="visita" aria-label="Visita a piedi" className="gap-1.5 data-[state=on]:text-primary">
      <Footprints className="size-4" />Visita a piedi
    </ToggleGroupItem>}
  </ToggleGroup>;

  if (compatta) return <div className={cn("flex flex-col", className)}>
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2 py-1.5">
      {comandiVista}
      <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Ripristina inquadratura" title="Ripristina inquadratura"
        onClick={() => risistemaInquadratura(n => n + 1)}><Focus aria-hidden="true" /></Button>
      {anteprimaEditor.confronto && <div className="ml-auto">{anteprimaEditor.confronto}</div>}
    </div>
    <div ref={contenitore} role="group" aria-label="Vista 3D della pianta" className="relative min-h-0 flex-1 overflow-hidden bg-[#eef1f4]"
      onPointerDown={anteprimaEditor.onSelezione ? memorizzaPuntatore : undefined}
      onPointerUp={anteprimaEditor.onSelezione ? selezionaConPuntatore : undefined}
      onPointerCancel={() => { puntatore.current = null; }}>
      {errore && <p role="status" className="absolute inset-0 grid place-content-center p-4 text-center text-sm text-muted-foreground">{errore}</p>}
    </div>
  </div>;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div ref={barraVisita} className="flex scroll-mt-16 flex-wrap items-center gap-2">
        {comandiVista}
        {stanzaInquadrature && archivioStanza && <InquadratureStanza key={JSON.stringify([archivioStanza.planimetriaId, archivioStanza.livelloId, localeId])}
          stanza={{ ...archivioStanza, localeId }} nomeStanza={stanzaInquadrature.nome} onLeggiCamera={() => {
            const m = motore.current;
            if (!m) return null;
            const telecamera = telecameraAdesso();
            return cameraNellaStanza(telecamera) ? { telecamera, proporzioni: m.camera.aspect } : null;
          }} onRiprendi={vista => {
            if (!cameraNellaStanza(vista.telecamera)) return false;
            primaCamera.current = vista;
            risistemaInquadratura(n => n + 1);
            return true;
          }}
          onRender={fotorealisticoDisponibile() ? vista => {
            if (!cameraNellaStanza(vista.telecamera)) return false;
            preparaRenderDaQui(vista);
            return true;
          } : undefined} />}
        {!inVisita && !schemaCanali && <Button type="button" size="sm" variant={strutturaStrati ? "secondary" : "outline"} aria-pressed={strutturaStrati}
          className="gap-1.5" onClick={cambiaVistaEsplosa}><Layers className="size-4" />Vista esplosa</Button>}
        {!inVisita && !schemaCanali && !!pianta.pavimentoRadiante?.length &&
          <Button type="button" size="sm" variant={impianti ? "secondary" : "outline"} aria-pressed={impianti}
            className="gap-1.5" onClick={() => setImpianti(v => !v)}><Cable className="size-4" />Impianti</Button>}
        {!studio && modo === "dentro" && locali.length > 0 && (
          <Select value={localeId} onValueChange={setLocaleId}>
            <SelectTrigger className="h-9 w-44" aria-label="Stanza">
              <SelectValue placeholder="Scegli la stanza" />
            </SelectTrigger>
            <SelectContent>
              {locali.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {inVisita && <PartenzaVisita tappe={mappa?.partenza ?? []} partenza={tappaVisita?.id ?? ""} occupato={!!attraversamento}
          onParti={id => {
            setAvvisoVisita("");
            setPartenzaVisita(id);
            risistemaInquadratura(n => n + 1);
          }} onArrivo={() => contenitore.current?.focus({ preventScroll: true })} />}
        {studio?.rapide && <Button type="button" size="sm" variant={studio.rapide.aperte ? "secondary" : "outline"} className="gap-1.5"
          aria-expanded={studio.rapide.aperte} aria-controls={studio.rapide.aperte ? "modifiche-rapide-3d" : undefined}
          onClick={() => studio.rapide?.onCambia(!studio.rapide.aperte)}>
          <PaintRoller className="size-4" />Modifiche rapide
        </Button>}
        {!schemaCanali && asp.realistico && !strutturaStrati && (modo === "dentro" || inVisita) &&
          <Select value={asp.luce ?? "giorno"} onValueChange={luce => cambiaAsp({ luce: luce as LuceRenderLocale })} disabled={!!attraversamento}>
            <SelectTrigger className="h-9 w-auto gap-1.5 px-2.5" aria-label="Illuminazione della vista 3D">
              <Sun className="size-4 shrink-0 text-muted-foreground" /><SelectValue />
            </SelectTrigger>
            <SelectContent fitContent>{LUCI_RENDER_LOCALE.map(luce => <SelectItem key={luce} value={luce}>{NOMI_LUCE_RENDER_LOCALE[luce]}</SelectItem>)}</SelectContent>
          </Select>}
        {inVisita && <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Torna al punto di partenza" title="Torna al punto di partenza"
            disabled={!tappaVisita || !!attraversamento} onClick={() => risistemaInquadratura(n => n + 1)}><Focus className="size-4"/></Button>
          <Button type="button" size="icon" variant="ghost" aria-pressed={opzioniVisibili} disabled={!!attraversamento} onClick={() => mostraOpzioni(v => !v)}
            aria-label="Impostazioni 3D" title="Impostazioni 3D" className="size-8"><SlidersHorizontal className="size-4"/></Button>
        </div>}
        {studio && !inVisita && <div className="ml-auto flex flex-wrap items-center gap-1">
          {onVediInPianta && livelloIniziale && <Button type="button" size="sm" variant="ghost" className="gap-1.5" aria-label="Mostra sulla pianta"
            onClick={() => onVediInPianta({ livelloId: livelloIniziale, localeId: localeId || undefined })}><MappaIcona className="size-4"/><span className="max-sm:sr-only">Sulla pianta</span></Button>}
          {studio.onVistaAmpia && <Button type="button" size="sm" variant="outline" aria-pressed={studio.vistaAmpia} aria-label="Vista ampia"
            className="gap-1.5 aria-pressed:bg-primary/10 aria-pressed:text-primary motion-safe:active:scale-[.96]" onClick={studio.onVistaAmpia}>
            {studio.vistaAmpia ? <Minimize2 className="size-4"/> : <Maximize2 className="size-4"/>}
            <span className="max-sm:sr-only">{studio.vistaAmpia ? "Mostra pannello" : "Vista ampia"}</span>
          </Button>}
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Ripristina inquadratura" title="Ripristina inquadratura" onClick={() => { setInquadraturaLocale(false); risistemaInquadratura(n => n + 1); }}><Focus className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="ghost" aria-pressed={opzioniVisibili} onClick={() => mostraOpzioni(v => !v)} className="gap-1.5"><SlidersHorizontal className="h-4 w-4" />Vista</Button>
        </div>}
        {((!studio && !inVisita) || opzioniVisibili) && <div className="flex flex-wrap items-center gap-2 max-md:hidden">
          <Button variant="outline" size="sm" disabled={occupato} onClick={() => esegui(async () => scarica(await esportaGlbConFiniture(scena) as Uint8Array<ArrayBuffer>,
            `${nomeFile}${strutturaStrati ? "-vista-esplosa" : ""}.glb`, "model/gltf-binary"))}>
            <Download className="mr-1 h-4 w-4" />
            Scarica GLB
          </Button>
          {!schemaCanali && <Button variant="outline" size="sm" disabled={occupato} title="Un file da mandare al cliente: si apre col doppio clic, anche dal telefono"
            onClick={() => esegui(async () => {
              const { tourHtml } = await import("@/lib/planimetrie/tred/tourHtml");
              scarica(tourHtml(await esportaGlbConFiniture(scena) as Uint8Array, { titolo: nomeFile.replace(/-/g, " ") }), `${nomeFile}-tour-3d.html`, "text/html");
            })}>
            <Eye className="mr-1 h-4 w-4" />
            Tour 3D da inviare
          </Button>}
          <Button variant="outline" size="sm" disabled={occupato} onClick={scaricaObj}>
            <Box className="mr-1 h-4 w-4" />
            Scarica OBJ
          </Button>
        </div>}
      </div>

      {!schemaCanali && ((!studio && !inVisita) || (opzioniVisibili && !attraversamento)) && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {inVisita && <label className="flex items-center gap-2">
          <Switch checked={!movimentoRidotto} disabled={ridotto} onCheckedChange={setAnimaPassaggi} aria-label="Anima i passaggi della visita" />
          Anima i passaggi
        </label>}
        {!studio && conStati && (
          <ToggleGroup type="single" value={vista} onValueChange={(v) => v && setVista(v as VistaLavori)} variant="outline" size="sm" aria-label="Cosa mostrare">
            <ToggleGroupItem value="fatto">Stato di fatto</ToggleGroupItem>
            <ToggleGroupItem value="progetto">Progetto</ToggleGroupItem>
            <ToggleGroupItem value="confronto">
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#f2c200]" />
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#d42a2a]" />
              Demolizioni e nuovo
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        {conPiani && !inVisita && (
          <div className="flex flex-wrap items-center gap-2">
            <Switch id="vista3d-edificio" checked={edificio} onCheckedChange={setEdificio} />
            <Label htmlFor="vista3d-edificio" className="flex items-center gap-1"><Building className="h-3.5 w-3.5" />Tutto l'edificio ({piani!.length} piani)</Label>
            {edificio && (
              <>
                <Switch id="vista3d-esploso" checked={esploso} onCheckedChange={setEsploso} />
                <Label htmlFor="vista3d-esploso">Piani staccati</Label>
                <Select value={finoA || "tutti"} onValueChange={(v) => setFinoA(v === "tutti" ? "" : v)}>
                  <SelectTrigger className="h-8 w-44" aria-label="Fino al piano">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tutti">Tutti i piani</SelectItem>
                    {piani!.map((p) => (
                      <SelectItem key={p.id} value={p.id}>Fino a: {p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        )}
        {!inVisita && <>{!strutturaStrati && <div className="flex items-center gap-2">
          <Switch id="vista3d-soffitto" checked={soffitto} onCheckedChange={setSoffitto} />
          <Label htmlFor="vista3d-soffitto">Soffitto</Label>
        </div>}
        <div className="flex items-center gap-2">
          <Switch id="vista3d-arredi" checked={arredi} onCheckedChange={setArredi} />
          <Label htmlFor="vista3d-arredi">Arredi e sanitari</Label>
        </div></>}
        <div className="flex items-center gap-2">
          <Switch id="vista3d-impianti" checked={impianti} onCheckedChange={setImpianti} />
          <Label htmlFor="vista3d-impianti" className="flex items-center gap-1"><Cable className="h-3.5 w-3.5" />Impianti</Label>
        </div>
        {!inVisita && <div className="flex items-center gap-2">
          <Switch id="vista3d-fondazioni" checked={fondazioni} onCheckedChange={setFondazioni} />
          <Label htmlFor="vista3d-fondazioni">Fondazioni</Label>
        </div>}
        {(
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-t pt-2">
            <div className="flex items-center gap-2">
              <Switch id="vista3d-realistico" checked={asp.realistico} onCheckedChange={(v) => cambiaAsp({ realistico: v })} />
              <Label htmlFor="vista3d-realistico" className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" />Aspetto realistico</Label>
            </div>
            {asp.realistico && (
              <>
                {modo !== "dentro" && <Select value={asp.facciata} onValueChange={(v) => cambiaAsp({ facciata: v as OpzioniAspetto["facciata"] })}>
                  <SelectTrigger className="h-8 w-44" aria-label="Facciata"><SelectValue /></SelectTrigger>
                  <SelectContent>{ID_FACCIATE.map((id) => <SelectItem key={id} value={id}>{FACCIATE[id].nome}</SelectItem>)}</SelectContent>
                </Select>}
                {!studio && <Select disabled={!!pianta.infissiProgetto} value={pianta.infissiProgetto?.colore ?? asp.infissi} onValueChange={(v) => cambiaAsp({ infissi: v as OpzioniAspetto["infissi"] })}>
                  <SelectTrigger className="h-8 w-52" aria-label={pianta.infissiProgetto ? "Infissi comuni del progetto" : "Infissi"}><SelectValue /></SelectTrigger>
                  <SelectContent>{ID_INFISSI.map((id) => <SelectItem key={id} value={id}>Infissi: {INFISSI[id].nome.toLowerCase()}</SelectItem>)}</SelectContent>
                </Select>}
                <div className="flex items-center gap-2">
                  <Sun className="h-3.5 w-3.5" aria-hidden />
                  <input type="range" min={7} max={19} step={0.25} value={asp.ora} onChange={(e) => cambiaAsp({ ora: Number(e.target.value) })} aria-label="Ora del giorno" className="h-1.5 w-28 accent-primary" />
                  <span className="w-10 text-xs tabular-nums text-muted-foreground">{String(Math.floor(asp.ora)).padStart(2, "0")}:{String(Math.round((asp.ora % 1) * 60)).padStart(2, "0")}</span>
                </div>
                {modo !== "dentro" && !studio && <div className="flex items-center gap-2">
                  <Switch id="vista3d-alberi" checked={asp.alberi} onCheckedChange={(v) => cambiaAsp({ alberi: v })} />
                  <Label htmlFor="vista3d-alberi">Alberi</Label>
                </div>}
                <div className="flex items-center gap-2">
                  <Switch id="vista3d-effetti" checked={asp.effetti} onCheckedChange={(v) => cambiaAsp({ effetti: v })} />
                  <Label htmlFor="vista3d-effetti" title="Ombre morbide negli angoli: più bello, un po' più pesante">Ombre morbide</Label>
                </div>
              </>
            )}
          </div>
        )}
      </div>}

      {strutturaStrati && controlliStrati.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2.5">
        <div role="group" aria-label="Strati del modello" className="flex flex-wrap items-center gap-1">
          {controlliStrati.map(({ id, nome }) => {
            const visibile = !stratiNascosti.has(id);
            return <Button key={id} type="button" size="sm" variant={visibile ? "secondary" : "ghost"} className="h-8 gap-1.5 px-2 text-xs"
              aria-pressed={visibile} disabled={visibile && stratiVisibili === 1} onClick={() => setStratiNascosti(prima => {
                const dopo = new Set(prima);
                if (dopo.has(id)) dopo.delete(id); else dopo.add(id);
                return dopo;
              })}><Layers className="size-3.5" />{nome}</Button>;
          })}
          {stratiNascosti.size > 0 && <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs text-primary"
            onClick={() => setStratiNascosti(new Set())}>Mostra tutti</Button>}
        </div>
        <label className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Stacco fra gli strati
          <input type="range" min={0.5} max={4} step={0.1} value={distanzaStrati} onChange={e => setDistanzaStrati(Number(e.target.value))}
            className="min-h-7 w-24 accent-primary" aria-label="Stacco fra gli strati" />
          <span className="min-w-10 text-right font-medium tabular-nums text-foreground">{distanzaStrati.toLocaleString("it-IT")} m</span>
        </label>
      </div>}
      <div
        ref={contenitore}
        tabIndex={0}
        onKeyDown={tasto}
        onKeyUp={e => camminata.rilascia(e.key.toLowerCase())}
        onBlur={e => { if (e.target === e.currentTarget) camminata.ferma(); }}
        onPointerDown={e => {
          if (inVisita && e.target === motore.current?.renderer.domElement) contenitore.current?.focus({ preventScroll: true });
          if (studio || inVisita) memorizzaPuntatore(e);
        }}
        onPointerUp={inVisita ? raggiungiPavimento : studio && !strutturaStrati ? selezionaConPuntatore : undefined}
        onPointerMove={mostraIngombro ? anteprimaIngombro : undefined}
        onPointerLeave={mostraIngombro ? () => anteprimaIngombro() : undefined}
        onPointerCancel={() => { puntatore.current = null; anteprimaIngombro(); }}
        className={cn("relative min-h-[320px] w-full overflow-hidden rounded-lg border bg-[#eef1f4] outline-none focus-visible:ring-2 focus-visible:ring-ring",
          schemaCanali ? "h-[clamp(320px,51dvh,650px)]" : inVisita || studio?.vistaAmpia ? "h-[clamp(320px,65dvh,740px)]" : studio ? "h-[clamp(350px,54vh,680px)]" : "h-[60vh]", studio?.istruzione && !inVisita && "cursor-crosshair")}
        aria-label={schemaCanali ? "Vista 3D dei canali" : "Vista 3D della pianta"}
      >
        {studio?.istruzione && !inVisita && <p role="status" className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg bg-slate-900/90 px-3 py-2 text-xs font-medium text-white">{studio.istruzione}</p>}
        {errore && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">{errore}</div>}
        {inVisita && !errore && <><IndicazioniVisita luogo={luogo} vicino={passaggioVicino} passaggioInCorso={attraversamento} avviso={avvisoVisita}
          invito={mappa?.passaggi.length ? "Avvicinati a una scala o a un’uscita." : conPiani ? "Collegamenti tra i piani da disegnare." : undefined}
          onPassaggio={percorri} onRender={puoRenderDaQui ? () => preparaRenderDaQui() : undefined}
          mostraMappa={mostraMappa} onMappa={pianoInVisita ? () => setMostraMappa(v => !v) : undefined}
          onGuardaEdificio={luogo?.esterno && !attraversamento ? guardaEdificio : undefined} />
          {mostraMappa && pianoInVisita && mappa && <MinimappaVisita ref={minimappa} piano={pianoInVisita}
            vista={vistaVisita} localeId={luogo?.localeId} esterno={luogo?.esterno} passaggi={mappa.passaggi} leggiPosizione={leggiPosizioneMappa}
            onVediInPianta={onVediInPianta && !attraversamento ? () => onVediInPianta({ livelloId: pianoInVisita.id, localeId: luogo?.localeId }) : undefined}/>}
          <div className="absolute bottom-3 right-3 z-10"><MovimentoVisita disabilitato={!tappaVisita || !!attraversamento}
            onCammina={(avanti, lato) => cammina(avanti * PASSO_BREVE, lato * PASSO_BREVE)}
            onPremi={(avanti, lato) => { if (avvisoVisita) setAvvisoVisita(""); camminata.premi("pulsante", [avanti, lato]); }}
            onRilascia={() => camminata.rilascia("pulsante")} onGira={giraVisita} /></div></>}
        {!inVisita && impianti && (scena.impianti?.length ?? 0) > 0 && (
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[16rem] space-y-0.5 rounded-md bg-white/90 px-2.5 py-1.5 text-xs text-neutral-700 shadow-sm">
            <p className="font-semibold">Impianti · stime</p>
            {scena.impianti!.map((l) => (
              <p key={l.linea} className="flex items-center gap-1.5">
                <span className="inline-block h-1 w-4 rounded-full" style={{ background: l.colore }} />
                {l.nome} · {l.superficieMq !== undefined ? `${l.superficieMq.toLocaleString("it-IT", { maximumFractionDigits: 2 })} m² / ` : ""}
                {l.metri.toLocaleString("it-IT", { maximumFractionDigits: 2 })} m
              </p>
            ))}
            {!!scena.impianti!.find(l => l.linea === "radiante")?.circuiti?.length && <details className="pointer-events-auto pt-1">
              <summary className="cursor-pointer font-semibold">Circuiti radianti</summary>
              <div className="max-h-52 space-y-2 overflow-auto py-1">
                <p className="flex gap-3 font-medium">
                  <span style={{ color: COLORI_CIRCUITO.mandata }}>Mandata</span>
                  <span style={{ color: COLORI_CIRCUITO.ritorno }}>Ritorno</span>
                </p>
                <CircuitiRadiantiElenco circuiti={scena.impianti!.find(l => l.linea === "radiante")!.circuiti!} />
              </div>
            </details>}
          </div>
        )}
        {vista === "confronto" && !inVisita && (
          <div className="pointer-events-none absolute left-3 top-3 flex gap-3 rounded-md bg-white/85 px-2.5 py-1.5 text-xs text-neutral-700 shadow-sm">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#f2c200]" />Da demolire</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#d42a2a]" />Nuovo</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{suggerimento}</p>
        {puoRenderDaQui && <Button size="sm" variant="outline" className="gap-1.5 sm:hidden" onClick={() => preparaRenderDaQui()}><Sparkles className="size-3.5"/>Render da qui</Button>}
        {!schemaCanali && !inVisita && scena.mesh.length > 0 && !errore && fotorealisticoDisponibile() && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => preparaRenderDaQui()}>
          <Sparkles className="size-3.5" />Render fotorealistico
        </Button>}
        {modo === "dentro" && studio?.onRender && <Button size="sm" className="gap-1.5" disabled={studio.renderDisabilitato || !!errore} onClick={() => {
          if (!motore.current) return;
          const telecamera = telecameraAdesso();
          studio.onRender?.({ telecamera, localeId: localeAllaPosizione(pianta, telecamera.posizione) ?? localeId, aspetto: { ...asp, dentro: true }, proporzioni: motore.current.camera.aspect });
        }}><Sparkles className="h-4 w-4" />{studio.renderLabel ?? "Usa questa vista per il render"}</Button>}
        {modo === "dentro" && onFotogramma && <Button size="sm" disabled={occupato} onClick={() => esegui(async () => onFotogramma(await fotogramma({ larghezza: 1536, altezza: 1024 })))}>
          Usa questa vista per il render
        </Button>}
      </div>
      {scena.avvisi.length > 0 && <details className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium text-amber-800 dark:text-amber-200">Verifiche sul modello · {scena.avvisi.length}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
          {scena.avvisi.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </details>}
      {render && <Suspense fallback={<p role="status" className="sr-only">Apro il confronto render…</p>}>
        <RenderInquadratura3D data={render} onChiudi={() => setRender(null)} />
      </Suspense>}
    </div>
  );
});

export default Vista3D;
