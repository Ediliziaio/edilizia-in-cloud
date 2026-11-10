import { expect, it } from "vitest";
import { CostruttoreMesh } from "./costruttore";
import { chiaveModelloElemento, costruisciElemento, modelloElemento } from "./elementi";
import { arrediInquadrati, descrizioneArrediInquadrati, etichetteArrediInquadrati, vistaInternaArredata } from "./inquadraturaArredi";
import type { PiantaPer3D } from "./tipi";

it.each(["letto_matrimoniale", "letto_singolo", "divano", "armadio", "comodino", "tavolo", "sedia", "cucina", "cucina_angolare", "frigorifero", "mobile_tv", "doccia"])("il modello %s mantiene posizione, rotazione e ingombro della pianta", (tipo) => {
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

it("una sedia ha lo spazio libero sotto la seduta e l'armadio ante distinguibili", () => {
  const s = modelloElemento("sedia"), blocchi = s.blocchi(s.misure.l, s.misure.p, s.misure.h);
  expect(blocchi.some((b) => Math.abs(b.x) < b.l / 2 && Math.abs(b.z) < b.p / 2 && b.y <= .2 && b.y + b.h >= .2)).toBe(false);
  const a = modelloElemento("armadio"), ante = a.blocchi(1.8, .6, 2.4).filter((b) => b.z > .25 && b.h > 2);
  expect(ante.length).toBeGreaterThanOrEqual(2);
  expect(chiaveModelloElemento("letto_matrimoniale")).toBe("letto");
  expect(chiaveModelloElemento("oggetto_sconosciuto")).toBeNull();
});

it("la camera da letto inquadra il letto e identifica i mobili senza muoverli o aggiungerne", () => {
  const p: PiantaPer3D = { muri: [], aperture: [], locali: [{ id: "camera", nome: "Camera", destinazione: "camera", altezza: 270, contorno: [{ x: 0, y: 0 }, { x: 450, y: 0 }, { x: 450, y: 400 }, { x: 0, y: 400 }] }], elementi: [
    { id: "letto", tipo: "letto_matrimoniale", centro: { x: 300, y: 230 }, larghezza: 160, profondita: 200, altezza: 50, rotazione: 0 },
    { id: "armadio", tipo: "armadio", centro: { x: 100, y: 40 }, larghezza: 180, profondita: 60, altezza: 230, rotazione: 0 },
    { id: "comodino", tipo: "comodino", centro: { x: 195, y: 150 }, larghezza: 40, profondita: 40, altezza: 50, rotazione: 0 },
  ] };
  const prima = structuredClone(p), t = vistaInternaArredata(p, "camera");
  expect(arrediInquadrati(p, p.locali[0], t).find((e) => e.id === "letto")!.quotaVisibile).toBeGreaterThanOrEqual(.5);
  expect(etichetteArrediInquadrati(p, "camera", t, 1.5).some((e) => e.nome === "BED")).toBe(true);
  expect(descrizioneArrediInquadrati(p, "camera", t)).toContain("Do not infer furniture from the room name");
  expect(p).toEqual(prima);
});
