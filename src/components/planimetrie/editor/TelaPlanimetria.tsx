/**
 * Il disegno della pianta, in SVG. Non gestisce i gesti: ogni cosa cliccabile porta
 * `data-tipo` e `data-id`, e l'editor capisce dal bersaglio cosa è stato toccato.
 */
import { forwardRef, type SVGProps } from "react";
import { contornoInterno, quantitaLocale, type Pianta, type Punto, type TipoApertura } from "./adattatore";
import { visibile, type Vista } from "./comandi";
import {
  COLORE_STANZA,
  angoloTesto,
  baricentro,
  colorePareti,
  corpoParete,
  metaParete,
  punti,
  simboloFinestra,
  simboloPorta,
  vanoApertura,
} from "./disegno";
import { dist, lunghezzaMuro, puntoSulMuro, sulSegmento, type Aggancio } from "./geometria";
import { scriviMetri, scriviMq } from "./misure";

export interface Camera {
  /** pixel per centimetro */
  s: number;
  tx: number;
  ty: number;
}

export interface Selezione {
  tipo: "muro" | "apertura" | "locale";
  id: string;
}

export interface Sovrapposizioni {
  rettangolo?: { a: Punto; b: Punto } | null;
  pareteInCorso?: { a: Punto; b: Punto } | null;
  aggancio?: Aggancio | null;
  aperturaFantasma?: { muroId: string; t: number; tipo: TipoApertura } | null;
}

type Gestori = Pick<SVGProps<SVGSVGElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel">;

interface Props extends Gestori {
  pianta: Pianta;
  vista: Vista;
  selezione: Selezione | null;
  camera: Camera;
  larghezza: number;
  altezza: number;
  sovrapposizioni: Sovrapposizioni;
  /** Misura in modifica: non scriverla sotto la casella. */
  inModifica?: string | null;
  className?: string;
}

const STIMATA = "#7c3aed";
const SELEZIONE = "#2563eb";

