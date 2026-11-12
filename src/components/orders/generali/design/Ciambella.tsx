import type { CSSProperties } from "react";

export interface Spicchio {
  id: string;
  valore: number;
  colore: string;
  nome?: string;
}

/** SVG leggero; i valori e le azioni accessibili sono nella legenda accanto. */
export function Ciambella({
  dati,
  valore,
  etichetta,
  compatta = false,
  onSeleziona,
}: {
  dati: readonly Spicchio[];
  valore: string;
  etichetta: string;
  compatta?: boolean;
  onSeleziona?: (id: string) => void;
}) {
  const positivi = dati.filter(
    (d) => Number.isFinite(d.valore) && d.valore > 0,
  );
  const totale = positivi.reduce((s, d) => s + d.valore, 0);
  let offset = 0;
  return (
    <div
      className={`generale-donut${compatta ? " generale-donut--compact" : ""}`}
    >
      <svg
        viewBox="0 0 200 200"
        aria-hidden={!onSeleziona}
        role={onSeleziona ? "group" : undefined}
        aria-label={onSeleziona ? `Filtra ${etichetta}` : undefined}
      >
        <circle
          cx="100"
          cy="100"
          r="77"
          fill="none"
          className="generale-donut-track"
          strokeWidth="19"
        />
        {positivi.map((d) => {
          const quota = (d.valore / totale) * 100;
          const inizio = offset;
          offset += quota;
          return (
            <circle
              key={d.id}
              cx="100"
              cy="100"
              r="77"
              fill="none"
              pathLength="100"
              strokeWidth="19"
              transform="rotate(-90 100 100)"
              strokeDasharray={`${Math.max(0.1, quota - (positivi.length > 1 ? 0.8 : 0))} 100`}
              strokeDashoffset={-inizio}
              style={{ stroke: d.colore } as CSSProperties}
              role={onSeleziona ? "button" : undefined}
              tabIndex={onSeleziona ? 0 : undefined}
              aria-label={onSeleziona ? `Mostra ${d.nome ?? d.id}` : undefined}
              onClick={onSeleziona ? () => onSeleziona(d.id) : undefined}
              onKeyDown={
                onSeleziona
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSeleziona(d.id);
                      }
                    }
                  : undefined
              }
              className={onSeleziona ? "generale-donut-action" : undefined}
            />
          );
        })}
      </svg>
      <div className="generale-donut-center">
        <strong>{valore}</strong>
        <span>{etichetta}</span>
      </div>
    </div>
  );
}
