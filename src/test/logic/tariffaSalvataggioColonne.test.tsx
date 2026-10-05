import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TariffaDialog } from "@/pages/azienda/settings/SettingsTariffe";
import type { Tariffa } from "@/pages/azienda/settings/SettingsTariffe/types";

/**
 * Pagina Tariffe: riaprire e salvare una voce non deve perdere niente (05/10/2026).
 *
 * Le voci scritte da import e codice vecchio hanno costo_interno allo 0 di
 * default (costo vero in prezzo_costo) e unita_fatturazione al «pz» di default
 * (unità vera nella legacy `unita`). Il dialog mostrava 0 € e «pz» — campo
 * bloccato — e salvando li scriveva su tutte le colonne. E l'incidenza
 * manodopera, mostrata arrotondata all'intero, tornava indietro arrotondata.
 */

const api = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => api } }));
vi.mock("@/hooks/useUserPermissions", () => ({ useUserPermissions: () => ({ data: { can_view_costs: false } }) }));
vi.mock("@/components/listino/TariffaProdottiCollegati", () => ({ TariffaProdottiCollegati: (): null => null }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: vi.fn() } }));

const vecchia: Tariffa = {
  id: "tariffa-demo", company_id: "company-demo", nome: "Posa pavimento gres", tipo: "posa",
  unita: "mq", unita_fatturazione: "pz", prezzo_vendita: 50, costo_interno: 0, prezzo_costo: 30,
  incidenza_manodopera_pct: 0.3162, attivo: true, custom_field_values: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  api.update.mockReturnValue(api);
  api.eq.mockReturnValue(api);
  api.select.mockReturnValue(api);
  api.single.mockResolvedValue({ data: { id: vecchia.id }, error: null as null });
});
afterEach(cleanup);

const props = { open: true, onClose: vi.fn(), companyId: vecchia.company_id, isAdmin: true, currentVertical: "bagno", onSaved: vi.fn() };

describe("TariffaDialog — una voce vecchia riaperta e salvata", () => {
  it("mostra il costo vero (prezzo_costo) e lo salva in tutte e tre le colonne", async () => {
    render(<TariffaDialog {...props} editing={vecchia} />);
    expect(screen.getByLabelText("Costo diretto")).toHaveValue(30);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(api.single).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0][0]).toMatchObject({ costo_interno: 30, prezzo_costo: 30, costo_default: 30 });
  });

  it("tiene l'unità vera della legacy invece del «pz» di default", async () => {
    render(<TariffaDialog {...props} editing={vecchia} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(api.single).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0][0]).toMatchObject({ unita: "mq", unita_fatturazione: "mq" });
  });

  it("un'unità a giornata resta a giornata (la legacy dice «h»)", async () => {
    render(<TariffaDialog {...props} editing={{ ...vecchia, unita: "h", unita_fatturazione: "gg" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(api.single).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0][0]).toMatchObject({ unita: "h", unita_fatturazione: "gg" });
  });

  it("l'incidenza dell'analisi prezzi (0,3162) si mostra con i decimali e torna uguale", async () => {
    render(<TariffaDialog {...props} editing={vecchia} />);
    expect(screen.getByPlaceholderText("Es. 35")).toHaveValue(31.62);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(api.single).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0][0].incidenza_manodopera_pct).toBe(0.3162);
  });

  it("un'incidenza scritta in percento diventa frazione", async () => {
    render(<TariffaDialog {...props} editing={{ ...vecchia, incidenza_manodopera_pct: null }} />);
    fireEvent.change(screen.getByPlaceholderText("Es. 35"), { target: { value: "35.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(api.single).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0][0].incidenza_manodopera_pct).toBe(0.355);
  });
});
