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
