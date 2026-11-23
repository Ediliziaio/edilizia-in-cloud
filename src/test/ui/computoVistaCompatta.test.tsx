import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComputoCapitoli from "@/components/computo/ComputoCapitoli";
import { misuraVuota, voceVuota, type VoceEditor } from "@/lib/computo/editorNativo";

const dati = (): VoceEditor[] => [
  { ...voceVuota(), id: "a", capitolo: "Demolizioni", descrizione: "Scavo di prova", quantita: "10", prezzo: "", unita: "mq" },
  { ...voceVuota(), id: "b", capitolo: "Finiture", descrizione: "Intonaco misurato", prezzo: "12", unita: "mq", misure: [{ ...misuraVuota(), lunghezza: "2", altezza: "3" }] },
  { ...voceVuota(), id: "c", capitolo: "Demolizioni", descrizione: "Ripristino", quantita: "1", prezzo: "", unita: "corpo" },
  { ...voceVuota(), id: "d", capitolo: "Finiture", descrizione: "Finitura opzionale", quantita: "1", prezzo: "25", opzionale: true },
];
function Vista({ onModifica = () => undefined }: { onModifica?: (id: string, patch: Partial<VoceEditor>) => void }) {
  const [voci, setVoci] = useState(dati);
  return <ComputoCapitoli voci={voci} capitoliVuoti={[]} onApri={vi.fn()} onAdd={vi.fn()} onCapitoli={vi.fn()} onRename={vi.fn()} onEliminaCapitolo={vi.fn()} onModifica={(id, patch) => { onModifica(id, patch); setVoci(vs => vs.map(v => v.id === id ? { ...v, ...patch } : v)); }} />;
}
describe("computo compatto a righe", () => {
  it("allinea le colonne e filtra un capitolo dall'indice senza cambiare le voci", () => {
    render(<Vista />);
    for (const nome of ["Lavorazione", "Quantità", "U.M.", "Prezzo unit. €", "Importo €"]) expect(screen.getByRole("columnheader", { name: nome })).toBeInTheDocument();
    const indice = within(screen.getByRole("navigation", { name: "Indice dei capitoli" }));
    fireEvent.click(indice.getByRole("button", { name: /Finiture/ }));
    expect(screen.getByRole("button", { name: "Apri voce 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apri voce 1" })).not.toBeInTheDocument();
    fireEvent.click(indice.getByRole("button", { name: /Tutti i capitoli/ }));
    expect(screen.getByRole("button", { name: "Apri voce 1" })).toBeInTheDocument();
  });
  it("consente di scrivere tutto il prezzo col filtro attivo e poi scende alla riga successiva", () => {
    const modifica = vi.fn(); render(<Vista onModifica={modifica} />);
    fireEvent.click(screen.getByRole("button", { name: "Da prezzare 2" }));
    expect(screen.queryByRole("button", { name: "Apri voce 2" })).not.toBeInTheDocument();
    const prezzo = screen.getByRole("textbox", { name: "Prezzo voce 1" });
    act(() => prezzo.focus());
    fireEvent.change(prezzo, { target: { value: "1" } });
    fireEvent.change(prezzo, { target: { value: "125" } });
    expect(screen.getByRole("textbox", { name: "Prezzo voce 1" })).toHaveValue("125");
    expect(modifica).toHaveBeenLastCalledWith("a", { prezzo: "125" });
    fireEvent.keyDown(prezzo, { key: "Enter" });
    expect(screen.getByRole("textbox", { name: "Prezzo voce 3" })).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: "Prezzo voce 1" })).not.toBeInTheDocument();
  });
  it("modifica le misure sotto la riga e ricalcola quantità e importo", () => {
    const modifica = vi.fn(); render(<Vista onModifica={modifica} />);
    fireEvent.click(screen.getByRole("button", { name: "Con misure 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Mostra misure voce 2" }));
    fireEvent.change(screen.getByRole("textbox", { name: "lunghezza misura 1" }), { target: { value: "4" } });
    expect(screen.getByLabelText("Quantità voce 2 dalle misure")).toHaveTextContent("12");
    expect(screen.getByRole("cell", { name: "144,00 €" })).toBeInTheDocument();
    expect(modifica).toHaveBeenLastCalledWith("b", expect.objectContaining({ misure: [expect.objectContaining({ lunghezza: "4", altezza: "3" })] }));
    fireEvent.click(screen.getByRole("button", { name: "Nascondi misure voce 2" }));
    expect(screen.queryByLabelText("lunghezza misura 1")).not.toBeInTheDocument();
  });
  it("modifica quantità e unità anche senza prezzo, senza trasformare il vuoto in zero", () => {
    const modifica = vi.fn(); render(<Vista onModifica={modifica} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Quantità voce 1" }), { target: { value: "15" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Unità voce 1" }), { target: { value: "corpo" } });
    expect(modifica).toHaveBeenLastCalledWith("a", { unita: "corpo", corpo: true });
    expect(screen.getByRole("textbox", { name: "Prezzo voce 1" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Da prezzare 2" })).toBeInTheDocument();
  });
  it("permette di richiudere i capitoli anche durante una ricerca", () => {
    render(<Vista />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca lavorazioni" }), { target: { value: "Intonaco" } });
    fireEvent.click(screen.getByRole("button", { name: "Chiudi capitolo Finiture" }));
    expect(screen.queryByRole("button", { name: "Apri voce 2" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apri capitolo Finiture" }));
    expect(screen.getByRole("button", { name: "Apri voce 2" })).toBeInTheDocument();
  });
  it("esclude le voci opzionali dal subtotale del capitolo", () => {
    render(<Vista />);
    expect(screen.getByRole("rowheader", { name: /Finiture.*72,00/ })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "25,00 €" })).toBeInTheDocument();
  });
  it("apre i computi grandi dal riepilogo dei capitoli e conserva tutte le righe", () => {
    const voci = Array.from({ length: 80 }, (_, n) => ({ ...voceVuota(), id: `v${n}`, capitolo: `Capitolo ${n < 40 ? 1 : 2}`, descrizione: `Lavorazione ${n + 1}`, quantita: "1", prezzo: "10" }));
    const modifica = vi.fn();
    render(<ComputoCapitoli voci={voci} capitoliVuoti={[]} onApri={vi.fn()} onAdd={vi.fn()} onCapitoli={vi.fn()} onRename={vi.fn()} onEliminaCapitolo={vi.fn()} onModifica={modifica} />);
    expect(screen.getByRole("button", { name: "Apri capitolo Capitolo 1" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Apri voce 1" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Espandi tutti i capitoli" }));
    expect(screen.getByRole("button", { name: "Apri voce 80" })).toBeInTheDocument();
    expect(modifica).not.toHaveBeenCalled();
  });
});
