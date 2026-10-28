import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({
  permissions: {} as Record<string, boolean>, error: false, save: vi.fn(), retry: vi.fn(),
  field: { id: "f", name: "Accesso concordato", field_type: "checkbox", options: null as string[] | null },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "a" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => s.permissions }));
vi.mock("@/hooks/useEntityCustomFields", () => ({
  useEntityCustomFields: () => ({ data: [s.field], isLoading: false, isError: s.error, refetch: s.retry }),
  useEntityFieldValues: () => ({ data: [{ field_id: "f", value: "false" }], isLoading: false, isError: false, refetch: s.retry }),
  useUpsertEntityFieldValues: () => ({ mutateAsync: s.save }),
}));
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { queryKeys } from "@/lib/queryKeys";
beforeEach(() => { s.permissions = { isLoading: false, isAdmin: true, solaLettura: false }; s.error = false; s.save.mockReset().mockResolvedValue(undefined); s.retry.mockReset(); });
afterEach(cleanup);
describe("campi entità: sola lettura e salvataggio confermato", () => {
  it.each(["isLoading", "solaLettura"])("%s disabilita anche i custom, non solo il pulsante del record", async flag => {
    s.permissions[flag] = true;
    render(<EntityCustomFieldsSection entityType="appointment" entityId="app" />);
    if (flag === "isLoading") expect(screen.queryByRole("checkbox")).toBeNull();
    else { expect(screen.getByRole("checkbox").getAttribute("data-disabled")).not.toBeNull(); fireEvent.click(screen.getByRole("checkbox")); }
    expect(s.save).not.toHaveBeenCalled();
  });
  it("il genitore può disabilitare la sezione anche per un admin", () => {
    render(<EntityCustomFieldsSection entityType="appointment" entityId="app" disabled />);
    expect(screen.getByRole("checkbox").getAttribute("data-disabled")).not.toBeNull();
  });
  it("senza permesso dell'oggetto non modifica", () => {
    s.permissions.isAdmin = false;
    render(<EntityCustomFieldsSection entityType="warehouse" entityId="stock" />);
    expect(screen.queryByRole("checkbox")).toBeNull(); expect(screen.getByText(/Non hai il permesso di leggere/)).toBeTruthy(); expect(s.save).not.toHaveBeenCalled();
  });
  it("gli errori di lettura non diventano 'nessun campo'", async () => {
    s.error = true; render(<EntityCustomFieldsSection entityType="task" entityId="task" />);
    expect(screen.getByRole("alert")).toBeTruthy(); expect(screen.queryByText(/Nessun campo personalizzato/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" })); expect(s.retry).toHaveBeenCalledTimes(2);
  });
  it("il salvataggio porta identità del record e tipo senza convertire un booleano in testo libero", async () => {
    render(<EntityCustomFieldsSection entityType="warehouse" entityId="stock" />);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Salva campo" }));
    await waitFor(() => expect(s.save).toHaveBeenCalledWith([{ entity_type: "warehouse", entity_id: "stock", field_id: "f", value: "true" }]));
  });
  it("le chiavi dei valori isolano aziende diverse anche con lo stesso UUID record", () => {
    expect(queryKeys.entityCustomFieldValues.byEntity("task", "id", "a")).not.toEqual(queryKeys.entityCustomFieldValues.byEntity("task", "id", "b"));
  });
});
