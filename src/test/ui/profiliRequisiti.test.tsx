import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
const s = vi.hoisted(() => ({
  readonly: false,
  error: false,
  pending: false,
  profiles: [] as unknown[],
  salva: vi.fn(),
  archivia: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: true,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/hooks/useProfiliRequisiti", () => ({
  useProfiliRequisiti: () => ({
    data: s.profiles,
    isLoading: false,
    isError: s.error,
    refetch: s.refetch,
  }),
  useSalvaProfiloRequisiti: () => ({
    mutateAsync: s.salva,
    isPending: s.pending,
  }),
  useArchiviaProfiloRequisiti: () => ({
    mutateAsync: s.archivia,
    isPending: s.pending,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ProfiliRequisitiDialog } from "@/components/sicurezza/ProfiliRequisitiDialog";
import { ProfiliPerVerifica } from "@/components/sicurezza/ProfiliPerVerifica";
import type { ProfiloRequisiti } from "@/lib/sicurezza/profiliRequisiti";
const p: ProfiloRequisiti = {
  id: "p1",
  company_id: "azienda",
  famiglia_id: "famiglia",
  versione: 1,
  precedente_id: null,
  nome: "Profilo posa",
  attivita: "Posa interna",
  ruoli: "Preposto",
  limiti: "Escluso lavoro in quota",
  creato_da: "u",
  creato_il: "2026-10-27",
  archiviato: false,
  criteri: [
    {
      id: "r1",
      titolo: "Criterio specifico",
      catalogo_id: null,
      catalogo_versione: null,
      riferimento: "Rif.",
      indicazioni: "Da contestualizzare",
    },
  ],
};
afterEach(cleanup);
beforeEach(() => {
  s.readonly = false;
  s.error = false;
  s.pending = false;
  s.profiles = [p];
  s.salva
    .mockReset()
    .mockRejectedValue(new Error("Esiste una versione più recente"));
  s.archivia.mockReset().mockResolvedValue(undefined);
});
const mostra = () =>
  render(<ProfiliRequisitiDialog companyId="azienda" onClose={vi.fn()} />);
describe("Libreria profili aziendali", () => {
  it("un passaggio alla sola lettura durante la compilazione blocca campi e registrazione", () => {
    const ui = mostra();
    fireEvent.click(screen.getByRole("button", { name: "Nuova versione" }));
    s.readonly = true;
    ui.rerender(
      <ProfiliRequisitiDialog companyId="azienda" onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText("Nome del profilo")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Salva nuova versione" }),
    ).toBeDisabled();
    expect(s.salva).not.toHaveBeenCalled();
  });

  it("la sola lettura consulta senza creare, versionare o archiviare", () => {
    s.readonly = true;
    mostra();
    expect(screen.getByText("Profilo posa")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nuovo profilo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nuova versione" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Archivia versione" }),
    ).toBeNull();
  });
  it("una nuova versione richiede una nuova conferma e preserva il modulo dopo errore", async () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Nuova versione" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Salva nuova versione" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Conferma");
    expect(s.salva).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Ho verificato che i testi/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Salva nuova versione" }),
    );
    await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(1));
    const invio = s.salva.mock.calls[0][0];
    expect(invio.precedente).toBe("p1");
    expect(invio.dati.criteri).toEqual(p.criteri);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "versione più recente",
    );
    expect(screen.getByLabelText("Nome del profilo")).toHaveValue(
      "Profilo posa",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Salva nuova versione" }),
    );
    await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(2));
    expect(s.salva.mock.calls[1][0].id).toBe(invio.id);
  });
  it("modificare il profilo azzera l’attestazione di riutilizzabilità", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Nuova versione" }));
    const c = screen.getByRole("checkbox", {
      name: /Ho verificato che i testi/,
    });
    fireEvent.click(c);
    expect(c).toBeChecked();
    fireEvent.change(screen.getByLabelText("Condizioni e limiti d’impiego"), {
      target: { value: "Nuovi limiti" },
    });
    expect(c).not.toBeChecked();
  });
  it("solo l’ultima versione offre l’azione nuova versione; archivia una versione specifica", async () => {
    s.profiles = [p, { ...p, id: "p2", versione: 2, precedente_id: "p1" }];
    mostra();
    expect(
      screen.getAllByRole("button", { name: "Nuova versione" }),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Archivia versione" })[0],
    );
    await waitFor(() => expect(s.archivia).toHaveBeenCalledWith(p));
  });
  it("l’errore della libreria non appare come libreria vuota", () => {
    s.error = true;
    mostra();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Profili non disponibili",
    );
    expect(screen.queryByText(/Nessun profilo con questi filtri/)).toBeNull();
  });
});
describe("Scelta del profilo per la verifica del caso", () => {
  it("espone i limiti prima del caricamento e importa criteri senza conformità", () => {
    const cambia = vi.fn();
    render(
      <ProfiliPerVerifica
        companyId="azienda"
        criteri={[]}
        onChange={cambia}
        onError={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Profilo requisiti da caricare"), {
      target: { value: "p1" },
    });
    expect(screen.getByText("Escluso lavoro in quota")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Carica criteri del profilo" }),
    );
    expect(cambia.mock.calls[0][0][0]).toMatchObject({
      profilo_id: "p1",
      profilo_versione: 1,
      applicabilita: "da_chiarire",
      esito: "da_verificare",
      evidenze: [],
      note: "",
    });
  });
  it("un profilo archiviato durante la scelta non viene applicato", () => {
    const cambia = vi.fn();
    const errore = vi.fn();
    const ui = render(
      <ProfiliPerVerifica
        companyId="azienda"
        criteri={[]}
        onChange={cambia}
        onError={errore}
      />,
    );
    fireEvent.change(screen.getByLabelText("Profilo requisiti da caricare"), {
      target: { value: "p1" },
    });
    s.profiles = [{ ...p, archiviato: true }];
    ui.rerender(
      <ProfiliPerVerifica
        companyId="azienda"
        criteri={[]}
        onChange={cambia}
        onError={errore}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Carica criteri del profilo" }),
    );
    expect(cambia).not.toHaveBeenCalled();
    expect(errore).toHaveBeenCalledWith("Questa versione è archiviata.");
  });
});
