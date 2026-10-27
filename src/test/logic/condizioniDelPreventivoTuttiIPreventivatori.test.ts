/**
 * Le condizioni contrattuali del singolo preventivo, in TUTTI i preventivatori (27/10/2026).
 *
 * I preventivi edili le hanno avute per primi; qui si controlla che le abbiano anche gli altri tre, che
 * impaginano in modo diverso: il classico e il fotovoltaico nel server, i serramenti nel browser.
 *
 * Le due scelte sono le stesse per tutti:
 *   · il documento esce con o senza la parte contrattuale (il primo invio, quello in cui si mostra il prezzo);
 *   · le condizioni si riscrivono per QUESTO preventivo, col permesso dei modelli.
 *
 * E la regola che non si tocca: il documento che va in FIRMA le ha sempre, perché il preventivo firmato è il
 * contratto. Ogni preventivatore la rispetta a modo suo, e qui si controlla che nessuno la salti.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  perLaFirma, testoCondizioniDelPdf,
} from "@/lib/preventivi/condizioniDelPreventivo";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

const DEL_MODELLO = "<p>Art. 1 — Oggetto del contratto</p>";

describe("la regola sta scritta in una sola copia", () => {
  it("il file dell'applicazione riusa quello condiviso con le edge function", () => {
    const applicazione = leggi("src/lib/preventivi/condizioniDelPreventivo.ts");
    expect(applicazione).toContain('from "../../../supabase/functions/_shared/condizioniDelPreventivo"');
    // Il permesso resta di qua: nel server non esiste nessun utente da controllare.
    expect(applicazione).toContain("export function puoRiscrivereLeCondizioni");
    expect(leggi("supabase/functions/_shared/condizioniDelPreventivo.ts")).not.toContain("puoRiscrivereLeCondizioni");
  });

  it("decide il testo del documento allo stesso modo per tutti", () => {
    expect(testoCondizioniDelPdf({}, DEL_MODELLO)).toBe(DEL_MODELLO);
    expect(testoCondizioniDelPdf({ condizioni_testo: "<p>Solo per questo cliente</p>" }, DEL_MODELLO))
      .toBe("<p>Solo per questo cliente</p>");
    expect(testoCondizioniDelPdf({ condizioni_nel_pdf: false }, DEL_MODELLO)).toBe("");
    // In firma le condizioni tornano, anche se il preventivo è impostato «senza».
    expect(testoCondizioniDelPdf(perLaFirma({ condizioni_nel_pdf: false }), DEL_MODELLO)).toBe(DEL_MODELLO);
  });
});

describe("preventivo classico", () => {
  const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");

  it("il PDF da firmare ha le condizioni anche se il preventivo è impostato senza", () => {
    expect(pdf).toContain("const perFirma = body?.per_firma === true;");
    expect(pdf).toContain('if (perFirma && chiave === "pdf_mostra_condizioni") return true;');
    // La regola sta nel server: chi manda in firma la chiede, non la può dimenticare.
    expect(leggi("supabase/functions/send-quote-signature/index.ts"))
      .toContain("JSON.stringify({ quote_id, per_firma: true })");
  });

  it("le condizioni riscritte per il preventivo vincono su modello e blocchi collegati", () => {
    expect(pdf).toContain("if (haTesto(quote?.condizioni_testo)) {");
    expect(pdf).toContain("t.contractual_terms_text = String(quote.condizioni_testo);");
    // Dopo l'applicazione dei blocchi collegati, altrimenti sarebbero loro a vincere.
    expect(pdf.indexOf("if (haTesto(quote?.condizioni_testo))"))
      .toBeGreaterThan(pdf.lastIndexOf("t.legal_terms_text = t.composed_legal.body_html;"));
  });

  it("lo step «Documenti e PDF» mostra la stessa scheda degli altri preventivatori, una volta sola", () => {
    const builder = leggi("src/pages/azienda/marketing/QuoteBuilder.tsx");
    expect(builder).toContain("<CondizioniDelPreventivoCard");
    expect(builder).toContain("condizioni_nel_pdf: pdfCondizioni ? null : false");
    // L'interruttore di prima era lo stesso: ora è dentro la scheda, non c'è due volte.
    expect(builder).not.toContain('l: "Stampa condizioni contrattuali"');
    // Il testo proprio si salva sul preventivo e si rilegge riaprendolo.
    expect(builder).toContain("condizioni_testo: condizioniTesto,");
    expect(builder).toContain("setCondizioniTesto((q.condizioni_testo as string | null) || null)");
  });
});

describe("serramenti", () => {
  it("il PDF stampa le condizioni del preventivo, se ne ha di sue", () => {
    const documento = leggi("src/components/serramenti/SerramentoPDF.tsx");
    expect(documento).toContain("testoCondizioniDelPdf(p, String(tpl.condizioni_legali_testo ?? \"\").trim() || condizioniStandard(\"serramenti\"))");
  });

  it("quello che va in firma le ha sempre", () => {
    expect(leggi("src/components/serramenti/StepPdf.tsx"))
      .toContain("renderSerramentoBlob({ detail: { ...detail, progetto: perLaFirma(p) }");
  });

  it("la pagina del cliente segue la stessa scelta", () => {
    expect(leggi("supabase/functions/sr-genera-pdf/index.ts"))
      .toContain("const testo = testoCondizioniDelPdf(prog,");
  });

  it("lo step PDF ha la scheda, e il wizard la salva sul preventivo", () => {
    expect(leggi("src/components/serramenti/StepPdf.tsx")).toContain("<CondizioniDelPreventivoCard");
    expect(leggi("src/pages/azienda/serramenti/SerramentiWizard.tsx")).toContain("onCondizioni={(patch) =>");
  });
});

describe("fotovoltaico", () => {
  const funzione = leggi("supabase/functions/fv-genera-pdf/index.ts");

  it("il documento segue la scelta del preventivo, e «con_condizioni» la scavalca", () => {
    expect(funzione).toContain("con_condizioni?: boolean;");
    expect(funzione).toContain("const condizioniDelPreventivo = p.con_condizioni === true");
    expect(funzione).toContain("testoCondizioniDelPdf(\n            condizioniDelPreventivo,");
    // Le colonne vanno lette, altrimenti la scelta non arriverebbe mai qui.
    expect(funzione).toContain("condizioni_nel_pdf, condizioni_testo");
  });

  it("registra se il documento emesso contiene le condizioni", () => {
    expect(funzione).toContain('...(payloadTipo === "vendita" ? { pdf_vendita_con_condizioni: conCondizioniDentro } : {})');
  });

  it("non si firma la versione senza condizioni: il fotovoltaico congela la pagina già emessa", () => {
    // Prima si rigenera con le condizioni dentro…
    const dettaglio = leggi("src/pages/azienda/fotovoltaico/FotovoltaicoDettaglio.tsx");
    expect(dettaglio).toContain("pdf_vendita_con_condizioni?: boolean | null }).pdf_vendita_con_condizioni === false");
    expect(dettaglio).toContain("con_condizioni: true,");
    // …col disegno del tetto che il cliente ha già visto: arriva dalla chiamata, non dal progetto.
    expect(dettaglio).toContain("layout_pannelli: Array.isArray(tetto.layout_tetto) ? tetto.layout_tetto : null,");
    expect(dettaglio).toContain("azimut: tetto.azimut_tetto != null ? etichettaAzimut(Number(tetto.azimut_tetto)) : null,");
    // …e se qualcosa non è andato, il server non la congela comunque.
    const congelato = leggi("supabase/functions/_shared/documentoCongelato.ts");
    expect(congelato).toContain("pdf_vendita_url, pdf_vendita_con_condizioni");
    expect(congelato).toContain("if (data.pdf_vendita_con_condizioni === false) {");
  });

  it("l'ultima fase ha la scheda, e la scelta si scrive prima di generare", () => {
    const wizard = leggi("src/pages/azienda/fotovoltaico/FotovoltaicoWizard.tsx");
    expect(wizard).toContain("<CondizioniDelPreventivoCard");
    expect(wizard.indexOf("condizioni_nel_pdf: data.condizioni_nel_pdf,\n          condizioni_testo: data.condizioni_testo,"))
      .toBeLessThan(wizard.indexOf('const { data: result, error } = await supabase.functions.invoke(\n        "fv-genera-pdf"'));
  });
});

describe("le funzioni che leggono il file condiviso vengono ripubblicate", () => {
  // Il job di deploy guarda solo i file cambiati sotto la cartella della funzione: una modifica fatta solo in
  // _shared lascia in produzione la versione di prima.
  it.each(["fea-richiedi-firma", "fea-completa-firma"])("%s è stata toccata", (funzione) => {
    expect(leggi(`supabase/functions/${funzione}/index.ts`)).toContain("Tocco del 27/10/2026");
  });
});
