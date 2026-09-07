import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Il segno di una nota di credito sta nel TIPO del documento, non negli
 * importi: `documento_segno('nota_credito')` vale −1 sul database ed è l'unico
 * posto dove quel segno è scritto. Salvarli anche negativi lo applicava due
 * volte, e il database lo faceva davvero:
 *
 *   • `documento_stornato()` somma le note per sottrarle dal residuo. Provato
 *     su righe vere in transazione annullata, con una fattura da 1.220 €:
 *         importi negativi → stornato −1.220,00 → residuo 2.440,00
 *         importi positivi → stornato  1.220,00 → residuo     0,00
 *   • `silvio_tool_quadro_incassi` moltiplica l'incassato per il segno del
 *     tipo: una nota negativa faceva CRESCERE gli incassi.
 *
 * Il test che esisteva prima su questo tema legge il testo di una migrazione:
 * resta verde qualunque cosa faccia il codice della schermata. Questo invece
 * chiama la funzione vera.
 */

const fatturaFinta = {
  id: "11111111-1111-1111-1111-111111111111",
  numero: "2026/12",
  data_emissione: "2026-09-01",
  anagrafica_id: "22222222-2222-2222-2222-222222222222",
  cliente_snapshot: { denominazione: "Cliente prova" },
  esigibilita_iva: "I",
  metodo_pagamento_codice: "MP05",
  iban_pagamento: "IT00X0000000000000000000000",
  righe: [
    {
      id: "r1", numero_linea: 1, descrizione: "Posa pavimento",
      quantita: 2, prezzo_unitario: 500, aliquota_iva: "22",
      imponibile: 1000, imposta: 220, totale_riga: 1220,
    },
  ],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            single: async () => ({ data: fatturaFinta, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";

describe("nota di credito — il segno sta nel tipo, non negli importi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copia le righe della fattura con importi POSITIVI", async () => {
    const nc = await creaNotaCredito(fatturaFinta.id, "totale");
    const riga = nc.righe![0];

    expect(riga.quantita).toBe(2);
    expect(riga.imponibile).toBe(1000);
    expect(riga.imposta).toBe(220);
    expect(riga.totale_riga).toBe(1220);
  });

  it("nessun importo della nota è negativo", async () => {
    const nc = await creaNotaCredito(fatturaFinta.id, "totale");
    const negativi = (nc.righe ?? []).flatMap((r) =>
      [r.quantita, r.imponibile, r.imposta, r.totale_riga].filter((n) => Number(n) < 0),
    );
    expect(negativi).toEqual([]);
  });

  it("è il tipo a dire che è un accredito", async () => {
    const nc = await creaNotaCredito(fatturaFinta.id, "totale");
    expect(nc.tipo).toBe("nota_credito");
    expect(nc.documento_correlato_id).toBe(fatturaFinta.id);
  });

  it("il riepilogo IVA esce positivo e conserva l'esigibilità della fattura", async () => {
    const nc = await creaNotaCredito(fatturaFinta.id, "totale");
    const riepilogo = nc.riepilogo_iva ?? [];
    expect(riepilogo).toHaveLength(1);
    expect(riepilogo[0].imponibile).toBe(1000);
    expect(riepilogo[0].imposta).toBe(220);
    expect(riepilogo[0].esigibilita).toBe("I");
  });

  it("in modalità parziale non copia nessuna riga", async () => {
    const nc = await creaNotaCredito(fatturaFinta.id, "parziale");
    expect(nc.righe).toEqual([]);
    expect(nc.riepilogo_iva).toEqual([]);
  });
});
