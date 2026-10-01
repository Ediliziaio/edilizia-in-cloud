/**
 * Importare di nuovo lo zip del portale (01/10/2026): una fattura già registrata
 * coi soli dati (senza il file XML) viene completata con l'originale; una già
 * completa resta com'è e non si duplica. Il database lascia scrivere xml_raw una
 * volta sola, quindi il completamento passa solo da qui.
 */
import { describe, expect, it } from "vitest";
import { salvaFatturaRicevuta } from "../../../supabase/functions/_shared/salvaFatturaRicevuta";

const letta = {
  cedente_piva: "01158300937", cedente_cf: "", cedente_ragione_sociale: "GRAN BAR", cedente_paese: "IT", cedente_indirizzo: "", cedente_cap: "",
  cedente_comune: "", cedente_provincia: "", cessionario_piva: "01941970939", cessionario_cf: "", tipo_documento: "TD01", numero_fattura: "1297",
  data_fattura: "2026-09-21", imponibile_totale: 27.27, iva_totale: 2.73, totale_documento: 30, righe: [], riepilogo_iva: [],
  sdi_id_trasmissione: "", sdi_progressivo: "", fatture_nel_file: 1,
} as never;

type Esito = { data: unknown; error: null };

function finto(esistente: Record<string, unknown> | null) {
  const aggiornamenti: Array<Record<string, unknown>> = [];
  const caricati: string[] = [];
  let inserimenti = 0;
  const catena = (): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    const self = (): Record<string, unknown> => q;
    q.select = self;
    q.eq = self;
    q.limit = self;
    q.maybeSingle = async (): Promise<Esito> => ({ data: esistente, error: null });
    q.update = (campi: Record<string, unknown>) => {
      aggiornamenti.push(campi);
      return { eq: async (): Promise<{ error: null }> => ({ error: null }) };
    };
    q.insert = () => {
      inserimenti++;
      return { select: () => ({ single: async (): Promise<Esito> => ({ data: { id: "nuova" }, error: null }) }) };
    };
    return q;
  };
  return {
    client: {
      from: catena,
      storage: {
        from: () => ({
          upload: async (percorso: string): Promise<{ error: null }> => {
            caricati.push(percorso);
            return { error: null };
          },
        }),
      },
    },
    aggiornamenti,
    caricati,
    inserimenti: () => inserimenti,
  };
}

const xml = '<?xml version="1.0"?>\r\n<p:FatturaElettronica>...</p:FatturaElettronica>';
const originale = new TextEncoder().encode(xml);

describe("importare di nuovo lo zip", () => {
  it("completa una fattura registrata coi soli dati: scrive l'XML e il file, toglie la nota", async () => {
    const f = finto({ id: "gia", openapi_id: null, xml_raw: null, note: "Dati caricati dallo zip di Aruba del 01/10/2026. Il file XML originale si aggiunge importando lo zip." });
    const esito = await salvaFatturaRicevuta(f.client, { companyId: "az", xml, originale, letta });
    expect(esito).toMatchObject({ id: "gia", doppione: true, completata: true });
    expect(f.caricati.length).toBe(1);
    expect(f.aggiornamenti[0].xml_raw).toBe(xml);
    expect(f.aggiornamenti[0].note).toBeNull();
    expect(f.inserimenti()).toBe(0);
  });

  it("una fattura già completa non si tocca e non si duplica", async () => {
    const f = finto({ id: "gia", openapi_id: null, xml_raw: "<x/>", note: null });
    const esito = await salvaFatturaRicevuta(f.client, { companyId: "az", xml, originale, letta });
    expect(esito).toEqual({ id: "gia", doppione: true });
    expect(f.caricati.length).toBe(0);
    expect(f.aggiornamenti.length).toBe(0);
    expect(f.inserimenti()).toBe(0);
  });

  it("una fattura nuova si inserisce come prima", async () => {
    const f = finto(null);
    const esito = await salvaFatturaRicevuta(f.client, { companyId: "az", xml, originale, letta });
    expect(esito.doppione).toBe(false);
    expect(f.inserimenti()).toBe(1);
  });
});
