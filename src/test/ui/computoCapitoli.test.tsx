import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render as monta, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import ComputoNativoEditor from "@/components/computo/ComputoNativoEditor";
import { bozzaVuota, leggiBozzaComputo, voceVuota } from "@/lib/computo/editorNativo";

const render = (editor: ReactElement) => monta(editor, {
  wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
});

vi.mock("@/components/ristrutturazione/ComputoEditor/AddVocePicker", () => ({ default: ({ onPick }: { onPick: (v: unknown[]) => void }) => <>
  <button onClick={() => onPick([{ descrizione: "Intonaco dal listino", unita_misura: "mq", prezzo_unitario: 24.5, costo_materiali: 5, costo_manodopera: 10, capitolo_nome: "Finiture", fonte: "Prezzario di prova", codice_tariffa: "TEST.123" }])}>Scegli voce di prova</button>
  <button onClick={() => onPick([{ descrizione: "Scavo dal prezzario", unita_misura: "corpo", unita_originale: "mc", quantita: 2, prezzo_unitario: 133, capitolo_nome: "Scavi", fonte: "Fonte volume", codice_tariffa: "VOL.1" }])}>Scegli voce a volume</button>
</> }));
beforeEach(() => { localStorage.clear(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
describe("computo a capitoli come il flusso Ristrutturazione", () => {
  it("aggiunge una lavorazione manuale anche con i listini disponibili", () => {
    render(<ComputoNativoEditor storageKey="voce-manuale" consentiListini initialFase={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi lavorazione" }));
    expect(screen.getByRole("heading", { name: "Opere edili" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Descrizione voce 1" })).toHaveFocus();
    expect(screen.queryByRole("group", { name: "Modifica lavorazione nella riga" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi lavorazione" }));
    expect(screen.getByLabelText("Riepilogo del computo")).toHaveTextContent("2 voci");
    expect(screen.getByRole("textbox", { name: "Descrizione voce 2" })).toHaveFocus();
  });
  it("mantiene il listino accessibile e conserva quantità, prezzo e unità originali", async () => {
    render(<ComputoNativoEditor storageKey="listino-volume" consentiListini initialFase={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerca nei listini" }));
    fireEvent.click(await screen.findByRole("button", { name: "Scegli voce a volume" }));
    expect(screen.getByRole("combobox", { name: "Unità di misura" })).toHaveTextContent("mc - Metri cubi");
    expect(screen.getByLabelText("Quantità")).toHaveValue("2");
    expect(screen.getByLabelText("Prezzo unitario")).toHaveValue("133");
    await waitFor(() => expect(leggiBozzaComputo(localStorage.getItem("listino-volume")!).voci[0]).toMatchObject({ unita: "mc", corpo: false, prezzo: "133", quantita: "2", tariffa: "VOL.1", fonte: "Fonte volume" }));
  });
  it("crea un capitolo dal menu dei capitoli frequenti senza aggiungere voci fittizie", async () => {
    render(<ComputoNativoEditor storageKey="capitoli-rapidi" initialFase={2} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Capitoli frequenti" }));
    fireEvent.click(await screen.findByRole("option", { name: "Impianti elettrici" }));
    expect(screen.getByRole("heading", { name: "Impianti elettrici" })).toBeInTheDocument();
    await waitFor(() => expect(leggiBozzaComputo(localStorage.getItem("capitoli-rapidi")!).voci).toEqual([]));
  });
  it("crea e conserva un capitolo vuoto senza aggiungere prezzi o lavorazioni fittizie", async () => {
    const { unmount } = render(<ComputoNativoEditor storageKey="capitoli" initialFase={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Crea il primo capitolo" }));
    fireEvent.change(screen.getByLabelText("Nome del capitolo"), { target: { value: "Demolizioni" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea capitolo" }));
    expect(screen.getByRole("heading", { name: "Demolizioni" })).toBeInTheDocument();
    await waitFor(() => expect(leggiBozzaComputo(localStorage.getItem("capitoli")!).capitoli).toEqual(["Demolizioni"]));
    expect(leggiBozzaComputo(localStorage.getItem("capitoli")!).voci).toEqual([]);
    unmount(); render(<ComputoNativoEditor storageKey="capitoli" initialFase={2} />);
    expect(screen.getByRole("heading", { name: "Demolizioni" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voce libera" }));
    expect(screen.getByLabelText("Descrizione voce 1")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Apri voce 1" }));
    expect(screen.getByLabelText("Capitolo", { exact: true })).toHaveValue("Demolizioni");
  });
  it("rifiuta rinomine che unirebbero due capitoli e mantiene le voci", () => {
    localStorage.setItem("nomi", JSON.stringify({ ...bozzaVuota(), capitoli: ["Demolizioni", "Finiture"] }));
    render(<ComputoNativoEditor storageKey="nomi" initialFase={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Rinomina capitolo Demolizioni" }));
    fireEvent.change(screen.getByLabelText("Nome del capitolo"), { target: { value: "finiture" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva nome" }));
    expect(screen.getByRole("alert")).toHaveTextContent("esiste già");
    fireEvent.change(screen.getByLabelText("Nome del capitolo"), { target: { value: "Rimozioni" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva nome" }));
    expect(screen.getByRole("heading", { name: "Rimozioni" })).toBeInTheDocument();
  });
  it("il selettore condiviso porta codice tariffa, fonte e prezzo nella bozza locale", async () => {
    render(<ComputoNativoEditor storageKey="listini" consentiListini initialFase={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerca nei listini" }));
    fireEvent.click(await screen.findByRole("button", { name: "Scegli voce di prova" }));
    expect(screen.getByLabelText("Codice tariffa")).toHaveValue("TEST.123");
    expect(screen.getByLabelText("Fonte del prezzo")).toHaveValue("Prezzario di prova");
    expect(screen.getByLabelText("Prezzo unitario")).toHaveValue("24.5");
    await waitFor(() => expect(leggiBozzaComputo(localStorage.getItem("listini")!).voci[0].fonte).toBe("Prezzario di prova"));
  });
  it("comprime i capitoli senza rimuovere voci o calcoli", () => {
    localStorage.setItem("compatta", JSON.stringify({ ...bozzaVuota(), voci: [{ ...voceVuota(), capitolo: "Finiture", descrizione: "Tinteggiatura", quantita: "10", prezzo: "12" }] }));
    render(<ComputoNativoEditor storageKey="compatta" initialFase={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Comprimi tutti i capitoli" }));
    expect(screen.getByRole("button", { name: "Apri capitolo Finiture" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Espandi tutti i capitoli" }));
    expect(screen.getByRole("button", { name: "Chiudi capitolo Finiture" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Apri voce 1" }));
    expect(screen.getByLabelText("Descrizione della lavorazione")).toHaveValue("Tinteggiatura");
  });
});
