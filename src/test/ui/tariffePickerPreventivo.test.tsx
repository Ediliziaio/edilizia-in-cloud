import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TariffePickerDialog } from "@/components/marketing/preventivi/TariffePickerDialog";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";

afterEach(cleanup);
const voci: TariffaPro[] = Array.from({ length: 51 }, (_, i) => ({
  id: `t${i}`,
  nome: `Voce ${i}`,
  tipo: "manodopera",
  prezzo_vendita: i === 50 ? 0.0044 : 100,
  prezzo_costo: 60,
  unita: "mq",
  unita_fatturazione: "pz",
  codice: `REG-${i}`,
  fonte: "Molise 2026",
}));
const archiviate = [
  { ...voci[0], id: "archiviata", nome: "Voce archiviata", attivo: false },
];
function apri() {
  const onPick = vi.fn();
  render(
    <TariffePickerDialog
      open
      onClose={vi.fn()}
      onPick={onPick}
      tariffe={[...voci, ...archiviate]}
    />,
  );
  return onPick;
}
describe("Tariffe nel preventivo: tutto il catalogo attivo", () => {
  it("permette di scegliere una tariffa oltre le prime 50 senza includere le archiviate", () => {
    const onPick = apri();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1–30 di 51 voci attive",
    );
    fireEvent.click(screen.getByRole("button", { name: "Successive" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "31–51 di 51 voci attive",
    );
    expect(screen.getByText("Voce 50")).toBeInTheDocument();
    expect(screen.queryByText("Voce archiviata")).toBeNull();
    expect(screen.getByText("0,0044", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Voce 50/ }));
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi servizio" }));
    expect(onPick).toHaveBeenCalledWith(voci[50], 1);
  });
  it("trova codice e fonte su tutte le pagine e mostra l'unità originale", () => {
    apri();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca tariffa nel listino" }),
      { target: { value: "REG-50" } },
    );
    expect(screen.getByText("Voce 50")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voce 50/ })).toHaveTextContent("m²");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1–1 di 1 voce attiva",
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca tariffa nel listino" }),
      { target: { value: "Molise 2026" } },
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "1–30 di 51 voci attive",
    );
  });
});
