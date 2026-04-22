// ============================================================================
// emailTemplatePlaceholders.test — substitution + extraction + plain-text
// ============================================================================
// Copre il resolver client-side pure-TS di `_shared/email-templates/`.
// Il resolver DB-first (resolveTemplate.ts) non è qui: richiede un client
// Supabase mock, coperto da integration test separati.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  applyPlaceholders,
  extractPlaceholderKeys,
  htmlToPlainText,
} from "@/lib/emailTemplates";
import { TEMPLATE_META, EDITABLE_TEMPLATE_KEYS, getTemplateMeta } from "@/lib/emailTemplates";

describe("applyPlaceholders", () => {
  it("sostituisce un placeholder semplice", () => {
    expect(applyPlaceholders("Ciao {{nome}}", { nome: "Marco" }, false)).toBe(
      "Ciao Marco",
    );
  });

  it("tollera whitespace interno", () => {
    expect(applyPlaceholders("Ciao {{ nome }}", { nome: "Marco" }, false)).toBe(
      "Ciao Marco",
    );
  });

  it("sostituisce placeholder multipli anche ripetuti", () => {
    const tpl = "{{a}} e {{b}} e ancora {{a}}";
    expect(applyPlaceholders(tpl, { a: "X", b: "Y" }, false)).toBe(
      "X e Y e ancora X",
    );
  });

  it("lascia intatto il placeholder se il valore manca", () => {
    expect(applyPlaceholders("Ciao {{nome}}", {}, false)).toBe("Ciao {{nome}}");
  });

  it("lascia intatto il placeholder se il valore è null o undefined", () => {
    expect(applyPlaceholders("Ciao {{nome}}", { nome: null }, false)).toBe(
      "Ciao {{nome}}",
    );
    expect(applyPlaceholders("Ciao {{nome}}", { nome: undefined }, false)).toBe(
      "Ciao {{nome}}",
    );
  });

  it("coerce numeri a stringa", () => {
    expect(applyPlaceholders("Scadenza {{giorni}} gg", { giorni: 5 }, false)).toBe(
      "Scadenza 5 gg",
    );
  });

  it("escape HTML quando escape=true per prevenire injection", () => {
    const malicious = "<script>alert(1)</script>";
    const out = applyPlaceholders("Nome: {{nome}}", { nome: malicious }, true);
    expect(out).toBe("Nome: &lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("NON escape quando escape=false (per subject/text_body)", () => {
    const out = applyPlaceholders("Oggetto <test> {{v}}", { v: "x & y" }, false);
    // Il template resta intatto, il valore non è escapato
    expect(out).toBe("Oggetto <test> x & y");
  });

  it("gestisce apostrofi e virgolette", () => {
    const out = applyPlaceholders("{{n}}", { n: `O'Brien "test"` }, true);
    expect(out).toContain("O&#39;Brien");
    expect(out).toContain("&quot;test&quot;");
  });

  it("NON tocca testo senza placeholder", () => {
    expect(applyPlaceholders("Nessun placeholder qui.", { a: 1 }, true)).toBe(
      "Nessun placeholder qui.",
    );
  });

  it("rifiuta chiavi con caratteri non validi (pattern identifier TS)", () => {
    // {{foo-bar}} non è matchato: resta letterale
    expect(applyPlaceholders("{{foo-bar}}", { "foo-bar": "x" }, false)).toBe(
      "{{foo-bar}}",
    );
  });
});

describe("extractPlaceholderKeys", () => {
  it("estrae una singola chiave", () => {
    expect(extractPlaceholderKeys("Ciao {{nome}}")).toEqual(["nome"]);
  });

  it("estrae chiavi multiple distinte", () => {
    const keys = extractPlaceholderKeys("{{a}} {{b}} {{c}}");
    expect(keys.sort()).toEqual(["a", "b", "c"]);
  });

  it("deduplica chiavi ripetute", () => {
    expect(extractPlaceholderKeys("{{a}} e ancora {{a}}")).toEqual(["a"]);
  });

  it("ignora pattern malformati", () => {
    expect(extractPlaceholderKeys("{{}} {nome} {{-bad}}")).toEqual([]);
  });

  it("tollera whitespace interno", () => {
    expect(extractPlaceholderKeys("{{ a }} {{  b  }}")).toEqual(["a", "b"]);
  });
});

describe("htmlToPlainText", () => {
  it("strippa tag HTML base", () => {
    expect(htmlToPlainText("<p>Ciao <strong>Marco</strong></p>")).toBe(
      "Ciao Marco",
    );
  });

  it("converte <br> in newline", () => {
    expect(htmlToPlainText("riga1<br>riga2<br/>riga3")).toBe(
      "riga1\nriga2\nriga3",
    );
  });

  it("converte </p> in doppio newline", () => {
    const out = htmlToPlainText("<p>par1</p><p>par2</p>");
    expect(out).toContain("par1");
    expect(out).toContain("par2");
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(2);
  });

  it("decodifica entity HTML comuni", () => {
    expect(htmlToPlainText("<p>R&amp;D &quot;test&quot;</p>")).toBe(
      `R&D "test"`,
    );
  });

  it("collassa whitespace eccessivo", () => {
    const html = "<p>uno</p>\n\n\n\n<p>due</p>";
    const out = htmlToPlainText(html);
    expect(out.match(/\n{3,}/)).toBeNull();
  });

  it("trim finale", () => {
    expect(htmlToPlainText("   <p>testo</p>   ")).toBe("testo");
  });
});

describe("TEMPLATE_META registry", () => {
  it("contiene tutti i 9 template attesi (7 Fase 1 + 2 Fase 2)", () => {
    expect(EDITABLE_TEMPLATE_KEYS.sort()).toEqual(
      [
        "account_verify",
        "ddt_sent",
        "invoice_due_soon",
        "invoice_sent",
        "password_reset",
        "payment_received",
        "quote_sent",
        "user_invited",
        "welcome",
      ].sort(),
    );
  });

  it("ogni template ha label, descrizione e placeholders non vuoti", () => {
    for (const key of EDITABLE_TEMPLATE_KEYS) {
      const meta = TEMPLATE_META[key];
      expect(meta, `Meta per ${key}`).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.placeholders.length).toBeGreaterThan(0);
    }
  });

  it("getTemplateMeta restituisce null per chiavi sconosciute", () => {
    expect(getTemplateMeta("unknown_key")).toBeNull();
    expect(getTemplateMeta("")).toBeNull();
  });

  it("ogni placeholder required ha un esempio e un label", () => {
    for (const key of EDITABLE_TEMPLATE_KEYS) {
      const meta = TEMPLATE_META[key];
      for (const ph of meta.placeholders) {
        expect(ph.key, `Placeholder key in ${key}`).toMatch(
          /^[a-zA-Z_][a-zA-Z0-9_]*$/,
        );
        expect(ph.label.length).toBeGreaterThan(0);
        expect(ph.example.length).toBeGreaterThan(0);
      }
    }
  });

  it("mockProps include tutti i placeholder required", () => {
    for (const key of EDITABLE_TEMPLATE_KEYS) {
      const meta = TEMPLATE_META[key];
      const requiredKeys = meta.placeholders.filter((p) => p.required).map((p) => p.key);
      for (const reqKey of requiredKeys) {
        expect(
          meta.mockProps[reqKey],
          `mockProps[${reqKey}] per template ${key}`,
        ).toBeDefined();
      }
    }
  });
});

