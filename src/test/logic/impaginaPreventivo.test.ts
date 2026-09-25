/**
 * Il preventivo generico ridisegnato (25/09/2026): il titolo, il testo che va a
 * capo misurato, la sezione delle clausole da approvare con la seconda firma e
 * il colore del documento.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  componiRighe,
  nomeLeggibile,
  paroleDelTitolo,
  pezziConGrassetto,
  senzaSezioneClausole,
  sezioneClausole,
  titoloGenerico,
} from "../../../supabase/functions/_shared/impaginaPreventivo";
import { colorePreventivo } from "../../../supabase/functions/_shared/blocchiModelloPreventivo";
import { resolveQuoteTemplatePreview } from "@/lib/quoteTemplatePreview";
import { DEFAULT_TEMPLATE, type QuoteTemplate } from "@/types/quoteTemplate";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("il titolo", () => {
  it("la punteggiatura dopo l'asterisco resta attaccata alla parola in corsivo", () => {
    expect(paroleDelTitolo("Il tuo *progetto*, spiegato bene")).toEqual([
      { testo: "Il", accento: false, attaccata: false },
      { testo: "tuo", accento: false, attaccata: false },
      { testo: "progetto", accento: true, attaccata: false },
      { testo: ",", accento: false, attaccata: true },
      { testo: "spiegato", accento: false, attaccata: false },
      { testo: "bene", accento: false, attaccata: false },
    ]);
    expect(paroleDelTitolo("*Offerta* speciale").map((p) => p.attaccata)).toEqual([false, false]);
  });

  it("«Preventivo» da solo non è un titolo: si scrive per chi è", () => {
    expect(titoloGenerico("Preventivo", "OFF-2026-002")).toBe(true);
    expect(titoloGenerico("Preventivo OFF-2026-002", "OFF-2026-002")).toBe(true);
    expect(titoloGenerico("Offerta n. 12")).toBe(true);
    expect(titoloGenerico("Nuovo preventivo")).toBe(true);
    expect(titoloGenerico("Preventivo serramenti")).toBe(false);
    expect(titoloGenerico("Fornitura e posa serramenti")).toBe(false);
  });

  it("il nome tutto maiuscolo diventa leggibile, quello scritto a mano resta com'è", () => {
    expect(nomeLeggibile("TARTANI MAURO")).toBe("Tartani Mauro");
    expect(nomeLeggibile("D'ANGELO LUCA")).toBe("D'Angelo Luca");
    expect(nomeLeggibile("Luca D'ANGELO")).toBe("Luca D'ANGELO");
    expect(nomeLeggibile("  mario   rossi ")).toBe("mario rossi");
  });
});

describe("il testo va a capo misurato", () => {
  // Ogni carattere largo 1: le righe si contano a occhio.
  const misura = (testo: string) => testo.length;

  it("riempie la riga fino alla larghezza, poi va a capo", () => {
    const righe = componiRighe([{ testo: "uno due tre quattro cinque", stile: "n" }], 9, misura);
    expect(righe.map((r) => r.map((t) => t.testo).join(""))).toEqual(["uno due", "tre", "quattro", "cinque"]);
  });

  it("gli stili diversi restano tratti diversi, al loro posto", () => {
    const righe = componiRighe([{ testo: "1.2 ", stile: "g" }, { testo: "Il Cliente affida", stile: "n" }], 40, misura);
    expect(righe).toHaveLength(1);
    expect(righe[0]).toEqual([
      { testo: "1.2", stile: "g", x: 0, larghezza: 3 },
      { testo: "Il Cliente affida", stile: "n", x: 4, larghezza: 17 },
    ]);
  });

  it("la prima riga può essere più corta (un'etichetta davanti)", () => {
    const righe = componiRighe([{ testo: "aaaa bbbb cccc", stile: "n" }], 9, misura, 4);
    expect(righe.map((r) => r[0].testo)).toEqual(["aaaa", "bbbb cccc"]);
  });

  it("una parola più lunga della riga si spezza invece di uscire dal foglio", () => {
    const righe = componiRighe([{ testo: "www.esempiomoltolungo.it", stile: "n" }], 10, misura);
    expect(righe.map((r) => r[0].testo)).toEqual(["www.esempi", "omoltolung", "o.it"]);
  });

  it("il **grassetto** del markdown diventa un pezzo in grassetto", () => {
    expect(pezziConGrassetto("Una **squadra sola** dall'inizio", "n", "g")).toEqual([
      { testo: "Una ", stile: "n" },
      { testo: "squadra sola", stile: "g" },
      { testo: " dall'inizio", stile: "n" },
    ]);
  });
});

describe("le clausole da approvare con la seconda firma", () => {
  const condizioni = [
    "# Condizioni generali di fornitura",
    "## Art. 5 – Foro esclusivo",
    "Foro di Padova.",
    "## Specifica approvazione delle clausole (artt. 1341 e 1342 c.c.)",
    "Ai sensi degli artt. 1341 e 1342 c.c., nonché degli artt. 33 e 34 del D.Lgs. 206/2005, le parti sottoscrivono:",
    "- Art. 1 – Oggetto del contratto",
    "- Art. 5 – Foro esclusivo",
    "",
    "Il Cliente dichiara di essere stato reso edotto della portata delle clausole.",
  ].join("\n");

  it("il riquadro prende le parole dell'azienda prima e dopo l'elenco, non solo l'elenco", () => {
    expect(sezioneClausole(condizioni)).toEqual({
      premessa: ["Ai sensi degli artt. 1341 e 1342 c.c., nonché degli artt. 33 e 34 del D.Lgs. 206/2005, le parti sottoscrivono:"],
      voci: ["Art. 1 – Oggetto del contratto", "Art. 5 – Foro esclusivo"],
      chiusura: ["Il Cliente dichiara di essere stato reso edotto della portata delle clausole."],
    });
  });

  it("nel testo la sezione non si ripete: sta nel riquadro", () => {
    const testo = senzaSezioneClausole(condizioni);
    expect(testo).toContain("## Art. 5 – Foro esclusivo");
    expect(testo).not.toContain("1341");
    expect(testo).not.toContain("reso edotto");
  });

  it("senza titolo o senza voci, niente seconda firma", () => {
    expect(sezioneClausole("## Art. 1\nTesto.")).toBeNull();
    expect(sezioneClausole("## Clausole da approvare specificamente\nNessuna.")).toBeNull();
  });
});

describe("il colore del preventivo", () => {
  it("vale il modello, poi il marchio, poi i blocchi collegati; il blu di fabbrica per ultimo", () => {
    expect(colorePreventivo("#0F766E", "#B45309", [{ primary_color: "#166534" }])).toBe("#0F766E");
    expect(colorePreventivo("#1E40AF", "#B45309", [{ primary_color: "#166534" }])).toBe("#B45309");
    // Ener: modello e marchio al blu di fabbrica, copertina e condizioni verdi.
    expect(colorePreventivo("#1E40AF", "#1E40AF", [{ primary_color: "#166534" }, { primary_color: "#166534" }])).toBe("#166534");
    expect(colorePreventivo("#1E40AF", null, [null, { primary_color: "#1E40AF" }])).toBe("#1E40AF");
    expect(colorePreventivo(null, undefined, [])).toBe("#1E40AF");
  });
});

describe("le anteprime hanno il colore del PDF", () => {
  const offerta = { ...DEFAULT_TEMPLATE, linked_cover_id: "copertina", linked_terms_id: "condizioni" } as Partial<QuoteTemplate>;
  const blocco = (id: string, kind: string, colore: string) => ({ ...DEFAULT_TEMPLATE, id, kind, primary_color: colore }) as QuoteTemplate;

  it("modello al blu di fabbrica e marchio non scelto: vale il verde dei blocchi, anche per tabella e totale", () => {
    const anteprima = resolveQuoteTemplatePreview(offerta, [blocco("copertina", "copertina", "#166534"), blocco("condizioni", "condizioni", "#166534")], "#1E40AF");
    expect(anteprima.primary_color).toBe("#166534");
    expect(anteprima.colore_copertina).toBe("#166534");
  });

  it("il marchio scelto viene prima dei blocchi, il modello scelto prima di tutto", () => {
    expect(resolveQuoteTemplatePreview(offerta, [blocco("condizioni", "condizioni", "#166534")], "#B45309").primary_color).toBe("#B45309");
    expect(resolveQuoteTemplatePreview({ ...offerta, primary_color: "#0F766E" }, [], "#B45309").primary_color).toBe("#0F766E");
  });

  it("chi usa la pagina lo passa: editor dei modelli e costruttore del preventivo", () => {
    const editor = leggi("src/pages/azienda/settings/SettingsQuoteTemplates.tsx");
    expect(editor).toContain("template={resolveQuoteTemplatePreview(form, templates, effectiveCompany?.brand_primary_color)}");
    expect(editor).toContain("brandColor={effectiveCompany?.brand_primary_color}");
    const builder = leggi("src/pages/azienda/marketing/QuoteBuilder.tsx");
    expect(builder).toContain(": (selectedTemplate ?? {}), templates, effectiveCompany?.brand_primary_color);");
  });
});

describe("il PDF (generate-quote-pdf) usa le regole nuove", () => {
  const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");

  it("il colore del documento arriva anche dai blocchi collegati", () => {
    expect(pdf).toContain("t.primary_color = colorePreventivo(t.primary_color, company?.brand_primary_color, [t.composed_cover, t.composed_terms, t.composed_legal]);");
  });

  it("la tabella del classico: fascia nel colore dell'azienda, nome che va a capo, colonne larghe quanto i valori", () => {
    expect(pdf).toContain("page.drawRectangle({ x: itemLeftX, y: y - hFascia, width: itemWidth, height: hFascia, color: fondoEdC });");
    expect(pdf).toContain("const righeNome = righeDi([{ testo: String(item.name || \"\"), stile: stNome }], wTesto, wTesto - (wOpz ? wOpz + 5 : 0)).slice(0, 3);");
    expect(pdf).toContain("await rigaDelClassico(item, idx, { isNota, isSubtotale, isChild, isOptional });");
  });

  it("il subtotale non è più barrato dal suo filetto", () => {
    expect(pdf).toContain("page.drawLine({ start: { x: cPrezzoR - 40, y: y - 5 }, end: { x: cImportoR + 4, y: y - 5 }");
  });

  it("le condizioni prendono il titolo dal testo e il riquadro le parole dell'azienda", () => {
    expect(pdf).toContain("const clausole = sezioneClausole(condizioniETermini);");
    expect(pdf).toMatch(/drawRichTextBlock\("Condizioni contrattuali e termini legali", testoCondizioni, \{\n\s+titoloDalTesto: true,/);
    expect(pdf).toContain("ensureSpace(altezza + 18, titoloCondizioni);");
  });

  it("nel classico le note lunghe stanno intere prima delle firme, non dopo il modulo di recesso", () => {
    expect(pdf).toContain("if (righeNota.length <= 8) infoCols.push({ label: \"NOTE\", text: noteTxt });");
    expect(pdf).toContain("if (t.show_notes && opzione(\"pdf_mostra_note_cliente\") && quote.notes && !classicPremium) {");
  });
});
