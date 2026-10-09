import { describe, expect, it } from "vitest";
import { costruisciFasiLavorate, faseDiAppartenenza } from "@/lib/campo/rapportinoFasi";
import { buildRapportinoMaterials } from "@/lib/campo/rapportinoMaterials";

/**
 * Materiali e foto del rapportino legati alla fase su cui si è lavorato.
 * Le liste di sempre (materiali_usati, foto_urls) restano com'erano: qui si prova solo il collegamento in più.
 */
describe("a quale fase appartiene un materiale o una foto", () => {
  it("con UNA fase dichiarata, tutto ciò che non ha una scelta va a quella", () => {
    expect(faseDiAppartenenza(undefined, ["ph-1"])).toBe("ph-1");
    expect(faseDiAppartenenza(null, ["ph-1"])).toBe("ph-1");
    expect(faseDiAppartenenza("", ["ph-1"])).toBe("ph-1");
  });

  it("con più fasi senza scelta resta generale: non si indovina", () => {
    expect(faseDiAppartenenza(undefined, ["ph-1", "ph-2"])).toBeNull();
  });

  it("con più fasi vale la scelta dell'operaio", () => {
    expect(faseDiAppartenenza("ph-2", ["ph-1", "ph-2"])).toBe("ph-2");
  });

  it("una fase scelta e poi tolta dall'elenco scioglie il collegamento", () => {
    expect(faseDiAppartenenza("ph-9", ["ph-1", "ph-2"])).toBeNull();
    // e con una sola rimasta, ciò che era di una fase tolta passa a quella rimasta
    expect(faseDiAppartenenza("ph-9", ["ph-1"])).toBe("ph-1");
  });

  it("senza fasi dichiarate non c'è nessun collegamento", () => {
    expect(faseDiAppartenenza("ph-1", [])).toBeNull();
    expect(faseDiAppartenenza(undefined, [])).toBeNull();
  });
});

describe("le fasi lavorate che finiscono nel rapportino", () => {
  const nomi = { "ph-1": "Demolizioni", "ph-2": "Posa serramenti" };

  it("una fase sola prende tutte le foto, anche senza scelta", () => {
    const fasi = costruisciFasiLavorate({ dichiarate: { "ph-2": 40 }, nomi, fotoUrls: ["a.jpg", "b.jpg"], fotoFase: {} });
    expect(fasi).toEqual([{ phase_id: "ph-2", percentuale: 40, nome: "Posa serramenti", foto: ["a.jpg", "b.jpg"] }]);
  });

  it("più fasi: ogni foto va alla fase scelta, le altre restano fuori dalle schede", () => {
    const fasi = costruisciFasiLavorate({
      dichiarate: { "ph-1": 100, "ph-2": 30 },
      nomi,
      fotoUrls: ["a.jpg", "b.jpg", "c.jpg"],
      fotoFase: { "a.jpg": "ph-2", "b.jpg": "ph-1" },
    });
    expect(fasi).toEqual([
      { phase_id: "ph-1", percentuale: 100, nome: "Demolizioni", foto: ["b.jpg"] },
      { phase_id: "ph-2", percentuale: 30, nome: "Posa serramenti", foto: ["a.jpg"] },
    ]);
  });

  it("una fase senza foto non ha la chiave `foto` (i rapportini di sempre restano identici)", () => {
    const fasi = costruisciFasiLavorate({ dichiarate: { "ph-1": 10, "ph-2": 20 }, nomi, fotoUrls: ["a.jpg"], fotoFase: {} });
    expect(fasi.every(f => !("foto" in f))).toBe(true);
  });

  it("l'ordine è quello in cui l'operaio ha toccato le fasi", () => {
    const fasi = costruisciFasiLavorate({ dichiarate: { "ph-2": 5, "ph-1": 9 }, nomi, fotoUrls: [], fotoFase: {} });
    expect(fasi.map(f => f.phase_id)).toEqual(["ph-2", "ph-1"]);
  });

  it("una foto legata a una fase poi tolta non sparisce: va alle foto generali, non a un'altra fase", () => {
    const fasi = costruisciFasiLavorate({
      dichiarate: { "ph-1": 50, "ph-2": 50 },
      nomi,
      fotoUrls: ["a.jpg"],
      fotoFase: { "a.jpg": "ph-3" },
    });
    expect(fasi.flatMap(f => f.foto ?? [])).toEqual([]);
  });

  it("il nome è quello del momento: anche se la fase non è più nell'elenco resta una stringa", () => {
    const fasi = costruisciFasiLavorate({ dichiarate: { "ph-x": 10 }, nomi, fotoUrls: [], fotoFase: {} });
    expect(fasi[0].nome).toBe("");
  });

  it("le voci già costruite per le sottofasi si tengono così come sono: spunte e avanzamento, più nome e foto", () => {
    const fasi = costruisciFasiLavorate({
      dichiarate: { "ph-1": 30, "ph-2": 40 },
      nomi,
      fotoUrls: ["a.jpg", "b.jpg"],
      fotoFase: { "a.jpg": "ph-2", "b.jpg": "ph-1" },
      // ph-1 ha sottofasi: l'avanzamento (67) lo ha calcolato `fasiLavorateDelRapportino`, non è quello dichiarato (30)
      base: [{ phase_id: "ph-1", percentuale: 67, sottofasi_fatte: ["s2"] }, { phase_id: "ph-2", percentuale: 40 }],
    });
    expect(fasi).toEqual([
      { phase_id: "ph-1", percentuale: 67, sottofasi_fatte: ["s2"], nome: "Demolizioni", foto: ["b.jpg"] },
      { phase_id: "ph-2", percentuale: 40, nome: "Posa serramenti", foto: ["a.jpg"] },
    ]);
  });

  it("con le voci già costruite e una fase sola, le foto senza scelta vanno a quella", () => {
    const fasi = costruisciFasiLavorate({
      dichiarate: { "ph-1": 30 },
      nomi,
      fotoUrls: ["a.jpg"],
      fotoFase: {},
      base: [{ phase_id: "ph-1", percentuale: 67, sottofasi_fatte: ["s2"] }],
    });
    expect(fasi).toEqual([{ phase_id: "ph-1", percentuale: 67, sottofasi_fatte: ["s2"], nome: "Demolizioni", foto: ["a.jpg"] }]);
  });
});

