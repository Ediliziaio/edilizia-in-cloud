import { describe, it, expect } from "vitest";
import { markdownSempliceToHtml, sembraMarkdown } from "@/lib/markdownSemplice";

describe("markdown semplice → HTML per l'editor delle condizioni", () => {
  it("titoli, elenchi, paragrafi e grassetto", () => {
    const html = markdownSempliceToHtml("# Condizioni\n\n## 1. Oggetto\nTesto con **rilievo**.\n\n- prima\n- seconda\n\nAltro paragrafo");
    expect(html).toBe("<h2>Condizioni</h2>\n<h3>1. Oggetto</h3>\n<p>Testo con <strong>rilievo</strong>.</p>\n<ul>\n<li>prima</li>\n<li>seconda</li>\n</ul>\n<p>Altro paragrafo</p>");
  });
  it("escapa l'HTML in ingresso e conserva i merge tag", () => {
    expect(markdownSempliceToHtml("Ciao <b>{{cliente.nome_completo}}</b>")).toBe("<p>Ciao &lt;b&gt;{{cliente.nome_completo}}&lt;/b&gt;</p>");
  });
  it("riconosce markdown vs HTML", () => {
    expect(sembraMarkdown("# Titolo\ntesto")).toBe(true);
    expect(sembraMarkdown("<h2>Titolo</h2><p>testo</p>")).toBe(false);
    expect(sembraMarkdown("solo testo piatto")).toBe(false);
  });
});
