import { describe, expect, it } from "vitest";
import { buoniDelMese, motivoSenzaBuoni, riepilogoMese, sogliaLeggibile, spostaMese, type BuonoPasto, type RegoleBuoni } from "@/lib/campo/buoniPasto";

const b = (giorno: string, stato: BuonoPasto["stato"], importo = 8): BuonoPasto => ({ id: giorno + stato, giorno, tipo: "fisso", importo, stato });
const regole: RegoleBuoni = { buono_pasto_attivo: true, buono_pasto_modalita: "fisso", buono_pasto_valore: 8, buono_pasto_soglia_ore: 6.5 };

describe("buoni pasto dell'operaio", () => {
  it("conta il mese senza gli annullati e separa quelli già ricevuti", () => {
    const tutti = [b("2026-11-03", "erogato"), b("2026-11-04", "maturato"), b("2026-11-05", "annullato"), b("2026-10-30", "erogato"), b("2026-11-06", "da_erogare", 7.5)];
    const novembre = buoniDelMese(tutti, "2026-11");
    expect(novembre.map(x => x.giorno)).toEqual(["2026-11-06", "2026-11-05", "2026-11-04", "2026-11-03"]);
    expect(riepilogoMese(novembre)).toEqual({ validi: 3, totale: 23.5, erogati: 1, daRicevere: 2 });
  });

  it("dice perché non ci sono buoni: azienda spenta o persona non abilitata", () => {
    expect(motivoSenzaBuoni(null, true)).toBe("azienda");
    expect(motivoSenzaBuoni({ ...regole, buono_pasto_attivo: false }, true)).toBe("azienda");
    expect(motivoSenzaBuoni(regole, false)).toBe("persona");
    expect(motivoSenzaBuoni(regole, true)).toBeNull();
  });

  it("scrive la soglia come la legge un italiano, e niente soglia se servono solo gli scontrini", () => {
    expect(sogliaLeggibile(regole)).toBe("6,5");
    expect(sogliaLeggibile({ ...regole, buono_pasto_soglia_ore: 6 })).toBe("6");
    expect(sogliaLeggibile({ ...regole, buono_pasto_modalita: "ricevuta" })).toBeNull();
  });

  it("sposta il mese anche a cavallo d'anno", () => {
    expect(spostaMese("2026-01", -1)).toBe("2025-12");
    expect(spostaMese("2026-12", 1)).toBe("2027-01");
  });
});