describe("i materiali del rapportino con la fase", () => {
  const sel = {
    "oi-1": { nome: "Schiuma", quantita: 2, unita: "pz", faseId: "ph-2" },
    libero_1: { nome: "Viti", quantita: 100, unita: "pz" },
  };

  it("senza fasi dichiarate il payload è quello di sempre (nessun fase_id)", () => {
    const out = buildRapportinoMaterials(sel);
    expect(out).toEqual([
      { nome: "Schiuma", quantita: 2, unita: "pz", da_furgone: false, order_item_id: "oi-1" },
      { nome: "Viti", quantita: 100, unita: "pz", da_furgone: false },
    ]);
  });

  it("con una fase sola tutti i materiali si collegano a quella", () => {
    const out = buildRapportinoMaterials(sel, ["ph-1"]);
    expect(out.map(m => (m as { fase_id?: string }).fase_id)).toEqual(["ph-1", "ph-1"]);
  });

  it("con più fasi si collega solo ciò che è stato scelto", () => {
    const out = buildRapportinoMaterials(sel, ["ph-1", "ph-2"]);
    expect(out.map(m => (m as { fase_id?: string }).fase_id)).toEqual(["ph-2", undefined]);
    expect("fase_id" in out[1]).toBe(false);
  });

  it("il legame con l'articolo della commessa resta, accanto alla fase", () => {
    const [m] = buildRapportinoMaterials({ "oi-7": { nome: "Controtelaio", quantita: 3, unita: "pz", faseId: "ph-2" } }, ["ph-1", "ph-2"]);
    expect(m).toMatchObject({ order_item_id: "oi-7", fase_id: "ph-2", da_furgone: false });
  });

  it("le regole di sempre valgono ancora: quantità e unità obbligatorie", () => {
    expect(() => buildRapportinoMaterials({ libero_1: { nome: "Viti", quantita: 0, unita: "pz" } }, ["ph-1"])).toThrow(/quantità/);
    expect(() => buildRapportinoMaterials({ libero_1: { nome: "Viti", quantita: 3 } }, ["ph-1"])).toThrow(/unità/);
  });
});
