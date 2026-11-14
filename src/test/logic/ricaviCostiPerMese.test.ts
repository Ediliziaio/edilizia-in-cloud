// Ricavi e costi mese per mese dalla contabilità generale (14/11/2026): il grafico del Bilancio.
import { describe, expect, it } from "vitest";
import { ricaviECostiPerMese } from "@/lib/contabilita/bilancioCee";
import type { ContoContabile, Scrittura } from "@/lib/contabilita/libroGiornale";

const conto = (id: string, codice: string, natura: ContoContabile["natura"]): ContoContabile =>
  ({ id, codice, descrizione: codice, natura, sezione_cee: null, voce_cee: null, mastro_id: null, movimentabile: true, attivo: true });
const conti = [conto("cli", "05.01", "attivo"), conto("for", "13.01", "passivo"), conto("mp", "30.01", "costo"), conto("ric", "20.01", "ricavo"), conto("ut", "10.05", "passivo")];
const scrittura = (id: string, data: string, righe: Array<[string, number, number]>, origine = "manuale"): Scrittura =>
  ({ id, esercizio: 2026, numero: 1, data_registrazione: data, causale: "x", descrizione: null, documento_numero: null, documento_data: null, origine, storno_di: null,
    contabilita_righe: righe.map(([conto_id, dare, avere], i) => ({ riga: i + 1, conto_id, dare, avere, descrizione: null as string | null })) } as unknown as Scrittura);

describe("Ricavi e costi mese per mese", () => {
  const scritture = [
    scrittura("a", "2026-01-15", [["cli", 5000, 0], ["ric", 0, 5000]]),
    scrittura("b", "2026-01-31", [["mp", 1200, 0], ["for", 0, 1200]]),
    scrittura("c", "2026-03-02", [["mp", 800.5, 0], ["for", 0, 800.5]]),
    // L'epilogo di chiusura azzera costi e ricavi: non deve togliere niente ai mesi.
    scrittura("z", "2026-12-31", [["ric", 5000, 0], ["mp", 0, 2000.5], ["ut", 0, 2999.5]], "chiusura"),
  ];
  const mesi = ricaviECostiPerMese(scritture, conti, 2026);

  it("dodici mesi, ognuno con quello che è stato registrato in quel mese", () => {
    expect(mesi).toHaveLength(12);
    expect(mesi[0]).toEqual({ mese: 1, ricavi: 5000, costi: 1200 });
    expect(mesi[1]).toEqual({ mese: 2, ricavi: 0, costi: 0 });
    expect(mesi[2]).toEqual({ mese: 3, ricavi: 0, costi: 800.5 });
  });

  it("la chiusura dell'esercizio non entra in dicembre", () => {
    expect(mesi[11]).toEqual({ mese: 12, ricavi: 0, costi: 0 });
  });
});
