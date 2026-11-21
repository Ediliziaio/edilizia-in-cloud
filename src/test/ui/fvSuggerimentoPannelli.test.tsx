import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FvSuggerimentoPannelli } from "@/components/fotovoltaico/FvSuggerimentoPannelli";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import { analisiConsumiIniziale } from "../../../supabase/functions/_shared/fvBollette";
import { creaDisegnoTetto } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";

afterEach(cleanup);
const base: WizardData = {
  ...INITIAL,
  consumo_annuo_kwh: 6000,
  ore_sole_annue: 1600,
  fonte_dati_tetto: "pvgis",
  pannello_id: "modulo",
  layout_overlay: { modalita: "senza_mappa" },
};
const catalogo = [{ id: "modulo", potenza_w: 500 }];
const mostra = (patch: Partial<WizardData> = {}, modificabile = true) => {
  const onApplica = vi.fn();
  const r = render(<FvSuggerimentoPannelli data={{ ...base, ...patch }} pannelli={catalogo} modificabile={modificabile} onApplica={onApplica} />);
  return { ...r, onApplica };
};

describe("Suggerimento pannelli prima del disegno", () => {
  it("usa automaticamente consumi e resa solare, applicando quantità e potenza solo al click", () => {
    const { onApplica } = mostra();
    expect(screen.getByText("10 pannelli da 500 Wp")).toBeVisible();
    expect(screen.getByText(/Resa da PVGIS/)).toHaveTextContent("1.210 kWh per kWp");
    expect(onApplica).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usa 10 pannelli nel preventivo" }));
    expect(onApplica).toHaveBeenCalledWith({ numero_pannelli_scelti: 10, potenza_kwp: 5 });
    expect(screen.getByText(/non significa azzerare la bolletta/)).toBeVisible();
  });

  it("aggiorna la stima per nuovi consumi e riprende gli stessi valori dalla bozza salvata", () => {
    const analisi = analisiConsumiIniziale();
    analisi.profilo.aumentoConsumiPct = 50;
    const salvata = JSON.parse(JSON.stringify({ ...base, analisi_consumi: analisi }));
    mostra(salvata);
    expect(screen.getByText("15 pannelli da 500 Wp")).toBeVisible();
    expect(screen.getByText(/compresi i nuovi consumi previsti/)).toHaveTextContent("9.000 kWh");
  });

  it.each([null, 0, NaN, Infinity])("non inventa una resa quando manca o è invalida: %s", ore => {
    mostra({ ore_sole_annue: ore });
    expect(screen.getByRole("status")).toHaveTextContent("Calcola la stima solare");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("esclude i dati mock dal suggerimento", () => {
    mostra({ tetto_mock: true });
    expect(screen.getByRole("status")).toHaveTextContent("Calcola la stima solare");
  });

  it("richiede i consumi senza sostituirli con valori predefiniti", () => {
    mostra({ consumo_annuo_kwh: null });
    expect(screen.getByRole("status")).toHaveTextContent("Conferma i consumi della bolletta");
  });

  it("mostra kWp indicativi senza inventare i watt di un pannello non scelto", () => {
    mostra({ pannello_id: null });
    expect(screen.getByText(/kWp indicativi/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Scegli il modello di pannello");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    { kit_bundle_id: "kit" },
    { layout_overlay: creaDisegnoTetto("singola", 10, 8) },
    { layout_overlay: { x: 0, y: 0, rot: 0, cols: 4, unita: "m" } },
  ] as Partial<WizardData>[])("non riscrive un kit o una posa esistente", patch => {
    const { onApplica } = mostra(patch);
    expect(screen.getByText("10 pannelli da 500 Wp")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(onApplica).not.toHaveBeenCalled();
  });

  it("rispetta i permessi di sola lettura", () => {
    mostra({}, false);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("mantiene distinta la stima manuale dalla fonte PVGIS", () => {
    mostra({ fonte_dati_tetto: "manuale" });
    expect(screen.getByText(/Resa da stima manuale/)).toBeVisible();
  });
});
