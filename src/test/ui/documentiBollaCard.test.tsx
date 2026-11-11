// 11/11/2026 — «Documento DDT» e «Allegati» diventano «Documenti della bolla»:
// un elenco e un solo «Aggiungi file» con la scelta del tipo.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/ddt/DDTOriginaliCard", () => ({
  DDTOriginaliCard: () => <li>originale archiviato</li>,
}));
import { DocumentiBollaCard, type DocumentiBollaCardProps } from "@/components/ddt/DocumentiBollaCard";

afterEach(cleanup);

const base = (extra: Partial<DocumentiBollaCardProps> = {}): DocumentiBollaCardProps => ({
  ddt: { id: "d", company_id: "az", ddt_file_bucket: null, ddt_file_url: null, ddt_file_name: null, ddt_file_mime: null },
  fileUrl: null,
  allegati: [],
  onCaricaOriginale: vi.fn(),
  onRimuoviOriginale: vi.fn(),
  onCaricaAllegati: vi.fn(),
  onEliminaAllegato: vi.fn(),
  ...extra,
});
const scegli = (...nomi: string[]) =>
  fireEvent.change(screen.getByTestId("documenti-bolla-file"), {
    target: { files: nomi.map((n) => new File(["x"], n, { type: "application/pdf" })) },
  });

it("senza originale il primo file diventa la bolla originale, gli altri allegati", () => {
  const p = base();
  render(<DocumentiBollaCard {...p} />);
  expect(screen.getByLabelText("Tipo di documento")).toHaveValue("ddt");
  expect(screen.getAllByRole("button", { name: "Aggiungi file" })).toHaveLength(1);
  scegli("bolla.pdf", "packing.pdf");
  expect((p.onCaricaOriginale as ReturnType<typeof vi.fn>).mock.calls[0][0].name).toBe("bolla.pdf");
  expect((p.onCaricaAllegati as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual([
    { file: expect.objectContaining({ name: "packing.pdf" }), kind: "bolla" },
  ]);
});

it("con l'originale caricato lo mostra in cima e i file nuovi sono allegati del tipo scelto", () => {
  const p = base({
    ddt: { id: "d", company_id: "az", ddt_file_bucket: null, ddt_file_url: "az/d/b.pdf", ddt_file_name: "b.pdf", ddt_file_mime: "application/pdf" },
    fileUrl: "https://example.invalid/b.pdf",
    allegati: [{ url: "https://example.invalid/f.jpg", name: "danno.jpg", mime: "image/jpeg", size: 2048, uploaded_at: "2026-11-11", kind: "danni", path: "p1" }],
  });
  render(<DocumentiBollaCard {...p} />);
  const elenco = screen.getByRole("list", { name: "Documenti della bolla" });
  expect(elenco.querySelectorAll("li")[0]).toHaveTextContent("b.pdf");
  expect(elenco.querySelectorAll("li")[0]).toHaveTextContent("Bolla originale");
  expect(elenco).toHaveTextContent("danno.jpg");
  expect(screen.queryByRole("option", { name: "Bolla originale" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Tipo di documento"), { target: { value: "packing_list" } });
  scegli("pl.pdf");
  expect(p.onCaricaOriginale).not.toHaveBeenCalled();
  expect((p.onCaricaAllegati as ReturnType<typeof vi.fn>).mock.calls[0][0][0].kind).toBe("packing_list");
});

it("l'originale letto dall'AI sta in cima all'elenco", () => {
  render(<DocumentiBollaCard {...base({ ddt: { id: "d", company_id: "az", ddt_file_bucket: "ddt-documenti", ddt_file_url: "az/x.pdf", ddt_file_name: null, ddt_file_mime: null } })} />);
  expect(screen.getByRole("list", { name: "Documenti della bolla" }).querySelectorAll("li")[0]).toHaveTextContent("originale archiviato");
});
