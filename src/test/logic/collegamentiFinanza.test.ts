import { describe, expect, it } from "vitest";
import {
  cifreRiferimento, giorniDaOggi, linkFattura, punteggioCandidato, riferimentoOda, statoScadenza, stessaControparte,
} from "@/lib/finance/collegamentiFinanza";

describe("collegamenti fra fatture, scadenze e movimenti", () => {
  it("lo stato della scadenza usa le parole della colonna Incasso delle fatture", () => {
    const oggi = "2026-11-14";
    const base = { direction: "entrata" as const, status: "da_pagare", due_date: "2026-12-01", amount: 100, paid_amount: 0 };
    expect(statoScadenza(base, oggi).label).toBe("Da incassare");
    expect(statoScadenza({ ...base, paid_amount: 40, status: "parziale" }, oggi).label).toBe("Parz. incassata");
    expect(statoScadenza({ ...base, paid_amount: 100, status: "pagata" }, oggi).label).toBe("Incassata");
    expect(statoScadenza({ ...base, direction: "uscita" }, oggi).label).toBe("Da pagare");
    const scaduta = statoScadenza({ ...base, due_date: "2026-04-15" }, oggi);
    expect(scaduta).toMatchObject({ label: "Scaduta", giorniRitardo: 213 });
    expect(statoScadenza({ ...base, status: "annullata" }, oggi).label).toBe("Annullata");
  });

  it("conta i giorni sulle date, senza fusi orari", () => {
    expect(giorniDaOggi("2026-11-14", "2026-11-14")).toBe(0);
    expect(giorniDaOggi("2026-11-13", "2026-11-14")).toBe(-1);
  });

  it("trova l'ODA nella causale e lo confronta con i numeri degli ordini", () => {
    expect(riferimentoOda("Bonifico fornitore Ferramenta — ODA 2026112")).toBe("2026112");
    expect(riferimentoOda("pagamento ODA-2026-0054 saldo")).toBe("ODA-2026-0054".slice(4));
    expect(riferimentoOda("Carburante furgoni")).toBeNull();
    expect(riferimentoOda("ordine di acquisto materiale")).toBeNull();
    expect(riferimentoOda("ODA nr 45")).toBeNull();
    expect(cifreRiferimento("ODA-2026-0112")).toBe("2026112");
  });

  it("riconosce la stessa controparte anche con forme societarie diverse", () => {
    expect(stessaControparte("Ferramenta Industriale Rossi", "Ferramenta Industriale Rossi S.r.l.")).toBe(true);
    expect(stessaControparte("EDIL ROSSI SRL", "Edil Rossi")).toBe(true);
    expect(stessaControparte("Edil Rossi", "Termoidraulica Bianchi")).toBe(false);
  });

  it("mette in cima il documento con stesso importo, stessa controparte e numero in causale", () => {
    const m = { importo: -7800, controparte: "Ferramenta Industriale Rossi", causale: "Bonifico fornitore — ODA 2026112" };
    const giusto = punteggioCandidato(m, { titolo: "Fattura 2026112", sottotitolo: "Ferramenta Industriale Rossi srl · 2026-11-30", residuo: 7800 });
    const altro = punteggioCandidato(m, { titolo: "Fattura 55", sottotitolo: "Altro fornitore", residuo: 7800 });
    expect(giusto.punteggio).toBe(100);
    expect(giusto.motivi).toEqual(["Stesso importo", "Stessa controparte", "Numero citato nella causale"]);
    expect(altro.punteggio).toBe(50);
  });

  it("apre il dettaglio giusto per fatture native e importate", () => {
    expect(linkFattura("a", true)).toBe("/azienda/documenti/a/dettaglio");
    expect(linkFattura("a", false)).toBe("/azienda/documenti/importata/a");
  });
});
