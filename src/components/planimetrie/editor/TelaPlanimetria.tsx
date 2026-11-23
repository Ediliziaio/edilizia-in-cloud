/**
 * Il disegno della pianta, in SVG. Non gestisce i gesti: ogni cosa cliccabile porta
 * `data-tipo` e `data-id`, e l'editor capisce dal bersaglio cosa è stato toccato.
 */
import { forwardRef, useMemo, type ReactNode, type SVGProps } from "react";
import { quoteNellaVista, type DatiVista, type Muro, type Pianta, type Punto, type TipoApertura } from "./adattatore";
import { visibile, type Vista } from "./comandi";
import { NOMI_AREA } from "../../../../shared/planimetrie/modello.ts";
import { chiaveTratto, puntiPercorso, type AttraversamentoImpianto, type Percorso } from "../../../../shared/planimetrie/impianti.ts";
import { pedateCad } from "../../../../shared/planimetrie/geometria.ts";
import {
  COLORE_STANZA,
  STILE_AREA,
  angoloTesto,
  baricentro,
  colorePareti,
  corpoParete,
  metaParete,
  punti,
  segniSerramento,
  vanoApertura,
} from "./disegno";
import { dist, direzione, lunghezzaMuro, puntoSulMuro, sulSegmento, type Aggancio } from "./geometria";
import { latoEsterno } from "../../../../shared/planimetrie/serramenti.ts";
import { scriviMetri, scriviMq } from "./misure";
import { SimboloArredo } from "./SimboloArredo";
import { EvidenzaVerificaPianta } from "./EvidenzaVerificaPianta";
import type { VerificaLettura } from "../../../../shared/planimetrie/letturaTipi.ts";
import type { AnteprimaCad } from "./comandiCad";
import type { ConfrontoTramezzoChat } from "./comandiChat";
import { TracceChatPianta, type AnimazioneChatTela, type IstantaneaChat } from "./TracceChatPianta";

export type { AnimazioneChatTela } from "./TracceChatPianta";

export interface Camera {
  /** pixel per centimetro */
  s: number;
  tx: number;
  ty: number;
}

export interface Selezione {
  tipo: "muro" | "apertura" | "locale" | "elemento" | "quota" | "testo" | "area";
  id: string;
}

/** Un'immagine da ricalcare: angolo in alto a sinistra in (x, y), larga `larghezzaCm`. */
export interface SfondoRicalco {
  url: string;
  x: number;
  y: number;
  larghezzaCm: number;
  /** Rapporto altezza / larghezza dell'immagine. */
  proporzione: number;
  opacita: number;
}

export interface Sovrapposizioni {
  rettangolo?: { a: Punto; b: Punto } | null;
  /** Riquadro di selezione (Maiusc + trascina). */
  riquadro?: { a: Punto; b: Punto } | null;
  pareteInCorso?: { a: Punto; b: Punto } | null;
  aggancio?: Aggancio | null;
  cad?: { riferimento: Muro; esito?: Extract<AnteprimaCad, { ok: true }> };
  aperturaFantasma?: { muroId: string; t: number; tipo: TipoApertura } | null;
  /** Stanza libera in corso: i punti messi e il cursore. */
  poligonoInCorso?: { punti: Punto[]; cursore: Punto } | null;
  /** Quota libera in corso: primo punto e cursore. */
  quotaInCorso?: { a: Punto; b: Punto } | null;
  /** Arredo che sta per essere posato. */
  arredoFantasma?: { tipo: string; centro: Punto; larghezza: number; profondita: number } | null;
  demolizioni?: { traccia: Punto[]; daSegnare: string[]; protetti: string[] };
}

type Gestori = Pick<SVGProps<SVGSVGElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel">;

