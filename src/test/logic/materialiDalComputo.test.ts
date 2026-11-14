/**
 * «Genera dal computo» (14/11/2026): dalle voci di un computo di prova, con voci
 * composte (fornitura e posa, compreso…, spessori), ai materiali da comprare,
 * collegati ad articoli e listini dell'azienda, con fonte e sicurezza.
 */
import { describe, expect, it } from "vitest";
import { generaDistinta, materialiCompresi, nomeMateriale, specificheDallaVoce, spessoreCm, type Scomposizione, type VoceComputo } from "@/lib/distinta/generaDistinta";
import { sceltePerRicordare, testoRicordi } from "@/lib/distinta/ricordaScelte";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { collegaMateriali, contenutoConfezione, nomiInConflitto, rigaDaSalvare, somiglianzaNome } from "@/lib/distinta/collegaArticoli";
import { faseDaTesto, faseDelMestiere, propostaFasi } from "@/lib/distinta/fasiMateriali";

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

  it("non collega un articolo fatto d'altro o di altre misure (ceramica ≠ resina, 80x120 ≠ 80x100)", () => {
    // Prova su Demo Azienda 2, 14/11/2026: il piatto doccia in ceramica andava sul «Piatto doccia in resina 80x120».
    const doccia = [voce({ id: "d", descrizione_breve: "Fornitura e posa in opera di piatto doccia in ceramica 80x120, compreso piletta", unita_misura: "cad", quantita: 1 })];
    const collega = (articoli: { id: string; name: string }[]) => {
      const r = generaDistinta({ voci: doccia, scomposizioni: [], riserva: catalogoComeScomposizioni() });
      return collegaMateriali(r.righe, { articoli: articoli.map((a) => ({ ...a, unit_of_measure: "pz" })), listini: [], giaUsati: [] })[0].collegamento?.id ?? null;
    };
    expect(collega([{ id: "resina", name: "Piatto doccia in resina 80x120" }])).toBeNull();
    expect(collega([{ id: "piccolo", name: "Piatto doccia ceramica 80x100" }])).toBeNull();
    expect(collega([{ id: "resina", name: "Piatto doccia in resina 80x120" }, { id: "giusto", name: "Piatto doccia ceramica 120x80 bianco" }])).toBe("giusto");
    // Neanche se una volta qualcuno (o la proposta stessa) l'ha collegato così.
    const r = generaDistinta({ voci: doccia, scomposizioni: [], riserva: catalogoComeScomposizioni() });
    const giaUsati = [{ name: r.righe[0].descrizione, unita_misura: r.righe[0].unita_misura, article_template_id: "resina" }];
    expect(collegaMateriali(r.righe, { articoli: [{ id: "resina", name: "Piatto doccia in resina 80x120", unit_of_measure: "pz" }], listini: [], giaUsati })[0].collegamento).toBeNull();
    // Senza materia o misura scritta da una parte, nessun conflitto; il gres è una ceramica.
    expect(nomiInConflitto("Piastrelle in gres porcellanato", "Piastrelle gres porcellanato 60x60")).toBe(false);
    expect(nomiInConflitto("Rivestimento in ceramica", "Piastrelle gres porcellanato")).toBe(false);
    expect(nomiInConflitto("Tubo multistrato 20 mm", "Tubo in polipropilene 20 mm")).toBe(true);
    expect(somiglianzaNome("Lavabo in ceramica", "Lavabo ceramica sospeso")).toBeGreaterThan(0);
  });

  describe("un secondo computo, più difficile (simulazione del 14/11/2026)", () => {
    const FASI = ["Demolizioni e rimozioni", "Opere murarie", "Impianto idraulico", "Impianto elettrico", "Massetti e sottofondi",
      "Intonaci e cartongessi", "Posa pavimenti e rivestimenti", "Serramenti", "Tinteggiature"].map((name) => ({ id: name, name }));
    const prova = (descrizione_breve: string, unita_misura: string, quantita: number) => {
      const v = voce({ id: "x", descrizione_breve, unita_misura, quantita });
      const r = generaDistinta({ voci: [v], scomposizioni: [], riserva: catalogoComeScomposizioni() });
      const q = (nome: string) => r.righe.find((m) => m.descrizione === nome)?.quantita_calcolata;
      return { r, q, fase: faseDaTesto(v, FASI), nomi: r.righe.map((m) => m.descrizione) };
    };

    it("il cappotto «compresi collante, tasselli, rete e rasatura» è il sistema intero, pannelli compresi", () => {
      const { nomi } = prova("Isolamento a cappotto con pannelli in EPS sp. 10 cm, compresi collante, tasselli, rete e rasatura", "mq", 180);
      expect(nomi).toEqual(expect.arrayContaining(["Pannello isolante per cappotto", "Collante per pannelli isolanti", "Tassello per cappotto", "Rasante per cappotto"]));
    });

    it("l'autolivellante è un premiscelato a spessore; il primer resta a superficie", () => {
      const { q, nomi, fase } = prova("Massetto autolivellante a base cementizia spessore 3 cm", "mq", 60);
      expect(nomi).not.toContain("Cemento");
      expect(q("Massetto autolivellante premiscelato")).toBe(3213); // 17 kg/mq·cm × 3 × 60 + 5%
      expect(q("Primer per autolivellante")).toBe(9.45);
      expect(fase).toBe("Massetti e sottofondi");
    });

    it("pittura al quarzo, rasatura e muratura hanno una regola; la pittura si compra a litri", () => {
      expect(prova("Pittura al quarzo per esterni, due mani", "mq", 220).q("Pittura al quarzo per esterni")).toBe(69.3);
      expect(prova("Rasatura di pareti con stucco in polvere, due mani", "mq", 150).r.senzaScomposizione).toHaveLength(0);
      expect(prova("Muratura in blocchi di laterizio forato sp. 12 cm, malta cementizia", "mq", 30).q("Blocco in laterizio forato")).toBe(504);
    });

    it("la caldaia «fornita e posta in opera» ha il nome pulito e la posa esclusa; le tubazioni sono il materiale", () => {
      const caldaia = prova("Caldaia a condensazione 25 kW, fornita e posta in opera, compreso allacciamenti", "cad", 1).r.righe[0];
      expect(caldaia.descrizione).toBe("Caldaia a condensazione 25 kW");
      expect(caldaia.note).toContain("Posa e manodopera della voce escluse: si compra solo il materiale");
      expect(prova("Tubazioni in multistrato per impianto idrico, diametro 16-20 mm", "m", 80).r.righe).toHaveLength(1);
    });

    it("«rimozione e rifacimento» non è una demolizione pura: il materiale nuovo si compra, nella fase dell'intonaco", () => {
      const { nomi, fase } = prova("Rimozione e rifacimento di intonaco ammalorato su facciata", "mq", 25);
      expect(nomi).toContain("Intonaco premiscelato di fondo");
      expect(fase).toBe("Intonaci e cartongessi");
      expect(prova("Rimozione di intonaco ammalorato", "mq", 25).r.escluse).toHaveLength(1);
    });

    it("senza capitolo, la fase viene dal mestiere della voce", () => {
      const fase = (t: string) => faseDelMestiere(t, FASI);
      expect(fase("Controsoffitto in cartongesso con lastra da 12,5 mm")).toBe("Intonaci e cartongessi");
      expect(fase("Fornitura e posa di vaso sospeso in ceramica")).toBe("Impianto idraulico");
      expect(fase("Porta interna tamburata laccata bianca 80x210")).toBe("Serramenti");
      expect(fase("Battiscopa in legno h 8 cm")).toBe("Posa pavimenti e rivestimenti");
      expect(fase("Demolizione di tramezzi")).toBe("Demolizioni e rimozioni");
      expect(fase("Smaltimento rifiuti misti da cantiere")).toBeNull();
    });
  });

  describe("compreso, misure della voce, scelte da ricordare (14/11/2026)", () => {
    const una = (descrizione_breve: string, unita_misura: string, quantita: number) =>
      generaDistinta({ voci: [voce({ id: "x", descrizione_breve, unita_misura, quantita })], scomposizioni: [], riserva: catalogoComeScomposizioni() });

    it("quello che la voce di fornitura dice «compreso» si compra anche lui, da controllare", () => {
      const r = una("Fornitura e posa in opera di piatto doccia in ceramica 80x120, compreso piletta e silicone", "cad", 2);
      expect(r.righe.map((m) => [m.descrizione, m.quantita_calcolata, m.fonte])).toEqual(expect.arrayContaining([
        ["Piatto doccia in ceramica 80x120", 2, "fornitura"], ["Piletta", 2, "compreso"], ["Silicone", 2, "compreso"],
      ]));
      expect(r.righe.find((m) => m.descrizione === "Piletta")!.affidabilita).toBeLessThan(0.65);
      expect(una("Fornitura e posa di pavimento in laminato AC4 sp. 8 mm, compreso materassino", "mq", 55).righe.map((m) => m.descrizione)).toContain("Materassino");
    });

    it("prestazioni e «completa di» non sono materiali da comprare a parte", () => {
      expect(materialiCompresi("Caldaia a condensazione 25 kW, compreso allacciamenti, trasporto e ogni onere")).toEqual([]);
      expect(materialiCompresi("Radiatore in alluminio, compresi valvola, detentore e accessori")).toEqual(["Valvola", "Detentore"]);
      expect(una("Porta interna tamburata 80x210, completa di maniglia, serratura e cerniere", "cad", 5).righe).toHaveLength(1);
      // Nella libreria «compreso collante e stuccatura» è già dentro la scomposizione: niente doppioni.
      expect(una("Pavimento in gres porcellanato 60x60, compreso collante e stuccatura", "mq", 45).righe.every((m) => m.fonte === "libreria_standard")).toBe(true);
    });

    it("spessore, isolante e formato della voce entrano nelle specifiche del materiale", () => {
      const cappotto = una("Isolamento a cappotto con pannelli in EPS sp. 10 cm, compresi collante, tasselli, rete e rasatura", "mq", 180).righe;
      expect(cappotto.find((m) => m.descrizione === "Pannello isolante per cappotto")!.specifiche).toBe("EPS, spessore 10 cm");
      expect(cappotto.find((m) => m.descrizione === "Tassello per cappotto")!.specifiche).toMatch(/^Lunghezza almeno 140 mm/);
      expect(una("Pavimento in gres porcellanato 60x60", "mq", 45).righe.find((m) => m.descrizione === "Piastrelle in gres porcellanato")!.specifiche).toBe("Formato 60x60");
      expect(specificheDallaVoce("25×25 cm in faccia, spessore da progetto", "Muratura in forati sp. 12 cm")).toBe("25×25 cm in faccia, spessore 12 cm");
      expect(specificheDallaVoce("EPS o lana minerale, spessore da progetto", "cappotto in lana di roccia")).toBe("lana di roccia, spessore da progetto");
    });

    it("ricorda una scomposizione della libreria senza i materiali tolti, e le proposte dell'AI accese", () => {
      const libreria = catalogoComeScomposizioni();
      const r = generaDistinta({ voci: [COMPUTO[0]], scomposizioni: [], riserva: libreria });
      const materiali = collegaMateriali(r.righe, { articoli: [], listini: [], giaUsati: [] });
      const spento = new Set(["Paraspigolo"]);
      const scelte = sceltePerRicordare(materiali, (m) => !spento.has(m.descrizione), libreria);
      expect(scelte.libreria).toHaveLength(1);
      expect(scelte.libreria[0]).toMatchObject({ tolti: ["Paraspigolo"] });
      expect(scelte.libreria[0].standard.id).toBe("ED-INTONACO-PREMISCELATO");
      expect(scelte.libreria[0].tenuti.map((c) => c.descrizione)).toEqual(["Intonaco premiscelato di fondo"]);
      expect(testoRicordi(scelte)).toEqual(["«Intonaco premiscelato (1,5 cm)» senza Paraspigolo"]);
      // La copia ricordata vale prima della libreria, è «dell'azienda» e scala ancora con lo spessore.
      const copia: Scomposizione = { ...scelte.libreria[0].standard, id: "s-az", codice_standard: "ED-INTONACO-PREMISCELATO", componenti: scelte.libreria[0].tenuti };
      const dopo = generaDistinta({ voci: [COMPUTO[0]], scomposizioni: [copia], riserva: libreria });
      expect(dopo.righe.map((m) => [m.descrizione, m.quantita_calcolata, m.fonte])).toEqual([["Intonaco premiscelato di fondo", 2100, "scomposizione"]]);
      // Niente da ricordare se nulla è tolto, o se è tolto tutto (in questa commessa non si compra).
      expect(sceltePerRicordare(materiali, () => true, libreria).libreria).toEqual([]);
      expect(sceltePerRicordare(materiali, () => false, libreria).libreria).toEqual([]);
      // Una proposta dell'AI accesa si approva.
      const ai: Scomposizione = { id: "s-ai", nome: "Nicchia", codice_prezzario: null, parole_chiave: ["nicchia"], unita_misura: "cad", attiva: false,
        componenti: [{ descrizione: "Lastra in cartongesso", unita_misura: "mq", quantita_per_unita: 1.5 }] };
      const conAI = generaDistinta({ voci: [COMPUTO[8]], scomposizioni: [], riserva: libreria, proposteAI: [ai] });
      const mAI = collegaMateriali(conAI.righe, { articoli: [], listini: [], giaUsati: [] });
      expect(sceltePerRicordare(mAI, () => true, libreria, [ai]).approvaAI).toEqual([{ id: "s-ai", nome: "Nicchia" }]);
      expect(sceltePerRicordare(mAI, (m) => !m.proposta_ai, libreria, [ai]).approvaAI).toEqual([]);
    });
  });
});
