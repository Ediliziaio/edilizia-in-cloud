import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import {
  QUANTITA_LOCALI, avvisoUnita, confrontaRighe, localiDelloStato, quantitaPianta, righeCambiate, righeDaPianta,
  statiDellaPianta, unitaComputo, valoreChiavi, voceDopo, type MisuraConPianta,
} from "@/lib/planimetrie/computo";

// Dalla pianta alle righe di misura del computo di commessa, e il confronto quando la
// pianta cambia. Gli esempi sono quelli comuni a tutte le fasi (shared/planimetrie/esempi).

const leggi = (nome: string): Planimetria =>
  JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));
const scelta = (id: string) => QUANTITA_LOCALI.find(q => q.id === id)!;

const trilocale = leggi("trilocale.json");
const mappaTri = calcolaQuantita(trilocale);
const [fatto, propostaA] = statiDellaPianta(trilocale);

describe("stati e locali della pianta", () => {
  it("lo stato di fatto e la proposta, con parole semplici", () => {
    expect(fatto).toEqual({ chiave: "fatto", nome: "Com'è adesso (stato di fatto)", proposta: null });
    expect(propostaA.chiave).toBe("progetto:A");
    expect(propostaA.nome).toMatch(/^Dopo i lavori — Proposta A/);
  });

  it("i locali dipendono dallo stato: nella proposta A cucina e soggiorno diventano uno", () => {
    expect(localiDelloStato(trilocale, "fatto").map(l => l.nome)).toContain("Cucina");
    const dopo = localiDelloStato(trilocale, "progetto:A").map(l => l.nome);
    expect(dopo).toContain("Soggiorno con cucina");
    expect(dopo).not.toContain("Cucina");
    expect(localiDelloStato(trilocale, "progetto:Z")).toEqual([]);
  });
});

describe("dalla pianta alle righe di misura", () => {
  it("una riga per locale, col nome del locale e la quantità arrotondata come in PriMus", () => {
    const locali = localiDelloStato(trilocale, "fatto").filter(l => ["Bagno", "Cucina"].includes(l.nome));
    const { righe, saltati } = righeDaPianta({ mappa: mappaTri, stato: fatto, scelta: scelta("pavimento_mq"), locali });
    expect(saltati).toEqual([]);
    expect(righe).toHaveLength(2);
    for (const r of righe) {
      const q = mappaTri[r.chiavi[0]];
      expect(r.chiavi[0]).toMatch(/^fatto:locale:(bagno|cucina)\.pavimento_mq$/);
      expect(r.quantita).toBe(Math.round(q.valore * 100) / 100);
      expect(r.origine).toBe("rilevata");
    }
    expect(righe.map(r => r.descrizione).sort()).toEqual(["Bagno — pavimento", "Cucina — pavimento"]);
  });

  it("nelle voci che si detraggono le righe sono negative", () => {
    const locali = localiDelloStato(trilocale, "fatto").filter(l => l.nome === "Bagno");
    const { righe } = righeDaPianta({ mappa: mappaTri, stato: fatto, scelta: scelta("pavimento_mq"), locali, negativa: true });
    expect(righe[0].quantita).toBeLessThan(0);
  });

  it("i locali senza quella quantità (rivestimento in camera) si saltano e si dicono", () => {
    const locali = localiDelloStato(trilocale, "fatto");
    const { righe, saltati } = righeDaPianta({ mappa: mappaTri, stato: fatto, scelta: scelta("rivestimento_mq"), locali });
    expect(righe.length).toBeGreaterThan(0);
    expect(saltati).toContain("Camera matrimoniale");
    expect(righe.length + saltati.length).toBe(locali.length);
  });

  it("le righe della proposta portano il nome della proposta", () => {
    const locali = localiDelloStato(trilocale, "progetto:A").filter(l => l.nome === "Ripostiglio");
    const { righe } = righeDaPianta({ mappa: mappaTri, stato: propostaA, scelta: scelta("pavimento_mq"), locali });
    expect(righe[0].chiavi).toEqual(["progetto:A:locale:ripostiglio.pavimento_mq"]);
    expect(righe[0].descrizione).toBe(`Ripostiglio — pavimento (${propostaA.proposta})`);
  });

  it("demolizioni e pareti nuove: una riga sola per la pianta intera, solo nelle proposte", () => {
    expect(quantitaPianta(mappaTri, "fatto").some(s => s.id.startsWith("demolizioni"))).toBe(false);
    const intere = quantitaPianta(mappaTri, "progetto:A");
    const demolire = intere.find(s => s.id === "demolizioni.muri_mq")!;
    expect(demolire).toMatchObject({ unita: "mq", per: "pianta", etichetta: "Pareti da demolire (superficie)" });
    expect(intere[0].id.startsWith("demolizioni")).toBe(true);
    // Porte e finestre per tipo, non per misura (quelle sono troppe per una scelta).
    expect(intere.some(s => /^aperture:[a-z_]+:[a-z]+\.numero$/.test(s.id))).toBe(true);
    expect(intere.some(s => /x\d/.test(s.id))).toBe(false);
    const { righe } = righeDaPianta({ mappa: mappaTri, stato: propostaA, scelta: demolire, locali: [] });
    expect(righe).toHaveLength(1);
    expect(righe[0].chiavi).toEqual(["progetto:A:demolizioni.muri_mq"]);
    expect(righe[0].quantita).toBe(Math.round(mappaTri["progetto:A:demolizioni.muri_mq"].valore * 100) / 100);
  });
});

