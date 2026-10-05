import { ReferenceThumb } from "@/components/render/ReferenceThumb";
import type { PhotoEntry, PhotoTable } from "../../../shared/render-references/referencePicker.ts";
import {
  POOL_ACCESS_REFERENCES,
  POOL_COPING_REFERENCES,
  POOL_EDGE_SYSTEM_REFERENCES,
  POOL_FEATURE_REFERENCES,
  POOL_INTERIOR_FINISH_REFERENCES,
  POOL_RESTORED_SURFACE_REFERENCES,
  POOL_SURROUND_REFERENCES,
  POOL_TYPE_REFERENCES,
  POOL_WATER_COLOUR_REFERENCES,
} from "../../../shared/render-references/poolReferences.ts";

/** Le scelte del form piscine che hanno una foto di riferimento. */
export type DimensioneFotoPiscina =
  | "tipo"
  | "sistema_bordo"
  | "rivestimento"
  | "colore_acqua"
  | "coping"
  | "area_perimetrale"
  | "accesso"
  | "accessori"
  | "superficie_ripristino";

/** Le stesse tabelle del motore: la miniatura è la foto che arriva al modello. */
const TABELLE: Record<DimensioneFotoPiscina, PhotoTable> = {
  tipo: POOL_TYPE_REFERENCES,
  sistema_bordo: POOL_EDGE_SYSTEM_REFERENCES,
  rivestimento: POOL_INTERIOR_FINISH_REFERENCES,
  colore_acqua: POOL_WATER_COLOUR_REFERENCES,
  coping: POOL_COPING_REFERENCES,
  area_perimetrale: POOL_SURROUND_REFERENCES,
  accesso: POOL_ACCESS_REFERENCES,
  accessori: POOL_FEATURE_REFERENCES,
  superficie_ripristino: POOL_RESTORED_SURFACE_REFERENCES,
};

/** La foto dell'opzione, o undefined: l'opzione resta col solo testo. */
export function fotoOpzionePiscina(dimensione: DimensioneFotoPiscina, valore: string): PhotoEntry | undefined {
  const tabella = TABELLE[dimensione];
  return Object.prototype.hasOwnProperty.call(tabella, valore) ? tabella[valore] : undefined;
}

/** Miniatura quadrata da 40 px, la stessa nelle voci delle tendine e nelle card degli accessori. */
export function MiniaturaPiscina({ foto, alt }: { foto: PhotoEntry; alt: string }) {
  return (
    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
      <ReferenceThumb photo={foto} alt={alt} />
    </span>
  );
}

/**
 * Voce di una tendina: miniatura (se l'opzione ha la foto) e nome. Si sceglie
 * guardando la stessa foto che il motore allega al render.
 */
export function OpzioneConFoto({ dimensione, valore, label }: { dimensione: DimensioneFotoPiscina; valore: string; label: string }) {
  const foto = fotoOpzionePiscina(dimensione, valore);
  if (!foto) return <>{label}</>;
  return (
    <span className="flex items-center gap-2">
      <MiniaturaPiscina foto={foto} alt={label} />
      <span>{label}</span>
    </span>
  );
}
