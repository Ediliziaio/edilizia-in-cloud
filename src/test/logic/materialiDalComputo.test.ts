/**
 * «Genera dal computo» (14/11/2026): dalle voci di un computo di prova, con voci
 * composte (fornitura e posa, compreso…, spessori), ai materiali da comprare,
 * collegati ad articoli e listini dell'azienda, con fonte e sicurezza.
 */
import { describe, expect, it } from "vitest";
import { generaDistinta, nomeMateriale, spessoreCm, type Scomposizione, type VoceComputo } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { collegaMateriali, contenutoConfezione, rigaDaSalvare } from "@/lib/distinta/collegaArticoli";
import { faseDaTesto, propostaFasi } from "@/lib/distinta/fasiMateriali";

const voce = (p: Partial<VoceComputo> & { id: string; descrizione_breve: string }): VoceComputo => ({ quantita: 1, unita_misura: "cad", ...p });

/** Un piccolo computo di ristrutturazione, come lo scrive un tecnico. */
const COMPUTO: VoceComputo[] = [
  voce({ id: "v1", codice_prezzario: "01.A10.020", descrizione_breve: "Intonaco civile premiscelato per interni, spessore 2 cm, compreso paraspigoli", unita_misura: "mq", quantita: 100, super_categoria: "Opere murarie" }),
  voce({ id: "v2", codice_prezzario: "05.P12.001", descrizione_breve: "Fornitura e posa in opera di piatto doccia in ceramica 80x120, compreso piletta e silicone", unita_misura: "cad", quantita: 2, super_categoria: "Bagni" }),
  voce({ id: "v3", descrizione_breve: "Posa in opera di pavimento in gres fornito dalla committenza", unita_misura: "mq", quantita: 40 }),
  voce({ id: "v4", descrizione_breve: "Demolizione di tramezzi in laterizio, compreso trasporto a discarica", unita_misura: "mq", quantita: 30 }),
  voce({ id: "v5", descrizione_breve: "Fornitura di cemento CEM II 32,5 R in sacchi", unita_misura: "kg", quantita: 500 }),
  voce({ id: "v6", descrizione_breve: "Massetto in sabbia e cemento sp. 6 cm", unita_misura: "mq", quantita: 50 }),
  voce({ id: "v7", descrizione_breve: "Oneri della sicurezza", unita_misura: "a corpo", quantita: 1, is_sicurezza: true }),
  voce({ id: "v8", descrizione_breve: "Operaio specializzato", unita_misura: "h", quantita: 16 }),
  voce({ id: "v9", descrizione_breve: "Realizzazione di nicchia decorativa su disegno", unita_misura: "cad", quantita: 1 }),
];

const ARTICOLI = [
  { id: "a-into", name: "Intonaco premiscelato di fondo calce-cemento sacco 25 kg", sku: "INT25", unit_of_measure: "sacco", supplier_id: "f-edil", prezzo_acquisto_netto: 6.8 },
  { id: "a-doccia", name: "Piatto doccia ceramica 80x120 bianco", sku: "05.P12.001", unit_of_measure: "pz", supplier_id: "f-bagno", prezzo_acquisto_netto: 145 },
];
const LISTINI = [
  { id: "l-cem", codice: "CEM325", descrizione: "Cemento CEM II 32,5 R sacco 25 kg", unita: "sacco", prezzo: 5.2, sconto_pct: 10, supplier_id: "f-edil", listino: "Edilmarket 2026" },
];

function proposta(extra: { proposteAI?: Scomposizione[] } = {}) {
  const r = generaDistinta({ voci: COMPUTO, scomposizioni: [], riserva: catalogoComeScomposizioni(), ...extra });
  return { r, materiali: collegaMateriali(r.righe, { articoli: ARTICOLI, listini: LISTINI, giaUsati: [] }) };
}

