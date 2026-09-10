/**
 * Tipi per lo script che il CI usa per decidere quali edge function
 * ripubblicare (scripts/funzioni-da-ripubblicare.mjs). Lo script è JavaScript
 * puro perché gira nel job di deploy senza compilazione; qui i tipi servono
 * solo al test che lo importa.
 */
declare module "*/funzioni-da-ripubblicare.mjs" {
  export function funzioniDaRipubblicare(fileCambiati: string[]): string[];
}
