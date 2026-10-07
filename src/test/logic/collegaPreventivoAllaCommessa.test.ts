/// <reference types="node" />
/**
 * Il legame preventivo → commessa che scrive «Nuova commessa» (07/10/2026).
 *
 * Dopo la «rivedi» la pagina del preventivo non doveva offrire una seconda commessa, ma leggeva la commessa collegata da
 * una copia in cache che l'app tiene fresca 5 minuti, e nessuno la invalidava. Qui il pezzo che scrive il legame: scrive
 * quote_id sulla commessa giusta, fa seguire il blocca prezzo, invalida la query che legge la pagina del preventivo, e
 * se il legame non si scrive (errore, o nessuna riga aggiornata perché la commessa non è visibile a chi l'ha creata) lo
 * dice a chi chiama.
 */
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({
  scritture: [] as Array<{ tabella: string; dati: Record<string, unknown>; filtri: Array<[string, unknown]> }>,
  righeOrdini: [{ id: "o1" }] as Array<{ id: string }>,
  erroreOrdini: null as null | { message: string },
  erroreBloccaPrezzo: null as null | { message: string },
}));

vi.mock("@/integrations/supabase/client", () => {
  const costruttore = (tabella: string) => {
    const scrittura: { tabella: string; dati: Record<string, unknown>; filtri: Array<[string, unknown]> } = { tabella, dati: {}, filtri: [] };
    const b: Record<string, unknown> = {};
    const esito = () =>
      tabella === "orders"
        ? { data: finto.erroreOrdini ? null : finto.righeOrdini, error: finto.erroreOrdini }
        : { data: null as null, error: finto.erroreBloccaPrezzo };
    b.update = (dati: Record<string, unknown>) => { scrittura.dati = dati; finto.scritture.push(scrittura); return b; };
    b.eq = (colonna: string, valore: unknown) => { scrittura.filtri.push([colonna, valore]); return b; };
    b.is = (colonna: string, valore: unknown) => { scrittura.filtri.push([colonna, valore]); return b; };
    b.select = () => b;
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(esito()).then(ok, ko);
    return b;
  };
  return { supabase: { from: (t: string) => costruttore(t) } };
});

import { collegaPreventivoAllaCommessa } from "@/lib/orders/collegaPreventivoAllaCommessa";
import { queryKeys } from "@/lib/queryKeys";

const chiama = (queryClient: QueryClient) =>
  collegaPreventivoAllaCommessa({ queryClient, orderId: "o1", quoteId: "q1", quoteNumber: "PRV-2026-0001", customerId: "cli-7" });

beforeEach(() => {
  finto.scritture.length = 0;
  finto.righeOrdini = [{ id: "o1" }];
  finto.erroreOrdini = null;
  finto.erroreBloccaPrezzo = null;
  vi.spyOn(console, "error").mockImplementation((): void => undefined);
  vi.spyOn(console, "warn").mockImplementation((): void => undefined);
});

describe("collegaPreventivoAllaCommessa", () => {
  it("scrive quote_id e il numero sulla commessa giusta, fa seguire il blocca prezzo e dice che il legame c'è", async () => {
    const esito = await chiama(new QueryClient());
    expect(esito).toEqual({ collegata: true });
    const commessa = finto.scritture.find((s) => s.tabella === "orders");
    expect(commessa?.dati).toEqual({ quote_id: "q1", quote_number: "PRV-2026-0001" });
    expect(commessa?.filtri).toEqual([["id", "o1"]]);
    const bloccaPrezzo = finto.scritture.find((s) => s.tabella === "blocca_prezzo");
    expect(bloccaPrezzo?.dati).toEqual({ order_id: "o1", customer_id: "cli-7" });
    expect(bloccaPrezzo?.filtri).toEqual([["quote_id", "q1"], ["order_id", null]]);
  });

  it("invalida la commessa collegata di QUEL preventivo (la pagina del preventivo la rilegge anche se in cache è «fresca»)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } } });
    client.setQueryData(queryKeys.quotes.linkedOrder("q1"), null);
    client.setQueryData(queryKeys.quotes.linkedOrder("altro"), null);
    await chiama(client);
    expect(client.getQueryState(queryKeys.quotes.linkedOrder("q1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.quotes.linkedOrder("altro"))?.isInvalidated).toBe(false);
  });

  it("se la scrittura sulla commessa dà errore: collegata = false, non lancia, e invalida lo stesso", async () => {
    finto.erroreOrdini = { message: "boom" };
    const client = new QueryClient();
    const spia = vi.spyOn(client, "invalidateQueries");
    await expect(chiama(client)).resolves.toEqual({ collegata: false });
    expect(spia).toHaveBeenCalledWith({ queryKey: queryKeys.quotes.linkedOrder("q1") });
  });

  it("se non cambia nessuna riga (commessa non visibile a chi l'ha creata, ruolo «solo assegnati»): collegata = false", async () => {
    finto.righeOrdini = [];
    await expect(chiama(new QueryClient())).resolves.toEqual({ collegata: false });
  });

  it("un errore sul blocca prezzo non toglie il legame", async () => {
    finto.erroreBloccaPrezzo = { message: "boom" };
    await expect(chiama(new QueryClient())).resolves.toEqual({ collegata: true });
  });
});

describe("«Nuova commessa» usa questo legame", () => {
  const sorgente = readFileSync("src/pages/azienda/CreateOrder.tsx", "utf8");
  it("chiama collegaPreventivoAllaCommessa e avvisa se il legame non c'è; non scrive più quote_id per conto suo", () => {
    expect(sorgente).toContain("await collegaPreventivoAllaCommessa({");
    expect(sorgente).toMatch(/if \(!collegata\) \{\s+toast\.warning\(/);
    expect(sorgente).not.toContain("quote_id: selectedQuoteId");
  });
});