export const TelaPlanimetria = forwardRef<SVGSVGElement, Props>(function TelaPlanimetria(
    { pianta, vista, selezione, camera, larghezza, altezza, sovrapposizioni, inModifica, className, ...gestori },
    ref,
  ) {
    const px = (n: number) => n / camera.s; // n pixel in cm
    const muri = pianta.muri.filter((m) => visibile(m.stato, vista));
    const aperture = pianta.aperture.filter((a) => visibile(a.stato, vista) && muri.some((m) => m.id === a.muroId));
    const locali = pianta.locali.filter((l) => visibile(l.stato, vista));
    const sel = (tipo: Selezione["tipo"], id: string) => selezione?.tipo === tipo && selezione.id === id;
    const testo = 12;

    // Pareti che stanno su un lato di una stanza: la loro misura la scrive la stanza.
    const dellaStanza = new Set(
      muri
        .filter((m) => locali.some((l) => l.contorno.some((a, i) => {
          const b = l.contorno[(i + 1) % l.contorno.length];
          return sulSegmento(m.p1, a, b) && sulSegmento(m.p2, a, b);
        })))
        .map((m) => m.id),
    );

    return (
      <svg
        ref={ref}
        width={larghezza}
        height={altezza}
        className={className}
        style={{ touchAction: "none", userSelect: "none", display: "block" }}
        data-tipo="sfondo"
        onContextMenu={(e) => e.preventDefault()}
        {...gestori}
      >
        <defs>
          <pattern id="pl-griglia" width={100} height={100} patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#e2e8f0" strokeWidth={px(1)} />
          </pattern>
          <pattern id="pl-stimata" width={12} height={12} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={12} height={12} fill="#ddd6fe" />
            <line x1={0} y1={0} x2={0} y2={12} stroke="#a78bfa" strokeWidth={4} />
          </pattern>
        </defs>
        <rect width={larghezza} height={altezza} fill="#f8fafc" data-tipo="sfondo" />
        <g transform={`translate(${camera.tx} ${camera.ty}) scale(${camera.s})`}>
          {/* griglia di 1 m */}
          <rect
            x={-camera.tx / camera.s}
            y={-camera.ty / camera.s}
            width={larghezza / camera.s}
            height={altezza / camera.s}
            fill="url(#pl-griglia)"
            data-tipo="sfondo"
          />

          {/* stanze */}
          {locali.map((l) => (
            <polygon
              key={l.id}
              points={punti(l.contorno)}
              fill={COLORE_STANZA[l.destinazione] ?? COLORE_STANZA.altro}
              stroke={sel("locale", l.id) ? SELEZIONE : "none"}
              strokeWidth={px(3)}
              data-tipo="locale"
              data-id={l.id}
              style={{ cursor: "pointer" }}
            />
          ))}

          {/* pareti */}
          {muri.map((m) => {
            const c = colorePareti(m.stato, vista);
            const stimata = m.origine === "stimata";
            return (
              <polygon
                key={m.id}
                points={punti(corpoParete(m, pianta))}
                fill={stimata && m.stato === "esistente" ? "url(#pl-stimata)" : c.riempimento}
                stroke={sel("muro", m.id) ? SELEZIONE : stimata ? STIMATA : c.bordo}
                strokeWidth={px(sel("muro", m.id) ? 3 : 1)}
                strokeDasharray={stimata ? `${px(6)} ${px(4)}` : undefined}
                strokeLinejoin="miter"
                data-tipo="muro"
                data-id={m.id}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {/* porte e finestre */}
          {aperture.map((a) => {
            const m = muri.find((x) => x.id === a.muroId)!;
            const colore =
              vista === "progetto" && a.stato === "da_demolire" ? "#a16207" : a.stato === "nuovo" ? "#dc2626" : "#0f172a";
            const s = sel("apertura", a.id);
            return (
              <g key={a.id} data-tipo="apertura" data-id={a.id} style={{ cursor: "pointer" }}>
                <polygon
                  points={punti(vanoApertura(a, m))}
                  fill={vista === "progetto" && a.stato === "da_demolire" ? "#fef9c3" : "#ffffff"}
                  stroke={s ? SELEZIONE : "none"}
                  strokeWidth={px(2)}
                  data-tipo="apertura"
                  data-id={a.id}
                />
                {a.tipo === "finestra" ? (
                  simboloFinestra(a, m).map(([p, q], i) => (
                    <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={colore} strokeWidth={px(1.2)} data-tipo="apertura" data-id={a.id} />
                  ))
                ) : (
                  <SimboloPorta a={a} m={m} colore={colore} px={px} />
                )}
                {a.origine === "stimata" && (
                  <circle cx={puntoSulMuro(m, a.posizione).x} cy={puntoSulMuro(m, a.posizione).y} r={px(4)} fill={STIMATA} />
                )}
              </g>
            );
          })}

          {/* misure delle stanze: nome, mq, lati interni */}
          {locali.map((l) => {
            const q = quantitaLocale(pianta, l);
            const interno = contornoInterno(pianta, l);
            const centro = baricentro(interno);
            const coloreTesto = q.stimata ? STIMATA : "#0f172a";
            return (
              <g key={`m-${l.id}`}>
                <text
                  x={centro.x}
                  y={centro.y - px(4)}
                  textAnchor="middle"
                  fontSize={px(13)}
                  fontWeight={600}
                  fill="#0f172a"
                  data-tipo="locale"
                  data-id={l.id}
                  style={{ cursor: "pointer" }}
                >
                  {l.nome}
                </text>
                <text
                  x={centro.x}
                  y={centro.y + px(13)}
                  textAnchor="middle"
                  fontSize={px(12)}
                  fill={coloreTesto}
                  data-tipo="locale"
                  data-id={l.id}
                  style={{ cursor: "pointer" }}
                >
                  {q.stimata ? "≈ " : ""}
                  {scriviMq(q.mq)}
                </text>
                {interno.map((a, i) => {
                  const b = interno[(i + 1) % interno.length];
                  const lunghezza = q.lati[i];
                  if (lunghezza * camera.s < 46) return null;
                  const chiave = `lato:${l.id}:${i}`;
                  if (inModifica === chiave) return null;
                  // dentro la stanza, a 14 px dal muro
                  const u = { x: (b.x - a.x) / lunghezza, y: (b.y - a.y) / lunghezza };
                  const verso = puntoVersoCentro(a, b, centro);
                  const m = {
                    x: (a.x + b.x) / 2 + verso.x * px(14),
                    y: (a.y + b.y) / 2 + verso.y * px(14),
                  };
                  const stimata = q.stimata;
                  return (
                    <EtichettaMisura
                      key={i}
                      centro={m}
                      angolo={angoloTesto(a, b)}
                      testo={`${stimata ? "≈ " : ""}${scriviMetri(lunghezza)}`}
                      stimata={stimata}
                      px={px}
                      dimensione={testo}
                      dati={{ "data-tipo": "lato", "data-id": l.id, "data-lato": String(i) }}
                      lineaDa={{ x: a.x + verso.x * px(4) + u.x * px(2), y: a.y + verso.y * px(4) + u.y * px(2) }}
                      lineaA={{ x: b.x + verso.x * px(4) - u.x * px(2), y: b.y + verso.y * px(4) - u.y * px(2) }}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* misure delle pareti che non chiudono una stanza (o selezionate) */}
          {muri.map((m) => {
            const lunghezza = lunghezzaMuro(m);
            const mostra = !dellaStanza.has(m.id) || sel("muro", m.id);
            if (!mostra || lunghezza * camera.s < 40 || inModifica === `muro:${m.id}`) return null;
            const off = m.spessore / 2 + px(14);
            return (
              <EtichettaMisura
                key={`q-${m.id}`}
                centro={metaParete(m, off)}
                angolo={angoloTesto(m.p1, m.p2)}
                testo={`${m.origine === "stimata" ? "≈ " : ""}${scriviMetri(lunghezza)}`}
                stimata={m.origine === "stimata"}
                px={px}
                dimensione={testo}
                dati={{ "data-tipo": "quota-muro", "data-id": m.id }}
              />
            );
          })}

          {/* maniglie agli estremi della parete selezionata */}
          {selezione?.tipo === "muro" &&
            (() => {
              const m = muri.find((x) => x.id === selezione.id);
              if (!m) return null;
              return (["p1", "p2"] as const).map((e) => (
                <circle
                  key={e}
                  cx={m[e].x}
                  cy={m[e].y}
                  r={px(7)}
                  fill="#ffffff"
                  stroke={SELEZIONE}
                  strokeWidth={px(2)}
                  data-tipo="maniglia"
                  data-id={m.id}
                  data-estremo={e}
                  style={{ cursor: "grab" }}
                />
              ));
            })()}

          {/* anteprime mentre si disegna */}
          {sovrapposizioni.rettangolo && <AnteprimaRettangolo {...sovrapposizioni.rettangolo} px={px} />}
          {sovrapposizioni.pareteInCorso && <AnteprimaParete {...sovrapposizioni.pareteInCorso} px={px} />}
          {sovrapposizioni.aperturaFantasma &&
            (() => {
              const f = sovrapposizioni.aperturaFantasma;
              const m = pianta.muri.find((x) => x.id === f.muroId);
              if (!m) return null;
              const c = puntoSulMuro(m, f.t);
              const l = f.tipo === "porta" ? 80 : 120;
              const u = { x: (m.p2.x - m.p1.x) / lunghezzaMuro(m), y: (m.p2.y - m.p1.y) / lunghezzaMuro(m) };
              return (
                <line
                  x1={c.x - (u.x * l) / 2}
                  y1={c.y - (u.y * l) / 2}
                  x2={c.x + (u.x * l) / 2}
                  y2={c.y + (u.y * l) / 2}
                  stroke={SELEZIONE}
                  strokeWidth={m.spessore + px(4)}
                  strokeOpacity={0.45}
                  pointerEvents="none"
                />
              );
            })()}
          {sovrapposizioni.aggancio && sovrapposizioni.aggancio.guida !== "griglia" && (
            <g pointerEvents="none">
              {sovrapposizioni.aggancio.riferimento && (
                <line
                  x1={sovrapposizioni.aggancio.riferimento.x}
                  y1={sovrapposizioni.aggancio.riferimento.y}
                  x2={sovrapposizioni.aggancio.punto.x}
                  y2={sovrapposizioni.aggancio.punto.y}
                  stroke={SELEZIONE}
                  strokeWidth={px(1)}
                  strokeDasharray={`${px(4)} ${px(4)}`}
                />
              )}
              <circle
                cx={sovrapposizioni.aggancio.punto.x}
                cy={sovrapposizioni.aggancio.punto.y}
                r={px(sovrapposizioni.aggancio.guida === "angolo" ? 7 : 5)}
                fill="none"
                stroke={SELEZIONE}
                strokeWidth={px(2)}
              />
            </g>
          )}
        </g>
      </svg>
    );
  });

function puntoVersoCentro(a: Punto, b: Punto, centro: Punto): Punto {
  const l = dist(a, b) || 1;
  const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const verso = (centro.x - m.x) * n.x + (centro.y - m.y) * n.y;
  return verso >= 0 ? n : { x: -n.x, y: -n.y };
}

function SimboloPorta({ a, m, colore, px }: { a: Parameters<typeof simboloPorta>[0]; m: Parameters<typeof simboloPorta>[1]; colore: string; px: (n: number) => number }) {
  const { anta, arco } = simboloPorta(a, m);
  return (
    <>
      <line x1={anta[0].x} y1={anta[0].y} x2={anta[1].x} y2={anta[1].y} stroke={colore} strokeWidth={px(2)} data-tipo="apertura" data-id={a.id} />
      <path
        d={arco}
        fill="none"
        stroke={colore}
        strokeWidth={px(1)}
        strokeDasharray={a.tipo === "portafinestra" ? `${px(4)} ${px(3)}` : undefined}
        data-tipo="apertura"
        data-id={a.id}
      />
    </>
  );
}

function EtichettaMisura({
  centro,
  angolo,
  testo,
  stimata,
  px,
  dimensione,
  dati,
  lineaDa,
  lineaA,
}: {
  centro: Punto;
  angolo: number;
  testo: string;
  stimata: boolean;
  px: (n: number) => number;
  dimensione: number;
  dati: Record<string, string>;
  lineaDa?: Punto;
  lineaA?: Punto;
}) {
  const larghezza = px(testo.length * dimensione * 0.6 + 10);
  const altezza = px(dimensione + 6);
  const colore = stimata ? STIMATA : "#0f172a";
  return (
    <g style={{ cursor: "text" }} {...dati}>
      {lineaDa && lineaA && (
        <line
          x1={lineaDa.x}
          y1={lineaDa.y}
          x2={lineaA.x}
          y2={lineaA.y}
          stroke={colore}
          strokeOpacity={0.35}
          strokeWidth={px(1)}
          strokeDasharray={stimata ? `${px(4)} ${px(3)}` : undefined}
          pointerEvents="none"
        />
      )}
      <g transform={`translate(${centro.x} ${centro.y}) rotate(${angolo})`} {...dati}>
        <rect
          x={-larghezza / 2}
          y={-altezza / 2}
          width={larghezza}
          height={altezza}
          rx={px(4)}
          fill="#ffffff"
          stroke={colore}
          strokeOpacity={stimata ? 0.9 : 0.25}
          strokeWidth={px(1)}
          strokeDasharray={stimata ? `${px(3)} ${px(2)}` : undefined}
          {...dati}
        />
        <text
          y={px(dimensione * 0.36)}
          textAnchor="middle"
          fontSize={px(dimensione)}
          fontStyle={stimata ? "italic" : undefined}
          fill={colore}
          {...dati}
        >
          {testo}
        </text>
      </g>
    </g>
  );
}

function AnteprimaRettangolo({ a, b, px }: { a: Punto; b: Punto; px: (n: number) => number }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  // misure interne con il tramezzo da 10 cm
  const wi = Math.max(0, w - 10);
  const hi = Math.max(0, h - 10);
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill="#dbeafe" fillOpacity={0.6} stroke={SELEZIONE} strokeWidth={px(2)} strokeDasharray={`${px(6)} ${px(4)}`} />
      <text x={x + w / 2} y={y - px(8)} textAnchor="middle" fontSize={px(14)} fontWeight={600} fill={SELEZIONE}>
        {scriviMetri(wi)}
      </text>
      <text x={x + w + px(8)} y={y + h / 2} fontSize={px(14)} fontWeight={600} fill={SELEZIONE}>
        {scriviMetri(hi)}
      </text>
      <text x={x + w / 2} y={y + h / 2 + px(5)} textAnchor="middle" fontSize={px(13)} fill={SELEZIONE}>
        {scriviMq((wi * hi) / 10_000)}
      </text>
    </g>
  );
}

function AnteprimaParete({ a, b, px }: { a: Punto; b: Punto; px: (n: number) => number }) {
  const l = dist(a, b);
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#334155" strokeOpacity={0.6} strokeWidth={10} strokeLinecap="square" />
      <circle cx={a.x} cy={a.y} r={px(5)} fill={SELEZIONE} />
      {l > 1 && (
        <text
          transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${angoloTesto(a, b)}) translate(0 ${-px(14)})`}
          textAnchor="middle"
          fontSize={px(14)}
          fontWeight={600}
          fill={SELEZIONE}
        >
          {scriviMetri(l)}
        </text>
      )}
    </g>
  );
}