interface Props extends Gestori {
  pianta: Pianta;
  /** Stanze, arredi e testi della vista, letti dal documento. */
  dati: Pick<DatiVista, "locali" | "elementi" | "testi">;
  /** Stanze di cui si possono scrivere le misure dei lati in questa vista. */
  latiModificabili: ReadonlySet<string>;
  vista: Vista;
  selezione: Selezione | null;
  verificaEvidenziata?: VerificaLettura;
  animazioneChat?: AnimazioneChatTela | null;
  confrontoChat?: IstantaneaChat | null;
  confrontoTramezzo?: ConfrontoTramezzoChat;
  layerDwg?: ReactNode;
  /** Più oggetti selezionati insieme (arredi, quote, testi). */
  gruppo?: { elementi: string[]; quote: string[]; testi: string[] };
  lineeImpianti?: Percorso[];
  modificaTracciati?: boolean;
  tracciato?: Percorso;
  tracciatoPrima?: Percorso;
  attraversamentiTracciato?: AttraversamentoImpianto[];
  puntoTracciatoAttivo?: number | null;
  /** Immagine di riferimento sotto il disegno (mappa, foto aerea, rilievo), in scala. */
  sfondo?: SfondoRicalco | null;
  camera: Camera;
  larghezza: number;
  altezza: number;
  sovrapposizioni: Sovrapposizioni;
  /** Sul telefono: le misure dei lati solo sulla stanza toccata. */
  misureSoloSelezione?: boolean;
  /** Misura in modifica: non scriverla sotto la casella. */
  inModifica?: string | null;
  className?: string;
}

const STIMATA = "#7c3aed";

const NOMI_ELEMENTI: Record<string, string> = {
  wc: "WC",
  lavabo: "lavabo",
  doccia: "doccia",
  vasca: "vasca",
  bidet: "bidet",
  letto_matrimoniale: "letto",
  letto_singolo: "letto",
  divano: "divano",
  cucina_lineare: "cucina",
  tavolo: "tavolo",
  armadio: "armadio",
};
const SELEZIONE = "#2563eb";
/** Colori delle linee impianti: come negli schemi (elettrico rosso, acqua blu, scarichi marroni). */
export const COLORI_LINEE: Record<string, string> = { elettrica: "#dc2626", acqua: "#2563eb", scarico: "#92400e", frigorifera: "#0891b2", condensa: "#65a30d", riscaldamento: "#ea580c" };

