import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentFoldersNavigation, TUTTI_DOCUMENTI } from "@/components/orders/DocumentFoldersNavigation";
import type { CartellaDocumenti } from "@/lib/commesse/documentiCommessa";

afterEach(cleanup);
const folder = (id: string, nome: string, archived = false): CartellaDocumenti => ({id, nome, company_id: "company", posizione: 1, obbligatoria: false, visibile_cliente: false, archiviata_at: archived ? "2026-01-01" : null});
const folders = [folder("quote", "Preventivi"), folder("empty", "Pratiche"), folder("required", "Contratti"), folder("old", "Archivio", true), folder("old-empty", "Archivio vuoto", true)];
const base = {cartelle: folders, conteggi: {quote: 2, old: 1}, totale: 3, senzaCartella: 0, mancanti: ["required"], selezione: TUTTI_DOCUMENTI, onSelect: vi.fn()};
const draw = (props = {}) => render(<MemoryRouter><DocumentFoldersNavigation {...base} compact {...props} /></MemoryRouter>);

describe("Categorie documenti: compatte senza perdere funzioni", () => {
  it("mostra un filtro invece di una colonna di cartelle", () => {
    draw();
    expect(screen.getByRole("combobox", {name: "Categoria documenti"})).toHaveValue(TUTTI_DOCUMENTI);
    expect(screen.queryByRole("button", {name: "Preventivi: 2 documenti"})).not.toBeInTheDocument();
    expect(screen.getByRole("option", {name: "Preventivi (2)"})).toBeInTheDocument();
  });
  it("raggruppa le vuote ma conserva quelle obbligatorie mancanti", () => {
    draw();
    expect(screen.getByRole("option", {name: "Contratti (0) · obbligatoria, vuota"})).toBeInTheDocument();
    const empty = screen.getByRole("group", {name: "Categorie vuote — disponibili per nuovi file"});
    expect(empty).toHaveTextContent("Pratiche (0)");
    expect(empty).not.toHaveTextContent("Contratti");
  });
  it("conserva i file archiviati e non espone archivi vuoti", () => {
    draw();
    expect(screen.getByRole("option", {name: "Archivio (1) · archiviata"})).toBeInTheDocument();
    expect(screen.queryByText("Archivio vuoto (0)")).not.toBeInTheDocument();
  });
  it("consente di selezionare anche una categoria vuota per il caricamento", () => {
    const select = vi.fn(); draw({onSelect: select});
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "empty"}});
    expect(select).toHaveBeenCalledWith("empty");
  });
  it("recupera l'esplorazione e i target del trascinamento senza spostare dati", () => {
    const drop = vi.fn(); draw({onDropCartella: drop});
    fireEvent.click(screen.getByRole("button", {name: "Esplora cartelle"}));
    fireEvent.drop(screen.getByRole("button", {name: "Pratiche: 0 documenti"}), {dataTransfer: {files: []}});
    expect(drop).toHaveBeenCalledWith(expect.anything(), "empty");
    fireEvent.click(screen.getByRole("button", {name: "Torna al filtro categorie"}));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
  it("mantiene senza categoria, selezione e permessi di configurazione", () => {
    draw({senzaCartella: 1, selezione: "empty", puoGestireCartelle: true});
    expect(screen.getByRole("combobox")).toHaveValue("empty");
    expect(screen.getByRole("option", {name: "Senza categoria (1)"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Gestisci categorie"})).toHaveAttribute("href", "/azienda/impostazioni/cartelle-documenti");
  });
  it("non offre la configurazione senza il permesso", () => {
    draw(); expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
