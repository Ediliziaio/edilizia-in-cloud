/**
 * Riconciliazione fatture ↔ commesse.
 *
 * Il rischio vero non è mancare un abbinamento: è farne uno sbagliato. Un
 * ricavo attaccato al cantiere sbagliato falsa il margine di DUE commesse e
 * nessuno se ne accorge. Questi test insistono soprattutto su quando NON si
 * deve agganciare da soli.
 */

import { describe, it, expect } from "vitest";
import {
  normalizzaPiva,
  normalizzaRagioneSociale,
  stessoImporto,
  codiceCommessaNelTesto,
  valutaAbbinamento,
  riconcilia,
  type FatturaDaAbbinare,
  type CommessaCandidata,
} from "@/lib/fatture/riconciliazione";

const fattura = (p: Partial<FatturaDaAbbinare> = {}): FatturaDaAbbinare => ({
  id: "f1",
  numero: "2026/145",
  testo: "Acconto lavori",
  totale: 5000,
  data: "2026-05-10",
  ...p,
});

const commessa = (p: Partial<CommessaCandidata> = {}): CommessaCandidata => ({
  id: "c1",
  order_code: "ORD-2026-0031",
  ...p,
});

describe("normalizzazioni", () => {
  it("la partita IVA sopravvive a spazi, punti e prefisso IT", () => {
    expect(normalizzaPiva("IT 012 345 678 90")).toBe("01234567890");
    expect(normalizzaPiva("IT01234567890")).toBe(normalizzaPiva("01234567890"));
  });

  it("la ragione sociale sopravvive alle dieci forme di 'S.r.l.'", () => {
    expect(normalizzaRagioneSociale("Costruzioni Bianchi S.r.l."))
      .toBe(normalizzaRagioneSociale("COSTRUZIONI BIANCHI SRL"));
    expect(normalizzaRagioneSociale("Edilizia Rossi S.p.A."))
      .toBe(normalizzaRagioneSociale("edilizia rossi spa"));
  });

  it("due ditte diverse restano diverse", () => {
    expect(normalizzaRagioneSociale("Costruzioni Bianchi Srl"))
      .not.toBe(normalizzaRagioneSociale("Costruzioni Bianchini Srl"));
  });

  it("gli importi si confrontano in centesimi", () => {
    expect(stessoImporto(1000.1, 1000.1)).toBe(true);
    expect(stessoImporto(0.1 + 0.2, 0.3)).toBe(true); // virgola mobile
    expect(stessoImporto(1000, 1000.5)).toBe(false);
  });
});

describe("codice commessa nel testo", () => {
  it("lo trova nel numero o nell'oggetto", () => {
    expect(codiceCommessaNelTesto("Fatt. 145 rif. ORD-2026-0031", ["ORD-2026-0031"]))
      .toBe("ORD-2026-0031");
  });

  it("ignora i codici troppo corti, che comparirebbero ovunque", () => {
    expect(codiceCommessaNelTesto("ACCONTO LAVORI", ["A1"])).toBeNull();
  });

  it("fra due codici presenti vince il più lungo (il più specifico)", () => {
    expect(codiceCommessaNelTesto("rif ORD-2026-0031", ["ORD-2026", "ORD-2026-0031"]))
      .toBe("ORD-2026-0031");
  });
});

