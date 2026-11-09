/// <reference types="node" />
/** I contratti prendono le condizioni giuste e il foglio semplice (09/11/2026). */
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { FoglioCondizioniPDF } from "@/components/preventivi/pdf/FoglioCondizioniPDF";
import { ContrattoSubappaltoPDF } from "@/components/subappaltatori/ContrattoSubappaltoPDF";
import { righeDelContratto } from "@/lib/orders/contrattoCommittentePdf";
import {
  CHIAVE_CLAUSOLE_FISSATE, articoliContratto, articoliDaApprovare, clausoleArchivioDelContratto, clausoleFirmaSubappalto,
  type DatiContrattoSubappalto,
} from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import { datiSocietariDa, righeSocietarie } from "../../../supabase/functions/_shared/datiSocietari";

async function testoDi(el: ReactElement): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(await renderToBuffer(el as never)), useSystemFonts: true }).promise;
  let t = "";
  for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  return t.replace(/\s+/g, " ");
}

describe("dati societari nel piè di pagina", () => {
  it("l'anagrafica vince per PEC e REA; companies riempie il resto", () => {
    const d = datiSocietariDa(
      { business_name: "Alfa S.r.l.", legal_address: "Via A 1", legal_postal_code: "20100", legal_city: "Milano", legal_province: "MI", vat_number: "11", fiscal_code: "22", pec: "vecchia@pec.it", numero_rea: "999" },
      { pec: "giusta@pec.it", codice_rea: "123", rea_ufficio: "MI", capitale_sociale: 50000, forma_giuridica: "SRL", socio_unico: true },
    );
    expect(righeSocietarie(d)).toEqual([
      "Alfa S.r.l. · Sede legale Via A 1, 20100 Milano (MI)",
      "P.IVA 11 · C.F. 22 · REA MI-123 · Capitale sociale versato € 50.000,00 · Socio unico · PEC giusta@pec.it",
    ]);
  });
  it("senza anagrafica esce quello che c'è, mai un campo vuoto", () => {
    expect(righeSocietarie(datiSocietariDa({ name: "Rossi Mario", vat_number: "33" }, null))).toEqual(["Rossi Mario", "P.IVA 33"]);
    expect(righeSocietarie(null)).toEqual([]);
  });
});

const MD = `# CONTRATTO D'APPALTO

## 1. OGGETTO
Lavori di ristrutturazione.

## 17. SOTTOSCRIZIONE
Redatto in duplice copia.
Luogo e data: [DA COMPLETARE]

__________________________
[Firma del Committente]

__________________________
[Firma dell'Appaltatore]

## CLAUSOLE DA APPROVARE A PARTE
- Foro competente

## Condizioni generali dell'impresa
### Modalità di pagamento
Il 30% alla firma.

## Clausole da approvare specificamente (art. 1341 c.c.)
Il Committente dichiara di approvare specificamente:
- Foro competente
- Garanzia sulle opere
`;

