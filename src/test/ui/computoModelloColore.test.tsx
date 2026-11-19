import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const stato = vi.hoisted(() => ({ salvato: {} as Record<string, unknown>, salva: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo", name: "Impresa Demo", brand_primary_color: "#1E40AF" } }) }));
vi.mock("@/lib/computo/modelloComputo", async originale => {
  const m = await originale<typeof import("@/lib/computo/modelloComputo")>();
  return { ...m, useModelloComputo: () => ({ isLoading: false, error: null as null, data: { modello: m.leggiModelloComputo(stato.salvato), salvato: true } }), useSalvaModelloComputo: () => ({ isPending: false, mutate: stato.salva }) };
});
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: (): null => null }));
vi.mock("@/components/preventivi/CondizioniContratto", () => ({ CondizioniContratto: (): null => null }));
import ComputoModelloPanel from "@/components/computo/ComputoModelloPanel";
beforeEach(() => { stato.salvato = {}; stato.salva.mockReset().mockImplementation((m, opzioni) => { stato.salvato = m; opzioni.onSuccess(); }); });
afterEach(cleanup);
it("salva il colore della copertina e lo ritrova riaprendo il modello", () => {
  const pagina = render(<ComputoModelloPanel canEdit />);
  fireEvent.change(screen.getByLabelText("Codice colore della copertina"), { target: { value: "#ff0000" } });
  expect(screen.getByLabelText("Sfondo della copertina")).toHaveValue("#ff0000");
  fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
  expect(stato.salva).toHaveBeenCalledWith(expect.objectContaining({ coloreCopertina: "#ff0000" }), expect.anything());
  pagina.unmount(); render(<ComputoModelloPanel canEdit />);
  expect(screen.getByLabelText("Codice colore della copertina")).toHaveValue("#ff0000");
});
it("segnala un codice incompleto senza salvare e permette di tornare al colore automatico", () => {
  render(<ComputoModelloPanel canEdit />);
  fireEvent.change(screen.getByLabelText("Codice colore della copertina"), { target: { value: "#ff" } });
  expect(screen.getByRole("alert")).toHaveTextContent("#1E40AF");
  expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Colore automatico" }));
  expect(screen.getByLabelText("Codice colore della copertina")).toHaveValue("");
});