describe("valutazione di un singolo candidato", () => {
  it("nessun indizio = nessun candidato (non un candidato debole)", () => {
    expect(valutaAbbinamento(fattura({ testo: "Acconto" }), commessa())).toBeNull();
  });

  it("il codice scritto in fattura basta da solo per la certezza", () => {
    const a = valutaAbbinamento(fattura({ testo: "rif. ORD-2026-0031" }), commessa());
    expect(a?.confidenza).toBe("certa");
    expect(a?.motivi.map((m) => m.codice)).toContain("codice_in_fattura");
  });

  it("stessa partita IVA da sola è solo probabile: il cliente può avere più cantieri", () => {
    const a = valutaAbbinamento(
      fattura({ clientePiva: "IT01234567890" }),
      commessa({ clientePiva: "01234567890" }),
    );
    expect(a?.confidenza).toBe("probabile");
  });

  it("cliente + importo che combacia con una rata diventa certezza", () => {
    const a = valutaAbbinamento(
      fattura({ clientePiva: "01234567890", totale: 5000 }),
      commessa({
        clientePiva: "01234567890",
        rate: [
          { id: "r1", label: "Acconto", amount: 5000, is_paid: false },
          { id: "r2", label: "Saldo", amount: 12000, is_paid: false },
        ],
      }),
    );
    expect(a?.confidenza).toBe("certa");
    expect(a?.rataId).toBe("r1");
  });

  it("una rata già coperta da un'altra fattura non si riusa", () => {
    const a = valutaAbbinamento(
      fattura({ clientePiva: "01234567890", totale: 5000 }),
      commessa({
        clientePiva: "01234567890",
        rate: [{ id: "r1", label: "Acconto", amount: 5000, is_paid: false, invoice_id: "altra" }],
      }),
    );
    expect(a?.rataId).toBeNull();
    expect(a?.motivi.map((m) => m.codice)).not.toContain("importo_uguale_a_rata");
  });

  it("due rate dello stesso importo non indicano quale: nessun aggancio alla rata", () => {
    const a = valutaAbbinamento(
      fattura({ clientePiva: "01234567890", totale: 5000 }),
      commessa({
        clientePiva: "01234567890",
        rate: [
          { id: "r1", label: "Acconto 1", amount: 5000, is_paid: false },
          { id: "r2", label: "Acconto 2", amount: 5000, is_paid: false },
        ],
      }),
    );
    expect(a?.rataId).toBeNull();
  });
});

describe("scelta fra più commesse", () => {
  it("aggancia da solo quando c'è una sola commessa certa", () => {
    const esito = riconcilia(fattura({ testo: "rif. ORD-2026-0031" }), [
      commessa({ id: "c1", order_code: "ORD-2026-0031" }),
      commessa({ id: "c2", order_code: "ORD-2026-0099" }),
    ]);
    expect(esito.agganciabileDaSolo).toBe(true);
    expect(esito.migliore?.commessaId).toBe("c1");
  });

  it("NON aggancia da solo con due commesse a pari punteggio: sceglierebbe a caso", () => {
    // Stesso cliente, stesso importo, due cantieri aperti: è esattamente il
    // caso in cui un automatismo sbaglia e nessuno se ne accorge.
    const rate = [{ id: "r", label: "Acconto", amount: 5000, is_paid: false }];
    const esito = riconcilia(fattura({ clientePiva: "01234567890", totale: 5000 }), [
      commessa({ id: "c1", clientePiva: "01234567890", rate: [{ ...rate[0], id: "ra" }] }),
      commessa({ id: "c2", clientePiva: "01234567890", rate: [{ ...rate[0], id: "rb" }] }),
    ]);
    expect(esito.migliore?.confidenza).toBe("certa");
    expect(esito.agganciabileDaSolo).toBe(false);
    expect(esito.candidati).toHaveLength(2);
  });

  it("un solo indizio debole si propone ma non si aggancia", () => {
    const esito = riconcilia(fattura({ clienteEmail: "info@bianchi.it" }), [
      commessa({ clienteEmail: "INFO@BIANCHI.IT" }),
    ]);
    expect(esito.migliore?.confidenza).toBe("debole");
    expect(esito.agganciabileDaSolo).toBe(false);
  });

  it("nessun indizio su nessuna commessa: niente da proporre", () => {
    const esito = riconcilia(fattura({ testo: "Acconto" }), [commessa(), commessa({ id: "c2" })]);
    expect(esito.migliore).toBeNull();
    expect(esito.candidati).toHaveLength(0);
    expect(esito.agganciabileDaSolo).toBe(false);
  });

  it("i candidati escono dal più probabile al meno", () => {
    const esito = riconcilia(fattura({ clientePiva: "01234567890", totale: 5000 }), [
      commessa({ id: "debole", clienteRagioneSociale: "Bianchi Srl" }),
      commessa({
        id: "forte",
        clientePiva: "01234567890",
        rate: [{ id: "r1", label: "Acconto", amount: 5000, is_paid: false }],
      }),
    ]);
    expect(esito.candidati[0].commessaId).toBe("forte");
  });
});
