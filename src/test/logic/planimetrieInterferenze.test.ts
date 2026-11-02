import { describe, expect, it } from "vitest";
import { verificheDiProgetto, alzataEPedata } from "../../../shared/planimetrie/interferenze";
import type { Elemento, Livello, StatoPianta } from "../../../shared/planimetrie/modello";

const muro = { id: "m1", p1: { x: 0, y: 0 }, p2: { x: 600, y: 0 }, spessore: 30, altezza: 270, tipo: "portante", stato: "esistente", origine: "rilevata" };
const porta = { id: "a1", muroId: "m1", tipo: "porta", offset: 200, larghezza: 90, altezza: 210, davanzale: 0, manovra: "battente", stato: "esistente", origine: "rilevata" };
const stato = (elementi: Partial<Elemento>[]): StatoPianta => ({
  muri: [muro], aperture: [porta], locali: [], quote: [], testi: [],
  elementi: elementi.map((e, i) => ({ id: `e${i}`, rotazione: 0, stato: "esistente", origine: "rilevata", ...e })) as Elemento[],
} as unknown as StatoPianta);
const liv = { id: "l", nome: "Terra", quota: 0 } as Livello;

describe("verifiche di progetto", () => {
  it("segnala il pilastro nel vano di una porta (la foto «cosa c'è di sbagliato»)", () => {
    const r = verificheDiProgetto(liv, stato([{ tipo: "pilastro", posizione: { x: 245, y: 0 }, larghezza: 30, profondita: 30 }]));
    expect(r.some((x) => x.codice === "interferenza" && x.esito === "non_conforme" && /porta/.test(x.messaggio))).toBe(true);
  });
  it("un pilastro accanto alla porta va bene", () => {
    const r = verificheDiProgetto(liv, stato([{ tipo: "pilastro", posizone: undefined, posizione: { x: 400, y: 0 }, larghezza: 30, profondita: 30 } as never]));
    expect(r.filter((x) => x.codice === "interferenza")).toHaveLength(0);
  });
  it("una scala attraversata da una parete è da controllare", () => {
    const r = verificheDiProgetto(liv, stato([{ tipo: "scala", posizione: { x: 500, y: 0 }, larghezza: 100, profondita: 450 }]));
    expect(r.some((x) => x.codice === "interferenza" && x.esito === "attenzione")).toBe(true);
  });
  it("la scala di catalogo ha alzata e pedata regolari", () => {
    const r = verificheDiProgetto(liv, stato([{ tipo: "scala", posizione: { x: 300, y: 400 }, larghezza: 100, profondita: 450, altezza: 280 }]));
    expect(r.find((x) => x.codice === "scala")?.esito).toBe("ok");
  });
  it("una scala troppo corta è ripida", () => {
    const r = verificheDiProgetto(liv, stato([{ tipo: "scala", posizione: { x: 300, y: 400 }, larghezza: 100, profondita: 250, altezza: 280 }]));
    expect(r.find((x) => x.codice === "scala")?.esito).toBe("non_conforme");
  });
  it("rampa stretta", () => {
    const r = verificheDiProgetto(liv, stato([{ tipo: "scala", posizione: { x: 300, y: 400 }, larghezza: 70, profondita: 450, altezza: 280 }]));
    expect(r.some((x) => x.codice === "scala" && /80 cm/.test(x.messaggio))).toBe(true);
  });
  it("scala a U e chiocciola hanno pedate plausibili", () => {
    const u = alzataEPedata({ tipo: "scala_u", larghezza: 200, profondita: 360 } as Elemento, 315)!;
    expect(u.pedata).toBeGreaterThan(24);
    expect(u.pedata).toBeLessThan(30);
    const c = alzataEPedata({ tipo: "scala_chiocciola", larghezza: 160, profondita: 160 } as Elemento, 280)!;
    expect(c.pedata).toBeGreaterThan(15);
  });
});

describe("muro di contenimento: proporzioni", () => {
  it("la base stretta è non conforme, quella tipica va bene", () => {
    const base = (profondita: number, altezza = 300) => verificheDiProgetto(liv, stato([{ tipo: "muro_contenimento", posizione: { x: 300, y: 600 }, larghezza: 600, profondita, altezza }])).find((x) => x.codice === "contenimento");
    expect(base(100)?.esito).toBe("non_conforme");
    expect(base(200)?.esito).toBe("ok");
    expect(base(300)?.esito).toBe("attenzione");
  });
});
