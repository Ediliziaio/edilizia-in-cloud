import { describe, expect, it } from "vitest";
import { riepilogoContratto } from "@/lib/subappaltatori/riconciliazioneContratto";
import { costruisciContrattoSubappaltoHtml } from "@/lib/subappaltatori/contrattoSubappaltoHtml";

const sal = (importo_lordo: number, stato: string, pct = 5) => ({
  importo_lordo, stato, ritenuta_importo: (importo_lordo * pct) / 100, importo_netto: importo_lordo - (importo_lordo * pct) / 100,
});

describe("riconciliazione del contratto di subappalto", () => {
  it("valore = importo + oneri; i SAL contestati non contano; pagato e da pagare sui netti", () => {
    const r = riepilogoContratto(
      { importo_contrattuale: 10000, oneri_sicurezza: 500 },
      [sal(4000, "pagato"), sal(3000, "verificato"), sal(2000, "contestato")],
      [{ imponibile_totale: 4000 }],
      [{ importo: 200, stato: "trattenuta" }, { importo: 150, stato: "trattenuta" }, { importo: 100, stato: "annullata" }],
    );
    expect(r).toMatchObject({ valore: 10500, eseguito: 7000, approvato: 7000, fatturato: 4000, pagato: 3800, daPagare: 2850, ritenuteTrattenute: 350, residuo: 3500, avanzamento: 67 });
    expect(r.avvisi).toEqual([]);
  });

  it("segnala SAL oltre il contratto, fatture oltre i SAL approvati, pagamenti senza fattura", () => {
    expect(riepilogoContratto({ importo_contrattuale: 1000 }, [sal(1500, "ricevuto")], [], []).avvisi[0]).toMatch(/superano il valore/);
    expect(riepilogoContratto({ importo_contrattuale: 5000 }, [sal(1000, "ricevuto")], [{ imponibile_totale: 1000 }], []).avvisi[0]).toMatch(/più dei SAL approvati/);
    expect(riepilogoContratto({ importo_contrattuale: 5000 }, [sal(1000, "pagato")], [], []).avvisi[0]).toMatch(/nessuna fattura collegata/);
  });

  it("segnala ritenute calcolate sui SAL ma mai registrate", () => {
    const r = riepilogoContratto({ importo_contrattuale: 5000 }, [sal(2000, "verificato")], [{ imponibile_totale: 2000 }], []);
    expect(r.avvisi.join(" ")).toMatch(/non sono state registrate/);
  });

  it("una nota di credito riduce il fatturato", () => {
    const r = riepilogoContratto({ importo_contrattuale: 5000 }, [sal(2000, "verificato")], [{ imponibile_totale: 2000 }, { imponibile_totale: 500, tipo_documento: "TD04" }], []);
    expect(r.fatturato).toBe(1500);
  });
});

describe("contratto stampabile", () => {
  it("riporta parti, importi con oneri della sicurezza, ritenuta e clausole essenziali", () => {
    const html = costruisciContrattoSubappaltoHtml({
      numero: "SUB-01", dataStipula: "2026-10-22",
      committente: { ragioneSociale: "Edile Rossi Srl", partitaIva: "01234567890", indirizzo: "Via Roma 1, Milano", rappresentante: "Mario Rossi" },
      subappaltatore: { ragioneSociale: "Ponteggi <Bianchi>", partitaIva: "09876543210", indirizzo: "", email: "", pec: "" },
      commessa: { codice: "ORD-1", descrizione: "Cappotto", indirizzoCantiere: "Via Mazzini 14, Como", cliente: "Fabio Riva" },
      descrizioneLavori: "Montaggio ponteggio", importo: 10000, oneriSicurezza: 500, ritenutaPct: 5,
      dataInizio: "2026-11-01", dataFinePrevista: null, responsabileImpresa: null, referenteSubappaltatore: null,
      obblighi: null, modalitaPagamento: null, penali: null, garanzie: null, durataGaranziaMesi: 12, note: null,
    });
    expect(html).toContain("Ponteggi &lt;Bianchi&gt;");
    expect(html).toMatch(/10\.?500,00/);
    expect(html).toContain("Ritenuta di garanzia");
    expect(html).toContain("D.Lgs. 276/2003");
    expect(html).toContain("Allegato XVII");
  });
});

describe("firma elettronica del contratto di subappalto", () => {
  it("la pagina di firma chiede di approvare gli stessi articoli che il contratto elenca (artt. 1341-1342 c.c.)", async () => {
    const { CLAUSOLE_SUBAPPALTO } = await import("../../../supabase/functions/_shared/clausoleFirma");
    const { ARTICOLI_APPROVAZIONE_SPECIFICA } = await import("@/lib/subappaltatori/contrattoSubappaltoHtml");
    expect(CLAUSOLE_SUBAPPALTO).toHaveLength(ARTICOLI_APPROVAZIONE_SPECIFICA.length);
    expect(new Set(CLAUSOLE_SUBAPPALTO.map((c) => c.id)).size).toBe(CLAUSOLE_SUBAPPALTO.length);
  });

  it("le funzioni di firma riconoscono il contratto di subappalto e chiedono il PDF prima dell'invio", async () => {
    const { readFileSync } = await import("node:fs");
    const richiedi = readFileSync("supabase/functions/fea-richiedi-firma/index.ts", "utf8");
    expect(richiedi).toMatch(/"subappalto"\]\.includes\(tipo_documento\)/);
    // Il PDF si congela all'invio (documentoCongelato): senza, l'invio si ferma con un messaggio chiaro.
    expect(richiedi).toContain("congelaDocumento(");
    expect(readFileSync("supabase/functions/_shared/documentoCongelato.ts", "utf8")).toContain("Prepara prima il PDF del contratto da firmare");
    expect(readFileSync("supabase/functions/fea-documento-pubblico/index.ts", "utf8")).toContain('tipo === "subappalto"');
    expect(readFileSync("supabase/functions/_shared/pdfFirmato.ts", "utf8")).toContain('r.tipo_documento === "subappalto"');
  });
});
