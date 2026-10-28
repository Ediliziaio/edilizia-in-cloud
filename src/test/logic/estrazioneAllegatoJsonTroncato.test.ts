/**
 * Le cinque estrazioni ferme su `parse_failed` il 28/10/2026 avevano tutte la
 * stessa forma: ```json più un oggetto scritto in bella copia e interrotto a
 * metà dal tetto di 1500 token. Il vecchio `match(/\{[\s\S]*\}/)` prendeva fino
 * all'ultima graffa interna e consegnava a JSON.parse un frammento.
 */
import { describe, expect, it } from "vitest";
import { jsonDalModello } from "../../../supabase/functions/email-ai-estrai-allegato/jsonDalModello";

const COMPLETO = `\`\`\`json
{
  "tipo": "fattura",
  "confidenza_tipo": 0.98,
  "campi": {
    "fornitore_ragione_sociale": { "valore": "Berner S.p.A.", "conf": 0.99 },
    "piva": { "valore": "02098690155", "conf": 0.97 }
  }
}
\`\`\``;

// La risposta vera, tagliata dove la tagliava il tetto dei token.
const TRONCATO = `\`\`\`json
{
  "tipo": "fattura",
  "confidenza_tipo": 0.98,
  "campi": {
    "fornitore_ragione_sociale": {
      "valore": "Berner S.p.A.",
      "conf": 0.99
    },
    "piva": {
      "valore": "0209`;

describe("estrazione allegato: il JSON del modello", () => {
  it("prende l'oggetto dentro la staccionata markdown", () => {
    const { json, troncato } = jsonDalModello(COMPLETO);
    expect(troncato).toBe(false);
    expect(JSON.parse(json!).campi.piva.valore).toBe("02098690155");
  });

  it("la risposta troncata si riconosce invece di finire in JSON.parse", () => {
    const { json, troncato } = jsonDalModello(TRONCATO);
    expect(troncato).toBe(true);
    expect(json).toBeNull();
    // Il comportamento di prima: un frammento che non si parsa.
    const vecchio = TRONCATO.match(/\{[\s\S]*\}/);
    expect(vecchio).not.toBeNull();
    expect(() => JSON.parse(vecchio![0])).toThrow();
  });

  it("funziona anche senza staccionata", () => {
    const { json } = jsonDalModello('{"tipo":"ddt","campi":{}}');
    expect(JSON.parse(json!).tipo).toBe("ddt");
  });

  it("le graffe dentro le stringhe non chiudono l'oggetto", () => {
    const { json, troncato } = jsonDalModello('{"note":"importo {non} leggibile","tipo":"altro"}');
    expect(troncato).toBe(false);
    expect(JSON.parse(json!).note).toBe("importo {non} leggibile");
  });

  it("prosa intorno all'oggetto non lo rompe", () => {
    const { json } = jsonDalModello('Ecco il risultato:\n{"tipo":"proforma"}\nFine. (tutto ok}');
    expect(JSON.parse(json!).tipo).toBe("proforma");
  });

  it("nessun oggetto = nessun JSON e nessun troncamento", () => {
    expect(jsonDalModello("Non riesco a leggere il documento.")).toEqual({ json: null, troncato: false });
    expect(jsonDalModello(null)).toEqual({ json: null, troncato: false });
  });
});
