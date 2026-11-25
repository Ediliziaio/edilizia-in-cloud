import { describe, expect, it } from "vitest";
import { COSTRUZIONE_PREDEFINITA, costruzioneValida, geometriaPiano } from "../../../shared/planimetrie/costruzione";
import { validaPlanimetria, type Livello, type Muro, type Planimetria } from "../../../shared/planimetrie/modello";
import { capitoloRigaStudio, disegnoDaCostruire, tipoCostruzione } from "@/lib/planimetrie/nuovaCostruzione";
import { computoStudio, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { conPrezziProposti, tipoLavorazione } from "@/lib/planimetrie/prezziProposti";
import { extraPredefiniti, previsioneLavori } from "@/lib/planimetrie/previsioneLavori";

/** Una casa di 10 × 8 m sugli assi, muri esterni da 30 cm e un tramezzo che fa due stanze. */
const muro = (id: string, x1: number, y1: number, x2: number, y2: number, tipo: Muro["tipo"], spessore = tipo === "esterno" ? 30 : 10): Muro =>
  ({ id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore, altezza: 300, tipo, stato: "esistente", origine: "rilevata" }) as Muro;
const piano = (id: string, nome: string, quota: number): Livello => ({
  id, nome, quota, proposte: [],
  fatto: {
    muri: [muro(`${id}-n`, 0, 0, 1000, 0, "esterno"), muro(`${id}-e`, 1000, 0, 1000, 800, "esterno"), muro(`${id}-s`, 1000, 800, 0, 800, "esterno"),
      muro(`${id}-o`, 0, 800, 0, 0, "esterno"), muro(`${id}-t`, 600, 0, 600, 800, "tramezzo")],
    aperture: [{ id: `${id}-f1`, muroId: `${id}-n`, tipo: "finestra", offset: 200, larghezza: 120, altezza: 140, davanzale: 90, manovra: "battente", stato: "esistente", origine: "rilevata" },
      { id: `${id}-p1`, muroId: `${id}-t`, tipo: "porta", offset: 300, larghezza: 80, altezza: 210, davanzale: 0, manovra: "battente", stato: "esistente", origine: "rilevata" }],
    locali: [
      { id: `${id}-sogg`, nome: "Soggiorno", destinazione: "soggiorno", altezza: 300, origine: "rilevata",
        contorno: [{ x: 15, y: 15 }, { x: 595, y: 15 }, { x: 595, y: 785 }, { x: 15, y: 785 }] },
      { id: `${id}-bagno`, nome: "Bagno", destinazione: "bagno", altezza: 300, origine: "rilevata",
        contorno: [{ x: 605, y: 15 }, { x: 985, y: 15 }, { x: 985, y: 785 }, { x: 605, y: 785 }] },
    ],
    elementi: [], quote: [], testi: [],
  },
}) as unknown as Livello;
const casa = (): Planimetria => ({ schema: 1, unita: "cm", livelli: [piano("pt", "Piano terra", 0), piano("p1", "Piano primo", 300)] }) as unknown as Planimetria;

describe("nuova costruzione", () => {
  it("la geometria del piano: superficie lorda, perimetro e pareti di perimetro", () => {
    const g = geometriaPiano(casa().livelli[0].fatto.muri, casa().livelli[0].fatto.locali);
    // Impronta al filo esterno dei muri: 10,30 × 8,30 m.
    expect(g.lordaMq).toBeGreaterThan(84.5);
    expect(g.lordaMq).toBeLessThan(86.5);
    expect(g.perimetroM).toBeCloseTo(37.2, 0);
    expect([...g.muriPerimetro].sort()).toEqual(["pt-e", "pt-n", "pt-o", "pt-s"]);
  });

  it("le scelte si validano e il disegno passa tutto nella variante da costruire", () => {
    expect(costruzioneValida(COSTRUZIONE_PREDEFINITA)).toBe(true);
    expect(costruzioneValida({ ...COSTRUZIONE_PREDEFINITA, scavoCm: -1 })).toBe(false);
    expect(costruzioneValida({ ...COSTRUZIONE_PREDEFINITA, fondazione: "pali" })).toBe(false);
    const doc = { ...disegnoDaCostruire(casa()), costruzione: COSTRUZIONE_PREDEFINITA };
    expect((validaPlanimetria(doc) as { errori?: string[] }).errori ?? []).toEqual([]);
    expect(doc.livelli[0].fatto.muri).toEqual([]);
    expect(doc.livelli[0].proposte[0].muri.every((m) => m.stato === "nuovo")).toBe(true);
    expect(validaPlanimetria({ ...doc, costruzione: { tipo: "nuova_costruzione" } }).ok).toBe(false);
  });

  it("lo studio aggiunge scavi, fondazioni, strutture, solai, copertura, impianti ed esterni, tutti quotati", () => {
    const doc = { ...disegnoDaCostruire(casa()), costruzione: COSTRUZIONE_PREDEFINITA };
    const righe = conPrezziProposti(studioVariante(doc, "A").righe);
    const per = (tipo: string) => righe.filter((r) => tipoCostruzione(r.id) === tipo);
    const lorda = geometriaPiano(casa().livelli[0].fatto.muri, casa().livelli[0].fatto.locali).lordaMq;
    expect(per("scavo")[0].quantita).toBeCloseTo(lorda * 1.1 * 1, 1);
    expect(per("fondazioni_ca")).toHaveLength(1);
    expect(per("struttura_ca").map((r) => r.quantita)).toEqual([+(lorda * 0.12).toFixed(2), +(lorda * 0.12).toFixed(2)]);
    expect(per("solaio_laterocemento")).toHaveLength(1);
    expect(per("scala")).toHaveLength(1);
    expect(per("copertura")).toHaveLength(1);
    expect(per("bagno_completo")).toHaveLength(2);
    expect(per("pompa_di_calore")[0].quantita).toBe(2);
    expect(per("allacciamenti")[0].unita).toBe("a corpo");
    // Le pareti di perimetro sono tamponature, intonacate dentro su una faccia sola.
    const nord = righe.find((r) => r.id === "pt-n")!;
    expect(nord.descrizione).toBe("Tamponatura esterna");
    expect(tipoLavorazione(nord)).toBe("tamponatura");
    expect(righe.find((r) => r.id === "pt-n-intonaco")!.quantita).toBeCloseTo(nord.quantita!, 1);
    expect(righe.find((r) => r.id === "pt-t")!.descrizione).toBe("Nuovo tramezzo");
    // Tutte nel loro capitolo, tutte con quantità e prezzo.
    expect(righe.every((r) => r.quantita !== null && r.prezzo)).toBe(true);
    expect(new Set(righe.map((r) => capitoloRigaStudio(r)))).not.toContain(null);
    expect(righe.find((r) => tipoCostruzione(r.id) === "ponteggio")!.gruppo).toBe("01 Opere provvisionali");
  });

  it("la previsione ha le fasi del cantiere nuovo, le attese e gli oneri tecnici", () => {
    const doc = { ...disegnoDaCostruire(casa()), costruzione: COSTRUZIONE_PREDEFINITA };
    const righe = conPrezziProposti(studioVariante(doc, "A").righe);
    const p = previsioneLavori(righe);
    const fasi = p.fasi.map((f) => f.fase);
    expect(fasi.indexOf("Scavi")).toBeLessThan(fasi.indexOf("Fondazioni"));
    expect(fasi.indexOf("Fondazioni")).toBeLessThan(fasi.indexOf("Strutture"));
    expect(p.fasi.find((f) => f.fase === "Strutture")!.attesa).toBe(7);
    expect(p.fasi.find((f) => f.fase === "Murature")!.attesa).toBe(28);
    expect(p.fasi.find((f) => f.fase === "Murature")!.squadre).toBe(3);
    expect(extraPredefiniti(righe)).toEqual(expect.arrayContaining(["progetto_costruzione", "strutturale", "oneri_comunali", "cantiere_costruzione"]));
    expect(extraPredefiniti(righe)).not.toContain("pratica");
    expect(extraPredefiniti(righe)).not.toContain("cantiere");
    expect(p.fuori).toEqual({ senzaPrezzo: 0, senzaQuantita: 0, nonStimate: 0 });
  });

  it("una ristrutturazione resta com'era: niente voci di costruzione", () => {
    const doc = disegnoDaCostruire(casa());
    const righe = studioVariante(doc, "A").righe;
    expect(righe.some((r) => tipoCostruzione(r.id))).toBe(false);
    expect(extraPredefiniti(righe)).toContain("pratica");
  });
});

describe("sopraelevazione su un edificio esistente", () => {
  const scelte = { ...COSTRUZIONE_PREDEFINITA, piani: { pt: "esistente_da_rifare" as const, p1: "nuovo" as const } };
  const doc = () => ({ ...disegnoDaCostruire(casa(), scelte), costruzione: scelte });

  it("il piano esistente tiene le pareti di perimetro; quello sopra è tutto nuovo", () => {
    const d = doc();
    expect(d.livelli[0].fatto.muri.map((m) => m.id).sort()).toEqual(["pt-e", "pt-n", "pt-o", "pt-s"]);
    expect(d.livelli[0].proposte[0].muri.find((m) => m.id === "pt-n")!.stato).toBe("esistente");
    expect(d.livelli[0].proposte[0].muri.find((m) => m.id === "pt-t")!.stato).toBe("nuovo");
    expect(d.livelli[1].fatto.muri).toEqual([]);
    expect((validaPlanimetria(d) as { errori?: string[] }).errori ?? []).toEqual([]);
  });

  it("niente scavi né fondazioni nuove: micropali, adeguamento sismico, rimozione della copertura", () => {
    const righe = conPrezziProposti(studioVariante(doc(), "A").righe);
    const tipi = new Set(righe.map((r) => tipoCostruzione(r.id)).filter(Boolean));
    for (const t of ["scavo", "fondazioni_ca", "vespaio"]) expect(tipi.has(t as never)).toBe(false);
    for (const t of ["micropali", "adeguamento_sismico", "rimozione_copertura", "svuotamento", "solaio_laterocemento", "copertura"]) expect(tipi.has(t as never)).toBe(true);
    // Struttura nuova solo sul piano sopra; le pareti di perimetro del piano esistente non sono tamponature.
    expect(righe.filter((r) => tipoCostruzione(r.id) === "struttura_ca").map((r) => r.livelloId)).toEqual(["p1"]);
    expect(righe.find((r) => r.id === "pt-n")).toBeUndefined();
    expect(righe.find((r) => r.id === "p1-n")!.descrizione).toBe("Tamponatura esterna");
    expect(righe.every((r) => r.quantita !== null && r.prezzo)).toBe(true);
  });

  it("un piano esistente che non si tocca non porta voci", () => {
    const s = { ...COSTRUZIONE_PREDEFINITA, piani: { pt: "esistente" as const, p1: "nuovo" as const } };
    const righe = studioVariante({ ...disegnoDaCostruire(casa(), s), costruzione: s }, "A").righe;
    expect(righe.filter((r) => r.livelloId === "pt" && r.piano !== "Edificio" && tipoCostruzione(r.id) && !["micropali", "cordoli_ca", "rimozione_copertura", "isolamento_pavimento", "marciapiede"].includes(tipoCostruzione(r.id)!))
      .map((r) => tipoCostruzione(r.id))).toEqual([]);
    expect(costruzioneValida({ ...s, piani: { pt: "demolito" } })).toBe(false);
  });
});

describe("esterni disegnati nel computo della costruzione", () => {
  it("aree per tipo, recinzione del lotto e piscina a m² di vasca", () => {
    const d = disegnoDaCostruire(casa());
    const p = d.livelli[0].proposte[0] as unknown as { aree: unknown[]; elementi: unknown[] };
    p.aree = [
      { id: "lotto", tipo: "lotto", contorno: [{ x: -1000, y: -1000 }, { x: 2000, y: -1000 }, { x: 2000, y: 2000 }, { x: -1000, y: 2000 }], stato: "nuovo" },
      { id: "prato", tipo: "prato", contorno: [{ x: 1200, y: 0 }, { x: 1700, y: 0 }, { x: 1700, y: 800 }, { x: 1200, y: 800 }], stato: "nuovo" },
    ];
    p.elementi = [{ id: "pisc", tipo: "piscina", posizione: { x: 1450, y: 1400 }, rotazione: 0, larghezza: 500, profondita: 800, stato: "nuovo", origine: "rilevata" }];
    const righe = conPrezziProposti(studioVariante({ ...d, costruzione: COSTRUZIONE_PREDEFINITA }, "A").righe);
    const q = (t: string) => righe.find((r) => tipoCostruzione(r.id) === t);
    expect(q("prato")!.quantita).toBe(40);
    expect(q("recinzione")!.quantita).toBe(120);
    expect(q("piscina")).toMatchObject({ quantita: 40, unita: "m²", gruppo: "12 Sistemazioni esterne" });
    expect(q("piscina")!.prezzo!.importo).toBe(900);
  });

  it("sopraelevazione: il lotto c'è già, si contano solo le opere disegnate e le aree segnate nuove", () => {
    // Callimaco: piano terra esistente; dal DWG prati senza stato, lotto esistente, due piscine nuove.
    const s = { ...COSTRUZIONE_PREDEFINITA, piani: { pt: "esistente" as const, p1: "nuovo" as const } };
    const base = casa();
    const fatto = base.livelli[0].fatto as unknown as { aree: unknown[]; elementi: unknown[] };
    fatto.aree = [
      { id: "lotto", tipo: "lotto", contorno: [{ x: -1000, y: -1000 }, { x: 2000, y: -1000 }, { x: 2000, y: 2000 }, { x: -1000, y: 2000 }], stato: "esistente" },
      { id: "prato", tipo: "prato", contorno: [{ x: 1200, y: 0 }, { x: 1700, y: 0 }, { x: 1700, y: 800 }, { x: 1200, y: 800 }] },
      { id: "vialetto", tipo: "vialetto", contorno: [{ x: 1200, y: 900 }, { x: 1700, y: 900 }, { x: 1700, y: 1000 }, { x: 1200, y: 1000 }], stato: "nuovo" },
    ];
    fatto.elementi = [{ id: "pisc", tipo: "piscina", posizione: { x: 1450, y: 1400 }, rotazione: 0, larghezza: 500, profondita: 800, origine: "rilevata" }];
    const righe = conPrezziProposti(studioVariante({ ...disegnoDaCostruire(base, s), costruzione: s }, "A").righe);
    const tipi = righe.map((r) => tipoCostruzione(r.id));
    expect(tipi).not.toContain("prato");
    expect(tipi).not.toContain("marciapiede");
    expect(righe.find((r) => tipoCostruzione(r.id) === "recinzione")?.quantita ?? 0).toBe(0);
    expect(righe.find((r) => tipoCostruzione(r.id) === "vialetto")!.quantita).toBe(5);
    expect(righe.find((r) => tipoCostruzione(r.id) === "piscina")).toMatchObject({ quantita: 40, gruppo: "12 Sistemazioni esterne", aParte: true, piano: "Esterni" });
    // Nel computo: piscina e vialetto a parte, fuori dal totale; gli allacciamenti restano nei lavori.
    const bozza = computoStudio({ planimetriaId: "p", varianteId: "A", versione: 1 }, "Sopraelevazione", righe);
    expect(bozza.voci.filter((v) => v.opzionale).map((v) => tipoCostruzione(v.id)).sort()).toEqual(["piscina", "vialetto"]);
    expect(bozza.voci.find((v) => tipoCostruzione(v.id) === "allacciamenti")!.opzionale).toBe(false);
    // I capitoli escono nell'ordine del cantiere.
    const capitoli = [...new Set(bozza.voci.map((v) => v.capitolo))];
    expect(capitoli).toEqual([...capitoli].sort());
    expect(capitoli[0]).toBe("01 Opere provvisionali");
  });
});
