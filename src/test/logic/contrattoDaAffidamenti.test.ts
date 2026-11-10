/**
 * Lotto 5 (10/11/2026): il contratto nasce dalle voci affidate alla ditta. Solo le sue quote (libere o già di
 * questo contratto), con la quantità e il prezzo della quota, nell'ordine delle fasi; gli id che servono al
 * database per agganciarle restano nella riga salvata; il venduto non entra mai; nel testo del contratto si
 * legge cosa comprende il prezzo.
 */
import { describe, expect, it } from "vitest";
import { elencoDaAffidamenti, elencoDaSalvare, type AffidamentoPerContratto, type VoceLavoro } from "@/lib/orders/ditteLavori";
import { costruisciContrattoSubappaltoHtml, totaleElencoLavori, type DatiContrattoSubappalto } from "@/lib/subappaltatori/contrattoSubappaltoHtml";

const fasi = [{ id: "f2", name: "Sottofondi", position: 2 }, { id: "f1", name: "Intonaci", position: 1 }];
const voci: VoceLavoro[] = [
  { id: "v1", phase_id: "f1", position: 1, descrizione: "Intonaco civile", unita: "mq", quantita: 420, costo_manodopera: 15, tariffa_id: null },
  { id: "v2", phase_id: "f1", position: 2, descrizione: "Rasatura", unita: "mq", quantita: 420, costo_manodopera: 8, tariffa_id: null },
  { id: "v3", phase_id: "f2", position: 1, descrizione: "Massetto", unita: "mq", quantita: 100, costo_manodopera: 12, tariffa_id: null, subphase_id: "s1" },
];
const q = (p: Partial<AffidamentoPerContratto> & Pick<AffidamentoPerContratto, "id" | "voce_id">): AffidamentoPerContratto => ({
  subappaltatore_id: "rossi", quantita: 1, prezzo_unitario: 10, origine_prezzo: "listino_ditta", comprende: "posa", stato: "bozza", contratto_id: null, ...p,
});
const affidamenti = [
  q({ id: "a3", voce_id: "v3", quantita: 100, prezzo_unitario: 11.115, comprende: "fornitura_e_posa" }),
  q({ id: "a1", voce_id: "v1", quantita: 300, prezzo_unitario: 14 }),
  q({ id: "b1", voce_id: "v1", subappaltatore_id: "bianchi", quantita: 120, prezzo_unitario: 13 }),
  q({ id: "a2", voce_id: "v2", quantita: 420, prezzo_unitario: 8, stato: "a_contratto", contratto_id: "altro" }),
];

describe("contratto dalle voci affidate", () => {
  it("solo le quote della ditta, libere, nell'ordine di fasi e voci, con quantità e prezzo della quota", () => {
    const righe = elencoDaAffidamenti(fasi, voci, affidamenti, "rossi", null);
    expect(righe.map((r) => r.affidamento_id)).toEqual(["a1", "a3"]);
    expect(righe[0]).toMatchObject({ fase: "Intonaci", descrizione: "Intonaco civile", quantita: 300, prezzo: 14, importo: 4200, voce_id: "v1", fase_id: "f1", comprende: "posa", origine: "listino_ditta" });
    // Il prezzo nel contratto è al centesimo (11,115 → 11,12), l'importo riga per riga: 100 × 11,12 = 1112.
    expect(righe[1]).toMatchObject({ fase: "Sottofondi", prezzo: 11.12, importo: 1112, sottofase_id: "s1", comprende: "fornitura_e_posa" });
    expect(totaleElencoLavori(righe)).toBe(5312);
  });

  it("le quote già di questo contratto restano; quelle di un altro contratto no; senza ditta collegata niente", () => {
    expect(elencoDaAffidamenti(fasi, voci, affidamenti, "rossi", "altro").map((r) => r.affidamento_id)).toEqual(["a1", "a2", "a3"]);
    expect(elencoDaAffidamenti(fasi, voci, affidamenti, null, null)).toEqual([]);
    expect(elencoDaAffidamenti(fasi, voci, affidamenti, "verdi", null)).toEqual([]);
  });

  it("una quota senza prezzo entra a 0 €, e la finestra lo segnala", () => {
    const [r] = elencoDaAffidamenti(fasi, voci, [q({ id: "x", voce_id: "v2", prezzo_unitario: null })], "rossi", null);
    expect(r).toMatchObject({ prezzo: 0, importo: 0 });
  });

  it("la riga salvata tiene gli id per il database e cosa comprende, non l'origine del prezzo né il venduto", () => {
    const [salvata] = elencoDaSalvare(elencoDaAffidamenti(fasi, voci, affidamenti, "rossi", null));
    expect(salvata).toMatchObject({ voce_id: "v1", affidamento_id: "a1", comprende: "posa" });
    expect(salvata).not.toHaveProperty("origine");
    expect(Object.keys(salvata).some((k) => /vend|margin/i.test(k))).toBe(false);
  });

  it("nel testo del contratto, accanto alla voce, cosa comprende il prezzo", () => {
    const elencoLavori = elencoDaSalvare(elencoDaAffidamenti(fasi, voci, affidamenti, "rossi", null));
    const d: DatiContrattoSubappalto = {
      numero: "O-1/S01", dataStipula: "2026-11-10",
      committente: { ragioneSociale: "Impresa", partitaIva: "", indirizzo: "", rappresentante: "" },
      subappaltatore: { ragioneSociale: "Rossi srl", partitaIva: "", indirizzo: "", email: "", pec: "" },
      commessa: { codice: "O-1", descrizione: "", indirizzoCantiere: "", cliente: "" },
      descrizioneLavori: "", importo: totaleElencoLavori(elencoLavori), oneriSicurezza: 0, ritenutaPct: 5,
      dataInizio: null, dataFinePrevista: null, responsabileImpresa: null, referenteSubappaltatore: null, obblighi: null,
      modalitaPagamento: null, penali: null, garanzie: null, durataGaranziaMesi: 12, note: null, elencoLavori,
    };
    const html = costruisciContrattoSubappaltoHtml(d);
    expect(html).toContain("Intonaco civile <em>(solo posa)</em>");
    expect(html).toContain("Massetto <em>(fornitura e posa)</em>");
  });
});
