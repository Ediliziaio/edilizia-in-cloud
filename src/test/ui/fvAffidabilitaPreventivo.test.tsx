import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FvRiconciliazioneBolletta } from "@/components/fotovoltaico/FvRiconciliazioneBolletta";
import { FvVerificaMisure } from "@/components/fotovoltaico/tetto/FvVerificaMisure";
import { FvConfrontoConfigurazioni } from "@/components/fotovoltaico/FvConfrontoConfigurazioni";
import { creaDisegnoTetto } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { proposteImpiantoFv } from "@/lib/fotovoltaico/proposteImpianto";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
afterEach(cleanup);
const p = () => ({ ...creaDisegnoTetto("singola", 12, 8), schema3d: { altezza: 5.5, pendenza: 20 } });

describe("Spesa e quote nella schermata commerciale", () => {
  it("mostra lo scarto con il totale letto senza richiedere di reinserire la bolletta", () => {
    render(<FvRiconciliazioneBolletta consumo={2787} costoKwh={.28} fissi={274.1} spesaLetta={1148.02} />);
    fireEvent.click(screen.getByText("Dalla spesa in bolletta al risparmio stimato"));
    const v = screen.getByLabelText("Riconciliazione della spesa annua");
    expect(v).toHaveTextContent("1.148,02"); expect(v).toHaveTextContent("93,56"); expect(v).toHaveTextContent("1.054,46");
    expect(screen.getByText(/La differenza non è inclusa nel risparmio/)).toBeVisible();
  });
  it("segnala la tariffa incoerente e non nasconde lo scarto negativo", () => {
    render(<FvRiconciliazioneBolletta consumo={3000} costoKwh={.4} fissi={200} spesaLetta={1000} />);
    fireEvent.click(screen.getByText("Dalla spesa in bolletta al risparmio stimato"));
    expect(screen.getByRole("status")).toHaveTextContent("Il modello supera la spesa letta");
  });
});

describe("Verifica del rilievo esplicita e persistibile", () => {
  it("richiede fonte, data e confronto esplicito senza cambiare la geometria", () => {
    const piano = p(), onChange = vi.fn();
    render(<FvVerificaMisure piano={piano} modificabile onChange={onChange} />);
    fireEvent.click(screen.getByText("Misure da verificare"));
    const btn = screen.getByRole("button", { name: "Registra il confronto delle misure" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Data della verifica misure"), { target: { value: "2026-11-20" } });
    fireEvent.click(screen.getByRole("checkbox")); expect(btn).toBeEnabled(); fireEvent.click(btn);
    const salvato = onChange.mock.calls[0][0];
    expect(salvato.confermaMisure).toMatchObject({ fonte: "sopralluogo", data: "2026-11-20" });
    expect(salvato.falde).toEqual(piano.falde); expect(salvato.schema3d).toEqual(piano.schema3d);
  });
  it("non consente di registrare una verifica futura o di modificare un documento emesso", () => {
    const change = vi.fn(), r = render(<FvVerificaMisure piano={p()} modificabile onChange={change} />);
    fireEvent.click(screen.getByText("Misure da verificare"));
    fireEvent.change(screen.getByLabelText("Data della verifica misure"), { target: { value: "2099-01-01" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Registra il confronto delle misure" })).toBeDisabled();
    r.rerender(<FvVerificaMisure piano={p()} modificabile={false} onChange={change} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(change).not.toHaveBeenCalled();
  });
});

const listino = { pannelli: [{ id: "p", potenza_w: 500, prezzo_vendita: 200 }], inverter: [{ id: "i", prezzo_vendita: 1200 }], accumuli: [{ id: "b", capacita_kwh: 5, prezzo_vendita: 5000 }] };
const d: WizardData = { ...INITIAL, consumo_annuo_kwh: 6000, costo_kwh_attuale: .28, ore_sole_annue: 1600, pannello_id: "p", inverter_id: "i", manodopera_righe: [{ descrizione: "Posa", tariffa_id: null, ore: 20, tariffa_oraria_netta: 30, tariffa_oraria_vendita: 50 }] };
describe("Applicazione delle proposte", () => {
  it("protegge la posa salvata finché l’operatore conferma e distingue il costo incrementale della batteria", () => {
    const confronto = proposteImpiantoFv(d, listino, [])!, onScegli = vi.fn();
    render(<FvConfrontoConfigurazioni confronto={confronto} modificabile pannelliSalvati={5} onScegli={onScegli} />);
    expect(screen.getByText(/non recupera il costo della batteria/)).toBeVisible();
    const card = screen.getByRole("heading", { name: "Con accumulo" }).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Usa questa configurazione" }));
    expect(onScegli).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mantieni la posa salvata" }));
    expect(onScegli).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByRole("button", { name: "Usa questa configurazione" }));
    fireEvent.click(screen.getByRole("button", { name: "Applica la nuova disposizione" }));
    expect(onScegli).toHaveBeenCalledOnce(); expect(onScegli.mock.calls[0][0].id).toBe("accumulo");
  });
  it("se il confronto cambia durante la conferma non applica una proposta superata", () => {
    const confronto = proposteImpiantoFv(d, listino, [])!, onScegli = vi.fn();
    const r = render(<FvConfrontoConfigurazioni confronto={confronto} modificabile pannelliSalvati={5} onScegli={onScegli} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Usa questa configurazione" })[0]);
    r.rerender(<FvConfrontoConfigurazioni confronto={proposteImpiantoFv({ ...d, consumo_annuo_kwh: 12000 }, listino, [])!} modificabile pannelliSalvati={5} onScegli={onScegli} />);
    expect(screen.getByRole("button", { name: "Applica la nuova disposizione" })).toBeDisabled();
    expect(onScegli).not.toHaveBeenCalled();
  });
  it("i permessi impediscono di applicare tutte le proposte", () => {
    render(<FvConfrontoConfigurazioni confronto={proposteImpiantoFv(d, listino, [])!} modificabile={false} pannelliSalvati={5} onScegli={vi.fn()} />);
    screen.getAllByRole("button", { name: "Usa questa configurazione" }).forEach(b => expect(b).toBeDisabled());
  });
});
