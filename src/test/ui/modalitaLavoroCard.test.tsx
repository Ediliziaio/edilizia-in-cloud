/**
 * «Come si misura e si fattura» nella Panoramica della commessa (lotto 2, 28/11/2026).
 *
 * Tre cose che devono reggere: si cambia solo se si può, il suggerimento arriva da
 * `commessa_modalita_quadro` e non dal browser, e una commessa con documenti emessi lo dice invece
 * di far finta di niente.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ModalitaLavoroCard } from "@/components/orders/ModalitaLavoroCard";

const m = vi.hoisted(() => ({
  quadro: {} as Record<string, unknown>,
  salvato: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: { mutationFn: unknown }) => ({
    isPending: false,
    mutate: (v: unknown) => { void mutationFn; m.salvato(v); },
  }),
  useQuery: () => ({ data: m.quadro, isError: false, isLoading: false }),
}));

beforeEach(() => {
  m.salvato = vi.fn();
  m.quadro = { modalita: "semplice", suggerita: "semplice", ha_computo: false, ha_economia: false, si_puo_cambiare: true };
});
afterEach(cleanup);

const draw = (puoModificare = true) => render(<ModalitaLavoroCard orderId="o1" puoModificare={puoModificare} />);

it("mostra il modo di partenza e lo si può cambiare", () => {
  draw();
  expect(screen.getByText("Acconto e saldo")).toBeTruthy();
  expect(screen.getByLabelText("Come si misura e si fattura")).toBeTruthy();
});

it("senza il permesso di modifica non c'è niente da cambiare", () => {
  draw(false);
  expect(screen.queryByLabelText("Come si misura e si fattura")).toBeNull();
  expect(screen.getByText("Acconto e saldo")).toBeTruthy();
});

it("con documenti emessi dice perché non si cambia più", () => {
  m.quadro = { ...m.quadro, modalita: "computo", si_puo_cambiare: false, suggerita: "economia" };
  draw();
  expect(screen.queryByLabelText("Come si misura e si fattura")).toBeNull();
  expect(screen.getByText(/documenti emessi/)).toBeTruthy();
});

it("il suggerimento arriva dai dati, e un clic lo applica", () => {
  m.quadro = { ...m.quadro, ha_computo: true, suggerita: "computo" };
  draw();
  expect(screen.getByText(/ha un computo/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Passa a A computo/ }));
  expect(m.salvato).toHaveBeenCalledWith("computo");
});

it("computo e listino insieme: il suggerimento è quello del caso C", () => {
  m.quadro = { ...m.quadro, ha_computo: true, ha_economia: true, suggerita: "computo_ed_economia" };
  draw();
  expect(screen.getByText(/SAL sul computo e il rendiconto per gli extra/)).toBeTruthy();
});

it("quando la modalità è già quella che i dati dicono, nessun suggerimento", () => {
  m.quadro = { ...m.quadro, modalita: "computo", suggerita: "computo", ha_computo: true };
  draw();
  expect(screen.queryByText(/ha un computo/)).toBeNull();
});
