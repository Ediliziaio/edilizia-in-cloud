import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mesh, MeshStandardMaterial } from "three";
import { BILOCALE_DA_RISTRUTTURARE, costruisciScena, pianteDaPlanimetria, type Scena3D } from "@/lib/planimetrie/tred";
import { aggiornaGruppo, creaGruppo, liberaGruppo } from "./scenaThree";

const fatto = pianteDaPlanimetria(BILOCALE_DA_RISTRUTTURARE).fatto;
const scenaFatto = () => costruisciScena(fatto, { vista: "fatto" });

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null));
afterEach(() => vi.restoreAllMocks());

describe("aggiornamento del gruppo 3D", () => {
  it("aggiorna il divano e conserva mesh, buffer e materiali del resto della scena", () => {
    const scena = scenaFatto();
    const gruppo = creaGruppo(scena);
    const prima = new Map((gruppo.children as Mesh[]).map(o => [o.userData.id, { mesh: o, geometria: o.geometry, materiale: o.material }]));
    const divano = fatto.elementi.find(e => e.tipo === "divano")!;
    const dopo = costruisciScena({ ...fatto, elementi: fatto.elementi.map(e => e.id === divano.id
      ? { ...e, centro: { ...e.centro, x: e.centro.x + 35 } } : e) }, { vista: "fatto" });
    const rilasciate = new Map(gruppo.children.map(o => [o.userData.id, vi.spyOn((o as Mesh).geometry, "dispose")]));
    aggiornaGruppo(gruppo, dopo);
    expect(gruppo.children.map(o => o.userData.id)).toEqual(dopo.mesh.map(m => m.id));
    for (const o of gruppo.children as Mesh[]) {
      const originale = prima.get(o.userData.id)!;
      expect(o).toBe(originale.mesh);
      expect(o.material).toBe(originale.materiale);
      if (o.userData.riferimento === divano.id) {
        expect(o.geometry).not.toBe(originale.geometria);
        expect(o.geometry.getAttribute("position").getX(0) - originale.geometria.getAttribute("position").getX(0)).toBeCloseTo(.35);
        expect(rilasciate.get(o.userData.id)).toHaveBeenCalledOnce();
      } else {
        expect(o.geometry).toBe(originale.geometria);
        expect(rilasciate.get(o.userData.id)).not.toHaveBeenCalled();
      }
    }
    aggiornaGruppo(gruppo, scena);
    const rifatto = (gruppo.children as Mesh[]).find(o => o.userData.riferimento === divano.id)!;
    expect(rifatto.geometry.getAttribute("position").getX(0)).toBe(prima.get(rifatto.userData.id)!.geometria.getAttribute("position").getX(0));
    liberaGruppo(gruppo);
  });

  it("aggiorna il materiale, rigenera le UV al cambio di scala e libera le parti rimosse", () => {
    const scena = scenaFatto(), m = scena.mesh.find(m => m.genere === "pavimento")!;
    const dati = { ...scena.materiali[m.materiale], tessitura: { trama: "intonaco", metri: [1, 1] as [number, number] } };
    const primo: Scena3D = { ...scena, mesh: [m], materiali: { [m.materiale]: dati } };
    const gruppo = creaGruppo(primo);
    const mesh = gruppo.children[0] as Mesh<NonNullable<Mesh["geometry"]>, MeshStandardMaterial>;
    const geometria = mesh.geometry, materiale = mesh.material;
    const liberaMateriale = vi.spyOn(materiale, "dispose");
    aggiornaGruppo(gruppo, { ...primo, materiali: { [m.materiale]: { ...dati, colore: "#737c63" } } });
    expect(mesh.geometry).toBe(geometria);
    expect(mesh.material.color.getHexString()).toBe("737c63");
    expect(mesh.userData.materialeBase).toBe(mesh.material);
    expect(liberaMateriale).toHaveBeenCalledOnce();
    aggiornaGruppo(gruppo, { ...primo, materiali: { [m.materiale]: { ...dati, tessitura: { ...dati.tessitura, metri: [2, 2] } } } });
    expect(mesh.geometry.getAttribute("uv").getX(0)).toBeCloseTo(geometria.getAttribute("uv").getX(0) / 2);
    expect(mesh.geometry).not.toBe(geometria);
    const liberaGeometria = vi.spyOn(mesh.geometry, "dispose");
    aggiornaGruppo(gruppo, { ...primo, mesh: [] });
    expect(gruppo.children).toHaveLength(0);
    expect(liberaGeometria).toHaveBeenCalledOnce();
    liberaGruppo(gruppo);
    expect(liberaGeometria).toHaveBeenCalledOnce();
  });
});
