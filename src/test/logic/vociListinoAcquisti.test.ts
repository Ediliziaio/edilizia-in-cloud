import { describe, expect, it, vi } from "vitest";

const evento = vi.hoisted(() => ({
  famiglia: {
    id: "lastra", nome: "Lastra cartongesso", company_id: "azienda-1",
    codice: "ed-lastra-standard", prezzo_base_acquisto: null as null, prezzo_base_vendita: 0, unit_of_measure: "mq",
    vat_rate: 22, attivo: true, mostra_preventivo: false, deleted_at: null as null,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const filtri = new Map<string, unknown>();
      const risposta = {
        select: () => risposta,
        eq: (campo: string, valore: unknown) => { filtri.set(campo, valore); return risposta; },
        is: (campo: string, valore: unknown) => { filtri.set(campo, valore); return risposta; },
        order: () => risposta,
        limit: () => risposta,
        then: (risolvi: (esito: { data: unknown[]; error: null }) => unknown) =>
          risolvi({
            data: tabella === "article_families" && Array.from(filtri).every(([campo, valore]) => evento.famiglia[campo as keyof typeof evento.famiglia] === valore)
              ? [evento.famiglia] : [],
            error: null,
          }),
      };
      return risposta;
    },
  },
}));

import { caricaVociListino } from "@/lib/listino/vociListino";

describe("articoli dei modelli ancora da prezzare", () => {
  it("li propone per preparare un acquisto con l'unità originale, lasciando il costo da definire", async () => {
    await expect(caricaVociListino("azienda-1", { uso: "acquisto" })).resolves.toMatchObject([
      { name: "Lastra cartongesso", family_id: "lastra", sku: "ed-lastra-standard", unit_of_measure: "mq", standard_cost: 0 },
    ]);
    await expect(caricaVociListino("altra-azienda", { uso: "acquisto" })).resolves.toEqual([]);
  });

  it("applica la visibilità del preventivo nelle ricerche di vendita", async () => {
    await expect(caricaVociListino("azienda-1")).resolves.toEqual([]);
    await expect(caricaVociListino("azienda-1", { uso: "vendita" })).resolves.toEqual([]);
  });
});
