import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { salvaOpportunitaInBlocco } from "@/lib/marketing/opportunitaInBlocco";

const db = vi.hoisted(() => ({
  righe: new Map<string, { id: string; contact_id: string; value?: number }>(),
  richieste: 0,
  perdiRisposta: false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({
    upsert: (righe: { id: string; contact_id: string; value?: number }[], config: { ignoreDuplicates: boolean }) => ({
      select: async () => {
        db.richieste += 1;
        const inserite = righe.filter(riga => !config.ignoreDuplicates || !db.righe.has(riga.id));
        for (const riga of inserite) db.righe.set(riga.id, riga);
        const error = db.perdiRisposta && db.richieste === 2 ? new Error("Risposta persa") : null;
        return { data: inserite, error };
      },
    }),
    select: () => ({ eq: () => ({ in: async (_campo: string, ids: string[]) => ({
      data: ids.map(id => db.righe.get(id)).filter(Boolean), error: null as null,
    }) }) }),
  }) },
}));

describe("Creazione delle opportunità in blocco", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    db.righe.clear();
    db.richieste = 0;
    db.perdiRisposta = false;
  });
  afterEach(() => vi.unstubAllGlobals());

  const righe = Array.from({ length: 501 }, (_, i) => ({
    company_id: "azienda", pipeline_id: "pipeline", stage_id: "fase", contact_id: `contatto-${i}`, name: "Prova", source: "Passaparola",
  }));

  it("riprende dopo la risposta persa del secondo lotto senza duplicare o sovrascrivere", async () => {
    db.perdiRisposta = true;
    await expect(salvaOpportunitaInBlocco("azienda", righe, "operazione-a")).rejects.toThrow("Risposta persa");
    const prima = [...db.righe.values()][0];
    prima.value = 12;
    await expect(salvaOpportunitaInBlocco("azienda", righe, "operazione-a")).resolves.toBe(501);
    expect(db.righe.size).toBe(501);
    expect(db.righe.get(prima.id)?.value).toBe(12);
  });

  it("lascia creare un'altra opportunità con un invio esplicito distinto", async () => {
    await salvaOpportunitaInBlocco("azienda", righe.slice(0, 1), "operazione-a");
    await salvaOpportunitaInBlocco("azienda", righe.slice(0, 1), "operazione-b");
    expect(db.righe.size).toBe(2);
  });
});
