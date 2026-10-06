/**
 * Il selettore voci dei preventivatori edili legge il listino prodotti (06/10/2026): cosa
 * chiede al database, in che ordine mette i risultati, cosa lascia fuori.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Filtro = [string, ...unknown[]];
const { chiamate, risposte } = vi.hoisted(() => ({
  chiamate: [] as Array<{ tabella: string; filtri: Filtro[]; colonne: string }>,
  risposte: { propri: [] as unknown[], altri: [] as unknown[], errore: null as string | null },
}));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    const registro = { tabella, filtri: [] as Filtro[], colonne: "" };
    chiamate.push(registro);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy({}, {
      get: (_t, nome) => {
        if (nome === "then") {
          return (ok: (v: unknown) => unknown) => {
            const dellAltreAree = registro.filtri.some((f) => f[0] === "neq");
            const risposta = risposte.errore
              ? { data: null as null, error: { message: risposte.errore } }
              : { data: dellAltreAree ? risposte.altri : risposte.propri, error: null as null };
            return Promise.resolve(risposta).then(ok);
          };
        }
        return (...args: unknown[]) => {
          if (nome === "select") registro.colonne = String(args[0]);
          else registro.filtri.push([String(nome), ...args]);
          return p;
        };
      },
    });
    return p;
  };
  return { supabase: { from: (t: string) => catena(t) } };
});

import { useProdottiListino } from "@/hooks/useProdottiListino";

const famiglia = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id, nome, codice: null as string | null, descrizione: null as string | null, immagine_url: null as string | null, vertical: "bagno",
  unit_of_measure: "pz", modalita_prezzo_base: "pz", prezzo_base_mode: "vendita", prezzo_base_vendita: 100, prezzo_base_acquisto: 60,
  markup_tipo: "percentuale", markup_valore: 0, sconto_fornitore_1: 0, sconto_fornitore_2: 0, axes: [] as Array<{ id: string }>,
  ...extra,
});

const monta = (term: string, attivo = true) =>
  renderHook(() => useProdottiListino(term, "bagno", attivo), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
    ),
  });

const ha = (filtri: Filtro[], ...voce: unknown[]) => filtri.some((f) => JSON.stringify(f) === JSON.stringify(voce));

beforeEach(() => {
  chiamate.length = 0;
  risposte.propri = [];
  risposte.altri = [];
  risposte.errore = null;
});

describe("useProdottiListino", () => {
  it("senza testo: i prodotti dell'area del preventivo, accesi e proposti nel preventivo, a pezzo o al mq, non cancellati", async () => {
    risposte.propri = [famiglia("a", "Box doccia"), famiglia("b", "Piatto doccia")];
    const { result } = monta("");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chiamate).toHaveLength(1); // le altre aree solo se si cerca qualcosa
    const [q] = chiamate;
    expect(q.tabella).toBe("article_families");
    expect(ha(q.filtri, "eq", "company_id", "c1")).toBe(true);
    expect(ha(q.filtri, "eq", "attivo", true)).toBe(true);
    expect(ha(q.filtri, "eq", "mostra_preventivo", true)).toBe(true);
    expect(ha(q.filtri, "is", "deleted_at", null)).toBe(true);
    expect(ha(q.filtri, "in", "modalita_prezzo_base", ["pz", "mq"])).toBe(true);
    expect(ha(q.filtri, "eq", "vertical", "bagno")).toBe(true);
    expect(ha(q.filtri, "limit", 40)).toBe(true);
    expect(q.colonne).toContain("immagine_url");
    expect(q.colonne).toContain("descrizione");
    expect(result.current.data?.map((p) => p.nome)).toEqual(["Box doccia", "Piatto doccia"]);
  });

  it("scrivendo un nome: cerca per nome e per codice, e propone anche le altre aree (senza serramenti e fotovoltaico)", async () => {
    risposte.propri = [famiglia("a", "Piatto doccia")];
    risposte.altri = [famiglia("r", "Radiatore scaldasalviette", { vertical: "termoidraulico" })];
    const { result } = monta("doccia");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chiamate).toHaveLength(2);
    const [propri, altri] = chiamate;
    for (const q of [propri, altri]) expect(ha(q.filtri, "or", "nome.ilike.%doccia%,codice.ilike.%doccia%")).toBe(true);
    expect(ha(altri.filtri, "neq", "vertical", "bagno")).toBe(true);
    expect(ha(altri.filtri, "not", "vertical", "in", "(serramenti,serramentista,fotovoltaico)")).toBe(true);
    expect(ha(altri.filtri, "limit", 15)).toBe(true);
    // Prima i prodotti dell'area del preventivo, poi quelli delle altre.
    expect(result.current.data?.map((p) => p.nome)).toEqual(["Piatto doccia", "Radiatore scaldasalviette"]);
  });

  it("virgole e parentesi nel testo non spezzano il filtro", async () => {
    const { result } = monta("doccia,(x)");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const filtroOr = chiamate[0].filtri.find((f) => f[0] === "or")?.[1] as string;
    expect(filtroOr).toBeTruthy();
    const termine = filtroOr.split(",")[0].replace("nome.ilike.%", "").replace(/%$/, "");
    expect(termine).not.toMatch(/[(),]/);
  });

  it("a selettore chiuso non chiede niente al database", async () => {
    const { result } = monta("doccia", false);
    // niente richiesta: il risultato resta «in attesa» e non parte nessuna chiamata
    await new Promise((r) => setTimeout(r, 50));
    expect(chiamate).toHaveLength(0);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("un testo di una lettera non apre le altre aree", async () => {
    const { result } = monta("d");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chiamate).toHaveLength(1);
  });

  it("i prodotti arrivano pronti: prezzo, foto e descrizione del listino; le griglie di misure non passano", async () => {
    risposte.propri = [
      famiglia("a", "Piatto doccia 120x80", { immagine_url: "/templates/bagno/products/piatto.webp", descrizione: "Antiscivolo.", prezzo_base_vendita: 235, prezzo_base_acquisto: 130, codice: "PD1" }),
      famiglia("g", "Finestra a griglia", { modalita_prezzo_base: "griglia" }),
      famiglia("m", "Pavimento gres", { modalita_prezzo_base: "mq", prezzo_base_vendita: 48, prezzo_base_acquisto: 26 }),
    ];
    const { result } = monta("");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "a", nome: "Piatto doccia 120x80", immagine_url: "/templates/bagno/products/piatto.webp", descrizione: "Antiscivolo.", prezzo_vendita: 235, prezzo_acquisto: 130, codice: "PD1", modo: "pz" }),
      expect.objectContaining({ id: "m", modo: "mq", unita: "mq", prezzo_vendita: 48, prezzo_acquisto: 26, immagine_url: null, descrizione: null }),
    ]);
  });

  it("se il database risponde con un errore, il selettore lo sa (non mostra «nessun risultato»)", async () => {
    risposte.errore = "permission denied";
    const { result } = monta("");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("permission denied");
  });
});
