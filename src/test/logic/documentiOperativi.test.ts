import { describe, it, expect } from "vitest";
import {
  corpoDocumento,
  footerAzienda,
  totaliDocumento,
  documentoIncompleto,
  type DocumentoOperativo,
  type AziendaDocumento,
} from "@/lib/documentiOperativi/modello";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
const azienda: AziendaDocumento = {
  id: "a",
  name: "Impresa prova",
  business_name: "Impresa prova S.r.l.",
  legal_address: "Via Roma 10",
  legal_city: "Milano",
  vat_number: "01234567890",
  email: "test@example.invalid",
  phone: "010123456",
};
const doc: DocumentoOperativo = {
  tipo: "materiali",
  numero: "ODA-1",
  destinatario: { nome: "Fornitore" },
  righe: [
    {
      descrizione: "Materiale",
      unita: "mq",
      quantita: 40,
      prezzo: 18,
      sconto: 10,
      iva: 22,
    },
  ],
};
describe("Documenti operativi condivisi", () => {
  it("calcola sconti, IVA e totale con arrotondamento per riga", () => {
    expect(totaliDocumento(doc)).toEqual({
      imponibile: 648,
      iva: 142.56,
      totale: 790.56,
    });
  });
  it("non copia dati di Vulcano e usa al massimo due righe aziendali", () => {
    const footer = footerAzienda(azienda);
    expect(footer).toHaveLength(2);
    expect(footer[0]).toContain("Via Roma 10");
    expect(footer[1]).toContain("test@example.invalid");
    expect(footer.join()).not.toContain("Vulcano");
  });
  it("la richiesta lascia prezzi e importi da compilare senza totali d'ordine", () => {
    const html = corpoDocumento({ ...doc, tipo: "richiesta" }, azienda);
    expect(html).not.toContain("790");
    expect(html).not.toContain("Imponibile:");
    expect(html).toContain("non ci impegna all'acquisto");
  });
  it("email completa e PDF allegato hanno due corpi distinti", () => {
    expect(corpoDocumento(doc, azienda)).toContain("Materiale");
    const breve = corpoDocumento(doc, azienda, true);
    expect(breve).toContain("in allegato");
    expect(breve).not.toContain("<table");
  });
  it("non trasforma prezzi mancanti in uno zero concordato", () => {
    const d = { ...doc, righe: [{ ...doc.righe[0], prezzo: null }] };
    expect(documentoIncompleto(d)).toBe(true);
    expect(corpoDocumento(d, azienda)).toContain("Da definire");
    expect(corpoDocumento(d, azienda)).toContain("voci valorizzate");
  });
  it("l'inversione contabile elimina l'IVA senza cambiare l'imponibile", () => {
    expect(totaliDocumento({ ...doc, inversioneContabile: true })).toEqual({
      imponibile: 648,
      iva: 0,
      totale: 648,
    });
  });
  it("escape di destinatari e note anche nel messaggio di accompagnamento", () => {
    const d = {
      ...doc,
      destinatario: { nome: '<img onerror="x">' },
      note: "<script>alert(1)</script>",
    };
    expect(corpoDocumento(d, azienda)).not.toContain("<script>");
    expect(corpoDocumento(d, azienda, true)).not.toContain("<img");
  });
  it("genera documenti multipagina senza perdere righe e con footer ripetuto", () => {
    const d = {
      ...doc,
      righe: Array.from({ length: 100 }, (_, i) => ({
        ...doc.righe[0],
        descrizione: `Riga ${i + 1} ` + "descrizione lunga ".repeat(12),
      })),
    };
    const pdf = creaPdfOperativo(d, azienda);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    const raw = pdf.output();
    expect(raw).toContain("Riga 100");
    expect((raw.match(/P.IVA 01234567890/g) || []).length).toBe(
      pdf.getNumberOfPages(),
    );
  });
});

describe("Controlli rapporti prima dell’invio", () => {
  it("non ammette quantità negative e sconti oltre il 100%", async () => {
    const { erroriDocumento } =
      await import("@/lib/documentiOperativi/modello");
    expect(
      erroriDocumento({
        ...doc,
        righe: [{ ...doc.righe[0], quantita: -1, sconto: 101 }],
      }),
    ).toHaveLength(2);
  });
  it("i rapporti in economia prendono quantità approvate ma non i costi interni", async () => {
    const { rapportoEconomiaDaRapportini } =
      await import("@/lib/documentiOperativi/rapporti");
    const r = {
      id: "r",
      order_id: "o",
      data_lavoro: "2026-11-01",
      stato: "approvato",
      order: { order_code: "C-1", client_name: "Cliente demo" },
      presenze: [{ employee_id: "e", nome: "Operaio", ore: 8 }],
      costo_manodopera: 999,
      materiali_usati: [{ nome: "Malta", quantita: 2, unita: "sacchi" }],
      mezzi_usati: [{ nome: "Furgone", ore: 3 }],
    };
    const d = rapportoEconomiaDaRapportini(
      [r, { ...r, id: "scarto", stato: "rifiutato" }],
      "2026-11",
    );
    expect(d.righe).toHaveLength(3);
    expect(d.righe.map((r) => r.quantita)).toEqual([8, 2, 3]);
    expect(d.righe.every((r) => r.prezzo === null)).toBe(true);
    expect(JSON.stringify(d)).not.toContain("999");
  });
});

