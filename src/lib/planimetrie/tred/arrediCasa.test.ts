import { expect, it } from "vitest";
import { CostruttoreMesh } from "./costruttore";
import { chiaveModelloElemento, costruisciElemento, modelloElemento } from "./elementi";
import { ingombriArrediSovrapposti, ingombroDentroLocale } from "./ingombroArredo";
import { arrediInquadrati, descrizioneArrediInquadrati, posizioniArrediInquadrati, vistaInternaArredata } from "./inquadraturaArredi";
import { costruisciScena } from "./scena";
import { scenaEdificio } from "./edificio";
import { scenaConVarianti } from "./variantiRender";
import { puntoNelPoligono } from "./geometria2d";
import { rettangoliIngombroArredo } from "../../../../shared/planimetrie/modelliArredo";
import type { Elemento } from "../../../../shared/planimetrie/modello";
import type { PiantaPer3D } from "./tipi";

it.each([
  { tipo: "divano", modello: "lino_base_rovere", l: 2.96, p: .84, h: .76, massima: .76, materiali: ["tessuto", "rovere_chiaro"] },
  { tipo: "divano_angolare", modello: "chaise_lino", l: 2.74, p: 1.47, h: .83, massima: .83, materiali: ["tessuto", "rovere_chiaro"] },
  { tipo: "cucina", modello: "rovere_nicchie", l: 3.08, p: .61, h: .91, massima: 2.15, materiali: ["rovere_chiaro", "piano_travertino", "luce_calda", "inox", "induzione"] },
  { tipo: "isola_cucina", modello: "travertino_rovere", l: 1.56, p: .85, h: .92, massima: .92, materiali: ["rovere_chiaro", "piano_travertino", "lino_avorio"] },
  { tipo: "frigorifero", modello: "inox_incassato", l: .6, p: .66, h: 2.03, massima: 2.03, materiali: ["inox", "guarnizione", "schermo"] },
  { tipo: "armadio", modello: "rovere_gola", l: 2.10, p: .59, h: 2.43, massima: 2.43, materiali: ["rovere_chiaro", "grafite"] },
  { tipo: "libreria", modello: "rovere_libri", l: .86, p: .34, h: 1.85, massima: 1.85, materiali: ["rovere_chiaro", "libro_verde", "carta"] },
  { tipo: "tenda", modello: "lino_aperta", l: 3.42, p: .18, h: 2.8, massima: 2.8, materiali: ["lino_tenda", "telaio"] },
  { tipo: "quadro", modello: "salvia", l: .82, p: .04, h: 1.81, massima: 1.81, materiali: ["rovere_chiaro", "carta", "libro_verde"] },
  { tipo: "vetrinetta", modello: undefined, l: 1.08, p: .39, h: 1.58, massima: 1.58, materiali: ["vetro_fume", "luce_calda", "ceramica_satinata"] },
  { tipo: "scaldasalviette", modello: undefined, l: .53, p: .13, h: 1.65, massima: 1.65, materiali: ["grafite", "tessuto"] },
  { tipo: "specchio_parete", modello: "retroilluminato", l: .88, p: .05, h: 2.08, massima: 2.08, materiali: ["luce_specchio", "specchio"] },
  { tipo: "barbecue", modello: "modulo_inox", l: 1.7, p: .65, h: 1.14, massima: 1.14, materiali: ["inox", "piano_travertino", "rovere_chiaro"] },
])("il modello $modello rispetta l’ingombro e usa materiali distinti", ({ tipo, modello, l, p, h, massima, materiali }) => {
  const r = Math.PI * .30, centro = { x: 6.12, z: -1.75 };
  const mesh = new Map<string, CostruttoreMesh>();
  costruisciElemento(tipo, centro, r, { l, p, h, modello }, materiale => {
    if (!mesh.has(materiale)) mesh.set(materiale, new CostruttoreMesh());
    return mesh.get(materiale)!;
  });
  expect([...mesh.keys()]).toEqual(expect.arrayContaining(materiali));
  for (const { posizioni, normali, indici } of mesh.values()) {
    expect(indici.length).toBeGreaterThan(0);
    expect(normali.every(Number.isFinite)).toBe(true);
    const dentro = Array.from({ length: posizioni.length / 3 }, (_, i) => {
      const x = posizioni[i * 3] - centro.x, y = posizioni[i * 3 + 1], z = posizioni[i * 3 + 2] - centro.z;
      return Math.abs(x * Math.cos(r) + z * Math.sin(r)) <= l / 2 + 1e-6 &&
        Math.abs(-x * Math.sin(r) + z * Math.cos(r)) <= p / 2 + 1e-6 && y >= 0 && y <= massima + 1e-6;
    });
    expect(dentro.every(Boolean)).toBe(true);
  }
});

