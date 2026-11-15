/**
 * Impostazioni → Automazioni (15/11/2026): una sezione dedicata, una riga per automatismo con cosa fa,
 * acceso/spento e ultimo esito. Per ora c'è il collegamento automatico dei documenti.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  role: "company_admin" as string,
  acceso: false,
  salvati: [] as boolean[],
  esito: null as null | { quando: string | null; testo: string; tono: "neutro" | "ok" | "attenzione" | "errore" },
  esitoSubappalti: null as null | { quando: string | null; testo: string; tono: "neutro" | "ok" | "attenzione" | "errore" },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" }, role: state.role }) }));
vi.mock("@/hooks/useCollegamentoAutomatico", () => ({
  useCollegamentoAutomatico: () => ({ data: state.acceso, isLoading: false }),
  useSalvaCollegamentoAutomatico: () => ({ mutate: (v: boolean) => state.salvati.push(v), isPending: false }),
}));
vi.mock("@/hooks/useUltimoCollegamento", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useUltimoCollegamento")>()),
  useUltimoCollegamento: () => state.esito,
}));

vi.mock("@/hooks/useUltimoCollegamentoSubappalti", () => ({ useUltimoCollegamentoSubappalti: () => state.esitoSubappalti }));

import SettingsAutomazioni from "@/pages/azienda/settings/SettingsAutomazioni";
import { AUTOMATISMI } from "@/components/settings/automazioni/registroAutomatismi";
import { testoUltimoCollegamento } from "@/hooks/useUltimoCollegamento";

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SettingsAutomazioni /></QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  state.role = "company_admin";
  state.acceso = false;
  state.salvati = [];
  state.esito = null;
  state.esitoSubappalti = null;
});

describe("Impostazioni → Automazioni", () => {
  it("una riga per automatismo: cosa fa, spento di base, nessun esito ancora", () => {
    open();
    expect(screen.getByRole("heading", { level: 2, name: "Automazioni" })).toBeInTheDocument();
    const riga = document.getElementById("collegamento-documenti")!;
    expect(within(riga).getByText("Collegamento automatico dei documenti")).toBeInTheDocument();
    expect(within(riga).getByText(/Quando un collegamento è certo/)).toBeInTheDocument();
    expect(within(riga).getByRole("switch", { name: "Collegamento automatico dei documenti" })).not.toBeChecked();
    expect(within(riga).getByText("Spento")).toBeInTheDocument();
    expect(within(riga).getByText("Nessun esito registrato")).toBeInTheDocument();
  });

  it("l'amministratore lo accende con un clic; l'ultimo esito si vede", () => {
    state.esito = { quando: new Date().toISOString(), testo: "2 collegamenti proposti aspettano la tua conferma", tono: "attenzione" };
    open();
    fireEvent.click(screen.getByRole("switch", { name: "Collegamento automatico dei documenti" }));
    expect(state.salvati).toEqual([true]);
    expect(screen.getByText("2 collegamenti proposti aspettano la tua conferma")).toBeInTheDocument();
  });

  it("chi non amministra lo vede ma non lo cambia", () => {
    state.role = "staff";
    open();
    expect(screen.getByRole("switch", { name: "Collegamento automatico dei documenti" })).toBeDisabled();
    expect(screen.getByText(/Gli interruttori li cambia l'amministratore/)).toBeInTheDocument();
  });

  it("Subappalti: la riga della fattura del subappaltatore segue lo stesso interruttore e ha il suo esito", () => {
    state.acceso = true;
    state.esitoSubappalti = { quando: new Date().toISOString(), testo: "Ultimo collegamento fatto da solo", tono: "ok" };
    open();
    const riga = document.getElementById("subappalti-fattura-contratto-sal")!;
    expect(within(riga).getByText("Fattura del subappaltatore al suo contratto e SAL")).toBeInTheDocument();
    expect(within(riga).getByText(/senza AI/)).toBeInTheDocument();
    const interruttore = within(riga).getByRole("switch", { name: "Fattura del subappaltatore al suo contratto e SAL" });
    expect(interruttore).toBeChecked();
    expect(within(riga).getByText("Ultimo collegamento fatto da solo")).toBeInTheDocument();
    fireEvent.click(interruttore);
    expect(state.salvati).toEqual([false]);
  });

  it("ogni automatismo del registro ha un id unico e i testi che la riga mostra", () => {
    const ids = AUTOMATISMI.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of AUTOMATISMI) {
      expect(a.titolo && a.cosaFa && a.daSpento && a.area).toBeTruthy();
      expect(a.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("la rotta, il menu e la ricerca ci sono; l'interruttore non sta più fra le Approvazioni", () => {
    expect(readFileSync("src/routes/companyRoutes.tsx", "utf8")).toContain('<Route path="automazioni" element={withCompanyPermission("canViewCosts", <SettingsAutomazioni />)} />');
    expect(readFileSync("src/lib/impostazioni/navigazioneImpostazioni.tsx", "utf8")).toContain('{ label: "Automazioni", sezioni: ["automazioni"] }');
    expect(readFileSync("src/lib/impostazioni/indiceImpostazioni.ts", "utf8")).toContain("url: `${BASE}/automazioni`");
    expect(readFileSync("src/pages/azienda/settings/SettingsApprovazioni.tsx", "utf8")).not.toContain("Collegamento");
  });
});

describe("ultimo esito del collegamento automatico", () => {
  it("prima le proposte in attesa, poi l'ultimo collegamento", () => {
    expect(testoUltimoCollegamento(0, null)).toBeNull();
    expect(testoUltimoCollegamento(1, null)).toMatchObject({ testo: "1 collegamento proposto aspetta la tua conferma", tono: "attenzione" });
    expect(testoUltimoCollegamento(0, { stato: "collegato", esito: "automatico", updated_at: "2026-11-15T10:00:00Z" })).toMatchObject({ testo: "Ultimo collegamento fatto da solo", tono: "ok" });
    expect(testoUltimoCollegamento(0, { stato: "annullato", esito: "automatico", updated_at: "2026-11-15T10:00:00Z" })).toMatchObject({ testo: expect.stringMatching(/annullato/), tono: "neutro" });
  });
});
