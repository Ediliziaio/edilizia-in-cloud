import { describe, expect, it } from "vitest";
import { eIPhoneNelBrowser, richiestaAvvisi } from "./avvisiTelefono";

const base = { permesso: "default", iscritto: false, iPhoneNelBrowser: false, momentoGiusto: true } as const;

describe("quando chiedere gli avvisi", () => {
  it("non chiede prima della timbratura", () => {
    expect(richiestaAvvisi({ ...base, momentoGiusto: false })).toBeNull();
  });
  it("chiede dopo la timbratura", () => {
    expect(richiestaAvvisi(base)).toBe("attiva");
  });
  it("non insiste con chi è iscritto o ha rifiutato", () => {
    expect(richiestaAvvisi({ ...base, iscritto: true })).toBeNull();
    expect(richiestaAvvisi({ ...base, permesso: "denied" })).toBeNull();
  });
  it("su iPhone nel browser spiega come aggiungerla alla Home", () => {
    expect(richiestaAvvisi({ ...base, permesso: "unsupported", iPhoneNelBrowser: true })).toBe("aggiungi_home");
    expect(richiestaAvvisi({ ...base, permesso: "unsupported" })).toBeNull();
  });
  it("riconosce l'iPhone nel browser, non quello aggiunto alla Home", () => {
    expect(eIPhoneNelBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", false)).toBe(true);
    expect(eIPhoneNelBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", true)).toBe(false);
    expect(eIPhoneNelBrowser("Mozilla/5.0 (Linux; Android 14)", false)).toBe(false);
  });
});
