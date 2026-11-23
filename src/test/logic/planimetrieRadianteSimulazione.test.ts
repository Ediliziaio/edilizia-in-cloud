/**
 * Simulazione del pavimento radiante sul trilocale demo (23/11/2026): radiante in
 * ogni stanza, collettore nel disimpegno. Le demo salvate non ne avevano, quindi
 * la parte dei circuiti pubblicata il 23/11 non era mai passata da una pianta vera.
 *
 * Controlla che lo stesso tubo dia gli stessi metri nei circuiti, nel computo e
 * nel 3D, e che i numeri stiano nelle regole di posa (UNI EN 1264: a passo 15 cm
 * ~6,7 m di tubo al m²; un circuito oltre il limite va segnalato).
 */
import { describe, expect, it } from "vitest";
import trilocale from "../../../shared/planimetrie/esempi/trilocale.json";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello";
import { circuitiRadianti, metriPosaZonaRadiante } from "../../../shared/planimetrie/circuitiRadianti";
import { zoneRadianti } from "../../../shared/planimetrie/pavimentoRadiante";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import { areaPoligono } from "../../../shared/planimetrie/geometria";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";

function conRadiante(passoCm = 15, limiteCircuitoM = 90): Planimetria {
  const p = structuredClone(trilocale) as unknown as Planimetria;
  const stato = p.livelli[0].fatto;
  const interni = stato.locali.filter((l) => !["balcone", "terrazzo", "esterno"].includes(String(l.destinazione)));
  stato.pavimentoRadiante = interni.map((l) => ({ localeId: l.id, passoCm, superficieEsclusaMq: 0 }));
  const disimpegno = stato.locali.find((l) => /disimpegno|corridoio|ingresso/i.test(l.nome)) ?? stato.locali[0];
  const xs = disimpegno.contorno.map((q) => q.x), ys = disimpegno.contorno.map((q) => q.y);
  stato.collettoreRadiante = { posizione: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) + 15 }, quotaCm: 55, limiteCircuitoM };
  return p;
}

describe("pavimento radiante sul trilocale demo", () => {
  const p = conRadiante();
  const stato = p.livelli[0].fatto;

  it("la pianta con radiante e collettore è valida", () => {
    const v = validaPlanimetria(JSON.parse(JSON.stringify(p)));
    expect("errori" in v ? v.errori : []).toEqual([]);
  });

  it("superficie e tubo stimato seguono la regola del passo (m² / passo)", () => {
    const zone = zoneRadianti(stato);
    expect(zone.length).toBeGreaterThan(3);
    for (const z of zone) {
      expect(z.superficieMq).toBeCloseTo(areaPoligono(z.locale.contorno) / 10_000, 6);
      expect(z.tuboM / z.superficieMq).toBeCloseTo(1 / 0.15, 6); // 6,67 m/m² a passo 15 cm
    }
  });

  it("i circuiti coprono ogni zona, restano vicino alla stima e segnalano quelli troppo lunghi", () => {
    const circuiti = circuitiRadianti(stato);
    const zone = zoneRadianti(stato);
    for (const z of zone) {
      const delLocale = circuiti.filter((c) => c.localeId === z.locale.id);
      expect(delLocale.length, z.locale.nome).toBeGreaterThan(0);
      const attivo = delLocale.reduce((t, c) => t + c.tuboAttivoM, 0);
      // la serpentina reale non può essere lontanissima dallo sviluppo teorico
      expect(attivo / z.tuboM, z.locale.nome).toBeGreaterThan(0.6);
      expect(attivo / z.tuboM, z.locale.nome).toBeLessThan(1.4);
      for (const c of delLocale) {
        expect(c.totaleM).toBeCloseTo(c.mandataM + c.ritornoM + c.tuboAttivoM, 1);
        expect(c.superaObiettivo).toBe(c.totaleM > 90);
      }
    }
  });

  it("computo e circuiti danno gli stessi metri di tubo", () => {
    const circuiti = circuitiRadianti(stato);
    const q = calcolaQuantita(p);
    // chiavi «<ambito>:locale:<id>.radiante_tubo_ml»: solo lo stato di fatto, dove sta il radiante
    const tuboComputo = Object.values(q).filter((v) => v.chiave.endsWith(".radiante_tubo_ml") && v.ambito === Object.values(q)
      .find((x) => x.chiave.endsWith(".radiante_tubo_ml"))!.ambito).reduce((t, v) => t + v.valore, 0);
    const circuitiComputo = Object.values(q).filter((v) => /\.radiante_circuito_\d+_ml$/.test(v.chiave) && v.ambito === Object.values(q)
      .find((x) => x.chiave.endsWith(".radiante_tubo_ml"))!.ambito).reduce((t, v) => t + v.valore, 0);
    expect(circuitiComputo).toBeCloseTo(tuboComputo, 0);
    const tuboCircuiti = zoneRadianti(stato).reduce((t, z) => t + metriPosaZonaRadiante(z.tuboM, circuiti.filter((c) => c.localeId === z.locale.id)), 0);
    expect(tuboComputo).toBeGreaterThan(0);
    expect(tuboComputo).toBeCloseTo(tuboCircuiti, 1);
  });

  it("il 3D riceve la rete radiante con il collettore", () => {
    const { fatto } = pianteDaPlanimetria(p);
    expect(fatto.reteRadiante?.collettore.quotaCm).toBe(55);
    const scena = costruisciScena(fatto, { vista: "fatto", impianti: true } as never);
    expect(scena.mesh.length).toBeGreaterThan(0);
  });

  it("passo più fitto = più tubo e più circuiti", () => {
    const fitto = conRadiante(10).livelli[0].fatto;
    const tubo = (s: typeof stato) => zoneRadianti(s).reduce((t, z) => t + z.tuboM, 0);
    expect(tubo(fitto) / tubo(stato)).toBeCloseTo(1.5, 6);
    expect(circuitiRadianti(fitto).length).toBeGreaterThanOrEqual(circuitiRadianti(stato).length);
  });
});
