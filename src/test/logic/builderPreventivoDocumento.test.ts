import { describe, expect, it } from "vitest";
import { bozzaDalModello, leggiModelloComputo, modelloComputoDiSerie, vesteDalModello } from "@/lib/computo/modelloComputo";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { aspettoDaOfferta } from "@/lib/computo/personalizzaDocumento";
import { DEFAULT_TEMPLATE } from "@/types/quoteTemplate";
import { mkdir, writeFile } from "node:fs/promises";

const bozza = () => ({ ...bozzaVuota(), titolo: "Progetto dimostrativo", voci: [{ ...voceVuota(), descrizione: "Cappotto completo", quantita: "10", prezzo: "30" }] });

describe("builder aziendale, sezioni reali del PDF", () => {
  it("conserva i default dei modelli precedenti e copia le sezioni solo nelle nuove bozze", () => {
    const m = leggiModelloComputo({ mostraFirma: false, copertina: "fascia" });
    expect(m.fontFamiglia).toBe("helvetica"); expect(m.sezioni.riepilogo).toBe(true);
    expect(bozzaDalModello(bozzaVuota(), m).sezioniPdf.firme).toBe(false);
    const precedente = bozza(); const prima = JSON.stringify(precedente);
    bozzaDalModello(bozzaVuota(), m);
    expect(JSON.stringify(precedente)).toBe(prima);
  });
  it.each(["piena", "editoriale", "fascia", "sobria"] as const)("la copertina %s stampa il PDF e rimuove l'intera accettazione quando esclusa", async copertina => {
    const m = { ...modelloComputoDiSerie(), copertina, fontFamiglia: "times" as const, condizioniContrattuali: "CLAUSOLA_DA_STAMPARE", clausoleDaApprovare: "CLAUSOLA_SPECIFICA" };
    const voci = vociDaBozza(bozza());
    const con = await generaComputoPdf(voci, { titolo: "Progetto dimostrativo", impaginazione: "editoriale", stato: "", veste: vesteDalModello(m), condizioniContrattuali: m.condizioniContrattuali });
    const senza = await generaComputoPdf(voci, { titolo: "Progetto dimostrativo", impaginazione: "editoriale", stato: "", veste: vesteDalModello({ ...m, sezioni: { ...m.sezioni, firme: false } }), condizioniContrattuali: m.condizioniContrattuali });
    expect(con.output()).toContain("PER ACCETTAZIONE"); expect(con.output()).toContain("CLAUSOLA_SPECIFICA");
    expect(senza.output()).not.toContain("PER ACCETTAZIONE"); expect(senza.output()).not.toContain("CLAUSOLA_SPECIFICA");
    expect(senza.output()).toContain("CLAUSOLA_DA_STAMPARE");
    expect(senza.getNumberOfPages()).toBe(con.getNumberOfPages() - 1);
    // La tabella usa davvero Times (F9), non solo la miniatura nel browser.
    expect(senza.output()).toContain("/F9");
  });
  it("esclude copertina, indice, riepilogo, premessa e contratto anche con una vecchia bozza che li accende", async () => {
    const m = modelloComputoDiSerie(); m.premessa = "PREMESSA_RISERVATA"; m.clausoleDaApprovare = "NON_APPROVARE";
    m.sezioni = { ...m.sezioni, copertina: false, premessa: false, indice: false, riepilogo: false, contrattuali: false, firme: false };
    const b = bozza(); const doc = await generaComputoPdf(vociDaBozza(b), { titolo: b.titolo, impaginazione: "editoriale", veste: vesteDalModello(m), sezioni: b.sezioniPdf, condizioniContrattuali: "CONTRATTO_RISERVATO" });
    const s = doc.output(); expect(doc.getNumberOfPages()).toBe(1);
    for (const testo of ["PREMESSA_RISERVATA", "CONTRATTO_RISERVATO", "Riepilogo economico", "PER ACCETTAZIONE", "NON_APPROVARE"]) expect(s).not.toContain(testo);
    expect(s).toContain("Cappotto completo");
  });
  it("riprende l'aspetto dalla libreria senza modificare l'offerta originale", () => {
    const t = { ...DEFAULT_TEMPLATE, id: "d87dbd65-0946-408a-a3d5-af7add814824", company_id: "company", created_at: "", updated_at: "", layout: "modern" as const, font_family: "times" as const };
    const prima = JSON.stringify(t); const m = aspettoDaOfferta(t);
    expect(m).toMatchObject({ modelloOffertaId: t.id, copertina: "editoriale", fontFamiglia: "times", colorePrimario: t.primary_color });
    expect(m).not.toHaveProperty("condizioniContrattuali"); expect(JSON.stringify(t)).toBe(prima);
  });
  it("anche il formato tecnico rispetta l'esclusione di riepilogo e firma", async () => {
    const m = modelloComputoDiSerie(); m.sezioni.riepilogo = false; m.sezioni.firme = false;
    const b = bozza(); const doc = await generaComputoPdf(vociDaBozza(b), { titolo: b.titolo, impaginazione: "primus", veste: vesteDalModello(m), tecnico: "Tecnico demo", dataDocumento: "19/11/2026" });
    expect(doc.output()).toContain("Cappotto completo");
    expect(doc.output()).not.toContain("Riepilogo"); expect(doc.output()).not.toContain("IL TECNICO / REFERENTE");
  });
  it("compila i riferimenti dei contratti comuni con cliente, azienda, numero, indirizzo e importi reali", async () => {
    const b = bozza(); const doc = await generaComputoPdf(vociDaBozza(b), { titolo: b.titolo, impaginazione: "editoriale", azienda: "Impresa Demo", committente: "Cliente Demo", numero: "P-26-123", indirizzoIntervento: "Via dei Giardini 12", ivaModalita: "applicata", ivaAliquota: "22",
      condizioniContrattuali: "{{azienda.ragione_sociale}} - {{cliente.nome_completo}} - {{preventivo.numero}} - {{cantiere.indirizzo}}. Totale {{preventivo.totale}}, IVA {{preventivo.iva}}. {{preventivo.piano_pagamenti}}", pagamenti: "Saldo alla consegna" });
    const testo = doc.output();
    for (const valore of ["Impresa Demo", "Cliente Demo", "P-26-123", "Via dei Giardini 12", "366,00", "66,00", "Saldo alla consegna"]) expect(testo).toContain(valore);
    expect(testo).not.toContain("{{");
  });
  it("nei testi contrattuali non scambia l'IVA da definire con zero e rispetta la copia senza cliente", async () => {
    const b = bozza(); const doc = await generaComputoPdf(vociDaBozza(b), { titolo: b.titolo, impaginazione: "editoriale", committente: "CLIENTE_RISERVATO", nascondiCliente: true, datiCliente: { email: "email-riservata@example.test" }, ivaModalita: "da-definire",
      condizioniContrattuali: "Cliente {{cliente.nome_completo}} {{cliente.email}}. Totale {{preventivo.totale}}, IVA {{preventivo.iva}}" });
    expect(doc.output()).toContain("da definire"); expect(doc.output()).not.toContain("CLIENTE_RISERVATO"); expect(doc.output()).not.toContain("email-riservata"); expect(doc.output()).not.toContain("{{");
  });
  it("mantiene anagrafica, descrizioni e ultime righe nei documenti multipagina", async () => {
    const m = modelloComputoDiSerie(); m.copertina = "editoriale"; m.fontFamiglia = "times";
    m.mostraFirma = false; m.premessa = "Una proposta completa per rinnovare gli ambienti, con materiali e lavorazioni descritti in ogni voce.";
    const b = bozza(); b.titolo = "La tua casa, un nuovo inizio";
    b.voci = Array.from({ length: 18 }, (_, n) => ({ ...voceVuota(), capitolo: n < 6 ? "Serramenti e schermature" : n < 12 ? "Opere e finiture" : "Impianto elettrico",
      descrizione: `Lavorazione ${n + 1}: ${"Fornitura e posa, accessori e finiture concordate. ".repeat(3)}FINE_VOCE_${n + 1}`, unita: "cad", quantita: "2", prezzo: "120" }));
    const doc = await generaComputoPdf(vociDaBozza(b), { titolo: b.titolo, committente: "Cliente dimostrativo", datiFiscaliCommittente: "C.F. DEMO", indirizzoIntervento: "Via dei Giardini 12 - Milano", azienda: "Impresa dimostrativa", stato: "", impaginazione: "editoriale", veste: vesteDalModello(m), ivaModalita: "applicata", ivaAliquota: "22" });
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    for (let n = 1; n <= 18; n++) expect(doc.output()).toContain(`FINE_VOCE_${n}`);
    expect(doc.output()).not.toContain("PER ACCETTAZIONE");
    if (process.env.PREVENTIVATORE_QA_OUTPUT) {
      await mkdir("output/pdf", { recursive: true });
      await writeFile("output/pdf/preventivo-editoriale-senza-accettazione.pdf", Buffer.from(doc.output("arraybuffer")));
    }
  });
  it("produce una proposta dimostrativa completa di contratto compilato e senza accettazione", async () => {
    const m = modelloComputoDiSerie(); m.copertina = "editoriale"; m.fontFamiglia = "times"; m.mostraFirma = false;
    const b = bozza(); b.titolo = "Una nuova casa,\nun nuovo inizio";
    b.voci = [
      ["Serramenti e schermature", "Finestra a due ante in PVC, vetrocamera basso emissiva", "cad", "4", "620"],
      ["Serramenti e schermature", "Tapparella in alluminio coibentato, completa di guide", "cad", "4", "180"],
      ["Opere e finiture", "Controparete in cartongesso con isolamento termoacustico", "mq", "32", "48"],
      ["Opere e finiture", "Preparazione del fondo e tinteggiatura delle pareti", "mq", "90", "12"],
      ["Impianto elettrico", "Punto presa completo di frutto, supporto e placca", "cad", "12", "65"],
      ["Impianto elettrico", "Verifica funzionale e dichiarazione di conformità", "corpo", "1", "280"],
    ].map(([capitolo, descrizione, unita, quantita, prezzo]) => ({ ...voceVuota(), capitolo, descrizione, unita, quantita, prezzo }));
    const doc = await generaComputoPdf(vociDaBozza(b), { titolo: b.titolo, oggetto: "Riqualificazione degli ambienti, nuovi serramenti e finiture interne", impaginazione: "editoriale", azienda: "Demo Azienda 2 S.r.l.", committente: "Cliente di esempio", numero: "P-2026-001", dataDocumento: "19/11/2026", indirizzoIntervento: "Via dei Giardini 12 - Milano", stato: "", veste: vesteDalModello(m), ivaModalita: "applicata", ivaAliquota: "22",
      condizioniContrattuali: "# Oggetto\n{{azienda.ragione_sociale}} si impegna a eseguire i lavori descritti nel preventivo {{preventivo.numero}} per {{cliente.nome_completo}} presso {{cantiere.indirizzo}}.\n# Prezzi e pagamenti\nImporto complessivo {{preventivo.totale}} (IVA {{preventivo.iva}}). {{preventivo.frase_pagamenti}}\n# Garanzia\n24 mesi dalla consegna, esclusi i difetti dovuti a uso improprio.\n# Varianti\nOgni variante va concordata per iscritto prima dell'esecuzione." });
    expect(doc.output()).not.toContain("{{"); expect(doc.output()).not.toContain("PER ACCETTAZIONE");
    expect(doc.output()).toContain("8.388,72");
    if (process.env.PREVENTIVATORE_QA_OUTPUT) {
      await mkdir("output/pdf", { recursive: true });
      await writeFile("output/pdf/modello-preventivo-demo-senza-accettazione.pdf", Buffer.from(doc.output("arraybuffer")));
    }
  });
});
