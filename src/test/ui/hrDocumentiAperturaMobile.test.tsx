import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrDocumentiSection } from "@/components/hr/HrDocumentiSection";

const stato = vi.hoisted(() => ({ readOnly: true, getUrl: vi.fn(), error: vi.fn(), ordine: [] as string[] }));
vi.mock("@/hooks/useHrDocumenti", () => ({
  useHrDocumenti: () => ({ data: [{ id: "d1", categoria: "corso_sicurezza", titolo: "Attestato", data_scadenza: null as string | null, file_path: "azienda/persona/attestato.pdf", file_name: "attestato.pdf" }], isLoading: false, isError: false }),
  useUpsertHrDocumento: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHrDocumento: () => ({ mutate: vi.fn() }), uploadHrFile: vi.fn(),
  getHrFileUrl: (path: string) => { stato.ordine.push("firma"); return stato.getUrl(path); },
}));
vi.mock("@/components/sicurezza/QualificheAddetto", () => ({ QualificheAddetto: (): null => null }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, solaLettura: stato.readOnly, isAdmin: true }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/lib/campo/lingua/LinguaCampo", () => ({ useT: () => (s: string, p?: Record<string, string>) => s.replace(/\{([^}]+)\}/g, (_, key: string) => p?.[key] ?? key) }));
vi.mock("sonner", () => ({ toast: { error: stato.error } }));
beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); stato.readOnly = true; stato.ordine.length = 0; stato.getUrl.mockResolvedValue("https://storage.example.test/attestato.pdf"); });

it("permette di leggere il documento anche in sola lettura e riserva l'apertura prima della rete", async () => {
  const scheda = { opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
  vi.spyOn(window, "open").mockImplementation(() => { stato.ordine.push("scheda"); return scheda as unknown as Window; });
  render(<HrDocumentiSection profiloId="persona" companyId="azienda" />);
  fireEvent.click(screen.getByRole("button", { name: "Apri attestato.pdf" }));
  await waitFor(() => expect(scheda.location.replace).toHaveBeenCalledWith("https://storage.example.test/attestato.pdf"));
  expect(stato.ordine).toEqual(["scheda", "firma"]);
  expect(screen.getByRole("button", { name: "Aggiungi" })).toBeDisabled();
});

it("toccare l'allegato da telefono non apre la modifica della persona", async () => {
  stato.readOnly = false;
  vi.spyOn(window, "open").mockReturnValue({ opener: null, closed: false, location: { replace: vi.fn() }, close: vi.fn() } as unknown as Window);
  render(<HrDocumentiSection profiloId="persona" companyId="azienda" />);
  fireEvent.click(screen.getByRole("button", { name: "Apri attestato.pdf" }));
  await waitFor(() => expect(stato.getUrl).toHaveBeenCalled());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("un accesso negato chiude la scheda vuota e mostra un errore senza scaricare altri file", async () => {
  stato.getUrl.mockResolvedValue(null);
  const close = vi.fn();
  vi.spyOn(window, "open").mockReturnValue({ opener: null, closed: false, location: { replace: vi.fn() }, close } as unknown as Window);
  render(<HrDocumentiSection profiloId="persona" companyId="azienda" />);
  fireEvent.click(screen.getByRole("button", { name: "Apri attestato.pdf" }));
  await waitFor(() => expect(stato.error).toHaveBeenCalled());
  expect(close).toHaveBeenCalled();
});
