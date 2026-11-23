import type { CampioneFinitura, SuperficieFinitura } from "../../../shared/planimetrie/finiture.ts";
import { pavimentoDaCampione } from "../../../shared/planimetrie/materialiProgetto.ts";
import { normalizeRoomFloorConfig } from "../../../shared/render-room/roomRenderConfig.ts";
import { floorSurfacePhoto } from "../../../shared/render-references/floorReferences.ts";
import { paintColourPhoto } from "../../../shared/render-references/paintColourPhotos.ts";
import { ROOM_VISUAL_PHOTOS } from "../../../shared/render-references/roomVisualPhotos.ts";
import { ROOM_CLADDING_PHOTOS } from "../../../shared/render-references/roomReferences.ts";
import type { PhotoEntry } from "../../../shared/render-references/referencePicker.ts";
import { FOTO_CAMPIONI_GENERATI, FOTO_FINITURE_AGGIUNTIVE } from "./fotoFiniture";

/** Le fotografie dell'editor sono le stesse usate dalle tavole del render. */
export function fotoCampioneFinitura(campione: CampioneFinitura, superficie: SuperficieFinitura): PhotoEntry | undefined {
  if (FOTO_FINITURE_AGGIUNTIVE[campione.id]) return FOTO_FINITURE_AGGIUNTIVE[campione.id];
  if (FOTO_CAMPIONI_GENERATI[campione.id]) return FOTO_CAMPIONI_GENERATI[campione.id];
  if (superficie === "pavimento") return floorSurfacePhoto(normalizeRoomFloorConfig(pavimentoDaCampione(campione.id) as unknown as Record<string, unknown>))?.entry;
  if (campione.id === "legno") return ROOM_CLADDING_PHOTOS.boiserie_legno;
  if (campione.id === "marmo" || campione.id === "pietra") return floorSurfacePhoto(normalizeRoomFloorConfig(pavimentoDaCampione(campione.id) as unknown as Record<string, unknown>))?.entry;
  return paintColourPhoto(campione.colore, "opaco") ?? ROOM_VISUAL_PHOTOS.paint.opaco;
}
