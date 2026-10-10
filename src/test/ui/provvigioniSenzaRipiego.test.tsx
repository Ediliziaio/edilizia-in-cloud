/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://app.ediliziaincloud.com/azienda/impostazioni/persone?tab=venditori" }
 */
/**
 * «Regole provvigioni» in produzione, 10/10/2026.
 *
 * Se la scrittura nel database dava errore, la regola finiva nel browser
 * (`localStorage`) e compariva «Regola salvata nel browser locale»: la regola non
 * contava nelle provvigioni e non la vedeva nessun altro. Lo stesso valeva per
 * accendere/spegnere e per eliminare, e se la lettura falliva si mostravano le
 * regole del browser al posto di quelle vere.
 *
 * Adesso un errore è un errore: si dice, e nel browser non si scrive niente.
 * (Il ripiego resta solo su localhost, per lo sviluppo: l'altro file di test.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const stato = vi.hoisted(() => ({
  regole: [] as Array<Record<string, unknown>>,
  erroreLettura: null as unknown,
  erroreScrittura: null as unknown,
  erroreAggiorna: null as unknown,
  erroreElimina: null as unknown,
  operazioni: [] as string[],
  toasts: [] as Array<{ tipo: string; testo: string }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena = () => {
    let modo = "select";
    const b: Record<string, unknown> = {};
    const risolvi = () => {
      stato.operazioni.push(modo);
      if (modo === "insert") return { data: stato.erroreScrittura ? null : { id: "nuova" }, error: stato.erroreScrittura };
      if (modo === "update") return { data: null as unknown, error: stato.erroreAggiorna };
      if (modo === "delete") return { data: null as unknown, error: stato.erroreElimina };
      return { data: stato.erroreLettura ? null : stato.regole, error: stato.erroreLettura };
    };
    for (const metodo of ["select", "eq", "order", "limit"]) b[metodo] = () => b;
    b.insert = () => { modo = "insert"; return b; };
    b.update = () => { modo = "update"; return b; };
    b.delete = () => { modo = "delete"; return b; };
    b.single = () => Promise.resolve(risolvi());
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risolvi()).then(ok, ko);
    return b;
  };
  return {
    supabase: {
      from: () => catena(),
      functions: { invoke: async () => ({ data: null as unknown, error: { message: "AI non raggiungibile" } }) },
    },
  };
});
vi.mock("sonner", () => ({
  toast: {
    success: (testo: string) => stato.toasts.push({ tipo: "ok", testo }),
    error: (testo: string) => stato.toasts.push({ tipo: "errore", testo }),
    warning: (testo: string) => stato.toasts.push({ tipo: "avviso", testo }),
    info: (testo: string) => stato.toasts.push({ tipo: "info", testo }),
  },
}));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { CommissionRulesDialog } from "@/components/salespeople/CommissionRulesDialog";

const REGOLA_DB = {
  id: "r1",
  company_id: "c1",
  name: "Provvigione 4% sul venduto",
  description: null as unknown,
  is_active: true,
  priority: 100,
  scope: "company",
  salesperson_id: null as unknown,
  trigger_type: "base",
  basis: "sold",
  condition: {},
  action: { commission_percent: 4 },
  ai_prompt: null as unknown,
  created_at: "2026-10-01T10:00:00Z",
};

function apri() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CommissionRulesDialog open onOpenChange={() => {}} companyId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stato.regole = [REGOLA_DB];
  stato.erroreLettura = null;
  stato.erroreScrittura = null;
  stato.erroreAggiorna = null;
  stato.erroreElimina = null;
  stato.operazioni = [];
  stato.toasts = [];
  localStorage.clear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Regole provvigioni: niente salvataggio muto nel browser", () => {
  it("se la lettura dal database fallisce lo dice e non mostra le regole del browser", async () => {
    stato.erroreLettura = { message: "connection reset" };
    localStorage.setItem("commission_rules:c1", JSON.stringify([{ ...REGOLA_DB, id: "locale", name: "Regola solo nel browser" }]));
    apri();
    expect(await screen.findByText(/Non riesco a leggere le regole/)).toBeVisible();
    expect(screen.queryByText("Regola solo nel browser")).toBeNull();
    expect(screen.queryByText(/Nessuna regola configurata/)).toBeNull();
  });

  it("se il salvataggio fallisce dice l'errore e non scrive niente nel browser", async () => {
    stato.erroreScrittura = { message: 'new row violates row-level security policy for table "commission_rules"', code: "42501" };
    apri();
    fireEvent.click(await screen.findByRole("button", { name: /Salva la regola/ }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    expect(stato.toasts.some((t) => /browser/i.test(t.testo))).toBe(false);
    expect(stato.toasts.some((t) => t.tipo === "ok")).toBe(false);
    expect(localStorage.getItem("commission_rules:c1")).toBeNull();
  });

  it("se il database risponde la regola è salvata davvero", async () => {
    apri();
    fireEvent.click(await screen.findByRole("button", { name: /Salva la regola/ }));
    await waitFor(() => expect(stato.toasts.some((t) => t.testo === "Regola salvata")).toBe(true));
    expect(stato.operazioni).toContain("insert");
    expect(localStorage.getItem("commission_rules:c1")).toBeNull();
  });

  it("accendere o spegnere una regola che il database rifiuta dà un errore, non un cambio nel browser", async () => {
    stato.erroreAggiorna = { message: "permission denied", code: "42501" };
    apri();
    const interruttore = await screen.findByRole("switch", { name: /Provvigione 4% sul venduto.*attiva/ });
    fireEvent.click(interruttore);
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    expect(localStorage.getItem("commission_rules:c1")).toBeNull();
  });

  it("eliminare una regola che il database rifiuta dà un errore, non un'eliminazione nel browser", async () => {
    stato.erroreElimina = { message: "permission denied", code: "42501" };
    apri();
    fireEvent.click(await screen.findByRole("button", { name: /Elimina regola provvigione Provvigione 4% sul venduto/ }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    expect(stato.toasts.some((t) => t.testo === "Regola eliminata")).toBe(false);
    expect(localStorage.getItem("commission_rules:c1")).toBeNull();
  });

  it("dice senza giri di parole che le regole non cambiano le provvigioni delle commesse", async () => {
    apri();
    expect(await screen.findByText(/non cambiano le provvigioni delle commesse/)).toBeVisible();
    // Su un dominio vero non c'è l'avviso «prova su questo computer».
    expect(screen.queryByText(/Prova su questo computer/)).toBeNull();
  });

  it("se l'AI non risponde avvisa che il testo è stato letto con regole semplici", async () => {
    apri();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: /Con l'AI/ }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("button", { name: /Prepara le bozze/ }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "avviso")).toBe(true));
    expect(stato.toasts.find((t) => t.tipo === "avviso")?.testo).toMatch(/L'AI non ha risposto/);
    // E non dice «generate» come se l'AI avesse lavorato.
    expect(stato.toasts.some((t) => t.tipo === "ok")).toBe(false);
  });
});
