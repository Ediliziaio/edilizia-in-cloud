/**
 * Motivi di perdita: prima i propri, col campo per aggiungerne; gli standard in fondo, chiusi (10/10/2026).
 *
 * Prima per aggiungere un motivo bisognava scorrere sette righe fisse (gli standard stavano sopra e il campo «Nuovo motivo…» in
 * fondo: su telefono cadeva sotto la piega); i titoli «Standard» e «Della tua azienda» erano h3 senza un h2 sopra; nessuna riga
 * diceva dove compaiono i motivi né che per cambiarli serve «Modifica» su Personalizzazione; i pulsanti erano da 32 px.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import SettingsMotiviPerdita from "@/pages/azienda/settings/SettingsMotiviPerdita";

const state = vi.hoisted(() => ({ edit: true, permessiInCaricamento: false, mutate: vi.fn(), refetch: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isLoading: state.permessiInCaricamento, isAdmin: false, canEditSettingsCustomization: state.edit }),
}));
vi.mock("@/hooks/useLossReasons", () => ({
  useLossReasons: () => ({
    motivi: [
      { value: "prezzo", label: "Prezzo troppo alto", predefinito: true },
      { value: "concorrente", label: "Ha scelto un concorrente", predefinito: true },
      { id: "r1", value: "Misure non realizzabili", label: "Misure non realizzabili", predefinito: false },
    ],
    isLoading: false,
    isError: false,
    refetch: state.refetch,
  }),
  useLossReasonUsage: () => ({ data: { prezzo: 2 }, isLoading: false, isError: false, refetch: state.refetch }),
  useAddLossReason: () => ({ mutate: state.mutate, isPending: false }),
  useRenameLossReason: () => ({ mutate: state.mutate, isPending: false }),
  useDeleteLossReason: () => ({ mutate: state.mutate, isPending: false }),
}));

beforeEach(() => { state.edit = true; state.permessiInCaricamento = false; state.mutate.mockClear(); });
afterEach(cleanup);

describe("Motivi di perdita: ordine e parole", () => {
  it("il campo «Nuovo motivo…» viene prima degli standard, che stanno in un riquadro chiuso", () => {
    render(<SettingsMotiviPerdita />);
    const campo = screen.getByLabelText("Nuovo motivo di perdita");
    const standard = screen.getByText("Prezzo troppo alto");
    // Nell'ordine della pagina il campo precede la prima riga standard (prima era il contrario).
    expect(campo.compareDocumentPosition(standard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // I propri motivi precedono gli standard.
    const proprio = screen.getByText("Misure non realizzabili");
    expect(proprio.compareDocumentPosition(standard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const riquadro = standard.closest("details") as HTMLDetailsElement;
    expect(riquadro).toBeTruthy();
    expect(riquadro.open).toBe(false);
    expect(within(riquadro).getByText("Sono uguali per tutte le aziende e non si cambiano.")).toBeTruthy();
    // Il numero degli standard sta nell'intestazione del riquadro.
    expect(within(riquadro.querySelector("summary") as HTMLElement).getByText("2")).toBeTruthy();
    // I motivi dell'azienda NON sono dentro il riquadro chiuso.
    expect(proprio.closest("details")).toBeNull();
  });

  it("titoli di sezione h2 (nessun h3 senza un titolo sopra)", () => {
    render(<SettingsMotiviPerdita />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Della tua azienda", "Motivi standard"]);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("una riga dice dove compaiono i motivi", () => {
    render(<SettingsMotiviPerdita />);
    expect(screen.getByText(/Compaiono nella finestra che si apre quando segni un'opportunità come persa/)).toBeTruthy();
  });

  it("senza «Modifica» su Personalizzazione: la riga lo spiega e non ci sono comandi", () => {
    state.edit = false;
    render(<SettingsMotiviPerdita />);
    expect(screen.getByRole("note").textContent).toBe(
      "Sola lettura: per aggiungere, rinominare o togliere un motivo serve il permesso «Modifica» su Personalizzazione.",
    );
    expect(screen.queryByLabelText("Nuovo motivo di perdita")).toBeNull();
    expect(screen.queryByRole("button", { name: /Rinomina|Togli|Aggiungi/ })).toBeNull();
  });

  it("con il permesso la riga di sola lettura non c'è; mentre i permessi si leggono nemmeno (niente lampo)", () => {
    render(<SettingsMotiviPerdita />);
    expect(screen.queryByRole("note")).toBeNull();
    cleanup();
    state.edit = false;
    state.permessiInCaricamento = true;
    render(<SettingsMotiviPerdita />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("bersagli da 44 px sul telefono: campo, «Aggiungi», matita e cestino", () => {
    render(<SettingsMotiviPerdita />);
    for (const el of [
      screen.getByLabelText("Nuovo motivo di perdita"),
      screen.getByRole("button", { name: "Aggiungi" }),
      screen.getByRole("button", { name: "Rinomina Misure non realizzabili" }),
      screen.getByRole("button", { name: "Togli Misure non realizzabili" }),
    ]) {
      expect(el.className).toMatch(/max-md:h-11/);
    }
  });
});
