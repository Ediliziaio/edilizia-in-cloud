/**
 * I dizionari delle lingue (dizionari/*.ts, 567.000 righe) si importano con il suffisso «?dizionario»: così
 * TypeScript usa questo tipo e non analizza le frasi una per una (tsconfig.app.json esclude la cartella).
 * Vite toglie il suffisso. In sviluppo e nei test `default` è l'oggetto; nella build il plugin
 * `dizionariComeJson` (vite.config.ts) lo sostituisce con `carica`, che scarica il JSON.
 */
declare module "*?dizionario" {
  const dizionario: Readonly<Record<string, string>>;
  export default dizionario;
  export const carica: (() => Promise<Readonly<Record<string, string>>>) | undefined;
}
