import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { PreventiviPipeline } from "@/components/marketing/preventivi/PreventiviPipeline";
import type { UnifiedRow } from "@/components/marketing/preventivi/UnifiedPreventiviList";

const riga: UnifiedRow = { id: "1", tipo: "serramenti", numero: "SF-1", cliente: "Cliente demo", email: "demo@example.test", commerciale_id: null, commerciale_nome: null, stato_unif: "bozza", stato_raw: "bozza", totale: 100, data: "2026-01-01", href: "/test" };
afterEach(cleanup);
const draw = (puoModificare: boolean) => {
  const sposta = vi.fn().mockResolvedValue(undefined);
  const cestina = vi.fn();
  render(<MemoryRouter><PreventiviPipeline righe={[riga]} selezionata={() => false} alterna={() => {}} correlati={() => {}} puoModificare={puoModificare} puoEliminare={puoModificare} puoDuplicare={() => false} inDuplicazione={null} duplica={() => {}} cestina={cestina} sposta={sposta} /></MemoryRouter>);
  return { sposta, cestina };
};
it("offre contatto e spostamento, chiedendo conferma prima di salvare", async () => {
  const { sposta } = draw(true);
  expect(screen.getByRole("link", { name: "Scrivi al cliente di SF-1" })).toHaveAttribute("href", "mailto:demo%40example.test");
  fireEvent.pointerDown(screen.getByRole("button", { name: "Sposta SF-1" }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("menuitem", { name: "In corso" }));
  const dialog = within(await screen.findByRole("alertdialog"));
  expect(dialog.getByText("Pronto da consegnare")).toBeInTheDocument();
  expect(sposta).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Conferma" }));
  await waitFor(() => expect(sposta).toHaveBeenCalledWith(riga, "in_corso"));
});
it("senza permessi non offre spostamento o cestino", () => {
  draw(false);
  expect(screen.queryByRole("button", { name: "Sposta SF-1" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Elimina SF-1" })).not.toBeInTheDocument();
});