describe("riconoscimento dei materiali da un computo con voci composte", () => {
  it("l'intonaco a mq diventa kg secondo resa e spessore, poi sacchi dell'articolo", () => {
    const { materiali } = proposta();
    const into = materiali.find((m) => m.descrizione === "Intonaco premiscelato di fondo")!;
    // 15 kg/mq per 1,5 cm → 20 kg/mq a 2 cm; 100 mq + 5% di sfrido = 2.100 kg.
    expect(into.quantita_calcolata).toBe(2100);
    expect(into.unita_misura).toBe("kg");
    expect(into.note[0]).toMatch(/Spessore 2 cm invece di 1,5/);
    expect(into.fonte).toBe("libreria_standard");
    expect(into.collegamento?.id).toBe("a-into");
    expect(into.conversione).toMatchObject({ quantita: 84, unita: "sacco" });
    // Il paraspigolo non scala con lo spessore.
    expect(materiali.find((m) => m.descrizione === "Paraspigolo")!.quantita_calcolata).toBe(15.75);
    expect(into.origini[0]).toMatchObject({ tipo: "computo", voce_id: "v1", codice: "01.A10.020" });
  });

  it("la fornitura e posa separa il materiale dalla posa, e lo collega per codice", () => {
    const { materiali } = proposta();
    const doccia = materiali.find((m) => m.origini.some((o) => o.tipo === "computo" && o.voce_id === "v2"))!;
    expect(doccia.descrizione).toBe("Piatto doccia in ceramica 80x120");
    expect(doccia.note).toContain("Posa e manodopera della voce escluse: si compra solo il materiale");
    expect(doccia.collegamento).toMatchObject({ tipo: "articolo", id: "a-doccia", fonte: "codice" });
    expect(doccia.article_template_id).toBe("a-doccia");
    expect(doccia.affidabilita).toBeGreaterThan(0.8);
  });

  it("sola posa, materiale del committente, demolizioni, sicurezza e ore restano fuori, col motivo", () => {
    const { r } = proposta();
    const motivo = (id: string) => r.escluse.find((e) => e.voce_id === id)?.motivo;
    expect(motivo("v3")).toMatch(/Solo posa/);
    expect(motivo("v4")).toMatch(/Demolizione/);
    expect(motivo("v7")).toMatch(/sicurezza/);
    expect(motivo("v8")).toMatch(/Manodopera/);
  });

  it("la fornitura pura resta il materiale (niente collanti aggiunti) e trova il listino del fornitore", () => {
    const { materiali } = proposta();
    const cemento = materiali.find((m) => m.origini.some((o) => o.tipo === "computo" && o.voce_id === "v5"))!;
    expect(cemento.descrizione).toBe("Cemento CEM II 32,5 R in sacchi");
    expect(cemento.collegamento).toMatchObject({ tipo: "listino", id: "l-cem", prezzo: 4.68, supplier_id: "f-edil" });
    expect(cemento.conversione).toMatchObject({ quantita: 20, unita: "sacco" });
    expect(cemento.supplier_id).toBe("f-edil");
  });

  it("il massetto scala sabbia e cemento con lo spessore scritto", () => {
    const { materiali } = proposta();
    const cemento = materiali.find((m) => m.descrizione === "Cemento" && m.origini.some((o) => o.tipo === "computo" && o.voce_id === "v6"))!;
    // 15 kg/mq a 5 cm → 18 a 6 cm; 50 mq + 5% = 945 kg.
    expect(cemento.quantita_calcolata).toBe(945);
  });

  it("quello che le regole non coprono va all'AI; le sue proposte entrano spente e poco sicure", () => {
    const { r } = proposta();
    expect(r.senzaScomposizione.map((v) => v.id)).toEqual(["v9"]);
    const ai: Scomposizione = {
      id: "s-ai", nome: "Nicchia in cartongesso", codice_prezzario: null, parole_chiave: ["nicchia"], unita_misura: "cad", attiva: false,
      componenti: [{ descrizione: "Lastra in cartongesso", unita_misura: "mq", quantita_per_unita: 1.5 }],
    };
    const conAI = proposta({ proposteAI: [ai] });
    expect(conAI.r.senzaScomposizione).toHaveLength(0);
    const lastra = conAI.materiali.find((m) => m.proposta_ai)!;
    expect(lastra).toMatchObject({ descrizione: "Lastra in cartongesso", fonte: "proposta_ai", scomposizione_id: "s-ai" });
    expect(lastra.affidabilita).toBeLessThan(0.65);
  });

  it("la riga da salvare porta fonte e sicurezza nelle origini e tiene la chiave", () => {
    const { materiali } = proposta();
    const into = materiali.find((m) => m.descrizione === "Intonaco premiscelato di fondo")!;
    const riga = rigaDaSalvare(into);
    expect(riga).toMatchObject({ chiave: into.chiave, quantita_calcolata: 84, unita_misura: "sacco", article_template_id: "a-into" });
    expect(riga.specifiche).toMatch(/2100 kg = 84 sacco da 25 kg/);
    expect(riga.origini[0]).toMatchObject({ fonte: "libreria_standard", affidabilita: expect.any(Number) });
    expect(riga).not.toHaveProperty("collegamento");
  });

  it("il capitolo va nella fase che lo nomina, non in quella che gli somiglia per sinonimo", () => {
    const fasi = ["Opere murarie", "Massetti e sottofondi", "Intonaci e cartongessi"].map((name) => ({ id: name, name }));
    const p = propostaFasi([
      voce({ id: "a", descrizione_breve: "x", super_categoria: "INTONACI E CARTONGESSI" }),
      voce({ id: "b", descrizione_breve: "y", super_categoria: "MASSETTI E SOTTOFONDI" }),
      voce({ id: "c", descrizione_breve: "z", super_categoria: "Murature" }),
    ], fasi);
    expect([...p.values()]).toEqual(["Intonaci e cartongessi", "Massetti e sottofondi", "Opere murarie"]);
  });

  it("le regole di supporto", () => {
    expect(nomeMateriale("F.p.o. di radiatore in alluminio 600 mm, dato in opera funzionante")).toBe("Radiatore in alluminio 600 mm");
    expect(spessoreCm("massetto sp. 6 cm")).toBe(6);
    expect(spessoreCm("intonaco spessore 20 mm")).toBe(2);
    expect(spessoreCm("nessuno")).toBeNull();
    expect(contenutoConfezione("Idropittura secchio 14 l")).toEqual({ quantita: 14, unita: "l" });
    expect(faseDaTesto(COMPUTO[0], [{ id: "f1", name: "Demolizioni" }, { id: "f2", name: "Intonaci" }])).toBe("f2");
  });
});
