import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePrezzarioCapitoli,
  usePrezzarioVociPagina,
} from "@/lib/prezzario/queries";
const stato = vi.hoisted(() => ({
  calls: [] as unknown[][],
  righe: [] as Record<string, unknown>[],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: unknown) => o,
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "az",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let rows = stato.righe;
      let from = 0;
      let to = 999;
      const q = {
        select: (...a: unknown[]) => {
          stato.calls.push([table, "select", ...a]);
          return q;
        },
        eq: (key: string, value: unknown) => {
          stato.calls.push([table, "eq", key, value]);
          rows = rows.filter((r) => r[key] === value);
          return q;
        },
        in: (key: string, values: unknown[]) => {
          stato.calls.push([table, "in", key, values]);
          rows = rows.filter((r) => values.includes(r[key]));
          return q;
        },
        or: (value: string) => {
          stato.calls.push([table, "or", value]);
          return q;
        },
        order: (key: string) => {
          stato.calls.push([table, "order", key]);
          return q;
        },
        range: (a: number, b: number) => {
          from = a;
          to = b;
          stato.calls.push([table, "range", a, b]);
          return q;
        },
        abortSignal: () => q,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: rows.slice(from, to + 1),
            count: rows.length,
            error: null,
          }).then(resolve),
      };
      return q;
    },
  },
}));
type Opzioni = {
  queryFn: (o: {
    signal: AbortSignal;
  }) => Promise<{ voci: unknown[]; totale: number }>;
  queryKey: unknown[];
};
const esegui = (o: unknown) =>
  (o as Opzioni).queryFn({ signal: new AbortController().signal });
beforeEach(() => {
  stato.calls = [];
  stato.righe = Array.from({ length: 4200 }, (_, i) => ({
    id: `v${i}`,
    fonte_id: "fonte",
    capitolo_id: i < 900 ? "A" : "B",
  }));
});
describe("Prezziari: consultazione completa", () => {
  it("trova un capitolo interamente oltre le prime 500 voci", async () => {
    const r = await esegui(
      usePrezzarioVociPagina({ fonteId: "fonte", capitoliIds: ["B"] }),
    );
    expect(r.totale).toBe(3300);
    expect(r.voci).toHaveLength(100);
    expect(r.voci[0]).toMatchObject({ id: "v900" });
    expect(stato.calls.findIndex((c) => c[1] === "in")).toBeLessThan(
      stato.calls.findIndex((c) => c[1] === "range"),
    );
  });
  it("consulta una pagina successiva alla cinquecentesima voce con conteggio totale e ordine stabile", async () => {
    const r = await esegui(
      usePrezzarioVociPagina({ fonteId: "fonte", pagina: 37 }),
    );
    expect(r).toMatchObject({ totale: 4200 });
    expect(r.voci[0]).toMatchObject({ id: "v3700" });
    expect(stato.calls).toContainEqual([
      "prezzario_voce",
      "select",
      "*",
      { count: "exact" },
    ]);
    expect(
      stato.calls.filter((c) => c[1] === "order").map((c) => c[2]),
    ).toEqual(["ordine", "id"]);
  });
  it("cerca per codice e descrizione mantenendo il filtro capitolo", async () => {
    await esegui(
      usePrezzarioVociPagina({
        fonteId: "fonte",
        search: "A.01.007",
        capitoliIds: ["A", "A.1"],
      }),
    );
    expect(stato.calls).toContainEqual([
      "prezzario_voce",
      "or",
      "codice.ilike.%A.01.007%,descrizione.ilike.%A.01.007%",
    ]);
    expect(stato.calls).toContainEqual([
      "prezzario_voce",
      "in",
      "capitolo_id",
      ["A", "A.1"],
    ]);
  });
  it("i caratteri di una ricerca non possono spezzare il filtro PostgREST", async () => {
    await esegui(
      usePrezzarioVociPagina({ fonteId: "fonte", search: 'tubo 20,5 ("x")%' }),
    );
    expect(stato.calls.find((c) => c[1] === "or")?.[2]).toBe(
      "codice.ilike.%tubo 20 5 x%,descrizione.ilike.%tubo 20 5 x%",
    );
  });
  it("carica tutti i capitoli anche oltre il limite REST", async () => {
    stato.righe = Array.from({ length: 1050 }, (_, i) => ({
      id: `c${i}`,
      fonte_id: "fonte",
    }));
    const r = await esegui(usePrezzarioCapitoli("fonte"));
    expect(r).toHaveLength(1050);
    expect(stato.calls.filter((c) => c[1] === "range")).toHaveLength(5);
  });
});
