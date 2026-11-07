import type { PhotoTable } from "./referencePicker.ts";

/** Identici nella selezione, nelle tavole stanza e nel wizard infissi. */
export const PROJECT_WINDOW_PHOTOS: PhotoTable = {
  pvc: { folder: "profiles", filename: "Profilo-PVC-5-Camere-Sezione-Bianco.webp", text: "PVC multi-chamber insulated frame material and profile only; frame colour comes from the project schedule" },
  alluminio: { folder: "profiles", filename: "Profilo-Alluminio-2ante-Nodo-Asimmetrico-Bianco.jpeg", text: "regular aluminium window profile, metal frame material only; do not copy this example's sash layout or frame colour" },
  minimal: { folder: "profiles", filename: "Profilo-Alluminio-Minimal-Angolo-Vetrocamera.webp", text: "minimal aluminium window profile with narrow sightline; material/profile only, project colour overrides this sample's grey coating" },
  legno: { folder: "profiles", filename: "Profilo-Legno-Euro68-Sezione-Vetrocamera.webp", text: "solid timber window frame profile with visible wood grain; preserve each real opening's geometry" },
  legno_alluminio: { folder: "profiles", filename: "Profilo-Legno-Alluminio-Sezione-Tripla-Vetrata.webp", text: "timber frame inside with aluminium cladding outside; material system only, never copy this sample's opening dimensions" },
};
