import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { disegnoInDxf, disegnoInSvg, prospetto, sezione, type Lato } from "@/lib/planimetrie/prospetti";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const carica = (nome: string): Planimetria => JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));

describe.each(["bilocale.json", "trilocale.json"])("prospetti e sezioni di %s (fase 6)", (nome) => {
  const stato = carica(nome).livelli[0].fatto;
  const xs = stato.muri.flatMap((m) => [m.p1.x, m.p2.x]);
  const ys = stato.muri.flatMap((m) => [m.p1.y, m.p2.y]);

  it.each(["sud", "nord", "est", "ovest"] as Lato[])("prospetto %s: pareti esterne alte quanto i muri, con le aperture di quel lato", (lato) => {
    const d = prospetto(stato, lato);
    const muri = d.primitive.filter((p) => p.tipo === "rett" && p.stile === "muro");
    expect(muri.length).toBeGreaterThan(0);
    const larghezzaAttesa = lato === "sud" || lato === "nord" ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys);
    const larghezza = Math.max(...muri.map((p) => (p.tipo === "rett" ? p.u2 : 0))) - Math.min(...muri.map((p) => (p.tipo === "rett" ? p.u1 : 0)));
    // il filo esterno aggiunge al massimo uno spessore di muro
    expect(larghezza).toBeGreaterThanOrEqual(larghezzaAttesa - 1);
    expect(larghezza).toBeLessThanOrEqual(larghezzaAttesa + 61);
    expect(d.maxZ).toBeGreaterThanOrEqual(Math.max(...stato.muri.map((m) => m.altezza)));
  });

  it("le finestre dei lati compaiono nei prospetti", () => {
    const tutte = (["sud", "nord", "est", "ovest"] as Lato[]).flatMap((l) => prospetto(stato, l).primitive.filter((p) => p.tipo === "rett" && (p.stile === "vetro" || p.stile === "porta" || p.stile === "vano")));
    expect(tutte.length).toBeGreaterThan(0);
  });

  it("una sezione a metà taglia almeno due pareti", () => {
    const meta = (Math.min(...ys) + Math.max(...ys)) / 2 + 3;
    const d = sezione(stato, { asse: "orizzontale", valore: meta });
    expect(d.primitive.filter((p) => p.tipo === "rett" && p.stile === "taglio").length).toBeGreaterThanOrEqual(2);
  });

  it("SVG in scala e DXF a layer", () => {
    const d = prospetto(stato, "sud");
    const { svg, larghezzaMm } = disegnoInSvg(d, 50);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(larghezzaMm).toBeCloseTo((d.maxU - d.minU) / 5 + 24, 1);
    const dxf = new TextDecoder().decode(disegnoInDxf(d));
    expect(dxf).toContain("PROSPETTO");
    expect(dxf).toContain("EOF");
  });
});
