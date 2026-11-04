import { describe, expect, it } from "vitest";
import { formattaMinuti, indicatori, percentuale, presenza } from "@/lib/reporting/callCenterNumeri";
import type { NumeriCallCenter } from "@/hooks/useCallCenterDashboard";

const vuoti: NumeriCallCenter = {
  chiamate: 0, contatti_chiamati: 0, contatti_raggiunti: 0, giorni_attivi: 0,
  appuntamenti_fissati: 0, appuntamenti_annullati: 0, svolti_totale: 0, svolti_presentati: 0,
  svolti_assenti: 0, lead_assegnati: 0, lead_chiamati: 0, lead_con_appuntamento: 0,
  mediana_minuti: null, entro_5_min: 0,
};

describe("numeri della Dashboard Call Center", () => {
  it("senza dati dice «non misurabile», non 0%", () => {
    expect(percentuale(0, 0)).toBeNull();
    expect(Object.values(indicatori(vuoti)).every((v) => v === null)).toBe(true);
  });

  it("zero su un totale vero è uno zero vero", () => {
    expect(percentuale(0, 10)).toBe(0);
  });

  it("la presenza non si calcola se quasi nessuno ha segnato l'esito", () => {
    expect(presenza({ ...vuoti, svolti_totale: 100, svolti_presentati: 5, svolti_assenti: 0 })).toBeNull();
  });

  it("la presenza conta solo gli appuntamenti con un esito", () => {
    expect(presenza({ ...vuoti, svolti_totale: 10, svolti_presentati: 6, svolti_assenti: 2 })).toBe(75);
  });

  it("tentativi e ritmo vengono dalle chiamate", () => {
    const i = indicatori({ ...vuoti, chiamate: 30, contatti_chiamati: 20, giorni_attivi: 3 });
    expect(i.tentativiPerContatto).toBe(1.5);
    expect(i.chiamateAlGiorno).toBe(10);
  });

  it("il tempo si legge nell'unità giusta", () => {
    expect(formattaMinuti(null)).toBe("—");
    expect(formattaMinuti(4)).toBe("4 min");
    expect(formattaMinuti(90)).toBe("1.5 ore");
    expect(formattaMinuti(2880)).toBe("2 giorni");
  });
});
