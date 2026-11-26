import { Capacitor } from "@capacitor/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentFileLink } from "@/components/shared/DocumentFileLink";

const native = vi.hoisted(() => ({ open: vi.fn(), share: vi.fn(), blob: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/mobile/documenti", () => ({ apriDocumentoNativo: native.open }));
vi.mock("@/lib/mobile/condividiFile", () => ({ condividiFile: native.share }));
vi.mock("@/lib/pdfPreviewSource", () => ({ readPdfPreviewBlob: native.blob }));
vi.mock("sonner", () => ({ toast: { error: native.error } }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
  native.open.mockResolvedValue(undefined); native.share.mockResolvedValue("condiviso");
  native.blob.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
});
afterEach(() => vi.restoreAllMocks());

it("nell'app Apri usa il visualizzatore e conserva il collegamento come fallback web", async () => {
  render(<DocumentFileLink href="https://storage.example.test/Bolla.pdf">Apri bolla</DocumentFileLink>);
  fireEvent.click(screen.getByRole("link", { name: "Apri bolla" }));
  await waitFor(() => expect(native.open).toHaveBeenCalledWith("https://storage.example.test/Bolla.pdf", "Bolla.pdf"));
  expect(screen.getByRole("link")).toHaveAttribute("href", "https://storage.example.test/Bolla.pdf");
});

it("nell'app Scarica consegna il file al foglio nativo con il suo nome", async () => {
  render(<DocumentFileLink href="blob:https://localhost/bolla" download="Bolla.pdf">Scarica bolla</DocumentFileLink>);
  fireEvent.click(screen.getByRole("link", { name: "Scarica bolla" }));
  await waitFor(() => expect(native.share).toHaveBeenCalledWith(expect.any(Blob), "Bolla.pdf", "Bolla.pdf"));
  expect(native.open).not.toHaveBeenCalled();
});

it("un errore del visualizzatore viene mostrato e il collegamento torna utilizzabile", async () => {
  native.open.mockRejectedValueOnce(new Error("File non disponibile"));
  render(<DocumentFileLink href="https://storage.example.test/Bolla.pdf">Apri bolla</DocumentFileLink>);
  fireEvent.click(screen.getByRole("link", { name: "Apri bolla" }));
  await waitFor(() => expect(native.error).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole("link")).not.toHaveAttribute("aria-disabled", "true"));
  fireEvent.click(screen.getByRole("link"));
  await waitFor(() => expect(native.open).toHaveBeenCalledTimes(2));
});
