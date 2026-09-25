import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TariffaDialog } from "@/pages/azienda/settings/SettingsTariffe";
import { campiConCostoLavorazione, leggiCostoLavorazione } from "@/lib/tariffe/costoLavorazione";
import type { Tariffa } from "@/pages/azienda/settings/SettingsTariffe/types";

const api = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => api } }));
vi.mock("@/hooks/useUserPermissions", () => ({ useUserPermissions: () => ({ data: { can_view_costs: false } }) }));
vi.mock("@/components/listino/TariffaProdottiCollegati", () => ({ TariffaProdottiCollegati: () : null => null }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: vi.fn() } }));

const base: Tariffa = { id: "tariffa-demo", company_id: "company-demo", nome: "Posa lavabo", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 250, costo_interno: 80, prezzo_costo: 80, attivo: false,
  custom_field_values: { _catalog_standard: { version: 1 }, campo_personalizzato: "da conservare" } };
beforeEach(() => { vi.clearAllMocks(); api.update.mockReturnValue(api); api.eq.mockReturnValue(api); api.select.mockReturnValue(api); api.single.mockResolvedValue({ data: { id: base.id }, error: null as null }); });
afterEach(cleanup);
const props = { open: true, onClose: vi.fn(), editing: base, companyId: base.company_id, isAdmin: true, currentVertical: "bagno", onSaved: vi.fn() };

describe("Salvataggio costo senza rompere il listino esistente", () => {
  it("salva configurazione e costo in tutti i campi legacy con filtro azienda", async () => {
    render(<TariffaDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Subappalto" }));
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Costo subappalto"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(api.single).toHaveBeenCalledOnce());
    const payload = api.update.mock.calls[0][0];
    expect(payload).toMatchObject({ costo_interno: 120, prezzo_costo: 120, costo_default: 120, prezzo_vendita: 250, attivo: false, attiva: false });
    expect(payload.custom_field_values.campo_personalizzato).toBe("da conservare");
    expect(leggiCostoLavorazione(payload.custom_field_values)).toMatchObject({ modalita: "subappalto", subappalto: 120, costo_applicato: 120 });
    expect(api.eq).toHaveBeenCalledWith("company_id", base.company_id);
    expect(api.eq).toHaveBeenCalledWith("id", base.id);
  });

  it("riapre ore e costi salvati, con il totale interno corretto", () => {
    const config = { ...leggiCostoLavorazione(null), modalita: "interna" as const, risorse: [{ id: "r1", nome: "Posatore", operatori: 2, ore: 2, costo_orario: 25 }] };
    render(<TariffaDialog {...props} editing={{ ...base, costo_interno: 100, custom_field_values: campiConCostoLavorazione(base.custom_field_values, config, 100, "posa") }} />);
    expect(screen.getByRole("button", { name: "Squadra interna" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Costo orario operatore 1")).toHaveValue(25);
    expect(screen.getByRole("status")).toHaveTextContent("100,00");
  });

  it("non scrive dettagli di costo per utenti senza permesso di modifica costi", async () => {
    render(<TariffaDialog {...props} isAdmin={false} />);
    expect(screen.queryByRole("button", { name: "Squadra interna" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(api.single).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0][0]).not.toHaveProperty("costo_interno");
    expect(api.update.mock.calls[0][0]).not.toHaveProperty("costo_default");
  });

  it("non segnala successo se il database non aggiorna la riga", async () => {
    api.single.mockResolvedValue({ data: null as null, error: null as null });
    render(<TariffaDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(api.error).toHaveBeenCalledWith(expect.stringContaining("Voce non aggiornata")));
  });
});
