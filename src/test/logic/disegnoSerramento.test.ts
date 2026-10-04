/**
 * Il disegno generato dei serramenti: forme, simboli di apertura, specchio della
 * vista esterna, sagome (arco, trapezio), monoblocco, vetro, telaio a Z e
 * riconoscimento dei colori dalle etichette del listino.
 */
import { describe, expect, it } from "vitest";
import {
  disegnaSerramento,
  PROFILI_STANDARD,
  TIPOLOGIE_DISEGNO,
  type Forma,
  type SerramentoDisegno,
} from "@/lib/serramenti/disegnoSerramento";
import { finituraDaEtichetta, scurisci } from "@/lib/serramenti/finituraSerramento";
import { codiceRalDaEtichetta, RAL_COLORI } from "@/lib/serramenti/ralColori";
import { telaioDaEtichetta } from "@/lib/serramenti/telaioSerramento";
import { vetroDaEtichette } from "@/lib/serramenti/vetroSerramento";

type Rett = Extract<Forma, { kind: "rect" }>;
type Sag = Extract<Forma, { kind: "sagoma" }>;
type Poli = Extract<Forma, { kind: "poly" }>;

const rettangoli = (forme: Forma[], ruolo: string) => forme.filter((f) => f.kind === "rect" && f.ruolo === ruolo) as Rett[];
const sagome = (forme: Forma[], ruolo: string) => forme.filter((f) => f.kind === "sagoma" && f.ruolo === ruolo) as Sag[];
const simboli = (forme: Forma[]) => forme.filter((f) => f.kind === "poly" && f.ruolo === "simbolo") as Poli[];

const duePorte: SerramentoDisegno = {
  larghezzaMm: 1200,
  altezzaMm: 1400,
  ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }],
};

