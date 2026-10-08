// src/test/logic/avviaCommessa.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { aggiungiFasiDaCapitoli, avviaCommessa } from "@/lib/orders/avviaCommessa";

// Le graffe contano: beforeEach che restituisce il mock lo userebbe come funzione di chiusura (e lo chiamerebbe).
beforeEach(() => { rpc.mockReset(); });

describe("avviaCommessa", () => {
  it("chiama commessa_avvia e dice cosa è nato", async () => {
    rpc.mockResolvedValue({ data: { fasi: 4, rate: 3 }, error: null });
    expect(await avviaCommessa("o1")).toEqual({ fasi: 4, rate: 3 });
    expect(rpc).toHaveBeenCalledWith("commessa_avvia", { p_order_id: "o1" });
  });
  it("una risposta senza il numero delle rate (migrazione dei pagamenti non ancora applicata) vale zero", async () => {
    rpc.mockResolvedValue({ data: { fasi: 2 }, error: null });
    expect(await avviaCommessa("o1")).toEqual({ fasi: 2, rate: 0 });
  });
  it("se la funzione non c'è o rifiuta, non è un errore: null", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function public.commessa_avvia does not exist" } });
    expect(await avviaCommessa("o1")).toBeNull();
    rpc.mockRejectedValue(new Error("rete"));
    expect(await avviaCommessa("o1")).toBeNull();
  });
});

describe("aggiungiFasiDaCapitoli", () => {
  const fasi = [{ nome: "Demolizioni", venduto: 1500 }, { nome: "Impianti", venduto: 3000 }];
  it("manda nome e venduto di ogni fase, e dice quante ne sono nate", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    expect(await aggiungiFasiDaCapitoli("o1", fasi)).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("aggiungi_fasi_commessa", {
      p_order_id: "o1", p_fasi: [{ nome: "Demolizioni", venduto: 1500 }, { nome: "Impianti", venduto: 3000 }],
    });
  });
  it("senza il permesso sugli importi (42501) le fasi nascono lo stesso, senza venduto", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permesso" } });
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    expect(await aggiungiFasiDaCapitoli("o1", fasi)).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith("aggiungi_fasi_commessa", { p_order_id: "o1", p_fasi: [{ nome: "Demolizioni" }, { nome: "Impianti" }] });
  });
  it("un altro errore non si riprova: zero fasi", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "Troppe fasi" } });
    expect(await aggiungiFasiDaCapitoli("o1", fasi)).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("senza fasi non chiama niente", async () => {
    expect(await aggiungiFasiDaCapitoli("o1", [])).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("se anche il secondo tentativo fallisce, zero e nessuna eccezione", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(await aggiungiFasiDaCapitoli("o1", fasi)).toBe(0);
    rpc.mockRejectedValue(new Error("rete"));
    expect(await aggiungiFasiDaCapitoli("o1", fasi)).toBe(0);
  });
});
