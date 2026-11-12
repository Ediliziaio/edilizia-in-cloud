import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

export function IntestazioneScheda({
  icona: Icona,
  titolo,
  descrizione,
  children,
}: {
  icona: LucideIcon;
  titolo: string;
  descrizione: string;
  children?: ReactNode;
}) {
  return (
    <header className="generale-sheet-header">
      <div className="generale-sheet-title">
        <span className="generale-section-icon">
          <Icona aria-hidden="true" />
        </span>
        <div>
          <h2>{titolo}</h2>
          <p>{descrizione}</p>
        </div>
      </div>
      {children && <div className="generale-sheet-actions">{children}</div>}
    </header>
  );
}

export function FiltroAttivo({
  children,
  onReset,
}: {
  children: ReactNode;
  onReset: () => void;
}) {
  return (
    <div
      className="generale-filter-active"
      role="status"
      aria-label="Filtro attivo"
    >
      <span>{children}</span>
      <button type="button" onClick={onReset}>
        <X aria-hidden="true" /> Rimuovi filtro
      </button>
    </div>
  );
}

export function IndicatoreScheda({
  titolo,
  valore,
  nota,
  tono = "blu",
}: {
  titolo: string;
  valore: ReactNode;
  nota?: ReactNode;
  tono?: "blu" | "verde" | "ambra" | "rosso";
}) {
  return (
    <div className={`generale-indicator generale-indicator--${tono}`}>
      <p>{titolo}</p>
      <strong>{valore}</strong>
      {nota && <span>{nota}</span>}
    </div>
  );
}