it("la tenda raccolta libera il passaggio sotto il binario", () => {
  const tenda = (modello: string) => {
    const teli = new CostruttoreMesh(), guida = new CostruttoreMesh();
    costruisciElemento("tenda", { x: 0, z: 0 }, 0, { l: 3.42, p: .18, h: 2.8, modello },
      m => m === "lino_tenda" ? teli : guida);
    return teli.posizioni.filter((_, i) => i % 3 === 0);
  };
  expect(tenda("lino_aperta").every(x => Math.abs(x) >= .98)).toBe(true);
  expect(tenda("lino_chiusa").some(x => Math.abs(x) < .05)).toBe(true);
});

it("una pianta in vaso salvata con altezza zero mantiene una posa 3D valida", () => {
  const scena = costruisciScena({ muri: [], aperture: [], locali: [], elementi: [
    { id: "vaso", tipo: "pianta_vaso", modello: "pianta-haworthia", centro: { x: 0, y: 0 }, rotazione: 0, altezza: 0 },
  ] });
  const posa = scena.mesh.find(m => m.arredoCatalogo)?.arredoCatalogo;
  expect(posa?.misure[1]).toBe(.32);
});

it("il colore della cucina si applica al rovere senza tingere travertino e acciaio", () => {
  const scena = costruisciScena({ muri: [], aperture: [], locali: [], elementi: [
    { id: "cucina", tipo: "cucina", centro: { x: 0, y: 0 }, rotazione: 0, modello: "rovere_nicchie", colore: "#c8a585" },
  ] });
  expect(scena.mesh.map(m => m.materiale)).toEqual(
    expect.arrayContaining(["arredo:rovere_chiaro:#c8a585", "piano_travertino", "inox", "luce_calda"]),
  );
  expect(scena.materiali["piano_travertino"].tessitura?.trama).toBe("travertino");
});

it.each(["letto_matrimoniale", "letto_singolo", "divano", "divano_angolare", "armadio", "comodino", "tavolo", "sedia", "cucina", "cucina_angolare", "isola_cucina", "frigorifero", "mobile_tv", "doccia"])("il modello %s mantiene posizione, rotazione e ingombro della pianta", (tipo) => {
  const m = modelloElemento(tipo), r = Math.PI * .37, centro = { x: 3.2, z: 4.7 }, l = tipo === "letto_singolo" ? .9 : m.misure.l, p = m.misure.p;
  const mesh = new CostruttoreMesh();
  costruisciElemento(tipo, centro, r, { l, p, h: m.misure.h }, () => mesh);
  expect(mesh.posizioni.length).toBeGreaterThan(100);
  for (let i = 0; i < mesh.posizioni.length; i += 3) {
    const x = mesh.posizioni[i] - centro.x, z = mesh.posizioni[i + 2] - centro.z;
    expect(Math.abs(x * Math.cos(r) + z * Math.sin(r))).toBeLessThanOrEqual(l / 2 + 1e-6);
    expect(Math.abs(-x * Math.sin(r) + z * Math.cos(r))).toBeLessThanOrEqual(p / 2 + 1e-6);
  }
});

