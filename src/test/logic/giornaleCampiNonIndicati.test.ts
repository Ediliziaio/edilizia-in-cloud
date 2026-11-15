/**
 * Giornale dei lavori (15/11/2026, simulazione su Impresa Vulcano): 0% è il valore di partenza, non un avanzamento;
 * la temperatura scritta come numero ha l'unità; il totale dice «giornate uomo».
 */
import { describe, expect, it } from "vitest";
import { buildGiornaleHtml, type AziendaDocumentoGiornale, type GiornataDocumento } from "../../../supabase/functions/_shared/documentoGiornale";

const g = (data: string, extra: Partial<GiornataDocumento> = {}): GiornataDocumento => ({
  id: data, data_lavori: data, stato: "bozza", condizioni_meteo: "soleggiato", lavorazioni_eseguite: "MURATURE IN YTONG", materiali_utilizzati: null,
  personale_presente: 2, note: null, avanzamento_percentuale: 0, temperatura: "", firmato_da: null, firmato_il: null, ...extra,
});
const azienda: AziendaDocumentoGiornale = { ragione_sociale: "Prova S.r.l.", partita_iva: null, colore_primario: null, logo_url: null };
const html = (giornate: GiornataDocumento[]) => buildGiornaleHtml(giornate, { description: "Villa", order_code: "25000068" }, azienda, "EiC", "00000000-0000-0000-0000-000000000001");

describe("giornale: campi non indicati", () => {
  it("avanzamento 0 su tutte le giornate: nessun «Avanzamento: 0%», nessun «Ultimo avanzamento»", () => {
    const h = html([g("2026-11-11"), g("2026-11-10")]);
    expect(h).not.toContain("Avanzamento: 0%");
    expect(h).not.toContain("Ultimo avanzamento");
    expect(h).toContain("Presenze: <strong>4</strong> giornate uomo");
  });
  it("l'ultimo avanzamento è il più recente indicato; la temperatura numerica prende °C", () => {
    const h = html([g("2026-11-11", { temperatura: "12" }), g("2026-11-10", { avanzamento_percentuale: 40, temperatura: "14°C" })]);
    expect(h).toContain("Ultimo avanzamento: <strong>40%</strong>");
    expect(h).toContain("Avanzamento: 40%");
    expect(h).toContain("Temperatura: 12 °C");
    expect(h).toContain("Temperatura: 14°C");
  });
});
