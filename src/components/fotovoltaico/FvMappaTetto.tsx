import { type PointerEvent, useRef, useState } from "react";
import { useSatelliteFv } from "./tetto/useSatelliteFv";
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
import { pianoDaMappaFv } from "./tetto/mappaGeometria";

export type RiferimentoTettoFv = {
  posizione: PosizioneMappaFv;
  ricerca: { indirizzo: string; posizione: PosizioneMappaFv };
};

type Props = {
  ricerca: PosizioneMappaFv;
  indirizzo: string;
  riferimento: RiferimentoTettoFv | null;
  piano: DisegnoCommercialeFv | null;
  modificabile: boolean;
  onPosizione: (r: RiferimentoTettoFv) => void;
  onChange: (p: DisegnoCommercialeFv) => void;
};
const num = (x: number) =>
  x.toLocaleString("it-IT", { maximumFractionDigits: 2 });
export function FvMappaTetto(
  {
    ricerca,
    indirizzo,
    riferimento,
    piano,
    modificabile,
    onPosizione,
    onChange,
  }: Props,
) {
  const [centro, setCentro] = useState(
      riferimento?.posizione ?? piano?.mappa?.origine ?? ricerca,
    ),
    [zoom, setZoom] = useState(20),
    [pin, setPin] = useState(
      riferimento?.posizione ?? piano?.mappa?.origine ?? ricerca,
    );
  const [falde, setFalde] = useState<MappaFv["falde"]>(
      piano?.mappa?.falde ?? [],
    ),
    [attiva, setAttiva] = useState(piano?.mappa?.falde[0]?.id ?? "");
  const [tool, setTool] = useState<"pin" | "poligono" | "modifica" | "sposta">(
      riferimento || piano?.mappa ? "modifica" : "sposta",
    ),
    [punti, setPunti] = useState<PuntoFv[]>([]),
    [errore, setErrore] = useState("");
  const [vertice, setVertice] = useState(0);
  const [spostamento, setSpostamento] = useState({ x: 0, y: 0 });
  const [cursore, setCursore] = useState<PuntoFv | null>(null);
  const vistaDrag = useRef<
    { x: number; y: number; centro: PosizioneMappaFv } | null
  >(null);
  const pinDrag = useRef(false);
  const [larghezza, setLarghezza] = useState(12),
    [altezza, setAltezza] = useState(8),
    [rotazione, setRotazione] = useState(0),
    [bordo, setBordo] = useState(piano?.distanzaBordo ?? .3),
    [ostacoli, setOstacoli] = useState(piano?.mappa?.distanzaOstacoli ?? .3);
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{ fid: string; i: number } | null>(null);
  const satellite = useSatelliteFv(centro, zoom),
    origine = riferimento?.posizione ?? piano?.mappa?.origine ?? pin,
    confermato = (!!riferimento || !!piano?.mappa) &&
      Math.abs(pin.lat - origine.lat) < 1e-8 &&
      Math.abs(pin.lng - origine.lng) < 1e-8;
  const selezionata = falde.find((f) => f.id === attiva);
  const schermo = (p: PuntoFv) =>
    pixelDaCoordinate(coordinateDaMetri(p, origine), centro, zoom);
  const serializza = (ps: PuntoFv[]) =>
    ps.map((p) => {
      const q = schermo(p);
      return `${q.x},${q.y}`;
    }).join(" ");
  const posizione = (e: PointerEvent) => {
    const el = svg.current!, r = el.getBoundingClientRect();
    return coordinateDaPixel(
      {
        x: (e.clientX - r.left) * 640 / r.width,
        y: (e.clientY - r.top) * 440 / r.height,
      },
      centro,
      zoom,
    );
  };
  const aggiungi = (ps: PuntoFv[]) => {
    if (!modificabile) return;
    if (falde.length >= 12) {
      setErrore("Puoi inserire fino a 12 falde.");
      return;
    }
    if (!poligonoValido(ps)) {
      setErrore(
        "Traccia almeno tre vertici, senza incroci e con superficie di almeno 0,5 m².",
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
      setFalde((v) => v.map((f) => f.id === attiva ? { ...f, ...patch } : f));
    }
  };
  const finisciSpostamento = (e: PointerEvent) => {
    if (vistaDrag.current && svg.current) {
      const r = svg.current.getBoundingClientRect(), d = vistaDrag.current;
      const dx = (e.clientX - d.x) * 640 / r.width,
        dy = (e.clientY - d.y) * 440 / r.height;
      if (Math.hypot(dx, dy) > 2) {
        setCentro(
          coordinateDaPixel({ x: 320 - dx, y: 220 - dy }, d.centro, zoom),
        );
      }
    }
    vistaDrag.current = null;
    pinDrag.current = false;
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
      };
      const next = pianoDaMappaFv(
        mappa,
        piano?.modulo ?? { corto: 1.134, lungo: 1.762, stimato: true },
      );
      // Modifica delle falde confermata esplicitamente: la disposizione sarà rigenerata sull'impianto.
      onChange({ ...next, distanzaBordo: bordo });
      setErrore("");
    } catch (e) {
      setErrore(
        e instanceof Error ? e.message : "Controlla il disegno delle falde.",
      );
    }
  };
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 mb-4 [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11"
      aria-label="Selezione tetto e falde sulla mappa"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Il tetto, direttamente sulla mappa
          </h3>
          <p className="mt-1 text-sm text-slate-500">{indirizzo}</p>
        </div>
        <ol
          className="flex flex-wrap gap-2 text-xs"
          aria-label="Passaggi del disegno"
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
              {v}
            </li>
          ))}
        </ol>
      </div>
      <div
        className="my-3 flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label="Strumenti della mappa"
      >
        <Button
          type="button"
          variant={tool === "sposta" ? "default" : "outline"}
          aria-pressed={tool === "sposta"}
          onClick={() => setTool("sposta")}
        >
          <Hand className="mr-2 h-4 w-4" />Sposta mappa
        </Button>
        <Button
          type="button"
          variant={tool === "pin" ? "default" : "outline"}
          aria-pressed={tool === "pin"}
          disabled={!modificabile}
          onClick={() => setTool("pin")}
        >
          <MapPin className="mr-2 h-4 w-4" />Scegli o sposta il pin
        </Button>
        <Button
          type="button"
          variant={tool === "poligono" ? "default" : "outline"}
          aria-pressed={tool === "poligono"}
          disabled={!modificabile || !confermato}
          onClick={() => {
            setTool("poligono");
            setPunti([]);
            setCursore(null);
          }}
        >
          <PenTool className="mr-2 h-4 w-4" />Disegna falda
        </Button>
        <Button
          type="button"
          variant={tool === "modifica" ? "default" : "outline"}
          aria-pressed={tool === "modifica"}
          disabled={!confermato}
          onClick={() => setTool("modifica")}
        >
          <MousePointer2 className="mr-2 h-4 w-4" />Seleziona
        </Button>
        <div className="ml-auto flex gap-1">
          <Button
            type="button"
            variant="outline"
            aria-label="Avvicina"
            disabled={zoom >= 21}
            onClick={() => setZoom((z) => z + 1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Allontana"
            disabled={zoom <= 17}
            onClick={() => setZoom((z) => z - 1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Centra sul tetto"
            onClick={() => setCentro(pin)}
          >
            <LocateFixed className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
        <p role="status" className="text-sm text-slate-700">
          {tool === "poligono"
            ? `${punti.length} vertici · clicca gli angoli e torna sul primo punto per chiudere.`
            : tool === "pin"
            ? "Clicca sul tetto o trascina il pin, poi conferma la posizione."
            : tool === "sposta"
            ? "Trascina la mappa per trovare l’edificio. Il pin indica il tetto scelto."
            : "Seleziona una falda e trascina i vertici per correggerla."}
        </p>
        {(!confermato || tool === "pin") && (
          <Button
            type="button"
            disabled={!modificabile}
            onClick={() => {
              onPosizione({
                posizione: pin,
                ricerca: { indirizzo, posizione: ricerca },
              });
              setFalde([]);
              setAttiva("");
              setTool("modifica");
            }}
          >
            Conferma tetto{piano?.mappa
              ? " e azzera il disegno precedente"
              : ""}
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
              Annulla vertice
            </Button>
            <Button
              type="button"
              disabled={punti.length < 3}
              onClick={() => aggiungi(punti)}
            >
              Chiudi falda
            </Button>
          </div>
        )}
      </div>
      <div className="mt-3 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {satellite.caricando && (
            <p role="status">Caricamento della vista satellitare…</p>
          )}
          {satellite.errore && (
            <p role="status" className="mb-3 text-sm text-amber-800">
              {satellite.errore}{" "}
              <button
                type="button"
                className="underline"
                onClick={satellite.riprova}
              >
                Riprova mappa
              </button>
            </p>
          )}
          <svg
            ref={svg}
            viewBox="0 0 640 440"
            className="w-full rounded-xl border bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            style={{
              aspectRatio: "640/440",
              maxWidth: 900,
              marginInline: "auto",
              display: "block",
              touchAction: "none",
              cursor: tool === "sposta"
                ? "grab"
                : tool === "pin" || tool === "poligono"
                ? "crosshair"
                : "default",
            }}
            tabIndex={0}
            role="group"
            aria-label="Mappa satellitare: scegli il tetto o disegna una falda"
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Escape") {
                setPunti([]);
                setCursore(null);
                setTool("modifica");
              }
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
                pinDrag.current = true;
                svg.current?.setPointerCapture(e.pointerId);
                return;
              }
              if (tool === "poligono" && punti.length < 64) {
                const pixel = pixelDaCoordinate(p, centro, zoom),
                  primo = punti.length ? schermo(punti[0]) : null;
                if (
                  punti.length >= 3 && primo &&
                  Math.hypot(pixel.x - primo.x, pixel.y - primo.y) <= 12
                ) {
                  aggiungi(punti);
                  return;
                }
                setPunti((v) => [...v, metriDaCoordinate(p, origine)]);
              }
            }}
            onPointerMove={(e) => {
              if (vistaDrag.current && svg.current) {
                const r = svg.current.getBoundingClientRect(),
                  d = vistaDrag.current;
                setSpostamento({
                  x: (e.clientX - d.x) * 640 / r.width,
                  y: (e.clientY - d.y) * 440 / r.height,
                });
                return;
              }
              if (!modificabile) return;
              if (pinDrag.current) {
                setPin(posizione(e));
                return;
              }
              if (tool === "poligono") {setCursore(
                  metriDaCoordinate(posizione(e), origine),
                );}
              if (!drag.current) return;
              const d = drag.current,
                p = metriDaCoordinate(posizione(e), origine);
              setFalde((v) =>
                v.map((f) =>
                  f.id === d.fid
                    ? { ...f, punti: f.punti.map((q, i) => i === d.i ? p : q) }
                    : f
                )
              );
            }}
            onPointerUp={finisciSpostamento}
            onPointerCancel={() => {
              vistaDrag.current = null;
              pinDrag.current = false;
              drag.current = null;
              setSpostamento({ x: 0, y: 0 });
            }}
          >
            <g transform={`translate(${spostamento.x} ${spostamento.y})`}>
              {satellite.url && (
                <image href={satellite.url} width={640} height={440} />
              )}
              {falde.map((f) => (
                <g key={f.id}>
                  <polygon
                    points={serializza(f.punti)}
                    fill={f.id === attiva ? "#f9731633" : "#10b98122"}
                    stroke={f.id === attiva ? "#fb923c" : "#34d399"}
                    strokeWidth={2}
                    onPointerDown={(e) => {
                      if (tool === "modifica") {
                        e.stopPropagation();
                        setAttiva(f.id);
                      }
                    }}
                  />
                  {f.punti.map((p, i) => {
                    const q = schermo(p);
                    return (
                      <circle
                        key={i}
                        cx={q.x}
                        cy={q.y}
                        r={5}
                        fill="white"
                        stroke="#0f766e"
                        tabIndex={0}
                        role="button"
                        aria-label={`${f.nome}, vertice ${i + 1}`}
                        onPointerDown={(e) => {
                          if (!modificabile || tool !== "modifica") return;
                          e.stopPropagation();
                          setAttiva(f.id);
                          drag.current = { fid: f.id, i };
                          svg.current?.setPointerCapture(e.pointerId);
                        }}
                        onKeyDown={(e) => {
                          if (!modificabile) return;
                          const moves: Record<string, PuntoFv> = {
                            ArrowLeft: { x: -.1, y: 0 },
                            ArrowRight: { x: .1, y: 0 },
                            ArrowUp: { x: 0, y: .1 },
                            ArrowDown: { x: 0, y: -.1 },
                          };
                          if (moves[e.key]) {
                            e.preventDefault();
                            const d = moves[e.key];
                            setFalde((v) =>
                              v.map((g) =>
                                g.id === f.id
                                  ? {
                                    ...g,
                                    punti: g.punti.map((r, j) =>
                                      j === i
                                        ? { x: r.x + d.x, y: r.y + d.y }
                                        : r
                                    ),
                                  }
                                  : g
                              )
                            );
                          }
                        }}
                      />
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
                const q = pixelDaCoordinate(pin, centro, zoom);
                return (
                  <g
                    transform={`translate(${q.x} ${q.y})`}
                    role="button"
                    aria-label="Pin del tetto"
                    onPointerDown={(e) => {
                      if (!modificabile) return;
                      e.stopPropagation();
                      setTool("pin");
                      pinDrag.current = true;
                      svg.current?.setPointerCapture(e.pointerId);
                    }}
                  >
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
          <p className="mt-2 text-xs text-slate-500">
            Nord in alto · {satellite.url
              ? "Immagine Google Maps, scala da coordinate geografiche"
              : "Schema metrico manuale: verifica le misure sul posto"}. Le
            immagini non sono salvate nel progetto.
          </p>
        </div>
        <aside className="min-w-0 rounded-xl bg-slate-50 p-3">
          <h4 className="mb-3 text-sm font-semibold text-slate-900">
            Il tuo tetto
          </h4>
          {!falde.length && (
            <p className="mb-3 text-sm text-slate-600">
              {confermato
                ? "Scegli Disegna falda e segui gli angoli del tetto. Puoi aggiungere più falde."
                : "Trova l’edificio e conferma il pin. Poi disegni le falde sulla mappa."}
            </p>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm">
              Coordinate del tetto e misure rilevate
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(["lat", "lng"] as const).map((k) => (
                <label key={k} className="text-sm">
                  {k === "lat" ? "Latitudine" : "Longitudine"}
                  <Input
                    aria-label={`Pin ${k}`}
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
                  Rettangolo rapido e misure precise
                </summary>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-sm">
                    Larghezza in pianta (m)<Input
                      aria-label="Larghezza rettangolo falda"
                      type="number"
                      min={1}
                      max={100}
                      value={larghezza}
                      disabled={!modificabile}
                      onChange={(e) => setLarghezza(Number(e.target.value))}
                    />
                  </label>
                  <label className="text-sm">
                    Lunghezza in pianta (m)<Input
                      aria-label="Lunghezza rettangolo falda"
                      type="number"
                      min={1}
                      max={100}
                      value={altezza}
                      disabled={!modificabile}
                      onChange={(e) => setAltezza(Number(e.target.value))}
                    />
                  </label>
                  <label className="text-sm">
                    Rotazione rettangolo (°)<Input
                      aria-label="Rotazione rettangolo falda"
                      type="number"
                      min={-180}
                      max={180}
                      value={rotazione}
                      disabled={!modificabile}
                      onChange={(e) => setRotazione(Number(e.target.value))}
                    />
                  </label>
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
                    Aggiungi rettangolo ruotato
                  </Button>
                </div>
              </details>
              {falde.length > 0 && (
                <>
                  <label className="block text-sm">
                    Falda da verificare<select
                      aria-label="Falda sulla mappa"
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
                        Pendenza{" "}
                        <select
                          aria-label="Pendenza rapida della falda"
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
                              {v === 0 ? "Piatta" : `${v}°`}
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
                        Esposta a{" "}
                        <select
                          aria-label="Esposizione rapida della falda"
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
                            <option key={v} value={i * 45}>{v}</option>
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
                          Pendenza da verificare
                        </span>
                      )}
                    </div>
                  )}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-slate-600">
                      Vertici, distanze e dati tecnici
                    </summary>
                    {selezionata && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="text-sm">
                          Inclinazione (°)<Input
                            aria-label="Inclinazione della falda"
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
                          Orientamento (0° nord, 180° sud)<Input
                            aria-label="Azimut della falda"
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
                          Pianta:{" "}
                          <strong>
                            {num(areaPoligono(selezionata.punti))} m²
                          </strong>
                          <br />Falda inclinata:{" "}
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
                            ? "Inclinazione ipotizzata: verifica sul posto"
                            : "Inclinazione indicata dall’operatore"}
                        </div>
                        <div className="sm:col-span-3 text-xs text-slate-600">
                          Lati in pianta: {selezionata.punti.map((p, i) => {
                            const q = selezionata
                              .punti[(i + 1) % selezionata.punti.length];
                            return `${num(Math.hypot(q.x - p.x, q.y - p.y))} m`;
                          }).join(" · ")}
                        </div>
                        <div className="sm:col-span-3 grid gap-3 sm:grid-cols-3">
                          <label className="text-sm">
                            Vertice da spostare<select
                              aria-label="Vertice della falda"
                              className="block w-full rounded border p-2"
                              value={Math.min(
                                vertice,
                                selezionata.punti.length - 1,
                              )}
                              onChange={(e) =>
                                setVertice(Number(e.target.value))}
                            >
                              {selezionata.punti.map((_, i) => (
                                <option key={i} value={i}>
                                  Vertice {i + 1}
                                </option>
                              ))}
                            </select>
                          </label>
                          {(["x", "y"] as const).map((k) => (
                            <label key={k} className="text-sm">
                              {k === "x" ? "Est" : "Nord"} dal pin (m)<Input
                                aria-label={`Vertice ${k} metri dal pin`}
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
                          Applica misure e rotazione alla falda
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
                          Rimuovi falda selezionata
                        </Button>
                      </div>
                    )}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        Distanza dai bordi (m)<Input
                          aria-label="Margine bordi mappa"
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
                        Distanza dagli ostacoli (m)<Input
                          aria-label="Margine ostacoli mappa"
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
                  <p className="mt-3 text-sm text-slate-600">
                    L’area disponibile per i moduli viene determinata dalla
                    disposizione effettiva, dopo bordi e ostacoli. Aggiungi
                    lucernari e camini nell’editor della fase Impianto.
                  </p>
                  <Button
                    type="button"
                    className="mt-3"
                    disabled={!modificabile}
                    onClick={salva}
                  >
                    Usa falde e prepara nuova disposizione
                  </Button>
                  <p className="mt-2 text-xs text-slate-500">
                    Confermando le falde la disposizione precedente viene
                    azzerata: nella fase Impianto scegli il modulo e calcola la
                    nuova posa.
                  </p>
                </>
              )}
            </>
          )}
        </aside>
      </div>
      {errore && (
        <p role="alert" className="mt-3 text-sm text-red-700">{errore}</p>
      )}
    </section>
  );
}
