/**
 * L'anteprima del disegno nel preventivatore: la versione compatta (riga del preventivo e popup) ha un riquadro di
 * altezza fissa, margini stretti dove non ci sono quote e quote più grandi; chi non la chiede (editor del listino,
 * preventivatore generico) riceve lo stesso disegno di prima.
 *
 * La classe `h-*` da sola non basta: l'SVG ha `height: auto` in linea e segue la larghezza della colonna (prima
 * 243 × 270 px per ogni disegno nella riga). Nel browser vero il riquadro compatto misura 160 px.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnteprimaDisegnoFamiglia } from "@/components/serramenti/AnteprimaDisegnoFamiglia";
import { disegnoDaConfig, type DisegnoFamiglia } from "@/lib/serramenti/disegnoDaFamiglia";

afterEach(() => cleanup());

const finestra = (): DisegnoFamiglia => {
  const d = disegnoDaConfig({ v: 1, tipologia: "finestra_2_ante" }, 1200, 1400);
  if (!d) throw new Error("disegno atteso");
  return d;
};
const persiana = (): DisegnoFamiglia => {
  const d = disegnoDaConfig({ v: 1, tipologia: "persiana:2_ante" }, 1200, 1400);
  if (!d) throw new Error("disegno atteso");
  return d;
};

const svgs = (c: HTMLElement) => [...c.querySelectorAll("svg[role=img]")] as SVGElement[];
/** Larghezza e altezza del disegno (viewBox), con i margini. */
const misure = (s: SVGElement) => (s.getAttribute("viewBox") ?? "").split(" ").map(Number).slice(2);
/** Il corpo delle quote, in unità del disegno. */
const corpoQuote = (s: SVGElement) => Number(s.querySelector("g[font-size]")?.getAttribute("font-size"));

describe("anteprima del disegno compatta", () => {
  it("serramento: due viste in un riquadro alto quanto dice `altezza`, con margini stretti e quote più grandi", () => {
    const { container: normale } = render(<AnteprimaDisegnoFamiglia disegno={finestra()} altezza="h-40" colonna />);
    const { container: compatta } = render(<AnteprimaDisegnoFamiglia disegno={finestra()} altezza="h-40" colonna compatto />);
    const n = svgs(normale);
    const c = svgs(compatta);
    expect(n).toHaveLength(2);
    expect(c).toHaveLength(2);

    // Il disegno compatto è più stretto (meno margine vuoto) e le quote hanno il corpo più grande.
    const [wN, hN] = misure(n[0]);
    const [wC, hC] = misure(c[0]);
    expect(wC).toBeLessThan(wN);
    expect(hC).toBeLessThan(hN);
    expect(corpoQuote(c[0])).toBeGreaterThan(corpoQuote(n[0]) * 1.5);

    // Il riquadro ha l'altezza della classe, e l'SVG si adatta al riquadro (non alla larghezza della colonna).
    const riquadro = c[0].parentElement as HTMLElement;
    expect(riquadro.className).toContain("h-40");
    expect(riquadro.className).toContain("[&>svg]:!h-full");
    // Le didascalie stanno su una riga piccola.
    expect(compatta.querySelector("figcaption")?.className).toContain("text-[10px]");
  });

  it("chi non lo chiede riceve lo stesso disegno di prima: SVG alto `altezza` in classe, larghezza piena, margini di sempre", () => {
    const { container } = render(<AnteprimaDisegnoFamiglia disegno={finestra()} altezza="h-56" />);
    const [s] = svgs(container);
    expect(s.getAttribute("class")).toBe("h-56 w-full");
    expect(s.parentElement?.tagName).toBe("FIGURE");
    // Margine di un decimo del lato maggiore attorno a tutto il disegno, come nel PDF.
    expect(s.getAttribute("viewBox")).toBe("-140 -140 1550 1722");
    expect(container.querySelector("figcaption")?.className).toBe("text-xs text-muted-foreground");
  });

  it("anche la persiana (vista da fuori e da dentro) si disegna compatta", () => {
    const { container } = render(<AnteprimaDisegnoFamiglia disegno={persiana()} altezza="h-40" compatto />);
    expect(svgs(container)).toHaveLength(2);
    for (const s of svgs(container)) expect(s.parentElement?.className).toContain("h-40");
  });
});