describe("disegnaSerramento", () => {
  it("tiene le proporzioni delle misure e un vetro per ogni anta", () => {
    const scena = disegnaSerramento(duePorte);
    expect(scena.larghezza).toBe(1200);
    expect(scena.altezza).toBe(1400);
    expect(rettangoli(scena.forme, "vetro")).toHaveLength(2);
    for (const v of rettangoli(scena.forme, "vetro")) {
      expect(v.x).toBeGreaterThan(0);
      expect(v.x + v.w).toBeLessThan(1200);
    }
  });

  it("il battente ha un triangolo con la punta sul lato maniglia", () => {
    // cerniere a destra (vista interna): la punta sta a sinistra
    const scena = disegnaSerramento({ larghezzaMm: 800, altezzaMm: 1400, ante: [{ tipo: "battente", lato: "dx" }] });
    const [triangolo] = simboli(scena.forme);
    const [base1, punta, base2] = triangolo.punti;
    expect(punta[0]).toBeLessThan(base1[0]);
    expect(base1[0]).toBe(base2[0]);
    expect(punta[1]).toBeCloseTo((base1[1] + base2[1]) / 2);
  });

  it("l'anta-ribalta ha due simboli, il vasistas uno, il fisso nessuno", () => {
    const di = (tipo: "anta_ribalta" | "vasistas" | "fisso") =>
      simboli(disegnaSerramento({ larghezzaMm: 800, altezzaMm: 1400, ante: [{ tipo, lato: "sx" }] }).forme).length;
    expect(di("anta_ribalta")).toBe(2);
    expect(di("vasistas")).toBe(1);
    expect(di("fisso")).toBe(0);
  });

  it("regola standard: una sola maniglia con due ante a battente che si incontrano; ognuna se sono sole", () => {
    const maniglie = (ante: SerramentoDisegno["ante"]) => rettangoli(disegnaSerramento({ larghezzaMm: 1200, altezzaMm: 1400, ante }).forme, "maniglia");
    // due battenti: una maniglia sola, sull'anta principale (di destra di serie)
    const due = maniglie([{ tipo: "battente", lato: "sx" }, { tipo: "battente", lato: "dx" }]);
    expect(due).toHaveLength(1);
    expect(due[0].x).toBeGreaterThan(600 - 100); // al centro, sull'anta di destra
    // principale a sinistra: la maniglia sta sulla sinistra del centro
    const sinistra = maniglie([{ tipo: "battente", lato: "sx", principale: true }, { tipo: "battente", lato: "dx" }]);
    expect(sinistra).toHaveLength(1);
    expect(sinistra[0].x).toBeLessThan(600);
    // battente + anta-ribalta: la maniglia è sull'anta-ribalta
    expect(maniglie([{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }])).toHaveLength(1);
    // due ante-ribalta: una maniglia per anta
    expect(maniglie([{ tipo: "anta_ribalta", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }])).toHaveLength(2);
    // ante separate da un fisso, o singole: ognuna la sua
    expect(maniglie([{ tipo: "battente", lato: "sx" }, { tipo: "fisso" }, { tipo: "battente", lato: "dx" }])).toHaveLength(2);
    expect(maniglie([{ tipo: "battente", lato: "dx" }])).toHaveLength(1);
    expect(maniglie([{ tipo: "fisso" }])).toHaveLength(0);
  });

  it("una maniglia indicata a mano vince sulla regola", () => {
    const maniglie = (ante: SerramentoDisegno["ante"]) => rettangoli(disegnaSerramento({ larghezzaMm: 1200, altezzaMm: 1400, ante }).forme, "maniglia");
    expect(maniglie([{ tipo: "battente", lato: "sx", maniglia: true }, { tipo: "battente", lato: "dx" }])).toHaveLength(2);
    // tolta a mano dall'anta principale: nessuna maniglia, la decisione è dell'utente
    expect(maniglie([{ tipo: "battente", lato: "sx" }, { tipo: "battente", lato: "dx", maniglia: false }])).toHaveLength(0);
    expect(maniglie([{ tipo: "battente", lato: "sx", maniglia: false }, { tipo: "battente", lato: "dx", maniglia: false }])).toHaveLength(0);
  });

  it("i profili hanno lo stesso spessore standard su ogni modello e misura normale", () => {
    const telaio = (t: (typeof TIPOLOGIE_DISEGNO)[number]) => {
      const barra = disegnaSerramento({ larghezzaMm: t.larghezzaMm, altezzaMm: t.altezzaMm, ante: t.ante }).forme.find(
        (f) => f.kind === "poly" && f.ruolo === "telaio" && f.barra === "v",
      );
      if (!barra || barra.kind !== "poly") throw new Error("manca il telaio");
      return barra.punti[1][0] - barra.punti[0][0];
    };
    const spessori = TIPOLOGIE_DISEGNO.filter((t) => Math.min(t.larghezzaMm, t.altezzaMm) >= 800 && !t.forma && !t.monoblocco).map(telaio);
    expect(spessori.length).toBeGreaterThan(5);
    for (const sp of spessori) expect(sp).toBeCloseTo(PROFILI_STANDARD.telaioMm);
  });

  it("la maniglia sta a metà altezza dell'anta, anche sulle porte finestre", () => {
    const m = (altezzaMm: number) =>
      rettangoli(disegnaSerramento({ larghezzaMm: 900, altezzaMm, ante: [{ tipo: "battente", lato: "dx" }], soglia: altezzaMm > 2000 }).forme, "maniglia")[0];
    for (const altezza of [1400, 2200]) {
      const man = m(altezza);
      expect(man.y + man.h / 2).toBeCloseTo(altezza / 2, 0);
    }
  });

  it("la maniglia sta dal lato opposto alle cerniere", () => {
    const maniglia = (lato: "dx" | "sx") =>
      rettangoli(disegnaSerramento({ larghezzaMm: 800, altezzaMm: 1400, ante: [{ tipo: "battente", lato }] }).forme, "maniglia")[0];
    expect(maniglia("dx").x).toBeLessThan(400); // cerniere a destra: maniglia a sinistra
    expect(maniglia("sx").x).toBeGreaterThan(400);
  });

  it("dall'esterno specchia, toglie le maniglie e tratteggia i simboli", () => {
    const interna = disegnaSerramento({ ...duePorte, vista: "interna" });
    const esterna = disegnaSerramento({ ...duePorte, vista: "esterna" });
    expect(rettangoli(esterna.forme, "maniglia")).toHaveLength(0);
    expect(simboli(esterna.forme).every((s) => s.tratteggio)).toBe(true);
    expect(simboli(interna.forme).every((s) => !s.tratteggio)).toBe(true);
    const i = rettangoli(interna.forme, "vetro")[0];
    const e = rettangoli(esterna.forme, "vetro")[0];
    expect(e.x).toBeCloseTo(1200 - i.x - i.w);
  });

  it("il sopraluce sta sopra le ante e la soglia in fondo", () => {
    const scena = disegnaSerramento({
      larghezzaMm: 1000, altezzaMm: 2400, ante: [{ tipo: "battente", lato: "dx" }], sopraluce: { altezzaMm: 500, apribile: true }, soglia: true,
    });
    const vetri = rettangoli(scena.forme, "vetro");
    expect(vetri).toHaveLength(2);
    expect(Math.min(...vetri.map((v) => v.y))).toBeLessThan(200);
    expect(rettangoli(scena.forme, "soglia")).toHaveLength(1);
    expect(simboli(scena.forme)).toHaveLength(2); // battente + vasistas del sopraluce
  });

  it("gli scorrevoli hanno una freccia nel verso in cui scorrono", () => {
    const freccia = (lato: "dx" | "sx") => simboli(disegnaSerramento({ larghezzaMm: 1600, altezzaMm: 2200, ante: [{ tipo: "scorrevole", lato }] }).forme)[0];
    const dx = freccia("dx");
    const sx = freccia("sx");
    expect(dx.punti[1][0]).toBeGreaterThan(dx.punti[0][0]);
    expect(sx.punti[1][0]).toBeLessThan(sx.punti[0][0]);
  });

  it("ogni tipologia di partenza produce un disegno dentro il suo riquadro", () => {
    for (const t of TIPOLOGIE_DISEGNO) {
      const scena = disegnaSerramento({
        larghezzaMm: t.larghezzaMm, altezzaMm: t.altezzaMm, ante: t.ante, soglia: t.soglia,
        forma: t.forma, frecciaMm: t.frecciaMm, altezzaMinoreMm: t.altezzaMinoreMm, latoMinore: t.latoMinore, monoblocco: t.monoblocco,
      });
      for (const f of scena.forme) {
        const punti = f.kind === "rect" ? [[f.x, f.y], [f.x + f.w, f.y + f.h]] : f.punti;
        for (const [x, y] of punti) {
          expect(x, t.nome).toBeGreaterThanOrEqual(-0.001);
          expect(x, t.nome).toBeLessThanOrEqual(t.larghezzaMm + 0.001);
          expect(y, t.nome).toBeGreaterThanOrEqual(-0.001);
          expect(y, t.nome).toBeLessThanOrEqual(t.altezzaMm + 0.001);
        }
      }
    }
  });
});