describe("misure stimate", () => {
  it("una quantità che usa una misura stimata è stimata, e la somma prende la peggiore", () => {
    const p = leggi("trilocale.json");
    const bagno = p.livelli[0].fatto.locali.find(l => l.id === "bagno")!;
    bagno.origine = "stimata";
    const mappa = calcolaQuantita(p);
    const { righe } = righeDaPianta({ mappa, stato: fatto, scelta: scelta("pavimento_mq"), locali: localiDelloStato(p, "fatto") });
    expect(righe.find(r => r.chiavi[0].includes(":bagno."))!.origine).toBe("stimata");
    expect(righe.find(r => r.chiavi[0].includes(":cucina."))!.origine).toBe("rilevata");
    expect(valoreChiavi(mappa, ["fatto:locale:cucina.pavimento_mq", "fatto:locale:bagno.pavimento_mq"]).origine).toBe("stimata");
  });
});

describe("la pianta è cambiata: confronto vecchia → nuova", () => {
  // Versione 2: il bagno si allarga di 50 cm verso destra (solo il contorno del locale:
  // per il confronto contano le quantità, non serve ridisegnare le pareti).
  const v2 = leggi("trilocale.json");
  const bagno = v2.livelli[0].fatto.locali.find(l => l.id === "bagno")!;
  const maxX = Math.max(...bagno.contorno.map(p => p.x));
  bagno.contorno = bagno.contorno.map(p => (p.x === maxX ? { ...p, x: p.x + 50 } : p));
  // e la cameretta sparisce (l'utente l'ha cancellata).
  v2.livelli[0].fatto.locali = v2.livelli[0].fatto.locali.filter(l => l.id !== "cameretta");
  const mappaV2 = calcolaQuantita(v2);

  const misura = (id: string, chiave: string, voceId = "v1"): MisuraConPianta => ({
    id, voceId, descrizione: id, planimetriaId: "p", versione: 1, chiavi: [chiave],
    quantita: Math.round(mappaTri[chiave].valore * 100) / 100,
  });
  const salvate = [
    misura("m-bagno", "fatto:locale:bagno.pavimento_mq"),
    misura("m-cucina", "fatto:locale:cucina.pavimento_mq"),
    misura("m-cameretta", "fatto:locale:cameretta.pavimento_mq"),
  ];
  const confronto = confrontaRighe(salvate, mappaV2, () => false);

  it("la riga del bagno cresce, la cucina resta uguale", () => {
    const b = confronto.find(c => c.misura.id === "m-bagno")!;
    expect(b.nuova).toBeGreaterThan(b.vecchia);
    expect(b.differenza).toBe(Math.round((b.nuova - b.vecchia) * 100) / 100);
    const c = confronto.find(x => x.misura.id === "m-cucina")!;
    expect(c.differenza).toBe(0);
  });

  it("un locale che non c'è più porta la riga a zero e lo dice", () => {
    const k = confronto.find(c => c.misura.id === "m-cameretta")!;
    expect(k.nuova).toBe(0);
    expect(k.mancanti).toEqual(["fatto:locale:cameretta.pavimento_mq"]);
  });

  it("si mostrano e si aggiornano solo le righe che cambiano", () => {
    expect(righeCambiate(confronto).map(c => c.misura.id).sort()).toEqual(["m-bagno", "m-cameretta"]);
  });

  it("nelle voci che si detraggono il confronto resta negativo", () => {
    const neg = { ...salvate[0], quantita: -salvate[0].quantita! };
    const [r] = confrontaRighe([neg], mappaV2, () => true);
    expect(r.nuova).toBeLessThan(r.vecchia);
    expect(r.vecchia).toBeLessThan(0);
  });

  it("stessa pianta, stessa quantità: nessuna differenza", () => {
    expect(righeCambiate(confrontaRighe(salvate, mappaTri, () => false))).toEqual([]);
  });
});

