/**
 * Fase 4 — Documenti (14/11/2026).
 *  1. La descrizione di una riga del preventivo classico esce nel PDF intera e con gli a capo;
 *     la scheda del listino nei preventivatori resta corta.
 *  2. Il cliente si cerca anche per partita IVA e il collegamento si salva (preventivo e computo).
 */
import { describe, expect, it } from "vitest";
import { datiGenerici } from "@/components/preventivi/pdf/adattatoreGenerico";
import { descrizioneBreve, testoScritto } from "@/lib/moduli/testoProdotto";
import { cifrePartitaIva, filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { bozzaComputoSchema, bozzaVuota } from "@/lib/computo/editorNativo";
import sorgenteQuoteBuilder from "@/pages/azienda/marketing/QuoteBuilder.tsx?raw";
import sorgenteComputoDati from "@/components/computo/ComputoDati.tsx?raw";
import sorgenteCommessaDaComputo from "@/lib/computo/commessaDaComputo.ts?raw";
import sorgenteEditorComputo from "@/components/computo/ComputoNativoEditor.tsx?raw";
import sorgenteNota from "@/components/quotes/QuoteDescriptionFields.tsx?raw";
import pacchettoPreventivi from "../../../supabase/functions/_shared/preventivoRenderer.mjs?raw";
import pacchettoBagno from "../../../supabase/functions/bgn-genera-pdf/_render.mjs?raw";

const paragrafo = (n: number) => `Paragrafo ${n}: fornitura e posa di serramenti in PVC a cinque camere, vetrocamera basso emissivo, controtelaio coibentato e sigillatura.`;
const LUNGA = [paragrafo(1), paragrafo(2), "", paragrafo(3), paragrafo(4), paragrafo(5)].join("\n");

describe("Descrizioni lunghe nel PDF del preventivo classico", () => {
  it("la descrizione di prova supera i 600 caratteri e ha gli a capo", () => {
    expect(LUNGA.length).toBeGreaterThan(600);
    expect(LUNGA.split("\n").length).toBe(6);
  });

  it("esce intera, con gli a capo e la riga vuota, non tagliata a 220", () => {
    const dati = datiGenerici({
      quote: { quote_number: "P-1" },
      items: [{ id: "r1", name: "Finestre", description: LUNGA, quantity: 1, unit_price: 100, line_total: 100 }],
      company: null, template: {},
    });
    expect(dati.capitoli[0].voci[0].dettaglio).toBe(LUNGA);
  });

  it("toglie solo gli spazi in fondo e le righe vuote in più", () => {
    expect(testoScritto("Uno  \r\nDue\n\n\n\nTre \n")).toBe("Uno\nDue\n\nTre");
    expect(testoScritto("   ")).toBeNull();
  });

  it("la scheda del listino (preventivatori) resta una frase corta", () => {
    const breve = descrizioneBreve(LUNGA)!;
    expect(breve.length).toBeLessThanOrEqual(220);
    expect(breve).not.toContain("\n");
  });

  it("i due pacchetti precompilati del PDF sono rigenerati con la regola nuova", () => {
    for (const pacchetto of [pacchettoPreventivi, pacchettoBagno]) expect(pacchetto).toContain("descrizione_scritta");
  });

  it("ogni riga ha la descrizione modificabile che si allarga, anche nota e computo", () => {
    expect(sorgenteQuoteBuilder).toContain('aria-label={`Descrizione: ${item.name || "riga"}`}');
    expect(sorgenteQuoteBuilder).not.toContain('italic line-clamp-1');
    expect(sorgenteNota).toContain("TestoCheCresce");
    expect(sorgenteEditorComputo).toContain('<TestoCheCresce id="voce-descrizione"');
  });
});

describe("Cliente per partita IVA, collegamento salvato", () => {
  it("riconosce la partita IVA con o senza IT e con gli spazi", () => {
    expect(cifrePartitaIva("IT01234567890")).toBe("01234567890");
    expect(cifrePartitaIva("it 0123 456 7890")).toBe("01234567890");
    expect(cifrePartitaIva("Rossi")).toBeNull();
  });

  it("solo chi lo chiede cerca in vat_number (le altre tabelle non hanno la colonna)", () => {
    expect(filtriRicercaContatti("IT01234567890", { partitaIva: true })[0]).toContain("vat_number.ilike.%01234567890%");
    expect(filtriRicercaContatti("Rossi", { partitaIva: true })[0]).toContain("vat_number.ilike.%Rossi%");
    expect(filtriRicercaContatti("IT01234567890").join()).not.toContain("vat_number");
    expect(filtriRicercaContatti("Rossi").join()).not.toContain("vat_number");
  });

  it("il preventivo classico salva customer_id e usa il popup con contatti e clienti", () => {
    expect(sorgenteQuoteBuilder).toContain("customer_id: customerId,");
    expect(sorgenteQuoteBuilder).toContain("<SelezionaCliente");
    expect(sorgenteQuoteBuilder).not.toContain("function ContactCombobox");
  });

  it("il computo tiene il cliente dell'anagrafica nella bozza e lo passa al preventivo", () => {
    expect(bozzaVuota().clienteAnagraficaId).toBe("");
    const letta = bozzaComputoSchema.parse({ ...bozzaVuota(), clienteAnagraficaId: "c1" });
    expect(letta.clienteAnagraficaId).toBe("c1");
    expect(sorgenteComputoDati).toContain("clienteAnagraficaId: c.origine === \"cliente\" ? c.id : \"\"");
    expect(sorgenteCommessaDaComputo).toContain("patch.customer_id = d.bozza.clienteAnagraficaId");
  });
});

describe("Il popup dice il vero sul collegamento", () => {
  it("preventivo classico e computo dichiarano che il cliente resta collegato", () => {
    expect(sorgenteQuoteBuilder).toContain("<SelezionaCliente clienteSiCollega");
    expect(sorgenteComputoDati).toContain("<SelezionaCliente clienteSiCollega");
  });
});
