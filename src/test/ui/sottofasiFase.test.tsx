// src/test/ui/sottofasiFase.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SottofasiFase } from "@/components/orders/SottofasiFase";
import type { Sottofase } from "@/lib/orders/sottofasi";

const riga = (patch: Partial<Sottofase> = {}): Sottofase => ({
  id: "s1", phase_id: "p1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null, ...patch,
});
const azioni = () => ({ onSegna: vi.fn(), onAggiungi: vi.fn(), onRinomina: vi.fn(), onElimina: vi.fn() });
afterEach(cleanup);

describe("SottofasiFase", () => {
  it("dice quante sono fatte e la percentuale che ne deriva", () => {
    render(
      <SottofasiFase
        nomeFase="Impianto" puoModificare puoSegnare {...azioni()}
        sottofasi={[riga({ fatta: true }), riga({ id: "s2", name: "Cavi" }), riga({ id: "s3", name: "Quadro" })]}
      />,
    );
    expect(screen.getByText("1 di 3 · 33%")).toBeInTheDocument();
    expect(screen.getByText("L'avanzamento di questa fase si calcola dalle sottofasi fatte.")).toBeInTheDocument();
  });

  it("segna e toglie la spunta", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga(), riga({ id: "s2", name: "Cavi", fatta: true })]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Tracce: da fare" }));
    expect(a.onSegna).toHaveBeenCalledWith("s1", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: fatta" }));
    expect(a.onSegna).toHaveBeenCalledWith("s2", false);
  });

  it("senza sottofasi l'ufficio vede solo un invito discreto, e la fase resta com'era", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    expect(screen.getByRole("button", { name: "Dividi in sottofasi" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Aggiungi una sottofase a Impianto")).not.toBeInTheDocument();
    expect(screen.queryByText(/L'avanzamento di questa fase si calcola/)).not.toBeInTheDocument();
  });

  it("aggiunge con il nome ripulito, e non aggiunge un nome vuoto", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    const bottone = screen.getByRole("button", { name: "Aggiungi" });
    expect(bottone).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Aggiungi una sottofase a Impianto"), { target: { value: "  Cavi  " } });
    fireEvent.click(bottone);
    expect(a.onAggiungi).toHaveBeenCalledWith("Cavi");
  });

  it("una fase già avviata avvisa, prima di dividerla, che l'avanzamento ripartirà dalle sottofasi", () => {
    render(<SottofasiFase nomeFase="Impianto" avviata={{ percentuale: 60, chiusa: false }} puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    expect(screen.getByRole("note")).toHaveTextContent("già al 60%");
    expect(screen.getByRole("note")).toHaveTextContent("segna subito quelle già completate");
  });

  it("una fase chiusa avvisa che aggiungere sottofasi da fare la riapre", () => {
    render(<SottofasiFase nomeFase="Impianto" avviata={{ percentuale: 100, chiusa: true }} puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    expect(screen.getByRole("note")).toHaveTextContent("la riapri");
  });

  it("una fase non avviata non avvisa", () => {
    render(<SottofasiFase nomeFase="Impianto" avviata={null} puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("rinomina con Invio e toglie dal cestino", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rinomina Tracce" }));
    const campo = screen.getByLabelText("Nome della sottofase Tracce");
    fireEvent.change(campo, { target: { value: "Tracce e scassi" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(a.onRinomina).toHaveBeenCalledWith("s1", "Tracce e scassi");
    fireEvent.click(screen.getByRole("button", { name: "Elimina Tracce" }));
    expect(a.onElimina).toHaveBeenCalledWith("s1");
  });

  it("senza il permesso di modificare non ci sono comandi per aggiungere, rinominare o togliere", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare {...azioni()} sottofasi={[riga()]} />);
    expect(screen.queryByLabelText("Aggiungi una sottofase a Impianto")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rinomina Tracce" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina Tracce" })).not.toBeInTheDocument();
  });

  it("senza il permesso di segnare le caselle sono spente", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare={false} {...azioni()} sottofasi={[riga()]} />);
    expect(screen.getByRole("checkbox", { name: "Tracce: da fare" })).toBeDisabled();
  });

  it("senza sottofasi e in sola lettura non compare niente", () => {
    const { container } = render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare={false} {...azioni()} sottofasi={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
