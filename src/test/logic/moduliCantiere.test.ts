import { describe, expect, it } from "vitest";
import {
  SCHEMA_COME_OGGI, campiPerContesto, daCompletare, fasiDelRapportino, chiaveDaEtichetta, chiaveValore, componiValori, leggiSchema, leggiValori, mancanti,
  validaModifica, validaSchema, valoreInTesto, valoriDaStampare, valoriInBozza,
  type CampoModulo, type ContestoCampi, type ModuloSchema, type ValoreCampo,
} from "../../../supabase/functions/_shared/moduliCantiere";
import { PRESET_RAPPORTINO, PRESET_VERBALE } from "@/lib/campo/moduliPreset";

const campo = (p: Partial<CampoModulo> = {}): CampoModulo => ({
  chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", obbligatorio: false,
  chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "interno", ...p,
});
const schema = (campi: CampoModulo[]): ModuloSchema => ({ ...SCHEMA_COME_OGGI, campi });
const ctx = (p: Partial<ContestoCampi> = {}): ContestoCampi => ({ ruolo: "operaio", momento: "giornaliero", subappaltatore: false, soloOre: false, ...p });
const valore = (p: Partial<ValoreCampo> = {}): ValoreCampo => ({ chiave: "x", etichetta: "X", tipo: "text", valore: "a", stampa: "interno", ...p });
const FASI = [{ id: "f1", nome: "Posa infissi" }, { id: "f2", nome: "Sigillature" }];

describe("leggiSchema", () => {
  it("senza dati è come oggi: tutto acceso e nessun campo", () => {
    expect(leggiSchema(null)).toEqual(SCHEMA_COME_OGGI);
    expect(Object.values(SCHEMA_COME_OGGI.blocchi).every(Boolean)).toBe(true);
    expect(SCHEMA_COME_OGGI.campi).toEqual([]);
  });
  it("un blocco mancante o non booleano resta acceso, uno spento resta spento", () => {
    const s = leggiSchema({ blocchi: { mezzi: false, foto: "no" } });
    expect(s.blocchi.mezzi).toBe(false);
    expect(s.blocchi.foto).toBe(true);
    expect(s.blocchi.materiali).toBe(true);
  });
  it("scarta i campi con tipo sconosciuto e completa le scelte mancanti", () => {
    const s = leggiSchema({ campi: [{ chiave: "a", etichetta: "A", tipo: "boh" }, { chiave: "b", etichetta: "B", tipo: "text" }] });
    expect(s.campi).toHaveLength(1);
    expect(s.campi[0]).toMatchObject({ chiave: "b", chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "interno", obbligatorio: false });
  });
});

describe("validaSchema", () => {
  it("accetta un modello corretto", () => expect(validaSchema(schema([campo()]))).toEqual([]));
  it("rifiuta più di 30 campi", () => {
    const tanti = Array.from({ length: 31 }, (_, i) => campo({ chiave: `c${i}` }));
    expect(validaSchema(schema(tanti)).length).toBeGreaterThan(0);
  });
  it("rifiuta etichetta vuota o oltre 80 caratteri", () => {
    expect(validaSchema(schema([campo({ etichetta: "  " })])).length).toBeGreaterThan(0);
    expect(validaSchema(schema([campo({ etichetta: "x".repeat(81) })])).length).toBeGreaterThan(0);
  });
  it("rifiuta una scelta senza opzioni", () => {
    expect(validaSchema(schema([campo({ tipo: "select", opzioni: [] })])).length).toBeGreaterThan(0);
    expect(validaSchema(schema([campo({ tipo: "multiselect" })])).length).toBeGreaterThan(0);
  });
  it("rifiuta chiavi doppie", () => {
    expect(validaSchema(schema([campo(), campo({ etichetta: "Altro" })])).length).toBeGreaterThan(0);
  });
  it("rifiuta troppe voci", () => {
    const voci = Array.from({ length: 41 }, (_, i) => `v${i}`);
    expect(validaSchema({ ...SCHEMA_COME_OGGI, voci }).length).toBeGreaterThan(0);
  });
});

describe("validaModifica", () => {
  const prima = schema([campo()]);
  it("rifiuta il cambio di tipo di un campo con dati", () => {
    expect(validaModifica(prima, schema([campo({ tipo: "text" })]), { pezzi: 3 }).length).toBeGreaterThan(0);
  });
  it("permette il cambio di tipo se il campo non ha dati", () => {
    expect(validaModifica(prima, schema([campo({ tipo: "text" })]), { pezzi: 0 })).toEqual([]);
    expect(validaModifica(prima, schema([campo({ tipo: "text" })]), {})).toEqual([]);
  });
  it("un campo con dati si archivia, non sparisce", () => {
    expect(validaModifica(prima, schema([]), { pezzi: 1 }).length).toBeGreaterThan(0);
    expect(validaModifica(prima, schema([campo({ archiviato: true })]), { pezzi: 1 })).toEqual([]);
  });
  it("togliere un'opzione è permesso", () => {
    const a = schema([campo({ tipo: "select", opzioni: ["a", "b"] })]);
    const b = schema([campo({ tipo: "select", opzioni: ["a"] })]);
    expect(validaModifica(a, b, { pezzi: 5 })).toEqual([]);
  });
});

