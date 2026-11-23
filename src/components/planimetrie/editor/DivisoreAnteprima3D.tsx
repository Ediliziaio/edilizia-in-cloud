import { useRef, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";

export const QUOTA_PIANTA_INIZIALE = 55;
const MINIMO = 32;
const MASSIMO = 68;
const limita = (valore: number) => Math.max(MINIMO, Math.min(MASSIMO, Math.round(valore)));

export function DivisoreAnteprima3D({ idPianta, quota, onCambia, onNascondi }: {
  idPianta: string;
  quota: number;
  onCambia: (quota: number) => void;
  onNascondi: () => void;
}) {
  const trascina = useRef<{ id: number; x: number; larghezza: number } | null>(null);

  const quotaPuntatore = (e: PointerEvent<HTMLDivElement>) => {
    const inizio = trascina.current;
    if (!inizio || inizio.id !== e.pointerId) return;
    return limita(quota + (e.clientX - inizio.x) / inizio.larghezza * 100);
  };
  const termina = (e: PointerEvent<HTMLDivElement>) => {
    if (trascina.current?.id !== e.pointerId) return;
    trascina.current = null;
    const maniglia = e.currentTarget;
    maniglia.removeAttribute("data-trascinamento");
    maniglia.style.removeProperty("--spostamento-guida");
  };

  return <div className="pl-editor-divisore-3d" role="separator" tabIndex={0}
    aria-orientation="vertical" aria-controls={idPianta}
    aria-label="Ridimensiona la pianta 2D" aria-valuemin={MINIMO} aria-valuemax={MASSIMO}
    aria-valuenow={quota} aria-valuetext={`${quota}% alla pianta 2D`}
    title="Trascina per ridimensionare · Doppio clic per ripristinare"
    onPointerDown={e => {
      const maniglia = e.currentTarget;
      const larghezza = (maniglia.parentElement?.clientWidth ?? 0) - maniglia.offsetWidth;
      if (e.button !== 0 || trascina.current || larghezza <= 0) return;
      maniglia.focus({ preventScroll: true });
      maniglia.setPointerCapture(e.pointerId);
      trascina.current = { id: e.pointerId, x: e.clientX, larghezza };
      maniglia.setAttribute("data-trascinamento", "");
    }}
    onPointerMove={e => {
      const valore = quotaPuntatore(e);
      if (valore === undefined || !trascina.current) return;
      // Muove soltanto la guida. SVG e WebGL cambiano dimensione al rilascio.
      e.currentTarget.style.setProperty("--spostamento-guida", `${(valore - quota) * trascina.current.larghezza / 100}px`);
    }}
    onPointerUp={e => {
      const valore = quotaPuntatore(e);
      termina(e);
      if (valore !== undefined) onCambia(valore);
    }}
    onPointerCancel={termina}
    onLostPointerCapture={termina}
    onDoubleClick={() => onCambia(QUOTA_PIANTA_INIZIALE)}
    onKeyDown={e => {
      const azioni: Record<string, number> = { ArrowLeft: quota - 5, ArrowRight: quota + 5, Home: MINIMO, End: MASSIMO };
      if (e.key !== "Enter" && !(e.key in azioni)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Enter") onNascondi();
      else onCambia(limita(azioni[e.key]));
    }}>
    <GripVertical aria-hidden="true" size={14} />
  </div>;
}
