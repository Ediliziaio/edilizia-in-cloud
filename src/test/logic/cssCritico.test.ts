import { describe, expect, it } from "vitest";
import { cssCritico, daCercare, preparaFoglio } from "../../../scripts/cssCritico.mjs";

/**
 * Il CSS che il prerender mette dentro ogni pagina: le sole regole che servono
 * agli elementi presenti, col testo del foglio originale.
 */

const FOGLIO =
  ".a{color:red}.b{color:blue}" +
  ".hover\\:bg-x:hover{background:red}.group:hover .group-hover\\:y{color:green}" +
  ".testo-sfumato{-webkit-background-clip:text;background-clip:text}" +
  "button::-moz-focus-inner{border:0}" +
  "@media (min-width:768px){.md\\:flex{display:flex}.c{color:gray}}" +
  "@media (min-width:1024px){.d{color:black}}" +
  "@keyframes giro{0%{opacity:0}to{opacity:1}}";

describe("CSS critico di una pagina", () => {
  it("cerca i selettori senza stati e pseudo-elementi, ma non tocca i nomi di classe", () => {
    expect(daCercare(".hover\\:bg-x:hover")).toBe(".hover\\:bg-x");
    expect(daCercare(".group:hover .group-hover\\:y")).toBe(".group .group-hover\\:y");
    expect(daCercare(".focus\\:ring:focus-visible")).toBe(".focus\\:ring");
    expect(daCercare("button::-moz-focus-inner")).toBe("button");
    expect(daCercare("::selection")).toBe("");
  });

  it("tiene solo le regole che servono, anche dentro le @media, e sempre i @keyframes", () => {
    const foglio = preparaFoglio(FOGLIO, "/assets-cb3/index-prova.css");
    const servono = new Set([".a", ".hover\\:bg-x", ".group .group-hover\\:y", ".md\\:flex", ".testo-sfumato", "button"]);
    const css = cssCritico(foglio, servono);

    expect(css).toContain(".a{color:red}");
    expect(css).not.toContain(".b{");
    expect(css).toContain(".hover\\:bg-x:hover{background:red}");
    expect(css).toContain(".group:hover .group-hover\\:y{color:green}");
    expect(css).toContain("@media (min-width:768px){.md\\:flex{display:flex}}");
    expect(css).not.toContain(".c{");
    expect(css).not.toContain("min-width:1024px");
    expect(css).toContain("@keyframes giro{0%{opacity:0}to{opacity:1}}");
  });

  it("copia il testo originale: le varianti per Safari e Firefox restano", () => {
    const foglio = preparaFoglio(FOGLIO, "/assets-cb3/index-prova.css");
    const css = cssCritico(foglio, new Set([".testo-sfumato", "button"]));
    expect(css).toContain("-webkit-background-clip:text");
    expect(css).toContain("button::-moz-focus-inner{border:0}");
  });

  it("i percorsi relativi in url() valgono dal foglio, non dalla pagina", () => {
    const foglio = preparaFoglio(".x{background:url(img/a.png)}.y{background:url(/fonts/b.png)}", "/assets-cb3/index-prova.css");
    const css = cssCritico(foglio, new Set([".x", ".y"]));
    expect(css).toContain("url(/assets-cb3/img/a.png)");
    expect(css).toContain("url(/fonts/b.png)");
  });

  it("ogni selettore da cercare compare una volta sola", () => {
    const foglio = preparaFoglio(".a{color:red}.a:hover{color:blue}", "/assets-cb3/index-prova.css");
    expect(foglio.selettori).toEqual([".a"]);
  });
});
