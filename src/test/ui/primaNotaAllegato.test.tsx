import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AllegatoPrimaNota } from "@/components/prima-nota/AllegatoPrimaNota";
const open = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/storagePrivato", () => ({ apriFileRiservato: open }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it.each(["prima-nota-attachments/azienda/file.pdf", "https://esempio.supabase.co/storage/v1/object/public/prima-nota-attachments/azienda/file.pdf"])("apre con firma anche il riferimento storico %s", async (url) => {
  render(<AllegatoPrimaNota url={url} nome="Prova.pdf" />);
  fireEvent.click(screen.getByRole("button", { name: "Apri allegato Prova.pdf" }));
  await waitFor(() => expect(open).toHaveBeenCalledWith("prima-nota-attachments", "azienda/file.pdf"));
});
it("non apre URL esterni o riferimenti di altri contenitori", () => {
  render(<AllegatoPrimaNota url="https://esempio.it/file.pdf" nome="Prova.pdf" />);
  fireEvent.click(screen.getByRole("button"));
  expect(open).not.toHaveBeenCalled();
});
