import { beforeEach, describe, expect, it, vi } from "vitest";

const lettura = vi.hoisted(() => ({
  pagine: [] as unknown[][],
  campi: "",
  filtri: [] as unknown[][],
  paginazione: [] as number[][],
  ordini: [] as unknown[][],
  errore: null as { message: string } | null,
  pagina: null as unknown,
  aborta: undefined as (() => void) | undefined,
}));
vi.mock("@/integrations/supabase/client", () => {
  class Query {
    select(c: string) {
      lettura.campi = c;
      return this;
    }
    eq(...v: unknown[]) {
      lettura.filtri.push(["eq", ...v]);
      return this;
    }
    gte(...v: unknown[]) {
      lettura.filtri.push(["gte", ...v]);
      return this;
    }
    lte(...v: unknown[]) {
      lettura.filtri.push(["lte", ...v]);
      return this;
    }
    abortSignal() {
      return this;
    }
    order(...v: unknown[]) {
      lettura.ordini.push(v);
      return this;
    }
    async range(da: number, a: number) {
      lettura.paginazione.push([da, a]);
      lettura.aborta?.();
      return { data: lettura.pagine.shift() ?? [], error: lettura.errore };
    }
    async maybeSingle() {
      return { data: lettura.pagina, error: lettura.errore };
    }
  }
  return { supabase: { from: () => new Query() } };
});

import {
  leggiGiornaliPeriodo,
  leggiPaginaGiornale,
} from "@/hooks/useGiornaliPeriodo";
const g = (id: string, order: unknown = { client_name: "Demo" }) => ({
  id,
  order,
});
beforeEach(() => {
  lettura.pagine = [];
  lettura.campi = "";
  lettura.filtri = [];
  lettura.paginazione = [];
  lettura.ordini = [];
  lettura.errore = null;
  lettura.pagina = null;
  lettura.aborta = undefined;
});

describe("lettura dei giornali nell'elenco rapportini", () => {
  it("legge anche oltre le mille pagine senza perdere il vincolo sull'azienda", async () => {
    lettura.pagine = [
      Array.from({ length: 1000 }, (_, i) => g(String(i))),
      [g("1001")],
    ];
    expect(await leggiGiornaliPeriodo("az-2", {})).toHaveLength(1001);
    expect(lettura.paginazione).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(lettura.filtri.filter((f) => f[1] === "company_id")).toEqual([
      ["eq", "company_id", "az-2"],
      ["eq", "company_id", "az-2"],
    ]);
    expect(lettura.ordini).toContainEqual([
      "data_lavori",
      { ascending: false },
    ]);
    expect(lettura.ordini).toContainEqual(["id"]);
    expect(lettura.campi).not.toContain("costo");
    expect(lettura.campi).not.toContain("firma_capocantiere");
  });
  it("applica esattamente l'intervallo comune ai rapportini", async () => {
    await leggiGiornaliPeriodo("az", { da: "2026-09-22", a: "2026-11-11" });
    expect(lettura.filtri).toContainEqual(["gte", "data_lavori", "2026-09-22"]);
    expect(lettura.filtri).toContainEqual(["lte", "data_lavori", "2026-11-11"]);
  });
  it("non elenca commesse eliminate o nascoste dalle regole di accesso", async () => {
    lettura.pagine = [
      [
        g("ok"),
        g("nascosta", null),
        g("eliminata", { deleted_at: "2026-10-01" }),
      ],
    ];
    expect((await leggiGiornaliPeriodo("az", {})).map((r) => r.id)).toEqual([
      "ok",
    ]);
  });
  it("propaga gli errori invece di presentare un elenco parziale", async () => {
    lettura.errore = { message: "Non autorizzato" };
    await expect(leggiGiornaliPeriodo("az", {})).rejects.toEqual(
      lettura.errore,
    );
  });
  it("si ferma fra due pagine se cambia il periodo o l'azienda", async () => {
    const c = new AbortController();
    lettura.pagine = [
      Array.from({ length: 1000 }, (_, i) => g(String(i))),
      [g("non-leggere")],
    ];
    lettura.aborta = () => c.abort();
    await expect(
      leggiGiornaliPeriodo("az", {}, c.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(lettura.paginazione).toEqual([[0, 999]]);
  });
  it("apre anche una pagina vecchia tramite id, azienda e commessa", async () => {
    lettura.pagina = {
      id: "g-vecchia",
      order_id: "o2",
      data_lavori: "2020-01-01",
    };
    expect(await leggiPaginaGiornale("az-2", "g-vecchia", "o2")).toEqual(
      lettura.pagina,
    );
    expect(lettura.filtri).toEqual([
      ["eq", "company_id", "az-2"],
      ["eq", "id", "g-vecchia"],
      ["eq", "order_id", "o2"],
    ]);
    expect(lettura.paginazione).toEqual([]);
  });
});
