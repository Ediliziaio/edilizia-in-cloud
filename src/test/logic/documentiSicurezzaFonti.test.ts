import { beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({
  tabelle: {} as Record<string, Array<Record<string, unknown>>>,
  errore: "",
  letture: [] as Array<
    { tabella: string; filtri: Array<[string, string, unknown]>; dal: number }
  >,
}));
vi.mock(
  "@/integrations/supabase/client",
  () => ({
    supabase: {
      from: (tabella: string) => {
        const filtri: Array<[string, string, unknown]> = [];
        const q = {
          select: vi.fn(),
          eq: vi.fn(),
          in: vi.fn(),
          or: vi.fn(),
          order: vi.fn(),
          range: vi.fn(),
        };
        q.select.mockReturnValue(q);
        q.order.mockReturnValue(q);
        q.eq.mockImplementation((k, v) => {
          filtri.push(["eq", k, v]);
          return q;
        });
        q.in.mockImplementation((k, v) => {
          filtri.push(["in", k, v]);
          return q;
        });
        q.or.mockReturnValue(q);
        q.range.mockImplementation(async (dal: number, al: number) => {
          s.letture.push({ tabella, filtri: [...filtri], dal });
          if (s.errore === tabella) {
            return { data: null, error: new Error("Fonte non disponibile") };
          }
          const rows = (s.tabelle[tabella] || []).filter((r) =>
            filtri.every(([op, k, v]) =>
              op === "eq" ? r[k] === v : (v as unknown[]).includes(r[k])
            )
          );
          return { data: rows.slice(dal, al + 1), error: null };
        });
        return q;
      },
    },
  }),
);
import { leggiDocumentiSicurezza } from "@/hooks/useDocumentiSicurezza";
beforeEach(() => {
  s.tabelle = {};
  s.errore = "";
  s.letture = [];
});
const sub = {
  id: "s",
  company_id: "c",
  order_id: null,
  campo_subappaltatore_id: "campo",
};
const doc = {
  id: "d",
  company_id: "c",
  subappaltatore_id: "s",
  tipo: "pos",
  nome_file: "pos.pdf",
  note: "Caricato via import multiplo",
  url: "c/s/pos.pdf",
  created_at: "2026-10-27",
};
describe("Fonti documentali delle imprese effettivamente collegate", () => {
  it("recupera l’archivio della ditta collegata tramite contratto, senza confermare l’ambito del vecchio POS", async () => {
    s.tabelle = {
      contratti_subappalto: [{
        company_id: "c",
        order_id: "o",
        subappaltatore_id: "s",
      }],
      subappaltatori_sicurezza: [sub],
      documenti_subappaltatore: [doc],
    };
    const rows = await leggiDocumentiSicurezza("c", "o");
    expect(rows).toHaveLength(1);
    expect(rows[0].titolo).toBe("pos.pdf");
    expect(rows[0].note).toBe("Caricato via import multiplo");
    expect(rows[0]).toMatchObject({
      order_id: "o",
      subappaltatore_id: "s",
      ambito_da_verificare: true,
      fonte: "subappaltatore",
    });
  });
  it("considera anche le assegnazioni senza contratto e deduplica i collegamenti", async () => {
    s.tabelle = {
      contratti_subappalto: [{
        company_id: "c",
        order_id: "o",
        subappaltatore_id: "s",
      }],
      subappaltatori_assegnazioni: [{
        company_id: "c",
        order_id: "o",
        subappaltatore_id: "s",
      }, { company_id: "c", order_id: "o", subappaltatore_id: "s" }],
      subappaltatori_sicurezza: [sub],
      documenti_subappaltatore: [doc],
    };
    expect(await leggiDocumentiSicurezza("c", "o")).toHaveLength(1);
    s.tabelle.contratti_subappalto = [];
    expect(await leggiDocumentiSicurezza("c", "o")).toHaveLength(1);
  });
  it("non legge documenti di un’altra impresa o tenant e usa il collegamento Campo esplicito", async () => {
    s.tabelle = {
      contratti_subappalto: [{
        company_id: "c",
        order_id: "o",
        subappaltatore_id: "s",
      }],
      subappaltatori_sicurezza: [sub],
      documenti_subappaltatore: [doc, {
        ...doc,
        id: "estraneo",
        company_id: "altra",
      }],
      subappaltatori_documenti: [{
        id: "f",
        company_id: "c",
        subappaltatore_id: "campo",
        status: "active",
        tipo: "durc",
        storage_path: "c/campo/durc.pdf",
      }, {
        id: "altra-impresa",
        company_id: "c",
        subappaltatore_id: "campo-altro",
        status: "active",
        tipo: "durc",
        storage_path: "c/altro/file.pdf",
      }],
    };
    const rows = await leggiDocumentiSicurezza("c", "o");
    expect(rows).toHaveLength(2);
    expect(
      rows.some((r) =>
        r.id.includes("estraneo") || r.id.includes("altra-impresa")
      ),
    ).toBe(false);
  });
  it("un errore di contratto, assegnazione o archivio resta un errore, non una lista favorevole", async () => {
    s.tabelle = {
      contratti_subappalto: [{
        company_id: "c",
        order_id: "o",
        subappaltatore_id: "s",
      }],
      subappaltatori_sicurezza: [sub],
    };
    for (
      const tabella of [
        "contratti_subappalto",
        "subappaltatori_assegnazioni",
        "documenti_subappaltatore",
        "subappaltatori_documenti",
      ]
    ) {
      s.errore = tabella;
      await expect(leggiDocumentiSicurezza("c", "o")).rejects.toThrow(
        "Fonte non disponibile",
      );
    }
  });
  it("legge tutte le pagine dell’archivio e non tronca alla prima risposta", async () => {
    s.tabelle = {
      subappaltatori_sicurezza: [{ ...sub, order_id: "o" }],
      documenti_subappaltatore: Array.from(
        { length: 1001 },
        (_, i) => ({ ...doc, id: `d${i}` }),
      ),
    };
    expect(await leggiDocumentiSicurezza("c", "o")).toHaveLength(1001);
    expect(
      s.letture.filter((r) => r.tabella === "documenti_subappaltatore").map(
        (r) => r.dal,
      ),
    ).toEqual([0, 500, 1000]);
  });
});
