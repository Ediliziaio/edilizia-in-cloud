import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CorreggiRigheBolla } from "@/components/ddt/CorreggiRigheBolla";
import { leggiDDTdaAI } from "@/lib/ddt/letturaAI";
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:originale");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
it("affianca l’originale e mantiene il prezzo sconosciuto quando si corregge la quantità", () => {
  const documento = {
    righe_merce: [{ descrizione: "Malta", quantita: 2, unita_misura: "pz" }],
  };
  const righe = leggiDDTdaAI(documento).righe;
  righe[0].purchase_order_item_id = "vecchia-associazione";
  const cambio = vi.fn();
  render(
    <CorreggiRigheBolla
      file={new File(["x"], "bolla.pdf", { type: "application/pdf" })}
      righe={righe}
      onChange={cambio}
      disabled={false}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Correggi righe con originale a fianco",
    }),
  );
  expect(screen.getByTitle("Originale bolla.pdf")).toHaveAttribute(
    "src",
    "blob:originale",
  );
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Quantità riga 1" }),
    { target: { value: "3" } },
  );
  expect(cambio.mock.calls[0][0][0]).toMatchObject({
    quantita: 3,
    prezzo_unitario: null,
    importo: null,
    origine: "manuale",
    purchase_order_item_id: null,
    ai_originale: documento.righe_merce[0],
  });
});
it("libera l’anteprima quando si chiude la correzione", () => {
  render(
    <CorreggiRigheBolla
      file={new File(["x"], "foto.png", { type: "image/png" })}
      righe={[]}
      onChange={vi.fn()}
      disabled={false}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Correggi righe con originale a fianco",
    }),
  );
  expect(screen.getByAltText("Originale foto.png")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Chiudi correzione" }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:originale");
});
