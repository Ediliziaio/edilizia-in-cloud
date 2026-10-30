/**
 * Il dossier di rendicontazione letto dal PDF vero: renderer vero, offline, testo estratto con
 * pdfjs. È la carta che la banca o il socio hanno in mano, quindi la prova guarda quella.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DossierPDF } from "@/components/orders/generali/rendiconto/DossierPDF";
import { MODELLI_DOSSIER, componiDossier, type DatiDossier } from "@/lib/orders/generali/rendiconto";
import { inputAppalto, inputSviluppo, riepilogoSviluppo } from "@/test/fixtures/generaleRendiconto";

vi.setConfig({ testTimeout: 120_000 });

async function leggi(d: DatiDossier) {
  const buffer = await renderToBuffer(<DossierPDF d={d} />);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pagine: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const t = (await (await pdf.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ");
    pagine.push(t.replace(/\s+/g, " "));
  }
  // Etichette e intestazioni sono in maiuscolo nel PDF: si cerca senza badare alle maiuscole.
  return { pagine: pagine.map((p) => p.toLowerCase()), testo: pagine.join(" ").toLowerCase() };
}

// Un pixel JPEG vero: il PDF deve reggere le foto ridotte che arrivano dal browser.
const PIXEL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

describe("PDF del dossier", () => {
  it("completo: copertina, sintesi con i semafori e tutte le sezioni con i loro numeri", async () => {
    const d = componiDossier(inputSviluppo({ foto: [{ src: PIXEL, didascalia: "A1 · getto del solaio · 10/05/2027", data: "2027-05-10" }] }));
    const { pagine, testo } = await leggi(d);
    // Copertina: azienda, operazione, data, periodo e indice.
    expect(pagine[0]).toContain("edil srl");
    expect(pagine[0]).toContain("residenza via roma");
    expect(pagine[0]).toContain("15/06/2027");
    expect(pagine[0]).toContain("dal 01/01/2027 al 15/06/2027");
    expect(pagine[0]).toContain("posizione di soci e investitori");
    // Sintesi su una pagina sua.
    expect(pagine[1]).toContain("semafori");
    expect(pagine[1]).toContain("copertura finanziaria");
    expect(pagine[1]).toContain("avanzamento lavori");
    for (const titolo of ["Piano economico", "Andamento nei mesi", "Flusso di cassa", "Fonti, debito e rendimenti", "Unità e vendite", "Documenti", "Note del titolare", "Foto dal cantiere"]) {
      expect(testo).toContain(titolo.toLowerCase());
    }
    expect(testo).toContain("getto del solaio");
    expect(testo).toContain("mario rossi");
    expect(testo).toContain("banca locale");
    expect(testo).toContain("mutuo fondiario");
    // I numeri del piano, scritti all'italiana.
    expect(testo).toContain("€ 1.500.000");
    expect(testo).toContain("le vendite del secondo lotto partono a settembre.");
    expect(testo).toMatch(/pag\. 1 \/ \d/);
    // Le uscite e il capitale impegnato restano negativi sulla carta.
    expect(testo).toContain("-€ 300.000");
  });

  it("per la banca: nessun nome di socio né la sua quota", async () => {
    const d = componiDossier(inputSviluppo({ modello: "banca", sezioni: MODELLI_DOSSIER.banca.sezioni }));
    const { testo } = await leggi(d);
    expect(testo).toContain("per la banca");
    expect(testo).toContain("banca locale");
    expect(testo).not.toContain("mario rossi");
    expect(testo).not.toContain("spetta a fine");
  });

  it("chi non vede i margini genera un dossier senza piano, cassa e rendimenti", async () => {
    const d = componiDossier(inputSviluppo({ riepilogo: riepilogoSviluppo({ importi: true, costi: false, margini: false }) }));
    const { testo } = await leggi(d);
    expect(testo).not.toContain("piano economico");
    expect(testo).not.toContain("flusso di cassa");
    expect(testo).not.toContain("capitale massimo");
    expect(testo).not.toContain("margine");
    expect(testo).not.toContain("roe dei mezzi propri");
    expect(testo).toContain("unità e vendite");
  });

  it("appalto: contratto, atti, SAL, ritenute, anticipazione e garanzie", async () => {
    const { testo } = await leggi(componiDossier(inputAppalto()));
    for (const t of ["Contratto e SAL", "Rep. 123/2027", "CIG ABC123", "Rifacimento palestra", "Stati di avanzamento", "n. 1", "Cauzione definitiva", "Assicura Spa", "Ritenute da svincolare", "Anticipazione da recuperare", "Comune di Asti"]) {
      expect(testo).toContain(t.toLowerCase());
    }
    expect(testo).toContain("30/01/2028");
  });
});
