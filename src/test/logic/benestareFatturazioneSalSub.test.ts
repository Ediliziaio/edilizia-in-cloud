import { describe, expect, it } from "vitest";
import { benestareFatturazione, type VerbaleSalSub } from "../../../supabase/functions/_shared/verbaleSalSub";

const verbale = (stato: string, p: Partial<VerbaleSalSub["contratto"]> = {}): VerbaleSalSub => ({
  versione: "sal-sub-verbale-3", generato_il: "2026-10-31T10:00:00Z", periodo_dal: "2026-10-01", periodo_al: "2026-10-31", nota_verbale: "",
  sal: { id: "s", company_id: "c", contratto_id: "k", order_id: "o", subappaltatore_id: "sub", numero_sal: 2, data_emissione: "2026-10-31",
    stato, importo_lordo: 10000, ritenuta_pct: 5, ritenuta_importo: 500, importo_netto: 9500, note: null },
  contratto: { id: "k", company_id: "c", order_id: "o", subappaltatore_id: "sub", numero_contratto: "SUB-7", descrizione_lavori: "Impianti",
    importo_contrattuale: 40000, oneri_sicurezza: 0, modalita_pagamento: "Bonifico a 30 giorni dalla fattura", responsabile_impresa: null,
    referente_subappaltatore: null, ...p },
  impresa: { ragione_sociale: "Demo Azienda 2 S.r.l.", partita_iva: "01234567890", indirizzo: "Via Esempio 10" },
  sub: { ragione_sociale: "Impianti Rossi", piva: "09876543210", indirizzo: null, responsabile: null },
  commessa: { id: "o", company_id: "c", order_code: "DEMO-2026-N008", description: null, work_address: null },
  precedenti: [], allegati: [], garanzie: [],
});
const importi = { lordo: 10000, ritenuta: 500, netto: 9500 };

describe("benestare alla fatturazione del SAL del subappaltatore", () => {
  it("un SAL verificato autorizza la fattura per il netto, con intestazione, causale e IVA", () => {
    const b = benestareFatturazione(verbale("verificato"), importi);
    expect(b.autorizzato).toBe(true);
    expect(b.testo).toContain("autorizza Impianti Rossi a emettere fattura per l'imponibile di 9.500,00");
    expect(b.righe.at(-1)).toEqual(["Imponibile da fatturare", expect.stringContaining("9.500,00")]);
    expect(b.righe[1][0]).toContain("si fattura allo svincolo");
    expect(b.istruzioni.join(" ")).toContain("Demo Azienda 2 S.r.l., P.IVA 01234567890");
    expect(b.istruzioni.join(" ")).toContain("Contratto n. SUB-7 · SAL n. 2 · commessa DEMO-2026-N008");
    expect(b.istruzioni.join(" ")).toContain("inversione contabile");
    expect(b.istruzioni.join(" ")).toContain("Bonifico a 30 giorni");
  });

  it("ricevuto o contestato: niente fattura finché l'impresa non verifica", () => {
    expect(benestareFatturazione(verbale("ricevuto"), importi)).toMatchObject({ autorizzato: false, titolo: "Fatturazione non ancora autorizzata" });
    expect(benestareFatturazione(verbale("contestato"), importi).testo).toContain("contestato");
  });

  it("pagato: la fattura doveva già esserci, nessuna seconda autorizzazione", () => {
    const b = benestareFatturazione(verbale("pagato"), importi);
    expect(b.autorizzato).toBe(false);
    expect(b.testo).toContain("non autorizza una seconda fattura");
  });
});