describe("chiaveDaEtichetta", () => {
  it("evita le chiavi già usate", () => {
    expect(chiaveDaEtichetta("Mezzi usati", [])).toBe("mezzi_usati");
    expect(chiaveDaEtichetta("Mezzi usati", ["mezzi_usati"])).toBe("mezzi_usati_2");
  });
  it("funziona con accenti e simboli", () => {
    expect(chiaveDaEtichetta("Qualità è ok?", [])).toBe("qualita_e_ok");
    expect(chiaveDaEtichetta("???", [])).toBe("campo");
  });
});

describe("campiPerContesto", () => {
  it("l'operaio non riceve i campi del capo, l'ufficio sì", () => {
    const s = schema([campo({ chi: "capo" })]);
    expect(campiPerContesto(s, ctx())).toEqual([]);
    expect(campiPerContesto(s, ctx({ ruolo: "capo" }))).toHaveLength(1);
    expect(campiPerContesto(s, ctx({ ruolo: "ufficio" }))).toHaveLength(1);
  });
  it("il giornaliero esclude i campi di fine lavori, e viceversa", () => {
    const s = schema([campo({ chiave: "a", quando: "fine_lavori" }), campo({ chiave: "b", quando: "giornaliero" }), campo({ chiave: "c" })]);
    expect(campiPerContesto(s, ctx()).map(c => c.chiave)).toEqual(["b", "c"]);
    expect(campiPerContesto(s, ctx({ momento: "fine_lavori" })).map(c => c.chiave)).toEqual(["a", "c"]);
  });
  it("un campo archiviato non si compila mai, nemmeno dall'ufficio", () => {
    const s = schema([campo({ archiviato: true })]);
    expect(campiPerContesto(s, ctx({ ruolo: "ufficio" }))).toEqual([]);
  });
  it("chi manda solo le ore non ha campi", () => {
    expect(campiPerContesto(schema([campo()]), ctx({ soloOre: true }))).toEqual([]);
  });
  it("filtra per ditta, salvo per l'ufficio", () => {
    const s = schema([campo({ chiave: "dip", ditte: "dipendenti" }), campo({ chiave: "sub", ditte: "subappaltatori" })]);
    expect(campiPerContesto(s, ctx()).map(c => c.chiave)).toEqual(["dip"]);
    expect(campiPerContesto(s, ctx({ subappaltatore: true })).map(c => c.chiave)).toEqual(["sub"]);
    expect(campiPerContesto(s, ctx({ ruolo: "ufficio" })).map(c => c.chiave)).toEqual(["dip", "sub"]);
  });
});

describe("componiValori", () => {
  it("scarta i vuoti e tiene false e 0", () => {
    const campi = [
      campo({ chiave: "t", tipo: "text" }), campo({ chiave: "s", tipo: "text" }), campo({ chiave: "m", tipo: "multiselect", opzioni: ["a"] }),
      campo({ chiave: "b", tipo: "boolean" }), campo({ chiave: "n", tipo: "number" }),
    ];
    const v = componiValori(campi, { t: "", s: "   ", m: [], b: false, n: 0 });
    expect(v.map(x => x.chiave)).toEqual(["b", "n"]);
  });
  it("copia etichetta, tipo, stampa e unità dal campo", () => {
    const [v] = componiValori([campo({ unita: "pz", stampa: "cliente" })], { pezzi: 12 });
    expect(v).toEqual({ chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 12, stampa: "cliente", unita: "pz" });
  });
  it("converte in numero il testo di un campo numerico", () => {
    expect(componiValori([campo()], { pezzi: "12,5" })[0].valore).toBe(12.5);
    expect(componiValori([campo()], { pezzi: "abc" })).toEqual([]);
  });
  it("conserva il valore di un campo eliminato con la vecchia etichetta", () => {
    const vecchio = valore({ chiave: "tolto", etichetta: "Nome di allora" });
    const v = componiValori([campo()], { pezzi: 1 }, [vecchio]);
    expect(v.find(x => x.chiave === "tolto")).toEqual(vecchio);
  });
  it("un campo riscritto non si duplica con il precedente", () => {
    const v = componiValori([campo()], { pezzi: 2 }, [valore({ chiave: "pezzi", valore: 1, tipo: "number" })]);
    expect(v.filter(x => x.chiave === "pezzi")).toHaveLength(1);
    expect(v[0].valore).toBe(2);
  });
  it("un campo svuotato non torna dal precedente", () => {
    expect(componiValori([campo()], { pezzi: "" }, [valore({ chiave: "pezzi", valore: 1, tipo: "number" })])).toEqual([]);
  });
  it("con livello fase scrive un valore per ogni fase", () => {
    const c = campo({ livello: "fase" });
    const v = componiValori([c], { [chiaveValore("pezzi", "f1")]: 3, [chiaveValore("pezzi", "f2")]: 4 }, [], FASI);
    expect(v).toEqual([
      expect.objectContaining({ chiave: "pezzi", valore: 3, phase_id: "f1", fase_nome: "Posa infissi" }),
      expect.objectContaining({ chiave: "pezzi", valore: 4, phase_id: "f2", fase_nome: "Sigillature" }),
    ]);
  });
  it("senza fasi un campo per fase sta sul rapportino", () => {
    const v = componiValori([campo({ livello: "fase" })], { pezzi: 3 }, [], []);
    expect(v).toHaveLength(1);
    expect(v[0].phase_id).toBeUndefined();
  });
  it("una fase non più scelta non lascia il suo valore", () => {
    const c = campo({ livello: "fase" });
    const precedenti = [valore({ chiave: "pezzi", tipo: "number", valore: 9, phase_id: "f9", fase_nome: "Vecchia" })];
    const v = componiValori([c], { [chiaveValore("pezzi", "f1")]: 3, [chiaveValore("pezzi", "f9")]: 9 }, precedenti, [FASI[0]]);
    expect(v.map(x => x.phase_id)).toEqual(["f1"]);
  });
});

