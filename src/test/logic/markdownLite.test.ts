import { describe, it, expect } from "vitest";
import { renderMarkdownLite, sanitizeUrl } from "@/lib/utils/markdownLite";

/**
 * Test del renderer Markdown minimale usato dal ChangelogDrawer
 * (src/lib/utils/markdownLite.ts). Esercita il CODICE DI PRODUZIONE che
 * trasforma il body_md del changelog in HTML iniettato via
 * dangerouslySetInnerHTML nel browser di TUTTI gli utenti.
 *
 * Focus: anti-XSS (attribute breakout + schemi pericolosi) e correttezza
 * delle trasformazioni inline.
 */

describe("sanitizeUrl — whitelist degli schemi", () => {
  it("ammette http(s), mailto, tel, path relativi e anchor", () => {
    expect(sanitizeUrl("https://edilizia.cloud")).toBe("https://edilizia.cloud");
    expect(sanitizeUrl("http://x.it")).toBe("http://x.it");
    expect(sanitizeUrl("mailto:info@x.it")).toBe("mailto:info@x.it");
    expect(sanitizeUrl("tel:+39000")).toBe("tel:+39000");
    expect(sanitizeUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeUrl("#sezione")).toBe("#sezione");
  });

  it("neutralizza javascript:, data:, vbscript: e schemi sconosciuti → #", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("#");
    expect(sanitizeUrl("JavaScript:alert(1)")).toBe("#");
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("#");
    expect(sanitizeUrl("  javascript:alert(1)")).toBe("#"); // con spazi iniziali
  });
});

describe("renderMarkdownLite — anti-XSS", () => {
  it("escapa < > & così non si possono iniettare tag", () => {
    const html = renderMarkdownLite("<script>alert(1)</script> & <img src=x>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("escapa le virgolette: niente attribute breakout dall'href del link", () => {
    // URL malevolo che TENTA di chiudere href e iniettare un event handler.
    // Lo schema è https:// quindi sanitizeUrl lo lascia passare: l'unica difesa
    // è l'escaping di " (→ &quot;) PRIMA dell'inserimento in href="...".
    const html = renderMarkdownLite('[clic](https://ok.it" onmouseover="alert(1))');
    expect(html).not.toContain('onmouseover="'); // niente handler iniettato
    expect(html).not.toContain('"alert(1)'); // niente breakout
    expect(html).toContain("&quot;"); // la " è stata neutralizzata
  });

  it("converte un link javascript: in href='#'", () => {
    const html = renderMarkdownLite("[x](javascript:alert(1))");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
  });

  it("neutralizza apici singoli (difesa in profondità)", () => {
    expect(renderMarkdownLite("l'utente")).toContain("&#39;");
  });
});

describe("renderMarkdownLite — trasformazioni inline", () => {
  it("rende **bold** e `code`", () => {
    expect(renderMarkdownLite("**ciao**")).toContain("<strong>ciao</strong>");
    expect(renderMarkdownLite("`x`")).toContain("<code");
  });

  it("rende un link benigno con attributi di sicurezza", () => {
    const html = renderMarkdownLite("[sito](https://edilizia.cloud)");
    expect(html).toContain('href="https://edilizia.cloud"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">sito</a>");
  });

  it("preserva gli ampersand nelle query string come &amp; (HTML valido)", () => {
    const html = renderMarkdownLite("[q](https://x.it?a=1&b=2)");
    expect(html).toContain("https://x.it?a=1&amp;b=2");
  });

  it("gestisce a-capo singoli (<br/>) e doppi (paragrafi)", () => {
    expect(renderMarkdownLite("riga1\nriga2")).toContain("riga1<br/>riga2");
    const para = renderMarkdownLite("p1\n\np2");
    expect(para).toContain("</p><p>");
    expect(para.startsWith("<p>")).toBe(true);
    expect(para.endsWith("</p>")).toBe(true);
  });
});