describe("sagome ad arco e trapezio", () => {
  const arco: SerramentoDisegno = { larghezzaMm: 900, altezzaMm: 1600, ante: [{ tipo: "anta_ribalta", lato: "dx" }], forma: "arco" };
  const trapezio: SerramentoDisegno = {
    larghezzaMm: 1200, altezzaMm: 1400, ante: [{ tipo: "fisso" }], forma: "trapezio", altezzaMinoreMm: 800, latoMinore: "dx",
  };

  it("l'arco ha telaio ad anello, vetro sagomato e la cima del vetro sotto il telaio", () => {
    const scena = disegnaSerramento(arco);
    const [telaio] = sagome(scena.forme, "telaio");
    const [vetro] = sagome(scena.forme, "vetro");
    expect(telaio.buco).toBeDefined();
    expect(Math.min(...telaio.punti.map((p) => p[1]))).toBeCloseTo(0, 5);
    expect(Math.min(...vetro.punti.map((p) => p[1]))).toBeGreaterThan(60);
    for (const f of scena.forme) {
      const punti = f.kind === "sagoma" ? f.punti : f.kind === "rect" ? [[f.x, f.y], [f.x + f.w, f.y + f.h]] : f.punti;
      for (const [x, y] of punti) {
        expect(x).toBeGreaterThanOrEqual(-0.001);
        expect(x).toBeLessThanOrEqual(900.001);
        expect(y).toBeGreaterThanOrEqual(-0.001);
        expect(y).toBeLessThanOrEqual(1600.001);
      }
    }
  });

  it("l'arco a tutto sesto ha l'altezza dell'arco pari a metà larghezza; il ribassato usa la sua", () => {
    const quota = (d: SerramentoDisegno) => disegnaSerramento(d).quote.find((q) => q.lato === "sx")?.testo;
    expect(quota(arco)).toBe("f 450");
    expect(quota({ ...arco, frecciaMm: 300 })).toBe("f 300");
  });

  it("l'arco con anta ha simboli, cerniere e maniglia a metà del lato dritto", () => {
    const scena = disegnaSerramento(arco);
    expect(simboli(scena.forme)).toHaveLength(2);
    expect(rettangoli(scena.forme, "cerniera")).toHaveLength(2);
    const man = rettangoli(scena.forme, "maniglia")[0];
    expect(man).toBeDefined();
    // il lato dritto va dall'imposta (circa 450 dall'alto) al fondo: la maniglia sta a metà di quello
    expect(man.y + man.h / 2).toBeGreaterThan(900);
    expect(man.y + man.h / 2).toBeLessThan(1150);
  });

  it("il trapezio ha i due lati con altezze diverse e le quote dei lati", () => {
    const scena = disegnaSerramento(trapezio);
    const [vetro] = sagome(scena.forme, "vetro");
    const sinistra = vetro.punti.filter((p) => p[0] < 600);
    const destra = vetro.punti.filter((p) => p[0] >= 600);
    expect(Math.min(...sinistra.map((p) => p[1]))).toBeLessThan(Math.min(...destra.map((p) => p[1])) - 300);
    expect(scena.quote.map((q) => `${q.lato}:${q.testo}`).sort()).toEqual(["dx:800", "sotto:1200", "sx:1400"]);
  });

  it("dall'esterno il trapezio si specchia: le quote dei lati cambiano lato", () => {
    const scena = disegnaSerramento({ ...trapezio, vista: "esterna" });
    expect(scena.quote.map((q) => `${q.lato}:${q.testo}`).sort()).toEqual(["dx:1400", "sotto:1200", "sx:800"]);
    expect(rettangoli(scena.forme, "maniglia")).toHaveLength(0);
  });

  it("le quote di base e altezza ci sono anche sul rettangolo", () => {
    const quote = disegnaSerramento(duePorte).quote;
    expect(quote.map((q) => `${q.lato}:${q.testo}`).sort()).toEqual(["dx:1400", "sotto:1200"]);
  });
});

