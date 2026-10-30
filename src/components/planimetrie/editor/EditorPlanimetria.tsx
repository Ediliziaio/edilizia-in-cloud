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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import { AppWindow, DoorOpen, Maximize2, Minus, MousePointer2, PenLine, Plus, Redo2, Square, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { DESTINAZIONI, piantaVuota, type Destinazione, type Pianta, type Punto, type TipoApertura } from "./adattatore";
import * as C from "./comandi";
import { aggancia, angoliEsistenti, direzione, dist, muroPiuVicino } from "./geometria";
import { leggiMisura, scriviMetri } from "./misure";
import { PannelloDettagli, type AzioniPannello } from "./PannelloDettagli";
import { annulla, esegui, nuovaStoria, ripeti, type Storia } from "./storia";
import { TelaPlanimetria, type Camera, type Selezione, type Sovrapposizioni } from "./TelaPlanimetria";

export type Strumento = "seleziona" | "stanza" | "parete" | "porta" | "finestra";

interface Props {
  piantaIniziale?: Pianta;
  onChange?: (pianta: Pianta) => void;
  /** Forza la vista da telefono (solo guardare e correggere misure). */
  soloVista?: boolean;
  className?: string;
}

type Gesto =
  | { tipo: "pan"; da: Punto; camera: Camera; mosso: boolean; bersaglio: Bersaglio | null }
  | { tipo: "pinch"; distanza: number; centro: Punto; camera: Camera }
  | { tipo: "rettangolo"; a: Punto }
  | { tipo: "sposta-muro"; id: string; da: Punto; base: Pianta; normale: Punto }
  | { tipo: "maniglia"; id: string; da: Punto; altro: Punto; base: Pianta }
  | { tipo: "sposta-apertura"; id: string; base: Pianta; da: Punto; mosso: boolean; eraSelezionata: boolean }
  | { tipo: "apertura-nuova"; quale: TipoApertura; da: Punto; mosso: boolean };

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
  seleziona: "Tocca una stanza, una parete o una porta per vederne le misure. Trascina una parete per spostarla. Clic su una misura per correggerla.",
  stanza: "Trascina per disegnare la stanza: le misure compaiono mentre la disegni. Oppure usa «Scrivi le misure».",
  parete: "Clic per l'inizio, clic per la fine: la parete va dritta da sola. Puoi anche scrivere la lunghezza e premere Invio. Esc per finire.",
  porta: "Trascina la porta su una parete (o clicca sulla parete). Poi un clic sulla porta selezionata ne gira il verso.",
  finestra: "Trascina la finestra su una parete (o clicca sulla parete).",
};

