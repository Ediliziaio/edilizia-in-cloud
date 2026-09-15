/**
 * conRiprova: un ruolo che non si riesce a leggere si ritenta, non si scambia
 * per un ruolo che manca (14/09/2026, BeMade rimandata al login con la sessione
 * ancora valida mentre il database era lento).
 */
import { describe, expect, it, vi } from "vitest";
import { conRiprova } from "@/lib/auth/conRiprova";

interface Dati { role: string | null; transient: boolean }

const transitorio = (r: Dati) => r.role === null && r.transient;

function dormiFinto() {
  const attese: number[] = [];
  return { attese, dormi: async (ms: number) => { attese.push(ms); } };
}

describe("conRiprova", () => {
  it("risultato buono al primo colpo: nessuna attesa", async () => {
    const { attese, dormi } = dormiFinto();
    const tentativo = vi.fn(async (): Promise<Dati> => ({ role: "call_center", transient: false }));
    const r = await conRiprova(tentativo, transitorio, [2000, 5000], dormi);
    expect(r.role).toBe("call_center");
    expect(tentativo).toHaveBeenCalledTimes(1);
    expect(attese).toEqual([]);
  });

  it("database lento due volte, poi risponde: tre tentativi con le attese in ordine", async () => {
    const { attese, dormi } = dormiFinto();
    const risposte: Dati[] = [
      { role: null, transient: true },
      { role: null, transient: true },
      { role: "call_center", transient: false },
    ];
    const tentativo = vi.fn(async (): Promise<Dati> => risposte.shift()!);
    const r = await conRiprova(tentativo, transitorio, [2000, 5000], dormi);
    expect(r.role).toBe("call_center");
    expect(tentativo).toHaveBeenCalledTimes(3);
    expect(attese).toEqual([2000, 5000]);
  });

  it("utente davvero senza ruolo: nessun ritentativo", async () => {
    const { attese, dormi } = dormiFinto();
    const tentativo = vi.fn(async (): Promise<Dati> => ({ role: null, transient: false }));
    const r = await conRiprova(tentativo, transitorio, [2000, 5000], dormi);
    expect(r).toEqual({ role: null, transient: false });
    expect(tentativo).toHaveBeenCalledTimes(1);
    expect(attese).toEqual([]);
  });

  it("sempre lento: dopo l'ultimo tentativo restituisce il risultato transitorio", async () => {
    const { dormi } = dormiFinto();
    const tentativo = vi.fn(async (): Promise<Dati> => ({ role: null, transient: true }));
    const r = await conRiprova(tentativo, transitorio, [2000, 5000], dormi);
    expect(r).toEqual({ role: null, transient: true });
    expect(tentativo).toHaveBeenCalledTimes(3);
  });

  it("un'eccezione si ritenta, e all'ultimo tentativo si rilancia", async () => {
    const { dormi } = dormiFinto();
    const tentativo = vi.fn(async (): Promise<Dati> => { throw new Error("fetchUserData timeout"); });
    await expect(conRiprova(tentativo, transitorio, [2000, 5000], dormi)).rejects.toThrow("fetchUserData timeout");
    expect(tentativo).toHaveBeenCalledTimes(3);
  });

  it("eccezione e poi risposta buona: vince la risposta", async () => {
    const { dormi } = dormiFinto();
    let volta = 0;
    const tentativo = vi.fn(async (): Promise<Dati> => {
      volta++;
      if (volta === 1) throw new Error("fetchUserData timeout");
      return { role: "company_staff", transient: false };
    });
    const r = await conRiprova(tentativo, transitorio, [2000, 5000], dormi);
    expect(r.role).toBe("company_staff");
    expect(tentativo).toHaveBeenCalledTimes(2);
  });
});
