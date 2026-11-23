import { cn } from "@/lib/utils";
import { FOTO_FINITURE } from "@/lib/planimetrie/fotoFiniture";
import type { CampioneFinitura } from "../../../../shared/planimetrie/finiture";

export function CampioneSuperficie({ campione, attivo, onClick }: { campione: CampioneFinitura; attivo: boolean; onClick: () => void }) {
  const foto = FOTO_FINITURE[campione.trama];
  const decoro = campione.trama === "piastrelle" || campione.trama === "cemento"
    ? "repeating-linear-gradient(0deg, transparent 0 21px, #423e3526 22px 23px), repeating-linear-gradient(90deg, transparent 0 32px, #423e3526 33px 34px)" : undefined;
  return <button type="button" aria-pressed={attivo} onClick={onClick}
    className={cn("overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", attivo && "border-primary ring-1 ring-primary")}>
    <span className="relative block h-10 bg-muted" style={{ backgroundColor: campione.colore, backgroundImage: decoro }}>
      {foto && <img src={foto} alt="" className="h-full w-full object-cover" style={campione.id === "noce" ? { filter: "brightness(.65) saturate(.75)" } : undefined} />}
    </span>
    <span className="block px-2 py-1.5 text-[11px] font-medium leading-tight">{campione.nome}</span>
  </button>;
}
