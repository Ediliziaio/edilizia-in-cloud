import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/finance/bankWorkspace", () => ({ bankRpc: rpc }));
import { cercaMovimentiSimili, SIMILI_MASSIMO } from "@/lib/finance/movimentiSimili";

const forte = (key: string) => ({ key, tipo: "rata_fornitore", id: key, titolo: key, residuo: 100, forte: true, incongruenze: [] as string[] });

describe("movimenti simili dopo una conferma a mano (lotto D)", () => {
  beforeEach(() => rpc.mockReset());

  it("tiene solo i movimenti con UNA proposta forte non reclamata da un altro", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "bank_movimenti_simili") return ["a", "b", "c", "d"];
      return {
        a: [forte("rata-1")],
        b: [forte("rata-2"), forte("rata-3")], // due forti: si sceglie a mano
        c: [forte("rata-4")],
        d: [forte("rata-4")], // stessa rata di c: nessuno dei due
      };
    });
    expect(await cercaMovimentiSimili("co", "tx")).toEqual(["a"]);
  });

  it("una proposta forte con incongruenze non conta", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "bank_movimenti_simili" ? ["a"] : { a: [{ ...forte("r"), incongruenze: ["Data distante"] }] },
    );
    expect(await cercaMovimentiSimili("co", "tx")).toEqual([]);
  });

  it("senza simili non calcola proposte, e ne analizza al massimo SIMILI_MASSIMO", async () => {
    rpc.mockResolvedValueOnce([]);
    expect(await cercaMovimentiSimili("co", "tx")).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);

    const tanti = Array.from({ length: 20 }, (_, i) => `m${i}`);
    rpc.mockReset();
    rpc.mockImplementation(async (name: string, args?: { p_ids?: string[] }) =>
      name === "bank_movimenti_simili" ? tanti : Object.fromEntries((args?.p_ids ?? []).map((id) => [id, [forte(`r-${id}`)]])),
    );
    const trovati = await cercaMovimentiSimili("co", "tx");
    expect(trovati).toHaveLength(SIMILI_MASSIMO);
    expect(rpc).toHaveBeenLastCalledWith("bank_proposte_lotto", { p_company: "co", p_ids: tanti.slice(0, SIMILI_MASSIMO) });
  });
});

describe("La memoria delle scelte nel database", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20290701400000_riconciliazione_memoria_controparti.sql"),
    "utf8",
  );
  const corpo = (nome: string) => {
    const inizio = sql.indexOf(`CREATE OR REPLACE FUNCTION private.${nome}(`);
    return sql.slice(inizio, sql.indexOf("$function$;", inizio));
  };

  it("la firma della causale chiede due conferme, IBAN e nome una", () => {
    expect(corpo("tes_memoria_soggetto")).toMatch(
      /conferme - 2 \* m\.smentite >= CASE WHEN m\.tipo_chiave = 'causale' THEN 2 ELSE 1 END/,
    );
  });

  it("abbinare a un altro soggetto smentisce quello ricordato, non il bonifico diviso", () => {
    const registra = corpo("tes_memoria_registra");
    expect(registra).toMatch(/a\.soggetto <> p_soggetto\s+AND a\.ultimo_movimento_id IS DISTINCT FROM t\.id/);
  });

  it("le funzioni chiamate in serie non passano al piano generico", () => {
    for (const nome of ["tes_soggetto_di", "tes_memoria_registra"]) {
      expect(corpo(nome)).toContain("SET plan_cache_mode TO 'force_custom_plan'");
    }
  });

  it("un timeout della memoria non annulla la conferma dell'utente", () => {
    for (const nome of ["tes_memoria_da_riconciliazione", "tes_memoria_da_proposta_scartata"]) {
      expect(corpo(nome)).toContain("EXCEPTION WHEN OTHERS OR query_canceled THEN");
    }
  });
});
