import { describe, expect, it } from "vitest";
import { indirizzoCantiereDaTesto, indirizzoCantiereDaBozza, testoIndirizzoCantiere, coordinateIndirizzoCantiere } from "@/lib/orders/indirizzoCantiere";
const indirizzo = { ...indirizzoCantiereDaTesto("Via Roma 1, Milano"), lat: 45, lng: 9, place_id: "posto" };
describe("indirizzo e coordinate della nuova commessa", () => {
  it("le bozze vecchie/manuali non inventano coordinate", () => {
    expect(indirizzoCantiereDaBozza(undefined, "Via Roma")).toBeNull();
    expect(coordinateIndirizzoCantiere(indirizzoCantiereDaTesto("Via Roma"), "Via Roma")).toEqual({});
  });
  it("il risultato scelto e la bozza mantengono le coordinate corrette", () => {
    expect(indirizzoCantiereDaBozza(JSON.parse(JSON.stringify(indirizzo)), indirizzo.formatted_address)).toEqual(indirizzo);
    expect(coordinateIndirizzoCantiere(indirizzo, indirizzo.formatted_address)).toEqual({ work_lat: 45, work_lng: 9 });
  });
  it("un indirizzo diverso non eredita le coordinate del precedente", () => {
    expect(indirizzoCantiereDaBozza(indirizzo, "Altro cantiere")).toBeNull();
    expect(coordinateIndirizzoCantiere(indirizzo, "Altro cantiere")).toEqual({});
  });
  it("coordinate incomplete o fuori intervallo non entrano nella commessa", () => {
    for (const patch of [{ lat: 200 }, { lng: -200 }, { lat: NaN }, { lng: null }]) expect(coordinateIndirizzoCantiere({ ...indirizzo, ...patch }, indirizzo.formatted_address)).toEqual({});
  });
  it("i campi manuali producono un indirizzo completo senza duplicare il testo formattato", () => {
    expect(testoIndirizzoCantiere({ ...indirizzo, formatted_address: "", address_line: "Via nuova 5", address_city: "Roma", address_postal_code: "00100", address_province: "RM" })).toBe("Via nuova 5, 00100 Roma, RM");
  });
});
