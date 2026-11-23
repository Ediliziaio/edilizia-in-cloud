import { useMemo } from "react";
import { circuitiRadianti, COLORI_CIRCUITO, nomeCircuito } from "../../../shared/planimetrie/circuitiRadianti.ts";
import { COLORE_RADIANTE, fasceRadianti, zoneRadianti } from "../../../shared/planimetrie/pavimentoRadiante.ts";
import type { Punto, StatoPianta } from "../../../shared/planimetrie/modello.ts";

const coordinate = (punti: Punto[]) => punti.map(p => `${p.x},${-p.y}`).join(" ");

export function ZoneRadiantiSvg({ stato }: { stato: StatoPianta }) {
  const zone = useMemo(() => zoneRadianti(stato).map(({ locale, zona }) => ({
    locale,
    sagoma: locale.contorno.map(p => `${p.x},${-p.y}`).join(" "),
    fasce: fasceRadianti(locale.contorno, zona.passoCm).map(([a, b]) => `M${a.x},${-a.y}H${b.x}`).join(" "),
  })), [stato]);
  const circuiti = useMemo(() => circuitiRadianti(stato), [stato]);
  const disegnati = new Set(circuiti.map(c => c.localeId));
  const collettore = stato.collettoreRadiante?.posizione;
  if (!zone.length && !collettore) return null;
  return <g role="img" aria-label="Zone di riscaldamento a pavimento" pointerEvents="none">
    {zone.map(({ locale, sagoma, fasce }) => <g key={locale.id}>
      <title>{locale.nome} · pavimento radiante</title>
      <polygon points={sagoma} fill={COLORE_RADIANTE} fillOpacity={0.1} />
      {!disegnati.has(locale.id) && <path d={fasce} fill="none" stroke={COLORE_RADIANTE} strokeOpacity={0.76} strokeWidth="1.1" vectorEffect="non-scaling-stroke" />}
    </g>)}
    <g fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      {circuiti.map(c => <g key={`${c.localeId}-${c.numero}`}>
        <title>{nomeCircuito(c)}</title>
        <polyline points={coordinate(c.serpentina)} stroke={COLORE_RADIANTE} vectorEffect="non-scaling-stroke" />
        <polyline points={coordinate(c.mandata)} stroke={COLORI_CIRCUITO.mandata} vectorEffect="non-scaling-stroke" />
        <polyline points={coordinate(c.ritorno)} stroke={COLORI_CIRCUITO.ritorno} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        {c.attraversamenti.map(({ punto }, i) => <circle key={i} cx={punto.x} cy={-punto.y} r={5}
          fill="#fef3c7" stroke="#92400e" vectorEffect="non-scaling-stroke"><title>Attraversamento da verificare</title></circle>)}
      </g>)}
    </g>
    {collettore && <g transform={`translate(${collettore.x} ${-collettore.y})`}>
      <title>Collettore radiante</title>
      <rect x="-15" y="-9" width="30" height="18" rx="3" fill="white" stroke="#334155" vectorEffect="non-scaling-stroke" />
      <path d="M-10 -3H10" stroke={COLORI_CIRCUITO.mandata} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d="M-10 3H10" stroke={COLORI_CIRCUITO.ritorno} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </g>}
  </g>;
}
