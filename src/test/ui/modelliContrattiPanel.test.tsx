import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
const m = vi.hoisted(() => ({
  save: vi.fn(),
  onDirty: vi.fn(),
  onSaving: vi.fn(),
  canView: true,
  canEdit: true,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-a", name: "Azienda A" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isAdmin: false,
    canViewSettingsPricing: m.canView,
    canEditSettingsPricing: m.canEdit,
  }),
}));
vi.mock("@/hooks/useQuoteTemplates", () => ({
  useQuoteTemplates: () => ({
    templates: [
      {
        id: "contratto-a",
        company_id: "azienda-a",
        name: "Condizioni aziendali",
        kind: "condizioni",
        body_html: "# Condizioni\n\nTesto originale.",
        body_format: "markdown",
        updated_at: "versione-originale",
      },
    ],
    isLoading: false,
    fetchError: null,
    refetch: vi.fn(),
    upsertTemplate: { mutateAsync: m.save, isPending: false },
  }),
}));
vi.mock("@/components/ui/rich-text-editor-safe", () => ({
  RichTextEditorSafe: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange: (v: string) => void;
    readOnly: boolean;
  }) => (
    <textarea
      aria-label="Testo contratto"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
    />
  ),
}));
vi.mock("@/components/quotes/QuotePdfLivePreview", () => ({
  QuotePdfLivePreview: ({
    template,
    companyId,
  }: {
    template: unknown;
    companyId: string;
  }) => (
    <pre data-testid="pdf-contratto">
      {JSON.stringify([companyId, template])}
    </pre>
  ),
}));
import Panel from "@/pages/azienda/settings/modelliPdf/ModelliContrattiPanel";
beforeEach(() => {
  m.save.mockReset().mockResolvedValue({ id: "contratto-a" });
  m.onDirty.mockReset();
  m.onSaving.mockReset();
  m.canView = true;
  m.canEdit = true;
});
afterEach(cleanup);
function open() {
  render(
    <MemoryRouter>
      <Panel onDirty={m.onDirty} onSaving={m.onSaving} />
    </MemoryRouter>,
  );
}
describe("Contratti nella libreria PDF", () => {
  it("modifica il blocco esistente e usa la sua versione per prevenire sovrascritture", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Testo contratto"), {
      target: { value: "<p>Condizioni aggiornate</p>" },
    });
    expect(screen.getByTestId("pdf-contratto")).toHaveTextContent(
      "Condizioni aggiornate",
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva contratto" }));
    await waitFor(() =>
      expect(m.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "contratto-a",
          company_id: "azienda-a",
          body_html: "<p>Condizioni aggiornate</p>",
          body_format: "html",
          expectedUpdatedAt: "versione-originale",
        }),
      ),
    );
    expect(m.onSaving).toHaveBeenCalledWith(true);
  });
  it("mantiene la bozza quando il salvataggio fallisce", async () => {
    m.save.mockRejectedValue(
      new Error(
        "Il contratto è stato aggiornato da un altro terminale. Ricarica i contratti prima di salvare.",
      ),
    );
    open();
    fireEvent.change(screen.getByLabelText("Testo contratto"), {
      target: { value: "<p>Da conservare</p>" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva contratto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "altro terminale",
    );
    expect(screen.getByLabelText("Testo contratto")).toHaveValue(
      "<p>Da conservare</p>",
    );
  });
  it("rispetta i permessi del listino per testi contrattuali", () => {
    m.canEdit = false;
    open();
    expect(screen.getByLabelText("Testo contratto")).toHaveAttribute(
      "readonly",
    );
    expect(
      screen.getByRole("button", { name: "Salva contratto" }),
    ).toBeDisabled();
  });
  it("non carica il contenuto dei contratti a chi non può consultarli", () => {
    m.canView = false;
    open();
    expect(screen.queryByLabelText("Testo contratto")).toBeNull();
    expect(screen.getByText(/Per consultare i contratti/)).toBeTruthy();
  });
});
