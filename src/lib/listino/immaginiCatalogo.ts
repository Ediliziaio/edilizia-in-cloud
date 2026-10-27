export const MAX_IMMAGINI_CATALOGO = 12;
export const RUOLI_IMMAGINE = {
  principale: "Principale", sezione: "Sezione tecnica", dettaglio: "Dettaglio", esclusa: "Esclusa dal PDF",
} as const;
export type RuoloImmagineCatalogo = keyof typeof RUOLI_IMMAGINE;
export interface ImmagineCatalogo {
  id: string;
  url: string;
  ruolo: RuoloImmagineCatalogo;
  didascalia: string;
}
export interface BozzaImmagineCatalogo extends ImmagineCatalogo { file?: File }

export function leggiImmaginiCatalogo(value: unknown, legacy?: string | null): ImmagineCatalogo[] {
  if (!Array.isArray(value) || value.length === 0) return legacy ? [{ id: "legacy", url: legacy, ruolo: "principale", didascalia: "" }] : [];
  const ids = new Set<string>();
  let principale = false;
  return value.flatMap((v): ImmagineCatalogo[] => {
    if (!v || typeof v !== "object" || typeof v.id !== "string" || !v.id || ids.has(v.id)
      || typeof v.url !== "string" || !v.url || !Object.prototype.hasOwnProperty.call(RUOLI_IMMAGINE, v.ruolo)) return [];
    ids.add(v.id);
    const ruolo = v.ruolo === "principale" && principale ? "dettaglio" : v.ruolo;
    if (ruolo === "principale") principale = true;
    return [{ id: v.id, url: v.url, ruolo, didascalia: typeof v.didascalia === "string" ? v.didascalia : "" }];
  });
}

export function immaginiPerPdf(immagini: readonly ImmagineCatalogo[]): ImmagineCatalogo[] {
  const urls = new Set<string>();
  return immagini.filter(i => i.ruolo !== "esclusa" && !urls.has(i.url) && Boolean(urls.add(i.url)));
}
export function immaginePrincipale(immagini: readonly ImmagineCatalogo[]): ImmagineCatalogo | null {
  const visibili = immaginiPerPdf(immagini);
  return visibili.find(i => i.ruolo === "principale") ?? visibili.find(i => i.ruolo === "sezione") ?? visibili[0] ?? null;
}
export function assegnaRuolo<T extends ImmagineCatalogo>(immagini: readonly T[], id: string, ruolo: RuoloImmagineCatalogo): T[] {
  return immagini.map(i => ({ ...i, ruolo: i.id === id ? ruolo : ruolo === "principale" && i.ruolo === "principale" ? "dettaglio" : i.ruolo }));
}
export function controllaImmagineCatalogo(file: File): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Sono ammesse immagini JPG, PNG e WEBP.";
  if (file.size === 0) return "Il file è vuoto.";
  if (file.size > 3 * 1024 * 1024) return "Ogni immagine deve pesare al massimo 3 MB.";
  return null;
}