describe("monoblocco", () => {
  const mono = (extra: Partial<SerramentoDisegno> = {}): SerramentoDisegno => ({
    larghezzaMm: 1000, altezzaMm: 1000, ante: [{ tipo: "anta_ribalta", lato: "dx" }],
    monoblocco: { cassonettoMm: 200, tapparella: { motore: false } }, ...extra,
  });

  it("l'altezza totale comprende il cassonetto: 1000 con cassonetto da 200 sono 200 + 800", () => {
    const scena = disegnaSerramento(mono());
    expect(scena.altezza).toBe(1000);
    const cass = rettangoli(scena.forme, "cassonetto")[0];
    expect(cass.y).toBe(0);
    expect(cass.h).toBe(200);
    const vetro = rettangoli(scena.forme, "vetro")[0];
    expect(vetro.y).toBeGreaterThan(200); // il vetro sta sotto il cassonetto
    expect(vetro.y + vetro.h).toBeLessThan(1000);
    expect(scena.quote.map((q) => `${q.lato}:${q.testo}`).sort()).toEqual(["dx:1000", "sotto:1000", "sx:200", "sx:800"]);
  });

  it("tapparella: motore o cintino dall'interno, niente dall'esterno", () => {
    expect(rettangoli(disegnaSerramento(mono()).forme, "cintino")).toHaveLength(1);
    expect(rettangoli(disegnaSerramento(mono({ monoblocco: { tapparella: { motore: true } } })).forme, "motore")).toHaveLength(1);
    const esterna = disegnaSerramento(mono({ vista: "esterna" }));
    expect(rettangoli(esterna.forme, "cintino")).toHaveLength(0);
    expect(rettangoli(esterna.forme, "ispezione")).toHaveLength(0);
    expect(rettangoli(disegnaSerramento(mono({ monoblocco: { tapparella: false } })).forme, "cintino")).toHaveLength(0);
  });

  it("la tapparella abbassata copre la parte alta del vetro", () => {
    const aperta = disegnaSerramento(mono({ monoblocco: { tapparella: { abbassataPct: 0 } } }));
    expect(rettangoli(aperta.forme, "tapparella")).toHaveLength(0);
    const meta = disegnaSerramento(mono({ monoblocco: { tapparella: { abbassataPct: 50 } } }));
    const [tap] = rettangoli(meta.forme, "tapparella");
    const [vetro] = rettangoli(meta.forme, "vetro");
    expect(tap.y).toBeGreaterThan(200);
    expect(tap.h).toBeGreaterThan(200);
    expect(tap.h).toBeLessThan(vetro.h + 150);
  });

  it("un cassonetto troppo alto lascia comunque spazio al serramento", () => {
    const scena = disegnaSerramento(mono({ monoblocco: { cassonettoMm: 900 } }));
    const cass = rettangoli(scena.forme, "cassonetto")[0];
    expect(cass.h).toBeLessThanOrEqual(700);
  });
});

