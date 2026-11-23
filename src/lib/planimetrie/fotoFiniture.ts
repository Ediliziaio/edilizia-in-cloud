import rovere from "@/assets/planimetrie/finiture/rovere.webp";
import pietra from "@/assets/planimetrie/finiture/pietra.webp";
import type { PhotoEntry } from "../../../shared/render-references/referencePicker";
import { CAMPIONI_PBR, urlMappaPbr } from "./tred/campioniPbr";

export const FOTO_FINITURE_AGGIUNTIVE: Readonly<Record<string, PhotoEntry>> = {
  rovere_miele: { folder: "floors", filename: "Parquet-In-Rovere-Color-Miele.webp", text: "honey-toned oak in staggered planks" },
  rovere_spina: { folder: "floors", filename: "Pavimento-Parquet-Spina-di-Pesce.webp", text: "natural oak in a herringbone layout" },
  marmo_calacatta: { folder: "bathroom", filename: "Calacatta-Lucido-Venature-Grigie-E-Dorate.webp", text: "white Calacatta marble with grey and gold veins" },
  marmo_marquinia: { folder: "bathroom", filename: "Marmo-Marquinia-Nero-Con-Venature-Bianche.webp", text: "black Marquinia marble with thin white veins" },
  travertino: { folder: "bathroom", filename: "Travertino-Beige-Levigato-A-Bande-Naturali.webp", text: "beige travertine with naturally layered bands" },
};

/** Import Vite: disponibili anche nelle anteprime locali e nei deploy con base diversa da '/'. */
export const FOTO_FINITURE: Readonly<Record<string, string>> = {
  rovere_gres: rovere, pietra,
  ...Object.fromEntries(Object.keys(CAMPIONI_PBR).map(id => [id, import.meta.env.BASE_URL + urlMappaPbr(id, "colore")])),
  ...Object.fromEntries([0, 1, 2, 3].map(i => [`highland-${i}`, `${import.meta.env.BASE_URL}planimetrie/modelli/highland-${i}.png`])),
  ...Object.fromEntries(Object.entries(FOTO_FINITURE_AGGIUNTIVE).map(([id, foto]) =>
    [id, `${import.meta.env.BASE_URL}render-references/${foto.folder}/${foto.filename}`])),
};
