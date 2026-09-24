/**
 * Tipi per lo script che calcola il CSS da mettere dentro ogni pagina
 * prerenderizzata (scripts/cssCritico.mjs). Lo script è JavaScript puro perché
 * gira nella build senza compilazione; qui i tipi servono solo al test che lo
 * importa.
 */
declare module "*/cssCritico.mjs" {
  export interface FoglioPreparato {
    radice: unknown;
    selettori: string[];
  }
  export function daCercare(parte: string): string;
  export function preparaFoglio(testo: string, indirizzo: string): FoglioPreparato;
  export function valutaSelettori(lista: string[]): boolean[];
  export function cssCritico(foglio: FoglioPreparato, servono: Set<string>): string;
}
