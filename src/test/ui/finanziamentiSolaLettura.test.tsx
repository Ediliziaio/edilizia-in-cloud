/**
 * Impostazioni → Finanziamenti → chi può vedere ma non modificare (10/10/2026).
 *
 * Chi non ha «Finanziamenti» in modifica vede «Nuova tabella», «Disattiva» ed «Elimina» SPENTI (non nascosti), con la frase che
 * spiega perché in testa alla pagina e collegata a ogni comando spento per il lettore di schermo.
 * Il database è finto e registra ogni scrittura: «non parte nessuna scrittura» vuol dire `writes` vuoto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import SettingsFinanziamenti from "@/pages/azienda/settings/SettingsFinanziamenti";
import SettingsFinanziamentiDetail from "@/pages/azienda/settings/SettingsFinanziamentiDetail";
import SettingsFinanziamentiNuova from "@/pages/azienda/settings/SettingsFinanziamentiNuova";
import SettingsFinanziamentiCalcolatore from "@/pages/azienda/settings/SettingsFinanziamentiCalcolatore";

type Riga = Record<string, unknown>;
type Scrittura = { table: string; op: string; value: unknown; filters: Array<[string, unknown]> };

const state = vi.hoisted(() => ({
  role: "company_admin" as string,
  permissions: {} as Record<string, boolean>,
  tabelle: [] as Array<Record<string, unknown>>,
  righe: [] as Array<Record<string, unknown>>,
  finanziarie: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ table: string; op: string; value: unknown; filters: Array<[string, unknown]> }>,
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role, effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-1" }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, op: "select", value: null as unknown, filters: [] as Array<[string, unknown]> };
      let uno = false;
      const risposta = () => {
        if (call.op !== "select") {
          const v = (call.value ?? {}) as Record<string, unknown>;
          return { data: uno ? { id: "nuova-id", nome_prodotto: v.nome_prodotto ?? null } : null, error: null as unknown };
        }
        const sorgente =
          table === "eic_tabelle_finanziamento" ? state.tabelle
          : table === "eic_tabelle_finanziamento_righe" ? state.righe
          : table === "eic_finanziarie" ? state.finanziarie
          : [];
        // I filtri su una colonna che la riga non ha (company_id nelle righe di prova) non escludono niente.
        const trovate = sorgente.filter((r) => call.filters.every(([colonna, valore]) => !(colonna in r) || r[colonna] === valore));
        return { data: uno ? (trovate[0] ?? null) : trovate, error: null as unknown };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (colonna: string, valore: unknown) => { call.filters.push([colonna, valore]); return builder; },
        ilike: () => builder, order: () => builder, limit: () => builder,
        maybeSingle: async () => { uno = true; return risposta(); },
        single: async () => { uno = true; return risposta(); },
        insert: (valore: unknown) => {
          call.op = "insert"; call.value = valore; state.writes.push(call);
          // Il database finto ricorda ciò che gli si scrive: la procedura rilegge la tabella appena creata.
          if (table === "eic_tabelle_finanziamento") state.tabelle.push({ id: "nuova-id", company_id: "company-1", ...(valore as Record<string, unknown>) });
          if (table === "eic_finanziarie") state.finanziarie.push({ id: "nuova-id", ...(valore as Record<string, unknown>) });
          return builder;
        },
        update: (valore: unknown) => { call.op = "update"; call.value = valore; state.writes.push(call); return builder; },
        delete: () => { call.op = "delete"; state.writes.push(call); return builder; },
        then: (resolve: (v: ReturnType<typeof risposta>) => unknown) => Promise.resolve(risposta()).then(resolve),
      };
      return builder;
    },
    storage: { from: () => ({ upload: async () => ({ error: null as unknown }), createSignedUrl: async () => ({ data: { signedUrl: "https://esempio.test/file" }, error: null as unknown }) }) },
    functions: { invoke: async () => ({ data: null as unknown, error: null as unknown }) },
  },
}));

const FRASE_SOLA_LETTURA = "Stai consultando i finanziamenti: li modifica chi ha il permesso «Finanziamenti» in modifica.";
const FRASE_ACCESSO_NEGATO = "Per vedere i finanziamenti serve il permesso «Finanziamenti». Chiedilo al titolare.";
const SOLO_VEDERE = { canViewSettingsFinanziamenti: true, canEditSettingsFinanziamenti: false };
const PUO_MODIFICARE = { canViewSettingsFinanziamenti: true, canEditSettingsFinanziamenti: true };
const NIENTE = { canViewSettingsFinanziamenti: false, canEditSettingsFinanziamenti: false };

const tabella = (extra: Riga = {}): Riga => ({
  id: "t1", company_id: "company-1", finanziaria_id: "f1", nome_prodotto: "Prodotto A", codice_condizione: "255891",
  subtariffa_default: "GT57T", tan_base: 8.75, pdf_url: null, pdf_filename: null, csv_url: null, csv_filename: null,
  data_decorrenza: "2026-10-01", data_scadenza: "2026-12-31", attiva: true, note: null, righe_count: 2,
  importo_min: 5000, importo_max: 30000, durate_disponibili: [24, 36], finanziaria: { nome: "Fiditalia" },
  ...extra,
});
const riga = (extra: Riga = {}): Riga => ({
  id: "r1", tabella_id: "t1", company_id: "company-1", subtariffa: "GT57T", importo_erogato: 5000, spese_istruttoria: 0,
  importo_totale_credito: 5000, numero_rate: 24, durata_mesi: 24, prima_rata_giorni: 30, importo_rata: 230,
  spese_incasso_rata: 3, interessi_cliente: 650, importo_totale_dovuto: 5650, tan: 8.75, taeg: 10.1, icc: null,
  provvigione_dealer: 60, created_at: "2026-10-01", ...extra,
});

function Posizione() {
  return <p data-testid="percorso">{useLocation().pathname}</p>;
}
function apri(pagina: "elenco" | "dettaglio" | "nuova" | "calcolatore") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const base = "/azienda/impostazioni/finanziamenti";
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[pagina === "elenco" ? base : pagina === "dettaglio" ? `${base}/t1` : `${base}/${pagina}`]}>
        <Routes>
          <Route path={base} element={<SettingsFinanziamenti />} />
          <Route path={`${base}/nuova`} element={<SettingsFinanziamentiNuova />} />
          <Route path={`${base}/calcolatore`} element={<SettingsFinanziamentiCalcolatore />} />
          <Route path={`${base}/:id`} element={<SettingsFinanziamentiDetail />} />
        </Routes>
        <Posizione />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.role = "company_admin";
  state.permissions = { ...PUO_MODIFICARE };
  state.tabelle = [];
  state.righe = [];
  state.finanziarie = [{ id: "f1", nome: "Fiditalia" }];
  state.writes.length = 0;
  state.success.mockClear();
  state.error.mockClear();
});
afterEach(() => cleanup());

describe("Elenco: chi può solo vedere", () => {
  beforeEach(() => {
    state.permissions = { ...SOLO_VEDERE };
    state.tabelle = [tabella({ id: "t1", nome_prodotto: "Prodotto A" }), tabella({ id: "t2", nome_prodotto: "Prodotto B", attiva: false })];
  });

  it("ha l'avviso in testa e ogni comando che scrive è spento, con la stessa frase per il lettore di schermo", async () => {
    apri("elenco");
    await screen.findByText("Prodotto A");
    const avviso = screen.getByText(FRASE_SOLA_LETTURA).closest("[role=alert]");
    expect(avviso).toHaveAttribute("id", "finanziamenti-sola-lettura");

    const scrittura = [
      screen.getByRole("button", { name: "Nuova tabella" }),
      screen.getByRole("button", { name: "Disattiva Prodotto A" }),
      screen.getByRole("button", { name: "Attiva Prodotto B" }),
      screen.getByRole("button", { name: "Elimina Prodotto A" }),
      screen.getByRole("button", { name: "Elimina Prodotto B" }),
    ];
    for (const comando of scrittura) {
      expect(comando, comando.getAttribute("aria-label") ?? comando.textContent ?? "").toBeDisabled();
      expect(comando).toHaveAttribute("title", FRASE_SOLA_LETTURA);
      expect(comando).toHaveAccessibleDescription(FRASE_SOLA_LETTURA);
    }
  });

  it("cliccando i comandi spenti non parte nessuna scrittura e non si apre nessuna finestra", async () => {
    apri("elenco");
    await screen.findByText("Prodotto A");
    for (const nome of ["Nuova tabella", "Disattiva Prodotto A", "Attiva Prodotto B", "Elimina Prodotto A"]) {
      fireEvent.click(screen.getByRole("button", { name: nome }));
    }
    expect(screen.queryByText("Eliminare la tabella?")).toBeNull();
    expect(screen.getByTestId("percorso")).toHaveTextContent("/azienda/impostazioni/finanziamenti");
    expect(screen.getByTestId("percorso").textContent).not.toMatch(/nuova/);
    expect(state.writes).toEqual([]);
    expect(state.success).not.toHaveBeenCalled();
  });

  it("consultare resta possibile: «Apri» e «Calcolatore» sono collegamenti accesi", async () => {
    apri("elenco");
    await screen.findByText("Prodotto A");
    expect(screen.getByRole("link", { name: "Apri Prodotto A" })).toHaveAttribute("href", "/azienda/impostazioni/finanziamenti/t1");
    expect(screen.getByRole("link", { name: "Calcolatore" })).toHaveAttribute("href", "/azienda/impostazioni/finanziamenti/calcolatore");
  });

  it("senza tabelle, «Carica la prima tabella» è spento e non rimanda alla procedura", async () => {
    state.tabelle = [];
    apri("elenco");
    const pulsante = await screen.findByRole("button", { name: "Carica la prima tabella" });
    expect(pulsante).toBeDisabled();
    expect(pulsante).toHaveAccessibleDescription(FRASE_SOLA_LETTURA);
    expect(screen.queryByRole("link", { name: "Carica la prima tabella" })).toBeNull();
  });

  it("il ruolo scritto nell'account non basta: conta il permesso dell'azienda (anche in «Visualizza come»)", async () => {
    state.role = "company_admin";
    apri("elenco");
    await screen.findByText("Prodotto A");
    expect(screen.getByRole("button", { name: "Elimina Prodotto A" })).toBeDisabled();
  });
});

describe("Elenco: chi può modificare", () => {
  beforeEach(() => {
    state.tabelle = [tabella({ id: "t1", nome_prodotto: "Prodotto A" }), tabella({ id: "t2", nome_prodotto: "Prodotto B", attiva: false })];
  });

  it("nessun avviso, «Nuova tabella» è un collegamento e i comandi sono accesi", async () => {
    apri("elenco");
    await screen.findByText("Prodotto A");
    expect(screen.queryByText(FRASE_SOLA_LETTURA)).toBeNull();
    expect(screen.getByRole("link", { name: "Nuova tabella" })).toHaveAttribute("href", "/azienda/impostazioni/finanziamenti/nuova");
    for (const nome of ["Disattiva Prodotto A", "Attiva Prodotto B", "Elimina Prodotto A"]) {
      expect(screen.getByRole("button", { name: nome })).toBeEnabled();
    }
    expect(screen.getByRole("button", { name: "Elimina Prodotto A" })).not.toHaveAttribute("aria-describedby");
  });

  it("disattivare scrive: solo quella tabella, solo la colonna «attiva»", async () => {
    apri("elenco");
    await screen.findByText("Prodotto A");
    fireEvent.click(screen.getByRole("button", { name: "Disattiva Prodotto A" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Tabella disattivata."));
    expect(state.writes).toEqual<Scrittura[]>([
      { table: "eic_tabelle_finanziamento", op: "update", value: { attiva: false }, filters: [["id", "t1"], ["company_id", "company-1"]] },
    ]);
  });

  it("eliminare chiede conferma e poi scrive", async () => {
    apri("elenco");
    await screen.findByText("Prodotto A");
    fireEvent.click(screen.getByRole("button", { name: "Elimina Prodotto A" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Eliminare la tabella?")).toBeInTheDocument();
    expect(state.writes).toEqual([]);
    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina tabella" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Tabella «Prodotto A» eliminata."));
    expect(state.writes).toEqual<Scrittura[]>([
      { table: "eic_tabelle_finanziamento", op: "delete", value: null, filters: [["id", "t1"], ["company_id", "company-1"]] },
    ]);
  });

  it("l'amministratore con tutti i permessi modifica come prima", async () => {
    state.permissions = { ...PUO_MODIFICARE, isAdmin: true, canViewSettingsPricing: true, canEditSettingsPricing: true };
    apri("elenco");
    await screen.findByText("Prodotto A");
    expect(screen.getByRole("button", { name: "Elimina Prodotto A" })).toBeEnabled();
  });
});

describe("Dettaglio", () => {
  beforeEach(() => {
    state.tabelle = [tabella()];
    state.righe = [riga(), riga({ id: "r2", numero_rate: 36, durata_mesi: 36, importo_rata: 170 })];
  });

  it("chi può solo vedere: Duplica, Disattiva ed Elimina sono spenti con la frase, e non parte nessuna scrittura", async () => {
    state.permissions = { ...SOLO_VEDERE };
    apri("dettaglio");
    await screen.findByRole("heading", { level: 2, name: /Prodotto A/ });
    expect(screen.getByText(FRASE_SOLA_LETTURA).closest("[role=alert]")).toHaveAttribute("id", "finanziamenti-sola-lettura");
    for (const nome of ["Duplica", "Disattiva", "Elimina"]) {
      const comando = screen.getByRole("button", { name: nome });
      expect(comando, nome).toBeDisabled();
      expect(comando).toHaveAttribute("title", FRASE_SOLA_LETTURA);
      expect(comando).toHaveAccessibleDescription(FRASE_SOLA_LETTURA);
      fireEvent.click(comando);
    }
    expect(screen.queryByText("Eliminare la tabella?")).toBeNull();
    expect(state.writes).toEqual([]);
    // consultare resta acceso: le schede
    expect(screen.getByRole("tab", { name: "Calcolatore" })).toBeEnabled();
  });

  it("chi può modificare: nessun avviso e i tre comandi sono accesi", async () => {
    apri("dettaglio");
    await screen.findByRole("heading", { level: 2, name: /Prodotto A/ });
    expect(screen.queryByText(FRASE_SOLA_LETTURA)).toBeNull();
    for (const nome of ["Duplica", "Disattiva", "Elimina"]) expect(screen.getByRole("button", { name: nome })).toBeEnabled();
  });

  it("Disattiva scrive solo «attiva»", async () => {
    apri("dettaglio");
    await screen.findByRole("heading", { level: 2, name: /Prodotto A/ });
    fireEvent.click(screen.getByRole("button", { name: "Disattiva" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Tabella disattivata."));
    expect(state.writes).toEqual<Scrittura[]>([
      { table: "eic_tabelle_finanziamento", op: "update", value: { attiva: false }, filters: [["id", "t1"], ["company_id", "company-1"]] },
    ]);
  });

  it("Elimina chiede conferma, scrive e torna all'elenco", async () => {
    apri("dettaglio");
    await screen.findByRole("heading", { level: 2, name: /Prodotto A/ });
    fireEvent.click(screen.getByRole("button", { name: "Elimina" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(state.writes).toEqual([]);
    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina tabella" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Tabella eliminata."));
    expect(state.writes).toEqual<Scrittura[]>([
      { table: "eic_tabelle_finanziamento", op: "delete", value: null, filters: [["id", "t1"], ["company_id", "company-1"]] },
    ]);
    await waitFor(() => expect(screen.getByTestId("percorso")).toHaveTextContent(/^\/azienda\/impostazioni\/finanziamenti$/));
  });

  it("Duplica crea la copia con le sue righe", async () => {
    apri("dettaglio");
    await screen.findByRole("heading", { level: 2, name: /Prodotto A/ });
    await waitFor(() => expect(screen.getByRole("button", { name: "Duplica" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Duplica" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Tabella duplicata.", expect.anything()));
    expect(state.writes.map((w) => `${w.op} ${w.table}`)).toEqual(["insert eic_tabelle_finanziamento", "insert eic_tabelle_finanziamento_righe"]);
    expect(state.writes[0].value).toMatchObject({ nome_prodotto: "Prodotto A (copia)", company_id: "company-1" });
    expect(state.writes[1].value).toHaveLength(2);
  });
});

describe("Nuova tabella", () => {
  it("chi può solo vedere (se la pagina si apre lo stesso): avviso, campi e pulsanti spenti, il ritorno all'elenco resta acceso", async () => {
    state.permissions = { ...SOLO_VEDERE };
    apri("nuova");
    expect(await screen.findByText(FRASE_SOLA_LETTURA)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome prodotto/)).toBeDisabled();
    expect(screen.getByLabelText("Note interne")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nuova finanziaria" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Torna alle tabelle" })).toHaveAttribute("href", "/azienda/impostazioni/finanziamenti");
    expect(state.writes).toEqual([]);
  });

  it("chi può modificare: nessun avviso e i campi sono accesi", async () => {
    apri("nuova");
    expect(await screen.findByLabelText(/Nome prodotto/)).toBeEnabled();
    expect(screen.queryByText(FRASE_SOLA_LETTURA)).toBeNull();
  });
});

describe("Calcolatore", () => {
  it("senza tabelle attive: chi può modificare vede un collegamento a «Carica una tabella»", async () => {
    apri("calcolatore");
    expect(await screen.findByRole("link", { name: "Carica una tabella" })).toHaveAttribute("href", "/azienda/impostazioni/finanziamenti/nuova");
    expect(screen.queryByText(FRASE_SOLA_LETTURA)).toBeNull();
  });

  it("senza tabelle attive: chi può solo vedere ha il pulsante spento e la frase che spiega perché", async () => {
    state.permissions = { ...SOLO_VEDERE };
    apri("calcolatore");
    const pulsante = await screen.findByRole("button", { name: "Carica una tabella" });
    expect(pulsante).toBeDisabled();
    expect(pulsante).toHaveAccessibleDescription(FRASE_SOLA_LETTURA);
    expect(screen.queryByRole("link", { name: "Carica una tabella" })).toBeNull();
  });

  it("con le tabelle il calcolatore non ha niente che scrive e nessun avviso", async () => {
    state.permissions = { ...SOLO_VEDERE };
    state.tabelle = [tabella()];
    apri("calcolatore");
    expect(await screen.findByLabelText("Tabella finanziamento")).toBeInTheDocument();
    expect(screen.queryByText(FRASE_SOLA_LETTURA)).toBeNull();
    expect(screen.queryByRole("button", { name: "Carica una tabella" })).toBeNull();
  });
});

describe("Chi non può nemmeno vedere", () => {
  it.each(["elenco", "dettaglio", "nuova", "calcolatore"] as const)("%s: la scheda dice quale permesso serve e a chi chiederlo", async (pagina) => {
    state.permissions = { ...NIENTE };
    state.tabelle = [tabella()];
    apri(pagina);
    const scheda = await screen.findByText(FRASE_ACCESSO_NEGATO);
    expect(scheda.closest("[role=alert]")).not.toBeNull();
    expect(screen.queryByText(/Accesso riservato/)).toBeNull();
    expect(screen.queryByText(/Solo l.amministratore/)).toBeNull();
    expect(screen.queryByText("Prodotto A")).toBeNull();
    expect(state.writes).toEqual([]);
  });
});
