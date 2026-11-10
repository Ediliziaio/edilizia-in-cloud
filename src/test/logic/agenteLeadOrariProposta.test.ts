/**
 * Gli orari che l'assistente dei lead vede, e i giorni in cui l'azienda è
 * chiusa (10/11/2026).
 *
 * Due casi veri di Il Bagno Group:
 * - il «Calendario Giusy» è aperto 09:30–11:30 e 13:30–17:00, cioè undici
 *   orari da mezz'ora. Tenendo i primi sei, l'assistente non sapeva niente di
 *   quelli dopo le 14:00 e a chi chiedeva «verso le 16» diceva che non c'era
 *   posto;
 * - le fasce dei calendari sono settimanali, quindi il 25 dicembre era un
 *   mercoledì come gli altri e ci si poteva fissare un appuntamento.
 */
import { describe, expect, it } from "vitest";
import { campiona, dateDiChiusura } from "../../../supabase/functions/lead-agente-whatsapp/orariProposta";

const MARTEDI_GIUSY = [
  "09:30", "10:00", "10:30", "11:00",
  "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
];

describe("campiona", () => {
  it("il pomeriggio tardi non sparisce più dalla giornata di Giusy", () => {
    const visti = campiona(MARTEDI_GIUSY, 6);
    expect(visti).toHaveLength(6);
    expect(visti[0]).toBe("09:30");
    expect(visti[visti.length - 1]).toBe("16:30");
    expect(visti.some((o) => o >= "15:00")).toBe(true);
  });

  it("gli orari restano in ordine e sono tutti davvero liberi", () => {
    const visti = campiona(MARTEDI_GIUSY, 6);
    expect([...visti].sort()).toEqual(visti);
    expect(new Set(visti).size).toBe(visti.length);
    for (const o of visti) expect(MARTEDI_GIUSY).toContain(o);
  });

  it("se ce ne sono pochi li dà tutti, senza inventarne", () => {
    expect(campiona(["09:30", "10:00"], 6)).toEqual(["09:30", "10:00"]);
    expect(campiona([], 6)).toEqual([]);
  });

  it("un solo orario chiesto, o nessuno", () => {
    expect(campiona(MARTEDI_GIUSY, 1)).toEqual(["09:30"]);
    expect(campiona(MARTEDI_GIUSY, 0)).toEqual([]);
  });
});

describe("dateDiChiusura", () => {
  it("una festività ricorrente vale per l'anno in corso e per il prossimo", () => {
    const chiuso = dateDiChiusura([{ data: "2026-12-25", ricorrente: true }], [2026, 2027]);
    expect(chiuso.has("2026-12-25")).toBe(true);
    expect(chiuso.has("2027-12-25")).toBe(true);
  });

  it("una chiusura di un anno solo non si ripete", () => {
    const chiuso = dateDiChiusura([{ data: "2026-12-24", ricorrente: false }], [2026, 2027]);
    expect(chiuso.has("2026-12-24")).toBe(true);
    expect(chiuso.has("2027-12-24")).toBe(false);
  });

  it("le righe senza una data vera non chiudono niente", () => {
    expect(dateDiChiusura([{ data: null }, { data: "boh", ricorrente: true }], [2026]).size).toBe(0);
  });
});
