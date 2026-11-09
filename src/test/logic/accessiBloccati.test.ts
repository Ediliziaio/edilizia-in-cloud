/**
 * Il lato browser dello sblocco (09/11/2026).
 *
 * `supabase.rpc()` NON solleva: se il database rifiuta, l'errore torna dentro
 * `error` e il chiamante che non lo guarda dice «fatto» a un'operazione che non
 * è avvenuta. Qui si prova che leggere l'elenco e sbloccare falliscono forte, e
 * che il testo dell'attesa non scrive mai «fino a null».
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { leggiAccessiBloccati, sbloccaAccesso, quandoSiRiapre } from "@/lib/sicurezza/accessiBloccati";

beforeEach(() => rpc.mockReset());

describe("leggere chi è bloccato", () => {
  it("chiede l'elenco al database e lo restituisce", async () => {
    rpc.mockResolvedValue({
      data: [{ email: "tizio@azienda.it", ip_address: "87.31.61.168", nome: "Tizio Tizi", user_id: "u1", tentativi: 3, max_tentativi: 3, sbloccato_il: "2026-11-10T15:24:27Z", ultimo_tentativo: "2026-11-09T15:25:22Z" }],
      error: null,
    });
    const righe = await leggiAccessiBloccati();
    expect(rpc).toHaveBeenCalledWith("accessi_bloccati");
    expect(righe).toHaveLength(1);
    expect(righe[0].ip_address).toBe("87.31.61.168");
  });

  it("nessun bloccato è un elenco vuoto, non un errore", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(leggiAccessiBloccati()).resolves.toEqual([]);
  });

  it("un rifiuto del database non passa per elenco vuoto", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(leggiAccessiBloccati()).rejects.toThrow("permission denied");
  });
});

describe("sbloccare", () => {
  it("passa email e indirizzo come li vuole la funzione", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await sbloccaAccesso("tizio@azienda.it", "87.31.61.168");
    expect(rpc).toHaveBeenCalledWith("sblocca_accesso", {
      p_email: "tizio@azienda.it",
      p_ip: "87.31.61.168",
    });
  });

  it("se il database rifiuta, lo sblocco fallisce (non dice «fatto»)", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Questo accesso non e di un utente della tua azienda." },
    });
    await expect(sbloccaAccesso("altra@azienda.it", "1.2.3.4")).rejects.toThrow(
      /non e di un utente della tua azienda/,
    );
  });
});

describe("quando si riapre", () => {
  it("scrive giorno e ora in italiano", () => {
    expect(quandoSiRiapre("2026-11-10T15:24:27Z")).toMatch(/^10\/11, \d{2}:\d{2}$/);
  });

  it("senza orario non scrive nulla, così nessuno legge «fino a null»", () => {
    expect(quandoSiRiapre(null)).toBeNull();
    expect(quandoSiRiapre(undefined)).toBeNull();
    expect(quandoSiRiapre("non una data")).toBeNull();
  });
});
