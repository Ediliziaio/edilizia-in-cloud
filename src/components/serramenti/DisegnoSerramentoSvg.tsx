/**
 * Il disegno di un serramento a schermo: la scena di disegnoSerramento.ts
 * colorata con la finitura scelta (un RAL, un colore con nome, un effetto
 * legno con le venature) e, a richiesta, le quote.
 *
 * Per sembrare un serramento vero e non uno schema: profili con le testate a
 * 45° e un velo di luce che li smussa, guarnizione scura attorno al vetro,
 * riflessi diagonali sul vetro, cerniere e maniglie in metallo, un'ombra
 * morbida sotto.
 *
 * Il vetro cambia aspetto secondo il tipo (satinato opaco, fumé scuro,
 * serigrafato a puntini, acustico e antisfondamento con il filo della
 * stratificazione) e per il numero di lastre (i distanziatori sul bordo).
 * Nel monoblocco il cassonetto ha il suo colore, la tapparella le sue stecche
 * e la zanzariera una trama fine sul vetro.
 *
 * La vista interna usa il colore interno, quella esterna il colore esterno.
 */
import { useId, useMemo } from "react";
import { estremi, fasciaOrizzontale } from "@/lib/serramenti/geometriaConvessa";
import { disegnaSerramento, type Forma, type ScenaSerramento, type SerramentoDisegno } from "@/lib/serramenti/disegnoSerramento";
import { FINITURA_NEUTRA, FINITURE_MANIGLIA, scurisci, type Finitura, type FinituraManigliaId } from "@/lib/serramenti/finituraSerramento";

interface Props {
  /** Il serramento da disegnare. In alternativa si passa direttamente la `scena` (le persiane). */
  disegno?: SerramentoDisegno;
  scena?: ScenaSerramento;
  /** La vista, quando si passa la scena; altrimenti è quella del `disegno`. */
  vista?: "interna" | "esterna";
  finituraInterna?: Finitura | null;
  finituraEsterna?: Finitura | null;
  /** Il colore del cassonetto nel monoblocco; non indicato = quello del serramento nella stessa vista. */
  finituraCassonetto?: Finitura | null;
  /** Il colore della tapparella (le stecche). */
  finituraTapparella?: Finitura | null;
  /** Il metallo della maniglia (e dei perni): argento di serie. */
  finituraManiglia?: FinituraManigliaId;
  mostraQuote?: boolean;
  className?: string;
}

const ROSSO = "#e11d2e";
const GUARNIZIONE = "#2b3034";

/** Venature su una tessera di 36×420 mm: poche linee di spessore e opacità diversi. */
const VENATURE: Array<[number, number, number]> = [
  [4, 1.2, 0.5], [9, 2.4, 0.35], [15, 1, 0.6], [21, 1.8, 0.3], [27, 1.1, 0.55], [32, 2.2, 0.35],
];

type Rettangolo = Extract<Forma, { kind: "rect" }>;
type Poligono = Extract<Forma, { kind: "poly" }>;
type Sagoma = Extract<Forma, { kind: "sagoma" }>;

const puntiSvg = (p: Array<[number, number]>) => p.map((q) => `${q[0]},${q[1]}`).join(" ");
const tracciato = (p: Array<[number, number]>) => `M ${p.map((q) => `${q[0]} ${q[1]}`).join(" L ")} Z`;

const comeBarra = (f: Rettangolo): Poligono => ({
  kind: "poly",
  ruolo: f.ruolo,
  barra: f.w >= f.h ? "h" : "v",
  punti: [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]],
});

/** I due pattern di venatura (barre verticali e orizzontali) di una finitura legno, con un prefisso per distinguerli. */
function PatternLegno({ id, finitura }: { id: string; finitura: Finitura }) {
  if (finitura.tipo !== "legno") return null;
  return (
    <>
      <pattern id={`${id}v`} patternUnits="userSpaceOnUse" width="36" height="420">
        <rect width="36" height="420" fill={finitura.chiaro} />
        {VENATURE.map(([x, spessore, opacita], i) => (
          <path key={i} d={`M ${x} 0 C ${x + 3} 110, ${x - 3} 300, ${x} 420`} stroke={finitura.scuro} strokeWidth={spessore} strokeOpacity={opacita} fill="none" />
        ))}
      </pattern>
      <pattern id={`${id}h`} patternUnits="userSpaceOnUse" width="420" height="36">
        <rect width="420" height="36" fill={finitura.chiaro} />
        {VENATURE.map(([y, spessore, opacita], i) => (
          <path key={i} d={`M 0 ${y} C 110 ${y + 3}, 300 ${y - 3}, 420 ${y}`} stroke={finitura.scuro} strokeWidth={spessore} strokeOpacity={opacita} fill="none" />
        ))}
      </pattern>
    </>
  );
}

