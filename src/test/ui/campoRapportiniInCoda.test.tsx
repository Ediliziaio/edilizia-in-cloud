import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const coda = vi.hoisted(() => ({ voci: [] as unknown[] }));
vi.mock("@/hooks/campo/useCodaCampo", () => ({ useCodaCampo: () => coda.voci }));
import { RapportiniInCoda } from "@/components/campo/RapportiniInCoda";

afterEach(cleanup);
const voce = (over: Record<string, unknown> = {}) => ({
  id: "coda:rapportino:x", status: "pending", lastError: undefined as string | undefined,
  payload: { order_id: "o1", giorno: "2026-11-22", campi: { ore_lavorate: 3.5, foto_urls: ["a"] } },
  ...over,
});
const disegna = (online = false) => render(<MemoryRouter><RapportiniInCoda companyId="c" userId="u" orderId="o1" online={online} /></MemoryRouter>);

describe("Rapportini ancora sul telefono (collaudo 23/11, invio senza rete)", () => {
  it("si vede il rapportino appena inviato, con ore e foto, e che parte da solo", () => {
    coda.voci = [voce()];
    disegna(false);
    expect(screen.getByText(/Rapportino del 22 nov/)).toBeInTheDocument();
    expect(screen.getByText("3h 30 · 1 foto")).toBeInTheDocument();
    expect(screen.getByText(/Parte da solo quando torna la rete/)).toBeInTheDocument();
  });

  it("con la rete debole dice che sta riprovando, senza farlo rifare", () => {
    coda.voci = [voce()];
    disegna(true);
    expect(screen.getByText(/riprovo da solo: non serve rifarlo/)).toBeInTheDocument();
  });

  it("solo i rapportini di questo cantiere", () => {
    coda.voci = [voce({ payload: { order_id: "altro", giorno: "2026-11-22", campi: {} } })];
    disegna();
    expect(screen.queryByText(/Rapportino del/)).not.toBeInTheDocument();
  });

  it("un invio da controllare porta al modulo", () => {
    coda.voci = [voce({ status: "failed", lastError: "Il rapportino è cambiato in ufficio." })];
    disegna(true);
    expect(screen.getByText("Il rapportino è cambiato in ufficio.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apri il rapportino" })).toHaveAttribute("href", "/campo/lavoro/o1/rapportino?data=2026-11-22");
  });
});