it("il divano angolare conserva libero l’angolo della L e rispetta il tessuto scelto", () => {
  const misure = { l: 2.6, p: 1.55, h: .81 };
  const rettangoli = rettangoliIngombroArredo("divano_angolare", misure.l * 100, misure.p * 100);
  expect(rettangoli).toHaveLength(2);
  const c = new CostruttoreMesh();
  costruisciElemento("divano_angolare", { x: 0, z: 0 }, 0, misure, () => c);
  for (let i = 0; i < c.posizioni.length; i += 3) {
    const [x, y, z] = c.posizioni.slice(i, i + 3);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(misure.h + 1e-6);
    expect(rettangoli.some(r => Math.abs(x * 100 - r.x) <= r.larghezza / 2 + 1e-6 &&
      Math.abs(z * 100 - r.y) <= r.profondita / 2 + 1e-6)).toBe(true);
  }
  const scena = costruisciScena({
    muri: [], aperture: [], locali: [], elementi: [{ id: "divano-l", tipo: "divano_angolare", centro: { x: 0, y: 0 }, rotazione: 0, colore: "#933d2b" }],
  });
  expect(scena.mesh.map(m => m.materiale)).toContain("arredo:tessuto_divano:#933d2b");
  expect(scena.materiali["arredo:tessuto_divano:#933d2b"].tessitura?.trama).toBe("tessuto");
});

it("una sedia ha lo spazio libero sotto la seduta e l'armadio ante distinguibili", () => {
  const s = modelloElemento("sedia"), blocchi = s.blocchi(s.misure.l, s.misure.p, s.misure.h);
  expect(blocchi.some((b) => Math.abs(b.x) < b.l / 2 && Math.abs(b.z) < b.p / 2 && b.y <= .2 && b.y + b.h >= .2)).toBe(false);
  const a = modelloElemento("armadio"), ante = a.blocchi(1.8, .6, 2.4).filter((b) => b.z > .25 && b.h > 2);
  expect(ante.length).toBeGreaterThanOrEqual(2);
  expect(chiaveModelloElemento("letto_matrimoniale")).toBe("letto");
  expect(chiaveModelloElemento("oggetto_sconosciuto")).toBeNull();
});

it("mantiene il tappeto sopra il pavimento e permette di posare il tavolino sul tessuto", () => {
  const tappeto: Elemento = { id: "rug", tipo: "tappeto", posizione: { x: 0, y: 0 }, origine: "rilevata",
    rotazione: 0, larghezza: 290, profondita: 205, altezza: 2, colore: "#d4c5ae" };
  const tavolino: Elemento = { ...tappeto, tipo: "tavolino", id: "tavolino", larghezza: 92, profondita: 92, altezza: 38 };
  expect(ingombriArrediSovrapposti(tappeto, tavolino)).toBe(false);
  expect(ingombriArrediSovrapposti(tappeto, { ...tappeto, id: "rug-2" })).toBe(true);
  const scena = costruisciScena({ muri: [], aperture: [], locali: [], elementi: [
    { id: tappeto.id, tipo: tappeto.tipo, centro: { x: 0, y: 0 }, rotazione: 0,
      larghezza: tappeto.larghezza, profondita: tappeto.profondita, altezza: tappeto.altezza, colore: tappeto.colore },
  ] });
  const rivestimento = scena.mesh.find(m => m.riferimento === tappeto.id)!;
  expect(scena.materiali[rivestimento.materiale].tessitura?.trama).toBe("tessuto");
  expect(rivestimento.posizioni.filter((_, i) => i % 3 === 1).every(y => y > 0 && y <= .022 + 1e-6)).toBe(true);
});