export default function EditorPlanimetria({ piantaIniziale, onChange, soloVista, className }: Props) {
  const telefono = useIsMobile();
  const sola = soloVista ?? telefono;

  const [storia, setStoria] = useState<Storia>(() => nuovaStoria(piantaIniziale ?? piantaVuota()));
  const [anteprima, setAnteprima] = useState<Pianta | null>(null);
  const pianta = anteprima ?? storia.presente;
  const [strumento, setStrumentoStato] = useState<Strumento>("seleziona");
  const [vista, setVista] = useState<C.Vista>("fatto");
  const [selezione, setSelezione] = useState<Selezione | null>(null);
  const [focusNome, setFocusNome] = useState(false);
  const [camera, setCamera] = useState<Camera>({ s: 0.8, tx: 80, ty: 80 });
  const [dimensioni, setDimensioni] = useState({ w: 800, h: 560 });
  const [sovrapposizioni, setSovrapposizioni] = useState<Sovrapposizioni>({});
  const [inizioParete, setInizioParete] = useState<Punto | null>(null);
  const [misura, setMisura] = useState<MisuraInModifica | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const gesto = useRef<Gesto | null>(null);
  const puntatori = useRef(new Map<number, Punto>());
  const ultimoCursore = useRef<Punto | null>(null);
  const spazioPremuto = useRef(false);

  // Riferimenti sempre aggiornati per i gestori registrati una volta sola.
  const stato = useRef({ pianta, camera, strumento, vista, selezione, inizioParete, storia });
  stato.current = { pianta, camera, strumento, vista, selezione, inizioParete, storia };

  useEffect(() => {
    onChange?.(storia.presente);
  }, [storia.presente, onChange]);

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
    setSovrapposizioni({});
    setMisura(null);
    if (s !== "seleziona") setSelezione(null);
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

    if (str === "stanza") {
      const a = aggancia(pi, p, { tolleranza: tolleranza() });
      gesto.current = { tipo: "rettangolo", a: a.punto };
      setSovrapposizioni({ rettangolo: { a: a.punto, b: a.punto }, aggancio: a });
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
      applica(r.pianta);
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

    // seleziona
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
    if (b.tipo === "locale" && b.id) {
      setSelezione({ tipo: "locale", id: b.id });
      return pan();
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
        else if ((b.tipo === "muro" || b.tipo === "locale" || b.tipo === "apertura") && b.id) setSelezione({ tipo: b.tipo, id: b.id });
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
      setFocusNome(true);
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

  const sovrapposizioniRef = useRef(sovrapposizioni);
  sovrapposizioniRef.current = sovrapposizioni;
  const anteprimaRef = useRef(anteprima);
  anteprimaRef.current = anteprima;

  // ─── porta e finestra trascinate dalla barra ──────────────────────────────
  const trascinaDallaBarra = (quale: TipoApertura) => (e: ReactPointerEvent<HTMLButtonElement>) => {
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
        sel.tipo === "muro" ? C.eliminaMuro(base, sel.id, v) : sel.tipo === "apertura" ? C.eliminaApertura(base, sel.id, v) : C.eliminaLocale(base, sel.id, v);
      applica(nuova);
      if (!nuova.muri.some((m) => m.id === sel.id) && !nuova.aperture.some((a) => a.id === sel.id) && !nuova.locali.some((l) => l.id === sel.id)) {
        setSelezione(null);
      }
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
      applica(r.pianta);
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
  }, [sola, elimina, setStrumento, pareteScritta]);

  // la selezione sparisce se non si vede più (annulla, cambio di vista)
  useEffect(() => {
    if (!selezione) return;
    const esiste =
      selezione.tipo === "muro"
        ? pianta.muri.find((m) => m.id === selezione.id)
        : selezione.tipo === "apertura"
          ? pianta.aperture.find((a) => a.id === selezione.id)
          : pianta.locali.find((l) => l.id === selezione.id);
    if (!esiste || !C.visibile(esiste.stato, vista)) setSelezione(null);
  }, [pianta, selezione, vista]);

  useEffect(() => {
    if (focusNome) {
      const t = setTimeout(() => setFocusNome(false), 300);
      return () => clearTimeout(t);
    }
  }, [focusNome]);

  // ─── azioni del pannello ──────────────────────────────────────────────────
  const azioni: AzioniPannello = useMemo(() => {
    const p = () => stato.current.storia.presente;
    return {
      nomeStanza: (id, nome) => applica(C.modificaLocale(p(), id, { nome })),
      destinazioneStanza: (id, d) => {
        const l = p().locali.find((x) => x.id === id);
        const etichetta = DESTINAZIONI.find((x) => x.valore === d)?.etichetta.split(" /")[0];
        // se il nome era quello automatico, prende quello della destinazione
        const nome = l && /^Stanza \d+$/.test(l.nome) && etichetta && d !== "altro" ? nomeUnico(p(), etichetta) : undefined;
        applica(C.modificaLocale(p(), id, nome ? { destinazione: d, nome } : { destinazione: d }));
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
        } else applica(C.confermaMisura(p(), sel.tipo, sel.id));
      },
      confermaTutte: () => applica(C.confermaTutte(p())),
      seleziona: setSelezione,
    };
  }, [applica, elimina]);

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
    strumento === "stanza" || strumento === "parete" ? "crosshair" : strumento === "porta" || strumento === "finestra" ? "copy" : "default";

  // ─── interfaccia ──────────────────────────────────────────────────────────
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
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {barraVista}
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
            vista={vista}
            selezione={selezione}
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
            <PannelloDettagli pianta={pianta} vista={vista} selezione={selezione} azioni={azioni} focusNome={focusNome} essenziale={sola} />
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
          <PannelloDettagli pianta={pianta} vista={vista} selezione={selezione} azioni={azioni} essenziale />
        </div>
      )}

      {!sola && <div className="border-t bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">{SUGGERIMENTI[strumento]}</div>}
    </div>
  );
}

function sulLato(m: { p1: Punto; p2: Punto }, a: Punto, b: Punto) {
  const su = (p: Punto) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / (dist(a, b) || 1) < 0.5;
  return su(m.p1) && su(m.p2);
}

function nomeUnico(pianta: Pianta, base: string) {
  if (!pianta.locali.some((l) => l.nome === base)) return base;
  let n = 2;
  while (pianta.locali.some((l) => l.nome === `${base} ${n}`)) n++;
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

