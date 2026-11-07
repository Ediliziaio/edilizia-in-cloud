/**
 * Portare nell'archivio le condizioni che l'azienda ha già, senza perderne un pezzo (07/11/2026).
 *
 * Le righe vere di chi usa il gestionale: clausole scritte una per una (titolo, testo, vessatoria) e
 * contratti interi di decine di migliaia di caratteri, in HTML o in Markdown, con dentro i campi
 * automatici. L'archivio ne prende una copia identica.
 */
import { describe, expect, it } from "vitest";
import { clausoleDaImportare, impronta, modelliDaImportare, testoLeggibile } from "@/lib/condizioni/importa";

const clausolaFirma = (p: Record<string, unknown> = {}) => ({
  title: "Oggetto del contratto", content: "Il contratto disciplina la fornitura e la posa degli impianti.",
  category: "custom", active: true, applicable_to: { vessatoria: true }, ...p,
});

describe("Le clausole già scritte entrano una per una", () => {
  it("tiene titolo, testo e il fatto che vada approvata a parte; «custom» non è una categoria", () => {
    const [c] = clausoleDaImportare([clausolaFirma()]);
    expect(c).toMatchObject({ titolo: "Oggetto del contratto", vessatoria: true, categoria: null });
    expect(c.testo).toContain("fornitura e la posa");
    expect(c.fonte).toBe("Condizioni della firma");
  });

  it("la categoria vera si tiene", () => {
    expect(clausoleDaImportare([clausolaFirma({ category: "Pagamenti" })])[0].categoria).toBe("Pagamenti");
  });

  it("salta quelle spente, quelle senza titolo e quelle senza testo", () => {
    expect(clausoleDaImportare([
      clausolaFirma({ active: false }),
      clausolaFirma({ title: "   " }),
      clausolaFirma({ content: "<p>&nbsp;</p>" }),
    ])).toEqual([]);
  });

  it("quello che è già nell'archivio non entra due volte, anche se cambia la formattazione", () => {
    const gia = [{ titolo: "OGGETTO del contratto", testo: "<p>Il contratto   disciplina la fornitura e la posa degli impianti.</p>" }];
    expect(clausoleDaImportare([clausolaFirma()], gia)).toEqual([]);
  });

  it("due righe uguali nella stessa importazione entrano una volta sola", () => {
    expect(clausoleDaImportare([clausolaFirma(), clausolaFirma()])).toHaveLength(1);
  });
});

describe("I contratti interi diventano un modello ciascuno, copiati com'erano", () => {
  const html = '<p style="text-align: justify;"><span style="font-size: 14pt;"><strong>Condizioni generali di appalto</strong></span></p><p>Committente: <span data-merge-field="{{cliente.nome_completo}}">{{cliente.nome_completo}}</span></p>';

  it("il testo non si tocca: tag, stili e campi automatici restano", () => {
    const [m] = modelliDaImportare({ quoteTemplates: [{ name: "Condizioni generali d'appalto", kind: "condizioni", body_html: html }] });
    expect(m.clausole[0].testo).toBe(html);
    expect(m.clausole[0].testo).toContain("{{cliente.nome_completo}}");
    expect(m).toMatchObject({ nome: "Condizioni generali d'appalto", ambito: "preventivo", fonte: "Modelli preventivi e contratti" });
  });

  it("il Markdown passa com'è: non si spezza un contratto a naso", () => {
    const md = "# Condizioni contrattuali\n## 1. Oggetto\n{{azienda.ragione_sociale}} si impegna a eseguire i lavori.";
    const [m] = modelliDaImportare({ quoteTemplates: [{ name: "Condizioni contrattuali", kind: "condizioni", body_html: md }] });
    expect(m.clausole).toHaveLength(1);
    expect(m.clausole[0].testo).toBe(md);
  });

  it("un modello d'offerta porta il suo testo solo se non punta a un blocco separato", () => {
    const dentro = modelliDaImportare({ quoteTemplates: [{ name: "Preventivo", kind: "offerta", contractual_terms_text: "Testo lungo delle condizioni." }] });
    expect(dentro[0].nome).toBe("Preventivo · condizioni");
    const collegato = modelliDaImportare({ quoteTemplates: [{ name: "Preventivo", kind: "offerta", linked_terms_id: "x", contractual_terms_text: "Testo lungo delle condizioni." }] });
    expect(collegato).toEqual([]);
  });

  it("i termini legali diventano un modello a parte, con la loro intestazione", () => {
    const [m] = modelliDaImportare({ quoteTemplates: [{ name: "Termini legali", kind: "legali", body_html: "# Termini legali\nDiritto di ripensamento entro 14 giorni." }] });
    expect(m.clausole[0].titolo).toBe("Termini legali");
  });

  it("i modelli PDF dei moduli entrano anche loro", () => {
    const [m] = modelliDaImportare({ modelliModulo: [{ nome: "Serramenti · modello PDF", testo: "Condizioni dei serramenti, testo lungo." }] });
    expect(m).toMatchObject({ nome: "Serramenti · modello PDF", fonte: "Modelli PDF dei moduli" });
  });

  it("quello che è già nell'archivio non si ripropone", () => {
    const gia = [{ nome: "Condizioni generali d'appalto", clausole: [{ titolo: "x", testo: html }] }];
    expect(modelliDaImportare({ quoteTemplates: [{ name: "Condizioni generali d'appalto", kind: "condizioni", body_html: html }], giaNellArchivio: gia })).toEqual([]);
  });

  it("i modelli spenti e quelli vuoti restano fuori", () => {
    expect(modelliDaImportare({ quoteTemplates: [
      { name: "Spento", kind: "condizioni", body_html: "Testo", is_active: false },
      { name: "Vuoto", kind: "condizioni", body_html: "<p> </p>" },
      { name: "Copertina", kind: "copertina", body_html: "" },
    ] })).toEqual([]);
  });

  it("un contratto da trentamila caratteri non viene accorciato", () => {
    const lungo = `<p>${"Clausola lunga. ".repeat(2000)}</p>`;
    const [m] = modelliDaImportare({ quoteTemplates: [{ name: "Appalto", kind: "condizioni", body_html: lungo }] });
    expect(m.clausole[0].testo).toHaveLength(lungo.length);
  });
});

describe("Il testo leggibile serve solo a mostrarlo", () => {
  it("toglie i tag e rimette gli a capo, senza toccare quello salvato", () => {
    expect(testoLeggibile("<p>Prima riga</p><p>Seconda&nbsp;riga</p>")).toBe("Prima riga\nSeconda riga");
    expect(testoLeggibile("<p>Tre &amp; quattro</p>")).toBe("Tre & quattro");
  });

  it("l'impronta non guarda tag, spazi e maiuscole", () => {
    expect(impronta("Titolo", "<p>Uno   due</p>")).toBe(impronta("  titolo ", "uno due"));
  });
});
