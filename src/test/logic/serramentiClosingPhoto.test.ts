import { describe, expect, it } from "vitest";
import { completeSerramentiEdition } from "@/lib/moduli-vendita/fullSerramentiFactory";
import { avvolgibiliContent } from "@/lib/moduli-vendita/fullAvvolgibiliModule";

describe("Avvolgibili: soggetto della chiusura", () => {
  it("resta esplicito anche se cambia l'ordine della libreria", () => {
    const template = completeSerramentiEdition({}, {}, {
      ...avvolgibiliContent,
      images: [{ url: "/pdf-stock/comune/consegna-documenti.jpg", name: "Documenti" }],
    });
    expect(template.pdf_blocchi?.pagina_cta).toEqual({ foto: ["/module-art/serramenti-avvolgibili-cover.jpg"] });
    expect((template.pdf_blocchi?.modulo_defaults as Record<string, unknown>).pagina_cta).toEqual(template.pdf_blocchi?.pagina_cta);
  });
});
