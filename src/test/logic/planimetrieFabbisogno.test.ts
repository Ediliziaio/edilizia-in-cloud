/**
 * Fabbisogno materiali dalla pianta (23/11/2026): litri di pittura, scatole,
 * sacchi e pezzi a partire dai m² delle stanze del trilocale d'esempio.
 */
import { describe, expect, it } from "vitest";
import trilocale from "../../../shared/planimetrie/esempi/trilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello";
import { fabbisognoMateriali, mqScatolaDa, tipoPavimento } from "../../../shared/planimetrie/fabbisogno";
import { frazionaContorno } from "@/lib/planimetrie/frazionamento";

const base = () => structuredClone(trilocale) as unknown as Planimetria;
const riga = (righe: ReturnType<typeof fabbisognoMateriali>, id: string) => righe.find((r) => r.id === id);

describe("fabbisogno materiali dalla pianta", () => {
  const righe = fabbisognoMateriali(base(), "fatto");

  it("pittura: m² da pitturare × 2 mani ÷ 10 m²/l, in secchi da 14 l", () => {
    const p = riga(righe, "pittura")!;
    const mq = Number(p.come.split(" m²")[0].replace(/\./g, "").replace(",", "."));
    expect(p.quantita).toBeCloseTo(mq * 2 / 10, 0);
    expect(p.confezioni).toEqual({ numero: Math.ceil(p.quantita / 14), nome: `${Math.ceil(p.quantita / 14)} secchi da 14 l` });
    expect(p.stanze.reduce((t, s) => t + s.valore, 0)).toBeCloseTo(p.quantita, 0);
  });

  it("il bagno e la cucina vanno a piastrelle, le camere a parquet (dedotto se la finitura manca)", () => {
    expect(riga(righe, "pavimento_piastrelle")!.stanze.map((s) => s.nome).sort()).toEqual(["Bagno", "Cucina"]);
    expect(riga(righe, "pavimento_legno")!.stanze.map((s) => s.nome)).toContain("Camera matrimoniale");
    expect(riga(righe, "pavimento_legno")!.come).toMatch(/dedotto/);
  });

  it("colla e stucco coprono pavimenti e rivestimenti piastrellati; il battiscopa salta le stanze rivestite", () => {
    expect(riga(righe, "colla_piastrelle")!.stanze.map((s) => s.nome)).toEqual(expect.arrayContaining(["Bagno", "Bagno (rivestimento)", "Cucina (rivestimento)"]));
    expect(riga(righe, "stucco")!.confezioni!.nome).toMatch(/sacch[io] da 5 kg/);
    expect(riga(righe, "battiscopa")!.stanze.map((s) => s.nome)).not.toContain("Bagno");
    expect(riga(righe, "battiscopa")!.confezioni!.nome).toMatch(/pezzi da 2,4 m/);
  });

  it("le righe seguono l'ordine del cantiere: murature, radiante, pavimenti, tinteggiatura, finiture", async () => {
    const { FASI_FABBISOGNO } = await import("../../../shared/planimetrie/fabbisogno");
    const ordine = FASI_FABBISOGNO.map((f) => f.id);
    const fasi = righe.map((r) => ordine.indexOf(r.fase));
    expect(fasi).toEqual([...fasi].sort((a, b) => a - b));
    expect(riga(righe, "battiscopa")!.fase).toBe("finiture");
    expect(riga(righe, "pittura")!.fase).toBe("tinteggiatura");
  });

  it("le ipotesi si possono cambiare: 3 mani invece di 2 = 50% di pittura in più", () => {
    const tre = riga(fabbisognoMateriali(base(), "fatto", { maniPittura: 3 }), "pittura")!;
    expect(tre.quantita / riga(righe, "pittura")!.quantita).toBeCloseTo(1.5, 1);
  });

  it("frazionando il soggiorno con un tramezzo servono più pittura e più battiscopa", () => {
    const p = base();
    const fatto = p.livelli[0].fatto;
    const soggiorno = fatto.locali.find((l) => l.nome === "Soggiorno")!;
    // in verticale il taglio cadrebbe sulla porta: il frazionamento lo rifiuta, in orizzontale passa
    expect(frazionaContorno(fatto, soggiorno, "x", [50])).toMatchObject({ ok: false, motivo: expect.stringMatching(/porta/) });
    const taglio = frazionaContorno(fatto, soggiorno, "y", [50]);
    expect(taglio.ok).toBe(true);
    if (!taglio.ok) return;
    const proposta = { ...structuredClone(fatto), id: "fraz", nome: "Frazionamento",
      locali: [...fatto.locali.filter((l) => l.id !== soggiorno.id),
        { ...soggiorno, id: "s1", nome: "Soggiorno A", contorno: taglio.parti[0] },
        { ...soggiorno, id: "s2", nome: "Soggiorno B", contorno: taglio.parti[1] }] };
    p.livelli[0].proposte = [proposta as never];
    const dopo = fabbisognoMateriali(p, "progetto:fraz");
    expect(riga(dopo, "pittura")!.quantita).toBeGreaterThan(riga(righe, "pittura")!.quantita);
    expect(riga(dopo, "battiscopa")!.quantita).toBeGreaterThan(riga(righe, "battiscopa")!.quantita);
    expect(riga(dopo, "pittura")!.stanze.map((s) => s.nome)).toEqual(expect.arrayContaining(["Soggiorno A", "Soggiorno B"]));
  });

  it("tipo di pavimento e formato della scatola si leggono dalla finitura", () => {
    expect(tipoPavimento("Parquet in rovere a spina di pesce", "soggiorno")).toMatchObject({ tipo: "legno", spina: true, dedotto: false });
    expect(tipoPavimento("Gres porcellanato effetto legno rovere, listoni 20×120 cm", "camera")).toMatchObject({ tipo: "piastrelle" });
    expect(tipoPavimento("Laminato rovere", "camera").tipo).toBe("flottante");
    expect(mqScatolaDa("piastrelle 60×60 cm", 1)).toBe(1.44);
    expect(mqScatolaDa("listoni 20x120", 1)).toBe(1.44);
    expect(mqScatolaDa("piastrelle 30×30 cm", 1)).toBe(1.44);
    expect(mqScatolaDa("senza formato", 1.2)).toBe(1.2);
  });
});

