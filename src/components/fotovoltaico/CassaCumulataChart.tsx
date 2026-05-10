/**
 * CassaCumulataChart — extract da FotovoltaicoWizard (~142 righe)
 * SVG chart pure (no deps). Mostra cassa cumulata con highlight breakeven
 * e risultato finale. Estratto in file separato per ridurre dimensione del
 * wizard fotovoltaico (3456 → 3314 righe).
 */

interface Props {
  cassa: Array<{ anno: number; cumulato: number }>;
  payback: number | null;
}

export function CassaCumulataChart({ cassa, payback }: Props) {
  if (cassa.length === 0) return null;
  const W = 800;
  const H = 280;
  const padL = 50,
    padR = 30,
    padT = 30,
    padB = 50;
  const minCum = Math.min(...cassa.map((c) => c.cumulato), 0);
  const maxCum = Math.max(...cassa.map((c) => c.cumulato), 0);
  const xRange = cassa[cassa.length - 1].anno;
  const xScale = (anno: number) => padL + (anno / xRange) * (W - padL - padR);
  const yRange = Math.max(maxCum - minCum, 1);
  const yScale = (cum: number) => padT + ((maxCum - cum) / yRange) * (H - padT - padB);
  const yZero = yScale(0);
  const linePoints = cassa.map((c) => `${xScale(c.anno)},${yScale(c.cumulato)}`).join(" L ");
  const negPoints = cassa
    .filter((c) => c.cumulato <= 0)
    .map((c) => `${xScale(c.anno)},${yScale(c.cumulato)}`);
  const negArea =
    negPoints.length > 0
      ? `M ${negPoints[0].split(",")[0]},${yZero} L ${negPoints.join(" L ")} L ${negPoints[negPoints.length - 1].split(",")[0]},${yZero} Z`
      : null;
  const posPoints = cassa
    .filter((c) => c.cumulato >= 0)
    .map((c) => `${xScale(c.anno)},${yScale(c.cumulato)}`);
  const posArea =
    posPoints.length > 0
      ? `M ${posPoints[0].split(",")[0]},${yZero} L ${posPoints.join(" L ")} L ${posPoints[posPoints.length - 1].split(",")[0]},${yZero} Z`
      : null;
  const breakevenX = payback != null ? xScale(payback) : null;
  const finalCum = cassa[cassa.length - 1].cumulato;
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n.toFixed(0)}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Grafico cassa cumulata ${xRange} anni`}
    >
      <defs>
        <linearGradient id="fvGreenArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16A34A" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#16A34A" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1={padL}
          x2={W - padR}
          y1={padT + p * (H - padT - padB)}
          y2={padT + p * (H - padT - padB)}
          stroke="#E2E8F0"
          strokeDasharray="2,3"
        />
      ))}
      {negArea && <path d={negArea} fill="#FEE2E2" opacity="0.6" />}
      {posArea && <path d={posArea} fill="url(#fvGreenArea)" />}
      <line x1={padL} x2={W - padR} y1={yZero} y2={yZero} stroke="#94A3B8" strokeWidth="1.5" />
      <path
        d={`M ${linePoints}`}
        stroke="#1E3A5F"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {breakevenX != null && (
        <>
          <line
            x1={breakevenX}
            x2={breakevenX}
            y1={padT}
            y2={H - padB}
            stroke="#F97316"
            strokeWidth="2"
            strokeDasharray="5,3"
          />
          <circle cx={breakevenX} cy={yZero} r="6" fill="#F97316" stroke="white" strokeWidth="3">
            <animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite" />
          </circle>
          <g transform={`translate(${breakevenX + 5}, ${padT + 10})`}>
            <rect width="120" height="32" rx="6" fill="#F97316" />
            <text x="10" y="14" fontSize="10" fill="white" fontWeight="700">
              BREAKEVEN
            </text>
            <text x="10" y="26" fontSize="10" fill="white">
              Anno {payback?.toFixed(1)} · 0 €
            </text>
          </g>
        </>
      )}
      <circle
        cx={xScale(xRange)}
        cy={yScale(finalCum)}
        r="6"
        fill="#16A34A"
        stroke="white"
        strokeWidth="3"
      />
      <g transform={`translate(${xScale(xRange) - 110}, ${yScale(finalCum) - 30})`}>
        <rect width="110" height="20" rx="4" fill="#16A34A" />
        <text
          x="55"
          y="14"
          fontSize="10"
          fill="white"
          fontWeight="700"
          textAnchor="middle"
        >
          +{fmt(finalCum)} €
        </text>
      </g>
      <g fontSize="10" fill="#64748B">
        <text x={padL - 5} y={padT + 4} textAnchor="end">
          +{fmt(maxCum)}
        </text>
        <text x={padL - 5} y={yZero + 4} textAnchor="end">
          0
        </text>
        <text x={padL - 5} y={H - padB + 4} textAnchor="end">
          {fmt(minCum)}
        </text>
      </g>
      <g fontSize="10" fill="#64748B" textAnchor="middle">
        {[0, 5, 10, 15, 20, xRange].map((a) => (
          <text key={a} x={xScale(a)} y={H - padB + 18}>{`Anno ${a}`}</text>
        ))}
      </g>
    </svg>
  );
}

export default CassaCumulataChart;
