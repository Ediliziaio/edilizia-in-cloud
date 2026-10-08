import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingFilesUpload, type PendingFile } from "@/components/orders/PendingFilesUpload";
import { cartellaDelFileInCoda, type CartellaDocumenti } from "@/lib/commesse/documentiCommessa";

const mocks = vi.hoisted(() => ({ loading: false, error: null as Error | null, admin: true, changed: vi.fn(), cartelle: [] as CartellaDocumenti[] }));
vi.mock("@/hooks/useCartelleDocumenti", () => ({ useCartelleDocumenti: () => ({ cartelle: mocks.cartelle, isLoading: mocks.loading, error: mocks.error }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: mocks.admin, canEditSettingsOrders: false }) }));
vi.mock("@/components/orders/filePreviewUtils", () => ({ fmtBytes: (n: number) => `${n} B` }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const folder = (id: string, nome: string, visible = false): CartellaDocumenti => ({ id, nome, company_id: "demo2", posizione: 0, visibile_cliente: visible, obbligatoria: false, archiviata_at: null });
const file = (name: string) => new File(["demo"], name, { type: "application/pdf" });
function Panel({ initial = [], disabled = false }: { initial?: PendingFile[]; disabled?: boolean }) {
  const [files, setFiles] = useState(initial);
  return <MemoryRouter><PendingFilesUpload files={files} disabled={disabled} onFilesChange={(next) => { setFiles(next); mocks.changed(next); }} /></MemoryRouter>;
}
const folderButton = (name: string) => within(screen.getByRole("navigation", { name: "Cartelle documenti" })).getByRole("button", { name: new RegExp(`^${name}:`) });
const lastFiles = (): PendingFile[] => mocks.changed.mock.calls.at(-1)?.[0] ?? [];
const add = (container: HTMLElement, files: File[]) => fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files } });
beforeEach(() => { mocks.loading = false; mocks.error = null; mocks.admin = true; mocks.changed.mockClear(); mocks.cartelle = [folder("contratti", "Contratti"), folder("foto", "Foto", true), folder("custom", "Progetti esecutivi"), folder("varie", "Varie")]; });
afterEach(cleanup);