describe("fabbisogno del pavimento radiante", () => {
  it("tubo in rotoli con gli stessi metri del computo, pannelli, striscia e massetto", async () => {
    const { calcolaQuantita } = await import("../../../shared/planimetrie/quantita");
    const p = base();
    const s = p.livelli[0].fatto;
    s.pavimentoRadiante = s.locali.map((l) => ({ localeId: l.id, passoCm: 15, superficieEsclusaMq: 0 }));
    const ingresso = s.locali.find((l) => /ingresso/i.test(l.nome))!;
    const xs = ingresso.contorno.map((q) => q.x), ys = ingresso.contorno.map((q) => q.y);
    s.collettoreRadiante = { posizione: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) + 15 }, quotaCm: 55, limiteCircuitoM: 90 };
    const righe = fabbisognoMateriali(p, "fatto");
    const tubo = riga(righe, "radiante_tubo")!;
    const computo = Object.values(calcolaQuantita(p)).filter((v) => v.ambito === "fatto" && v.chiave.endsWith(".radiante_tubo_ml")).reduce((t, v) => t + v.valore, 0);
    expect(tubo.quantita).toBeCloseTo(computo, 0);
    expect(tubo.confezioni!.nome).toMatch(/rotol[io] da 200 m/);
    expect(riga(righe, "radiante_pannelli")!.confezioni!.nome).toMatch(/pannelli da 1,12 m²/);
    expect(riga(righe, "radiante_massetto")!.unita).toBe("m³");
    expect(riga(righe, "radiante_striscia")).toBeDefined();
    // senza radiante le righe non ci sono
    expect(riga(fabbisognoMateriali(base(), "fatto"), "radiante_tubo")).toBeUndefined();
  });
});

