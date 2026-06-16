import { describe, it, expect } from "vitest";
import {
  renderTemplate, hashSeed, extractVariables, contactToVars, htmlToPlainText,
} from "../../../supabase/functions/_shared/outreach-template";

describe("renderTemplate — variabili", () => {
  it("sostituisce una variabile presente", () => {
    expect(renderTemplate("Ciao {{first_name}}", { first_name: "Mario" })).toBe("Ciao Mario");
  });
  it("gestisce spazi interni", () => {
    expect(renderTemplate("Ciao {{ first_name }}", { first_name: "Anna" })).toBe("Ciao Anna");
  });
  it("usa il fallback se vuota o assente", () => {
    expect(renderTemplate("Ciao {{first_name|amico}}", {})).toBe("Ciao amico");
    expect(renderTemplate("Ciao {{first_name|amico}}", { first_name: "" })).toBe("Ciao amico");
  });
  it("variabile mancante senza fallback → ripulisce", () => {
    expect(renderTemplate("Ciao {{first_name}}!", {})).toBe("Ciao!");
  });
  it("più variabili", () => {
    expect(renderTemplate("{{first_name}} di {{company_name}}", { first_name: "Luca", company_name: "Verdi Srl" }))
      .toBe("Luca di Verdi Srl");
  });
});

describe("renderTemplate — spintax", () => {
  it("sceglie per seed", () => {
    expect(renderTemplate("{Ciao|Salve|Buongiorno}", {}, { seed: 0 })).toBe("Ciao");
    expect(renderTemplate("{Ciao|Salve|Buongiorno}", {}, { seed: 1 })).toBe("Salve");
    expect(renderTemplate("{Ciao|Salve|Buongiorno}", {}, { seed: 2 })).toBe("Buongiorno");
  });
  it("wrappa con il modulo", () => {
    expect(renderTemplate("{a|b}", {}, { seed: 3 })).toBe("b"); // 3 % 2 = 1
  });
  it("non tocca le graffe singole senza pipe", () => {
    expect(renderTemplate("prezzo {speciale}", {})).toBe("prezzo {speciale}");
  });
  it("combina variabili e spintax", () => {
    expect(renderTemplate("{Ciao|Salve} {{first_name|}}, novità?", { first_name: "Sara" }, { seed: 0 }))
      .toBe("Ciao Sara, novità?");
  });
});

describe("hashSeed — stabile per contatto", () => {
  it("deterministico", () => {
    expect(hashSeed("mario@x.it")).toBe(hashSeed("mario@x.it"));
  });
  it("diverso per input diversi (in genere)", () => {
    expect(hashSeed("a@x.it")).not.toBe(hashSeed("b@x.it"));
  });
  it("non negativo", () => {
    expect(hashSeed("qualunque")).toBeGreaterThanOrEqual(0);
  });
});

describe("extractVariables", () => {
  it("elenca le variabili uniche", () => {
    expect(extractVariables("{{first_name}} {{company_name}} {{first_name}}").sort())
      .toEqual(["company_name", "first_name"]);
  });
  it("vuoto se nessuna", () => {
    expect(extractVariables("nessuna variabile")).toEqual([]);
  });
});

describe("contactToVars", () => {
  it("mappa i campi standard, null → stringa vuota", () => {
    expect(contactToVars({ first_name: "Mario", last_name: null, company_name: "X", email: "m@x.it" }))
      .toEqual({ first_name: "Mario", last_name: "", company_name: "X", email: "m@x.it", phone: "" });
  });
});

describe("htmlToPlainText — text/plain cold-aware (deliverability)", () => {
  it("strippa i tag e mantiene il testo", () => {
    expect(htmlToPlainText("<p>Ciao <strong>Marco</strong></p>")).toBe("Ciao Marco");
  });

  it("input vuoto/null → stringa vuota", () => {
    expect(htmlToPlainText("")).toBe("");
    expect(htmlToPlainText(null)).toBe("");
    expect(htmlToPlainText(undefined)).toBe("");
  });

  it("<br> e </p> diventano a-capo", () => {
    expect(htmlToPlainText("riga1<br>riga2<br/>riga3")).toBe("riga1\nriga2\nriga3");
    const out = htmlToPlainText("<p>par1</p><p>par2</p>");
    expect(out).toContain("par1");
    expect(out).toContain("par2");
    expect(out.includes("\n")).toBe(true);
  });

  it("MANTIENE l'URL dei link come 'testo (url)'", () => {
    const out = htmlToPlainText('Vuoi annullare? <a href="https://x.it/u?rid=1">Disiscriviti</a>.');
    expect(out).toContain("https://x.it/u?rid=1");
    expect(out).toContain("Disiscriviti (https://x.it/u?rid=1)");
  });

  it("se il testo dell'anchor È l'URL non lo duplica", () => {
    const out = htmlToPlainText('<a href="https://x.it/y">https://x.it/y</a>');
    expect(out).toBe("https://x.it/y");
  });

  it("anchor con href in apici singoli e attributi extra", () => {
    const out = htmlToPlainText("<a style='color:#999' href='https://x.it/z'>clicca</a>");
    expect(out).toBe("clicca (https://x.it/z)");
  });

  it("ignora ancore non navigabili (#, javascript:) tenendo solo il testo", () => {
    expect(htmlToPlainText('<a href="#">salta</a>')).toBe("salta");
    expect(htmlToPlainText('<a href="javascript:void(0)">x</a>')).toBe("x");
  });

  it("decodifica le entità comuni", () => {
    expect(htmlToPlainText('<p>R&amp;D &quot;test&quot; &lt;ok&gt;</p>')).toBe('R&D "test" <ok>');
    expect(htmlToPlainText("<p>l&#39;impresa</p>")).toBe("l'impresa");
  });

  it("rimuove del tutto script/style e commenti", () => {
    const out = htmlToPlainText("<style>.a{color:red}</style><p>visibile</p><!-- nota -->");
    expect(out).toBe("visibile");
  });

  it("collassa whitespace e a-capo multipli, trim finale", () => {
    const out = htmlToPlainText("   <p>uno</p>\n\n\n\n<p>due</p>   ");
    expect(out.match(/\n{3,}/)).toBeNull();
    expect(out.startsWith(" ")).toBe(false);
    expect(out.endsWith(" ")).toBe(false);
  });

  it("è pura/deterministica: stesso input → stesso output", () => {
    const html = '<p>Ciao</p><a href="https://x.it">qui</a>';
    expect(htmlToPlainText(html)).toBe(htmlToPlainText(html));
  });
});
