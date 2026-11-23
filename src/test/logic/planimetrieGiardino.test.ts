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
    expect(passi[0].testo).toMatch(/^Giardino · vialetto [\d,]+ m · cancello pedonale · .*siepe [\d,]+ m/);
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

describe("ingresso del giardino", () => {
  it("vialetto dalla casa al confine, cancello in fondo, aiuole e lampioni: tutto dentro il prato e la siepe lascia il varco", () => {
    const { passi } = comandiDaChatDisegno(casaConPrato(), "fatto", "arreda il giardino");
    const p = passi[0].pianta;
    const prato = p.aree!.find(a => a.tipo === "prato")!, vialetto = p.aree!.find(a => a.tipo === "vialetto")!;
    expect(vialetto).toBeDefined();
    const xs = prato.contorno.map(q => q.x), ys = prato.contorno.map(q => q.y);
    for (const q of vialetto.contorno) {
      expect(q.x).toBeGreaterThanOrEqual(Math.min(...xs)); expect(q.x).toBeLessThanOrEqual(Math.max(...xs));
      expect(q.y).toBeGreaterThanOrEqual(Math.min(...ys)); expect(q.y).toBeLessThanOrEqual(Math.max(...ys));
    }
    // largo 120 cm, parte dal lato della casa (sinistra) e arriva al confine opposto
    const vx = vialetto.contorno.map(q => q.x), vy = vialetto.contorno.map(q => q.y);
    expect(Math.max(...vy) - Math.min(...vy)).toBe(120);
    expect(Math.min(...vx)).toBe(Math.min(...xs));
    expect(Math.max(...vx)).toBeGreaterThan(Math.max(...xs) - 30);
    const cancello = p.elementi!.find(e => e.tipo === "cancello_pedonale")!;
    expect(cancello.centro.x).toBeGreaterThan(Math.max(...xs) - 30);
    expect(cancello.centro.y).toBeCloseTo((Math.min(...vy) + Math.max(...vy)) / 2, 0);
    expect(p.elementi!.filter(e => e.tipo === "aiuola").length).toBeGreaterThanOrEqual(1);
    expect(p.elementi!.filter(e => e.tipo === "lampione")).toHaveLength(2);
    // nessuna siepe davanti al cancello
    for (const s of p.elementi!.filter(e => e.tipo === "siepe")) {
      const davanti = Math.abs(s.centro.x - cancello.centro.x) < 60 && Math.abs(s.centro.y - cancello.centro.y) < s.larghezza / 2 + 30 && s.rotazione === 90;
      expect(davanti, `siepe in ${s.centro.x},${s.centro.y}`).toBe(false);
    }
    expect(validaPlanimetria(aPlanimetria(p)).ok).toBe(true);
    // nel 3D la recinzione, se c'è, si apre al cancello; cancello e aiuole non sono più scatole
    const recintato = comandiDaChatDisegno(p, "fatto", "recinzione intorno al giardino").passi[0].pianta;
    const scena = costruisciScena(pianteDaPlanimetria(aPlanimetria(recintato)).fatto, { vista: "fatto" });
    const rete = scena.mesh.find(m => m.id === `area:${prato.id}:rete`)!;
    const gx = cancello.centro.x / 100, gz = cancello.centro.y / 100;
    let nelVarco = 0;
    for (let i = 0; i < rete.posizioni.length; i += 3) if (Math.abs(rete.posizioni[i] - gx) < .2 && Math.abs(rete.posizioni[i + 2] - gz) < .35) nelVarco++;
    expect(nelVarco).toBe(0);
    const materiali = new Set(scena.mesh.filter(m => m.id.startsWith("elemento:")).map(m => m.materiale));
    for (const m of ["fiore_rosa", "fiore_giallo", "grafite", "luce_calda"]) expect(materiali.has(m), m).toBe(true);
  });

  it("le facciate hanno colori veri e rilievo: malta più chiara del mattone", async () => {
    const { generaTrama } = await import("@/lib/planimetrie/tred/trameGenerate");
    const m = generaTrama("facciata_mattone", 256)!;
    const px = (x: number, y: number) => 4 * (y * 256 + x);
    // (0,0) è malta, (32,8) il centro del primo mattone
    expect(m.colore[px(0, 0)]).toBeGreaterThan(m.colore[px(32, 8)] - 5);
    expect(m.colore[px(32, 8)]).toBeGreaterThan(m.colore[px(32, 8) + 2] + 40);
    expect(m.colore[px(0, 0) + 2]).toBeGreaterThan(m.colore[px(32, 8) + 2] + 40);
    expect(generaTrama("facciata_pietra", 64)).not.toBeNull();
    expect(generaTrama("facciata_intonaco", 64)).not.toBeNull();
  });
});

it("con la siepe già piantata il vialetto si fa lo stesso e la siepe si apre al cancello", () => {
  const conSiepe = comandiDaChatDisegno(casaConPrato(), "fatto", "siepe intorno al giardino").passi[0].pianta;
  const prima = conSiepe.elementi!.filter(e => e.tipo === "siepe").length;
  const { passi, avvisi } = comandiDaChatDisegno(conSiepe, "fatto", "vialetto in giardino");
  expect(passi.length, avvisi.join(" | ")).toBe(1);
  expect(passi[0].testo).toMatch(/vialetto [\d,]+ m · cancello pedonale/);
  const p = passi[0].pianta, cancello = p.elementi!.find(e => e.tipo === "cancello_pedonale")!;
  const siepi = p.elementi!.filter(e => e.tipo === "siepe" && e.stato !== "da_demolire");
  expect(siepi.length).toBeLessThan(prima);
  for (const s of siepi) expect(Math.abs(s.centro.x - cancello.centro.x) < 60 && Math.abs(s.centro.y - cancello.centro.y) < 60).toBe(false);
});

