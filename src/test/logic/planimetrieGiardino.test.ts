import { describe, expect, it } from "vitest";
import { aPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { arredaGiardino } from "@/components/planimetrie/editor/arredaGiardino";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";

const casaConPrato = () => {
  const { passi, avvisi } = comandiDaChatDisegno(piantaVuota(), "fatto", ["Soggiorno 5 × 4 m", "Giardino 12 × 10 m a destra della casa"].join("\n"));
  expect(passi.length, avvisi.join(" | ")).toBe(2);
  return passi[1].pianta;
};

describe("verde del giardino", () => {
  it("«arreda il giardino» mette la siepe sui lati liberi e gli alberi lontano dalla casa", () => {
    const pianta = casaConPrato();
    const { passi } = comandiDaChatDisegno(pianta, "fatto", "arreda il giardino");
    expect(passi).toHaveLength(1);
    expect(passi[0].testo).toMatch(/^Giardino · siepe [\d,]+ m · \d alber/);
    const prato = passi[0].pianta.aree!.find(a => a.tipo === "prato")!;
    const xs = prato.contorno.map(p => p.x), ys = prato.contorno.map(p => p.y);
    const nuovi = passi[0].pianta.elementi!.filter(e => e.tipo === "siepe" || e.tipo === "albero");
    const siepi = nuovi.filter(e => e.tipo === "siepe"), alberi = nuovi.filter(e => e.tipo === "albero");
    expect(siepi.length).toBeGreaterThanOrEqual(8);
    expect(alberi.length).toBeGreaterThanOrEqual(1);
    expect(alberi.length).toBeLessThanOrEqual(3);
    // tutto dentro il prato
    for (const e of nuovi) {
      expect(e.centro.x, e.tipo).toBeGreaterThan(Math.min(...xs));
      expect(e.centro.x, e.tipo).toBeLessThan(Math.max(...xs));
      expect(e.centro.y, e.tipo).toBeGreaterThan(Math.min(...ys));
      expect(e.centro.y, e.tipo).toBeLessThan(Math.max(...ys));
    }
    // il lato contro la casa (a sinistra del prato) resta libero: nessuna siepe verticale a ridosso
    expect(siepi.some(e => e.rotazione === 90 && e.centro.x < Math.min(...xs) + 100)).toBe(false);
    // i metri dichiarati sono la somma dei pezzi
    const metri = siepi.reduce((t, e) => t + e.larghezza, 0) / 100;
    expect(passi[0].testo).toContain(metri.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + " m");
    expect(validaPlanimetria(aPlanimetria(passi[0].pianta)).ok).toBe(true);
    // ripetere il comando non raddoppia
    expect(comandiDaChatDisegno(passi[0].pianta, "fatto", "arreda il giardino").passi).toHaveLength(0);
  });

  it("non pianta niente sopra la piscina", () => {
    const pianta = casaConPrato();
    const prato = pianta.aree!.find(a => a.tipo === "prato")!;
    const xs = prato.contorno.map(p => p.x), ys = prato.contorno.map(p => p.y);
    // una piscina nell'angolo in basso a destra del prato
    const piscina = { id: "piscina-prova", tipo: "piscina", centro: { x: Math.max(...xs) - 260, y: Math.max(...ys) - 380 }, rotazione: 0, larghezza: 350, profondita: 650, altezza: 140, stato: "esistente" as const };
    const con = { ...pianta, elementi: [...(pianta.elementi ?? []), piscina] } as typeof pianta;
    const esito = arredaGiardino(con, "fatto");
    const sopra = (e: { centro: { x: number; y: number } }) => Math.abs(e.centro.x - piscina.centro.x) < 175 && Math.abs(e.centro.y - piscina.centro.y) < 325;
    expect(esito.pianta.elementi!.filter(e => e.id !== piscina.id && sopra(e))).toEqual([]);
    expect(esito.siepeM).toBeGreaterThan(10);
  });

  it("«recinzione intorno al giardino» recinta il prato: nel 3D muretto, pali e rete, non contro la casa", () => {
    const pianta = casaConPrato();
    const { passi } = comandiDaChatDisegno(pianta, "fatto", "recinzione intorno al giardino");
    expect(passi[0].testo).toContain("recinzione");
    const prato = passi[0].pianta.aree!.find(a => a.tipo === "prato")!;
    expect(prato.recinzione).toBe(true);
    const scena = costruisciScena(pianteDaPlanimetria(aPlanimetria(passi[0].pianta)).fatto, { vista: "fatto" });
    for (const parte of ["muretto", "rete", "pali"]) expect(scena.mesh.some(m => m.id === `area:${prato.id}:${parte}`), parte).toBe(true);
    // il muretto copre tre lati su quattro: quello della casa è aperto
    const muretto = scena.mesh.find(m => m.id === `area:${prato.id}:muretto`)!;
    const minX = Math.min(...muretto.posizioni.filter((_, i) => i % 3 === 0)), pratoMinX = Math.min(...prato.contorno.map(p => p.x)) / 100;
    expect(minX).toBeGreaterThan(pratoMinX - .2);
    const senza = costruisciScena(pianteDaPlanimetria(aPlanimetria(pianta)).fatto, { vista: "fatto" });
    expect(senza.mesh.some(m => m.id.endsWith(":rete"))).toBe(false);
  });

  it("alberi e siepi hanno chioma e ciuffi, non cubi; senza prato il comando lo dice", () => {
    const { passi } = comandiDaChatDisegno(casaConPrato(), "fatto", "arreda il giardino");
    const scena = costruisciScena(pianteDaPlanimetria(aPlanimetria(passi[0].pianta)).fatto, { vista: "fatto" });
    const materiali = new Set(scena.mesh.filter(m => m.id.startsWith("elemento:")).map(m => m.materiale));
    for (const m of ["corteccia", "fogliame", "fogliame_chiaro"]) expect(materiali.has(m), m).toBe(true);
    const senzaPrato = comandiDaChatDisegno(piantaVuota(), "fatto", "siepe intorno al giardino");
    expect(senzaPrato.passi).toHaveLength(0);
    expect(senzaPrato.avvisi.join(" ")).toMatch(/Disegna prima il prato/);
  });
});
