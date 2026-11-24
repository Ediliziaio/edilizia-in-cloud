import { FvFotoSolar } from "./tetto/FvFotoSolar";
import { FvGoogleSolarPanel } from "./tetto/FvGoogleSolarPanel";
import { FvVerificaMisure } from "./tetto/FvVerificaMisure";
import type { FotoSolarFv } from "../../../supabase/functions/_shared/fvGoogleSolar";
import { type PointerEvent, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import "./FvMappaTetto.css";
import {
  type DimensioniMappaGoogleFv,
  MappaGoogleFv,
  type StatoMappaGoogleFv,
} from "./tetto/MappaGoogleFv";
import {
  Hand,
  LocateFixed,
  MapPin,
  Minus,
  MousePointer2,
  PenTool,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  coordinateDaMetri,
  coordinateDaPixel,
  type MappaFv,
  metriDaCoordinate,
  pixelDaCoordinate,
  type PosizioneMappaFv,
  rettangoloRuotatoFv,
} from "../../../supabase/functions/_shared/fvMappa";
import {
  areaPoligono,
  type DisegnoCommercialeFv,
  poligonoValido,
  type PuntoFv,
} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { erroreFaldeMappaFv, pianoDaMappaFv } from "./tetto/mappaGeometria";
import { agganciaPuntoFv, impostaLunghezzaLatoFv } from "./tetto/aggancioMappa";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export type RiferimentoTettoFv = {
  posizione: PosizioneMappaFv;
  ricerca: { indirizzo: string; posizione: PosizioneMappaFv };
};

type Props = {
  progettoId?: string | null;
  ricerca: PosizioneMappaFv;
  indirizzo: string;
  riferimento: RiferimentoTettoFv | null;
  piano: DisegnoCommercialeFv | null;
  modificabile: boolean;
  onPosizione: (r: RiferimentoTettoFv) => void;
  onChange: (p: DisegnoCommercialeFv) => void;
};
const num = (x: number) =>
  x.toLocaleString(intlCampo(), { maximumFractionDigits: 2 });
type TrascinamentoFalda =
  | { tipo: "vertice"; fid: string; i: number; punti: PuntoFv[] }
  | { tipo: "falda"; fid: string; ancora: PuntoFv; punti: PuntoFv[] };
const entroLimiti = (ps: PuntoFv[]) =>
  ps.every((p) =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 400 &&
    Math.abs(p.y) <= 400
  );
export function FvMappaTetto(
  {
    ricerca,
    progettoId,
    indirizzo,
    riferimento,
    piano,
    modificabile,
    onPosizione,
    onChange,
  }: Props,
) {
  const tr = useT();
  const mappaCompatta = useIsMobile(1024);
  const [centro, aggiornaCentro] = useState(
      riferimento?.posizione ?? piano?.mappa?.origine ?? ricerca,
    ),
    [zoom, aggiornaZoom] = useState(20),
    [pin, setPin] = useState(
      riferimento?.posizione ?? piano?.mappa?.origine ?? ricerca,
    );
  const [fotoSolar,setFotoSolar]=useState<FotoSolarFv|undefined>(piano?.mappa?.fotoSolar);
  const [comandoVista, setComandoVista] = useState(0);
  const setCentro: typeof aggiornaCentro = (v) => {
    aggiornaCentro(v);
    setComandoVista((n) => n + 1);
  };
  const setZoom: typeof aggiornaZoom = (v) => {
    aggiornaZoom(v);
    setComandoVista((n) => n + 1);
  };
  const [falde, setFalde] = useState<MappaFv["falde"]>(
      piano?.mappa?.falde ?? [],
    ),
    [attiva, setAttiva] = useState(piano?.mappa?.falde[0]?.id ?? "");
  const [tool, setTool] = useState<
      "pin" | "poligono" | "modifica" | "sposta"
    >(
      riferimento || piano?.mappa ? "modifica" : "sposta",
    ),
    [punti, setPunti] = useState<PuntoFv[]>([]),
    [errore, setErrore] = useState("");
  const [vertice, setVertice] = useState(0);
  const [aggancio, setAggancio] = useState(true);
  const [guidaAggancio, setGuidaAggancio] = useState("");
  const [lunghezzaLato, setLunghezzaLato] = useState("");
  const [spostamento, setSpostamento] = useState({ x: 0, y: 0 });
  const [cursore, setCursore] = useState<PuntoFv | null>(null);
  const vistaDrag = useRef<
    { x: number; y: number; centro: PosizioneMappaFv } | null
  >(null);
  const pinDrag = useRef<
    {
      iniziale: PosizioneMappaFv;
      posizione: PosizioneMappaFv;
      ancora: PosizioneMappaFv;
    } | null
  >(null);
  const [larghezza, setLarghezza] = useState(12),
    [altezza, setAltezza] = useState(8),
    [rotazione, setRotazione] = useState(0),
    [bordo, setBordo] = useState(piano?.distanzaBordo ?? .3),
    [ostacoli, setOstacoli] = useState(piano?.mappa?.distanzaOstacoli ?? .3);
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<TrascinamentoFalda | null>(null);
  const [satellite, setSatellite] = useState<StatoMappaGoogleFv>({
    caricando: true,
    pronto: false,
    errore: "",
  });
  const [dimensioni, setDimensioni] = useState<DimensioniMappaGoogleFv>({
    w: 640,
    h: 440,
  });
  const [tentativoMappa, setTentativoMappa] = useState(0);
  const origineConfermata = riferimento?.posizione ?? piano?.mappa?.origine ??
      pin,
    origine = pin,
    confermato = (!!riferimento || !!piano?.mappa) &&
      Math.abs(pin.lat - origineConfermata.lat) < 1e-8 &&
      Math.abs(pin.lng - origineConfermata.lng) < 1e-8;
  const selezionata = falde.find((f) => f.id === attiva);
  const erroreGeometria = erroreFaldeMappaFv(falde);
  const contorniInvariati = piano?.mappa &&
    JSON.stringify(piano.mappa.falde) === JSON.stringify(falde) &&
    piano.mappa.distanzaOstacoli === ostacoli && piano.distanzaBordo === bordo;
  const mantieniPannelli = contorniInvariati && !!piano?.pannelli.length;
  const schermo = (p: PuntoFv) =>
    pixelDaCoordinate(
      coordinateDaMetri(p, origine),
      centro,
      zoom,
      dimensioni.w,
      dimensioni.h,
    );
  const serializza = (ps: PuntoFv[]) =>
    ps.map((p) => {
      const q = schermo(p);
      return `${q.x},${q.y}`;
    }).join(" ");
  const aggancia = (p: PuntoFv, precedenti: PuntoFv[], escludi?: { fid: string; i: number }) => {
    if (!aggancio) return p;
    const centroMetri = metriDaCoordinate(centro, origine);
    const pixelMetri = metriDaCoordinate(coordinateDaPixel({ x: dimensioni.w / 2 + 8, y: dimensioni.h / 2 }, centro, zoom, dimensioni.w, dimensioni.h), origine);
    const tolleranza = Math.min(.75, Math.hypot(pixelMetri.x - centroMetri.x, pixelMetri.y - centroMetri.y));
    const vertici = [...falde.flatMap(f => f.punti.filter((_, i) => f.id !== escludi?.fid || i !== escludi.i)), ...(!escludi ? punti : [])];
    const direzione = precedenti.length >= 2 ? { x: precedenti[1].x - precedenti[0].x, y: precedenti[1].y - precedenti[0].y } : undefined;
    const r = agganciaPuntoFv(p, vertici, precedenti.at(-1), tolleranza, direzione);
    setGuidaAggancio(r.tipo === "vertice" ? tr("Aggancio a un vertice") : r.tipo ? tr("Lato allineato") : "");
    return r.punto;
  };
  const posizione = (e: PointerEvent) => {
    const el = svg.current!, r = el.getBoundingClientRect();
    return coordinateDaPixel(
      {
        x: (e.clientX - r.left) * dimensioni.w / r.width,
        y: (e.clientY - r.top) * dimensioni.h / r.height,
      },
      centro,
      zoom,
      dimensioni.w,
      dimensioni.h,
    );
  };
  const aggiungi = (ps: PuntoFv[]) => {
    if (!modificabile) return;
    if (falde.length >= 12) {
      setErrore(tr("Puoi inserire fino a 12 falde."));
      return;
    }
    if (!entroLimiti(ps) || !poligonoValido(ps)) {
      setErrore(
        tr("Traccia almeno tre vertici, senza incroci, entro 400 m dal pin e con superficie di almeno 0,5 m²."),
      );
      return;
    }
    const f = {
      id: crypto.randomUUID(),
      nome: `Falda ${falde.length + 1}`,
      punti: ps,
      inclinazione: 30,
      azimut: 180,
      inclinazioneStimata: true,
    };
    setFalde((v) => [...v, f]);
    setAttiva(f.id);
    setPunti([]);
    setTool("modifica");
    setErrore("");
  };
  const modifica = (patch: Partial<MappaFv["falde"][number]>) => {
    if (modificabile) {
      setFalde((v) => v.map((f) => f.id === attiva ? { ...f, ...patch, ...("punti" in patch || "inclinazione" in patch || "azimut" in patch ? { misuraSolar: undefined } : {}) } : f));
    }
  };
  const aggiornaPunti = (fid: string, ps: PuntoFv[]) => {
    if (!entroLimiti(ps)) {
      setErrore(tr("Mantieni la falda entro 400 m dal pin."));
      return;
    }
    setErrore("");
    setFalde((v) => v.map((f) => f.id === fid ? { ...f, punti: ps, misuraSolar: undefined } : f));
  };
  const annullaTrascinamento = () => {
    const d = drag.current;
    if (d) {
      setFalde((v) =>
        v.map((f) => f.id === d.fid ? { ...f, punti: d.punti } : f)
      );
    }
    drag.current = null;
  };
  const finisciSpostamento = (e: PointerEvent) => {
    if (vistaDrag.current && svg.current) {
      const r = svg.current.getBoundingClientRect(), d = vistaDrag.current;
      const dx = (e.clientX - d.x) * dimensioni.w / r.width,
        dy = (e.clientY - d.y) * dimensioni.h / r.height;
      if (Math.hypot(dx, dy) > 2) {
        setCentro(
          coordinateDaPixel(
            { x: dimensioni.w / 2 - dx, y: dimensioni.h / 2 - dy },
            d.centro,
            zoom,
            dimensioni.w,
            dimensioni.h,
          ),
        );
      }
    }
    vistaDrag.current = null;
    pinDrag.current = null;
    drag.current = null;
    setSpostamento({ x: 0, y: 0 });
  };
  const salva = () => {
    try {
      const mappa: MappaFv = {
        versione: 1,
        origine,
        ricerca: riferimento?.ricerca ?? { indirizzo, posizione: ricerca },
        falde,
        distanzaOstacoli: ostacoli,
        fotoSolar,
      };
      const next = piano && piano.mappa && contorniInvariati
        ? { ...piano, mappa: { ...piano.mappa, ...mappa } }
        : pianoDaMappaFv(
          mappa,
          piano?.modulo ?? { corto: 1.134, lungo: 1.762, stimato: true },
        );
      // Solo nuovi contorni o margini richiedono una nuova disposizione dei pannelli.
      onChange({ ...next, distanzaBordo: bordo, confermaMisure: piano?.confermaMisure });
      setErrore("");
    } catch (e) {
      setErrore(
        e instanceof Error ? e.message : tr("Controlla il disegno delle falde."),
      );
    }
  };
  return (
    <section
      className="fv-mappa-editor mb-3 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3 lg:p-4 [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11"
      aria-label={tr("Selezione tetto e falde sulla mappa")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {tr("Tetto sulla mappa")}
          </h3>
          <p className="mt-0.5 break-words text-xs text-slate-500">{indirizzo}</p>
        </div>
        <ol
          className="hidden flex-wrap gap-2 text-xs lg:flex"
          aria-label={tr("Passaggi del disegno")}
        >
          {["1. Trova il tetto", "2. Traccia le falde", "3. Conferma"].map((
            v,
            i,
          ) => (
            <li
              key={v}
              className={`rounded-full px-3 py-2 ${
                i === (confermato ? (falde.length ? 2 : 1) : 0)
                  ? "bg-orange-100 font-medium text-orange-900"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {tr(v)}
            </li>
          ))}
        </ol>
      </div>
      <div className="fv-mappa-lavoro mt-3">
        <div className="fv-mappa-principale">
          <div className="fv-mappa-strumenti">
            <div
              className="fv-mappa-tools"
              role="toolbar"
              aria-label={tr("Strumenti della mappa")}
            >
              <Button
                type="button"
                variant={tool === "sposta" ? "default" : "outline"}
                aria-pressed={tool === "sposta"}
                aria-label={tr("Sposta mappa")}
                onClick={() => setTool("sposta")}
              >
                <Hand aria-hidden="true" className="size-4 shrink-0" /><span className="fv-comando-breve">{tr("Mappa")}</span><span className="fv-comando-esteso">{tr("Sposta mappa")}</span>
              </Button>
              <Button
                type="button"
                variant={tool === "pin" ? "default" : "outline"}
                aria-pressed={tool === "pin"}
                aria-label={tr("Scegli o sposta il pin")}
                disabled={!modificabile}
                onClick={() => setTool("pin")}
              >
                <MapPin aria-hidden="true" className="size-4 shrink-0" /><span className="fv-comando-breve">{tr("Pin")}</span><span className="fv-comando-esteso">{tr("Pin del tetto")}</span>
              </Button>
              <Button
                type="button"
                variant={tool === "poligono" ? "default" : "outline"}
                aria-pressed={tool === "poligono"}
                aria-label={tr("Disegna falda")}
                disabled={!modificabile || !confermato}
                onClick={() => {
                  setTool("poligono");
                  setPunti([]);
                  setCursore(null);
                }}
              >
                <PenTool aria-hidden="true" className="size-4 shrink-0" /><span className="fv-comando-breve">{tr("Disegna")}</span><span className="fv-comando-esteso">{tr("Disegna falda")}</span>
              </Button>
              <Button
                type="button"
                variant={tool === "modifica" ? "default" : "outline"}
                aria-pressed={tool === "modifica"}
                aria-label={tr("Seleziona e sposta")}
                disabled={!confermato}
                onClick={() => setTool("modifica")}
              >
                <MousePointer2 aria-hidden="true" className="size-4 shrink-0" /><span className="fv-comando-breve">{tr("Modifica")}</span><span className="fv-comando-esteso">{tr("Modifica falde")}</span>
              </Button>

            </div>
            <div className="fv-mappa-aiuto">
              <p role="status" className="text-xs leading-relaxed text-slate-600">
                {tool === "poligono"
                  ? punti.length >= 3
                    ? tr("{n} punti · tocca «Chiudi falda» o il primo punto per crearla.", { n: punti.length })
                    : punti.length ? tr(punti.length === 1 ? "{n} punto · tocca gli angoli, uno per uno." : "{n} punti · tocca gli angoli, uno per uno.", { n: punti.length }) : tr("Tocca gli angoli della falda, uno per uno.")
                  : tool === "pin"
                  ? falde.length ? tr("Sposta il pin. Le falde lo seguono.") : tr("Tocca il tetto per posizionare il pin.")
                  : tool === "sposta"
                  ? satellite.pronto && mappaCompatta ? tr("Usa due dita per spostare la mappa.") : tr("Trascina la mappa.")
                  : falde.length ? tr("Trascina la falda o i suoi vertici.") : tr("Scegli «Disegna falda» e tocca gli angoli.")}
              </p>
              {(!confermato || tool === "pin") && (
                <Button
                  type="button"
                  disabled={!modificabile}
                  onClick={() => {
                    if (!confermato) {
                      onPosizione({
                        posizione: pin,
                        ricerca: { indirizzo, posizione: ricerca },
                      });
                    }
                    setTool("modifica");
                  }}
                >
                  {tr("Conferma tetto")}
                </Button>
              )}
              {!confermato && (riferimento || piano?.mappa) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!modificabile}
                  onClick={() => {
                    setPin(origineConfermata);
                    setTool("modifica");
                    setErrore("");
                  }}
                >
                  {tr("Annulla spostamento del tetto")}
                </Button>
              )}
              {tool === "poligono" && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!punti.length}
                    onClick={() => setPunti((v) => v.slice(0, -1))}
                  >
                    {tr("Annulla vertice")}
                  </Button>
                  <Button
                    type="button"
                    disabled={punti.length < 3}
                    onClick={() => aggiungi(punti)}
                  >
                    {tr("Chiudi falda")}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="fv-mappa-vista">
            {satellite.caricando && (
              <p role="status">{tr("Caricamento della vista satellitare…")}</p>
            )}
            {satellite.errore && (
              <p role="status" className="mb-3 text-sm text-amber-800">
                {satellite.errore}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    setTentativoMappa((t) =>
                      t + 1
                    )}
                >
                  {tr("Riprova mappa")}
                </button>
              </p>
            )}
            <div
              className="fv-mappa-canvas rounded-xl border bg-slate-100"
            >
              <MappaGoogleFv
                key={tentativoMappa}
                centro={centro}
                zoom={zoom}
                comandoVista={comandoVista}
                navigabile={tool === "sposta"}
                gestoCooperativo={mappaCompatta}
                onStato={setSatellite}
                onDimensioni={(d) =>
                  setDimensioni((p) =>
                    Math.abs(p.w - d.w) < .5 && Math.abs(p.h - d.h) < .5 ? p : d
                  )}
                onVista={(c, z) => {
                  aggiornaCentro((p) =>
                    Math.abs(p.lat - c.lat) < 1e-9 &&
                      Math.abs(p.lng - c.lng) < 1e-9
                      ? p
                      : c
                  );
                  aggiornaZoom(z);
                }}
              />
              <FvFotoSolar foto={fotoSolar} centro={centro} zoom={zoom} w={dimensioni.w} h={dimensioni.h}/>
              <svg
                ref={svg}
                viewBox={`0 0 ${dimensioni.w} ${dimensioni.h}`}
                className="absolute inset-0 h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                style={{
                  display: "block",
                  background: "transparent",
                  clipPath: satellite.pronto ? "inset(0 0 28px 0)" : undefined,
                  pointerEvents: satellite.pronto && tool === "sposta"
                    ? "none"
                    : "auto",
                  touchAction: "none",
                  cursor: tool === "sposta"
                    ? "grab"
                    : tool === "pin" || tool === "poligono"
                    ? "crosshair"
                    : "default",
                }}
                tabIndex={0}
                role="group"
                aria-label={tr("Mappa satellitare: scegli il tetto o disegna una falda")}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    annullaTrascinamento();
                    vistaDrag.current = null;
                    if (pinDrag.current) setPin(pinDrag.current.iniziale);
                    pinDrag.current = null;
                    setSpostamento({ x: 0, y: 0 });
                    setPunti([]);
                    setCursore(null);
                    setTool("modifica");
                  }
                  if (e.target !== e.currentTarget) return;
                  if (
                    modificabile && tool === "poligono" && e.key === "Enter" &&
                    punti.length >= 3
                  ) {
                    e.preventDefault();
                    aggiungi(punti);
                  }
                  if (
                    modificabile && tool === "poligono" &&
                    (e.key === "Backspace" || e.key === "Delete")
                  ) {
                    e.preventDefault();
                    setPunti((v) => v.slice(0, -1));
                  }
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  if (tool === "sposta") {
                    vistaDrag.current = { x: e.clientX, y: e.clientY, centro };
                    svg.current?.setPointerCapture(e.pointerId);
                    return;
                  }
                  if (!modificabile) return;
                  const p = posizione(e);
                  if (tool === "pin") {
                    setPin(p);
                    pinDrag.current = { iniziale: pin, posizione: p, ancora: p };
                    svg.current?.setPointerCapture(e.pointerId);
                    return;
                  }
                  if (tool === "poligono" && punti.length < 64) {
                    const pixel = pixelDaCoordinate(
                        p,
                        centro,
                        zoom,
                        dimensioni.w,
                        dimensioni.h,
                      ),
                      primo = punti.length ? schermo(punti[0]) : null;
                    if (
                      punti.length >= 3 && primo &&
                      Math.hypot(pixel.x - primo.x, pixel.y - primo.y) <= (e.pointerType === "touch" ? 20 : 12)
                    ) {
                      aggiungi(punti);
                      return;
                    }
                    const prossimo = e.altKey ? metriDaCoordinate(p, origine) : aggancia(metriDaCoordinate(p, origine), punti);
                    setPunti((v) => [...v, prossimo]);
                  }
                }}
                onPointerMove={(e) => {
                  if (vistaDrag.current && svg.current) {
                    const r = svg.current.getBoundingClientRect(),
                      d = vistaDrag.current;
                    setSpostamento({
                      x: (e.clientX - d.x) * dimensioni.w / r.width,
                      y: (e.clientY - d.y) * dimensioni.h / r.height,
                    });
                    return;
                  }
                  if (!modificabile) return;
                  if (pinDrag.current) {
                    const d = pinDrag.current;
                    setPin(
                      coordinateDaMetri(
                        metriDaCoordinate(posizione(e), d.ancora),
                        d.posizione,
                      ),
                    );
                    return;
                  }
                  if (tool === "poligono") {
                    setCursore(
                      e.altKey ? metriDaCoordinate(posizione(e), origine) : aggancia(metriDaCoordinate(posizione(e), origine), punti),
                    );
                  }
                  if (!drag.current) return;
                  const d = drag.current,
                    grezzo = metriDaCoordinate(posizione(e), origine),
                    p = d.tipo === "vertice" && !e.altKey
                      ? aggancia(grezzo, [d.punti[(d.i + d.punti.length - 2) % d.punti.length], d.punti[(d.i + d.punti.length - 1) % d.punti.length]], { fid: d.fid, i: d.i }) : grezzo;
                  aggiornaPunti(
                    d.fid,
                    d.tipo === "vertice"
                      ? d.punti.map((q, i) => i === d.i ? p : q)
                      : d.punti.map((q) => ({
                        x: q.x + p.x - d.ancora.x,
                        y: q.y + p.y - d.ancora.y,
                      })),
                  );
                }}
                onPointerUp={finisciSpostamento}
                onPointerCancel={() => {
                  vistaDrag.current = null;
                  if (pinDrag.current) setPin(pinDrag.current.iniziale);
                  pinDrag.current = null;
                  annullaTrascinamento();
                  setSpostamento({ x: 0, y: 0 });
                }}
              >
                <g transform={`translate(${spostamento.x} ${spostamento.y})`}>
                  {falde.map((f) => (
                    <g key={f.id}>
                      <polygon
                        points={serializza(f.punti)}
                        role="button"
                        tabIndex={0}
                        aria-label={tr("{nome}: trascina per spostare", { nome: String(f.nome ?? "") })}
                        aria-pressed={f.id === attiva}
                        style={{
                          cursor:
                            modificabile && tool === "modifica" && confermato
                              ? "grab"
                              : undefined,
                        }}
                        fill={f.id === attiva ? "#f9731633" : "#10b98122"}
                        stroke={f.id === attiva ? "#fb923c" : "#34d399"}
                        strokeWidth={2}
                        onPointerDown={(e) => {
                          if (
                            e.button === 0 && tool === "modifica" && confermato
                          ) {
                            e.stopPropagation();
                            setAttiva(f.id);
                            if (modificabile) {
                              drag.current = {
                                tipo: "falda",
                                fid: f.id,
                                ancora: metriDaCoordinate(posizione(e), origine),
                                punti: f.punti,
                              };
                              svg.current?.setPointerCapture(e.pointerId);
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setAttiva(f.id);
                          }
                          if (
                            !modificabile || tool !== "modifica" || !confermato
                          ) return;
                          const passo = e.shiftKey ? 1 : .1;
                          const mosse: Record<string, PuntoFv> = {
                            ArrowLeft: { x: -passo, y: 0 },
                            ArrowRight: { x: passo, y: 0 },
                            ArrowUp: { x: 0, y: passo },
                            ArrowDown: { x: 0, y: -passo },
                          };
                          const d = mosse[e.key];
                          if (d) {
                            e.preventDefault();
                            aggiornaPunti(
                              f.id,
                              f.punti.map((p) => ({
                                x: p.x + d.x,
                                y: p.y + d.y,
                              })),
                            );
                          }
                        }}
                      />
                      {f.id === attiva && tool === "modifica" && confermato &&
                        f.punti.map((p, i) => {
                          const q = schermo(p);
                          return (
                            <g
                              key={i}
                              tabIndex={0}
                              role="button"
                              aria-label={tr("{nome}, vertice {i}", { nome: String(f.nome ?? ""), i: i + 1 })}
                              style={{
                                cursor: modificabile && tool === "modifica" &&
                                    confermato
                                  ? "move"
                                  : undefined,
                              }}
                              onPointerDown={(e) => {
                                if (
                                  e.button !== 0 || !modificabile ||
                                  tool !== "modifica" || !confermato
                                ) return;
                                e.stopPropagation();
                                setAttiva(f.id);
                                drag.current = {
                                  tipo: "vertice",
                                  fid: f.id,
                                  i,
                                  punti: f.punti,
                                };
                                svg.current?.setPointerCapture(e.pointerId);
                              }}
                              onKeyDown={(e) => {
                                if (
                                  !modificabile || tool !== "modifica" ||
                                  !confermato
                                ) return;
                                const moves: Record<string, PuntoFv> = {
                                  ArrowLeft: { x: -.1, y: 0 },
                                  ArrowRight: { x: .1, y: 0 },
                                  ArrowUp: { x: 0, y: .1 },
                                  ArrowDown: { x: 0, y: -.1 },
                                };
                                if (moves[e.key]) {
                                  e.preventDefault();
                                  const d = moves[e.key];
                                  aggiornaPunti(
                                    f.id,
                                    f.punti.map((r, j) =>
                                      j === i ? { x: r.x + d.x, y: r.y + d.y } : r
                                    ),
                                  );
                                }
                              }}
                            >
                              <circle
                                cx={q.x}
                                cy={q.y}
                                r={22}
                                fill="transparent"
                              />
                              <circle
                                cx={q.x}
                                cy={q.y}
                                r={5}
                                fill="white"
                                stroke="#0f766e"
                                pointerEvents="none"
                              />
                            </g>
                          );
                        })}
                    </g>
                  ))}
                  {punti.length > 0 && (
                    <polyline
                      points={serializza(cursore ? [...punti, cursore] : punti)}
                      fill="none"
                      stroke="#f97316"
                      strokeWidth={2}
                    />
                  )}
                  {tool === "poligono" && punti.map((p, i) => {
                    const q = schermo(p);
                    return (
                      <circle
                        key={i}
                        cx={q.x}
                        cy={q.y}
                        r={i === 0 ? 7 : 4}
                        fill={i === 0 ? "#f97316" : "white"}
                        stroke="white"
                        strokeWidth={2}
                      />
                    );
                  })}
                  {(() => {
                    const q = pixelDaCoordinate(
                      pin,
                      centro,
                      zoom,
                      dimensioni.w,
                      dimensioni.h,
                    );
                    return (
                      <g
                        transform={`translate(${q.x} ${q.y})`}
                        role="button"
                        tabIndex={0}
                        aria-label={tr("Pin del tetto")}
                        style={{ cursor: modificabile ? "grab" : undefined }}
                        onPointerDown={(e) => {
                          if (
                            e.button !== 0 || !modificabile ||
                            (tool !== "pin" && tool !== "modifica")
                          ) return;
                          e.stopPropagation();
                          setTool("pin");
                          pinDrag.current = {
                            iniziale: pin,
                            posizione: pin,
                            ancora: posizione(e),
                          };
                          svg.current?.setPointerCapture(e.pointerId);
                        }}
                        onKeyDown={(e) => {
                          if (!modificabile) return;
                          const passo = e.shiftKey ? 1 : .1;
                          const mosse: Record<string, PuntoFv> = {
                            ArrowLeft: { x: -passo, y: 0 },
                            ArrowRight: { x: passo, y: 0 },
                            ArrowUp: { x: 0, y: passo },
                            ArrowDown: { x: 0, y: -passo },
                          };
                          const d = mosse[e.key];
                          if (d) {
                            e.preventDefault();
                            setTool("pin");
                            setPin(coordinateDaMetri(d, pin));
                          }
                        }}
                      >
                        <circle cy={-16} r={22} fill="transparent" />
                        <path
                          d="M0 0C-4 -7 -12 -13 -12 -22A12 12 0 0 1 12 -22C12 -13 4 -7 0 0Z"
                          fill="#ef4444"
                          stroke="white"
                          strokeWidth={2}
                        />
                        <circle cy={-22} r={4} fill="white" />
                      </g>
                    );
                  })()}
                </g>
              </svg>
              <div className="fv-mappa-zoom">
                <Button
                  type="button"
                  variant="outline"
                  aria-label={tr("Avvicina")}
                  disabled={zoom >= 21}
                  onClick={() => setZoom((z) => z + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={tr("Allontana")}
                  disabled={zoom <= 17}
                  onClick={() => setZoom((z) => z - 1)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={tr("Centra sul tetto")}
                  onClick={() => setCentro(pin)}
                >
                  <LocateFixed className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {satellite.pronto ? tr("Google Maps · Nord in alto") : tr("Schema metrico · Verifica sul posto")}
              {fotoSolar && <span>{" "}{tr("· Foto Google Solar del {data}", { data: String(fotoSolar.data ?? "") })}</span>}
            </p>
            {(errore || erroreGeometria) && (
              <p role="alert" className="mt-2 text-xs text-red-700">{errore || erroreGeometria}</p>
            )}
          </div>
            {confermato && falde.length > 0 && (
              <div className="fv-mappa-conferma">
                    <Button
                      type="button"
                      className="w-full whitespace-normal"
                      disabled={!modificabile || !!erroreGeometria}
                      onClick={salva}
                      aria-label={mantieniPannelli ? tr("Conferma falde e mantieni i pannelli") : tr("Usa falde e prepara nuova disposizione")}
                    >
                      {tr("Conferma falde")}
                    </Button>
                    <p className="text-xs text-slate-600">
                      {contorniInvariati ? tr("Falde confermate") : tr("Falde da confermare")}
                    </p>
              </div>
            )}
        </div>
          <div className="fv-mappa-dettagli">
            <details className="mb-3">
              <summary className="cursor-pointer text-sm font-semibold">{tr("Foto e misure Google Solar")}</summary>
          <FvGoogleSolarPanel progettoId={progettoId} posizione={pin} mappa={{versione:1,origine,ricerca:{indirizzo,posizione:ricerca},falde,distanzaOstacoli:ostacoli,fotoSolar}} modificabile={modificabile} pannelli={piano?.pannelli.length??0}
            onFoto={foto=>{setFotoSolar(foto);if(piano?.mappa&&contorniInvariati)onChange({...piano,mappa:{...piano.mappa,fotoSolar:foto}});}}
            onMisure={misure => {
              if ((piano?.pannelli.length ?? 0) > 0) return;
              setFalde(misure.falde);
              const next = pianoDaMappaFv({ versione: 1, origine, ricerca: { indirizzo, posizione: ricerca }, falde: misure.falde, distanzaOstacoli: ostacoli, fotoSolar }, piano?.modulo ?? { corto: 1.134, lungo: 1.762, stimato: true });
              const schema3d = misure.altezza != null ? { ...piano?.schema3d, altezza: misure.altezza, pendenza: piano?.schema3d?.pendenza ?? 20 } : piano?.schema3d;
              onChange({ ...next, distanzaBordo: bordo, schema3d, confermaMisure: piano?.confermaMisure });
            }}/>
            </details>
          {piano && contorniInvariati && <FvVerificaMisure piano={piano} modificabile={modificabile} onChange={onChange} />}
          <h4 className="mb-3 mt-3 text-sm font-semibold text-slate-900">
            {tr("Il tuo tetto")}
          </h4>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm">{tr("Opzioni di disegno")}</summary>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input type="checkbox" checked={aggancio} onChange={e => setAggancio(e.target.checked)} />
              {tr("Aggancia vertici e allinea i lati")}
            </label>
            {guidaAggancio && <p role="status" className="text-xs text-emerald-800">{guidaAggancio}</p>}
          </details>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm">
              {tr("Coordinate del tetto e misure rilevate")}
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(["lat", "lng"] as const).map((k) => (
                <label key={k} className="text-sm">
                  {k === "lat" ? tr("Latitudine") : tr("Longitudine")}
                  <Input
                    aria-label={tr("Pin {k}", { k: String(k ?? "") })}
                    type="number"
                    step="any"
                    value={pin[k]}
                    disabled={!modificabile}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (
                        Number.isFinite(n) &&
                        Math.abs(n) <= (k === "lat" ? 80 : 180)
                      ) {
                        setPin((p) => ({ ...p, [k]: n }));
                      }
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
          {confermato && (
            <>
              <details className="my-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-600">
                  {tr("Misure precise e rotazione della falda")}
                </summary>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-sm">
                    {tr("Larghezza in pianta (m)")}<Input
                      aria-label={tr("Larghezza rettangolo falda")}
                      type="number"
                      min={1}
                      max={100}
                      value={larghezza}
                      disabled={!modificabile}
                      onChange={(e) => setLarghezza(Number(e.target.value))}
                    />
                  </label>
                  <label className="text-sm">
                    {tr("Lunghezza in pianta (m)")}<Input
                      aria-label={tr("Lunghezza rettangolo falda")}
                      type="number"
                      min={1}
                      max={100}
                      value={altezza}
                      disabled={!modificabile}
                      onChange={(e) => setAltezza(Number(e.target.value))}
                    />
                  </label>
                  <label className="text-sm">
                    {tr("Rotazione rettangolo (°)")}<Input
                      aria-label={tr("Rotazione rettangolo falda")}
                      type="number"
                      min={-180}
                      max={180}
                      value={rotazione}
                      disabled={!modificabile}
                      onChange={(e) => setRotazione(Number(e.target.value))}
                    />
                  </label>
                  {/* Ripiego quando la mappa satellitare non si carica: la falda
                      si crea digitando le misure, senza disegnare sulla mappa. */}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!modificabile ||
                      !(larghezza >= 1 && larghezza <= 100 && altezza >= 1 &&
                        altezza <= 100 && Math.abs(rotazione) <= 180)}
                    onClick={() =>
                      aggiungi(
                        rettangoloRuotatoFv(
                          metriDaCoordinate(centro, origine),
                          larghezza,
                          altezza,
                          rotazione,
                        ),
                      )}
                  >
                    {tr("Aggiungi rettangolo ruotato")}
                  </Button>
                </div>
              </details>
              {falde.length > 0 && (
                <>
                  <label className="block text-sm">
                    {tr("Falda da verificare")}<select
                      aria-label={tr("Falda sulla mappa")}
                      className="ml-2 rounded border p-2"
                      value={attiva}
                      onChange={(e) => {
                        setAttiva(e.target.value);
                        setVertice(0);
                      }}
                    >
                      {falde.map((f) => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </select>
                  </label>
                  {selezionata && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-orange-50 p-3">
                      <span className="text-sm font-medium text-slate-900">
                        {selezionata.nome} · {num(
                          areaPoligono(selezionata.punti) /
                            Math.cos(selezionata.inclinazione * Math.PI / 180),
                        )} m²
                      </span>
                      <label className="text-sm">
                        {tr("Pendenza")}{" "}
                        <select
                          aria-label={tr("Pendenza rapida della falda")}
                          className="ml-2 rounded-lg border bg-white p-2"
                          value={selezionata.inclinazione}
                          disabled={!modificabile}
                          onChange={(e) =>
                            modifica({
                              inclinazione: Number(e.target.value),
                              inclinazioneStimata: false,
                            })}
                        >
                          {[0, 15, 30, 45].map((v) => (
                            <option key={v} value={v}>
                              {v === 0 ? tr("Piatta") : `${v}°`}
                            </option>
                          ))}
                          {![0, 15, 30, 45].includes(
                            selezionata.inclinazione,
                          ) && (
                            <option value={selezionata.inclinazione}>
                              {selezionata.inclinazione}°
                            </option>
                          )}
                        </select>
                      </label>
                      <label className="text-sm">
                        {tr("Esposta a")}{" "}
                        <select
                          aria-label={tr("Esposizione rapida della falda")}
                          className="ml-2 rounded-lg border bg-white p-2"
                          value={selezionata.azimut}
                          disabled={!modificabile}
                          onChange={(e) =>
                            modifica({ azimut: Number(e.target.value) })}
                        >
                          {[
                            "Nord",
                            "Nord-est",
                            "Est",
                            "Sud-est",
                            "Sud",
                            "Sud-ovest",
                            "Ovest",
                            "Nord-ovest",
                          ].map((v, i) => (
                            <option key={v} value={i * 45}>{tr(v)}</option>
                          ))}
                          {selezionata.azimut % 45 !== 0 && (
                            <option value={selezionata.azimut}>
                              {selezionata.azimut}°
                            </option>
                          )}
                        </select>
                      </label>
                      {selezionata.inclinazioneStimata && (
                        <span className="text-xs text-amber-800">
                          {tr("Pendenza da verificare")}
                        </span>
                      )}
                    </div>
                  )}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-slate-600">
                      {tr("Vertici, distanze e dati tecnici")}
                    </summary>
                    {selezionata && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="text-sm">
                          {tr("Inclinazione (°)")}<Input
                            aria-label={tr("Inclinazione della falda")}
                            type="number"
                            min={0}
                            max={75}
                            value={selezionata.inclinazione}
                            disabled={!modificabile}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (n >= 0 && n <= 75) {
                                modifica({
                                  inclinazione: n,
                                  inclinazioneStimata: false,
                                });
                              }
                            }}
                          />
                        </label>
                        <label className="text-sm">
                          {tr("Orientamento (0° nord, 180° sud)")}<Input
                            aria-label={tr("Azimut della falda")}
                            type="number"
                            min={0}
                            max={359.9}
                            value={selezionata.azimut}
                            disabled={!modificabile}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (n >= 0 && n < 360) modifica({ azimut: n });
                            }}
                          />
                        </label>
                        <div className="text-sm">
                          {tr("Pianta:")}{" "}
                          <strong>
                            {num(areaPoligono(selezionata.punti))} m²
                          </strong>
                          <br />{tr("Falda inclinata:")}{" "}
                          <strong>
                            {num(
                              areaPoligono(selezionata.punti) /
                                Math.cos(
                                  selezionata.inclinazione * Math.PI / 180,
                                ),
                            )} m²
                          </strong>
                          <br />
                          {selezionata.inclinazioneStimata
                            ? tr("Inclinazione ipotizzata: verifica sul posto")
                            : tr("Inclinazione indicata dall’operatore")}
                        </div>
                        <div className="sm:col-span-3 text-xs text-slate-600">
                          {tr("Lati in pianta:")} {selezionata.punti.map((p, i) => {
                            const q = selezionata
                              .punti[(i + 1) % selezionata.punti.length];
                            return `${num(Math.hypot(q.x - p.x, q.y - p.y))} m`;
                          }).join(" · ")}
                        </div>
                        <div className="sm:col-span-3 grid gap-3 sm:grid-cols-3">
                          <label className="text-sm">
                            {tr("Vertice da spostare")}<select
                              aria-label={tr("Vertice della falda")}
                              className="block w-full rounded border p-2"
                              value={Math.min(
                                vertice,
                                selezionata.punti.length - 1,
                              )}
                              onChange={(e) =>
                                setVertice(Number(e.target.value))}
                            >
                              {selezionata.punti.map((_, i) => (
                                <option key={i} value={i}>{tr("Vertice {i}", { i: i + 1 })}</option>
                              ))}
                            </select>
                          </label>
                          {(["x", "y"] as const).map((k) => (
                            <label key={k} className="text-sm">
                              {k === "x" ? tr("Est dal pin (m)") : tr("Nord dal pin (m)")}<Input
                                aria-label={tr("Vertice {k} metri dal pin", { k: String(k ?? "") })}
                                type="number"
                                step={.1}
                                value={selezionata
                                  .punti[
                                    Math.min(
                                      vertice,
                                      selezionata.punti.length - 1,
                                    )
                                  ][k]}
                                disabled={!modificabile}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (
                                    Number.isFinite(n) && Math.abs(n) <= 400
                                  ) {
                                    modifica({
                                      punti: selezionata.punti.map((p, i) =>
                                        i ===
                                            Math.min(
                                              vertice,
                                              selezionata.punti.length - 1,
                                            )
                                          ? { ...p, [k]: n }
                                          : p
                                      ),
                                    });
                                  }
                                }}
                              />
                            </label>
                          ))}
                        </div>
                        <div className="sm:col-span-3 rounded-lg border bg-white p-3 text-xs">
                          <label>{tr("Lunghezza del lato dal vertice {n} al successivo (m)", { n: Math.min(vertice, selezionata.punti.length - 1) + 1 })}<Input aria-label={tr("Lunghezza lato selezionato in pianta")} type="number" min={.1} max={400} step={.01} value={lunghezzaLato} placeholder={tr("Nuova quota in pianta")} disabled={!modificabile} onChange={e => setLunghezzaLato(e.target.value)} /></label>
                          <Button type="button" variant="outline" className="mt-2 w-full" disabled={!modificabile || !lunghezzaLato} onClick={() => {
                            try { modifica({ punti: impostaLunghezzaLatoFv(selezionata.punti, Math.min(vertice, selezionata.punti.length - 1), Number(lunghezzaLato)) }); setLunghezzaLato(""); setErrore(""); }
                            catch (e) { setErrore(e instanceof Error ? e.message : tr("Controlla la quota del lato.")); }
                          }}>{tr("Applica quota al lato")}</Button>
                          <p className="mt-2 text-slate-500">{tr("Sposta solo il vertice successivo nella direzione del lato. Controlla i lati vicini e riconferma la nuova posa.")}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!modificabile ||
                            !(larghezza >= 1 && larghezza <= 100 &&
                              altezza >= 1 &&
                              altezza <= 100)}
                          onClick={() => {
                            const c = selezionata.punti.reduce(
                              (a, p) => ({
                                x: a.x + p.x / selezionata.punti.length,
                                y: a.y + p.y / selezionata.punti.length,
                              }),
                              { x: 0, y: 0 },
                            );
                            modifica({
                              punti: rettangoloRuotatoFv(
                                c,
                                larghezza,
                                altezza,
                                rotazione,
                              ),
                            });
                          }}
                        >
                          {tr("Applica misure e rotazione alla falda")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!modificabile}
                          onClick={() => {
                            setFalde((v) => v.filter((f) => f.id !== attiva));
                            setAttiva(
                              falde.find((f) => f.id !== attiva)?.id ?? "",
                            );
                          }}
                        >
                          {tr("Rimuovi falda selezionata")}
                        </Button>
                      </div>
                    )}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        {tr("Distanza dai bordi (m)")}<Input
                          aria-label={tr("Margine bordi mappa")}
                          type="number"
                          min={0}
                          max={2}
                          step={.05}
                          value={bordo}
                          disabled={!modificabile}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (n >= 0 && n <= 2) setBordo(n);
                          }}
                        />
                      </label>
                      <label className="text-sm">
                        {tr("Distanza dagli ostacoli (m)")}<Input
                          aria-label={tr("Margine ostacoli mappa")}
                          type="number"
                          min={0}
                          max={5}
                          step={.05}
                          value={ostacoli}
                          disabled={!modificabile}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (n >= 0 && n <= 5) setOstacoli(n);
                          }}
                        />
                      </label>
                    </div>
                  </details>


                </>
              )}
            </>
          )}
          </div>
      </div>
    </section>
  );
}
