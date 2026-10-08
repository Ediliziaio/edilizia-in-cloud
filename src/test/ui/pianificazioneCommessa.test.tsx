import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PianificazioneCommessa, type CampoDataPiano } from "@/components/orders/PianificazioneCommessa";
import { AnteprimaFasiCommessa } from "@/components/orders/AnteprimaFasiCommessa";
import type { SettimanaLavorativa } from "@/lib/orders/pianificazioneAvvio";
import type { FaseModello, ModelloFasi } from "@/lib/orders/modelliFasi";

afterEach(cleanup);
const modello: ModelloFasi = { id: "bagno", origine: "azienda", nome: "Bagno", descrizione: "", fasi: [
  { nome: "Demolizioni", sottofasi: [{ nome: "Proteggere gli ambienti", peso: 1 }] },
  { nome: "Posa", sottofasi: [] },
] };

function Piano({ submit = vi.fn() }: { submit?: () => void }) {
  const [date, setDate] = useState<Partial<Record<CampoDataPiano, Date>>>({ work_start_date: new Date(2026, 9, 9) });
  const [durata, setDurata] = useState("");
  const [settimana, setSettimana] = useState<SettimanaLavorativa>(5);
  return <form onSubmit={(e) => { e.preventDefault(); submit(); }}><PianificazioneCommessa date={date} onData={(campo, valore) => setDate({ ...date, [campo]: valore })} durata={durata} onDurata={setDurata} settimana={settimana} onSettimana={setSettimana} /></form>;
}

describe("pianificazione chiara e senza modifiche implicite", () => {
  it("mostra prima inizio e fine, nascondendo le date secondarie", () => {
    render(<Piano />);
    expect(screen.getByLabelText("Inizio lavori")).toHaveValue("2026-10-09");
    expect(screen.getByLabelText("Fine lavori prevista")).toHaveValue("");
    expect(screen.queryByLabelText("Arrivo merce in magazzino")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Date cliente e materiali" }));
    expect(screen.getByLabelText("Arrivo merce in magazzino")).toBeInTheDocument();
  });
  it("stima la fine ma la applica solo su richiesta senza inviare il form", () => {
    const submit = vi.fn(); render(<Piano submit={submit} />);
    expect(screen.getByRole("button", { name: "Calcola fine" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Durata stimata · giorni lavorativi"), { target: { value: "2" } });
    expect(screen.getByLabelText("Fine lavori prevista")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Calcola fine" }));
    expect(screen.getByLabelText("Fine lavori prevista")).toHaveValue("2026-10-12");
    expect(submit).not.toHaveBeenCalled();
  });
  it("rispetta il calendario a sei giorni e non sovrascrive una fine manuale", () => {
    render(<Piano />);
    fireEvent.change(screen.getByLabelText("Durata stimata · giorni lavorativi"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Settimana di lavoro"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Calcola fine" }));
    expect(screen.getByLabelText("Fine lavori prevista")).toHaveValue("2026-10-10");
    fireEvent.change(screen.getByLabelText("Fine lavori prevista"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Durata stimata · giorni lavorativi"), { target: { value: "3" } });
    expect(screen.getByLabelText("Fine lavori prevista")).toHaveValue("2026-10-20");
  });
  it("segnala date incoerenti e consente di svuotarle", () => {
    render(<Piano />);
    fireEvent.change(screen.getByLabelText("Fine lavori prevista"), { target: { value: "2026-10-08" } });
    expect(screen.getByRole("alert")).toHaveTextContent("non può precedere");
    expect(screen.getByLabelText("Fine lavori prevista")).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByLabelText("Fine lavori prevista"), { target: { value: "" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("recepisce anche gli eventi input dei selettori date nativi", () => {
    render(<Piano />);
    fireEvent.input(screen.getByLabelText("Inizio lavori"), { target: { value: "2026-10-12" } });
    fireEvent.change(screen.getByLabelText("Durata stimata · giorni lavorativi"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Calcola fine" }));
    expect(screen.getByLabelText("Fine lavori prevista")).toHaveValue("2026-10-12");
  });
  it("segnala la merce dopo l'avvio senza bloccare lavori che non la richiedono", () => {
    render(<Piano />);
    fireEvent.click(screen.getByRole("button", { name: "Date cliente e materiali" }));
    fireEvent.change(screen.getByLabelText("Arrivo merce in magazzino"), { target: { value: "2026-10-15" } });
    expect(screen.getByRole("status")).toHaveTextContent("merce arriva dopo");
  });
  it("le date secondarie della bozza sono visibili all'apertura", () => {
    render(<PianificazioneCommessa date={{ expected_date: new Date(2026, 9, 20) }} onData={vi.fn()} durata="40" onDurata={vi.fn()} settimana={5} onSettimana={vi.fn()} />);
    expect(screen.getByLabelText("Data prevista per il cliente")).toHaveValue("2026-10-20");
  });
});

function Fasi() {
  const [fasi, setFasi] = useState<FaseModello[] | null>(null);
  return <AnteprimaFasiCommessa modello={modello} fasi={fasi ?? modello.fasi} personalizzate={fasi !== null} onChange={setFasi} onRipristina={() => setFasi(null)} />;
}
describe("anteprima fasi senza alterare il modello aziendale", () => {
  it("presenta fasi e sottofasi prima della creazione", () => {
    render(<Fasi />);
    expect(screen.getByText("2 fasi · 1 sottofase")).toBeInTheDocument();
    expect(screen.getByText("Demolizioni")).toBeInTheDocument();
    expect(screen.getByText("Proteggere gli ambienti")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nome fase 1")).not.toBeInTheDocument();
  });
  it("rinomina e rimuove solo le fasi della nuova commessa, mantenendo le sottofasi", () => {
    render(<Fasi />);
    fireEvent.click(screen.getByRole("button", { name: "Adatta alla commessa" }));
    fireEvent.change(screen.getByLabelText("Nome fase 1"), { target: { value: "Preparazione" } });
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi fase 2" }));
    expect(screen.getByText("Proteggere gli ambienti")).toBeInTheDocument();
    expect(modello.fasi).toHaveLength(2);
    expect(modello.fasi[0].nome).toBe("Demolizioni");
    fireEvent.click(screen.getByRole("button", { name: "Fine modifica" }));
    expect(screen.getByText("Preparazione")).toBeInTheDocument();
  });
  it("aggiunge una fase e permette di ripristinare il modello", () => {
    render(<Fasi />);
    fireEvent.click(screen.getByRole("button", { name: "Adatta alla commessa" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi fase" }));
    expect(screen.getByLabelText("Nome fase 3")).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent("Assegna un nome");
    fireEvent.click(screen.getByRole("button", { name: "Ripristina modello" }));
    expect(screen.queryByLabelText("Nome fase 3")).not.toBeInTheDocument();
  });
  it("un piano lungo parte compatto ma tutte le fasi sono accessibili", () => {
    const fasi = Array.from({ length: 10 }, (_, i) => ({ nome: `Fase ${i + 1}`, sottofasi: [] as FaseModello["sottofasi"] }));
    render(<AnteprimaFasiCommessa modello={null} fasi={fasi} personalizzate={false} onChange={vi.fn()} onRipristina={vi.fn()} />);
    expect(screen.queryByText("Fase 10")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostra tutte le 10 fasi" }));
    expect(screen.getByText("Fase 10")).toBeInTheDocument();
  });
});
