import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mettiDaParteLaPaginaPreparata } from "@/lib/paginaPreparata";

/**
 * La pagina preparata dal prerender non deve mai lasciare il posto al velo
 * «Caricamento in corso…» né a una pagina bianca: resta finché quella di React
 * non è finita (c'è il footer), o ha portato altrove, o il tempo è scaduto.
 */

function paginaDiProva() {
  document.body.innerHTML = '<div id="root"><nav>menu</nav><main>contenuto</main><footer>fine</footer></div>';
  return document.getElementById("root")!;
}

const subito = (fn: () => void) => fn();

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

/** Il foglio completo come lo scrive il prerender: preload, attivato dopo. */
function foglioCompleto() {
  document.head.innerHTML =
    '<link rel="preload" as="style" href="/assets-cb3/index-prova.css" data-css-completo>';
  return document.head.querySelector("link")!;
}

describe("pagina preparata dal prerender", () => {
  it("resta visibile e #root lavora nascosto", () => {
    const root = paginaDiProva();
    const { preparata } = mettiDaParteLaPaginaPreparata(root, { prossimoFrame: subito });

    expect(preparata.textContent).toBe("menucontenutofine");
    expect(root.childElementCount).toBe(0);
    expect(root.previousElementSibling).toBe(preparata);
    expect(root.style.visibility).toBe("hidden");
    expect(root.style.position).toBe("absolute");
  });

  it("si scambia quando la pagina di React ha il footer, non prima", async () => {
    const root = paginaDiProva();
    mettiDaParteLaPaginaPreparata(root, { prossimoFrame: subito });

    root.innerHTML = "<div>Caricamento</div>";
    await Promise.resolve();
    expect(document.getElementById("pagina-preparata")).not.toBeNull();

    root.innerHTML = "<nav>menu</nav><main>contenuto</main><footer>fine</footer>";
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById("pagina-preparata")).toBeNull();
    expect(root.getAttribute("style")).toBeNull();
  });

  it("allo scadere non si scambia col velo di caricamento, ma appena il velo sparisce", () => {
    vi.useFakeTimers();
    const root = paginaDiProva();
    mettiDaParteLaPaginaPreparata(root, { attesaMassimaMs: 5000, limiteAssolutoMs: 20000, prossimoFrame: subito });

    root.innerHTML = '<div data-caricamento-pagina=""></div>';
    vi.advanceTimersByTime(5000);
    expect(document.getElementById("pagina-preparata")).not.toBeNull();

    root.innerHTML = "<main>pagina senza footer</main>";
    vi.advanceTimersByTime(1000);
    expect(document.getElementById("pagina-preparata")).toBeNull();
  });

  it("oltre il limite assoluto si scambia comunque", () => {
    vi.useFakeTimers();
    const root = paginaDiProva();
    mettiDaParteLaPaginaPreparata(root, { attesaMassimaMs: 5000, limiteAssolutoMs: 12000, prossimoFrame: subito });

    root.innerHTML = '<div data-caricamento-pagina=""></div>';
    vi.advanceTimersByTime(11000);
    expect(document.getElementById("pagina-preparata")).not.toBeNull();

    vi.advanceTimersByTime(1000);
    expect(document.getElementById("pagina-preparata")).toBeNull();
  });

  it("se React porta altrove, si scambia appena la nuova pagina non è sul velo", async () => {
    const root = paginaDiProva();
    let dove = "/";
    mettiDaParteLaPaginaPreparata(root, { prossimoFrame: subito, percorso: () => dove });

    dove = "/azienda";
    root.innerHTML = '<div data-caricamento-pagina=""></div>';
    await Promise.resolve();
    expect(document.getElementById("pagina-preparata")).not.toBeNull();

    root.innerHTML = "<aside>menu</aside><main>cruscotto</main>";
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById("pagina-preparata")).toBeNull();
  });

  it("attiva subito il foglio completo", () => {
    const foglio = foglioCompleto();
    mettiDaParteLaPaginaPreparata(paginaDiProva(), { prossimoFrame: subito, cssPronto: () => false });
    expect(foglio.rel).toBe("stylesheet");
  });

  it("con il footer pronto aspetta il foglio completo, e si scambia appena arriva", async () => {
    const foglio = foglioCompleto();
    let pronto = false;
    const root = paginaDiProva();
    mettiDaParteLaPaginaPreparata(root, { prossimoFrame: subito, cssPronto: () => pronto });

    root.innerHTML = "<nav>menu</nav><main>contenuto</main><footer>fine</footer>";
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById("pagina-preparata")).not.toBeNull();

    pronto = true;
    foglio.dispatchEvent(new Event("load"));
    expect(document.getElementById("pagina-preparata")).toBeNull();
  });

  it("allo scadere aspetta il foglio completo anche per le pagine senza footer", () => {
    vi.useFakeTimers();
    foglioCompleto();
    let pronto = false;
    const root = paginaDiProva();
    mettiDaParteLaPaginaPreparata(root, {
      attesaMassimaMs: 5000,
      limiteAssolutoMs: 20000,
      prossimoFrame: subito,
      cssPronto: () => pronto,
    });

    root.innerHTML = "<main>pagina senza footer</main>";
    vi.advanceTimersByTime(5000);
    expect(document.getElementById("pagina-preparata")).not.toBeNull();

    pronto = true;
    vi.advanceTimersByTime(1000);
    expect(document.getElementById("pagina-preparata")).toBeNull();
  });

  it("il velo delle rotte porta il segno che lo scambio riconosce", () => {
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    expect(app).toContain('data-caricamento-pagina=""');
  });

  it("main.tsx non idrata più il prerender: lo mette da parte e disegna da capo", () => {
    const main = readFileSync(resolve(__dirname, "../../main.tsx"), "utf8");
    expect(main).not.toMatch(/hydrateRoot\(/);
    expect(main).toContain("mettiDaParteLaPaginaPreparata(rootEl)");
  });
});
