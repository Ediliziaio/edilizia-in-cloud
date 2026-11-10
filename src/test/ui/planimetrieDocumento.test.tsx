import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RitaglioDocumentoPianta from "@/components/planimetrie/RitaglioDocumentoPianta";
import { AttesaLetturaPianta } from "@/components/planimetrie/AttesaLetturaPianta";
const blobUrl = vi.fn(() => "blob:documento-test");
const revoke = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  const OriginalURL = URL;
  class TestURL extends OriginalURL {}
  Object.assign(TestURL, { createObjectURL: blobUrl, revokeObjectURL: revoke });
  vi.stubGlobal("URL", TestURL);
});
afterEach(() => vi.unstubAllGlobals());

it("visualizza il file anche quando il Dialog monta l'immagine nel Portal e libera l'URL alla chiusura", async () => {
  const file = new Blob(["jpeg"], { type: "image/jpeg" });
  const view = render(<RitaglioDocumentoPianta file={file} iniziale={null} onChiudi={vi.fn()} onConferma={vi.fn()} />);
  expect(await screen.findByRole("img", { name: "Foto originale da ritagliare" })).toHaveAttribute("src", "blob:documento-test");
  expect(blobUrl).toHaveBeenCalledWith(file);
  expect(screen.getByRole("button", { name: "Applica ritaglio" })).toBeDisabled();
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:documento-test");
});

it("mostra una fase reale della richiesta senza inventare percentuali di completamento", () => {
  render(<AttesaLetturaPianta fase="lettura" />);
  expect(screen.getByRole("status")).toHaveTextContent("L’AI sta leggendo la pianta");
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByText(/s trascorsi/)).toHaveTextContent("0 s trascorsi");
});
