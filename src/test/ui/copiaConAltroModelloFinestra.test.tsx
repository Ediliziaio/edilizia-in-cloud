/**
 * «Copia con un altro modello» (26/10/2026): la finestra elenca gli altri modelli del preventivatore (non quello in uso),
 * crea la copia e porta ad aprirla; se la copia non riesce lo dice e resta dov'è.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const copia = vi.hoisted(() => vi.fn());
vi.mock("@/lib/moduli/copiaConAltroModello", () => ({ copiaConAltroModello: copia }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { CopiaConAltroModello } from "@/components/preventivatore/CopiaConAltroModello";

afterEach(() => { cleanup(); copia.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });

const costruisci = vi.fn(async () => ({}));
const monta = (snapshot: { modelId: string } | null = { modelId: "completa" }) => render(
  <MemoryRouter initialEntries={["/azienda/ristrutturazione/p1/modifica"]}>
    <Routes>
      <Route path="/azienda/ristrutturazione/:id/modifica" element={<CopiaConAltroModello modulo="ristrutturazione" progetto={{ id: "p1", company_id: "az" }} snapshot={snapshot} costruisci={costruisci} />} />
      <Route path="/azienda/ristrutturazione/:id/modifica2" element={<p>altra pagina</p>} />
    </Routes>
  </MemoryRouter>,
);
const apri = () => fireEvent.click(screen.getByRole("button", { name: /Copia con un altro modello/ }));

describe("CopiaConAltroModello", () => {
  it("elenca gli altri modelli e non quello in uso", () => {
    monta({ modelId: "completa" });
    apri();
    const opzioni = Array.from((screen.getByLabelText("Nuovo modello") as HTMLSelectElement).options).map((o) => o.value);
    expect(opzioni).toContain("computo");
    expect(opzioni).toContain("parziale");
    expect(opzioni).not.toContain("completa");
  });

  it("senza un modello scelto il pulsante «Crea la copia» non parte", () => {
    monta();
    apri();
    expect((screen.getByRole("button", { name: "Crea la copia" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("scelto «computo» crea la copia di quel preventivo e porta ad aprirla", async () => {
    copia.mockResolvedValue({ id: "nuovo-9", code: "RST-2026-009" });
    monta();
    apri();
    fireEvent.change(screen.getByLabelText("Nuovo modello"), { target: { value: "computo" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea la copia" }));
    await waitFor(() => expect(copia).toHaveBeenCalledWith({ modulo: "ristrutturazione", sourceId: "p1", companyId: "az", nuovoModelId: "computo", costruisci }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Creato il preventivo RST-2026-009", expect.anything()));
  });

  it("se la copia non riesce lo dice, e la finestra resta aperta", async () => {
    copia.mockRejectedValue(new Error("Questo intervento non ha un modello completo."));
    monta();
    apri();
    fireEvent.change(screen.getByLabelText("Nuovo modello"), { target: { value: "parziale" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea la copia" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Copia non riuscita", { description: "Questo intervento non ha un modello completo." }));
    expect(screen.getByLabelText("Nuovo modello")).toBeTruthy();
  });

  it("spiega che il preventivo di partenza non cambia e che le foto non si copiano", () => {
    monta();
    apri();
    const testo = screen.getByRole("dialog").textContent ?? "";
    expect(testo).toContain("resta com'è");
    expect(testo).toContain("le foto del progetto no");
  });
});
