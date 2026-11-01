/**
 * Simboli di arredi e sanitari nell'editor (fase 3): disegno da pianta architettonica, in cm,
 * centrato sull'origine. A 0° il lato «attacco» (schienale, cassetta del WC, muro) è in alto (y negativo).
 */
import { formeSimbolo, TIPI_CON_FORME } from "@/lib/planimetrie/esporta/simboli";

/** Acqua e ripiani appena colorati anche nell'editor: si capisce subito cos'è. */
const TINTE: Record<string, string> = { "#D6ECF5": "#e6f3f9", "#3F3F46": "#e5e7eb", "#EEF0F2": "#f3f4f6" };

export function SimboloArredo({ tipo, larghezza: w, profondita: d, colore, spessore, riempimento = "#ffffff" }: {
  tipo: string; larghezza: number; profondita: number; colore: string; spessore: number; riempimento?: string;
}) {
  // Sanitari, cucina e arredi: lo stesso disegno delle esportazioni (PDF, DXF, PNG).
  if (TIPI_CON_FORME.has(tipo)) {
    return (
      <g>
        {formeSimbolo(tipo, w, d).map((f, i) => {
          const pts = f.punti.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          const sw = f.sottile ? spessore * 0.6 : spessore;
          return f.chiuso
            ? <polygon key={i} points={pts} fill={f.pieno ? (f.riempimento ?? colore) : riempimento === "#ffffff" && f.riempimento ? (TINTE[f.riempimento] ?? riempimento) : riempimento} stroke={colore} strokeWidth={sw} strokeLinejoin="round" />
            : <polyline key={i} points={pts} fill="none" stroke={colore} strokeWidth={sw} strokeLinecap="round" />;
        })}
      </g>
    );
  }
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
    // ─── punti impianto (fase 7): simboli da schema elettrico/idraulico ───
    case "presa": {
      const r = Math.min(w, d) / 2;
      return (<g><circle cx={0} cy={0} r={r} fill={riempimento} {...tratto} /><line x1={-r} y1={0} x2={r} y2={0} {...tratto} /><line x1={0} y1={-r} x2={0} y2={-r * 1.6} {...tratto} /></g>);
    }
    case "interruttore": {
      const r = Math.min(w, d) / 2;
      return (<g><circle cx={0} cy={0} r={r * 0.6} fill={riempimento} {...tratto} /><line x1={0} y1={0} x2={r * 1.2} y2={-r * 1.2} {...tratto} /><line x1={r * 1.2} y1={-r * 1.2} x2={r * 1.6} y2={-r * 0.8} {...tratto} /></g>);
    }
    case "punto_luce": {
      const r = Math.min(w, d) / 2;
      const k = r * 0.7;
      return (<g><circle cx={0} cy={0} r={r} fill={riempimento} {...tratto} /><line x1={-k} y1={-k} x2={k} y2={k} {...tratto} /><line x1={k} y1={-k} x2={-k} y2={k} {...tratto} /></g>);
    }
    case "punto_acqua": {
      const r = Math.min(w, d) / 2;
      return (<g><circle cx={0} cy={0} r={r} fill={riempimento} {...tratto} /><path d={`M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0 Z`} fill={colore} /></g>);
    }
    case "scarico": {
      const r = Math.min(w, d) / 2;
      return (<g><circle cx={0} cy={0} r={r} fill={riempimento} {...tratto} /><circle cx={0} cy={0} r={r * 0.35} fill={colore} /></g>);
    }
    case "unita_esterna":
      return (<g>{base}<circle cx={x0 + w * 0.35} cy={0} r={Math.min(w * 0.28, d * 0.42)} {...tratto} /><line x1={x0 + w * 0.7} y1={y0 + d * 0.25} x2={-x0 - w * 0.08} y2={y0 + d * 0.25} {...tratto} /><line x1={x0 + w * 0.7} y1={-y0 - d * 0.25} x2={-x0 - w * 0.08} y2={-y0 - d * 0.25} {...tratto} /></g>);
    case "collettore":
      return (<g>{base}{[0.2, 0.4, 0.6, 0.8].map((k) => <circle key={k} cx={x0 + w * k} cy={0} r={Math.min(d * 0.3, 4)} fill={colore} />)}</g>);
    case "colonna_scarico": {
      const r = Math.min(w, d) / 2;
      return (<g><circle cx={0} cy={0} r={r} fill={riempimento} stroke={colore} strokeWidth={spessore * 1.5} /><circle cx={0} cy={0} r={r * 0.55} fill={colore} /></g>);
    }
    case "scala": {
      // gradini ogni 28 cm lungo la profondità, freccia di salita
      const n = Math.max(3, Math.floor(d / 28));
      return (
        <g>
          {base}
          {Array.from({ length: n - 1 }, (_, i) => <line key={i} x1={x0} y1={y0 + ((i + 1) * d) / n} x2={-x0} y2={y0 + ((i + 1) * d) / n} {...tratto} />)}
          <line x1={0} y1={-y0 - d * 0.08} x2={0} y2={y0 + d * 0.1} {...tratto} />
          <path d={`M ${-w * 0.12} ${y0 + d * 0.18} L 0 ${y0 + d * 0.08} L ${w * 0.12} ${y0 + d * 0.18}`} {...tratto} />
        </g>
      );
    }
    case "ascensore":
      return (<g>{base}<line x1={x0} y1={y0} x2={-x0} y2={-y0} {...tratto} /><line x1={-x0} y1={y0} x2={x0} y2={-y0} {...tratto} /></g>);
    case "pilastro":
      return (<g><rect x={x0} y={y0} width={w} height={d} fill={colore} stroke={colore} strokeWidth={spessore} /><line x1={x0} y1={y0} x2={-x0} y2={-y0} stroke={riempimento} strokeWidth={spessore} /></g>);
    case "quadro_elettrico":
      return (<g>{base}<path d={`M ${x0} ${y0} L ${-x0} ${y0} L ${x0} ${-y0} Z`} fill={colore} /></g>);
    case "termosifone":
      return (<g>{base}{Array.from({ length: Math.max(2, Math.floor(w / 10)) }, (_, i) => <line key={i} x1={x0 + (i + 1) * (w / (Math.max(2, Math.floor(w / 10)) + 1))} y1={y0} x2={x0 + (i + 1) * (w / (Math.max(2, Math.floor(w / 10)) + 1))} y2={-y0} {...tratto} />)}</g>);
    case "split":
      return (<g>{base}<line x1={x0 + w * 0.08} y1={-y0 - d * 0.3} x2={-x0 - w * 0.08} y2={-y0 - d * 0.3} {...tratto} /><line x1={x0 + w * 0.08} y1={-y0 - d * 0.15} x2={-x0 - w * 0.08} y2={-y0 - d * 0.15} {...tratto} /></g>);
    default:
      return (
        <g>
          {base}
          <line x1={x0} y1={y0} x2={-x0} y2={-y0} {...tratto} />
        </g>
      );
  }
}
