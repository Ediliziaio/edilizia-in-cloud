import { describe, it, expect } from "vitest";
import { parseGeocodeGoogle } from "../../../supabase/functions/_shared/forwardGeocode";

/**
 * Test del parser Google Geocoding (supabase/functions/_shared/forwardGeocode.ts,
 * gemello in fv-geocode/index.ts). Fino al 25/09/2026 provava una copia in
 * src/lib/fotovoltaico/geocode.ts che nessuna pagina usava.
 */

const respMilano = {
  status: "OK",
  results: [
    {
      formatted_address: "Via Roma 1, 20100 Milano MI, Italia",
      geometry: { location: { lat: 45.4642, lng: 9.19 } },
      address_components: [
        { long_name: "Milano", short_name: "Milano", types: ["locality", "political"] },
        { long_name: "Milano", short_name: "MI", types: ["administrative_area_level_2", "political"] },
        { long_name: "Lombardia", short_name: "Lombardia", types: ["administrative_area_level_1"] },
        { long_name: "20100", short_name: "20100", types: ["postal_code"] },
        { long_name: "Italia", short_name: "IT", types: ["country", "political"] },
      ],
    },
  ],
};

describe("parseGeocodeGoogle", () => {
  it("estrae coordinate e componenti dall'indirizzo", () => {
    const r = parseGeocodeGoogle(respMilano)!;
    expect(r.lat).toBeCloseTo(45.4642, 4);
    expect(r.lng).toBeCloseTo(9.19, 4);
    expect(r.comune).toBe("Milano");
    expect(r.provincia).toBe("MI");
    expect(r.regione).toBe("Lombardia");
    expect(r.cap).toBe("20100");
    expect(r.in_italia).toBe(true);
    expect(r.formatted).toContain("Milano");
  });

  it("status non OK → null", () => {
    expect(parseGeocodeGoogle({ status: "ZERO_RESULTS", results: [] })).toBeNull();
    expect(parseGeocodeGoogle({ status: "REQUEST_DENIED" })).toBeNull();
  });

  it("nessun risultato o geometria assente → null", () => {
    expect(parseGeocodeGoogle({ status: "OK", results: [] })).toBeNull();
    expect(
      parseGeocodeGoogle({ status: "OK", results: [{ formatted_address: "x" }] }),
    ).toBeNull();
  });

  it("in_italia=false per coordinate fuori dall'Italia (es. Parigi)", () => {
    const r = parseGeocodeGoogle({
      status: "OK",
      results: [
        {
          formatted_address: "Paris, France",
          geometry: { location: { lat: 48.8566, lng: 2.3522 } },
          address_components: [{ long_name: "France", short_name: "FR", types: ["country"] }],
        },
      ],
    })!;
    expect(r.in_italia).toBe(false);
  });

  it("componenti mancanti → campi null ma lat/lng presenti", () => {
    const r = parseGeocodeGoogle({
      status: "OK",
      results: [{ geometry: { location: { lat: 41.9, lng: 12.5 } }, address_components: [] }],
    })!;
    expect(r.lat).toBe(41.9);
    expect(r.comune).toBeNull();
    expect(r.provincia).toBeNull();
    expect(r.in_italia).toBe(true); // dentro la bbox Italia
  });
});
