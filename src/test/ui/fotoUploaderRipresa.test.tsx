import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FotoUploader } from "@/components/foto-cantiere/FotoUploader";

it("riprova soltanto la foto non completata fra due foto omonime", async () => {
  const a = new File(["prima foto"], "foto.jpg", { type: "image/jpeg" });
  const b = new File(["seconda foto"], "foto.jpg", { type: "image/jpeg" });
  const onUpload = vi.fn()
    .mockResolvedValueOnce({ mancanti: [b] })
    .mockResolvedValueOnce({ mancanti: [] });

  render(<FotoUploader onUpload={onUpload} isUploading={false} />);
  fireEvent.change(screen.getByLabelText("Scatta o seleziona foto"), { target: { files: [a, b] } });
  fireEvent.change(screen.getByLabelText("Descrizione (opzionale)"), { target: { value: "Prima del getto" } });
  fireEvent.click(screen.getByRole("button", { name: "Carica foto" }));
  fireEvent.click(await screen.findByRole("button", { name: "Riprova mancanti" }));

  await waitFor(() => expect(screen.queryByRole("button", { name: "Riprova mancanti" })).toBeNull());
  expect(onUpload).toHaveBeenNthCalledWith(1, { files: [a, b], descrizione: "Prima del getto" });
  expect(onUpload).toHaveBeenNthCalledWith(2, { files: [b], descrizione: "Prima del getto" });
});