describe("valoriInBozza", () => {
  it("ricostruisce le chiavi anche per fase", () => {
    const b = valoriInBozza([valore({ chiave: "a", valore: "x" }), valore({ chiave: "p", valore: 2, phase_id: "f1" })]);
    expect(b).toEqual({ a: "x", [chiaveValore("p", "f1")]: 2 });
  });
});

describe("mancanti", () => {
  it("elenca gli obbligatori vuoti", () => {
    expect(mancanti([campo({ obbligatorio: true })], {})).toEqual(["Pezzi posati"]);
    expect(mancanti([campo({ obbligatorio: true })], { pezzi: 0 })).toEqual([]);
    expect(mancanti([campo()], {})).toEqual([]);
  });
  it("per un sì/no obbligatorio anche il no vale come risposta", () => {
    const c = campo({ tipo: "boolean", obbligatorio: true });
    expect(mancanti([c], { pezzi: false })).toEqual([]);
    expect(mancanti([c], {})).toEqual(["Pezzi posati"]);
  });
  it("nomina la fase, solo per quelle scelte", () => {
    const c = campo({ livello: "fase", obbligatorio: true });
    expect(mancanti([c], { [chiaveValore("pezzi", "f2")]: 1 }, FASI)).toEqual(["Pezzi posati (Posa infissi)"]);
    expect(mancanti([c], {}, [])).toEqual(["Pezzi posati"]);
  });
});

describe("daCompletare", () => {
  const rep = (p = {}) => ({ descrizione: "Posa", subappaltatore: false, fineLavori: false, valori: [] as ValoreCampo[], ...p });
  it("elenca gli obbligatori di un rapportino arrivato senza valori", () => {
    expect(daCompletare(schema([campo({ obbligatorio: true })]), rep())).toEqual(["Pezzi posati"]);
  });
  it("con il valore non manca nulla", () => {
    expect(daCompletare(schema([campo({ obbligatorio: true })]), rep({ valori: [valore({ chiave: "pezzi", tipo: "number", valore: 2 })] }))).toEqual([]);
  });
  it("le sole ore non chiedono nulla", () => {
    expect(daCompletare(schema([campo({ obbligatorio: true })]), rep({ descrizione: " " }))).toEqual([]);
  });
  it("non chiede all'operaio i campi del capo", () => {
    expect(daCompletare(schema([campo({ obbligatorio: true, chi: "capo" })]), rep())).toEqual([]);
  });
  it("rispetta ditta e momento", () => {
    const s = schema([campo({ obbligatorio: true, ditte: "dipendenti" }), campo({ chiave: "f", etichetta: "Fine", tipo: "text", obbligatorio: true, quando: "fine_lavori" })]);
    expect(daCompletare(s, rep({ subappaltatore: true }))).toEqual([]);
    expect(daCompletare(s, rep({ fineLavori: true }))).toEqual(["Pezzi posati", "Fine"]);
  });
});

