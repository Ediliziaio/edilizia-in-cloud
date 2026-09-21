import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

/**
 * Il blocco «Condizioni generali di contratto» degli editor dei modelli
 * (20/09/2026): lo stesso negli otto moduli edili. Si prova come lo usa
 * l'azienda — vuoto, un clic su «Parti dal testo del settore», l'interruttore.
 */

vi.mock("@/hooks/useQuoteTemplates", () => ({
  useQuoteTemplates: () => ({
    templates: [
      { id: "b1", kind: "condizioni", name: "Le nostre condizioni 2026", is_active: true, body_html: "<h2>Art. 1 — Oggetto</h2><p>Quello che diciamo noi.</p>" },
      { id: "b2", kind: "copertina", name: "Copertina", is_active: true },
    ],
  }),
}));

import { CondizioniContratto } from "@/components/preventivi/CondizioniContratto";

afterEach(cleanup);

function Editor({ settore = "tetti" as const }) {
  const [attivo, setAttivo] = useState(true);
  const [testo, setTesto] = useState("");
  return (
    <>
      <CondizioniContratto companyId="c1" settore={settore} attivo={attivo} testo={testo} onAttivo={setAttivo} onTesto={setTesto} />
      <output data-testid="salvato">{JSON.stringify({ attivo, lunghezza: testo.length, inizio: testo.slice(0, 60) })}</output>
    </>
  );
}

const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");

describe("editor: condizioni generali di contratto", () => {
  it("vuoto, avverte che il documento esce senza condizioni", () => {
    render(<Editor />);
    expect(screen.getByText(/senza condizioni/)).toBeTruthy();
  });

  it("«Parti dal testo del settore» riempie il campo con le condizioni del mestiere", () => {
    render(<Editor settore="tetti" />);
    fireEvent.click(screen.getByRole("button", { name: /Parti dal testo del settore/ }));
    const s = salvato();
    expect(s.lunghezza).toBeGreaterThan(3000);
    expect(s.inizio).toContain("# Condizioni generali di contratto");
    const area = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(area.value).toMatch(/amianto/i);
    // L'avviso sparisce appena c'è un testo.
    expect(screen.queryByText(/senza condizioni/)).toBeNull();
  });

  it("con un testo già scritto chiede conferma prima di sostituirlo", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Editor />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Le mie condizioni" } });
    fireEvent.click(screen.getByRole("button", { name: /Parti dal testo del settore/ }));
    expect(conferma).toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Le mie condizioni");
    conferma.mockRestore();
  });

  it("si riusa un blocco della libreria Template offerte (solo quelli di condizioni)", () => {
    render(<Editor />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Riusa un blocco dalla libreria Template offerte…", "Le nostre condizioni 2026",
    ]);
    fireEvent.change(select, { target: { value: "b1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sostituisci" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("Quello che diciamo noi.");
  });

  it("l'interruttore spento nasconde il campo e lo salva spento", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("switch"));
    expect(salvato().attivo).toBe(false);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