export const TelaPlanimetria = forwardRef<SVGSVGElement, Props>(function TelaPlanimetria(
    { pianta, dati, latiModificabili, misureSoloSelezione, vista, selezione, verificaEvidenziata, animazioneChat, confrontoChat, confrontoTramezzo, layerDwg, gruppo,
      lineeImpianti, modificaTracciati, tracciato, tracciatoPrima, attraversamentiTracciato, puntoTracciatoAttivo,
      sfondo, camera, larghezza, altezza, sovrapposizioni, inModifica, className, ...gestori },
    ref,
  ) {
    const px = (n: number) => n / camera.s; // n pixel in cm
    const muri = pianta.muri.filter((m) => visibile(m.stato, vista));
    const aperture = pianta.aperture.filter((a) => visibile(a.stato, vista) && muri.some((m) => m.id === a.muroId));
    const stanzeDiLavoro = pianta.locali.filter((l) => visibile(l.stato, vista));
    const locali = dati.locali;
    const istantanea = useMemo(() => ({ pianta, locali }), [pianta, locali]);
    const nelGruppo = (tipo: Selezione["tipo"], id: string) =>
      !!gruppo && (tipo === "elemento" ? gruppo.elementi : tipo === "quota" ? gruppo.quote : tipo === "testo" ? gruppo.testi : []).includes(id);
    const sel = (tipo: Selezione["tipo"], id: string) => (selezione?.tipo === tipo && selezione.id === id) || nelGruppo(tipo, id);
    const testo = 12;

    // Pareti che stanno su un lato di una stanza: la loro misura la scrive la stanza.
    const dellaStanza = new Set(
      muri
        .filter((m) => stanzeDiLavoro.some((l) => l.contorno.some((a, i) => {
          const b = l.contorno[(i + 1) % l.contorno.length];
          // basta che la parete corra lungo un lato, anche se è più lunga della stanza
          return sulSegmento(a, m.p1, m.p2) || sulSegmento(b, m.p1, m.p2) || (sulSegmento(m.p1, a, b) && sulSegmento(m.p2, a, b));
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
          <pattern id="pl-prato" width={30} height={30} patternUnits="userSpaceOnUse">
            <path d="M5 20 l3 -7 l3 7 M18 10 l3 -7 l3 7" fill="none" stroke="#6a9a4f" strokeWidth={1.2} />
          </pattern>
          <pattern id="pl-lastre" width={60} height={40} patternUnits="userSpaceOnUse">
            <path d="M0 0 H60 M0 20 H60 M30 0 V20 M0 20 V40" fill="none" stroke="#c9bfae" strokeWidth={1} />
          </pattern>
          <pattern id="pl-ghiaia" width={16} height={16} patternUnits="userSpaceOnUse">
            <circle cx={4} cy={4} r={1.6} fill="#a3a39a" /><circle cx={12} cy={10} r={1.3} fill="#b5b5ac" />
          </pattern>
          <pattern id="pl-orto" width={40} height={40} patternUnits="userSpaceOnUse">
            <path d="M0 10 H40 M0 30 H40" fill="none" stroke="#a0835a" strokeWidth={2} />
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

          {/* immagine da ricalcare: non si tocca, i clic passano al foglio */}
          {sfondo && (
            <image href={sfondo.url} x={sfondo.x} y={sfondo.y} width={sfondo.larghezzaCm} height={sfondo.larghezzaCm * sfondo.proporzione}
              opacity={sfondo.opacita} preserveAspectRatio="none" pointerEvents="none" />
          )}

          {/* lotto e aree esterne: sotto le stanze */}
          {(pianta.aree ?? []).filter((a) => visibile(a.stato, vista)).map((a) => {
            const st = STILE_AREA[a.tipo] ?? STILE_AREA.prato;
            const lotto = a.tipo === "lotto";
            const demolire = a.stato === "da_demolire";
            return (
              <g key={a.id} opacity={demolire ? 0.45 : 1}>
                <polygon
                  points={punti(a.contorno)}
                  fill={lotto ? "rgba(220,38,38,0.03)" : st.fill}
                  stroke={sel("area", a.id) ? SELEZIONE : lotto ? "#dc2626" : st.bordo}
                  strokeWidth={px(sel("area", a.id) ? 3 : lotto ? 2 : 1)}
                  strokeDasharray={lotto ? `${px(10)} ${px(4)} ${px(2)} ${px(4)}` : a.stato === "nuovo" ? `${px(6)} ${px(3)}` : undefined}
                  data-tipo="area"
                  data-id={a.id}
                  style={{ cursor: "pointer" }}
                />
                {!lotto && st.motivo && <polygon points={punti(a.contorno)} fill={`url(#${st.motivo})`} pointerEvents="none" />}
                {(() => {
                  const c = a.contorno.reduce((t, p) => ({ x: t.x + p.x / a.contorno.length, y: t.y + p.y / a.contorno.length }), { x: 0, y: 0 });
                  const etichetta = a.nome || NOMI_AREA[a.tipo];
                  const pos = lotto ? a.contorno.reduce((m, p) => (p.y < m.y || (p.y === m.y && p.x < m.x) ? p : m)) : c;
                  return (
                    <text x={pos.x + (lotto ? px(6) : 0)} y={pos.y + (lotto ? px(16) : 0)} textAnchor={lotto ? "start" : "middle"} fontSize={px(11)} fill={lotto ? "#dc2626" : "#3f6212"} pointerEvents="none">
                      {etichetta}
                    </text>
                  );
                })()}
              </g>
            );
          })}

          {/* stanze */}
          {locali.map((l) => (
            <polygon
              key={l.id}
              points={punti(l.contorno)}
              fill={COLORE_STANZA[l.destinazione] ?? COLORE_STANZA.altro}
              stroke={sel("locale", l.id) ? SELEZIONE : l.aperto ? "#64748b" : "none"}
              strokeWidth={px(sel("locale", l.id) ? 3 : 1)}
              strokeDasharray={l.aperto ? `${px(4)} ${px(3)}` : undefined}
              data-tipo="locale"
              data-id={l.id}
              style={{ cursor: "pointer" }}
            />
          ))}

          {layerDwg}

          {/* arredi e sanitari */}
          {(pianta.elementi ?? dati.elementi.map((e) => ({ ...e, stato: "esistente" as const })))
            .filter((e) => visibile(e.stato, vista))
            .map((e) => {
              const selezionato = sel("elemento", e.id);
              const colore = selezionato ? SELEZIONE : vista === "progetto" && e.stato === "nuovo" ? "#dc2626" : vista === "progetto" && e.stato === "da_demolire" ? "#ca8a04" : "#475569";
              const etichetta = e.etichetta ?? NOMI_ELEMENTI[e.tipo] ?? e.tipo.replace(/_/g, " ");
              return (
                <g
                  key={e.id}
                  transform={`translate(${e.centro.x} ${e.centro.y}) rotate(${e.rotazione})`}
                  data-tipo="elemento"
                  data-id={e.id}
                  style={{ cursor: "move" }}
                  opacity={vista === "progetto" && e.stato === "da_demolire" ? 0.55 : 1}
                >
                  {e.alzateCad ? pedateCad(e.alzateCad, e.larghezza, e.profondita).map((pedata, i) => (
                    <polygon key={i} points={punti(pedata)} fill="#f8fafc" stroke={colore} strokeWidth={px(selezionato ? 2 : 1)} data-tipo="elemento" data-id={e.id} />
                  )) : <SimboloArredo
                    tipo={e.tipo}
                    larghezza={e.larghezza}
                    profondita={e.profondita}
                    colore={colore}
                    spessore={px(selezionato ? 2 : 1.2)}
                    riempimento={vista === "progetto" && e.stato === "da_demolire" ? "#fef9c3" : "#ffffff"}
                  />}
                  {/* bersaglio pieno: si prende anche cliccando dentro il simbolo */}
                  {e.tipo === "solaio" ? (
                    // il solaio copre tutta la pianta: si prende solo dal bordo, così le stanze sotto restano cliccabili
                    <>
                      <rect x={-e.larghezza / 2} y={-e.profondita / 2} width={e.larghezza} height={25} fill="transparent" data-tipo="elemento" data-id={e.id} />
                      <rect x={-e.larghezza / 2} y={e.profondita / 2 - 25} width={e.larghezza} height={25} fill="transparent" data-tipo="elemento" data-id={e.id} />
                      <rect x={-e.larghezza / 2} y={-e.profondita / 2} width={25} height={e.profondita} fill="transparent" data-tipo="elemento" data-id={e.id} />
                      <rect x={e.larghezza / 2 - 25} y={-e.profondita / 2} width={25} height={e.profondita} fill="transparent" data-tipo="elemento" data-id={e.id} />
                    </>
                  ) : !e.alzateCad && (
                    <rect x={-e.larghezza / 2} y={-e.profondita / 2} width={e.larghezza} height={e.profondita} fill="transparent" data-tipo="elemento" data-id={e.id} />
                  )}
                  {Math.min(e.larghezza, e.profondita) * camera.s > 34 && (
                    <text y={e.profondita / 2 - px(3)} textAnchor="middle" fontSize={px(9)} fill="#64748b" pointerEvents="none">
                      {etichetta}
                    </text>
                  )}
                </g>
              );
            })}

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
                {a.tipo === "varco" || (a.tipo !== "finestra" && a.manovra === "nessuna" && a.sistema !== "fisso") ? null : (
                  segniSerramento(a, m, latoEsterno(puntoSulMuro(m, a.posizione), { x: -direzione(m).y, y: direzione(m).x }, m.spessore, locali.map((l) => l.contorno)) || 1).map((s, i) => s.tipo === "arco" ? (
                    <path key={i} d={s.d} fill="none" stroke={colore} strokeWidth={px(1)} strokeDasharray={s.tratteggio ? `${px(4)} ${px(3)}` : undefined} data-tipo="apertura" data-id={a.id} />
                  ) : (
                    <line key={i} x1={s.p.x} y1={s.p.y} x2={s.q.x} y2={s.q.y} stroke={colore} strokeWidth={px(s.spesso ? 2 : 1.2)} strokeDasharray={s.tratteggio ? `${px(4)} ${px(3)}` : undefined} data-tipo="apertura" data-id={a.id} />
                  ))
                )}
                {a.origine === "stimata" && (
                  <circle cx={puntoSulMuro(m, a.posizione).x} cy={puntoSulMuro(m, a.posizione).y} r={px(4)} fill={STIMATA} />
                )}
              </g>
            );
          })}

          {/* misure delle stanze: nome, mq, lati interni */}
          {locali.map((l) => {
            const q = l;
            const interno = l.contorno;
            const centro = baricentro(interno);
            const misurabile = latiModificabili.has(l.id);
            const xs = interno.map((p) => p.x);
            const larghezzaPx = (Math.max(...xs) - Math.min(...xs)) * camera.s;
            const ys = interno.map((p) => p.y);
            const altezzaPx = (Math.max(...ys) - Math.min(...ys)) * camera.s;
            const nomeCiSta = larghezzaPx > Math.min(l.nome.length, 22) * 7.5 + 8;
            const selezionata = sel("locale", l.id);
            const latiVisibili = !misureSoloSelezione || selezionata;
            // Nelle stanze piccole le misure dei lati coprirebbero nome e mq: si vedono quando la
            // stanza è selezionata (o ingrandendo). Lati verticali: serve spazio ai lati del nome;
            // orizzontali: sopra e sotto le due righe di nome e mq.
            const spazioLatiVerticali = selezionata || larghezzaPx > (nomeCiSta ? Math.min(l.nome.length, 22) * 7.5 : 60) + 2 * (14 + 40) + 8;
            const spazioLatiOrizzontali = selezionata || altezzaPx > 2 * (14 + 22) + 44;
            const coloreTesto = q.stimata ? STIMATA : "#0f172a";
            return (
              <g key={`m-${l.id}`}>
                {nomeCiSta && <text
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
                </text>}
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
                {latiVisibili && interno.map((a, i) => {
                  const b = interno[(i + 1) % interno.length];
                  const lunghezza = q.lati[i];
                  if (lunghezza * camera.s < 46) return null;
                  const verticale = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
                  if (verticale ? !spazioLatiVerticali : !spazioLatiOrizzontali) return null;
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
                      dati={misurabile ? { "data-tipo": "lato", "data-id": l.id, "data-lato": String(i) } : { "data-tipo": "locale", "data-id": l.id }}
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

          {quoteNellaVista(pianta, vista).map(({ quota: q, daRivedere }) => {
            const l = dist(q.p1, q.p2);
            if (l < 1) return null;
            const n = { x: -(q.p2.y - q.p1.y) / l, y: (q.p2.x - q.p1.x) / l };
            const a = { x: q.p1.x + n.x * q.scostamento, y: q.p1.y + n.y * q.scostamento };
            const b = { x: q.p2.x + n.x * q.scostamento, y: q.p2.y + n.y * q.scostamento };
            const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const colore = daRivedere ? "#a16207" : sel("quota", q.id) ? SELEZIONE : "#0f766e";
            const tick = px(5);
            const ang = angoloTesto(a, b);
            return (
              <g key={q.id} data-tipo="quota" data-id={q.id} style={{ cursor: "pointer" }}>
                {q.riferimenti && <title>{daRivedere ? "Aggancio da rivedere" : "Quota associativa"}</title>}
                <line x1={q.p1.x} y1={q.p1.y} x2={a.x} y2={a.y} stroke={colore} strokeWidth={px(0.8)} strokeDasharray={`${px(3)} ${px(3)}`} />
                <line x1={q.p2.x} y1={q.p2.y} x2={b.x} y2={b.y} stroke={colore} strokeWidth={px(0.8)} strokeDasharray={`${px(3)} ${px(3)}`} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colore} strokeWidth={px(1.4)} />
                {[a, b].map((p, i) => (
                  <line key={i} x1={p.x - (n.x + n.y) * tick} y1={p.y - (n.y - n.x) * tick} x2={p.x + (n.x + n.y) * tick} y2={p.y + (n.y - n.x) * tick} stroke={colore} strokeWidth={px(1.6)} />
                ))}
                {/* bersaglio largo per prenderla col mouse */}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={px(14)} data-tipo="quota" data-id={q.id} />
                <text transform={`translate(${m.x + n.x * px(9)} ${m.y + n.y * px(9)}) rotate(${ang})`} textAnchor="middle" dominantBaseline="middle" fontSize={px(11)} fontWeight={600} fill={colore} pointerEvents="none">
                  {daRivedere && "⚠ "}{scriviMetri(l)}
                </text>
              </g>
            );
          })}

          {/* testi */}
          {(pianta.testi ?? dati.testi).map((t) => (
            <text
              key={t.id}
              transform={`translate(${t.posizione.x} ${t.posizione.y}) rotate(${t.rotazione})`}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={px(13)}
              fontWeight={sel("testo", t.id) ? 700 : 500}
              fill={sel("testo", t.id) ? SELEZIONE : "#334155"}
              data-tipo="testo"
              data-id={t.id}
              style={{ cursor: "move" }}
            >
              {t.testo}
            </text>
          ))}

          <EvidenzaVerificaPianta pianta={pianta} verifica={verificaEvidenziata} scala={camera.s} />
          {confrontoChat && <TracceChatPianta prima={confrontoChat} dopo={istantanea} vista={vista} escludiMuro={confrontoTramezzo?.dopo.id} />}
          {animazioneChat && <TracceChatPianta key={animazioneChat.numero} numero={animazioneChat.numero} prima={animazioneChat.prima}
            dopo={istantanea} vista={vista} evidenza={animazioneChat.evidenza} />}
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
          {lineeImpianti?.map(l => {
            const id = chiaveTratto(l);
            if (tracciato && id === chiaveTratto(tracciato)) return null;
            const coordinate = puntiPercorso(l).map(p => `${p.x},${-p.y}`).join(" ");
            return <g key={id}>
              <polyline points={coordinate} fill="none" pointerEvents="none" strokeLinejoin="round"
                stroke={COLORI_LINEE[l.linea]} strokeWidth={px(l.vertici ? 2 : 1.6)}
                strokeDasharray={l.vertici ? undefined : `${px(6)} ${px(4)}`} opacity={tracciato ? .22 : .85} />
              {modificaTracciati && <polyline points={coordinate} fill="none" stroke="transparent" strokeWidth={px(9)}
                pointerEvents="stroke" data-tipo="tratto-impianto" data-id={id} style={{ cursor: "pointer" }} />}
            </g>;
          })}
          {tracciatoPrima && <polyline aria-label="Tracciato precedente" role="img" points={puntiPercorso(tracciatoPrima).map(p => `${p.x},${-p.y}`).join(" ")}
            fill="none" pointerEvents="none" stroke="#b45309" strokeWidth={px(3)} strokeDasharray={`${px(7)} ${px(4)}`} strokeLinejoin="round" />}
          {tracciato && <g pointerEvents="none" role="img" aria-label="Tracciato selezionato sulla pianta">
            <polyline points={puntiPercorso(tracciato).map(p => `${p.x},${-p.y}`).join(" ")} fill="none" stroke="white"
              strokeWidth={px(6)} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={puntiPercorso(tracciato).map(p => `${p.x},${-p.y}`).join(" ")} fill="none"
              stroke={tracciatoPrima ? "#047857" : COLORI_LINEE[tracciato.linea]} strokeWidth={px(3)} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={tracciato.vertici ? undefined : `${px(6)} ${px(4)}`} />
            {[tracciato.da, tracciato.a].map((p, i) => <circle key={i} cx={p.x} cy={-p.y} r={px(4)} fill={COLORI_LINEE[tracciato.linea]} stroke="white" strokeWidth={px(1.3)} />)}
            {tracciato.vertici?.map((p, i) => <g key={i}>
              <circle cx={p.x} cy={-p.y} r={px(8)} fill={i === puntoTracciatoAttivo ? "#172554" : "#fff"}
                stroke={COLORI_LINEE[tracciato.linea]} strokeWidth={px(1.5)} />
              <text x={p.x} y={-p.y} fill={i === puntoTracciatoAttivo ? "#fff" : "#172554"} textAnchor="middle" dominantBaseline="central"
                fontSize={px(9)} fontWeight={700}>{i + 1}</text>
            </g>)}
            {attraversamentiTracciato?.map((a, i) => <g key={i}>
              <title>{a.aperturaId ? `Interferenza in pianta · apertura ${a.aperturaId}` : `Interferenza in pianta · ${a.tipoMuro}`}</title>
              <circle cx={a.punto.x} cy={-a.punto.y} r={px(6)} fill="#fbbf24" stroke="#78350f" strokeWidth={px(1.2)} />
              <text x={a.punto.x} y={-a.punto.y} textAnchor="middle" dominantBaseline="central" fill="#451a03" fontSize={px(9)} fontWeight={700}>!</text>
            </g>)}
          </g>}
          {sovrapposizioni.demolizioni && <g pointerEvents="none">
            {muri.filter(m => sovrapposizioni.demolizioni!.daSegnare.includes(m.id) || sovrapposizioni.demolizioni!.protetti.includes(m.id)).map(m => {
              const protetto = sovrapposizioni.demolizioni!.protetti.includes(m.id);
              return <line key={m.id} x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y} strokeLinecap="round"
                stroke={protetto ? "#475569" : "#ea580c"} strokeWidth={Math.max(px(4), m.spessore)}
                strokeDasharray={protetto ? px(5) + " " + px(4) : undefined} opacity={protetto ? .8 : .7} />;
            })}
            {sovrapposizioni.demolizioni.traccia.length > 1 && <polyline
              points={sovrapposizioni.demolizioni.traccia.map(p => p.x + "," + p.y).join(" ")}
              fill="none" stroke="#f97316" strokeWidth={px(4)} strokeLinecap="round" strokeLinejoin="round" />}
          </g>}
          {sovrapposizioni.rettangolo && <AnteprimaRettangolo {...sovrapposizioni.rettangolo} px={px} />}
          {sovrapposizioni.riquadro && (
            <rect
              x={Math.min(sovrapposizioni.riquadro.a.x, sovrapposizioni.riquadro.b.x)}
              y={Math.min(sovrapposizioni.riquadro.a.y, sovrapposizioni.riquadro.b.y)}
              width={Math.abs(sovrapposizioni.riquadro.b.x - sovrapposizioni.riquadro.a.x)}
              height={Math.abs(sovrapposizioni.riquadro.b.y - sovrapposizioni.riquadro.a.y)}
              fill={SELEZIONE} fillOpacity={0.08} stroke={SELEZIONE} strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(3)}`} pointerEvents="none"
            />
          )}
          {sovrapposizioni.pareteInCorso && <AnteprimaParete {...sovrapposizioni.pareteInCorso} px={px} />}
          {sovrapposizioni.poligonoInCorso && (() => {
            const { punti: pp, cursore } = sovrapposizioni.poligonoInCorso;
            const tutti = [...pp, cursore];
            const chiude = pp.length >= 3 && dist(cursore, pp[0]) < px(14);
            return (
              <g pointerEvents="none">
                {pp.length >= 2 && <polygon points={punti(tutti)} fill={SELEZIONE} fillOpacity={0.08} stroke="none" />}
                <polyline points={punti(tutti)} fill="none" stroke={SELEZIONE} strokeWidth={px(2)} strokeDasharray={`${px(6)} ${px(4)}`} />
                {pp.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={px(i === 0 ? 6 : 4)} fill={i === 0 && chiude ? SELEZIONE : "#ffffff"} stroke={SELEZIONE} strokeWidth={px(2)} />)}
                {pp.length > 0 && (
                  <text x={(pp[pp.length - 1].x + cursore.x) / 2} y={(pp[pp.length - 1].y + cursore.y) / 2 - px(10)} textAnchor="middle" fontSize={px(12)} fontWeight={700} fill={SELEZIONE}>
                    {scriviMetri(dist(pp[pp.length - 1], cursore))}
                  </text>
                )}
              </g>
            );
          })()}
          {sovrapposizioni.quotaInCorso && (
            <g pointerEvents="none">
              <line x1={sovrapposizioni.quotaInCorso.a.x} y1={sovrapposizioni.quotaInCorso.a.y} x2={sovrapposizioni.quotaInCorso.b.x} y2={sovrapposizioni.quotaInCorso.b.y} stroke="#0f766e" strokeWidth={px(1.5)} strokeDasharray={`${px(5)} ${px(4)}`} />
              <text x={(sovrapposizioni.quotaInCorso.a.x + sovrapposizioni.quotaInCorso.b.x) / 2} y={(sovrapposizioni.quotaInCorso.a.y + sovrapposizioni.quotaInCorso.b.y) / 2 - px(10)} textAnchor="middle" fontSize={px(12)} fontWeight={700} fill="#0f766e">
                {scriviMetri(dist(sovrapposizioni.quotaInCorso.a, sovrapposizioni.quotaInCorso.b))}
              </text>
            </g>
          )}
          {sovrapposizioni.arredoFantasma && (
            <g transform={`translate(${sovrapposizioni.arredoFantasma.centro.x} ${sovrapposizioni.arredoFantasma.centro.y})`} pointerEvents="none" opacity={0.6}>
              <SimboloArredo tipo={sovrapposizioni.arredoFantasma.tipo} larghezza={sovrapposizioni.arredoFantasma.larghezza} profondita={sovrapposizioni.arredoFantasma.profondita} colore={SELEZIONE} spessore={px(1.5)} />
            </g>
          )}
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
          {sovrapposizioni.cad && <AnteprimaModificaCad {...sovrapposizioni.cad} px={px} />}
          {confrontoTramezzo && <AnteprimaTramezzo confronto={confrontoTramezzo} px={px} />}
          {sovrapposizioni.aggancio && sovrapposizioni.aggancio.guida !== "griglia" && <IndicatoreAggancio aggancio={sovrapposizioni.aggancio} px={px} />}
        </g>
      </svg>
    );
  });

function AnteprimaTramezzo({ confronto, px }: { confronto: ConfrontoTramezzoChat; px: (n: number) => number }) {
  const { prima, dopo, interferenze } = confronto;
  const centro = (m: Muro) => ({ x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 });
  const da = centro(prima), a = centro(dopo);
  return <g pointerEvents="none" role="img" aria-label="Tramezzo prima e dopo lo spostamento">
    <line x1={prima.p1.x} y1={prima.p1.y} x2={prima.p2.x} y2={prima.p2.y} stroke="#b45309" strokeWidth={px(2.5)} strokeDasharray={`${px(5)} ${px(4)}`} />
    <line x1={dopo.p1.x} y1={dopo.p1.y} x2={dopo.p2.x} y2={dopo.p2.y} stroke="#0f766e" strokeWidth={px(3)} />
    <line x1={da.x} y1={da.y} x2={a.x} y2={a.y} stroke="#0f766e" strokeWidth={px(1.5)} />
    {interferenze.map((s, i) => <g key={i} role="img" aria-label={s.testo}>
      <circle cx={s.punto.x} cy={s.punto.y} r={px(8)} fill="#fff7ed" stroke="#b45309" strokeWidth={px(2)} />
      <text x={s.punto.x} y={s.punto.y + px(0.5)} textAnchor="middle" dominantBaseline="middle" fontWeight="700" fontSize={px(11)} fill="#92400e">!</text>
    </g>)}
  </g>;
}

function AnteprimaModificaCad({ riferimento, esito, px }: NonNullable<Sovrapposizioni["cad"]> & { px: (n: number) => number }) {
  const tratto = (m: { p1: Punto; p2: Punto }, colore: string, spessore: number, tratteggio?: string) => (
    <line x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y} stroke={colore} strokeWidth={spessore} strokeDasharray={tratteggio} />
  );
  const tratteggio = `${px(6)} ${px(4)}`;
  return <g pointerEvents="none" data-anteprima-cad>
    {tratto(riferimento, SELEZIONE, px(3))}
    {esito && tratto(esito.muro, "#059669", Math.max(esito.muro.spessore, px(4)), tratteggio)}
    {esito?.rimosso && tratto(esito.rimosso, "#e11d48", Math.max(esito.muro.spessore, px(4)), tratteggio)}
  </g>;
}

function IndicatoreAggancio({ aggancio, px }: { aggancio: Aggancio; px: (n: number) => number }) {
  const { punto: p, guida, riferimento } = aggancio;
  const etichetta = guida === "medio" ? "Punto medio" : guida === "intersezione" ? "Intersezione" : null;
  const r = px(6);
  return <g pointerEvents="none" data-aggancio={guida}>
    {riferimento && <line x1={riferimento.x} y1={riferimento.y} x2={p.x} y2={p.y} stroke={SELEZIONE}
      strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(4)}`} />}
    <g transform={`translate(${p.x} ${p.y})`} fill="none" stroke={SELEZIONE} strokeWidth={px(2)}>
      {guida === "medio" ? <path d={`M 0 ${-r} L ${r} ${r} L ${-r} ${r} Z`} fill="white" />
        : guida === "intersezione" ? <path d={`M ${-r} ${-r} L ${r} ${r} M ${r} ${-r} L ${-r} ${r}`} />
        : <circle r={px(guida === "angolo" ? 7 : 5)} />}
      {etichetta && <text x={px(10)} y={px(-9)} fontSize={px(12)} fontWeight={600} fill={SELEZIONE}
        stroke="white" strokeWidth={px(3)} paintOrder="stroke">{etichetta}</text>}
    </g>
  </g>;
}

function puntoVersoCentro(a: Punto, b: Punto, centro: Punto): Punto {
  const l = dist(a, b) || 1;
  const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const verso = (centro.x - m.x) * n.x + (centro.y - m.y) * n.y;
  return verso >= 0 ? n : { x: -n.x, y: -n.y };
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
