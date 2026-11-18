import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import type { ComputoStrutturato, ComputoVoceStrutturata } from "@/lib/computo/computoStrutturato";
import { contrattoDaComputo, eVoceNonLavoro } from "@/lib/orders/contrattoDaComputo";

/** Il computo ECO vero (39 pagine, PriMus) come lo legge pdfjs: lo stesso fixture del lettore. */
function pagineDalFixture(): PdfPaginaPosizionata[] {
  const righe = readFileSync(resolve(__dirname, "../fixtures/computoPrimusGenzano.tsv"), "utf8").split("\n");
  const pagine: PdfPaginaPosizionata[] = [];
  for (const riga of righe) {
    if (!riga || riga.startsWith("# ")) continue;
    if (riga.startsWith("### ")) { pagine.push({ page: Number(riga.slice(4)), items: [] }); continue; }
    const [x, right, y, ...testo] = riga.split("\t");
    pagine.at(-1)!.items.push({ x: Number(x), right: Number(right), y: Number(y), text: testo.join("\t") });
  }
  return pagine;
}

const voce = (n: number, descrizione: string, importo: number): ComputoVoceStrutturata => ({
  numero_ordine: String(n), codici: [], codice_tariffa: `C${n}`, descrizione, descrizione_troncata: false, unita_misura: "cad",
  quantita: 1, prezzo_unitario: importo, importo, sezione: "LAVORI A MISURA", super_categoria: null, categoria: null, sotto_categoria: null,
  is_sicurezza: false, is_detrazione: false, a_corpo: false, misure: [], pagina: 1, avvisi: [],
});

describe("computo caricato in «Carica contratto»: letto senza AI (17/11/2026)", () => {
  it("computo ECO: 182 voci di lavori per 1.948.331,82 €, fuori onorari, IVA e visto, fasi per categoria", () => {
    const e = contrattoDaComputo(leggiComputoPrimus(pagineDalFixture()));
    expect(e.voci).toHaveLength(182);
    expect(e.importo_totale_eur).toBeCloseTo(1948331.82, 2);
    expect(e.dati_appalto?.oneri_sicurezza_eur).toBeCloseTo(153873.55, 2);
    expect(e.cliente.nome_completo).toMatch(/Casa di Riposo/);
    // Fasi al livello più fine di PriMus, come le chiama il computo salvato nella commessa (13 fasi).
    const fasi = (e.fasi_lavoro ?? []).map((f) => f.nome.toLowerCase());
    expect(fasi).toHaveLength(13);
    expect(fasi).toContain("opere provvisionali per la sicurezza");
    expect(fasi).toContain("isolamento termico di strutture opache verticali");
    expect(fasi).toContain("centrale termica");
    expect(fasi).toContain("ventilazione meccanica controllata (vmc)");
    expect(fasi.some((f) => /oneri tecnici|iva|visto/.test(f))).toBe(false);
    expect(fasi).not.toContain("eco");
    expect(e.warnings.join(" ")).toMatch(/Esclusi 44 importi/);
    expect(e.summary).toMatch(/senza AI/);
  });

  it("computo stampato senza capitoli (come il SISMA): onorari e IVA riconosciuti dalla descrizione, fasi da fare a mano", () => {
    const c: ComputoStrutturato = {
      formato: "primus_pdf", metadata: { committente: "Committente di prova" }, prezzari: [], riepiloghi: [], avvisi: [],
      voci: [voce(1, "Oneri per la cantierizzazione di opere edili", 1500), voce(2, "Pulitura di superfici intonacate", 1825.2),
        voce(26, "Progettazione dell'Impianto di Ponteggio Disegno esecutivo", 12000),
        voce(156, "Progettazione Categoria S03", 160850.82), voce(157, "D.L. e Coordinamento sicurezza Categoria S03", 102344.31),
        voce(160, "INARCASSA Asseverazioni Sismabonus", 884.02), voce(163, "Visto di conformità SISMA", 25033.89),
        voce(166, "IVA Oneri Tecnici Sismabonus", 30377.4)],
      totale_dichiarato: 334815.64,
    };
    const e = contrattoDaComputo(c);
    expect(e.voci).toHaveLength(3);
    expect(e.importo_totale_eur).toBeCloseTo(15325.2, 2);
    expect(e.fasi_lavoro ?? []).toHaveLength(0);
    expect(e.warnings.join(" ")).toMatch(/non stampa i capitoli/);
  });

  it("con i capitoli decidono i capitoli: la progettazione del ponteggio negli oneri della sicurezza è un lavoro", () => {
    expect(eVoceNonLavoro({ descrizione: "Progettazione dell'Impianto di Ponteggio", super_categoria: { numero: 1, nome: "ECO" }, categoria: { numero: 1, nome: "ONERI DELLA SICUREZZA" }, sotto_categoria: null })).toBe(false);
    expect(eVoceNonLavoro({ descrizione: "Progettazione E 20 Cappotto", super_categoria: { numero: 3, nome: "ONERI TECNICI ECO" }, categoria: null, sotto_categoria: null })).toBe(true);
  });

  it("le lavorazioni vere non vengono scambiate per onorari", () => {
    for (const d of ["Cassetta di risciacquamento, regolabile", "Rete di adduzione per apparecchio igienico", "Isolamento termico a cappotto", "Coordinamento dei colori della facciata"]) {
      expect(eVoceNonLavoro({ descrizione: d, super_categoria: null, categoria: null, sotto_categoria: null }), d).toBe(false);
    }
  });
});

describe("fasi proposte = fasi create dal computo salvato", () => {
  it("la finestra propone le fasi con gli stessi nomi con cui il database le crea: nessuna fase doppia", async () => {
    const { daComputoStrutturato } = await import("@/lib/computo/importaVoci");
    const { rigaDaVoce } = await import("@/lib/computo/computoDaVoci");
    const computo = leggiComputoPrimus(pagineDalFixture());
    const proposte = new Set((contrattoDaComputo(computo).fasi_lavoro ?? []).map((f) => f.nome.toLowerCase()));
    // Come commessa_lavorazioni_dal_computo: coalesce(categoria, super_categoria, capitolo), senza onorari e IVA.
    const { voci } = daComputoStrutturato(computo, "computo.pdf");
    const create = new Set(voci.map((v, i) => rigaDaVoce(v, i).voce)
      .filter((r) => !eNonLavoroRiga(r))
      .map((r) => (r.categoria?.trim() || r.super_categoria?.trim() || "").toLowerCase()));
    expect([...create].sort()).toEqual([...proposte].sort());
  });
});

function eNonLavoroRiga(r: { super_categoria?: string | null; categoria?: string | null; sotto_categoria?: string | null; descrizione_breve?: string | null }) {
  return /oneri tecnici|\biva\b|visto di conformit|asseveraz|inarcassa|\bcassa\b|progettazion|spese tecniche/i
    .test([r.super_categoria, r.categoria, r.sotto_categoria].filter(Boolean).join(" | "));
}
