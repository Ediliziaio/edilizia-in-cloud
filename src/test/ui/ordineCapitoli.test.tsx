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

function Editor({ apriSezione }: { apriSezione?: (sezione: string) => void }) {
  const [ordine, setOrdine] = useState<unknown>(null);
  const [pagine, setPagine] = useState<unknown>([]);
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <OrdineCapitoli
        ordine={ordine} pagine={pagine} onOrdine={setOrdine} onPagine={(v) => setPagine(v)} campoFoto={() => <div>foto</div>}
        settore="bagni" blocchi={blocchi} onBlocchi={setBlocchi} apriSezione={apriSezione}
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

  // 22/09/2026 — Ogni pagina si scrive nella sua sezione dell'editor, nel menu «Pagine
  // del PDF»: da qui la matita ci porta (il testo e le foto: vedi sezioniPagine.test.tsx).
  it("le pagine-promessa sono accese e chiedono di rileggerle; la matita apre la sezione della pagina", () => {
    const apri = vi.fn();
    render(<Editor apriSezione={apri} />);
    expect(screen.getAllByText(/Promette qualcosa al cliente: rileggila/).length).toBe(5);
    for (const nome of ["Protezione della casa", "Dicono di noi", "Le garanzie", "Domande e risposte", "Chi siamo", "I prossimi passi"]) {
      fireEvent.click(screen.getByRole("button", { name: `Modifica ${nome}` }));
    }
    expect(apri.mock.calls.map((c) => c[0])).toEqual(["page_protezione", "page_testimonianze", "garanzie", "page_domande", "page_chi_siamo", "page_chiusura"]);
    // Qui sotto non si apre più niente: la pagina si scrive nella sua sezione.
    expect(screen.queryByLabelText("Titolo")).toBeNull();
    expect(salvato().blocchi).toEqual({});
  });

  it("qui restano solo le foto delle pagine senza una sezione: il computo e il prezzo", () => {
    render(<Editor apriSezione={vi.fn()} />);
    const foto = screen.getAllByRole("button", { name: /^Foto di / }).map((b) => b.getAttribute("aria-label"));
    expect(foto).toEqual(["Foto di Il piano dei lavori", "Foto di Il tuo investimento"]);
    fireEvent.click(screen.getByRole("button", { name: "Foto di Il tuo investimento" }));
    expect(screen.getByText("Foto sotto il prezzo")).toBeInTheDocument();
  });

  it("senza chi apre le sezioni, niente matita sulle pagine: restano le pagine vostre", () => {
    render(<Editor />);
    expect(screen.queryByRole("button", { name: "Modifica Protezione della casa" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi una pagina vostra/ }));
    expect(screen.getByPlaceholderText("Le nostre *certificazioni*.")).toBeInTheDocument();
  });
});