describe("frazionare una stanza con il pavimento radiante", () => {
  it("la zona passa a tutte le parti, la variante resta valida e i materiali seguono", async () => {
    const { inserisciFrazionamento } = await import("@/lib/planimetrie/frazionamento");
    const { validaPlanimetria } = await import("../../../shared/planimetrie/modello");
    const p = base();
    const fatto = p.livelli[0].fatto;
    const soggiorno = fatto.locali.find((l) => l.nome === "Soggiorno")!;
    fatto.pavimentoRadiante = [{ localeId: soggiorno.id, passoCm: 15, superficieEsclusaMq: 2 }];
    const taglio = frazionaContorno(fatto, soggiorno, "y", [50]);
    if (!taglio.ok) throw new Error("motivo" in taglio ? taglio.motivo : "taglio non valido");
    const proposta = inserisciFrazionamento({ ...structuredClone(fatto), id: "fraz", nome: "Fraz" } as never, soggiorno, taglio, ["A", "B"]);
    expect(proposta.pavimentoRadiante!.map((z) => z.localeId)).toEqual(proposta.frazionamenti!.at(-1)!.parti);
    expect(proposta.pavimentoRadiante!.reduce((t, z) => t + z.superficieEsclusaMq, 0)).toBeCloseTo(2, 1);
    p.livelli[0].proposte = [proposta as never];
    const v = validaPlanimetria(JSON.parse(JSON.stringify(p)));
    expect("errori" in v ? v.errori : []).toEqual([]);
    const dopo = fabbisognoMateriali(p, "progetto:fraz");
    expect(riga(dopo, "radiante_pannelli")!.stanze).toHaveLength(2);
    // il tramezzo nuovo porta forati, malta e intonaco, nella fase «Murature», prima di tutto
    const forati = riga(dopo, "tramezzo_laterizio")!;
    expect(forati.fase).toBe("murature");
    expect(forati.confezioni!.nome).toMatch(/forati 8×25×25/);
    expect(riga(dopo, "tramezzo_intonaco")!.come).toMatch(/2 facce/);
    expect(dopo[0].fase).toBe("murature");
    // nello stato di fatto non ci sono tramezzi nuovi
    expect(riga(fabbisognoMateriali(p, "fatto"), "tramezzo_laterizio")).toBeUndefined();
  });
});

describe("scegliere i lavori e le stanze", () => {
  it("solo la tinteggiatura del soggiorno: niente pavimenti, pittura della sola stanza", async () => {
    const { stanzeFabbisogno } = await import("../../../shared/planimetrie/fabbisogno");
    const p = base();
    const soggiorno = stanzeFabbisogno(p, "fatto").find((s) => s.nome === "Soggiorno")!;
    const righe = fabbisognoMateriali(p, "fatto", {}, { fasi: ["tinteggiatura"], stanze: [soggiorno.id] });
    expect(righe.map((r) => r.id).sort()).toEqual(["fissativo", "pittura"]);
    expect(riga(righe, "pittura")!.stanze.map((s) => s.nome)).toEqual(["Soggiorno"]);
    expect(riga(righe, "pittura")!.quantita).toBeLessThan(riga(fabbisognoMateriali(p, "fatto"), "pittura")!.quantita);
  });

  it("in una variante le stanze toccate sono quelle nuove o cambiate", async () => {
    const { stanzeFabbisogno } = await import("../../../shared/planimetrie/fabbisogno");
    const p = base();
    const fatto = p.livelli[0].fatto;
    const soggiorno = fatto.locali.find((l) => l.nome === "Soggiorno")!;
    const taglio = frazionaContorno(fatto, soggiorno, "y", [50]);
    if (!taglio.ok) throw new Error("taglio non valido");
    p.livelli[0].proposte = [{ ...structuredClone(fatto), id: "v", nome: "V",
      locali: [...fatto.locali.filter((l) => l.id !== soggiorno.id),
        { ...soggiorno, id: "s1", nome: "Soggiorno A", contorno: taglio.parti[0] }, { ...soggiorno, id: "s2", nome: "Soggiorno B", contorno: taglio.parti[1] }] } as never];
    expect(stanzeFabbisogno(p, "progetto:v").filter((s) => s.toccata).map((s) => s.nome).sort()).toEqual(["Soggiorno A", "Soggiorno B"]);
    expect(stanzeFabbisogno(p, "fatto").some((s) => s.toccata)).toBe(false);
  });
});
