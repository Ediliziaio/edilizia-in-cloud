import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Database finto. Il canale tiene i gestori registrati con .on(), così il test
 * fa "arrivare" gli eventi del tempo reale. La RPC risponde dopo `durata`
 * millisecondi di orologio finto e conta, per funzione, le chiamate e quante
 * sono in corso nello stesso momento: una lettura annullata nel browser qui
 * resta in corso fino alla fine, come sul database vero. */
const db = vi.hoisted(() => ({
  gestori: [] as { tabella: string; evento: string; filtro?: string; cb: () => void }[],
  stato: null as null | ((s: string) => void),
  rimossi: 0,
  durata: 100,
  chiamate: {} as Record<string, number>,
  inCorso: {} as Record<string, number>,
  massimoInCorso: {} as Record<string, number>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const ch: any = {
    on: (_tipo: string, o: any, cb: () => void) => {
      db.gestori.push({ tabella: o.table, evento: o.event, filtro: o.filter, cb });
      return ch;
    },
    subscribe: (cb: (s: string) => void) => { db.stato = cb; return ch; },
  };
  const rpc = (fn: string) => {
    db.chiamate[fn] = (db.chiamate[fn] ?? 0) + 1;
    db.inCorso[fn] = (db.inCorso[fn] ?? 0) + 1;
    db.massimoInCorso[fn] = Math.max(db.massimoInCorso[fn] ?? 0, db.inCorso[fn]);
    return new Promise((fine) => setTimeout(() => {
      db.inCorso[fn]--;
      fine({ data: fn === "conversazioni_non_lette" ? 3 : [], error: null });
    }, db.durata));
  };
  return {
    supabase: {
      channel: () => ch,
      removeChannel: () => { db.rimossi++; return Promise.resolve("ok"); },
      rpc,
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "az1" }, user: { id: "u1" } }),
}));

import {
  CONVERSAZIONI_GIRO_MS,
  useConversazioneTimeline,
  useConversazioniList,
  useConversazioniTempoReale,
} from "@/hooks/useConversazioni";
import { attesaNonLette, useConversazioniNonLette } from "@/hooks/useConversazioniNonLette";

const LISTA = "conversazioni_lista";
const FILO = "conversazione_timeline";
const chiamate = (fn: string) => db.chiamate[fn] ?? 0;

const arriva = (tabella: string) => db.gestori.filter((g) => g.tabella === tabella).forEach((g) => g.cb());

/** Come un browser vero: cambia document.hidden e visibilityState, e l'evento
 *  risale fino a window (React Query ascolta lì, la coda su document). */
function nascondi(nascosta: boolean, avvisa = true) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => nascosta });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (nascosta ? "hidden" : "visible") });
  if (avvisa) document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}

function nuovoClient() {
  // Come App.tsx: niente refetch al focus se la query non lo chiede.
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
}

function wrapperDi(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/** La pagina Conversazioni con un filo aperto. */
function montaInbox(client: QueryClient) {
  return renderHook(() => {
    useConversazioniList("az1");
    useConversazioneTimeline("contatto", "c1");
    useConversazioniTempoReale("az1");
  }, { wrapper: wrapperDi(client) });
}

let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T09:00:00Z"));
  nascondi(false, false);
  db.gestori = []; db.stato = null; db.rimossi = 0; db.durata = 100;
  db.chiamate = {}; db.inCorso = {}; db.massimoInCorso = {};
  client = nuovoClient();
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  nascondi(false, false);
});