describe("vetro, lastre e telaio a Z", () => {
  const base: SerramentoDisegno = { larghezzaMm: 1000, altezzaMm: 1400, ante: [{ tipo: "battente", lato: "dx" }] };
  const spaziatori = (d: SerramentoDisegno) => sagome(disegnaSerramento(d).forme, "distanziatore").length;

  it("il doppio vetro ha un distanziatore, il triplo due; senza indicazioni nessuno", () => {
    expect(spaziatori(base)).toBe(0);
    expect(spaziatori({ ...base, vetro: { lastre: 2 } })).toBe(1);
    expect(spaziatori({ ...base, vetro: { lastre: 3 } })).toBe(2);
  });

  it("le etichette del listino danno tipo e lastre", () => {
    expect(vetroDaEtichette("Vetro Satinato", "Doppio vetro stratificato")).toEqual({ tipo: "satinato", lastre: 2 });
    expect(vetroDaEtichette("Vetro Antisonoro", "Triplo vetro stratificato")).toEqual({ tipo: "acustico", lastre: 3 });
    expect(vetroDaEtichette("Vetro Antisfondamento")).toEqual({ tipo: "antisfondamento", lastre: 2 });
    expect(vetroDaEtichette("Vetro Fumé").tipo).toBe("fume");
    expect(vetroDaEtichette("Vetro Serigrafato").tipo).toBe("serigrafato");
    expect(vetroDaEtichette("Vetro Standard", "Doppio vetro stratificato").tipo).toBe("standard");
    expect(vetroDaEtichette(null, undefined)).toEqual({ tipo: "standard", lastre: 2 });
  });

  it("il telaio a Z ha l'aletta a vista dall'interno, che esce dal riquadro; a L e dall'esterno no", () => {
    const z = disegnaSerramento({ ...base, telaio: { tipo: "Z", alettaMm: 35 } });
    expect(z.sporgenza).toBe(35);
    const [aletta] = sagome(z.forme, "aletta");
    expect(Math.min(...aletta.punti.map((p) => p[0]))).toBe(-35);
    expect(disegnaSerramento({ ...base, telaio: { tipo: "L" } }).sporgenza).toBe(0);
    expect(disegnaSerramento({ ...base, telaio: { tipo: "Z", alettaMm: 35 }, vista: "esterna" }).sporgenza).toBe(0);
  });

  it("l'etichetta del telaio dà il tipo e la misura dell'aletta, in mm o in cm", () => {
    expect(telaioDaEtichetta("Telaio a L")).toEqual({ tipo: "L" });
    expect(telaioDaEtichetta("Telaio a Z 35")).toEqual({ tipo: "Z", alettaMm: 35 });
    expect(telaioDaEtichetta("Telaio a Z 60 mm")).toEqual({ tipo: "Z", alettaMm: 60 });
    expect(telaioDaEtichetta("Telaio a Z da 4 cm")).toEqual({ tipo: "Z", alettaMm: 40 });
    expect(telaioDaEtichetta("Telaio a Z")).toEqual({ tipo: "Z" });
    expect(telaioDaEtichetta("Controtelaio")).toBeNull();
    expect(telaioDaEtichetta(null)).toBeNull();
  });
});