it.each([
  ["cucina", 3, .635, .92, "quarzo"],
  ["cucina_angolare", 2.4, 1.8, .95, "quarzo"],
  ["isola_cucina", 1.6, .9, .97, "quarzo"],
  ["letto_matrimoniale", 1.8, 2.1, .54, "lenzuola"],
] as const)("%s rispetta le quote personalizzate", (tipo, l, p, h, materiale) => {
  const blocchi = modelloElemento(tipo).blocchi(l, p, h);
  expect(blocchi.some(blocco => blocco.materiale === materiale && Math.abs(blocco.y + blocco.h - h) < 1e-6)).toBe(true);
  const c = new CostruttoreMesh();
  costruisciElemento(tipo, { x: 0, z: 0 }, 0, { l, p, h }, () => c);
  const [xs, zs] = [c.posizioni.filter((_, i) => i % 3 === 0), c.posizioni.filter((_, i) => i % 3 === 2)];
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(l, 5);
  expect(Math.max(...zs.map(Math.abs))).toBeLessThanOrEqual(p / 2 + 1e-6);
  if (tipo !== "isola_cucina") expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(p, 5);
});

it("il lavello occupa un foro nel piano e la variante con piano libero chiude quel vano", () => {
  const cucina = (modello: string) => {
    const materiali = new Map<string, CostruttoreMesh>();
    costruisciElemento("cucina", { x: 0, z: 0 }, 0, { l: 2.4, p: .6, h: .9, modello }, chiave => {
      const mesh = materiali.get(chiave) ?? new CostruttoreMesh();
      materiali.set(chiave, mesh);
      return mesh;
    });
    return materiali;
  };
  const copreLavello = (m: CostruttoreMesh) => {
    const p = { x: -2.4 * .255, z: 0 };
    for (let i = 0; i < m.indici.length; i += 3) {
      const [a, b, c] = m.indici.slice(i, i + 3).map(k => m.posizioni.slice(k * 3, k * 3 + 3));
      if (![a, b, c].every(v => Math.abs(v[1] - .9) < .000001)) continue;
      const lato = ([x, , z]: number[], [u, , w]: number[]) => (u - x) * (p.z - z) - (w - z) * (p.x - x);
      const segni = [lato(a, b), lato(b, c), lato(c, a)];
      if (segni.every(v => v >= 0) || segni.every(v => v <= 0)) return true;
    }
    return false;
  };
  const attrezzata = cucina("attrezzata"), basi = cucina("basi");
  expect(copreLavello(attrezzata.get("quarzo")!)).toBe(false);
  expect(attrezzata.get("inox")?.posizioni.some((y, i) => i % 3 === 1 && y > 1.08)).toBe(true);
  expect(attrezzata.has("grafica_induzione")).toBe(true);
  expect(copreLavello(basi.get("quarzo")!)).toBe(true);
  expect(basi.has("induzione")).toBe(false);
});

it("una cucina a L entra nella nicchia anche ruotata e lascia libero lo spazio tra i bracci", () => {
  const cucina: Elemento = { id: "cucina", tipo: "cucina_angolare", posizione: { x: 150, y: 120 },
    origine: "rilevata", rotazione: 0, larghezza: 300, profondita: 240 };
  const nicchia = [[0, 0], [62, 0], [62, 178], [300, 178], [300, 240], [0, 240]].map(([x, y]) => ({ x, y }));
  expect(ingombroDentroLocale(cucina, nicchia)).toBe(true);
  const ruota = ({ x, y }: { x: number; y: number }) => ({ x: -y, y: x });
  expect(ingombroDentroLocale({ ...cucina, posizione: ruota(cucina.posizione), rotazione: 90 }, nicchia.map(ruota))).toBe(true);
  expect(ingombroDentroLocale({ ...cucina, posizione: { x: 149, y: 120 } }, nicchia)).toBe(false);
  const sedia = { ...cucina, id: "sedia", tipo: "sedia", posizione: { x: 150, y: 100 }, larghezza: 40, profondita: 40 };
  expect(ingombriArrediSovrapposti(cucina, sedia)).toBe(false);
  expect(ingombriArrediSovrapposti(cucina, { ...sedia, posizione: { x: 40, y: 100 } })).toBe(true);
});

