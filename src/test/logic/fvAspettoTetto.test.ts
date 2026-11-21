import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { aspettoTettoFv, azimutVistaTettoFv } from "../../../supabase/functions/_shared/fvAspettoTetto";
import { creaDisegnoTetto, disponiModuliAutomaticamente, leggiDisegnoCommerciale } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { geometriaTettoDocumento, svgTettoDocumento } from "../../../supabase/functions/_shared/fvTettoDocumento";
import { distanzaCameraTettoFv } from "../../components/fotovoltaico/tetto/materialiTetto3d";
import { pianoDaMappaFv } from "../../components/fotovoltaico/tetto/mappaGeometria";

describe("Aspetto del tetto separato dalla geometria", () => {
  it("riapre il materiale salvato e mantiene compatibili i disegni precedenti", () => {
    const p = creaDisegnoTetto("due_falde");
    for (const copertura of ["tegole", "antracite", "lamiera"] as const) {
      const q = { ...p, schema3d: { altezza: 5.5, pendenza: 25, copertura } };
      expect(leggiDisegnoCommerciale(JSON.parse(JSON.stringify(q)))?.schema3d).toEqual(q.schema3d);
    }
    expect(leggiDisegnoCommerciale({ ...p, schema3d: { altezza: 5.5, pendenza: 25, copertura: "<script>" } })?.schema3d).toEqual({ altezza: 5.5, pendenza: 25 });
    expect(aspettoTettoFv(undefined, true).tipo).toBe("lamiera");
    expect(aspettoTettoFv().tipo).toBe("tegole");
  });

  it("cambia solo il materiale: contorni e vertici dei moduli restano identici nel PDF", () => {
    const piano = disponiModuliAutomaticamente(pianoDaMappaFv({ versione: 1, origine: { lat: 45, lng: 9 }, ricerca: { indirizzo: "Collaudo", posizione: { lat: 45, lng: 9 } }, distanzaOstacoli: .3, falde: [{ id: "sud", nome: "Sud", inclinazione: 27, azimut: 165, inclinazioneStimata: true, punti: [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 4 }, { x: -6, y: 4 }] }] }, { corto: 1.134, lungo: 2.278, stimato: false }), 5);
    const originale = JSON.stringify(piano);
    const prima = geometriaTettoDocumento(piano)!;
    const q = leggiDisegnoCommerciale({ ...piano, schema3d: { altezza: 8, pendenza: 20, copertura: "antracite" } })!;
    const dopo = geometriaTettoDocumento(q)!;
    expect(dopo.pannelli).toEqual(prima.pannelli);
    expect(dopo.falde.map(f => f.punti)).toEqual(prima.falde.map(f => f.punti));
    expect(JSON.stringify(piano)).toBe(originale);
    const svg = svgTettoDocumento(dopo, "3d");
    expect(svg.match(/data-fv-panel=/g)).toHaveLength(5);
    expect(svg.match(/data-fv-cells=/g)).toHaveLength(5);
    expect(svg).toContain("<pattern");
    expect(svg).not.toMatch(/NaN|Infinity|<script|<image/);
    expect(svgTettoDocumento(dopo, "pianta")).toBe(svgTettoDocumento(prima, "pianta"));
  });

  it("inquadra la falda con i moduli anche se un’altra falda è più grande", () => {
    expect(azimutVistaTettoFv([{ id: "nord", area: 100, azimut: 0 }, { id: "sud", area: 40, azimut: 180 }], [{ faldaId: "sud" }])).toBe(205);
  });

  it.each([.55, 1, 2, 3.5])("contiene l’edificio anche con rapporto larghezza/altezza %s", aspect => {
    const box = new THREE.Box3(new THREE.Vector3(-8, 0, -6), new THREE.Vector3(7, 8.5, 7));
    for (const dir of [new THREE.Vector3(.3, .9, 1).normalize(), new THREE.Vector3(0, 1, .00001).normalize()]) {
      const camera = new THREE.PerspectiveCamera(36, aspect, .05, 10000), centro = box.getCenter(new THREE.Vector3());
      camera.position.copy(centro).addScaledVector(dir, distanzaCameraTettoFv(box, dir, camera.fov, aspect));
      camera.lookAt(centro); camera.updateMatrixWorld();
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1);
        expect(p.z).toBeGreaterThan(-1); expect(p.z).toBeLessThan(1);
      }
    }
  });
});
