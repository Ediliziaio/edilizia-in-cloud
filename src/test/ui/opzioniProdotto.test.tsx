import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { problemaCondizione, prezzoOpzioneValido } from "@/lib/listino/opzioniProdotto";
import { normalizzaSelezione } from "@/lib/serramenti/assiCondizionati";
import type { FamilyAxis, FamilyWithAxes } from "@/types/articleFamily";
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "demo" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { FamilyPricePreview } from "@/components/listino/FamilyPricePreview";
import { BulkOpzioniDialog } from "@/components/listino/BulkOpzioniDialog";
afterEach(cleanup);
const axes = [
  { id: "a", codice: "monoblocco", nome: "Monoblocco", values: [
    { id: "no", valore: "no", label: "Senza monoblocco", is_default: true, attivo: true, maggiorazione_tipo: "none", maggiorazione_valore: 0, maggiorazione_acquisto: 0 },
    { id: "yes", valore: "yes", label: "Con monoblocco", attivo: true, maggiorazione_tipo: "none", maggiorazione_valore: 0, maggiorazione_acquisto: 0 },
  ] },
  { id: "b", codice: "cassonetto", nome: "Cassonetto", visibile_se: { asse: "monoblocco", valori: ["yes"] }, values: [
    { id: "box", valore: "box", label: "Cassonetto alto", is_default: true, attivo: true, maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 50, maggiorazione_acquisto: 20 },
  ] },
] as FamilyAxis[];
function preview(costo = 0) {
  const family = { id: "test", prezzo_base_mode: "vendita", modalita_prezzo_base: "pz", prezzo_base_vendita: 100, prezzo_base_acquisto: costo, axes } as FamilyWithAxes;
  render(<QueryClientProvider client={new QueryClient()}><FamilyPricePreview family={family} /></QueryClientProvider>);
}
describe("opzioni prodotto: sicurezza e prezzo leggibile", () => {
  it("senza costo non inventa margine del 100%", () => {
    preview();
    expect(screen.getByText(/Margine non calcolabile/)).toBeInTheDocument();
    expect(screen.queryByText(/100.0%/)).toBeNull();
    expect(screen.queryByText("Cassonetto")).toBeNull();
    expect(screen.getAllByText("100,00 €").length).toBeGreaterThan(0);
  });
  it("con un costo attendibile calcola il margine", () => {
    preview(60);
    expect(screen.getByText("Margine: 40,00 € (40.0%)")).toBeInTheDocument();
  });
  it("elimina scelte inattive e assi nascosti", () => {
    const next = normalizzaSelezione(axes, { monoblocco: "invalid", cassonetto: "box" }).valori;
    expect(next).toEqual({ monoblocco: "no" });
    expect(normalizzaSelezione(axes, { monoblocco: "yes" }).valori).toEqual({ monoblocco: "yes", cassonetto: "box" });
  });
  it("rifiuta riferimenti errati e cicli", () => {
    expect(problemaCondizione("monoblocco", { asse: "cassonetto", valori: ["box"] }, axes)).toMatch(/ciclo/);
    expect(problemaCondizione("x", { asse: "monoblocco", valori: [] }, axes)).toMatch(/attiva/);
    expect(problemaCondizione("cassonetto", { asse: "monoblocco", valori: ["yes"] }, axes)).toBeNull();
  });
  it("non trasforma numeri sbagliati in prezzi zero", () => {
    expect(prezzoOpzioneValido("-2")).toBe(false);
    expect(prezzoOpzioneValido("abc")).toBe(false);
    expect(prezzoOpzioneValido("NaN")).toBe(false);
    expect(prezzoOpzioneValido("12,5")).toBe(true);
  });
  it("bulk mantiene il costo senza copiarlo dalla vendita", () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<BulkOpzioniDialog values={axes[1].values.map(v => ({ ...v, maggiorazione_tipo: "percentuale" }))} initialType="percentuale" busy={false} onClose={() => {}} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("Vendita"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Applica a 1 scelte" }));
    expect(onApply).toHaveBeenCalledWith("percentuale", 10, undefined);
  });
  it("cambio unità richiede il costo esplicito", () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<BulkOpzioniDialog values={axes[1].values} initialType="percentuale" busy={false} onClose={() => {}} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("Vendita"), { target: { value: "10" } });
    expect(screen.getByRole("button", { name: "Applica a 1 scelte" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Costo fornitore"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Applica a 1 scelte" }));
    expect(onApply).toHaveBeenCalledWith("percentuale", 10, 5);
  });
  it("bulk: blocca i campi durante il salvataggio e tiene le azioni fuori dall'area scorrevole", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<BulkOpzioniDialog values={axes[1].values} initialType="percentuale" busy onClose={onClose} onApply={onApply} />);
    const dialog = screen.getByRole("dialog", { name: "Modifica supplementi" });
    expect(dialog).toHaveClass("flex", "overflow-hidden");
    expect(screen.getByRole("combobox", { name: "Come si applica" })).toBeDisabled();
    expect(screen.getByLabelText("Vendita")).toBeDisabled();
    expect(screen.getByLabelText("Costo fornitore")).toBeDisabled();
    const cancel = screen.getByRole("button", { name: "Annulla" });
    expect(cancel).toBeDisabled();
    expect(cancel.parentElement).toHaveClass("shrink-0");
    const body = screen.getByLabelText("Vendita").closest(".overflow-y-auto");
    expect(body?.contains(cancel)).toBe(false);
    fireEvent.click(cancel);
    expect(onClose).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
