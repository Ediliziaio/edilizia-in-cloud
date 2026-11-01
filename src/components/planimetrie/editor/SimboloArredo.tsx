/**
 * Simboli di arredi e sanitari nell'editor (fase 3): disegno da pianta architettonica, in cm,
 * centrato sull'origine. A 0° il lato «attacco» (schienale, cassetta del WC, muro) è in alto (y negativo).
 */
export function SimboloArredo({ tipo, larghezza: w, profondita: d, colore, spessore, riempimento = "#ffffff" }: {
  tipo: string; larghezza: number; profondita: number; colore: string; spessore: number; riempimento?: string;
}) {
  const x0 = -w / 2, y0 = -d / 2;
  const tratto = { stroke: colore, strokeWidth: spessore, fill: "none" } as const;
  const base = <rect x={x0} y={y0} width={w} height={d} rx={Math.min(w, d) * 0.06} fill={riempimento} stroke={colore} strokeWidth={spessore} />;
  switch (tipo) {
    case "wc":
      return (
        <g>
          <rect x={x0} y={y0} width={w} height={d * 0.28} rx={3} fill={riempimento} stroke={colore} strokeWidth={spessore} />
          <ellipse cx={0} cy={y0 + d * 0.62} rx={w * 0.42} ry={d * 0.36} fill={riempimento} {...tratto} />
          <ellipse cx={0} cy={y0 + d * 0.64} rx={w * 0.24} ry={d * 0.22} {...tratto} />
        </g>
      );
    case "bidet":
      return (
        <g>
          <ellipse cx={0} cy={0} rx={w / 2} ry={d / 2} fill={riempimento} {...tratto} />
          <ellipse cx={0} cy={d * 0.06} rx={w * 0.26} ry={d * 0.3} {...tratto} />
          <circle cx={0} cy={y0 + d * 0.14} r={Math.min(w, d) * 0.04} fill={colore} />
        </g>
      );
    case "lavabo":
      return (
        <g>
          {base}
          <ellipse cx={0} cy={d * 0.06} rx={w * 0.34} ry={d * 0.3} {...tratto} />
          <circle cx={0} cy={y0 + d * 0.16} r={Math.min(w, d) * 0.04} fill={colore} />
        </g>
      );
    case "doccia":
      return (
        <g>
          {base}
          <line x1={x0} y1={y0} x2={-x0} y2={-y0} {...tratto} />
          <line x1={-x0} y1={y0} x2={x0} y2={-y0} {...tratto} />
          <circle cx={0} cy={0} r={Math.min(w, d) * 0.06} fill={riempimento} {...tratto} />
        </g>
      );
    case "vasca":
      return (
        <g>
          {base}
          <rect x={x0 + w * 0.06} y={y0 + d * 0.1} width={w * 0.88} height={d * 0.8} rx={Math.min(w, d) * 0.3} {...tratto} />
          <circle cx={x0 + w * 0.14} cy={0} r={Math.min(w, d) * 0.05} fill={colore} />
        </g>
      );
    case "letto_matrimoniale":
    case "letto_singolo": {
      const cuscini = tipo === "letto_matrimoniale" ? 2 : 1;
      const lc = (w - 12 - (cuscini - 1) * 6) / cuscini;
      return (
        <g>
          {base}
          {Array.from({ length: cuscini }, (_, i) => (
            <rect key={i} x={x0 + 6 + i * (lc + 6)} y={y0 + 6} width={lc} height={d * 0.16} rx={4} {...tratto} />
          ))}
          <line x1={x0} y1={y0 + d * 0.32} x2={-x0} y2={y0 + d * 0.32} {...tratto} />
        </g>
      );
    }
    case "divano":
      return (
        <g>
          {base}
          <rect x={x0} y={y0} width={w} height={d * 0.25} {...tratto} />
          <rect x={x0} y={y0} width={w * 0.1} height={d} {...tratto} />
          <rect x={-x0 - w * 0.1} y={y0} width={w * 0.1} height={d} {...tratto} />
          <line x1={0} y1={y0 + d * 0.25} x2={0} y2={-y0} {...tratto} />
        </g>
      );
    case "cucina": {
      const r = Math.min(d * 0.13, 9);
      return (
        <g>
          {base}
          <rect x={x0 + w * 0.08} y={y0 + d * 0.2} width={Math.min(w * 0.22, 60)} height={d * 0.6} rx={4} {...tratto} />
          {[0, 1].map((i) => [0, 1].map((j) => (
            <circle key={`${i}${j}`} cx={-x0 - w * 0.25 + i * r * 2.6} cy={y0 + d * 0.32 + j * r * 2.6} r={r} {...tratto} />
          )))}
        </g>
      );
    }
    case "frigorifero":
    case "armadio":
      return (
        <g>
          {base}
          <line x1={x0} y1={y0} x2={-x0} y2={-y0} {...tratto} />
          {tipo === "armadio" && <line x1={0} y1={y0} x2={0} y2={-y0} {...tratto} />}
        </g>
      );
    case "lavatrice":
    case "caldaia":
      return (
        <g>
          {base}
          <circle cx={0} cy={0} r={Math.min(w, d) * 0.32} {...tratto} />
        </g>
      );
    case "sedia":
      return (
        <g>
          {base}
          <line x1={x0} y1={y0 + d * 0.18} x2={-x0} y2={y0 + d * 0.18} {...tratto} />
        </g>
      );
    case "tavolo":
    case "comodino":
    case "scrivania":
      return base;
    default:
      return (
        <g>
          {base}
          <line x1={x0} y1={y0} x2={-x0} y2={-y0} {...tratto} />
        </g>
      );
  }
}
