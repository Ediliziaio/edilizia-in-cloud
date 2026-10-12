import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Supabase finto: il canale tiene i gestori del tempo reale, `from` registra
 * letture e insert su ai_persona_memory, e conta RPC e aggiornamenti (il
 * vecchio popolamento ne faceva uno a testa per ogni memoria). */
const db = vi.hoisted(() => ({
  gestori: [] as { tabella: string; filtro?: string; cb: () => void }[],
  rimossi: 0,
  presenti: [] as { persona_key: string; content: string }[],
  letture: [] as { tabella: string; filtri: unknown[][] }[],
  inserimenti: [] as Record<string, unknown>[][],
  rpc: 0,
  aggiornamenti: 0,
  erroreInsert: null as null | { message: string },
}));

vi.mock("@/integrations/supabase/client", () => {
  const ch: any = {
    on: (_tipo: string, o: any, cb: () => void) => { db.gestori.push({ tabella: o.table, filtro: o.filter, cb }); return ch; },
    subscribe: () => ch,
  };
  const from = (tabella: string) => {
    const filtri: unknown[][] = [];
    const q: any = {
      select: () => q,
      eq: (colonna: string, valore: unknown) => { filtri.push(["eq", colonna, valore]); return q; },
      is: (colonna: string, valore: unknown) => { filtri.push(["is", colonna, valore]); return q; },
      update: () => { db.aggiornamenti++; return q; },
      insert: (righe: Record<string, unknown>[]) => {
        db.inserimenti.push(righe);
        return Promise.resolve({ data: null, error: db.erroreInsert });
      },
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
        db.letture.push({ tabella, filtri });
        return Promise.resolve({ data: db.presenti, error: null }).then(ok, ko);
      },
    };
    return q;
  };
  return {
    supabase: {
      channel: () => ch,
      removeChannel: () => { db.rimossi++; return Promise.resolve("ok"); },
      from,
      rpc: () => { db.rpc++; return Promise.resolve({ data: null, error: null }); },
    },
  };
});

import { DEMO_AI_PERSONAS, DEMO_MEMORIES, resolveDemoPersonaKey } from "@/components/ai/brainGraphDemoMemories";
import { scriviMemorieDemo } from "@/components/ai/brainGraphDemoSeed";
import { useBrainGraphLive } from "@/hooks/useBrainGraphLive";

const TUTTE_LE_PERSONE = new Set(DEMO_AI_PERSONAS.map((p) => p.persona_key));

beforeEach(() => {
  db.gestori = []; db.rimossi = 0; db.presenti = []; db.letture = []; db.inserimenti = [];
  db.rpc = 0; db.aggiornamenti = 0; db.erroreInsert = null;
});

describe("«Popola con memorie demo» scrive a blocchi", () => {
  it("una lettura e un insert solo per tutte le memorie: niente RPC né aggiornamenti uno per uno", async () => {
    const esito = await scriviMemorieDemo({ companyId: "d2", userId: "u1", personeDisponibili: TUTTE_LE_PERSONE });

    expect(db.rpc).toBe(0);
    expect(db.aggiornamenti).toBe(0);
    expect(db.letture).toEqual([{
      tabella: "ai_persona_memory",
      filtri: [["eq", "company_id", "d2"], ["is", "user_id", null], ["eq", "enabled", true]],
    }]);
    expect(db.inserimenti).toHaveLength(1);
    expect(db.inserimenti[0]).toHaveLength(esito.inserite);
    expect(esito.inserite).toBeGreaterThan(150);
    expect(esito.inserite + esito.giaPresenti + esito.senzaPersona).toBe(DEMO_MEMORIES.length);

    // hits_count arriva già col valore della demo (prima: un PATCH per riga).
    const prima = DEMO_MEMORIES[0];
    expect(db.inserimenti[0][0]).toMatchObject({
      company_id: "d2",
      user_id: null,
      created_by: "u1",
      persona_key: resolveDemoPersonaKey(prima.persona_key, TUTTE_LE_PERSONE),
      memory_type: prima.memory_type,
      content: prima.content.trim(),
      source: "demo_seed",
      confidence: prima.confidence,
      hits_count: Math.max(1, prima.hits_count),
    });
  });

  it("un secondo clic non riscrive le memorie già presenti, anche con maiuscole o spazi diversi", async () => {
    // Nel database la persona è quella risolta al primo popolamento.
    db.presenti = DEMO_MEMORIES.slice(0, 40).map((m) => ({
      persona_key: resolveDemoPersonaKey(m.persona_key, TUTTE_LE_PERSONE)!,
      content: `  ${m.content.toUpperCase()} `,
    }));
    const esito = await scriviMemorieDemo({ companyId: "d2", userId: "u1", personeDisponibili: TUTTE_LE_PERSONE });
    expect(esito.giaPresenti).toBeGreaterThanOrEqual(40);
    const chiave = (persona: unknown, testo: unknown) => `${persona}\n${String(testo).trim().toLowerCase()}`;
    const scritte = new Set(db.inserimenti.flat().map((r) => chiave(r.persona_key, r.content)));
    for (const m of db.presenti) expect(scritte.has(chiave(m.persona_key, m.content))).toBe(false);
  });

  it("le memorie di persone che l'azienda non ha si saltano e si contano", async () => {
    const esito = await scriviMemorieDemo({ companyId: "d2", userId: null, personeDisponibili: new Set(["cfo"]) });
    expect(esito.senzaPersona).toBeGreaterThan(0);
    expect(db.inserimenti.flat().every((r) => r.persona_key === "cfo")).toBe(true);
  });

  it("oltre 500 righe si scrive a lotti di 500", async () => {
    const memorie = Array.from({ length: 1_200 }, (_, i) => ({
      persona_key: "cfo", memory_type: "fact" as const, content: `Memoria di prova numero ${i}`, confidence: 0.8, hits_count: 0,
    }));
    const esito = await scriviMemorieDemo({ companyId: "d2", userId: "u1", personeDisponibili: TUTTE_LE_PERSONE, memorie });
    expect(db.inserimenti.map((l) => l.length)).toEqual([500, 500, 200]);
    expect(esito.inserite).toBe(1_200);
    expect(db.inserimenti[0][0].hits_count).toBe(1);
  });

  it("se il database rifiuta la scrittura, l'errore arriva a chi ha cliccato", async () => {
    db.erroreInsert = { message: "new row violates row-level security policy" };
    await expect(scriviMemorieDemo({ companyId: "d2", userId: "u1", personeDisponibili: TUTTE_LE_PERSONE }))
      .rejects.toMatchObject({ message: "new row violates row-level security policy" });
  });
});