describe("la voce dopo le righe", () => {
  it("cambia della differenza delle righe, e l'importo si ricalcola", () => {
    expect(voceDopo({ quantita: 10, prezzo_unitario_computo: 25.5, unita_misura: "mq" }, 4.25)).toEqual({ quantita: 14.25, importo: 363.38 });
  });
  it("una voce senza quantità parte da zero; senza prezzo l'importo resta vuoto", () => {
    expect(voceDopo({ quantita: null, prezzo_unitario_computo: null, unita_misura: "mq" }, 3.1)).toEqual({ quantita: 3.1, importo: null });
  });
  it("con l'unità % il prezzo è una percentuale", () => {
    expect(voceDopo({ quantita: 1000, prezzo_unitario_computo: 10, unita_misura: "%" }, 0).importo).toBe(100);
  });
});

describe("unità della voce", () => {
  it("riconosce le scritture comuni", () => {
    expect(unitaComputo("m²")).toBe("mq");
    expect(unitaComputo("M2")).toBe("mq");
    expect(unitaComputo("m")).toBe("ml");
    expect(unitaComputo("m³")).toBe("mc");
    expect(unitaComputo("cad.")).toBe("n");
    expect(unitaComputo("a corpo")).toBeNull();
  });
  it("avvisa solo quando l'unità è diversa e riconosciuta", () => {
    expect(avvisoUnita("mq", scelta("pavimento_mq"))).toBeNull();
    expect(avvisoUnita("kg", scelta("pavimento_mq"))).toBeNull();
    expect(avvisoUnita("mq", scelta("battiscopa_ml"))).toMatch(/La voce è in mq, la quantità scelta è in m/);
  });
});

describe("migrazione: la perizia di variante copia il legame con la pianta", () => {
  const cartella = join(process.cwd(), "supabase/migrations");
  const FILE = "20281030264000_computo_variante_copia_pianta.sql";
  const nuova = readFileSync(join(cartella, FILE), "utf8");
  const vecchia = readFileSync(join(cartella, "20281023053000_computo_contrattuale_bloccato_e_varianti.sql"), "utf8");
  const funzione = (sql: string) => sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.computo_crea_variante"), sql.indexOf("REVOKE ALL ON FUNCTION public.computo_crea_variante"));

  it("la versione è sua e solo sua, e non aspetta i lock", async () => {
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(cartella).filter(f => f.startsWith("20281030264000_"))).toEqual([FILE]);
    expect(nuova).toMatch(/SET LOCAL lock_timeout = '3s';/);
    expect(nuova).toMatch(/REVOKE ALL ON FUNCTION public\.computo_crea_variante\(uuid, text, text\) FROM PUBLIC, anon;/);
  });

  it("cambia solo la copia delle righe di misura: le tre colonne della pianta", () => {
    const togli = (s: string) => s.replace(/,\s*(mi\.)?planimetria_(id|versione|chiavi)/g, "");
    expect(togli(funzione(nuova))).toBe(funzione(vecchia));
    expect(funzione(nuova)).toMatch(/mi\.planimetria_id, mi\.planimetria_versione, mi\.planimetria_chiavi/);
  });
});
