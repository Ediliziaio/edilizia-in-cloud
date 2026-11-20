import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmergenzeDalPsc } from "@/components/sicurezza/pos/EmergenzeDalPsc";

const { api, apri } = vi.hoisted(() => ({ api: vi.fn(), apri: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/hooks/usePos", () => ({ chiamaServerPos: api }));
vi.mock("@/lib/storagePrivato", () => ({ apriFileRiservato: apri }));
const fonte = {
  id: "psc", revisione: "02", sha256: "a".repeat(64), company_id: "azienda", order_id: "ordine",
  archivio: "sicurezza_documenti" as const, file_path: "azienda/psc.pdf", file_name: "psc.pdf", titolo: "PSC prova", data_documento: "",
};
const comune = { id: fonte.id, revisione: fonte.revisione, sha256: fonte.sha256, campo: "raccolta" };
const prima = { ...comune, pagina: 7, estratto: "Il punto di raccolta è vicino al cancello nord.", metodo: "testo" };
const seconda = { ...comune, pagina: 16, estratto: "Il punto di raccolta è nella zona delle baracche.", metodo: "ocr" };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("conserva entrambe le prescrizioni con la rispettiva fase dopo il confronto", async () => {
  const applica = vi.fn();
  api.mockResolvedValue({ proposte: [prima, seconda] });
  render(<EmergenzeDalPsc origine={{ companyId: "azienda", posId: "pos", fonte }} piano={{ raccolta: "Vecchia area" }} applica={applica} />);
  fireEvent.click(screen.getByRole("button", { name: "Cerca indicazioni nel PSC" }));
  const primaScelta = await screen.findByRole("checkbox", { name: /da pagina 7/ });
  const secondaScelta = screen.getByRole("checkbox", { name: /da pagina 16/ });
  expect(primaScelta).not.toBeChecked();
  expect(secondaScelta).not.toBeChecked();
  fireEvent.click(primaScelta);
  fireEvent.click(secondaScelta);
  expect(primaScelta).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: /Pagina 16/ }));
  expect(apri).toHaveBeenCalledWith("sicurezza-documenti", fonte.file_path, 16);
  const inserisci = screen.getByRole("button", { name: "Inserisci nella bozza" });
  expect(inserisci).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Ho confrontato gli estratti/ }));
  expect(inserisci).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: /Fase o ambito · pagina 7/ }), { target: { value: "Scarifica" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Fase o ambito · pagina 16/ }), { target: { value: "Ripristino" } });
  expect(inserisci).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Ho confrontato gli estratti/ }));
  fireEvent.click(inserisci);
  expect(applica).toHaveBeenCalledExactlyOnceWith([{ ...prima, fase: "Scarifica" }, { ...seconda, fase: "Ripristino" }]);
});
