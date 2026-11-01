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
import type { ArchivioRicalco } from "@/lib/planimetrie/ricalco";
import type { Ricalco, Tetto } from "../../../../shared/planimetrie/modello.ts";
import { NOMI_AREA, TIPI_AREA, type TipoArea } from "../../../../shared/planimetrie/modello.ts";
import { STILE_AREA } from "./disegno";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import { AppWindow, Armchair, Hexagon, ImageIcon, Layers, Trees, DoorOpen, Maximize2, Minus, MousePointer2, MoveHorizontal, PenLine, Plus, Redo2, Square, Type, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  DESTINAZIONI,
  aPlanimetria,
  ID_PROPOSTA,
  aggiungiLivello,
  daPlanimetria,
  datiVista,
  duplicaProposta,
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
import * as C from "./comandi";
import { aggancia, angoliEsistenti, direzione, dist, muroPiuVicino } from "./geometria";
import { contornoIncrociato } from "../../../../shared/planimetrie/geometria.ts";
import { leggiMisura, scriviMetri } from "./misure";
import { PannelloDettagli, type AzioniPannello } from "./PannelloDettagli";
import { CATALOGO, GRUPPI_CATALOGO, urlImmagineSimbolo, type VoceCatalogo } from "./catalogo";
import { SimboloArredo } from "./SimboloArredo";
import { arredaStanza, climaStanza, impiantoElettrico, magliaPilastri, riscaldamentoStanza } from "./arreda";
import { btuConsigliati, metriConSfrido, percorsiDaElementi } from "../../../../shared/planimetrie/impianti.ts";
import { COLORI_LINEE } from "./TelaPlanimetria";
import { annulla, esegui, nuovaStoria, ripeti, type Storia } from "./storia";
import { TelaPlanimetria, type Camera, type Selezione, type SfondoRicalco, type Sovrapposizioni } from "./TelaPlanimetria";

export type Strumento = "seleziona" | "stanza" | "poligono" | "area" | "parete" | "porta" | "finestra" | "arredo" | "quota" | "testo";

interface Props {
  /** Il documento della fase 1 (`shared/planimetrie/modello.ts`); senza, una pianta vuota. */
  piantaIniziale?: Planimetria;
  /** Ogni modifica completa dà il documento aggiornato, pronto per il salvataggio. */
  onChange?: (planimetria: Planimetria) => void;
  /** Forza la vista da telefono (solo guardare e correggere misure). */
  soloVista?: boolean;
  className?: string;
  /** Dove si salva l'immagine da ricalcare; senza, resta solo finché la pagina è aperta. */
  ricalco?: ArchivioRicalco;
}

type Gesto =
  | { tipo: "pan"; da: Punto; camera: Camera; mosso: boolean; bersaglio: Bersaglio | null }
  | { tipo: "pinch"; distanza: number; centro: Punto; camera: Camera }
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

const SUGGERIMENTI: Record<Strumento, string> = {
  seleziona: "Tocca una stanza, una parete o una porta per vederne le misure. Trascina una parete per spostarla. Clic su una misura per correggerla. Maiusc+trascina seleziona più arredi, quote e testi.",
  stanza: "Trascina per disegnare la stanza: le misure compaiono mentre la disegni. Oppure usa «Scrivi le misure».",
  parete: "Clic per l'inizio, clic per la fine: la parete va dritta da sola. Puoi anche scrivere la lunghezza e premere Invio. Esc per finire.",
  porta: "Trascina la porta su una parete (o clicca sulla parete). Poi un clic sulla porta selezionata ne gira il verso.",
  finestra: "Trascina la finestra su una parete (o clicca sulla parete).",
  poligono: "Clic su ogni angolo della stanza; clic sul primo punto (o Invio) per chiuderla. Le pareti vanno dritte a 90° e 45° da sole. Esc per annullare.",
  area: "Clic su ogni angolo dell'area (lotto, prato, vialetto…); clic sul primo punto o Invio per chiuderla. Esc per annullare.",
  arredo: "Clic sul foglio per posare l'arredo scelto. Poi trascinalo per spostarlo; R lo ruota di 90°.",
  quota: "Clic sul primo punto, clic sul secondo: la quota misura da sola. Si agganciano angoli e pareti.",
  testo: "Clic dove vuoi la scritta, poi scrivila nel pannello a destra.",
};

export default function EditorPlanimetria({ piantaIniziale, onChange, soloVista, className, ricalco: archivio }: Props) {
  const telefono = useIsMobile();
  const sola = soloVista ?? telefono;

  // Il piano su cui si lavora (fase 5): ogni piano ha il suo annulla/ripeti.
  const [livelloId, setLivelloId] = useState<string | undefined>(piantaIniziale?.livelli[0]?.id);
  // L'alternativa di progetto su cui si lavora (A, B, C…).
  const [propostaId, setPropostaId] = useState<string>(piantaIniziale?.livelli[0]?.proposte[0]?.id ?? ID_PROPOSTA);
  const [storia, setStoria] = useState<Storia>(() => nuovaStoria(piantaIniziale ? daPlanimetria(piantaIniziale, undefined, piantaIniziale.livelli[0]?.proposte[0]?.id) : piantaVuota()));
  const [anteprima, setAnteprima] = useState<Pianta | null>(null);
  const pianta = anteprima ?? storia.presente;
  // L'ultimo documento prodotto: tiene titolo, arredi, altre proposte e gli id dei locali del progetto.
  const documentoBase = useRef<Planimetria | undefined>(piantaIniziale);
  // Immagine da ricalcare (mappa catastale, foto aerea, rilievo del lotto), per piano: si salva
  // nel documento (`Livello.ricalco`) se c'è un archivio, altrimenti resta finché la pagina è aperta.
  const [ricalco, setRicalco] = useState<Ricalco | null>(() => piantaIniziale?.livelli[0]?.ricalco ?? null);
  const documento = useMemo(() => {
    const d = aPlanimetria(pianta, documentoBase.current, livelloId, propostaId);
    // l'immagine locale (senza archivio) non entra nel documento
    const lid = livelloId ?? d.livelli[0]?.id;
    return lid ? impostaRicalco(d, lid, ricalco && !ricalco.percorso.startsWith("blob:") ? ricalco : null) : d;
  }, [pianta, livelloId, propostaId, ricalco]);
  const [strumento, setStrumentoStato] = useState<Strumento>("seleziona");
  const [vista, setVista] = useState<C.Vista>("fatto");
  const [selezione, setSelezione] = useState<Selezione | null>(null);
  // Più arredi, quote e testi insieme (Maiusc+clic o Maiusc+trascina).
  const [gruppo, setGruppo] = useState<C.Gruppo>(C.gruppoVuoto);
  // Linee stimate degli impianti, dal quadro / collettore / colonna / unità esterna.
  const [mostraLinee, setMostraLinee] = useState(false);
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
  const [inizioQuota, setInizioQuota] = useState<Punto | null>(null);
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
  // Metti in scala con due punti: i punti cliccati sul foglio (null = non si sta misurando).
  const [calibra, setCalibra] = useState<Punto[] | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const gesto = useRef<Gesto | null>(null);
  const puntatori = useRef(new Map<number, Punto>());
  const ultimoCursore = useRef<Punto | null>(null);
  const spazioPremuto = useRef(false);

  // Stanze, mq e problemi come li calcola il modello della fase 1.
  const dati = useMemo(() => datiVista(pianta, documento, vista, livelloId, propostaId), [pianta, documento, vista, livelloId, propostaId]);
  const latiModificabili = useMemo(
    () => new Set(pianta.locali.filter((l) => C.modificabile(l.stato, vista) && dati.locali.some((x) => x.id === l.id)).map((l) => l.id)),
    [pianta, vista, dati],
  );

  // Riferimenti sempre aggiornati per i gestori registrati una volta sola.
  const stato = useRef({ pianta, camera, strumento, vista, selezione, inizioParete, storia, dati, arredoScelto, inizioQuota, puntiPoligono, gruppo });
  stato.current = { pianta, camera, strumento, vista, selezione, inizioParete, storia, dati, arredoScelto, inizioQuota, puntiPoligono, gruppo };

  useEffect(() => {
    if (anteprima) return;
    documentoBase.current = documento;
    onChange?.(documento);
  }, [documento, anteprima, onChange]);

  useEffect(() => {
    if (!avviso) return;
    const t = setTimeout(() => setAvviso(null), 4500);
    return () => clearTimeout(t);
  }, [avviso]);

  const applica = useCallback((nuova: Pianta) => {
    setAnteprima(null);
    setStoria((s) => esegui(s, nuova));
  }, []);

  const setStrumento = useCallback((s: Strumento) => {
    setStrumentoStato(s);
    setInizioParete(null);
    setInizioQuota(null);
    setPuntiPoligono([]);
    setSovrapposizioni({});
    setMisura(null);
    if (s !== "seleziona") {
      setSelezione(null);
      setGruppo(C.gruppoVuoto());
    }
  }, []);

  // ─── dimensioni e inquadratura ─────────────────────────────────────────────
  useEffect(() => {
    const el = contenitoreRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setDimensioni({ w: Math.max(200, e.contentRect.width), h: Math.max(200, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const adatta = useCallback(() => {
    const ps = angoliEsistenti(stato.current.pianta);
    if (!ps.length) {
      setCamera({ s: 0.8, tx: 80, ty: 80 });
      return;
    }
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    // margine: le porte aperte verso fuori sporgono dalla pianta
    const margine = 40 + Math.max(0, ...stato.current.pianta.aperture.map((a) => a.larghezza));
    const minX = Math.min(...xs) - margine;
    const maxX = Math.max(...xs) + margine;
    const minY = Math.min(...ys) - margine;
    const maxY = Math.max(...ys) + margine;
    const { w, h } = dimensioniRef.current;
    const s = Math.max(0.05, Math.min(3, Math.min(w / (maxX - minX), h / (maxY - minY))));
    setCamera({ s, tx: (w - (maxX - minX) * s) / 2 - minX * s, ty: (h - (maxY - minY) * s) / 2 - minY * s });
  }, []);
  const dimensioniRef = useRef(dimensioni);
  dimensioniRef.current = dimensioni;
  const giaAdattata = useRef(false);
  useEffect(() => {
    if (giaAdattata.current || dimensioni.w === 800) return;
    giaAdattata.current = true;
    if (storia.presente.muri.length) adatta();
  }, [dimensioni, adatta, storia.presente.muri.length]);

  // Sul telefono il pannello in basso ruba spazio: si reinquadra la pianta.
  useEffect(() => {
    if (telefono && giaAdattata.current) adatta();
  }, [telefono, dimensioni.h, adatta]);

  const zoomAttorno = useCallback((fattore: number, schermo: Punto) => {
    setCamera((c) => {
      const s = Math.max(0.05, Math.min(6, c.s * fattore));
      const k = s / c.s;
      return { s, tx: schermo.x - (schermo.x - c.tx) * k, ty: schermo.y - (schermo.y - c.ty) * k };
    });
  }, []);

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
  }, [zoomAttorno]);

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
  const tolleranza = () => 12 / stato.current.camera.s;

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
    [applica],
  );

  // ─── gesti ────────────────────────────────────────────────────────────────
  const iniziaPinch = () => {
    const [a, b] = [...puntatori.current.values()];
    gesto.current = { tipo: "pinch", distanza: dist(a, b), centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, camera: stato.current.camera };
    setAnteprima(null);
    setSovrapposizioni({});
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

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
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

    if (sola || e.button === 1 || spazioPremuto.current) return pan();

    // Metti in scala l'immagine da ricalcare: due clic, poi la distanza vera
    if (calibra !== null && ricalco) {
      const punti = [...calibra, p];
      if (punti.length < 2) { setCalibra(punti); return; }
      setCalibra(null);
      const misurata = dist(punti[0], punti[1]);
      const scritta = window.prompt("Quanto sono distanti davvero i due punti? (metri)", "");
      const vera = Number((scritta ?? "").replace(",", ".")) * 100;
      if (!(vera > 0) || misurata < 1) { setAvviso("Scala non cambiata."); return; }
      const k = vera / misurata;
      // il primo punto resta fermo, il resto dell'immagine si allarga o si stringe attorno a lui
      const a = punti[0];
      const xE = a.x - (a.x - ricalco.x) * k, yE = a.y - (a.y - -ricalco.y) * k;
      setRicalco({ ...ricalco, larghezzaCm: Math.round(ricalco.larghezzaCm * k), x: Math.round(xE), y: Math.round(-yE) });
      setAvviso(`Immagine in scala: larga ${(ricalco.larghezzaCm * k / 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} m.`);
      return;
    }

    if (str === "stanza") {
      const a = aggancia(pi, p, { tolleranza: tolleranza() });
      gesto.current = { tipo: "rettangolo", a: a.punto };
      setSovrapposizioni({ rettangolo: { a: a.punto, b: a.punto }, aggancio: a });
      return;
    }
    if (str === "poligono" || str === "area") {
      const pts = stato.current.puntiPoligono;
      const ultimo = pts[pts.length - 1];
      if (pts.length >= 3 && dist(p, pts[0]) <= tolleranza() * 1.2) return chiudiPoligono(pts);
      const a = aggancia(pi, p, { tolleranza: tolleranza(), da: ultimo });
      if (ultimo && dist(ultimo, a.punto) < 5) return;
      const nuovi = [...pts, a.punto];
      setPuntiPoligono(nuovi);
      setSovrapposizioni({ poligonoInCorso: { punti: nuovi, cursore: a.punto }, aggancio: a });
      return;
    }
    if (str === "parete") {
      const inizio = stato.current.inizioParete;
      const a = aggancia(pi, p, { tolleranza: tolleranza(), da: inizio ?? undefined });
      if (!inizio) {
        setInizioParete(a.punto);
        setSovrapposizioni({ pareteInCorso: { a: a.punto, b: a.punto }, aggancio: a });
        return;
      }
      if (dist(inizio, a.punto) < 5) {
        // secondo clic sullo stesso punto: fine
        setInizioParete(null);
        setSovrapposizioni({});
        return;
      }
      const r = C.aggiungiParete(stato.current.storia.presente, inizio, a.punto, { stato: C.statoNuovo(v) });
      applica(C.chiudiStanze(r.pianta, v));
      // se si chiude su un angolo esistente, la parete finisce lì
      if (a.guida === "angolo") {
        setInizioParete(null);
        setSovrapposizioni({});
      } else {
        setInizioParete(a.punto);
        setSovrapposizioni({ pareteInCorso: { a: a.punto, b: a.punto }, aggancio: a });
      }
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
    if (str === "quota") {
      const a = aggancia(pi, p, { tolleranza: tolleranza(), da: stato.current.inizioQuota ?? undefined });
      const inizio = stato.current.inizioQuota;
      if (!inizio) {
        setInizioQuota(a.punto);
        setSovrapposizioni({ quotaInCorso: { a: a.punto, b: a.punto }, aggancio: a });
        return;
      }
      if (dist(inizio, a.punto) < 5) return;
      const r = C.aggiungiQuota(stato.current.storia.presente, inizio, a.punto, 40);
      applica(r.pianta);
      setInizioQuota(null);
      setSovrapposizioni({});
      setStrumento("seleziona");
      setSelezione({ tipo: "quota", id: r.id });
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
    const s = schermo(e);
    if (puntatori.current.has(e.pointerId)) puntatori.current.set(e.pointerId, s);
    const g = gesto.current;
    const p = inPianta(e);
    ultimoCursore.current = p;
    const { pianta: pi, strumento: str } = stato.current;

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
      const a = aggancia(pi, p, { tolleranza: tolleranza() });
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
      const a = aggancia(senza, p, { tolleranza: tolleranza(), da: g.altro });
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
    if (str === "parete") {
      const inizio = stato.current.inizioParete;
      const a = aggancia(pi, p, { tolleranza: tolleranza(), da: inizio ?? undefined });
      setSovrapposizioni(inizio ? { pareteInCorso: { a: inizio, b: a.punto }, aggancio: a } : { aggancio: a });
    } else if (str === "stanza") {
      setSovrapposizioni({ aggancio: aggancia(pi, p, { tolleranza: tolleranza() }) });
    } else if (str === "poligono" || str === "area") {
      const pts = stato.current.puntiPoligono;
      const a = aggancia(pi, p, { tolleranza: tolleranza(), da: pts[pts.length - 1] });
      setSovrapposizioni(pts.length ? { poligonoInCorso: { punti: pts, cursore: a.punto }, aggancio: a } : { aggancio: a });
    } else if (str === "arredo" && stato.current.arredoScelto) {
      const v0 = stato.current.arredoScelto;
      setSovrapposizioni({ arredoFantasma: { tipo: v0.tipo, centro: p, larghezza: v0.larghezza, profondita: v0.profondita } });
    } else if (str === "quota") {
      const inizio = stato.current.inizioQuota;
      const a = aggancia(pi, p, { tolleranza: tolleranza(), da: inizio ?? undefined });
      setSovrapposizioni(inizio ? { quotaInCorso: { a: inizio, b: a.punto }, aggancio: a } : { aggancio: a });
    } else if (str === "porta" || str === "finestra") {
      const v = stato.current.vista;
      const vicino = muroPiuVicino(pi, p, tolleranza() * 1.5, (m) => C.visibile(m.stato, v) && m.stato !== "da_demolire");
      setSovrapposizioni(vicino ? { aperturaFantasma: { muroId: vicino.muro.id, t: vicino.t, tipo: str } } : {});
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
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

    if (g.tipo === "pan") {
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
  chiudiPoligonoRef.current = chiudiPoligono;
  const sovrapposizioniRef = useRef(sovrapposizioni);
  sovrapposizioniRef.current = sovrapposizioni;
  const anteprimaRef = useRef(anteprima);
  anteprimaRef.current = anteprima;

  // ─── porta e finestra trascinate dalla barra ──────────────────────────────
  const trascinaDallaBarra = (quale: "porta" | "finestra") => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
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
    [applica],
  );

  const pareteScritta = useCallback(
    (cm: number) => {
      const inizio = stato.current.inizioParete;
      const cursore = ultimoCursore.current;
      if (!inizio || !cursore) return;
      const a = aggancia(stato.current.pianta, cursore, { tolleranza: tolleranza(), da: inizio });
      const u = direzione({ p1: inizio, p2: dist(inizio, a.punto) > 1 ? a.punto : { x: inizio.x + 1, y: inizio.y } });
      const fine = { x: inizio.x + u.x * cm, y: inizio.y + u.y * cm };
      const r = C.aggiungiParete(stato.current.storia.presente, inizio, fine, { stato: C.statoNuovo(stato.current.vista) });
      applica(C.chiudiStanze(r.pianta, stato.current.vista));
      setInizioParete(fine);
      setSovrapposizioni({ pareteInCorso: { a: fine, b: fine } });
    },
    [applica],
  );

  useEffect(() => {
    if (sola) return;
    const tasto = (e: KeyboardEvent) => {
      const campo = (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true], [role=combobox], [role=listbox]");
      if (e.code === "Space" && !campo) {
        spazioPremuto.current = e.type === "keydown";
        return;
      }
      if (e.type !== "keydown" || campo) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
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
  }, [sola, elimina, setStrumento, pareteScritta, applica]);

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
  }, [applica]);
  const azioneGruppoRef = useRef(azioneGruppo);
  azioneGruppoRef.current = azioneGruppo;

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
      latoStanza: (id, lato, cm) => applica(C.impostaLatoStanza(p(), id, lato, cm)),
      lunghezzaParete: (id, cm) => applica(C.impostaLunghezzaParete(p(), id, cm)),
      spessoreParete: (id, cm) => applica(C.modificaMuro(p(), id, { spessore: cm, tipo: cm >= 20 ? "portante" : "tramezzo" })),
      modificaApertura: (id, campi) => applica(C.modificaApertura(p(), id, { ...campi, origine: "rilevata" })),
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
        } else if (sel.tipo === "muro" || sel.tipo === "apertura") applica(C.confermaMisura(p(), sel.tipo, sel.id));
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
      unitaStanza: (id, unita) => applica(C.modificaLocale(p(), id, { unita: unita || undefined })),
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
    documentoBase.current = doc;
    setAnteprima(null);
    setLivelloId(id);
    const pid = proposta ?? doc.livelli.find((l) => l.id === id)?.proposte[0]?.id ?? ID_PROPOSTA;
    setPropostaId(pid);
    setStoria(nuovaStoria(daPlanimetria(doc, id, pid)));
    setRicalco(doc.livelli.find((l) => l.id === id)?.ricalco ?? null);
    setCalibra(null);
    setSelezione(null);
    setStrumento("seleziona");
    setTimeout(adatta, 0);
  };
  const nuovoPiano = (o: { nome: string; quota: number; base: BaseNuovoPiano }) => {
    const r = aggiungiLivello(documento, { ...o, daLivelloId: livelloId });
    vaiAlPiano(r.id, r.documento);
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
    documentoBase.current = doc;
    vaiAllaProposta(propostaId, doc);
  };
  const togliPropostaCorrente = () => {
    if (!livelloCorrente || livelloCorrente.proposte.length <= 1) return;
    const doc = eliminaProposta(documento, livelloCorrente.id, propostaId);
    const resta = doc.livelli.find((l) => l.id === livelloCorrente.id)?.proposte[0]?.id ?? ID_PROPOSTA;
    vaiAllaProposta(resta, doc);
  };

  const cambiaVista = (v: C.Vista) => {
    setVista(v);
    setInizioParete(null);
    setSovrapposizioni({});
    setMisura(null);
  };

  const annullaPasso = () => {
    setAnteprima(null);
    setStoria(annulla);
  };
  const ripetiPasso = () => setStoria(ripeti);

  const vuota = storia.presente.muri.length === 0 && storia.presente.locali.length === 0;
  const cursore =
    strumento === "stanza" || strumento === "poligono" || strumento === "area" || strumento === "parete" || strumento === "quota" ? "crosshair"
      : strumento === "porta" || strumento === "finestra" || strumento === "arredo" ? "copy"
      : strumento === "testo" ? "text" : "default";

  // ─── interfaccia ──────────────────────────────────────────────────────────
  const impianti = useMemo(() => {
    const visibili = (pianta.elementi ?? []).filter((e) => C.visibile(e.stato, vista)).map((e) => ({ id: e.id, tipo: e.tipo, posizione: e.centro, stato: e.stato }));
    return percorsiDaElementi(visibili, dati.locali.map((l) => l.contorno));
  }, [pianta, vista, dati]);
  const totaliLinee = useMemo(() => {
    const t = new Map<string, number>();
    for (const p of impianti.percorsi) t.set(p.linea, (t.get(p.linea) ?? 0) + p.lunghezzaCm);
    return t;
  }, [impianti]);
  const NOMI_LINEE: Record<string, string> = { elettrica: "Elettrico", acqua: "Acqua", scarico: "Scarichi", frigorifera: "Rame clima", condensa: "Condensa", riscaldamento: "Riscaldamento" };
  const NOMI_PARTENZE: Record<string, string> = { quadro_elettrico: "il quadro elettrico", collettore: "il collettore (o la caldaia)", colonna_scarico: "la colonna di scarico", unita_esterna: "l'unità esterna del clima", generatore: "la caldaia o la pompa di calore (Arredi → Energia)" };

  const barraVista = (
    <div className="inline-flex rounded-md border bg-background p-0.5 text-sm" role="radiogroup" aria-label="Quale pianta">
      {(
        [
          ["fatto", "Com'è oggi"],
          ["progetto", "Progetto"],
        ] as const
      ).map(([v, etichetta]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={vista === v}
          onClick={() => cambiaVista(v)}
          className={cn("rounded px-3 py-1.5 font-medium transition-colors", vista === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
        >
          {etichetta}
        </button>
      ))}
    </div>
  );

  const zoom = (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Rimpicciolisci" onClick={() => zoomAttorno(1 / 1.25, { x: dimensioni.w / 2, y: dimensioni.h / 2 })}>
        <Minus />
      </Button>
      <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Ingrandisci" onClick={() => zoomAttorno(1.25, { x: dimensioni.w / 2, y: dimensioni.h / 2 })}>
        <Plus />
      </Button>
      <Button size="sm" variant="outline" onClick={adatta} aria-label="Vedi tutta la pianta">
        <Maximize2 /> <span className="hidden lg:inline">Tutta</span>
      </Button>
    </div>
  );

  const annullaRipeti = (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" onClick={annullaPasso} disabled={!storia.passato.length} aria-label="Annulla">
        <Undo2 /> <span className="hidden sm:inline">Annulla</span>
      </Button>
      <Button size="sm" variant="outline" onClick={ripetiPasso} disabled={!storia.futuro.length} aria-label="Ripeti">
        <Redo2 /> <span className="hidden sm:inline">Ripeti</span>
      </Button>
    </div>
  );

  return (
    <div className={cn("flex h-full min-h-[480px] flex-col overflow-hidden rounded-lg border bg-background", className)}>
      {/* barra in alto */}
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        {!sola && (
          <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Cosa vuoi fare">
            <BottoneStrumento attivo={strumento === "seleziona"} onClick={() => setStrumento("seleziona")} icona={<MousePointer2 />} etichetta="Seleziona" />
            <BottoneStrumento attivo={strumento === "stanza"} onClick={() => setStrumento("stanza")} icona={<Square />} etichetta="Stanza" />
            <StanzaDaMisure
              onAggiungi={(w, l, nome, destinazione) => {
                const r = C.aggiungiStanzaDaMisure(storia.presente, w, l, { nome, destinazione, stato: C.statoNuovo(vista) });
                applica(r.pianta);
                setStrumento("seleziona");
                setSelezione({ tipo: "locale", id: r.id });
                setTimeout(adatta, 0);
              }}
            />
            <BottoneStrumento attivo={strumento === "poligono"} onClick={() => setStrumento("poligono")} icona={<Hexagon />} etichetta="Stanza libera" titolo="Una stanza di qualunque forma: clic su ogni angolo" />
            <BottoneStrumento attivo={strumento === "parete"} onClick={() => setStrumento("parete")} icona={<PenLine />} etichetta="Parete" />
            <BottoneStrumento
              attivo={strumento === "porta"}
              onPointerDown={trascinaDallaBarra("porta")}
              icona={<DoorOpen />}
              etichetta="Porta"
              titolo="Trascinala su una parete"
            />
            <BottoneStrumento
              attivo={strumento === "finestra"}
              onPointerDown={trascinaDallaBarra("finestra")}
              icona={<AppWindow />}
              etichetta="Finestra"
              titolo="Trascinala su una parete"
            />
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <StrumentoEsterni
              attivo={strumento === "area"}
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
            />
            <BottoneStrumento attivo={strumento === "quota"} onClick={() => setStrumento("quota")} icona={<MoveHorizontal />} etichetta="Quota" titolo="Misura fra due punti" />
            <BottoneStrumento attivo={strumento === "testo"} onClick={() => setStrumento("testo")} icona={<Type />} etichetta="Testo" />
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!sola && (
            <SfondoDaRicalcare
              ricalco={ricalco}
              onCambia={setRicalco}
              onCarica={async (file) => {
                const proporzione = await new Promise<number>((ok, ko) => {
                  const img = new Image();
                  const u = URL.createObjectURL(file);
                  img.onload = () => { ok(img.naturalHeight / Math.max(1, img.naturalWidth)); URL.revokeObjectURL(u); };
                  img.onerror = () => ko(new Error("Immagine non leggibile."));
                  img.src = u;
                });
                const percorso = archivio ? await archivio.carica(file) : URL.createObjectURL(file);
                setRicalco({ percorso, x: 0, y: 0, larghezzaCm: ricalco?.larghezzaCm ?? 3000, proporzione, opacita: 0.5 });
              }}
              calibrando={calibra !== null}
              onCalibra={() => { setCalibra([]); setAvviso("Clicca due punti dell'immagine di cui conosci la distanza (per esempio i due capi di una quota o di un lato del lotto)."); }}
            />
          )}
          {!sola && (
            <BarraPiani
              livelli={documento.livelli.map((l) => ({ id: l.id, nome: l.nome, quota: l.quota, tetto: l.tetto }))}
              livelloId={livelloId ?? documento.livelli[0]?.id}
              onScegli={(id) => vaiAlPiano(id)}
              onNuovo={nuovoPiano}
              onModifica={modificaPiano}
              onTogli={togliPiano}
            />
          )}
          {barraVista}
          {!sola && vista === "progetto" && livelloCorrente && livelloCorrente.proposte.length > 0 && (
            <BarraProposte
              proposte={livelloCorrente.proposte.map((x) => ({ id: x.id, nome: x.nome }))}
              propostaId={propostaId}
              onScegli={(id) => vaiAllaProposta(id)}
              onNuova={nuovaProposta}
              onRinomina={rinominaPropostaCorrente}
              onTogli={togliPropostaCorrente}
            />
          )}
          {!sola && (
            <Button size="sm" variant={mostraLinee ? "default" : "outline"} aria-pressed={mostraLinee} onClick={() => setMostraLinee((v) => !v)} title="Percorsi stimati di cavi, tubi e linee del clima">
              Linee impianti
            </Button>
          )}
          {annullaRipeti}
          {!telefono && zoom}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* disegno */}
        <div ref={contenitoreRef} className="relative min-h-0 min-w-0 flex-1" style={{ cursor: cursore }}>
          <TelaPlanimetria
            ref={svgRef}
            pianta={pianta}
            dati={dati}
            latiModificabili={latiModificabili}
            misureSoloSelezione={sola}
            vista={vista}
            selezione={selezione}
            gruppo={gruppo}
            lineeImpianti={mostraLinee ? impianti.percorsi : undefined}
            sfondo={sfondo}
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

          {vuota && !sola && strumento === "seleziona" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="pointer-events-auto max-w-sm rounded-lg border bg-background/95 p-5 text-center shadow-sm">
                <p className="font-semibold">Comincia dalla prima stanza</p>
                <p className="mt-1 text-sm text-muted-foreground">Disegnala trascinando sul foglio, oppure scrivi le misure. Le altre stanze si attaccano da sole.</p>
                <div className="mt-3 flex justify-center gap-2">
                  <Button size="sm" onClick={() => setStrumento("stanza")}>
                    <Square /> Disegna una stanza
                  </Button>
                </div>
              </div>
            </div>
          )}
          {vuota && sola && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
              La pianta è vuota. Si disegna dal computer.
            </div>
          )}

          {misura && (
            <CasellaMisura
              key={misura.chiave}
              misura={misura}
              onChiudi={() => setMisura(null)}
            />
          )}

          {mostraLinee && (
            <div className="pointer-events-none absolute right-2 top-2 max-w-xs space-y-1 rounded-md bg-background/95 p-2 text-xs shadow-sm">
              <p className="font-semibold">Linee impianti (stima, con 10% di sfrido)</p>
              {[...totaliLinee].map(([l, cm]) => (
                <p key={l} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: COLORI_LINEE[l] }} />{NOMI_LINEE[l] ?? l}: {metriConSfrido(cm).toLocaleString("it-IT")} m</p>
              ))}
              {!totaliLinee.size && !impianti.mancano.length && <p className="text-muted-foreground">Metti prese, sanitari o split (dal pannello della stanza o da Arredi → Impianti).</p>}
              {impianti.mancano.map((m) => <p key={m} className="text-amber-700">Manca {NOMI_PARTENZE[m]} (Arredi → Impianti): senza, quella linea non si stima.</p>)}
            </div>
          )}

          {avviso && (
            <div role="status" className="absolute bottom-12 left-1/2 max-w-md -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">
              {avviso}
            </div>
          )}

          {telefono && <div className="absolute bottom-2 right-2">{zoom}</div>}
        </div>

        {/* pannello */}
        {!telefono && (
          <aside className="w-72 shrink-0 overflow-y-auto border-l p-3 xl:w-80">
            {C.quantiNelGruppo(gruppo) > 0 ? (
              <PannelloGruppo gruppo={gruppo} onAzione={azioneGruppo} />
            ) : (
              <PannelloDettagli pianta={pianta} dati={dati} latiModificabili={latiModificabili} vista={vista} selezione={selezione} azioni={azioni} focusNome={selezione?.tipo === "locale" && selezione.id === stanzaNuova} essenziale={sola} />
            )}
          </aside>
        )}
      </div>

      {telefono && selezione && (
        <div className="max-h-[42vh] overflow-y-auto border-t bg-background p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setSelezione(null)}>
              Chiudi
            </Button>
          </div>
          <PannelloDettagli pianta={pianta} dati={dati} latiModificabili={latiModificabili} vista={vista} selezione={selezione} azioni={azioni} essenziale />
        </div>
      )}

      {!sola && <div className="border-t bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">{SUGGERIMENTI[strumento]}</div>}
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

function BarraPiani({ livelli, livelloId, onScegli, onNuovo, onModifica, onTogli }: {
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
                  <Select value={attuale.tetto?.tipo ?? "nessuno"} onValueChange={(v) => onModifica({ tetto: v === "nessuno" ? null : { tipo: v as Tetto["tipo"], pendenza: attuale.tetto?.pendenza ?? 30, sporto: attuale.tetto?.sporto ?? 50 } })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nessuno">Nessuno (c'è un piano sopra)</SelectItem>
                      <SelectItem value="due_falde">A due falde</SelectItem>
                      <SelectItem value="padiglione">A padiglione (quattro falde)</SelectItem>
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
function SfondoDaRicalcare({ ricalco, onCambia, onCarica, calibrando, onCalibra }: {
  ricalco: Ricalco | null;
  onCambia: (r: Ricalco | null) => void;
  onCarica: (file: File) => Promise<void>;
  calibrando: boolean;
  onCalibra: () => void;
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
        <p className="text-sm font-semibold">Immagine da ricalcare</p>
        <p className="text-xs text-muted-foreground">Carica la mappa del terreno, una foto aerea o un rilievo, mettila in scala e ricalca sopra lotto, casa, vialetti. Si salva con questo piano.</p>
        <Input type="file" accept="image/png,image/jpeg,image/webp" disabled={caricando}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setCaricando(true); setErrore(null);
            try { await onCarica(f); } catch (err) { setErrore(err instanceof Error ? err.message : "Immagine non caricata."); } finally { setCaricando(false); }
          }} />
        {caricando && <p className="text-xs text-muted-foreground">Carico l'immagine…</p>}
        {errore && <p className="text-xs text-destructive">{errore}</p>}
        {ricalco && (
          <>
            <div className="grid grid-cols-[1fr_6rem] items-end gap-2">
              <Label className="text-xs" htmlFor="sfondo-larghezza">Larghezza reale (m)</Label>
              <Input id="sfondo-larghezza" key={`l-${ricalco.larghezzaCm}`} defaultValue={String(ricalco.larghezzaCm / 100).replace(".", ",")} inputMode="decimal"
                onBlur={(e) => { const v = numero(e.target.value); if (v && v > 0 && Math.round(v * 100) !== ricalco.larghezzaCm) onCambia({ ...ricalco, larghezzaCm: Math.round(v * 100) }); }} />
            </div>
            <Button size="sm" variant="outline" className="w-full" onClick={() => { onCalibra(); setAperto(false); }} disabled={calibrando}>
              {calibrando ? "Clicca i due punti sul foglio…" : "Metti in scala con due punti"}
            </Button>
            <div className="space-y-1">
              <Label className="text-xs">Trasparenza</Label>
              <input type="range" min={0.1} max={1} step={0.05} value={ricalco.opacita} className="w-full" onChange={(e) => onCambia({ ...ricalco, opacita: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Sposta a destra (m)</Label>
                <Input key={`x-${ricalco.x}`} defaultValue={String(ricalco.x / 100)} inputMode="decimal" onBlur={(e) => { const v = numero(e.target.value); if (v != null) onCambia({ ...ricalco, x: Math.round(v * 100) }); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sposta in basso (m)</Label>
                <Input key={`y-${ricalco.y}`} defaultValue={String(-ricalco.y / 100)} inputMode="decimal" onBlur={(e) => { const v = numero(e.target.value); if (v != null) onCambia({ ...ricalco, y: -Math.round(v * 100) }); }} />
              </div>
            </div>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onCambia(null)}>Togli l'immagine</Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Lotto e aree esterne: si sceglie cosa disegnare, poi clic sugli angoli. */
function StrumentoEsterni({ attivo, tipo, onScegli }: { attivo: boolean; tipo: TipoArea; onScegli: (t: TipoArea) => void }) {
  const [aperto, setAperto] = useState(false);
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={attivo ? "default" : "outline"} aria-pressed={attivo} title="Lotto, prato, vialetti, ghiaia, parcheggio">
          <Trees />
          <span className="hidden lg:inline">Esterni</span>
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
      </PopoverContent>
    </Popover>
  );
}

function CatalogoArredi({ attivo, onScegli }: { attivo: boolean; onScegli: (voce: VoceCatalogo) => void }) {
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
      <PopoverContent className="w-72" align="start">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            aggiungi();
          }}
        >
          <p className="text-sm font-semibold">Nuova stanza a misure</p>
          <div className="space-y-1">
            <Label>Che stanza è</Label>
            <Select value={destinazione} onValueChange={(v) => setDestinazione(v as Destinazione)}>
              <SelectTrigger>
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
              <Input id="pl-larghezza" inputMode="decimal" placeholder="3,50" value={larghezza} onChange={(e) => setLarghezza(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-lunghezza">Lunghezza (m)</Label>
              <Input id="pl-lunghezza" inputMode="decimal" placeholder="4,00" value={lunghezza} onChange={(e) => setLunghezza(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Misure interne, da muro a muro. La stanza si mette accanto alle altre.</p>
          {errore && <p className="text-xs text-destructive">Scrivi larghezza e lunghezza, almeno 0,50 m ciascuna.</p>}
          <Button type="submit" size="sm" className="w-full">
            Aggiungi la stanza
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