describe("valoreInTesto", () => {
  it("scrive ogni tipo per le persone", () => {
    expect(valoreInTesto(valore({ tipo: "boolean", valore: true }))).toBe("Sì");
    expect(valoreInTesto(valore({ tipo: "boolean", valore: false }))).toBe("No");
    expect(valoreInTesto(valore({ tipo: "multiselect", valore: ["a", "b"] }))).toBe("a, b");
    expect(valoreInTesto(valore({ tipo: "date", valore: "2026-11-02" }))).toBe("02/11/2026");
    expect(valoreInTesto(valore({ tipo: "number", valore: 1234.5 }))).toBe("1.234,5");
    expect(valoreInTesto(valore({ tipo: "number", valore: 12, unita: "pz" }))).toBe("12 pz");
  });
});

describe("leggiValori", () => {
  it("non si rompe con dati sporchi", () => {
    expect(leggiValori("x")).toEqual([]);
    expect(leggiValori(null)).toEqual([]);
    expect(leggiValori([{ etichetta: "senza chiave", valore: 1 }, 3])).toEqual([]);
  });
  it("completa la stampa mancante con interno", () => {
    expect(leggiValori([{ chiave: "a", etichetta: "A", tipo: "text", valore: "x" }])[0].stampa).toBe("interno");
  });
});

describe("valoriDaStampare", () => {
  const v = [valore({ chiave: "m", stampa: "mai" }), valore({ chiave: "i", stampa: "interno" }), valore({ chiave: "c", stampa: "cliente" })];
  it("il documento per il cliente stampa solo i valori per il cliente", () => {
    expect(valoriDaStampare(v, "cliente").map(x => x.chiave)).toEqual(["c"]);
  });
  it("il documento interno stampa interni e cliente, mai i «mai»", () => {
    expect(valoriDaStampare(v, "interno").map(x => x.chiave)).toEqual(["i", "c"]);
  });
});

describe("modelli pronti", () => {
  it("ogni modello è valido", () => {
    for (const p of [...PRESET_RAPPORTINO, ...PRESET_VERBALE]) expect(validaSchema(p.schema), p.nome).toEqual([]);
  });
  it("il verbale generico ha le 4 voci di oggi e i verbali si compilano dal cantiere", () => {
    const generico = PRESET_VERBALE.find(p => p.id === "generico")!;
    expect(generico.schema.voci).toEqual(["Lavorazioni previste e finiture", "Funzionamento delle parti installate", "Pulizia e ripristino degli ambienti", "Documenti e istruzioni consegnati"]);
    expect(PRESET_VERBALE.every(p => p.schema.dal_cantiere === true)).toBe(true);
  });
  it("offre rapportino Edile, Serramenti, Impianti e verbale Generico, Serramenti, Fotovoltaico, Impianti", () => {
    expect(PRESET_RAPPORTINO.map(p => p.nome)).toEqual(["Edile", "Serramenti", "Impianti"]);
    expect(PRESET_VERBALE.map(p => p.nome)).toEqual(["Generico", "Serramenti", "Fotovoltaico", "Impianti"]);
  });
});

describe("correzioni dalla revisione", () => {
  it("un campo tornato sul rapportino non perde i valori scritti per fase", () => {
    const vecchio = valore({ chiave: "pezzi", tipo: "number", valore: 9, phase_id: "f1", fase_nome: "Posa" });
    expect(componiValori([campo()], {}, [vecchio])).toEqual([vecchio]);
  });
  it("le fasi di un rapportino sono quelle dichiarate più quelle dei valori, con il nome salvato", () => {
    const v = [valore({ chiave: "p", phase_id: "f2", fase_nome: "Sigillature" })];
    expect(fasiDelRapportino([{ phase_id: "f1", nome: "Posa" }, { phase_id: "f2" }], v)).toEqual([{ id: "f1", nome: "Posa" }, { id: "f2", nome: "Sigillature" }]);
    expect(fasiDelRapportino(null, v)).toEqual([{ id: "f2", nome: "Sigillature" }]);
    expect(fasiDelRapportino("x", [])).toEqual([]);
  });
  it("un obbligatorio per fase già compilato non risulta da completare", () => {
    const s = schema([campo({ livello: "fase", obbligatorio: true })]);
    const valori = [valore({ chiave: "pezzi", tipo: "number", valore: 2, phase_id: "f1" })];
    expect(daCompletare(s, { descrizione: "x", subappaltatore: false, fineLavori: false, valori, fasi: [{ id: "f1", nome: "Posa" }] })).toEqual([]);
  });
  it("un modello non può avere più voci o voci più lunghe di quelle che il verbale accetta", () => {
    const voci = Array.from({ length: 31 }, (_, i) => `v${i}`);
    expect(validaSchema({ ...SCHEMA_COME_OGGI, voci }).length).toBeGreaterThan(0);
    expect(validaSchema({ ...SCHEMA_COME_OGGI, voci: ["x".repeat(201)] }).length).toBeGreaterThan(0);
  });
});