describe("Note della copia d’ordine", () => {
  it("riporta note ordine, consegna e note articolo nell'email completa", () => {
    const d = {
      ...doc,
      note: "Accordo con il fornitore",
      noteConsegna: "Scarico dalle 8 alle 10",
      righe: [{ ...doc.righe[0], nota: "Finitura opaca" }],
    };
    const html = corpoDocumento(d, azienda);
    expect(html).toContain("Accordo con il fornitore");
    expect(html).toContain("Scarico dalle 8 alle 10");
    expect(html).toContain("Finitura opaca");
    const raw = creaPdfOperativo(d, azienda).output();
    expect(raw).toContain("Finitura opaca");
    expect(raw).toContain("Scarico dalle 8 alle 10");
  });
  it("le note nel messaggio breve sono una scelta esplicita e vengono escapate", () => {
    const d = { ...doc, note: "Nota <script>test</script>" };
    expect(corpoDocumento(d, azienda, true)).not.toContain("Nota");
    const html = corpoDocumento(
      { ...d, noteNelMessaggio: true },
      azienda,
      true,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("Ordine senza prezzi in attesa del fornitore", () => {
  it("non espone alcun importo o colonna economica, anche se ci sono prezzi interni", () => {
    const d = { ...doc, prezziDaConfermare: true };
    const html = corpoDocumento(d, azienda);
    expect(html).toContain("Prezzi da confermare dal fornitore");
    expect(html).toContain("Materiale");
    expect(html).toContain("40");
    expect(html).not.toContain("Prezzo unit.");
    expect(html).not.toContain("Sc. %");
    expect(html).not.toContain("Imponibile:");
    expect(html).not.toContain("790,56");
    const raw = creaPdfOperativo(d, azienda).output();
    expect(raw).not.toContain("Prezzo unit.");
    expect(raw).not.toContain("Imponibile:");
    expect(raw).not.toContain("790,56");
    expect(raw).toContain("Prezzi da confermare");
  });
  it("consente prezzi e IVA mancanti ma continua a verificare le quantità", async () => {
    const { erroriDocumento } =
      await import("@/lib/documentiOperativi/modello");
    const d = {
      ...doc,
      prezziDaConfermare: true,
      righe: [{ ...doc.righe[0], prezzo: null, iva: null }],
    };
    expect(erroriDocumento(d)).toEqual([]);
    expect(
      erroriDocumento({ ...d, righe: [{ ...d.righe[0], quantita: 0 }] }),
    ).toHaveLength(1);
  });
  it("mantiene la richiesta di conferma anche nel messaggio breve con PDF", () => {
    expect(
      corpoDocumento({ ...doc, prezziDaConfermare: true }, azienda, true),
    ).toContain("Prezzi da confermare dal fornitore");
  });
});

describe("Impaginazione dei modelli operativi", () => {
  it("mantiene spazi economici compilabili senza pubblicare gli importi provvisori", () => {
    const raw = creaPdfOperativo(
      { ...doc, prezziDaConfermare: true, pagamento: "RI.BA. 30/60 giorni" },
      azienda,
    ).output();
    expect(raw).toContain("PREZZO");
    expect(raw).toContain("IMPORTO");
    expect(raw).toContain("RI.BA. 30/60 giorni");
    expect(raw).not.toContain("790,56");
    expect(raw).toContain("FORNITORE");
    expect(raw).toContain("CONSEGNA A");
  });
  it("separa gli interventi e riporta il riepilogo del periodo in economia", () => {
    const raw = creaPdfOperativo(
      {
        ...doc,
        tipo: "economia",
        righe: [
          {
            ...doc.righe[0],
            gruppo: "01/11 - Ripristino",
            descrizione: "Manodopera",
          },
          {
            ...doc.righe[0],
            gruppo: "02/11 - Finiture",
            descrizione: "Materiale",
          },
        ],
      },
      azienda,
    ).output();
    expect(raw.match(/Totale intervento/g)).toHaveLength(2);
    expect(raw).toContain("Totale periodo");
    expect(raw).toContain("01/11 - Ripristino");
    expect(raw).toContain("02/11 - Finiture");
  });
});

describe("Standard rapporto in economia", () => {
  it("presenta le tariffe e il totale IVA esclusa anche se le righe arrivano con IVA", () => {
    const d: DocumentoOperativo = {
      ...doc,
      tipo: "economia",
      righe: [{ ...doc.righe[0], iva: 22 }],
    };
    expect(totaliDocumento(d)).toEqual({
      imponibile: 648,
      iva: 0,
      totale: 648,
    });
    expect(corpoDocumento(d, azienda)).toContain("Totale IVA esclusa");
    expect(corpoDocumento(d, azienda)).not.toContain("142,56");
    expect(creaPdfOperativo(d, azienda).output()).toContain(
      "Totale IVA esclusa",
    );
  });
  it("richiede il prezzo del rapporto ma non un'aliquota IVA da esporre", async () => {
    const { erroriDocumento } =
      await import("@/lib/documentiOperativi/modello");
    expect(
      erroriDocumento({
        ...doc,
        tipo: "economia",
        righe: [{ ...doc.righe[0], iva: null }],
      }),
    ).toEqual([]);
    expect(
      erroriDocumento({
        ...doc,
        tipo: "economia",
        righe: [{ ...doc.righe[0], prezzo: null, iva: null }],
      }),
    ).toContain("Voce 1: indica il prezzo concordato.");
  });
});
