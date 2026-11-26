import { describe, expect, it } from "vitest";
import { leggiDDTdaAI } from "@/lib/ddt/letturaAI";
import { completaLetturaConTelefono, proponiRiferimentiTelefono, riferimentiTelefonoValidi } from "@/lib/ddt/riferimentiTelefono";
import { contaRigheArticolo, righeTelefonoValide } from "@/lib/ddt/righeViste";

describe("Riferimenti DDT letti sul telefono", () => {
  it("mantiene zeri iniziali e sezionale, riconosce l'emissione e distingue mittente e destinatario", () => {
    expect(proponiRiferimentiTelefono([
      "D.D.T. N. 0042/A del 12/11/2026\nMittente: EDIL NORD S.R.L.\nDestinatario: CANTIERE S.P.A.",
      "D.D.T. N. 0042/A del 12/11/2026\nPagina 2\nData consegna: 13/11/2026",
    ])).toEqual({ numero: "0042/A", data: "2026-11-12", fornitore: "EDIL NORD S.R.L." });
  });

  it("legge le etichette su righe separate", () => {
    expect(proponiRiferimentiTelefono([
      "Documento di trasporto\nNumero\n00034-B\nData 8/2/2026\nFornitore\nFerramenta Due Srl",
    ])).toEqual({ numero: "00034-B", data: "2026-02-08", fornitore: "Ferramenta Due Srl" });
  });

  it("lascia vuoti i dati discordanti e non usa ordini, consegna o destinatario come intestazione", () => {
    expect(proponiRiferimentiTelefono([
      "Rif. DDT 501\nOrdine n. 807\nData trasporto 22/11/2026\nDestinatario: ALFA\nVettore: BETA",
    ])).toEqual({});
    expect(proponiRiferimentiTelefono([
      "DDT n. 51 del 17/11/2026\nMittente: ALFA",
      "DDT n. 52 del 18/11/2026\nMittente: ALFA",
    ])).toEqual({ fornitore: "ALFA" });
  });

  it("scarta date impossibili e campi non utilizzabili", () => {
    expect(proponiRiferimentiTelefono(["DDT 31/11/2026\nData documento: 29/02/2026"])).toEqual({});
    expect(riferimentiTelefonoValidi({ numero: " 42/A ", data: "2026-02-29", fornitore: "X".repeat(200), grezzo: "testo" })).toEqual({ numero: "42/A" });
  });

  it("legge le colonne appiattite dall'OCR senza confondere la data del documento con quella del trasporto", () => {
    // Come l'OCR restituisce una tabella a due colonne: etichetta e valore sulla stessa riga.
    expect(proponiRiferimentiTelefono([
      "EDILTECNO SPA\nD.D.T.\nNumero documento 907   Data documento 18/11/2026\nSpett.le IMPRESA BIANCHI SRL",
    ])).toEqual({ numero: "907", data: "2026-11-18" });
    expect(proponiRiferimentiTelefono([
      "Documento di trasporto n. 610\nData documento 23/11/2026    Data trasporto 25/11/2026\nMittente: OMEGA SPA",
    ])).toEqual({ numero: "610", data: "2026-11-23", fornitore: "OMEGA SPA" });
    expect(proponiRiferimentiTelefono([
      "DOCUMENTO DI TRASPORTO N. 500\nVettore CORRIERE X   Data trasporto 25/11/2026   Data consegna 26/11/2026\nMittente: ZETA SRL",
    ])).toEqual({ numero: "500", fornitore: "ZETA SRL" });
  });

  it("riconosce «Ns. documento» sotto l'intestazione e non scambia il nostro ordine per la bolla", () => {
    expect(proponiRiferimentiTelefono([
      "DOCUMENTO DI TRASPORTO\nNs. documento n. 712   Data documento 19/11/2026\nMittente: TECNOEDIL SRL",
    ])).toEqual({ numero: "712", data: "2026-11-19", fornitore: "TECNOEDIL SRL" });
    expect(proponiRiferimentiTelefono([
      "DDT n. 913 del 24/11/2026\nVs. ordine n. 5512 del 10/11/2026\nMittente: FORNITURE SUD SRL",
    ])).toEqual({ numero: "913", data: "2026-11-24", fornitore: "FORNITURE SUD SRL" });
  });

  it("non propone niente da un documento che non è una bolla", () => {
    for (const pagina of [
      "FATTURA ACCOMPAGNATORIA N. 55 del 10/11/2026\nCliente: IMPRESA BIANCHI SRL",
      "BOLLA DI CONSEGNA\nOrdine n. 4471 del 14/11/2026\nCliente: IMPRESA BIANCHI SRL",
      "CONDIZIONI GENERALI DI VENDITA\nFirma del destinatario ______________",
      "DELIVERY NOTE No. DN-2026-8841\nDate: 2026-11-20\nShipper: NORDIC TOOLS AB",
    ]) expect(proponiRiferimentiTelefono([pagina])).toEqual({});
  });

  it("conta le righe di merce viste sul foglio, e nel dubbio ne conta meno", () => {
    const corpo = `Cod.      Descrizione                               U.M.    Q.ta
CLS2530   Calcestruzzo C25/30 S4 consistenza         m3      12,00
RET20     Rete elettrosaldata 20x20 fi 8 - 2x3 m     pz      40,00
VTE440    Vite TSP autofilettante 4x40 zincata       pz     500,00
TAS08     Tassello nylon 8 mm con vite               pz     250,00
Colli: 6        Peso lordo kg: 31.250        Porto: franco`;
    expect(contaRigheArticolo([corpo])).toBe(4);
    // Intestazione, indirizzi, totali e retro della bolla non sono merce.
    expect(contaRigheArticolo([
      "FERRAMENTA ROSSI S.R.L.\nVia Industria 14 - 20090 Segrate (MI)\nP.IVA 02345678901 - Tel. 02 1234567\nDOCUMENTO DI TRASPORTO N. 1234/26 del 20/11/2026\nMittente: FERRAMENTA ROSSI S.R.L.",
      "CONDIZIONI GENERALI DI VENDITA\nIl reclamo entro 8 giorni dalla consegna.\nForo competente: Milano",
    ])).toBe(0);
    expect(contaRigheArticolo([`Cod  Descrizione            UM   Qta    Prezzo   Importo
0012  Vite TSP 4x40          PZ    500     0,04     20,00
0318  Tassello nylon 8mm     PZ    250     0,12     30,00
Imponibile 50,00   IVA 22% 11,00   Totale documento 61,00`])).toBe(2);
    // Senza unità di misura non si conta: meglio nessun avviso che un avviso falso.
    expect(contaRigheArticolo(["Cod  Descrizione                 Qta\nA100  Nolo gru a torre             1"])).toBe(0);
  });

  it("riconosce solo un conteggio plausibile riletto dalla coda", () => {
    expect(righeTelefonoValide(4)).toBe(4);
    for (const sbagliato of [0, -1, 2.5, 201, "4", null, undefined, NaN]) {
      expect(righeTelefonoValide(sbagliato)).toBeUndefined();
    }
  });

  it("completa i campi mancanti senza sostituire i dati già letti o associare un nome a una partita IVA diversa", () => {
    const lettura = { ...leggiDDTdaAI({}), numero: "72", fornitorePiva: "01234567890" };
    expect(completaLetturaConTelefono(lettura, { numero: "71", data: "2026-11-12", fornitore: "ALFA" })).toMatchObject({
      numero: "72", data: "2026-11-12", fornitorePiva: "01234567890", fornitoreNome: null,
    });
  });
});
