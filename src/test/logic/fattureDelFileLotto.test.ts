import { describe, expect, it } from "vitest";
import { DbFinto } from "../helpers/dbFinto";
import { salvaFattureDelFile } from "../../../supabase/functions/_shared/salvaFatturaRicevuta";

// Una fattura letta, ridotta a quello che il salvataggio usa.
const letta = (numero: string, nelFile: number) => ({
  cedente_piva: "01234567890", cedente_cf: null, cedente_ragione_sociale: "Edil Forniture", cedente_paese: "IT",
  cedente_indirizzo: null, cedente_cap: null, cedente_comune: null, cedente_provincia: null,
  tipo_documento: "TD01", numero_fattura: numero, data_fattura: "2026-10-31",
  imponibile_totale: 100, iva_totale: 22, totale_documento: 122, righe: [], riepilogo_iva: [],
  sdi_id_trasmissione: null, sdi_progressivo: null, fatture_nel_file: nelFile, note_import: null,
}) as never;

describe("file SDI con più fatture (lotto), 01/11/2026", () => {
  it("salva tutte le fatture del file, ognuna col suo indice; l'id openapi resta alla prima", async () => {
    const db = new DbFinto({ fatture_ricevute: [] });
    const esito = await salvaFattureDelFile(db.client, { companyId: "c1", xml: "<x/>", openapiId: "oa-1" }, letta("A-1", 3),
      (i) => letta(`A-${i + 1}`, 3));
    expect(esito.errore).toBeUndefined();
    expect(esito.altre).toBe(2);
    const righe = db.tabelle.fatture_ricevute;
    expect(righe.map((r) => [r.numero_fattura, r.indice_corpo, r.openapi_id])).toEqual([
      ["A-1", 0, "oa-1"], ["A-2", 1, null], ["A-3", 2, null],
    ]);
    expect(righe.some((r) => /registrate a mano/.test(String(r.note ?? "")))).toBe(false);
  });

  it("rifatto due volte non crea doppioni", async () => {
    const db = new DbFinto({ fatture_ricevute: [] });
    const base = { companyId: "c1", xml: "<x/>", openapiId: "oa-1" };
    await salvaFattureDelFile(db.client, base, letta("A-1", 2), (i) => letta(`A-${i + 1}`, 2));
    const seconda = await salvaFattureDelFile(db.client, base, letta("A-1", 2), (i) => letta(`A-${i + 1}`, 2));
    expect(seconda.doppione).toBe(true);
    expect(seconda.altre).toBe(0);
    expect(db.tabelle.fatture_ricevute).toHaveLength(2);
  });

  it("una fattura sola nel file: come prima", async () => {
    const db = new DbFinto({ fatture_ricevute: [] });
    const esito = await salvaFattureDelFile(db.client, { companyId: "c1", xml: "<x/>" }, letta("B-1", 1), () => null);
    expect(esito.altre).toBe(0);
    expect(db.tabelle.fatture_ricevute).toHaveLength(1);
  });
});