describe("aspetto della casa", () => {
  it("ogni stile è una combinazione valida e si riconosce; un colore a mano vale solo sugli intonaci", async () => {
    const o = await import("@/lib/planimetrie/tred/aspettoOpzioni");
    const { TRAME_GENERATE } = await import("@/lib/planimetrie/tred/trameGenerate");
    for (const id of o.ID_STILI_CASA) {
      const s = o.STILI_CASA[id].scelte;
      expect(o.FACCIATE[s.facciata], id).toBeDefined();
      expect(o.INFISSI[s.infissi], id).toBeDefined();
      expect(o.stileCasa(s), id).toBe(id);
    }
    expect(o.stileCasa({ ...o.STILI_CASA.moderna.scelte, coloreFacciata: "#aabbcc" })).toBeUndefined();
    expect(o.coloreDellaFacciata({ facciata: "intonaco_bianco", coloreFacciata: "#aabbcc" })).toBe("#aabbcc");
    expect(o.coloreDellaFacciata({ facciata: "mattone", coloreFacciata: "#aabbcc" })).toBe("#ffffff");
    expect(o.coloreDellaFacciata({ facciata: "intonaco_bianco", coloreFacciata: "rosso" })).toBe(o.FACCIATE.intonaco_bianco.colore);
    // mattoni, pietre e intonaci hanno tutti il disegno con rilievo
    for (const id of o.ID_FACCIATE) if (!["legno", "cemento"].includes(o.FACCIATE[id].trama)) expect(TRAME_GENERATE["facciata_" + o.FACCIATE[id].trama], id).toBeDefined();
    const frase = o.descriviAspetto({ ...o.ASPETTO_PREDEFINITO, coloreFacciata: "#aabbcc", zoccolo: "pietra" });
    expect(frase).toContain("#aabbcc");
    expect(frase).toContain("zoccolo in pietra");
  });
});

describe("difetti corretti dopo la prima consegna", () => {
  it("lampada sopra il tavolo, specchio sopra il lavabo, quadro sopra il letto e tappeto sotto il divano non sono urti", async () => {
    const { ingombriArrediSovrapposti } = await import("@/lib/planimetrie/tred/ingombroArredo");
    const el = (tipo: string, larghezza = 100, profondita = 100) => ({ id: tipo, tipo, posizione: { x: 0, y: 0 }, rotazione: 0, larghezza, profondita, altezza: 80 }) as never;
    expect(ingombriArrediSovrapposti(el("tavolo"), el("lampada_sospensione", 36, 36))).toBe(false);
    expect(ingombriArrediSovrapposti(el("lavabo"), el("specchio_parete", 60, 4))).toBe(false);
    expect(ingombriArrediSovrapposti(el("letto_matrimoniale"), el("quadro", 82, 4))).toBe(false);
    expect(ingombriArrediSovrapposti(el("divano"), el("tappeto"))).toBe(false);
    // due mobili veri si urtano ancora, e due tappeti uno sull'altro pure
    expect(ingombriArrediSovrapposti(el("tavolo"), el("divano"))).toBe(true);
    expect(ingombriArrediSovrapposti(el("tappeto"), el("tappeto"))).toBe(true);
  });

  it("il render AI riceve il materiale giusto per resina, mosaico e formati nuovi", async () => {
    const { pavimentoDaCampione } = await import("../../../shared/planimetrie/materialiProgetto.ts");
    expect(pavimentoDaCampione("resina")).toMatchObject({ tipo: "resina_continua", fuga_larghezza_mm: 0 });
    expect(pavimentoDaCampione("mosaico_bianco")).toMatchObject({ tipo: "ceramica", formato_piastrella: "5x5" });
    expect(pavimentoDaCampione("gres_grande")).toMatchObject({ tipo: "gres_porcellanato", formato_piastrella: "120x120" });
    expect(pavimentoDaCampione("gres_antracite")).toMatchObject({ formato_piastrella: "30x60", effetto_visivo: "cemento" });
    // i campioni di prima restano come prima
    expect(pavimentoDaCampione("piastrelle")).toMatchObject({ tipo: "gres_porcellanato", formato_piastrella: "60x60" });
    expect(pavimentoDaCampione("cotto")).toMatchObject({ tipo: "cotto", formato_piastrella: "30x30" });
    expect(pavimentoDaCampione("rovere")).toMatchObject({ tipo: "parquet_legno", formato_piastrella: "18x120" });
  });

  it("solo i muri perimetrali portano il verso della facciata; lo zoccolo si apre sotto le finestre basse", () => {
    const pianta = casaConPrato();
    const scena = costruisciScena(pianteDaPlanimetria(aPlanimetria(pianta)).fatto, { vista: "fatto" });
    const muri = scena.mesh.filter(m => m.id.startsWith("muro:"));
    expect(muri.length).toBeGreaterThanOrEqual(4);
    for (const m of muri) {
      expect(m.esterno, m.id).toBeDefined();
      expect(Math.hypot(m.esterno![0], m.esterno![1])).toBeCloseTo(1, 5);
    }
  });
});
