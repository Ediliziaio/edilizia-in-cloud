import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FeatureFlags from "@/pages/admin/FeatureFlags";

const demo = vi.hoisted(() => ({
  readError: false,
  upsert: vi.fn((): { error: null } => ({ error: null })),
  ranges: vi.fn(),
  rpc: vi.fn((): { error: null } => ({ error: null })),
  remove: vi.fn(),
  update: vi.fn(),
  updateResult: null as { id: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: demo.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        order: () => query,
        range: (from: number, to: number) => { demo.ranges(table, from, to); return query; },
        upsert: demo.upsert,
        delete: demo.remove,
        update: (patch: unknown) => { demo.update(table, patch); return query; },
        eq: (_column: string, _value: string) => query,
        maybeSingle: () => Promise.resolve({ data: demo.updateResult, error: null }),
        then: (resolve: (result: { data: unknown[]; error: Error | null }) => void) => {
          const data: Record<string, unknown[]> = {
            platform_feature_flags: [
              { id: "f1", key: "calendario", name: "Calendario", category: "core", supports_preview: true },
              { id: "f2", key: "preventivi", name: "Preventivi", category: "core", default_value: true },
            ],
            companies: [{ id: "a", name: "Azienda Alfa" }, { id: "b", name: "Azienda Beta" }],
            subscription_plans: [],
            company_feature_overrides: [
              { id: "override-a", company_id: "a", feature_key: "calendario", is_enabled: true, access_level: "enabled", expires_at: "2000-01-01T00:00:00Z" },
              { id: "override-b", company_id: "b", feature_key: "calendario", is_enabled: false, access_level: "preview", expires_at: "2099-01-01T00:00:00Z" },
            ],
          };
          return Promise.resolve({
            data: data[table] ?? [],
            error: table === "company_feature_overrides" && demo.readError ? new Error("Catalogo non disponibile") : null,
          }).then(resolve);
        },
      };
      return query;
    },
  },
}));

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FeatureFlags /></QueryClientProvider>);
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  demo.readError = false;
  demo.updateResult = null;
});

it("combina ricerca e catalogo, mostra l'eccezione scaduta e richiede conferma per l'attivazione generale", async () => {
  open();
  const search = await screen.findByRole("textbox", { name: "Cerca funzionalità" });
  fireEvent.change(search, { target: { value: "Calendario" } });
  expect(await screen.findByText("1 di 2 funzionalità")).toBeTruthy();
  expect(demo.ranges).toHaveBeenCalledWith("company_feature_overrides", 0, 499);
  fireEvent.click(screen.getByRole("button", { name: "Gestisci aziende" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Eccezione scaduta")).toBeTruthy();
  expect(within(dialog).getByRole("combobox", { name: "Accesso di Azienda Alfa" }).textContent).toBe("Eredita");
  fireEvent.click(within(dialog).getByRole("button", { name: "Rimuovi tutte le eccezioni" }));
  const resetAlert = await screen.findByRole("alertdialog");
  expect(within(resetAlert).getByRole("button", { name: "Rimuovi 2 eccezioni" })).toBeTruthy();
  fireEvent.click(within(resetAlert).getByRole("button", { name: "Annulla" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Abilita per tutte" }));
  expect(demo.upsert).not.toHaveBeenCalled();
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Conferma attivazione" }));
  await vi.waitFor(() => expect(demo.upsert).toHaveBeenCalledWith(
    [
      expect.objectContaining({ company_id: "a", access_level: "enabled", expires_at: null }),
      expect.objectContaining({ company_id: "b", access_level: "enabled", expires_at: "2099-01-01T00:00:00Z" }),
    ],
    { onConflict: "company_id,feature_key" },
  ));
});

it("blocca la gestione delle aziende se il catalogo delle eccezioni non si carica", async () => {
  demo.readError = true;
  open();
  expect(await screen.findByRole("alert")).toBeTruthy();
  const actions = await screen.findAllByRole("button", { name: "Gestisci aziende" });
  expect(actions.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  expect(demo.upsert).not.toHaveBeenCalled();
});

it("conferma l'anteprima con una sola chiamata al database e passa soltanto le eccezioni mostrate", async () => {
  open();
  const buttons = await screen.findAllByRole("button", { name: "Gestisci aziende" });
  fireEvent.click(buttons[0]);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("spinbutton"), { target: { value: "50" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Vedi impatto" }));
  const alert = await screen.findByRole("alertdialog");
  expect(demo.rpc).not.toHaveBeenCalled();
  fireEvent.click(within(alert).getByRole("button", { name: "Applica rollout 50%" }));
  await vi.waitFor(() => expect(demo.rpc).toHaveBeenCalledExactlyOnceWith("admin_apply_feature_rollout", {
    p_feature_key: "calendario",
    p_enable: ["a"],
    p_remove: [expect.objectContaining({ id: "override-b", company_id: "b", access_level: "preview" })],
  }));
  expect(demo.upsert).not.toHaveBeenCalled();
  expect(demo.remove).not.toHaveBeenCalled();
});

it("modifica il limite di un'eccezione esistente senza ricrearla se è stata rimossa", async () => {
  open();
  const buttons = await screen.findAllByRole("button", { name: "Gestisci aziende" });
  fireEvent.click(buttons[0]);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getAllByRole("button", { name: "Avanzate" })[1]);
  const limit = within(dialog).getByRole("spinbutton", { name: "Limite" });
  fireEvent.change(limit, { target: { value: "8" } });
  fireEvent.blur(limit);
  await vi.waitFor(() => expect(demo.update).toHaveBeenCalledWith("company_feature_overrides", expect.objectContaining({ limit_value: 8 })));
  expect(demo.upsert).not.toHaveBeenCalled();
});
