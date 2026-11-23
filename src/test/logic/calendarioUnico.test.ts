import { describe, expect, it } from "vitest";
import { tipoCalendario } from "@/lib/calendar/calendarioUnico";

describe("tipoCalendario: un solo calendario, ognuno vede il suo", () => {
  it("il commerciale vede solo i commerciali, anche se l'indirizzo chiede i lavori", () => {
    expect(tipoCalendario({ vedeLavori: false, vedeCommerciale: true, richiesto: "lavori" })).toBe("commerciali");
  });
  it("chi non ha il CRM vede solo i lavori", () => {
    expect(tipoCalendario({ vedeLavori: true, vedeCommerciale: false, richiesto: "commerciali", ricordato: "commerciali" })).toBe("lavori");
  });
  it("chi li ha entrambi: prima l'indirizzo, poi l'ultima scelta, poi i lavori", () => {
    expect(tipoCalendario({ vedeLavori: true, vedeCommerciale: true, richiesto: "commerciali", ricordato: "lavori" })).toBe("commerciali");
    expect(tipoCalendario({ vedeLavori: true, vedeCommerciale: true, richiesto: null, ricordato: "commerciali" })).toBe("commerciali");
    expect(tipoCalendario({ vedeLavori: true, vedeCommerciale: true, richiesto: "boh", ricordato: "boh" })).toBe("lavori");
  });
});
