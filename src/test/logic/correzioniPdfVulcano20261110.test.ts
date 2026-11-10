/**
 * Difetti dei PDF trovati nella simulazione su Impresa Vulcano del 10/11/2026: rapporto trasporti intestato
 * «COMMITTENTE» con le ore a 0, date ISO nei gruppi dei lavori in economia, doppio punto dopo la ragione sociale
 * nei contratti, «0 h dichiarate» sul rapportino.
 */
import { describe, expect, it } from "vitest";
import { celleRiga, corpoDocumento, oreIt, type AziendaDocumento, type DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import { rapportoEconomiaDaRapportini } from "@/lib/documentiOperativi/rapporti";
import { STANDARD_DOCUMENTI } from "@/lib/documentiOperativi/standard";
import { articoliContratto, costruisciContrattoSubappaltoHtml, type DatiContrattoSubappalto } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import { conPunto, senzaPuntoDoppio } from "../../../supabase/functions/_shared/punteggiatura";
import { contrattoStandardMd } from "../../../supabase/functions/_shared/contrattoStandard";
import { substituteMergeTags, buildMergeContext } from "../../../supabase/functions/_shared/quoteTemplateComposer";
import { bloccoFasi } from "../../../supabase/functions/genera-pdf-rapportino/model";

const azienda: AziendaDocumento = { id: "a", name: "Impresa prova", business_name: "Impresa prova S.r.l." };

const trasporti: DocumentoOperativo = {
  tipo: "trasporti",
  numero: "TRASPORTI-2026-11",
  periodo: "2026-11",
  destinatario: { nome: "Autotrasporti Bianchi" },
  righe: [
    { descrizione: "", unita: "viaggio", quantita: 1, prezzo: 180, data: "2026-11-03", carico: "Magazzino Vanzaghello", scarico: "Cantiere Lonate", mezzo: "Bilico" },
    { descrizione: "", unita: "viaggio", quantita: 1, prezzo: 150, data: "2026-11-04", carico: "Cava", scarico: "Cantiere Lonate", mezzo: "Camion", oreUomo: 2.5, oreMezzo: 0 },
  ],
};

describe("Rapporto trasporti", () => {
  it("è intestato al trasportatore, non al committente", () => {
    expect(STANDARD_DOCUMENTI.trasporti.destinatario).toBe("TRASPORTATORE");
    const raw = creaPdfOperativo(trasporti, azienda).output();
    expect(raw).toContain("TRASPORTATORE");
    expect(raw).not.toContain("COMMITTENTE");
  });
  it("le ore che non ci sono restano vuote: «—», non 0", () => {
    expect(oreIt(undefined)).toBe("—");
    expect(oreIt(0)).toBe("—");
    expect(oreIt(2.5)).toBe("2,5");
    expect(celleRiga(trasporti, trasporti.righe[0], 0).slice(3, 5)).toEqual(["—", "—"]);
    expect(celleRiga(trasporti, trasporti.righe[1], 1).slice(3, 5)).toEqual(["2,5", "—"]);
    const raw = creaPdfOperativo(trasporti, azienda).output();
    // Riepilogo: le ore uomo ci sono, quelle mezzo no.
    expect(raw).toContain("2 viaggi - 2,5 ore uomo");
    expect(raw).not.toContain("ore mezzo");
    expect(raw).not.toMatch(/\(0\) Tj/);
  });
  it("gli altri tipi restano come erano: economia al committente, servizi al fornitore", () => {
    expect(STANDARD_DOCUMENTI.economia.destinatario).toBe("COMMITTENTE");
    expect(STANDARD_DOCUMENTI.servizi.destinatario).toBe("FORNITORE");
    expect(STANDARD_DOCUMENTI.materiali.destinatario).toBe("FORNITORE");
  });
});

describe("Lavori in economia per il committente", () => {
  it("i gruppi portano la data in formato italiano", () => {
    const r = {
      id: "r", order_id: "o", data_lavoro: "2026-11-02", stato: "approvato",
      order: { order_code: "VUL-2026-004", client_name: "Condominio Aurora" },
      descrizione_lavori: "Rifacimento intonaci",
      presenze: [{ employee_id: "e", nome: "Marco Colombo", ore: 8 }],
    };
    // deno-lint-ignore no-explicit-any
    const d = rapportoEconomiaDaRapportini([r as any], "2026-11");
    expect(d.righe[0].gruppo).toBe("02/11/2026 - VUL-2026-004 - Rifacimento intonaci");
    expect(JSON.stringify(d)).not.toContain("2026-11-02 -");
    const raw = creaPdfOperativo(d, azienda).output();
    expect(raw).toContain("02/11/2026 - VUL-2026-004");
    expect(corpoDocumento(d, azienda)).toContain("02/11/2026 - VUL-2026-004");
  });
});

describe("Il punto dopo un dato che finisce già col punto", () => {
  it("conPunto e senzaPuntoDoppio", () => {
    expect(conPunto("Impresa Vulcano s.r.l.")).toBe("Impresa Vulcano s.r.l.");
    expect(conPunto("Impresa Alfa S.r.l")).toBe("Impresa Alfa S.r.l.");
    expect(conPunto("Edil Rossi")).toBe("Edil Rossi.");
    expect(conPunto("Va bene?")).toBe("Va bene?");
    expect(conPunto("")).toBe("");
    expect(senzaPuntoDoppio("s.r.l.", ". Altro")).toBe("s.r.l");
    expect(senzaPuntoDoppio("s.r.l.", " (di seguito")).toBe("s.r.l.");
    expect(senzaPuntoDoppio("Rossi", ".")).toBe("Rossi");
  });

  const contratto = (ragioneSociale: string): DatiContrattoSubappalto => ({
    numero: "SUB-1", dataStipula: "2026-11-10", dataInizio: "2026-11-12", dataFinePrevista: "2026-12-20",
    importo: 10000, oneriSicurezza: 0, ivaPct: 0, ritenutaPct: 5, durataGaranziaMesi: 24,
    descrizioneLavori: "Intonaci", modalitaPagamento: null, obblighi: null, penali: null, garanzie: null, note: null,
    responsabileImpresa: "Geom. Bianchi", referenteSubappaltatore: null,
    committente: { ragioneSociale, partitaIva: "06923340969", codiceFiscale: null, indirizzo: "Via Marconi 35, Lonate Pozzolo", rappresentante: null },
    subappaltatore: { ragioneSociale: "Intonaci Verdi s.n.c.", partitaIva: null, codiceFiscale: null, indirizzo: null },
    commessa: { codice: "VUL-2026-004", descrizione: "Condominio Aurora", indirizzoCantiere: "Via Roma 1, Lonate Pozzolo.", cliente: "Condominio Aurora" },
  }) as unknown as DatiContrattoSubappalto;

  it("contratto di subappalto: «Impresa Vulcano s.r.l.» senza secondo punto", () => {
    const testo = articoliContratto(contratto("Impresa Vulcano s.r.l.")).flatMap((a) => a.paragrafi).join("\n");
    expect(testo).toContain("Titolare per l'Affidataria: Impresa Vulcano s.r.l.");
    expect(testo).not.toContain("s.r.l..");
    const html = costruisciContrattoSubappaltoHtml(contratto("Impresa Vulcano s.r.l."));
    expect(html).not.toMatch(/\.\.(?!\.)/);
    expect(html).toContain("Cantiere: Via Roma 1, Lonate Pozzolo. Lavori");
  });
  it("una ragione sociale senza punto prende il suo, come prima", () => {
    const testo = articoliContratto(contratto("Impresa Alfa S.r.l")).flatMap((a) => a.paragrafi).join("\n");
    expect(testo).toContain("Titolare per l'Affidataria: Impresa Alfa S.r.l.");
    expect(testo).toContain("Per l'Affidataria il referente è Geom. Bianchi.");
  });
  it("contratto col cliente standard: oggetto e luogo che finiscono col punto", () => {
    const md = contrattoStandardMd({ description: "Rifacimento facciata.", work_address: "Via Roma 1, Lonate P." });
    expect(md).not.toMatch(/\.\.(?!\.)/);
    expect(md).toContain("lavori: Rifacimento facciata. Le singole");
    expect(md).toContain("I lavori si eseguono in Via Roma 1, Lonate P.");
    expect(contrattoStandardMd({ description: "Facciata", work_address: "Via Roma 1" })).toContain("lavori: Facciata. Le singole");
  });
  it("condizioni coi segnaposto: «{{azienda.ragione_sociale}}.» con una ragione sociale che finisce col punto", () => {
    const ctx = buildMergeContext({ quote: {}, company: { name: "Impresa Vulcano s.r.l." } });
    expect(substituteMergeTags("Titolare: {{azienda.ragione_sociale}}.", ctx)).toBe("Titolare: Impresa Vulcano s.r.l.");
    expect(substituteMergeTags("{{azienda.ragione_sociale}} (l'Impresa)", ctx)).toBe("Impresa Vulcano s.r.l. (l'Impresa)");
  });
});

describe("Rapportino: una fase senza ore", () => {
  it("non dichiara «0 h»", () => {
    const b = bloccoFasi({ fasi_lavorate: [{ phase_id: "f1", nome: "Intonaci", ore: 0 }, { phase_id: "f2", nome: "Rasatura", ore: 3 }] }, new Map());
    expect(b.fasi.map((f) => f.ore)).toEqual([null, 3]);
  });
});