it("la camera da letto inquadra il letto e identifica i mobili senza muoverli o aggiungerne", () => {
  const p: PiantaPer3D = { muri: [], aperture: [], locali: [{ id: "camera", nome: "Camera", destinazione: "camera", altezza: 270, contorno: [{ x: 0, y: 0 }, { x: 450, y: 0 }, { x: 450, y: 400 }, { x: 0, y: 400 }] }], elementi: [
    { id: "letto", tipo: "letto_matrimoniale", centro: { x: 300, y: 230 }, larghezza: 160, profondita: 200, altezza: 50, rotazione: 0 },
    { id: "armadio", tipo: "armadio", centro: { x: 100, y: 40 }, larghezza: 180, profondita: 60, altezza: 230, rotazione: 0 },
    { id: "comodino", tipo: "comodino", centro: { x: 195, y: 150 }, larghezza: 40, profondita: 40, altezza: 50, rotazione: 0 },
  ] };
  const prima = structuredClone(p), t = vistaInternaArredata(p, "camera");
  expect(arrediInquadrati(p, p.locali[0], t).find((e) => e.id === "letto")!.quotaVisibile).toBeGreaterThanOrEqual(.5);
  expect(posizioniArrediInquadrati(p, "camera", t, 1.5).some((e) => e.id === "letto")).toBe(true);
  expect(descrizioneArrediInquadrati(p, "camera", t)).toContain("Do not infer furniture from the room name");
  expect(p).toEqual(prima);
});

it("le varianti del render cambiano parquet, arredi, piscina e auto alle sole parti selezionate", () => {
  const contorno = [{ x: 0, y: 0 }, { x: 620, y: 0 }, { x: 620, y: 490 }, { x: 0, y: 490 }];
  const p: PiantaPer3D = {
    muri: [], aperture: [], locali: [{ id: "s", nome: "Soggiorno", destinazione: "soggiorno", contorno, altezza: 265 }],
    elementi: [
      { id: "d", tipo: "divano", localeId: "s", centro: { x: 220, y: 140 }, rotazione: 0 },
      { id: "piscina", tipo: "piscina", centro: { x: 1200, y: 300 }, rotazione: 0 },
      { id: "auto", tipo: "auto", centro: { x: 1900, y: 300 }, rotazione: 20 },
    ],
  };
  const prima = structuredClone(p);
  const scena = costruisciScena(p);
  const { scena: variante } = scenaConVarianti(p, scena, "progetto", "s", { pavimento: "rovere_spina",
    arredi: { d: { modello: "modulare", colore: "#7c6140" }, piscina: { modello: "turchese" }, auto: { modello: "suv", colore: "#294559" } } });
  const pavimento = variante.mesh.find(m => m.id === "pavimento:s")!;
  expect(pavimento.posizioni).toEqual(scena.mesh.find(m => m.id === pavimento.id)!.posizioni);
  expect(variante.materiali[pavimento.materiale].tessitura?.trama).toBe("rovere_spina");
  expect(variante.mesh.some(m => m.riferimento === "d" && m.materiale === "arredo:tessuto:#7c6140")).toBe(true);
  expect(variante.mesh.some(m => m.riferimento === "piscina" && m.materiale === "bordo_travertino")).toBe(true);
  expect(variante.mesh.some(m => m.riferimento === "auto" && m.materiale === "arredo:carrozzeria:#294559")).toBe(true);
  expect(variante.mesh.find(m => m.id === "soffitto:s")).toBe(scena.mesh.find(m => m.id === "soffitto:s"));
  expect(p).toEqual(prima);
});