describe("Il grafo del cervello si rilegge una volta, non a ogni memoria", () => {
  let client: QueryClient;
  let letture: number;
  let inCorso: number;
  let massimoInCorso: number;
  let eventi: number;

  const arriva = (n = 1) => { for (let i = 0; i < n; i++) db.gestori.forEach((g) => g.cb()); };

  /** Il grafo: la query delle memorie (risponde in 100 ms) e il tempo reale. */
  function montaGrafo() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => {
      useQuery({
        queryKey: ["brain-graph-memories", "azienda", "d2"],
        queryFn: () => {
          letture++; inCorso++; massimoInCorso = Math.max(massimoInCorso, inCorso);
          return new Promise<never[]>((fine) => setTimeout(() => { inCorso--; fine([]); }, 100));
        },
      });
      return useBrainGraphLive({ isAdmin: false, companyId: "d2", onEvento: () => { eventi++; } });
    }, { wrapper });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T08:01:00Z"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
    letture = 0; inCorso = 0; massimoInCorso = 0; eventi = 0;
  });
  afterEach(() => { cleanup(); client.clear(); vi.clearAllTimers(); vi.useRealTimers(); });

  it("ascolta solo le memorie dell'azienda aperta", () => {
    montaGrafo();
    expect(db.gestori.map((g) => [g.tabella, g.filtro])).toEqual([["ai_persona_memory", "company_id=eq.d2"]]);
  });

  it("220 eventi durante il popolamento: nessuna ricarica; alla fine una sola", async () => {
    // 12/10/2026: 84 ricariche del grafo in un minuto, una per evento.
    const { result } = montaGrafo();
    await vi.advanceTimersByTimeAsync(100);
    expect(letture).toBe(1);

    act(() => result.current.sospendi());
    for (let s = 0; s < 11; s++) { arriva(20); await vi.advanceTimersByTimeAsync(1_000); }
    expect(eventi).toBe(220);              // l'indicatore LIVE li vede tutti
    expect(letture).toBe(1);               // il database nessuno

    act(() => result.current.riprendi());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(letture).toBe(2);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(letture).toBe(2);               // nessun giro fisso
    expect(massimoInCorso).toBe(1);
  });

  it("fuori dal popolamento una raffica è una ricarica dopo un secondo, poi al massimo una ogni 15 secondi", async () => {
    montaGrafo();
    await vi.advanceTimersByTimeAsync(100);
    arriva(30);
    await vi.advanceTimersByTimeAsync(999);
    expect(letture).toBe(1);
    await vi.advanceTimersByTimeAsync(1);  // t = 1,1 s
    expect(letture).toBe(2);
    await vi.advanceTimersByTimeAsync(2_000);
    arriva(5);                                 // t = 3,1 s
    await vi.advanceTimersByTimeAsync(13_099); // t = 16,199 s
    expect(letture).toBe(2);
    await vi.advanceTimersByTimeAsync(1);      // t = 16,2 s: 15 s dopo la fine della precedente (1,2 s)
    expect(letture).toBe(3);
    expect(massimoInCorso).toBe(1);
  });

  it("anche se il tempo reale tace, a fine popolamento il grafo si rilegge", async () => {
    const { result } = montaGrafo();
    await vi.advanceTimersByTimeAsync(100);
    act(() => { result.current.sospendi(); result.current.riprendi(); });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(letture).toBe(2);
  });

  it("chiuso il grafo, il canale si chiude e gli eventi non rileggono più niente", async () => {
    const { unmount } = montaGrafo();
    await vi.advanceTimersByTimeAsync(100);
    unmount();
    expect(db.rimossi).toBe(1);
    arriva(10);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(letture).toBe(1);
  });
});
