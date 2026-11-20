import { type PointerEvent, useRef, useState } from "react";
import { useSatelliteFv } from "./tetto/useSatelliteFv";
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
  const [tool, setTool] = useState<"pin" | "poligono" | "modifica">(
      riferimento || piano?.mappa ? "modifica" : "pin",
    ),
    [punti, setPunti] = useState<PuntoFv[]>([]),
    [errore, setErrore] = useState("");
  const [vertice, setVertice] = useState(0);
  const [larghezza, setLarghezza] = useState(12),
    [altezza, setAltezza] = useState(8),
    [rotazione, setRotazione] = useState(0),
    [bordo, setBordo] = useState(piano?.distanzaBordo ?? .3),
    [ostacoli, setOstacoli] = useState(piano?.mappa?.distanzaOstacoli ?? .3);
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{ fid: string; i: number } | null>(null);
  const satellite = useSatelliteFv(centro, zoom),
    origine = riferimento?.posizione ?? piano?.mappa?.origine ?? pin,
    confermato = !!riferimento || !!piano?.mappa;
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
      <h3 className="font-semibold">Seleziona il tetto e disegna le falde</h3>
      <p className="mt-1 text-sm text-slate-600">
        Indirizzo cercato:{" "}
        {indirizzo}. Conferma il tetto effettivo: la posizione resta separata
        dall’indirizzo.
      </p>
      <div className="my-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!modificabile}
          onClick={() => setTool("pin")}
        >
          Scegli o sposta il pin
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!modificabile || tool !== "pin"}
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
          Conferma tetto{piano?.mappa ? " e azzera il disegno precedente" : ""}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={zoom >= 21}
          onClick={() => setZoom((z) => z + 1)}
        >
          Avvicina
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={zoom <= 17}
          onClick={() => setZoom((z) => z - 1)}
        >
          Allontana
        </Button>
        {([[-150, 0, "←"], [150, 0, "→"], [0, 100, "↑"], [
          0,
          -100,
          "↓",
        ]] as const).map(([x, y, t]) => (
          <Button
            key={t}
            type="button"
            variant="outline"
            aria-label={`Sposta vista ${t}`}
            onClick={() =>
              setCentro((c) =>
                coordinateDaPixel({ x: 320 + x, y: 220 - y }, c, zoom)
              )}
          >
            {t}
          </Button>
        ))}
      </div>
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
        className="w-full rounded-xl border bg-slate-100"
        style={{ aspectRatio: "640/440", touchAction: "none" }}
        role="group"
        aria-label="Mappa satellitare: scegli il tetto o disegna una falda"
        onPointerDown={(e) => {
          if (!modificabile) return;
          const p = posizione(e);
          if (tool === "pin") {
            setPin(p);
            return;
          }
          if (tool === "poligono" && punti.length < 64) {
            setPunti(
              (v) => [...v, metriDaCoordinate(p, origine)],
            );
          }
        }}
        onPointerMove={(e) => {
          if (!drag.current || !modificabile) return;
          const d = drag.current, p = metriDaCoordinate(posizione(e), origine);
          setFalde((v) =>
            v.map((f) =>
              f.id === d.fid
                ? { ...f, punti: f.punti.map((q, i) => i === d.i ? p : q) }
                : f
            )
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
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
                    e.stopPropagation();
                    if (!modificabile || tool !== "modifica") return;
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
                                j === i ? { x: r.x + d.x, y: r.y + d.y } : r
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
            points={serializza(punti)}
            fill="none"
            stroke="#f97316"
            strokeWidth={2}
          />
        )}
        {(() => {
          const q = pixelDaCoordinate(pin, centro, zoom);
          return (
            <g transform={`translate(${q.x} ${q.y})`}>
              <circle r={8} fill="#dc2626" stroke="white" strokeWidth={2} />
              <path d="M0 -14v28M-14 0h28" stroke="#dc2626" strokeWidth={2} />
            </g>
          );
        })()}
      </svg>
      <p className="mt-2 text-xs text-slate-500">
        Nord in alto · {satellite.url
          ? "Immagine Google Maps, scala da coordinate geografiche"
          : "Schema metrico manuale: verifica le misure sul posto"}. Le immagini
        non sono salvate nel progetto.
      </p>
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
          <div className="my-3 flex flex-wrap items-end gap-3">
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
            <Button
              type="button"
              variant="outline"
              disabled={!modificabile}
              onClick={() => {
                setTool("poligono");
                setPunti([]);
              }}
            >
              Traccia poligono
            </Button>
            {tool === "poligono" && (
              <>
                <Button
                  type="button"
                  disabled={!modificabile || punti.length < 3}
                  onClick={() => aggiungi(punti)}
                >
                  Chiudi falda
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPunti((v) => v.slice(0, -1))}
                >
                  Annulla vertice
                </Button>
              </>
            )}
          </div>
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
                    <strong>{num(areaPoligono(selezionata.punti))} m²</strong>
                    <br />Falda inclinata:{" "}
                    <strong>
                      {num(
                        areaPoligono(selezionata.punti) /
                          Math.cos(selezionata.inclinazione * Math.PI / 180),
                      )} m²
                    </strong>
                    <br />
                    {selezionata.inclinazioneStimata
                      ? "Inclinazione ipotizzata: verifica sul posto"
                      : "Inclinazione indicata dall’operatore"}
                  </div>
                  <div className="sm:col-span-3 text-xs text-slate-600">
                    Lati in pianta: {selezionata.punti.map((p, i) => {
                      const q =
                        selezionata.punti[(i + 1) % selezionata.punti.length];
                      return `${num(Math.hypot(q.x - p.x, q.y - p.y))} m`;
                    }).join(" · ")}
                  </div>
                  <div className="sm:col-span-3 grid gap-3 sm:grid-cols-3">
                    <label className="text-sm">
                      Vertice da spostare<select
                        aria-label="Vertice della falda"
                        className="block w-full rounded border p-2"
                        value={Math.min(vertice, selezionata.punti.length - 1)}
                        onChange={(e) => setVertice(Number(e.target.value))}
                      >
                        {selezionata.punti.map((_, i) => (
                          <option key={i} value={i}>Vertice {i + 1}</option>
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
                              Math.min(vertice, selezionata.punti.length - 1)
                            ][k]}
                          disabled={!modificabile}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && Math.abs(n) <= 400) {
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
                      !(larghezza >= 1 && larghezza <= 100 && altezza >= 1 &&
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
                Confermando le falde la disposizione precedente viene azzerata:
                nella fase Impianto scegli il modulo e calcola la nuova posa.
              </p>
            </>
          )}
        </>
      )}
      {errore && (
        <p role="alert" className="mt-3 text-sm text-red-700">{errore}</p>
      )}
    </section>
  );
}
