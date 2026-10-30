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
import { datiGenerici } from "@/components/preventivi/pdf/adattatoreGenerico";
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
    expect(nomeLeggibile("ROSSI MARIO")).toBe("Rossi Mario");
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
  // Dal 27/10/2026 (2f5ea4316) il PDF del generico lo disegna DocumentoEdilePDF, attraverso
  // l'adattatore generico: generate-quote-pdf prepara i dati, il documento li impagina.
  const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");
  const doc = leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx");
  const edile = leggi("src/components/preventivi/pdf/adattatoreEdile.ts");

  it("il colore del documento arriva anche dai blocchi collegati", () => {
    expect(pdf).toContain("primary_color: colorePreventivo(t.primary_color, company?.brand_primary_color, [t.composed_cover, t.composed_terms, t.composed_legal])");
  });

  it("la tabella: testata nel colore dell'azienda, nome che va a capo, colonne larghe quanto i valori", () => {
    expect(doc).toContain("paddingBottom: 6, borderBottomWidth: 1.2, borderBottomColor: tema.fondo }}>");
    // La lavorazione prende lo spazio che resta e va a capo; le colonne dei numeri hanno la loro larghezza.
    expect(doc).toContain("<Text style={[cella, { lineHeight: 1.35 }]}>{v.descrizione}</Text>");
    expect(doc).toContain("{mostraPrezzi ? <Text style={[testa, { width: 66, textAlign: \"right\" }]}>PREZZO</Text> : null}");
    expect(doc).toContain("{mostraImporti ? <Text style={[testa, { width: 74, textAlign: \"right\" }]}>IMPORTO</Text> : null}");
  });

  it("il subtotale non è più barrato dal suo filetto", () => {
    // Il filetto è il bordo della riga del totale, sopra il testo: non può attraversarlo.
    expect(doc).toMatch(/marginTop: 6, paddingTop: 10, borderTopWidth: 1\.2, borderTopColor: tema\.inchiostro \}\}>\n\s+<Text[^\n]*>TOTALE LAVORAZIONI · IVA ESCLUSA<\/Text>/);
  });

  it("le condizioni prendono i titoli dal testo e il riquadro le parole dell'azienda", () => {
    expect(edile).toContain("clausoleDaApprovare: clausoleDaApprovare(condizioniLegali),");
    expect(doc).toContain("{modello.clausoleDaApprovare.map((c, i) => (");
    expect(doc).toContain("colore={r.tipo==='h1'||r.tipo==='h2'?(modello.coloreCondizioni ?? tema.inchiostro):tema.grigio}");
  });

  it("le note lunghe stanno intere prima delle firme, non dopo il modulo di recesso", () => {
    const nota = Array.from({ length: 12 }, (_, i) => `Riga ${i + 1} della nota del cliente.`).join("\n");
    const dati = datiGenerici({ quote: { quote_number: "P-1", notes: nota }, items: [], company: null, template: {} });
    expect(dati.sezioniTecniche?.find((s) => s.id === "accordi")?.righe).toContainEqual({ etichetta: "Note", valore: nota });
    // I capitoli tecnici escono prima della pagina della firma e del modulo di recesso.
    expect(doc.indexOf("const contenutoTecnico = ")).toBeLessThan(doc.indexOf('id={edileSectionDestination("firma")}'));
    expect(doc.indexOf('id={edileSectionDestination("firma")}')).toBeLessThan(doc.indexOf('id={edileSectionDestination("recesso")}'));
    // Le note escono solo se lo step «Documenti e PDF» le lascia accese.
    expect(pdf).toContain('notes: opzione("pdf_mostra_note_cliente") ? quote.notes : null,');
  });
});
