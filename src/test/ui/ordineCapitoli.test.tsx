import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/components/ui/rich-text-editor-safe", () => ({
  RichTextEditorSafe: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Testo" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { OrdineCapitoli } from "@/components/preventivi/OrdineCapitoli";

/** «Ordine e pagine» nell'editor, usato come lo usa un'azienda. */
afterEach(cleanup);

function Editor() {
  const [ordine, setOrdine] = useState<unknown>(null);
  const [pagine, setPagine] = useState<unknown>([]);
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <OrdineCapitoli
        ordine={ordine} pagine={pagine} onOrdine={setOrdine} onPagine={(v) => setPagine(v)} campoFoto={() => <div>foto</div>}
        settore="bagni" blocchi={blocchi} onBlocchi={setBlocchi}
      />
      <output data-testid="salvato">{JSON.stringify({ ordine, pagine, blocchi })}</output>
    </>
  );
}
const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");
const righe = () => screen.getAllByRole("listitem").map((li) => (li.querySelector("p")?.textContent ?? "").replace(/pagina vostra$/, "").trim());

describe("editor: ordine e pagine", () => {
  it("mostra l'ordine di serie, con l'apertura in testa", () => {
    render(<Editor />);
    expect(righe().slice(0, 3)).toEqual(["Apertura", "Chi siamo", "Il progetto"]);
  });

  it("sposta un capitolo e salva l'ordine", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Sposta su Il tuo investimento" }));
    const ordine = salvato().ordine.map((v: { chiave: string }) => v.chiave);
    // Di serie prima del prezzo c'è «Cosa è compreso» (22/09/2026): si scambia con quello.
    expect(ordine.indexOf("investimento")).toBeLessThan(ordine.indexOf("compreso"));
  });

  it("nasconde un capitolo, ma non il prezzo", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Nascondi Chi siamo" }));
    expect(salvato().ordine.find((v: { chiave: string }) => v.chiave === "chiSiamo").visibile).toBe(false);
    expect(screen.queryByRole("button", { name: "Nascondi Il tuo investimento" })).toBeNull();
  });

  it("aggiunge una pagina vostra, la scrive, e la mette prima del prezzo", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi una pagina vostra/ }));
    const titolo = screen.getByPlaceholderText("Le nostre *certificazioni*.");
    fireEvent.change(titolo, { target: { value: "Lo *showroom*." } });
    const s = salvato();
    expect(s.pagine).toHaveLength(1);
    expect(s.pagine[0].titolo).toBe("Lo *showroom*.");
    const ordine = s.ordine.map((v: { chiave: string }) => v.chiave);
    expect(ordine.indexOf(`libera:${s.pagine[0].id}`)).toBe(ordine.indexOf("piano") - 1);
    expect(within(screen.getAllByRole("listitem")[ordine.indexOf(`libera:${s.pagine[0].id}`)]).getByText("pagina vostra")).toBeTruthy();
  });

  it("«Di serie» torna all'ordine di partenza", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Sposta su Il tuo investimento" }));
    fireEvent.click(screen.getByRole("button", { name: /Di serie/ }));
    expect(salvato().ordine).toBeNull();
  });

  // 22/09/2026 — I blocchi della libreria si modificano da qui.
  it("le pagine-promessa sono spente e lo dicono; la matita apre l'editor del blocco", () => {
    render(<Editor />);
    expect(screen.getAllByText(/Spenta di serie: promette qualcosa al cliente/).length).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Protezione della casa" }));
    const titolo = screen.getByDisplayValue("Trattiamo la tua casa *come se fosse la nostra*.");
    fireEvent.change(titolo, { target: { value: "La tua casa, *protetta*." } });
    expect(salvato().blocchi).toEqual({ protezione: { titolo: "La tua casa, *protetta*." } });
    // Svuotare il campo per riscriverlo non fa ricomparire il testo di serie.
    fireEvent.change(screen.getByDisplayValue("La tua casa, *protetta*."), { target: { value: "" } });
    expect((screen.getAllByRole("textbox").find((t) => (t as HTMLInputElement).value === "" ) as HTMLInputElement | undefined)).toBeDefined();
  });

  it("«Torna ai testi di serie» cancella le scelte di quel blocco", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Come funziona" }));
    fireEvent.change(screen.getByDisplayValue("Quello che non vedrai, *fatto bene*."), { target: { value: "Sotto le piastrelle." } });
    expect(Object.keys(salvato().blocchi)).toEqual(["comeFunziona"]);
    fireEvent.click(screen.getByRole("button", { name: /Torna ai testi di serie/ }));
    expect(salvato().blocchi).toEqual({});
  });
});