describe("contratto col committente", () => {
  it("via le firme dell'AI, condizioni prima delle firme, un solo elenco 1341", () => {
    const righe = righeDelContratto(MD);
    const testi = righe.map((r) => r.testo).join("\n");
    expect(testi).not.toMatch(/____|\[Firma/);
    expect(testi.indexOf("Modalità di pagamento")).toBeGreaterThan(testi.indexOf("SOTTOSCRIZIONE"));
    expect(righe.filter((r) => /1341/.test(r.testo))).toHaveLength(1);
    expect(righe.filter((r) => r.tipo === "li").map((r) => r.testo)).toEqual(["Foro competente", "Garanzia sulle opere"]);
  });
  it("il PDF ha titolo, condizioni, due firme e la seconda firma; niente etichette del preventivo", async () => {
    const t = await testoDi(<FoglioCondizioniPDF titolo="C" righe={righeDelContratto(MD)} societarie={["Alfa S.r.l.", "P.IVA 11"]} conTitolo firme={{ sinistra: "L'Appaltatore", destra: "Il Committente" }} />);
    expect(t).toContain("CONTRATTO D'APPALTO");
    expect(t).toContain("Il 30% alla firma.");
    expect(t).toContain("si approvano specificamente le seguenti clausole: Foro competente; Garanzia sulle opere.");
    expect(t).toContain("P.IVA 11");
    expect(t).not.toMatch(/PIANO DEI LAVORI|PREVENTIVO N\./i);
  });
});

const BASE: DatiContrattoSubappalto = {
  numero: "SUB-1", dataStipula: "2026-11-09",
  committente: { ragioneSociale: "Alfa S.r.l.", partitaIva: "11", indirizzo: "Via A 1", rappresentante: "Mario" },
  subappaltatore: { ragioneSociale: "Beta Srl", partitaIva: "44", indirizzo: "Via B", email: "b@b.it", pec: "" },
  commessa: { codice: "C-1", descrizione: "Bagno", indirizzoCantiere: "Via C", cliente: "Rossi" },
  descrizioneLavori: "Posa", importo: 1000, oneriSicurezza: 0, ritenutaPct: 0, dataInizio: null, dataFinePrevista: null,
  responsabileImpresa: null, referenteSubappaltatore: null, obblighi: null, modalitaPagamento: null, penali: null, garanzie: null,
  durataGaranziaMesi: 12, note: null,
};

describe("contratto di subappalto", () => {
  const modello = { clausole: [
    { titolo: "Divieto di ulteriore subappalto", testo: "<p>Vietato cedere i lavori.</p>", vessatoria: true },
    { titolo: "", testo: "senza titolo" },
  ] };
  it("prende le clausole del modello: una in più, da approvare a parte", () => {
    const clausole = clausoleArchivioDelContratto({}, modello);
    expect(clausole).toEqual([{ titolo: "Divieto di ulteriore subappalto", testo: "Vietato cedere i lavori.", vessatoria: true }]);
    const articoli = articoliContratto({ ...BASE, clausoleArchivio: clausole });
    expect(articoli.at(-1)?.titolo).toBe("Allegati");
    expect(articoli.some((a) => a.titolo === "Divieto di ulteriore subappalto")).toBe(true);
    expect(articoliDaApprovare(articoli)).toContain("Divieto di ulteriore subappalto");
    expect(clausoleFirmaSubappalto(articoli).at(-1)?.testo).toContain("Vietato cedere i lavori.");
  });
  it("mandato in firma resta com'era; firmato prima dell'archivio non ne prende; il reinvio rilegge", () => {
    const fissate = JSON.stringify([{ titolo: "Vecchia", testo: "Testo di allora" }]);
    const c = { articoli_personalizzati: { [CHIAVE_CLAUSOLE_FISSATE]: fissate } };
    expect(clausoleArchivioDelContratto(c, modello)[0].titolo).toBe("Vecchia");
    expect(clausoleArchivioDelContratto(c, modello, { rileggi: true })[0].titolo).toBe("Divieto di ulteriore subappalto");
    expect(clausoleArchivioDelContratto({ firmato_il: "2026-01-01" }, modello)).toEqual([]);
  });
  it("il testo scritto per quel contratto vince sul modello", () => {
    const titolo = "Trattamento dei dati personali";
    const articoli = articoliContratto({ ...BASE, articoliPersonalizzati: { [titolo]: "Testo mio" }, clausoleArchivio: [{ titolo, testo: "Testo del modello" }] });
    expect(articoli.find((x) => x.titolo === titolo)?.paragrafi).toEqual(["Testo mio"]);
    const senza = articoliContratto({ ...BASE, clausoleArchivio: [{ titolo, testo: "Testo del modello" }] });
    expect(senza.find((x) => x.titolo === titolo)?.paragrafi).toEqual(["Testo del modello"]);
  });
  it("il PDF stampa la clausola e, in fondo, i dati societari", async () => {
    const t = await testoDi(<ContrattoSubappaltoPDF d={{ ...BASE, clausoleArchivio: clausoleArchivioDelContratto({}, modello), societarie: ["Alfa S.r.l. · Sede legale Via A 1", "P.IVA 11 · REA MI-1"] }} />);
    expect(t).toContain("Vietato cedere i lavori.");
    expect(t).toContain("P.IVA 11 · REA MI-1");
  });
});

import { ContrattoClientePDF } from "@/components/contratti/ContrattoClientePDF";
import { articoliDalContratto, datiDaAccordo, datiDaCommessa, titoloArticolo } from "@/lib/contratti/contrattoCliente";

describe("contratto col committente, come il subappalto", () => {
  const SOC = datiSocietariDa({ business_name: "Alfa S.r.l.", legal_address: "Via A 1", vat_number: "11" }, { codice_rea: "123", rea_ufficio: "MI", capitale_sociale: 10000, forma_giuridica: "SRL" });
  it("articoli: niente intestazione doppia, condizioni in coda, un solo elenco 1341", () => {
    expect(titoloArticolo("2. OGGETTO DEI LAVORI")).toBe("Oggetto dei lavori");
    const { articoli, daApprovare } = articoliDalContratto(`# CONTRATTO\n\nN. 1\n\n## 1. INTESTAZIONE\nTra le parti\n\n## 2. OGGETTO\nLavori\n\n${MD.slice(MD.indexOf("## Condizioni generali"))}`);
    expect(articoli.map((a) => a.titolo)).toEqual(["Oggetto", "Condizioni generali dell'impresa", "Modalità di pagamento"]);
    expect(articoli[1].fascia).toBe(true);
    expect(daApprovare).toEqual(["Foro competente", "Garanzia sulle opere"]);
  });
  it("la commessa: parti, cantiere, importi, firme e l'elenco dei lavori", async () => {
    const d = datiDaCommessa({ contratto: { numero_contratto: "CON-1", created_at: "2026-11-09" }, md: MD, societari: SOC,
      ordine: { order_code: "C-1", description: "Bagno", work_address: "Via C 3", client_name: "Giulia Ferrari", client_email: "g@x.it", total_amount: 10000, vat_rate: 10, deposit_amount: 3000, balance_amount: 7000, customer: { fiscal_code: "FRRGLI80" } },
      voci: [{ name: "Demolizioni", quantity: 2, unit_price: 100, unita_misura: "mq", categoria: "Opere" }, { name: "Posa", description: "sanitari", quantity: 1, unit_price: 500, discount_percent: 10 }] });
    expect(d.elenco.map((r) => r.importo)).toEqual([200, 450]);
    const t = await testoDi(<ContrattoClientePDF d={d} />);
    expect(t).toContain("Giulia Ferrari");
    expect(t).toContain("C.F. FRRGLI80");
    expect(t).toContain("Imponibile dei lavori");
    expect(t).toContain("ELENCO DEI LAVORI");
    expect(t).toContain("Demolizioni");
    expect(t).toContain("Il 30% alla firma.");
    expect(t).toMatch(/Il Committente approva|il Committente approva specificamente: Foro competente; Garanzia sulle opere/);
    expect(t).toContain("Capitale sociale versato € 10.000,00");
    expect(t).not.toMatch(/\[Firma|____\s*\[/);
  });
  it("l'accordo col committente: condizioni economiche, clausole e listino", async () => {
    const d = datiDaAccordo({ societari: SOC, committente: { business_name: "Beta Spa", vat_number: "22", address: "Via B" },
      accordo: { nome: "Accordo 2026", valido_dal: "2026-01-01", giorni_pagamento: 60, ritenuta_pct: 4, modo_fatturazione: "per_commessa", regime_iva: "ordinaria", condizioni: "Garanzia sulle opere\nDue anni.\n\nForo\nMilano." },
      tariffe: [{ tipo: "manodopera", descrizione: "Operaio", unita_misura: "h", prezzo_unitario: 30, attivo: true }, { tipo: "trasporto", descrizione: "Vecchia", unita_misura: "km", prezzo_unitario: 1, attivo: false }] });
    expect(d.articoli.map((a) => a.titolo)).toEqual(["Garanzia sulle opere", "Foro"]);
    expect(d.elenco).toHaveLength(1);
    const t = await testoDi(<ContrattoClientePDF d={d} />);
    expect(t).toContain("LISTINO CONCORDATO");
    expect(t).toContain("60 giorni");
    expect(t).toContain("Beta Spa");
  });
});
