import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const contatti = vi.hoisted(() => [{ id: "k1", first_name: "Anna", last_name: "Bianchi", email: null, fiscal_code: "bncnna80a41l219x" }]);
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az" }));
vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "limit", "or"]) catena[m] = () => catena;
  catena.order = () => Promise.resolve({ data: contatti, error: null });
  return { supabase: { from: () => catena } };
});
import { Cointestatario } from "@/components/preventivatore/Cointestatario";
import { nomeCointestatario } from "@/lib/preventivatore/cointestatario";
import { applicaMergeTagModulo } from "@/lib/mergeTagsModuli";

const render = (ui: ReactElement) =>
  renderBase(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe("preventivo cointestato", () => {
  it("nelle condizioni il committente sono tutti e due", () => {
    const testo = applicaMergeTagModulo("Committente: {{cliente.nome_completo}}.", {
      clienteNome: "Mario", clienteCognome: "Rossi", cointestatario: "Anna Bianchi",
    });
    expect(testo).toBe("Committente: Mario Rossi e Anna Bianchi.");
    expect(applicaMergeTagModulo("{{cliente.nome_completo}}", { clienteNome: "Mario", clienteCognome: "Rossi" })).toBe("Mario Rossi");
  });

  it("il nome del cointestatario c'è solo se è scritto", () => {
    expect(nomeCointestatario({ cointestatario_nome: " Anna ", cointestatario_cognome: "Bianchi" })).toBe("Anna Bianchi");
    expect(nomeCointestatario({ cointestatario_nome: "", cointestatario_cognome: null })).toBeNull();
    expect(nomeCointestatario(null)).toBeNull();
  });

  it("l'interruttore apre i campi; spento li svuota", () => {
    const onChange = vi.fn();
    render(<Cointestatario form={{}} onChange={onChange} />);
    expect(screen.queryByLabelText("Nome")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Preventivo cointestato" }));
    fireEvent.change(screen.getByLabelText("Codice fiscale"), { target: { value: "bncnna80a41l219x" } });
    expect(onChange).toHaveBeenCalledWith("cointestatario_codice_fiscale", "BNCNNA80A41L219X");
    fireEvent.click(screen.getByRole("switch", { name: "Preventivo cointestato" }));
    expect(onChange).toHaveBeenCalledWith("cointestatario_nome", null);
    expect(onChange).toHaveBeenCalledWith("cointestatario_cognome", null);
    expect(onChange).toHaveBeenCalledWith("cointestatario_codice_fiscale", null);
  });

  it("si può prendere da un contatto del CRM, ma non è obbligatorio", async () => {
    // La lista dei contatti (cmdk) misura gli elementi: jsdom non ha ResizeObserver.
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView ??= () => {};
    const onChange = vi.fn();
    render(<Cointestatario form={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Preventivo cointestato" }));
    fireEvent.click(screen.getByRole("button", { name: /Scegli dai contatti/ }));
    fireEvent.click(await screen.findByText("Anna Bianchi"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("cointestatario_nome", "Anna"));
    expect(onChange).toHaveBeenCalledWith("cointestatario_cognome", "Bianchi");
    expect(onChange).toHaveBeenCalledWith("cointestatario_codice_fiscale", "BNCNNA80A41L219X");
  });

  it("un preventivo già cointestato si apre coi campi visibili", () => {
    render(<Cointestatario form={{ cointestatario_nome: "Anna", cointestatario_cognome: "Bianchi" }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Cognome")).toHaveValue("Bianchi");
  });
});
