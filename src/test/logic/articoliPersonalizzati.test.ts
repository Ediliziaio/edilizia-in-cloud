import { describe, expect, it } from "vitest";
import {
  articoliConDatiDelContratto, articoliContratto, paragrafiDaTesto, unisciArticoliPersonalizzati, type DatiContrattoSubappalto,
} from "@/lib/subappaltatori/contrattoSubappaltoHtml";

const dati: DatiContrattoSubappalto = {
  numero: "1", dataStipula: "2026-10-31",
  committente: { ragioneSociale: "DIMORA SRL", partitaIva: "1", indirizzo: "Torino", rappresentante: "Luigi" },
  subappaltatore: { ragioneSociale: "Il Termotecnico", partitaIva: "2", indirizzo: "", email: "", pec: "" },
  commessa: { codice: "O-0001", descrizione: "Ristrutturazione", indirizzoCantiere: "Via Lessona 25", cliente: "Giulia" },
  descrizioneLavori: "Impianti", importo: 5780, oneriSicurezza: 0, ritenutaPct: 5, dataInizio: "2026-11-10", dataFinePrevista: "2027-02-19",
  responsabileImpresa: null, referenteSubappaltatore: null, obblighi: null, modalitaPagamento: null, penali: null, garanzie: null,
  durataGaranziaMesi: 12, note: null,
};
const art = (d: DatiContrattoSubappalto, titolo: string) => articoliContratto(d).find((a) => a.titolo === titolo)!;

describe("articoli del contratto personalizzati", () => {
  it("il testo sostituisce i paragrafi, il titolo resta", () => {
    const d = { ...dati, articoliPersonalizzati: { "Revisione dei prezzi": "Nessuna revisione.\n\nPrezzi fissi fino a fine lavori." } };
    expect(art(d, "Revisione dei prezzi").paragrafi).toEqual(["Nessuna revisione.", "Prezzi fissi fino a fine lavori."]);
    expect(articoliContratto(d).map((a) => a.titolo)).toEqual(articoliContratto(dati).map((a) => a.titolo));
  });
  it("il contratto vince sullo standard dell'azienda; un testo vuoto non conta", () => {
    expect(unisciArticoliPersonalizzati({ A: "azienda", B: "azienda" }, { A: "contratto", B: "  " })).toEqual({ A: "contratto", B: "azienda" });
    expect(unisciArticoliPersonalizzati(null, ["x"])).toEqual({});
  });
  it("gli articoli con importi, date o nomi del contratto non vanno nello standard dell'azienda", () => {
    const c = articoliConDatiDelContratto();
    for (const t of ["Premesse e oggetto", "Pagamenti", "Consegna dei lavori", "Fatturazione"]) expect(c.has(t)).toBe(true);
    for (const t of ["Revisione dei prezzi", "Mediazione e foro competente", "Divieto di subappalto"]) expect(c.has(t)).toBe(false);
  });
  it("una riga vuota separa i paragrafi", () => {
    expect(paragrafiDaTesto("uno\n\n\ndue\n  \ntre")).toEqual(["uno", "due", "tre"]);
  });
  it("uno standard sugli obblighi non cancella gli obblighi specifici del contratto", () => {
    const d = { ...dati, obblighi: "Pulizia giornaliera", articoliPersonalizzati: { "Obblighi del Subappaltatore": "Testo standard dell'azienda." } };
    expect(art(d, "Obblighi del Subappaltatore").paragrafi).toEqual(["Testo standard dell'azienda.", "Obblighi specifici: Pulizia giornaliera"]);
  });
  it("«Altre pattuizioni» è solo del contratto, mai nello standard dell'azienda", () => {
    expect(articoliConDatiDelContratto().has("Altre pattuizioni")).toBe(true);
  });
});
