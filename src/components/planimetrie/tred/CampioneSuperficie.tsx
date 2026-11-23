import { cn } from "@/lib/utils";
import { FOTO_FINITURE } from "@/lib/planimetrie/fotoFiniture";
import { TRAME_GENERATE } from "@/lib/planimetrie/tred/trameGenerate";
import type { CampioneFinitura } from "../../../../shared/planimetrie/finiture";

/** Le piastrelle disegnate dal codice si mostrano con la loro griglia vera: stesse proporzioni e posa a correre. */
function grigliaPiastrelle(campione: CampioneFinitura): string | undefined {
  const formato = TRAME_GENERATE[campione.trama];
  if (!formato || !formato.fugaMm) return undefined;
  const passoX = Math.max(6, Math.round(formato.metri[0] / formato.colonne * 34)), passoY = Math.max(5, Math.round(formato.metri[1] / formato.righe * 34));
  const fuga = "#3b383033";
  return `repeating-linear-gradient(0deg, transparent 0 ${passoY - 1}px, ${fuga} ${passoY - 1}px ${passoY}px), repeating-linear-gradient(90deg, transparent 0 ${passoX - 1}px, ${fuga} ${passoX - 1}px ${passoX}px)`;
}

export function CampioneSuperficie({ campione, attivo, onClick }: { campione: CampioneFinitura; attivo: boolean; onClick: () => void }) {
  const decoro = grigliaPiastrelle(campione);
  const foto = decoro || TRAME_GENERATE[campione.trama] ? undefined : FOTO_FINITURE[campione.trama];
  const formato = campione.formatoCm ? ` · ${String(campione.formatoCm[0]).replace(".", ",")}×${String(campione.formatoCm[1]).replace(".", ",")} cm` : "";
  return <button type="button" aria-pressed={attivo} onClick={onClick} title={campione.nome + formato}
    className={cn("overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", attivo && "border-primary ring-1 ring-primary")}>
    <span className="relative block h-10 bg-muted" style={{ backgroundColor: campione.colore, backgroundImage: decoro }}>
      {foto && <img src={foto} alt="" className="h-full w-full object-cover" style={campione.id === "noce" ? { filter: "brightness(.65) saturate(.75)" } : undefined} />}
    </span>
    <span className="block px-2 py-1.5 text-[11px] font-medium leading-tight">{campione.nome}</span>
  </button>;
}
