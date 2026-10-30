import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({
  rpc: vi.fn(),
  risposta: { data: null as unknown, error: null as unknown },
  chiamate: [] as unknown[][],
}));

vi.mock("@/integrations/supabase/client", () => {
  // Catena di PostgREST finta: registra i metodi chiamati e alla fine risponde `finto.risposta`.
  const catena = (): unknown => new Proxy({}, {
    get: (_t, metodo: string) => {
      if (metodo === "then") return (ok: (v: unknown) => unknown) => Promise.resolve(finto.risposta).then(ok);
      return (...argomenti: unknown[]) => { finto.chiamate.push([metodo, ...argomenti]); return catena(); };
    },
  });
  return { supabase: { rpc: finto.rpc, from: (tabella: string) => { finto.chiamate.push(["from", tabella]); return catena(); } } };
});

import {
  caricaVersione,
  chiaviPlanimetrie,
  creaPlanimetria,
  elencaPlanimetrie,
  salvaNuovaVersione,
} from "@/lib/planimetrie/archivio";

const bilocale = JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi/bilocale.json"), "utf8"));

beforeEach(() => {
  finto.rpc.mockReset();
  finto.risposta = { data: null, error: null };
  finto.chiamate = [];
});

describe("archivio delle planimetrie", () => {
  it("crea: valida, calcola le quantità e chiama planimetria_crea una volta", async () => {
    finto.rpc.mockResolvedValue({ data: "id-nuovo", error: null });
    const id = await creaPlanimetria({ companyId: "az", titolo: "  Casa Rossi ", documento: bilocale, collegamenti: { orderId: "c1" } });
    expect(id).toBe("id-nuovo");
    const [nome, parametri] = finto.rpc.mock.calls[0];
    expect(nome).toBe("planimetria_crea");
    expect(parametri).toMatchObject({ p_company_id: "az", p_titolo: "Casa Rossi", p_origine: "manuale", p_order_id: "c1", p_quote_id: null });
    expect(parametri.p_quantita["fatto:pianta.pavimento_mq"].valore).toBe(47.105);
  });

  it("crea senza documento: parte da una pianta vuota col titolo", async () => {
    finto.rpc.mockResolvedValue({ data: "x", error: null });
    await creaPlanimetria({ companyId: "az", titolo: "Vuota" });
    expect(finto.rpc.mock.calls[0][1].p_documento).toMatchObject({ schema: 1, titolo: "Vuota", livelli: [{ id: "pt" }] });
  });

  it("non scrive niente se la pianta non è valida o non ha nome", async () => {
    await expect(creaPlanimetria({ companyId: "az", titolo: " " })).rejects.toThrow("Dai un nome alla pianta.");
    await expect(salvaNuovaVersione({ planimetriaId: "p", documento: { schema: 1 } as never })).rejects.toThrow(/non è valida/);
    expect(finto.rpc).not.toHaveBeenCalled();
  });

  it("salva una versione dicendo quale si era aperta; se un altro ha salvato prima, lo dice", async () => {
    finto.rpc.mockResolvedValue({ data: 4, error: null });
    expect(await salvaNuovaVersione({ planimetriaId: "p", documento: bilocale, versioneAttesa: 3 })).toBe(4);
    expect(finto.rpc.mock.calls[0][1]).toMatchObject({ p_planimetria_id: "p", p_versione_attesa: 3 });

    finto.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "..." } });
    await expect(salvaNuovaVersione({ planimetriaId: "p", documento: bilocale, versioneAttesa: 3 }))
      .rejects.toThrow("Qualcun altro ha salvato la pianta nel frattempo: ricarica per vedere le sue modifiche.");
  });

  it("elenca le piante dell'azienda, senza le cancellate e le archiviate", async () => {
    finto.risposta = { data: [{ id: "a" }], error: null };
    expect(await elencaPlanimetrie("az", { quoteId: "q" })).toEqual([{ id: "a" }]);
    expect(finto.chiamate).toContainEqual(["from", "planimetrie"]);
    expect(finto.chiamate).toContainEqual(["eq", "company_id", "az"]);
    expect(finto.chiamate).toContainEqual(["is", "deleted_at", null]);
    expect(finto.chiamate).toContainEqual(["neq", "stato", "archiviata"]);
    expect(finto.chiamate).toContainEqual(["eq", "quote_id", "q"]);
  });

  it("una versione letta dal database si valida: se è rotta lo dice invece di passarla all'editor", async () => {
    finto.risposta = { data: { numero: 1, documento: bilocale, quantita: null }, error: null };
    expect((await caricaVersione("p", 1)).documento.titolo).toBe("Bilocale di esempio");
    finto.risposta = { data: { numero: 2, documento: { schema: 1 }, quantita: null }, error: null };
    await expect(caricaVersione("p", 2)).rejects.toThrow(/non si legge/);
  });

  it("una chiave React Query per forma di dato, tutte sotto «planimetrie»", () => {
    expect(chiaviPlanimetrie.elenco("az")).toEqual(["planimetrie", "elenco", "az", {}]);
    expect(chiaviPlanimetrie.dettaglio("p")).toEqual(["planimetrie", "dettaglio", "p"]);
    expect(chiaviPlanimetrie.versioni("p")).toEqual(["planimetrie", "versioni", "p"]);
    expect(chiaviPlanimetrie.versione("p", 2)).toEqual(["planimetrie", "versione", "p", 2]);
  });
});
