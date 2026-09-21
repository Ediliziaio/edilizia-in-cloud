import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * I permessi dicono la verità (21/09/2026).
 *
 * Una pagina che si apre con un permesso deve lasciar fare quello che mostra, e
 * non mostrare quello che il database rifiuterà. Prima dello staff col permesso
 * «Personalizzazione» apriva «Sequenze», creava una pipeline e riceveva un
 * rifiuto: il database su quelle tabelle faceva scrivere solo l'amministratore.
 * Due metà da tenere insieme:
 *  - il database (migration 20280921153700): quale permesso scrive quale tabella;
 *  - le pagine: i pulsanti di modifica compaiono con lo STESSO permesso.
 * Se una delle due cambia da sola, questo test lo dice.
 */

const radice = resolve(__dirname, "../../..");
const leggi = (percorso: string) => readFileSync(resolve(radice, percorso), "utf8");
const MIGRATION = leggi("supabase/migrations/20280921153700_permessi_dicono_la_verita.sql");

/** Tabella → permesso che il database chiede per scriverla → pagine che la scrivono. */
const COPPIE = [
  { tabella: "marketing_pipelines", db: "can_edit_settings_customization", app: "canEditSettingsCustomization", file: ["src/components/settings/PipelinesConfig.tsx"] },
  { tabella: "marketing_pipeline_stages", db: "can_edit_settings_customization", app: "canEditSettingsCustomization", file: ["src/components/settings/PipelineStagesConfig.tsx"] },
  { tabella: "marketing_custom_fields", db: "can_edit_settings_customization", app: "canEditSettingsCustomization", file: ["src/components/settings/CustomFieldsConfig.tsx"] },
  { tabella: "marketing_custom_field_folders", db: "can_edit_settings_customization", app: "canEditSettingsCustomization", file: ["src/components/settings/CustomFieldsConfig.tsx"] },
  { tabella: "company_task_statuses", db: "can_edit_settings_customization", app: "canEditSettingsCustomization", file: ["src/pages/azienda/UnifiedTasks.tsx"] },
  { tabella: "suppliers", db: "can_edit_settings_suppliers", app: "canEditSettingsSuppliers", file: ["src/pages/azienda/settings/SettingsSuppliers.tsx"] },
] as const;

describe("database e pagine chiedono lo stesso permesso", () => {
  for (const c of COPPIE) {
    it(`${c.tabella}: il database accetta ${c.db}, la pagina controlla ${c.app}`, () => {
      const riga = new RegExp(`\\('${c.tabella}',\\s*'${c.db}'`);
      expect(MIGRATION).toMatch(riga);
      for (const f of c.file) expect(leggi(f)).toContain(c.app);
    });
  }

  it("la finanza per lo staff resta in sola lettura: il database non la apre in scrittura", () => {
    // Le regole nuove su costi e categorie di tesoreria sono solo di lettura.
    for (const tabella of ["company_costs", "treasury_categories"]) {
      const regole = [...MIGRATION.matchAll(new RegExp(`create policy "[^"]+" on public\\.${tabella}\\s+for (\\w+)`, "g"))];
      expect(regole.length).toBeGreaterThan(0);
      for (const r of regole) expect(r[1]).toBe("select");
    }
    // …e la pagina dei costi nasconde i pulsanti a chi non è amministratore.
    const pagina = leggi("src/components/forecast/CompanyCostsManager.tsx");
    expect(pagina).toMatch(/const soloLettura = !isAdmin;/);
    expect(pagina).toContain("soloLettura={soloLettura}");
  });
});

// ── La pagina «Sequenze» con e senza il permesso di modifica ─────────────────
const AZIENDA = "629d91e0-9d56-4736-a030-1e3833cba2ea";
let puoModificare = true;

/** Quello che risponde il database finto. */
type Risposta = { data: unknown; error: { message: string } | null };

function builder(tabella: string) {
  const risposta = (): Risposta => {
    if (tabella === "marketing_pipelines") {
      return {
        data: [{ id: "p1", name: "Vendite", updated_at: "2026-09-21T10:00:00Z", marketing_pipeline_stages: [{ id: "s1", name: "Nuovo", position: 0 }] }],
        error: null,
      };
    }
    if (tabella === "marketing_pipeline_stages") {
      return {
        data: [
          { id: "s1", name: "Nuovo", position: 0, auto_status: null, win_probability: 10, stalled_threshold_days: 7 },
          { id: "s2", name: "Vinto", position: 1, auto_status: "won", win_probability: 100, stalled_threshold_days: null },
        ],
        error: null,
      };
    }
    return { data: [], error: null };
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "is"]) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risposta()).then(ok, ko);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: AZIENDA } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isLoading: false, canEditSettingsCustomization: puoModificare }),
}));

import { PipelinesConfig } from "@/components/settings/PipelinesConfig";

function monta() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PipelinesConfig />
    </QueryClientProvider>,
  );
}

beforeEach(() => { puoModificare = true; });
afterEach(cleanup);

describe("Impostazioni → Sequenze", () => {
  it("con «Modifica» su Personalizzazione: crea, rinomina, aggiunge fasi e salva", async () => {
    monta();
    expect(await screen.findByText("Vendite")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Crea Sequenza/ })).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();

    fireEvent.click(screen.getByText("Vendite"));
    expect(await screen.findByDisplayValue("Nuovo")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Aggiungi Fase/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Salva/ })).toBeTruthy();
    expect((screen.getByDisplayValue("Nuovo") as HTMLInputElement).matches(":disabled")).toBe(false);
  });

  it("solo «Vedi»: niente pulsanti di modifica, e una riga dice perché", async () => {
    puoModificare = false;
    monta();
    expect(await screen.findByText("Vendite")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Crea Sequenza/ })).toBeNull();
    expect(screen.getByRole("note").textContent).toMatch(/Sola lettura.*Personalizzazione/);

    // Le fasi si consultano ma non si toccano.
    fireEvent.click(screen.getByText("Vendite"));
    const campo = (await screen.findByDisplayValue("Nuovo")) as HTMLInputElement;
    expect(campo.matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: /Aggiungi Fase/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Salva$/ })).toBeNull();
    expect(screen.getByRole("note").textContent).toMatch(/Sola lettura/);
  });
});
