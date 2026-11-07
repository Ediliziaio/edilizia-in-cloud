import type { PhotoEntry } from "./referencePicker.ts";

export const PAINT_COLOUR_PHOTOS: Record<string, PhotoEntry> = {
  "#a6b49e": { folder: "planimetrie", filename: "paint-salvia.webp", text: "Matte sage green painted plaster, colour #A6B49E, fine natural plaster grain" },
  "#dbc6a6": { folder: "planimetrie", filename: "paint-sabbia.webp", text: "Matte sandy beige painted plaster, colour #DBC6A6, fine natural plaster grain" },
};

export function paintColourPhoto(colour: unknown, finish: string): PhotoEntry | undefined {
  return (finish === "opaco" || finish === "lavabile") && typeof colour === "string" ? PAINT_COLOUR_PHOTOS[colour.trim().toLowerCase()] : undefined;
}