describe("integrazione applyPlaceholders + TEMPLATE_META", () => {
  it("rende correttamente un welcome HTML di esempio con mock props", () => {
    const meta = TEMPLATE_META.welcome;
    const html = `<h1>Benvenuto {{recipientName}} in {{companyName}}</h1><a href="{{loginUrl}}">Accedi</a>`;
    const out = applyPlaceholders(html, meta.mockProps, true);
    expect(out).toContain("Benvenuto Marco in Rossi Costruzioni SRL");
    expect(out).toContain(`href="https://app.ediliziaincloud.it/login"`);
    expect(out).not.toContain("{{");
  });

  it("escape placeholder con XSS tentativo", () => {
    const html = `<p>{{nome}}</p>`;
    const out = applyPlaceholders(
      html,
      { nome: `<img src=x onerror=alert(1)>` },
      true,
    );
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
});

describe("nuovi template Fase 2 (account_verify, payment_received)", () => {
  it("account_verify ha tutti i placeholder required + mock", () => {
    const meta = TEMPLATE_META.account_verify;
    expect(meta.label).toContain("Conferma");
    const required = meta.placeholders
      .filter((p) => p.required)
      .map((p) => p.key);
    expect(required).toContain("recipientName");
    expect(required).toContain("verifyUrl");
    expect(meta.mockProps.verifyUrl).toMatch(/^https?:\/\//);
  });

  it("payment_received ha placeholder principali + mock URL ricevuta", () => {
    const meta = TEMPLATE_META.payment_received;
    expect(meta.label).toContain("Pagamento");
    const keys = meta.placeholders.map((p) => p.key);
    expect(keys).toContain("invoiceNumber");
    expect(keys).toContain("amountFormatted");
    expect(keys).toContain("paidAtFormatted");
    // receiptUrl è opzionale ma deve comunque essere nel mock
    expect(meta.mockProps.receiptUrl).toMatch(/^https?:\/\//);
  });

  it("template con html_body custom applica placeholder senza lasciare token", () => {
    const meta = TEMPLATE_META.account_verify;
    const html = `<p>Ciao {{recipientName}}, conferma qui: <a href="{{verifyUrl}}">link</a> (valido {{expiresIn}}).</p>`;
    const out = applyPlaceholders(html, meta.mockProps, true);
    expect(out).not.toContain("{{");
    expect(out).toContain("href=\"https://");
  });
});

describe("stabilità registry (non regressione key → meta)", () => {
  it("ogni chiave registrata punta a meta definito", () => {
    for (const key of EDITABLE_TEMPLATE_KEYS) {
      expect(TEMPLATE_META[key]).toBeDefined();
      expect(TEMPLATE_META[key].placeholders.length).toBeGreaterThan(0);
    }
  });

  it("non esiste chiave duplicata in EDITABLE_TEMPLATE_KEYS", () => {
    const set = new Set(EDITABLE_TEMPLATE_KEYS);
    expect(set.size).toBe(EDITABLE_TEMPLATE_KEYS.length);
  });

  it("getTemplateMeta è consistente con TEMPLATE_META", () => {
    for (const key of EDITABLE_TEMPLATE_KEYS) {
      expect(getTemplateMeta(key)).toEqual(TEMPLATE_META[key]);
    }
  });
});
