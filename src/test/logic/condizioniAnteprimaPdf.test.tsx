/// <reference types="node" />
/**
 * L'anteprima di un modello di «Contratti e condizioni» è il PDF vero (07/11/2026).
 *
 * Florin: «l'anteprima non rispecchia quella reale». Qui si rende davvero il documento — lo stesso
 * `DocumentoEdilePDF` dei preventivi — e se ne legge il testo: devono esserci le clausole del modello, coi
 * campi automatici riempiti, e nient'altro del preventivo (copertina, capitoli, chiusura).
 */
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { DATI_DI_ESEMPIO, datiAnteprimaCondizioni } from "@/lib/condizioni/anteprimaPdf";
import type { ModelloArchivio } from "../../../supabase/functions/_shared/condizioniArchivio";

async function letturaDelPdf(dati: ReturnType<typeof datiAnteprimaCondizioni>): Promise<{ testo: string; pagine: number }> {
  const bytes = await renderToBuffer(<DocumentoEdilePDF dati={dati} />);
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let testo = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    testo += (await pagina.getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  }
  return { testo: testo.replace(/\s+/g, " "), pagine: doc.numPages };
}

const MODELLO: ModelloArchivio = {
  id: "m1", nome: "Condizioni 2026", ambito: "preventivo", predefinito: true, attivo: true, versione: 2,
  clausole: [
    { titolo: "Oggetto", testo: "<p>{{azienda.ragione_sociale}} esegue i lavori per <strong>{{cliente.nome_completo}}</strong> presso {{cantiere.indirizzo}}.</p>" },
    { titolo: "Foro competente", testo: "<p>Per ogni controversia è competente il Foro di Milano.</p>", vessatoria: true },
  ],
};

describe("L'anteprima è il documento vero", () => {
  it("stampa le clausole del modello, coi campi automatici riempiti con i dati di esempio", async () => {
    const { testo } = await letturaDelPdf(datiAnteprimaCondizioni(MODELLO, { nome: "Impresa Esempio Srl", colore: "#1f4e79" }));
    expect(testo).toContain("Oggetto");
    expect(testo).toContain("Impresa Esempio Srl esegue i lavori");
    expect(testo).toContain(DATI_DI_ESEMPIO.cliente);
    expect(testo).toContain(DATI_DI_ESEMPIO.cantiere);
    expect(testo).toContain("Foro di Milano");
    // Nessun campo lasciato col suo segnaposto.
    expect(testo).not.toMatch(/\{\{/);
  });

  it("solo le condizioni e la firma che le approva: niente copertina, capitoli o «prossimi passi»", async () => {
    const { testo, pagine } = await letturaDelPdf(datiAnteprimaCondizioni(MODELLO, { nome: "Impresa Esempio Srl" }));
    expect(testo).toContain("Condizioni contrattuali");
    expect(testo).toContain("ACCETTAZIONE PROPOSTA");
    expect(testo).not.toContain("I prossimi passi");
    expect(testo).not.toContain("LA TUA PROPOSTA");
    expect(pagine).toBeLessThanOrEqual(3);
  });

  it("la clausola «da approvare a parte» compare nella firma, come nel PDF che il cliente firma", async () => {
    const { testo } = await letturaDelPdf(datiAnteprimaCondizioni(MODELLO, { nome: "Impresa Esempio Srl" }));
    // Nella pagina della firma: «Approvazione specifica (artt. 1341 e 1342 c.c.)», con la clausola e la seconda firma.
    // (Il titolo nel PDF è spaziato lettera per lettera: si legge la frase sotto.)
    expect(testo).toContain("approva specificamente le clausole seguenti: - Foro competente");
    expect(testo).toMatch(/S E C O N DA F I R M A/);
  });
});
