/**
 * Le lingue dell'area operai (richiesta del founder, 23/11/2026): in cantiere lavorano molti operai stranieri.
 *
 * La chiave di ogni traduzione è la frase italiana: dove una traduzione manca si vede l'italiano, niente si rompe
 * e le schermate si traducono una alla volta. Le varianti (spagnolo argentino e peruviano) partono dallo spagnolo e
 * cambiano solo dove si parla diverso.
 */
export type CodiceLingua = "it" | "ro" | "sq" | "ar-MA" | "ar-EG" | "de" | "fr" | "en" | "es" | "es-AR" | "es-PE";

export interface Lingua {
  codice: CodiceLingua;
  /** Il nome come lo legge chi parla quella lingua. */
  nome: string;
  /** Il nome in italiano, per l'ufficio e per chi aiuta a scegliere. */
  nomeItaliano: string;
  rtl?: boolean;
  /** Per date e numeri (Intl). */
  locale: string;
}

export const LINGUE: readonly Lingua[] = [
  { codice: "it", nome: "Italiano", nomeItaliano: "Italiano", locale: "it-IT" },
  { codice: "ro", nome: "Română", nomeItaliano: "Rumeno", locale: "ro-RO" },
  { codice: "sq", nome: "Shqip", nomeItaliano: "Albanese", locale: "sq-AL" },
  { codice: "ar-MA", nome: "الدارجة المغربية", nomeItaliano: "Arabo marocchino", rtl: true, locale: "ar-MA" },
  { codice: "ar-EG", nome: "العامية المصرية", nomeItaliano: "Arabo egiziano", rtl: true, locale: "ar-EG" },
  { codice: "de", nome: "Deutsch", nomeItaliano: "Tedesco", locale: "de-DE" },
  { codice: "fr", nome: "Français", nomeItaliano: "Francese", locale: "fr-FR" },
  { codice: "en", nome: "English", nomeItaliano: "Inglese", locale: "en-GB" },
  { codice: "es", nome: "Español", nomeItaliano: "Spagnolo", locale: "es-ES" },
  { codice: "es-AR", nome: "Español (Argentina)", nomeItaliano: "Spagnolo argentino", locale: "es-AR" },
  { codice: "es-PE", nome: "Español (Perú)", nomeItaliano: "Spagnolo peruviano", locale: "es-PE" },
];

export const linguaDa = (codice: string | null | undefined): Lingua | undefined => LINGUE.find(l => l.codice === codice);

/** La lingua del telefono, se è una delle nostre: «ro-RO» → rumeno, «es-AR» → argentino, «ar-EG» → egiziano. */
export function linguaDelTelefono(lingueTelefono: readonly string[]): CodiceLingua | null {
  for (const grezza of lingueTelefono) {
    const tag = grezza.trim();
    const esatta = LINGUE.find(l => l.codice.toLowerCase() === tag.toLowerCase());
    if (esatta) return esatta.codice;
    const base = tag.split("-")[0].toLowerCase();
    const regione = tag.split("-")[1]?.toUpperCase();
    if (base === "ar") return regione === "EG" ? "ar-EG" : "ar-MA";
    if (base === "es") return regione === "AR" || regione === "UY" ? "es-AR" : regione === "PE" ? "es-PE" : "es";
    const perBase = LINGUE.find(l => l.codice === base);
    if (perBase) return perBase.codice;
  }
  return null;
}