const baseDi = (f: Finitura) => (f.tipo === "tinta" ? f.hex : f.chiaro);

/** Un tono più chiaro: mescola con il bianco di `quanto` (0 = uguale, 1 = bianco). */
function schiarisci(hex: string, quanto: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const canale = (shift: number) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * quanto);
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(canale(16))}${h(canale(8))}${h(canale(0))}`;
}

export function DisegnoSerramentoSvg({
  disegno, scena: scenaData, vista, finituraInterna, finituraEsterna, finituraCassonetto, finituraTapparella, finituraManiglia = "argento", mostraQuote = true, className,
}: Props) {
  const id = useId().replace(/:/g, "");
  const scena = useMemo(
    () => scenaData ?? disegnaSerramento(disegno ?? { larghezzaMm: 1000, altezzaMm: 1000, ante: [] }),
    [scenaData, disegno],
  );
  const esterna = (vista ?? disegno?.vista) === "esterna";
  const finitura: Finitura = (esterna ? finituraEsterna : finituraInterna) ?? FINITURA_NEUTRA;
  const finCass: Finitura = finituraCassonetto ?? finitura;
  const finTap: Finitura = finituraTapparella ?? FINITURA_NEUTRA;

  const { larghezza: W, altezza: H, sporgenza: sp } = scena;
  const grande = Math.max(W, H);
  const unita = mostraQuote ? grande * 0.1 : grande * 0.03;
  const haQuote = (lato: "sx" | "dx" | "sotto") => mostraQuote && scena.quote.some((q) => q.lato === lato);
  // Dove c'è una quota serve più spazio: le quote stanno fuori dal serramento (e fuori dall'aletta).
  const sfondo = scena.sfondo ?? 0; // la parete attorno al vano: allarga l'immagine
  const mSx = Math.max((haQuote("sx") ? unita * 1.5 : unita) + sp, sfondo);
  const mDx = Math.max((haQuote("dx") ? unita * 1.5 : unita) + sp, sfondo);
  const livelli = Math.max(0, ...scena.quote.filter((q) => q.lato === "sotto").map((q) => q.livello ?? 0));
  const mSotto = Math.max((haQuote("sotto") ? unita * 1.3 : unita) + sp + (mostraQuote ? livelli * unita * 0.9 : 0), sfondo);
  const mSopra = Math.max(unita + sp, sfondo);
  const filo = grande * 0.0022;
  const tratto = grande * 0.007;

  const metallo = FINITURE_MANIGLIA[finituraManiglia];
  // Lo stile «scheda»: disegno tecnico piatto, grigi chiari. Con un colore scelto i grigi diventano i toni di quel colore.
  const piatto = scena.stile === "scheda";
  const neutro = finitura === FINITURA_NEUTRA;
  const tonoBase = neutro ? "#eceef0" : baseDi(finitura);
  const toni = {
    telaio: tonoBase,
    campo: neutro ? "#f6f7f8" : schiarisci(tonoBase, 0.7),
    fondo: "#c9ced3",
    contorno: neutro ? "#7d858c" : scurisci(tonoBase, 0.42),
    scura: neutro ? "#a3aab0" : scurisci(tonoBase, 0.3),
    chiara: neutro ? "#dde1e4" : schiarisci(tonoBase, 0.82),
    vetro: "#d6e9f4",
  };
  const contorno = piatto ? toni.contorno : scurisci(baseDi(finitura), 0.4);
  const contornoCass = piatto ? toni.contorno : scurisci(baseDi(finCass), 0.4);
  const veloK = piatto ? 0 : 1; // il velo di luce che smussa i profili: nelle schede non c'è
  const sporgenza = grande * 0.0035; // la guarnizione sporge dal vetro di qualche millimetro

  const tipoVetro = disegno?.vetro?.tipo ?? "standard";
  const zanzariera = !!disegno?.monoblocco?.zanzariera;
  const riflessi = tipoVetro === "satinato" ? 0.1 : tipoVetro === "opaco" ? 0.05 : tipoVetro === "fume" || tipoVetro === "bronzo" ? 0.16 : 1;

  const riempimento = (f: Finitura, prefisso: string, verso: "h" | "v") =>
    f.tipo === "legno" ? `url(#${id}${prefisso}${verso})` : piatto && f === finitura ? toni.telaio : f.hex;

  /** Il vetro nelle schede: azzurro piatto con il lampo bianco in diagonale. */
  function vetroPiatto(punti: Array<[number, number]>, key: string | number) {
    const { x0, x1, y0, y1 } = estremi(punti);
    const w = x1 - x0, h = y1 - y0;
    return (
      <g key={key}>
        <polygon points={puntiSvg(punti)} fill={toni.vetro} stroke={toni.contorno} strokeWidth={filo * 0.9} strokeLinejoin="round" />
        <line x1={x0 + w * 0.08} y1={y0 + h * 0.2} x2={x0 + w * 0.3} y2={y0 + h * 0.07} stroke="#fff" strokeWidth={filo * 2} strokeLinecap="round" />
        <line x1={x0 + w * 0.08} y1={y0 + h * 0.3} x2={x0 + w * 0.42} y2={y0 + h * 0.1} stroke="#fff" strokeOpacity="0.7" strokeWidth={filo * 1.2} strokeLinecap="round" />
      </g>
    );
  }

  /** Una lamella nelle schede: due fili, uno scuro e uno chiaro, a rilievo. Disegna fra x0 e x1, al centro y. */
  function lamellaPiatta(x0: number, x1: number, y: number, key: string | number) {
    return (
      <g key={key}>
        <line x1={x0} y1={y - filo * 0.9} x2={x1} y2={y - filo * 0.9} stroke={toni.scura} strokeWidth={filo * 1.3} strokeLinecap="round" />
        <line x1={x0} y1={y + filo * 1.1} x2={x1} y2={y + filo * 1.1} stroke={toni.chiara} strokeWidth={filo * 1.2} strokeLinecap="round" />
      </g>
    );
  }

  function vetro(punti: Array<[number, number]>, key: string | number) {
    if (piatto) return vetroPiatto(punti, key);
    const xs = punti.map((q) => q[0]);
    const ys = punti.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = x1 - x0;
    const p = puntiSvg(punti);
    const doppioFilo = tipoVetro === "acustico" || tipoVetro === "antisfondamento";
    return (
      <g key={key}>
        {/* guarnizione scura attorno al vetro */}
        <polygon points={p} fill={GUARNIZIONE} stroke={GUARNIZIONE} strokeWidth={sporgenza * 2} strokeLinejoin="round" />
        <clipPath id={`${id}c${key}`}>
          <polygon points={p} />
        </clipPath>
        <polygon points={p} fill={`url(#${id}g${tipoVetro})`} />
        {(tipoVetro === "satinato" || tipoVetro === "opaco") && <polygon points={p} fill={`url(#${id}grana)`} />}
        {tipoVetro === "serigrafato" && <polygon points={p} fill={`url(#${id}puntini)`} />}
        <g clipPath={`url(#${id}c${key})`}>
          {/* due strisce di riflesso, in diagonale (quasi spente sul vetro satinato) */}
          <polygon fill="#fff" fillOpacity={0.34 * riflessi} points={`${x0 + w * 0.08},${y1} ${x0 + w * 0.34},${y1} ${x0 + w * 0.9},${y0} ${x0 + w * 0.64},${y0}`} />
          <polygon fill="#fff" fillOpacity={0.2 * riflessi} points={`${x0 + w * 0.4},${y1} ${x0 + w * 0.5},${y1} ${x0 + w * 1.06},${y0} ${x0 + w * 0.96},${y0}`} />
          <polygon points={p} fill="none" stroke="#fff" strokeOpacity="0.65" strokeWidth={sporgenza * 2.6} />
          {/* il filo della stratificazione, un po' dentro il bordo: vetro acustico e antisfondamento */}
          {doppioFilo && (
            <>
              <polygon points={p} fill="none" stroke={tipoVetro === "acustico" ? "#2f6f68" : "#7a6a2e"} strokeOpacity="0.55" strokeWidth={sporgenza * 9} />
              <polygon points={p} fill="none" stroke={`url(#${id}g${tipoVetro})`} strokeWidth={sporgenza * 7.2} />
            </>
          )}
        </g>
        {zanzariera && <polygon points={p} fill={`url(#${id}rete)`} />}
      </g>
    );
  }

  return (
    <svg
      viewBox={`${-mSx} ${-mSopra} ${W + mSx + mDx} ${H + mSopra + mSotto}`}
      className={className}
      role="img"
      aria-label={`Serramento ${Math.round(W)} per ${Math.round(H)} millimetri, vista ${esterna ? "esterna" : "interna"}`}
      style={{ maxWidth: "100%", height: "auto" }}
    >
      <defs>
        {/* i vetri: una tinta per tipo */}
        <linearGradient id={`${id}gstandard`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1fbfe" /><stop offset="0.55" stopColor="#d6eef6" /><stop offset="1" stopColor="#bfe0ec" />
        </linearGradient>
        <linearGradient id={`${id}gsatinato`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6f8f9" /><stop offset="1" stopColor="#dfe5e8" />
        </linearGradient>
        <linearGradient id={`${id}gfume`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f989d" /><stop offset="1" stopColor="#5d666c" />
        </linearGradient>
        <linearGradient id={`${id}gserigrafato`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1fbfe" /><stop offset="0.55" stopColor="#d6eef6" /><stop offset="1" stopColor="#bfe0ec" />
        </linearGradient>
        <linearGradient id={`${id}gacustico`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6f4f1" /><stop offset="0.55" stopColor="#c9e4df" /><stop offset="1" stopColor="#a9d0c9" />
        </linearGradient>
        <linearGradient id={`${id}gbronzo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9a58c" /><stop offset="1" stopColor="#8a7358" />
        </linearGradient>
        <linearGradient id={`${id}gopaco`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbfbf8" /><stop offset="1" stopColor="#ecece6" />
        </linearGradient>
        <linearGradient id={`${id}griflettente`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbe9f0" /><stop offset="0.5" stopColor="#a9c4d3" /><stop offset="1" stopColor="#c9dbe5" />
        </linearGradient>
        <linearGradient id={`${id}gantisfondamento`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3f6e8" /><stop offset="0.55" stopColor="#dde5c3" /><stop offset="1" stopColor="#c5d09f" />
        </linearGradient>
        <pattern id={`${id}grana`} patternUnits="userSpaceOnUse" width="14" height="14">
          <circle cx="3" cy="4" r="1.1" fill="#9aa4a9" fillOpacity="0.35" /><circle cx="10" cy="9" r="1.1" fill="#9aa4a9" fillOpacity="0.3" />
          <circle cx="6" cy="12" r="0.8" fill="#fff" fillOpacity="0.5" />
        </pattern>
        <pattern id={`${id}puntini`} patternUnits="userSpaceOnUse" width="46" height="46">
          <circle cx="23" cy="23" r="8" fill="#fff" fillOpacity="0.7" />
        </pattern>
        <pattern id={`${id}rete`} patternUnits="userSpaceOnUse" width="9" height="9">
          <path d="M 0 0 H 9 M 0 0 V 9" stroke="#3d464b" strokeOpacity="0.28" strokeWidth="0.9" fill="none" />
        </pattern>

        <pattern id={`${id}parete`} patternUnits="userSpaceOnUse" width="60" height="60">
          <rect width="60" height="60" fill="#e8e3d7" />
          <circle cx="8" cy="12" r="1.6" fill="#cfc8b8" fillOpacity="0.6" /><circle cx="33" cy="9" r="1.2" fill="#fff" fillOpacity="0.6" />
          <circle cx="47" cy="30" r="1.8" fill="#cfc8b8" fillOpacity="0.5" /><circle cx="18" cy="44" r="1.4" fill="#fff" fillOpacity="0.55" />
          <circle cx="40" cy="52" r="1.5" fill="#cfc8b8" fillOpacity="0.55" />
        </pattern>
        <linearGradient id={`${id}davanzale`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2efe8" /><stop offset="1" stopColor="#bdb8ab" />
        </linearGradient>
        <linearGradient id={`${id}fondo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b2025" /><stop offset="1" stopColor="#2e353c" />
        </linearGradient>

        {/* il velo che smussa i profili: chiaro da un lato, scuro dall'altro */}
        <linearGradient id={`${id}lh`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.38 * veloK} /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity={0.22 * veloK} />
        </linearGradient>
        <linearGradient id={`${id}lv`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity={0.38 * veloK} /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity={0.22 * veloK} />
        </linearGradient>
        <linearGradient id={`${id}soglia`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4e7e9" /><stop offset="1" stopColor="#8d9399" />
        </linearGradient>
        <filter id={`${id}ombra`} x="-10%" y="-10%" width="125%" height="125%">
          <feDropShadow dx={grande * 0.006} dy={grande * 0.01} stdDeviation={grande * 0.008} floodColor="#0f172a" floodOpacity="0.28" />
        </filter>

        {/* le stecche della tapparella: tinta della finitura, filo chiaro sopra e ombra sotto */}
        <pattern id={`${id}stecche`} patternUnits="userSpaceOnUse" width="40" height="44">
          <rect width="40" height="44" fill={baseDi(finTap)} />
          <rect width="40" height="3" fill="#fff" fillOpacity="0.32" />
          <rect y="37" width="40" height="7" fill="#000" fillOpacity="0.22" />
        </pattern>

        <PatternLegno id={id} finitura={finitura} />
        <PatternLegno id={`${id}c`} finitura={finCass} />
      </defs>

      <g filter={piatto ? undefined : `url(#${id}ombra)`}>
        {scena.forme.map((forma, i) => {
          // Profili: telaio e ante, anche quelli a forma di rettangolo (montanti).
          const profilo: Poligono | null =
            forma.kind === "rect" && (forma.ruolo === "telaio" || forma.ruolo === "anta" || forma.ruolo === "inglesina")
              ? comeBarra(forma)
              : forma.kind === "poly" && forma.barra && (forma.ruolo === "telaio" || forma.ruolo === "anta" || forma.ruolo === "inglesina")
                ? forma
                : null;
          if (profilo && profilo.barra) {
            const punti = puntiSvg(profilo.punti);
            return (
              <g key={i}>
                <polygon points={punti} fill={riempimento(finitura, "", profilo.barra)} stroke={contorno} strokeWidth={filo} strokeLinejoin="round" />
                <polygon points={punti} fill={`url(#${id}${profilo.barra === "h" ? "lh" : "lv"})`} stroke="none" />
              </g>
            );
          }

          if (forma.kind === "sagoma") {
            const sg: Sagoma = forma;
            if (sg.ruolo === "vetro") return vetro(sg.punti, i);
            const d = tracciato(sg.punti) + (sg.buco ? ` ${tracciato(sg.buco)}` : "");
            if (sg.ruolo === "fondo") return <path key={i} d={d} fillRule="evenodd" fill={piatto ? toni.fondo : `url(#${id}fondo)`} />;
            if (sg.ruolo === "campo") {
              return <path key={i} d={d} fillRule="evenodd" fill={piatto ? toni.campo : `url(#${id}fondo)`} stroke={piatto ? toni.contorno : "none"} strokeWidth={filo * 0.8} strokeLinejoin="round" />;
            }
            if (piatto && sg.ruolo === "lamella") {
              // il filo della lamella segue la larghezza della fascia al suo centro
              const { y0, y1 } = estremi(sg.punti);
              const ym = (y0 + y1) / 2;
              const fetta = fasciaOrizzontale(sg.punti, ym - 0.01, ym + 0.01);
              if (fetta.length < 3) return null;
              const e = estremi(fetta);
              return lamellaPiatta(e.x0, e.x1, ym, i);
            }
            if (piatto && (sg.ruolo === "pannello" || sg.ruolo === "pannelloRilievo")) {
              return <path key={i} d={d} fillRule="evenodd" fill={toni.campo} stroke={toni.contorno} strokeWidth={filo * 1.1} strokeLinejoin="round" />;
            }
            if (sg.ruolo === "distanziatore") {
              return <path key={i} d={d} fillRule="evenodd" fill="#aeb6bb" stroke="#7d868c" strokeWidth={filo * 0.7} />;
            }
            // Telaio, anta e aletta: un anello con lo stesso velo di luce dei profili dritti.
            return (
              <g key={i}>
                <path d={d} fillRule="evenodd" fill={riempimento(finitura, "", "v")} stroke={contorno} strokeWidth={filo} strokeLinejoin="round" />
                <path d={d} fillRule="evenodd" fill={`url(#${id}lh)`} stroke="none" />
              </g>
            );
          }

          if (forma.kind === "rect") {
            switch (forma.ruolo) {
              case "vetro":
                return vetro(
                  [[forma.x, forma.y], [forma.x + forma.w, forma.y], [forma.x + forma.w, forma.y + forma.h], [forma.x, forma.y + forma.h]],
                  i,
                );
              case "binario":
                return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill="#c9cdd0" stroke="#7d858b" strokeWidth={filo} />;
              case "fondo":
                return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={piatto ? toni.fondo : `url(#${id}fondo)`} />;
              case "campo":
                return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={piatto ? toni.campo : `url(#${id}fondo)`} stroke={piatto ? toni.contorno : "none"} strokeWidth={filo * 0.8} />;
              case "cappello":
                return (
                  <g key={i}>
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={toni.telaio} stroke={toni.contorno} strokeWidth={filo * 1.2} />
                    <line x1={forma.x + forma.w * 0.02} y1={forma.y + forma.h * 0.3} x2={forma.x + forma.w * 0.98} y2={forma.y + forma.h * 0.3} stroke={toni.chiara} strokeWidth={filo} />
                  </g>
                );
              case "parete":
                return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={`url(#${id}parete)`} />;
              case "davanzale":
                return (
                  <g key={i}>
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={`url(#${id}davanzale)`} stroke="#8f8a7e" strokeWidth={filo} />
                    <rect x={forma.x} y={forma.y + forma.h} width={forma.w} height={grande * 0.006} fill="#000" fillOpacity="0.18" />
                  </g>
                );
              case "sbarra":
                return (
                  <g key={i}>
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={riempimento(finitura, "", "v")} stroke={contorno} strokeWidth={filo} />
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={`url(#${id}${forma.w >= forma.h ? "lh" : "lv"})`} />
                  </g>
                );
              case "lamella":
                if (piatto) return lamellaPiatta(forma.x, forma.x + forma.w, forma.y + forma.h / 2, i);
                // Una lamella con volume: il filo di luce sopra e l'ombra sotto.
                return (
                  <g key={i}>
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={riempimento(finitura, "", "h")} stroke={contorno} strokeWidth={filo * 0.8} />
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={`url(#${id}lh)`} />
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h * 0.2} fill="#fff" fillOpacity="0.3" />
                    <rect x={forma.x} y={forma.y + forma.h * 0.82} width={forma.w} height={forma.h * 0.18} fill="#000" fillOpacity="0.3" />
                  </g>
                );
              case "asta":
                if (piatto) return <line key={i} x1={forma.x + forma.w / 2} y1={forma.y} x2={forma.x + forma.w / 2} y2={forma.y + forma.h} stroke={toni.scura} strokeWidth={filo * 2.2} strokeLinecap="round" />;
                return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} rx={forma.w / 2} fill="#bcc1c5" stroke="#6b7278" strokeWidth={filo} />;
              case "pannello":
              case "pannelloRilievo":
                if (piatto) return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={toni.campo} stroke={toni.contorno} strokeWidth={filo * 1.1} />;
                return (
                  <g key={i}>
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={riempimento(finitura, "", "v")} stroke={contorno} strokeWidth={filo * (forma.ruolo === "pannello" ? 1 : 1.6)} />
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={`url(#${id}${forma.ruolo === "pannello" ? "lv" : "lh"})`} />
                  </g>
                );
              case "cassonetto":
                return (
                  <g key={i}>
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={riempimento(finCass, "c", "h")} stroke={contornoCass} strokeWidth={filo} />
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={`url(#${id}lh)`} />
                  </g>
                );
              case "ispezione":
                // Il pannello d'ispezione: un filo scuro e uno chiaro, a rilievo.
                return (
                  <g key={i}>
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} rx={forma.h * 0.06} fill="none" stroke={contornoCass} strokeWidth={filo * 1.6} />
                    <rect x={forma.x + filo * 2} y={forma.y + filo * 2} width={forma.w - filo * 4} height={forma.h - filo * 4} rx={forma.h * 0.05} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth={filo} />
                  </g>
                );
              case "tapparella":
                return (
                  <g key={i}>
                    <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={`url(#${id}stecche)`} stroke={scurisci(baseDi(finTap), 0.4)} strokeWidth={filo} opacity={esterna ? 1 : 0.92} />
                    <rect x={forma.x} y={forma.y + forma.h} width={forma.w} height={grande * 0.006} fill={scurisci(baseDi(finTap), 0.35)} />
                  </g>
                );
              case "cintino":
                return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} rx={forma.w * 0.25} fill="#d9cfb6" stroke="#8b7f66" strokeWidth={filo} />;
              case "motore":
                return (
                  <g key={i}>
                    <circle cx={forma.x + forma.w / 2} cy={forma.y + forma.h / 2} r={forma.w / 2} fill="#eceff1" stroke="#475569" strokeWidth={filo * 1.3} />
                    <text x={forma.x + forma.w / 2} y={forma.y + forma.h / 2 + forma.h * 0.2} textAnchor="middle" fontSize={forma.h * 0.55} fontWeight={700} fontFamily="system-ui, sans-serif" fill="#334155">M</text>
                  </g>
                );
              case "maniglia":
                // Una barra e basta, nel colore della finitura scelta.
                return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} rx={forma.w / 2} fill={metallo.mezzo} stroke={metallo.bordo} strokeWidth={filo * 1.3} />;
              case "cerniera":
                // Una staffa lunga (persiane) ha i ribattini; la cerniera piccola dei serramenti resta un tassello.
                if (forma.w > forma.h * 3 && !piatto) {
                  const r = forma.h * 0.2;
                  return (
                    <g key={i}>
                      <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} rx={forma.h * 0.45} fill={metallo.mezzo} stroke={metallo.bordo} strokeWidth={filo * 1.3} />
                      <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h * 0.3} rx={forma.h * 0.15} fill="#fff" fillOpacity={metallo.riflesso * 0.25} />
                      <circle cx={forma.x + forma.w * 0.22} cy={forma.y + forma.h / 2} r={r} fill={metallo.ombra} stroke={metallo.bordo} strokeWidth={filo * 0.8} />
                      <circle cx={forma.x + forma.w * 0.78} cy={forma.y + forma.h / 2} r={r} fill={metallo.ombra} stroke={metallo.bordo} strokeWidth={filo * 0.8} />
                    </g>
                  );
                }
                if (piatto) return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} rx={forma.w * 0.15} fill={toni.telaio} stroke={toni.contorno} strokeWidth={filo} />;
                return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} rx={forma.w * 0.3} fill={metallo.mezzo} stroke={metallo.bordo} strokeWidth={filo * 1.3} />;
              case "soglia":
                return <rect key={i} x={forma.x} y={forma.y} width={forma.w} height={forma.h} fill={`url(#${id}soglia)`} stroke="#7a8086" strokeWidth={filo} />;
              default:
                return null;
            }
          }

          if (forma.ruolo === "pannelloLinea" || forma.ruolo === "lamellaLinea") {
            return <polyline key={i} points={forma.punti.map((p) => p.join(",")).join(" ")} fill="none" stroke={contorno} strokeWidth={filo * 1.1} strokeOpacity="0.85" strokeLinecap="round" />;
          }
          return (
            <polyline
              key={i}
              points={forma.punti.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={ROSSO}
              strokeWidth={tratto}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={forma.tratteggio ? `${tratto * 4} ${tratto * 3}` : undefined}
            />
          );
        })}
      </g>

      {mostraQuote && (
        <g stroke="#475569" strokeWidth={filo} fill="#334155" fontFamily="system-ui, sans-serif" fontSize={unita * 0.42}>
          {scena.quote.map((q, i) => {
            const d = unita * 0.45; // distanza della linea di quota dal serramento
            const tic = unita * 0.15;
            if (q.orientamento === "h") {
              const y = H + sp + d + (q.livello ?? 0) * unita * 0.9;
              return (
                <g key={i}>
                  <line x1={q.da} y1={y} x2={q.a} y2={y} />
                  <line x1={q.da} y1={y - tic} x2={q.da} y2={y + tic} />
                  <line x1={q.a} y1={y - tic} x2={q.a} y2={y + tic} />
                  <text x={(q.da + q.a) / 2} y={y + unita * 0.5} textAnchor="middle" stroke="none">{q.testo}</text>
                </g>
              );
            }
            const x = q.lato === "dx" ? W + sp + d : -(sp + d);
            const xt = q.lato === "dx" ? x + unita * 0.45 : x - unita * 0.2;
            const yc = (q.da + q.a) / 2;
            return (
              <g key={i}>
                <line x1={x} y1={q.da} x2={x} y2={q.a} />
                <line x1={x - tic} y1={q.da} x2={x + tic} y2={q.da} />
                <line x1={x - tic} y1={q.a} x2={x + tic} y2={q.a} />
                <text x={xt} y={yc} textAnchor="middle" stroke="none" transform={`rotate(${q.lato === "dx" ? 90 : -90} ${xt} ${yc})`}>{q.testo}</text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
