import { describe, expect, it } from "vitest";

const validatorPath = "../../../scripts/validate-jsonld.mjs";
const { validateJsonLd } = await import(/* @vite-ignore */ validatorPath) as {
  validateJsonLd: (html: string) => string[];
};

const script = (data: string) => `<script id="jsonld-howto" type="application/ld+json">${data}</script>`;

describe("integrità JSON-LD dell'HTML pubblicabile", () => {
  it("riproduce e rifiuta il frammento troncato presente nella scansione Google del 20 ottobre", () => {
    const malformed = '{"@context":"https://schema.org","@type":"HowTo","step":[{"@type":"HowToStep","text":"Ferie e permessi: la Cassa raccoglie l\'accant';
    const html = script(malformed) + '<style type="text/css">[data-sonner-toaster]{display:block}</style>';
    const errors = validateJsonLd(html);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("#jsonld-howto");
  });
  it("controlla tutti gli script e non solo il primo valido", () => {
    expect(validateJsonLd(script('{"@type":"Article"}') + script('{"@type":'))).toHaveLength(1);
  });
  it("accetta grafi e oggetti completi con tipi di attributo HTML diversi", () => {
    const html = `<script TYPE='application/ld+json'>{"@context":"https://schema.org","@graph":[{"@type":"Article"}]}</script>` +
      `<script type=application/ld+json>[{"@type":"BreadcrumbList"}]</script>`;
    expect(validateJsonLd(html)).toEqual([]);
  });
  it.each(["null", '"testo"', "42", "true"])("rifiuta un valore radice del tipo errato: %s", (data) => {
    expect(validateJsonLd(script(data))).toHaveLength(1);
  });
  it("rifiuta uno script rimasto aperto", () => {
    expect(validateJsonLd('<script type="application/ld+json">{"name":"incompleto')).toHaveLength(1);
  });
  it("ignora gli script JavaScript normali", () => {
    expect(validateJsonLd('<script>window.app = { boot: true };</script>')).toEqual([]);
  });
});
