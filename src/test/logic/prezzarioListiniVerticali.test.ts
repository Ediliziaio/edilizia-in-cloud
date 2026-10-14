import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ImportazioneParziale,
  useAdottaPrezzarioListino,
  type AdottaPrezzarioInput,
  type ListinoRegionale,
} from "@/lib/prezzario/adozioneLavorazioni";
import { useListinoVoci as rst } from "@/hooks/useListinoLavorazioni";
import { useListinoVoci as bgn } from "@/hooks/useBagniListino";
import { useListinoVoci as tet } from "@/hooks/useTettiListino";
import { useListinoVoci as clm } from "@/hooks/useClimatizzazioneListino";
import { useListinoVoci as ele } from "@/hooks/useElettricoListino";
import { useListinoVoci as idr } from "@/hooks/useTermoidraulicoListino";
import { useListinoVoci as pav } from "@/hooks/usePavimentiListino";
import { useListinoVoci as pis } from "@/hooks/usePiscineListino";
const stato = vi.hoisted(() => ({
  tabelle: {} as Record<string, Record<string, unknown>[]>,
  scritture: [] as {
    table: string;
    rows: Record<string, unknown>[];
    options: unknown;
  }[],
  invalidazioni: vi.fn(),
  fallisciLotto: 0,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "azienda",
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: unknown) => o,
  useMutation: (o: unknown) => o,
  useQueryClient: () => ({ invalidateQueries: stato.invalidazioni }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let rows = stato.tabelle[table] ?? [];
      let from = 0;
      let to = 999;
      let write: Record<string, unknown>[] | null = null;
      let options: unknown;
      const risposta = () => {
        if (!write)
          return {
            data: rows.slice(from, to + 1),
            error: null as Error | null,
          };
        stato.scritture.push({ table, rows: write, options });
        if (
          table.endsWith("_listino_voci") &&
          stato.fallisciLotto ===
            stato.scritture.filter((s) => s.table.endsWith("_listino_voci"))
              .length
        )
          return { data: null, error: new Error("Connessione persa") };
        const salvate = write.filter((r) => !rows.some((e) => e.id === r.id));
        stato.tabelle[table] = [...rows, ...salvate];
        return { data: salvate, error: null as Error | null };
      };
      const q = {
        select: () => q,
        order: () => q,
        eq: (key: string, value: unknown) => {
          rows = rows.filter((r) => r[key] === value);
          return q;
        },
        range: (a: number, b: number) => {
          from = a;
          to = b;
          return q;
        },
        upsert: (
          value: Record<string, unknown>[] | Record<string, unknown>,
          o: unknown,
        ) => {
          write = Array.isArray(value) ? value : [value];
          options = o;
          return q;
        },
        maybeSingle: async () => ({
          data: rows[0] ?? null,
          error: null as Error | null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(risposta()).then(resolve),
      };
      return q;
    },
  },
}));
function input(n = 1): AdottaPrezzarioInput {
  return {
    fonteId: "fonte",
    ricaricoPct: 20,
    capitoli: [
      {
        id: "cap",
        fonte_id: "fonte",
        codice: "A",
        titolo: "Demolizioni",
        parent_id: null,
        livello: 0,
        ordine: 0,
      },
    ],
    voci: Array.from({ length: n }, (_, i) => ({
      id: `v${i}`,
      fonte_id: "fonte",
      capitolo_id: "cap",
      codice: `A.${i}`,
      descrizione: "Demolizione",
      unita_misura: "m²",
      prezzo: 100,
      incidenza_manodopera_pct: 0.25,
      incidenza_sicurezza_pct: null as number | null,
      note: null as string | null,
      ordine: i,
    })),
  };
}
function mutazione(prefix: ListinoRegionale) {
  return useAdottaPrezzarioListino(prefix) as unknown as {
    mutationFn: (
      input: AdottaPrezzarioInput,
    ) => Promise<{ inserite: number; giaPresenti: number }>;
    onSettled: () => void;
  };
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  stato.tabelle = {
    prezzario_fonte: [
      { id: "fonte", nome: "Regione 2026", regione: "Molise", anno: 2026 },
    ],
  };
  stato.scritture = [];
  stato.fallisciLotto = 0;
  stato.invalidazioni.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
describe("Prezziari: adozione negli otto listini", () => {
  it.each<ListinoRegionale>([
    "rst",
    "bgn",
    "tet",
    "clm",
    "ele",
    "idr",
    "pav",
    "pis",
  ])(
    "%s: conserva categoria e unità, senza scrivere nel listino di un altro modulo",
    async (prefix) => {
      const m = mutazione(prefix);
      const r = await m.mutationFn(input());
      expect(r).toMatchObject({ inserite: 1, giaPresenti: 0 });
      const categoria = stato.tabelle[`${prefix}_listino_capitoli`][0];
      expect(categoria.nome).toBe("Molise 2026 · A · Demolizioni");
      expect(stato.tabelle[`${prefix}_listino_voci`][0]).toMatchObject({
        capitolo_id: categoria.id,
        unita_misura: "m²",
        codice: "A.0",
        costo_materiali: 75,
        costo_manodopera: 25,
        prezzo_unitario: 120,
      });
      expect(stato.scritture.map((s) => s.table)).toEqual([
        `${prefix}_listino_capitoli`,
        `${prefix}_listino_voci`,
      ]);
      m.onSettled();
      expect(stato.invalidazioni).toHaveBeenCalledWith({
        queryKey: [`${prefix}-listino-voci`, "azienda"],
      });
    },
  );
  it("un capitolo aziendale esplicito prevale sulla categoria della fonte", async () => {
    await mutazione("rst").mutationFn({
      ...input(),
      capitoloId: "capitolo-azienda",
    });
    expect(stato.tabelle.rst_listino_voci[0].capitolo_id).toBe(
      "capitolo-azienda",
    );
    expect(stato.scritture).toHaveLength(1);
  });
  it("non importa voci senza unità, neanche chiamando direttamente la mutazione", async () => {
    const i = input();
    i.voci[0].unita_misura = null;
    await expect(mutazione("rst").mutationFn(i)).rejects.toThrow(
      "Unità di misura da indicare",
    );
    expect(stato.scritture).toHaveLength(0);
  });
  it("riconosce anche gli import vecchi con id casuali e lascia invariati i prezzi aziendali", async () => {
    stato.tabelle.rst_listino_voci = [
      {
        id: "casuale",
        company_id: "azienda",
        fonte: "Regione 2026",
        codice: "A.0",
        prezzo_unitario: 180,
      },
    ];
    const r = await mutazione("rst").mutationFn(input());
    expect(r).toMatchObject({ inserite: 0, giaPresenti: 1 });
    expect(stato.scritture).toHaveLength(0);
    expect(stato.tabelle.rst_listino_voci[0].prezzo_unitario).toBe(180);
  });
  it("se un lotto fallisce sa quali voci sono entrate e il nuovo tentativo non le duplica", async () => {
    const m = mutazione("rst");
    stato.fallisciLotto = 2;
    let errore: unknown;
    try {
      await m.mutationFn(input(101));
    } catch (e) {
      errore = e;
    }
    expect(errore).toBeInstanceOf(ImportazioneParziale);
    expect(errore).toMatchObject({
      inserite: 100,
      completate: Array.from({ length: 100 }, (_, i) => `v${i}`),
    });
    stato.fallisciLotto = 0;
    expect(await m.mutationFn(input(101))).toMatchObject({
      inserite: 1,
      giaPresenti: 100,
    });
    expect(stato.tabelle.rst_listino_voci).toHaveLength(101);
  });
});
describe("Listino aziendale: tutte le voci importate restano consultabili", () => {
  const hooks = { rst, bgn, tet, clm, ele, idr, pav, pis };
  it.each(Object.entries(hooks))(
    "%s legge più di mille voci senza troncamento",
    async (prefix, hook) => {
      stato.tabelle[`${prefix}_listino_voci`] = Array.from(
        { length: 1050 },
        (_, i) => ({ id: `v${i}`, company_id: "azienda", capitolo_id: "cap" }),
      );
      const q = hook("cap") as unknown as { queryFn: () => Promise<unknown[]> };
      expect(await q.queryFn()).toHaveLength(1050);
    },
  );
});