describe("finituraDaEtichetta", () => {
  it("riconosce i RAL come li scrive il listino", () => {
    expect(finituraDaEtichetta("RAL 7016 Grigio antracite")).toMatchObject({ tipo: "tinta", hex: RAL_COLORI["7016"].hex });
    expect(finituraDaEtichetta("Bianco RAL 9010")).toMatchObject({ tipo: "tinta", hex: RAL_COLORI["9010"].hex });
    expect(finituraDaEtichetta("Verde RAL 6005")).toMatchObject({ tipo: "tinta", hex: RAL_COLORI["6005"].hex });
    expect(codiceRalDaEtichetta("RAL 3003")).toBe("3003");
    expect(codiceRalDaEtichetta("Avorio")).toBeNull();
  });

  it("riconosce gli effetti legno e le tinte con nome", () => {
    expect(finituraDaEtichetta("Legno Rovere Dorato")?.tipo).toBe("legno");
    expect(finituraDaEtichetta("Noce K21")?.tipo).toBe("legno");
    expect(finituraDaEtichetta("Effetto legno (noce/rovere)")?.tipo).toBe("legno");
    expect(finituraDaEtichetta("Bianco Renolit")?.tipo).toBe("tinta");
    expect(finituraDaEtichetta("Sabbia")?.tipo).toBe("tinta");
  });

  it("un'etichetta che non si riconosce non inventa un colore", () => {
    expect(finituraDaEtichetta("Colore Fuori Standard")).toBeNull();
    expect(finituraDaEtichetta("")).toBeNull();
    expect(finituraDaEtichetta(null)).toBeNull();
  });

  it("tutti i colori RAL del listino sono nella tabella", () => {
    expect(Object.keys(RAL_COLORI)).toHaveLength(216);
    for (const c of Object.values(RAL_COLORI)) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("scurisci lascia il bianco grigio e il nero nero", () => {
    expect(scurisci("#ffffff", 0)).toBe("#ffffff");
    expect(scurisci("#000000", 0.5)).toBe("#000000");
    expect(scurisci("#808080", 0.5)).toBe("#404040");
  });
});
