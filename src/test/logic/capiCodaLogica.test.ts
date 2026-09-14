/**
 * Coda delle conversioni CRM verso Meta: niente tentativi infiniti, niente
 * eventi scaduti, niente lavoro per chi non ha un pixel CAPI.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aziendeConPixelAttivo,
  eventoTroppoVecchio,
  FINESTRA_META_SECONDI,
  MAX_TENTATIVI_CAPI,
} from "../../../supabase/functions/_shared/capiCodaLogica";

const ROOT = join(__dirname, "../../..");
const funzione = readFileSync(join(ROOT, "supabase/functions/meta-crm-conversion-sync/index.ts"), "utf8");

describe("eventoTroppoVecchio", () => {
  const ora = Date.parse("2026-09-15T12:00:00Z");
  const sec = (iso: string) => Date.parse(iso) / 1000;

  it("un evento di ieri si manda, uno di giugno no", () => {
    expect(eventoTroppoVecchio(sec("2026-09-14T12:00:00Z"), ora)).toBe(false);
    expect(eventoTroppoVecchio(sec("2026-06-08T12:00:00Z"), ora)).toBe(true);
  });

  it("al limite dei 7 giorni tiene un'ora di margine", () => {
    expect(eventoTroppoVecchio(ora / 1000 - FINESTRA_META_SECONDI + 7200, ora)).toBe(false);
    expect(eventoTroppoVecchio(ora / 1000 - FINESTRA_META_SECONDI + 1800, ora)).toBe(true);
  });

  it("un tempo non valido non scarta l'evento", () => {
    expect(eventoTroppoVecchio(Number.NaN, ora)).toBe(false);
  });
});

describe("aziendeConPixelAttivo", () => {
  it("toglie doppioni e righe vuote", () => {
    expect(aziendeConPixelAttivo([{ company_id: "a" }, { company_id: "a" }, { company_id: null }, { company_id: "b" }])).toEqual(["a", "b"]);
    expect(aziendeConPixelAttivo(null)).toEqual([]);
  });
});

describe("meta-crm-conversion-sync", () => {
  it("lavora solo le aziende con pixel CAPI e si ferma dopo i tentativi massimi", () => {
    expect(MAX_TENTATIVI_CAPI).toBe(5);
    expect(funzione).toMatch(/from\("meta_conversion_pixel"\)/);
    expect(funzione).toMatch(/attempt_count\.lt\.\$\{MAX_TENTATIVI_CAPI\}/);
    expect(funzione).toMatch(/query\.in\("company_id", aziendeConPixel\)/);
  });

  it("scarta con il motivo gli eventi più vecchi di 7 giorni prima di chiamare Meta", () => {
    const iScarto = funzione.indexOf('reason: "troppo_vecchio"');
    const iInvio = funzione.indexOf("functions/v1/meta-capi-send-event");
    expect(iScarto).toBeGreaterThan(0);
    expect(iScarto).toBeLessThan(iInvio);
  });
});