describe("cartelle nella nuova commessa", () => {
  it("mostra da subito le cartelle aziendali, anche vuote, e il collegamento alla loro gestione", () => {
    render(<Panel />);
    expect(folderButton("Contratti")).toHaveTextContent("0");
    expect(folderButton("Progetti esecutivi")).toHaveTextContent("0");
    expect(screen.getByRole("link", { name: "Gestisci cartelle" })).toHaveAttribute("href", "/azienda/impostazioni/cartelle-documenti");
  });
  it("usa le cartelle effettive, senza aggiungere una struttura predefinita diversa", () => {
    mocks.cartelle = [folder("personalizzata", "Documentazione impianto")]; mocks.admin = false;
    render(<Panel />);
    expect(folderButton("Documentazione impianto")).toBeInTheDocument();
    expect(screen.queryByText("Contratti")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Gestisci cartelle" })).not.toBeInTheDocument();
  });
  it("da Tutti propone le cartelle dal nome, con i valori di visibilità aziendali", () => {
    const { container } = render(<Panel />);
    add(container, [file("contratto.pdf"), file("foto.jpg"), file("scansione.pdf")]);
    expect(lastFiles().map((f) => [f.folderId, f.visibleToCustomer])).toEqual([["contratti", false], ["foto", true], ["varie", false]]);
    expect(folderButton("Contratti")).toHaveTextContent("1");
    expect(folderButton("Tutti")).toHaveTextContent("3");
  });
  it("la cartella aperta prevale sui suggerimenti e resta la stessa al salvataggio", () => {
    const { container } = render(<Panel />);
    fireEvent.click(folderButton("Progetti esecutivi"));
    expect(screen.getByText(/Nessun documento in «Progetti esecutivi»/)).toBeInTheDocument();
    add(container, [file("contratto.pdf")]);
    expect(lastFiles()[0].folderId).toBe("custom");
    expect(cartellaDelFileInCoda(lastFiles()[0], mocks.cartelle)).toBe("custom");
    expect(folderButton("Progetti esecutivi")).toHaveAttribute("aria-current", "true");
  });
  it("il trascinamento sulla cartella assegna una volta sola anche i doppioni nel lotto", () => {
    const document = file("contratto.pdf");
    render(<Panel />);
    fireEvent.drop(folderButton("Foto"), { dataTransfer: { files: [document, document] } });
    expect(lastFiles()).toHaveLength(1);
    expect(lastFiles()[0]).toMatchObject({ folderId: "foto", visibleToCustomer: true });
    expect(mocks.changed).toHaveBeenCalledTimes(1);
  });
  it("filtrare non cambia l'indice del file per visibilità e rimozione", () => {
    render(<Panel initial={[{ file: file("primo.pdf"), folderId: "contratti", visibleToCustomer: false }, { file: file("secondo.pdf"), folderId: "foto", visibleToCustomer: false }]} />);
    fireEvent.click(folderButton("Foto"));
    expect(screen.queryByText("primo.pdf")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Visibile al cliente: secondo.pdf" }));
    expect(lastFiles().map((f) => f.visibleToCustomer)).toEqual([false, true]);
    fireEvent.click(screen.getByRole("button", { name: "Togli secondo.pdf" }));
    expect(lastFiles().map((f) => f.file.name)).toEqual(["primo.pdf"]);
  });
  it("Senza cartella è una scelta esplicita e non viene nuovamente classificata", () => {
    render(<Panel initial={[{ file: file("contratto.pdf"), folderId: null, visibleToCustomer: false }]} />);
    expect(folderButton("Senza cartella")).toHaveTextContent("1");
    expect(cartellaDelFileInCoda({ file: file("contratto.pdf"), folderId: null }, mocks.cartelle)).toBeNull();
    fireEvent.click(folderButton("Senza cartella"));
    expect(screen.getByText("contratto.pdf")).toBeInTheDocument();
  });
  it("spostare un file aggiorna cartella, conteggi e visibilità senza toccare gli altri", () => {
    render(<Panel initial={[{ file: file("primo.pdf"), folderId: "contratti", visibleToCustomer: false }, { file: file("secondo.pdf"), folderId: "custom", visibleToCustomer: false }]} />);
    const combo = screen.getByRole("combobox", { name: "Cartella di secondo.pdf" });
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Foto" }));
    expect(lastFiles().map((f) => [f.folderId, f.visibleToCustomer])).toEqual([["contratti", false], ["foto", true]]);
    expect(folderButton("Progetti esecutivi")).toHaveTextContent("0");
    expect(folderButton("Foto")).toHaveTextContent("1");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Cartella di secondo.pdf" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Senza cartella" }));
    expect(lastFiles()[1].folderId).toBeNull();
    expect(cartellaDelFileInCoda(lastFiles()[1], mocks.cartelle)).toBeNull();
    expect(folderButton("Senza cartella")).toHaveTextContent("1");
  });
  it.each(["loading", "error", "disabled"])("non aggiunge file durante %s", (state) => {
    mocks.loading = state === "loading"; mocks.error = state === "error" ? new Error("offline") : null;
    const { container } = render(<Panel disabled={state === "disabled"} />);
    expect(screen.getByRole("button", { name: "Carica file" })).toBeDisabled();
    add(container, [file("contratto.pdf")]);
    fireEvent.drop(folderButton("Foto"), { dataTransfer: { files: [file("contratto.pdf")] } });
    expect(mocks.changed).not.toHaveBeenCalled();
    if (state === "error") expect(screen.getByRole("alert")).toHaveTextContent("Cartelle non disponibili");
  });
  it("rende correggibile la cartella anche per file aggiunti dal flusso di importazione", () => {
    render(<Panel initial={[{ file: file("contratto.pdf"), visibleToCustomer: false }]} />);
    expect(screen.getByRole("combobox", { name: "Cartella di contratto.pdf" })).toHaveTextContent("Contratti");
    expect(cartellaDelFileInCoda({ file: file("contratto.pdf") }, mocks.cartelle)).toBe("contratti");
  });
});
