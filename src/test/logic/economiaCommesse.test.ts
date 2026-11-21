import { beforeEach, describe, expect, it, vi } from "vitest";

const trasporto = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://economia-collaudo.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: trasporto.fetch },
  }) };
});

import { COLONNE_MARGINI_COMMESSE, leggiEconomiaCommesse } from "@/lib/economiaCommesse";

describe("Lettura dei margini per commessa", () => {
  beforeEach(() => {
    trasporto.fetch.mockReset();
  });

  it("seleziona l'azienda e le colonne e non rilegge gli stessi ID", async () => {
    const ids = Array.from({ length: 121 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    trasporto.fetch.mockImplementation(async (_, init) => {
      const { p_ids } = JSON.parse(String(init?.body)) as { p_ids: string[] };
      return Response.json(p_ids.map(id => ({ id, margine: 150 })));
    });
    const dati = await leggiEconomiaCommesse([...ids, ids[5], ""], {
      companyId: "azienda-collaudo",
      colonne: COLONNE_MARGINI_COMMESSE,
    });

    expect(dati.map(riga => riga.id)).toEqual(ids);
    expect(trasporto.fetch).toHaveBeenCalledTimes(2);
    for (const [input, init] of trasporto.fetch.mock.calls) {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/rest/v1/rpc/economia_commesse");
      expect(url.searchParams.get("company_id")).toBe("eq.azienda-collaudo");
      expect(url.searchParams.get("select")).toBe("id,preventivo_totale,consuntivo,margine,margine_perc");
      expect(JSON.parse(String(init?.body)).p_ids.length).toBeLessThanOrEqual(100);
    }
  });

  it("evita richieste senza commesse e interrompe la lettura cancellata", async () => {
    expect(await leggiEconomiaCommesse([])).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    await expect(leggiEconomiaCommesse(["o1"], { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(trasporto.fetch).not.toHaveBeenCalled();
  });

  it("non restituisce un risultato parziale se un lotto successivo fallisce", async () => {
    trasporto.fetch
      .mockResolvedValueOnce(Response.json([{ id: "o0", margine: 100 }]))
      .mockResolvedValueOnce(Response.json({ code: "57014", message: "statement timeout" }, { status: 500 }));
    const ids = Array.from({ length: 101 }, (_, i) => `o${i}`);
    await expect(leggiEconomiaCommesse(ids)).rejects.toMatchObject({ code: "57014" });
    expect(trasporto.fetch).toHaveBeenCalledTimes(2);
  });
});