it("ritaglia un terreno e una terrazza anche quando la piscina ruotata attraversa il bordo della pavimentazione", () => {
  const pianta: PiantaPer3D = {
    muri: [], locali: [], aperture: [],
    aree: [{ id: "terrazza", tipo: "pavimentato", quota: 10,
      contorno: [{ x: 0, y: 0 }, { x: 510, y: 0 }, { x: 510, y: 900 }, { x: 0, y: 900 }] }],
    elementi: [{ id: "vasca", tipo: "piscina", centro: { x: 490, y: 450 }, rotazione: 32,
      larghezza: 350, profondita: 650, altezza: 145, modello: "turchese" }],
  };
  const { mesh } = costruisciScena(pianta);
  const proiezione = (id: string) => {
    const m = mesh.find(m => m.id === id)!;
    return Array.from({ length: m.indici.length / 3 }, (_, i) =>
      m.indici.slice(i * 3, i * 3 + 3).map(k => ({ x: m.posizioni[k * 3], y: m.posizioni[k * 3 + 2] })));
  };
  const acqua = mesh.find(m => m.materiale === "acqua_turchese")!;
  const interno = mesh.find(m => m.materiale === "piscina_mosaico_chiaro")!;
  const yAcqua = acqua.posizioni[1];
  expect(yAcqua).toBeCloseTo(.1 + .035 - .12, 5);
  expect(Math.min(...interno.posizioni.filter((_, i) => i % 3 === 1))).toBeCloseTo(.1 + .035 - 1.45 - .036, 5);
  const superficie = proiezione(acqua.id).reduce((a, [p, q, r]) =>
    a + Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / 2, 0);
  expect(superficie).toBeCloseTo(3 * 6, 6);
  for (const id of ["terreno", "area:terrazza"]) {
    const facce = proiezione(id);
    expect(facce.some(t => puntoNelPoligono({ x: 4.9, y: 4.5 }, t))).toBe(false);
    expect(facce.some(t => puntoNelPoligono({ x: 1.03, y: 1.05 }, t))).toBe(true);
  }
});

it("lascia visibili le pavimentazioni esterne ribassate nel modello intero", () => {
  const pianta: PiantaPer3D = { muri: [], aperture: [], locali: [], elementi: [],
    aree: [{ id: "vialetto", tipo: "pavimentato", quota: -3,
      contorno: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 210 }, { x: 0, y: 210 }] }] };
  const edificio = scenaEdificio([{ id: "pt", nome: "Piano terra", quota: 0, piante: { fatto: pianta, progetto: pianta } }], { terreno: 2 });
  const terreno = edificio.mesh.find(m => m.id === "terreno")!;
  const ingresso = edificio.mesh.find(m => m.id === "pt/area:vialetto")!;
  expect(ingresso.posizioni[1]).toBeCloseTo(-.026);
  const facce = (m: typeof terreno) => Array.from({ length: m.indici.length / 3 }, (_, i) =>
    m.indici.slice(i * 3, i * 3 + 3).map(k => ({ x: m.posizioni[k * 3], y: m.posizioni[k * 3 + 2] })));
  expect(facce(terreno).some(t => puntoNelPoligono({ x: 1.2, y: 1.25 }, t))).toBe(false);
  expect(facce(terreno).some(t => puntoNelPoligono({ x: 1.2, y: -1.25 }, t))).toBe(true);
  expect(facce(ingresso).some(t => puntoNelPoligono({ x: 1.2, y: 1.25 }, t))).toBe(true);
});

it("il piano in marmo si applica soltanto alla cucina scelta e conserva il vano del lavello", () => {
  const pianta: PiantaPer3D = {
    muri: [], locali: [], aperture: [],
    elementi: [100, 500].map((x, i) => ({ id: "c" + i, tipo: "cucina", centro: { x, y: 100 }, rotazione: 0, larghezza: 240 })),
  };
  const scena = costruisciScena(pianta);
  const variante = scenaConVarianti(pianta, scena, "progetto", undefined, { arredi: { c0: { pianoCucina: "marmo_marquinia" } } }).scena;
  const piano = variante.mesh.find(m => m.id === "elemento:c0:quarzo")!;
  const originale = scena.mesh.find(m => m.id === piano.id)!;
  expect(piano.posizioni).toEqual(originale.posizioni);
  expect(piano.indici).toEqual(originale.indici);
  expect(variante.materiali[piano.materiale].tessitura?.trama).toBe("marmo_marquinia");
  expect(variante.mesh.find(m => m.id === "elemento:c1:quarzo")?.materiale).toBe("quarzo");
});