describe("Conversazioni: le ricariche non accelerano quando il database rallenta", () => {
  it("ascolta le tre tabelle, filtrate per azienda dove la tabella lo permette", () => {
    montaInbox(client);
    expect(db.gestori.map((g) => [g.tabella, g.evento, g.filtro])).toEqual([
      ["conversazioni", "*", "company_id=eq.az1"],
      ["messaging_messages", "INSERT", undefined],
      ["whatsapp_messages", "*", "company_id=eq.az1"],
    ]);
  });

  it("una raffica di 200 eventi diventa una lettura sola di lista e filo, un secondo dopo", async () => {
    montaInbox(client);
    await vi.advanceTimersByTimeAsync(100);              // prima lettura all'apertura
    expect([chiamate(LISTA), chiamate(FILO)]).toEqual([1, 1]);

    for (let i = 0; i < 200; i++) arriva(i % 2 ? "whatsapp_messages" : "conversazioni");
    await vi.advanceTimersByTimeAsync(999);
    expect([chiamate(LISTA), chiamate(FILO)]).toEqual([1, 1]);
    await vi.advanceTimersByTimeAsync(1);
    expect([chiamate(LISTA), chiamate(FILO)]).toEqual([2, 2]);
    // Poi, senza eventi, solo i giri della lista: a 26 e a 51 secondi.
    await vi.advanceTimersByTimeAsync(60_000);
    expect([chiamate(LISTA), chiamate(FILO)]).toEqual([4, 2]);
  });

  it("con risposte da 20 secondi e un evento al secondo per 10 minuti: mai due letture insieme, e sempre più rade", async () => {
    // 08/10/2026: con ogni evento che ripartiva subito, 600 eventi erano 600
    // letture della lista, una ventina in corso insieme sul database.
    db.durata = 20_000;
    montaInbox(client);
    for (let s = 0; s < 600; s++) {
      arriva("whatsapp_messages");
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(db.massimoInCorso[LISTA]).toBe(1);
    expect(db.massimoInCorso[FILO]).toBe(1);
    // Apertura, poi una lettura ogni 2 minuti circa (20 s di lettura + 100 s di attesa).
    expect(chiamate(LISTA)).toBeLessThanOrEqual(6);
    expect(chiamate(FILO)).toBeLessThanOrEqual(6);
  });

  it("senza eventi rilegge la lista ogni 25 secondi, il filo no", async () => {
    montaInbox(client);
    await vi.advanceTimersByTimeAsync(100);
    expect(chiamate(LISTA)).toBe(1);
    await vi.advanceTimersByTimeAsync(CONVERSAZIONI_GIRO_MS + 1_000 - 101); // t = 25,999 s
    expect(chiamate(LISTA)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);                                   // t = 26 s
    expect(chiamate(LISTA)).toBe(2);
    await vi.advanceTimersByTimeAsync(CONVERSAZIONI_GIRO_MS);               // t = 51 s
    expect(chiamate(LISTA)).toBe(3);
    expect(chiamate(FILO)).toBe(1);
  });

  it("con la scheda nascosta nessuna richiesta, neanche per gli eventi; al ritorno lista e filo una volta", async () => {
    montaInbox(client);
    await vi.advanceTimersByTimeAsync(100);
    nascondi(true);
    for (let i = 0; i < 50; i++) arriva("whatsapp_messages");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect([chiamate(LISTA), chiamate(FILO)]).toEqual([1, 1]);

    nascondi(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect([chiamate(LISTA), chiamate(FILO)]).toEqual([2, 2]);
    expect(db.massimoInCorso[FILO]).toBe(1);
  });

  it("chiusa la pagina, il canale si chiude e non parte più niente", async () => {
    const { unmount } = montaInbox(client);
    await vi.advanceTimersByTimeAsync(100);
    unmount();
    expect(db.rimossi).toBe(1);
    arriva("whatsapp_messages");
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect([chiamate(LISTA), chiamate(FILO)]).toEqual([1, 1]);
  });
});

describe("Badge «Chat»: il conteggio dei non letti rallenta col database", () => {
  const montaBadge = () => renderHook(() => useConversazioniNonLette(), { wrapper: wrapperDi(client) });

  it("l'attesa è 30 secondi, o cinque volte l'ultima risposta, fino a 2 minuti", () => {
    expect(attesaNonLette(0)).toBe(30_000);
    expect(attesaNonLette(141)).toBe(30_000);
    expect(attesaNonLette(8_000)).toBe(40_000);
    expect(attesaNonLette(19_694)).toBe(98_470);
    expect(attesaNonLette(60_000)).toBe(120_000);
  });

  it("a database veloce rilegge ogni 30 secondi e mostra il numero", async () => {
    const { result } = montaBadge();
    await vi.advanceTimersByTimeAsync(101);              // risposta a t = 0,1 s, a schermo un istante dopo
    expect(result.current).toBe(3);
    expect(chiamate("conversazioni_non_lette")).toBe(1);
    await vi.advanceTimersByTimeAsync(29_998);           // t = 30,099 s
    expect(chiamate("conversazioni_non_lette")).toBe(1);
    await vi.advanceTimersByTimeAsync(1);                // t = 30,1 s
    expect(chiamate("conversazioni_non_lette")).toBe(2);
  });

  it("se una risposta impiega 20 secondi, la successiva parte dopo altri 100", async () => {
    db.durata = 20_000;
    montaBadge();
    await vi.advanceTimersByTimeAsync(20_000);           // la prima finisce a t = 20 s
    expect(chiamate("conversazioni_non_lette")).toBe(1);
    await vi.advanceTimersByTimeAsync(99_999);           // t = 119,999 s
    expect(chiamate("conversazioni_non_lette")).toBe(1);
    await vi.advanceTimersByTimeAsync(1);                // t = 120 s
    expect(chiamate("conversazioni_non_lette")).toBe(2);
    expect(db.massimoInCorso.conversazioni_non_lette).toBe(1);
  });

  it("con la scheda nascosta non gira", async () => {
    montaBadge();
    await vi.advanceTimersByTimeAsync(100);
    nascondi(true);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(chiamate("conversazioni_non_lette")).toBe(1);
  });
});
