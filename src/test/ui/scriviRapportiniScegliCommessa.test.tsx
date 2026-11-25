import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScriviRapportiniScegliCommessa } from "@/components/orders/ScriviRapportiniScegliCommessa";

vi.mock("@/components/orders/CommessaCombobox", () => ({
  CommessaCombobox: ({ onChange }: { onChange: (id: string | null) => void }) => (
    <button type="button" onClick={() => onChange("commessa-7")}>Scegli COM-7</button>
  ),
}));
vi.mock("@/components/orders/RapportiniUfficio", () => ({
  RapportiniUfficio: ({ orderId, aperta, onApertaChange }: { orderId: string; aperta?: boolean; onApertaChange?: (v: boolean) => void }) =>
    aperta ? <div role="dialog" aria-label="Finestra rapportini">Rapportini su {orderId}<button type="button" onClick={() => onApertaChange?.(false)}>Chiudi</button></div> : null,
}));

describe("Commesse → Rapportini: «Scrivi rapportini» con la scelta della commessa", () => {
  it("prima si sceglie la commessa, poi si apre la finestra del rapportino su quella commessa", () => {
    render(<ScriviRapportiniScegliCommessa />);
    fireEvent.click(screen.getByRole("button", { name: "Scrivi rapportini" }));
    const continua = screen.getByRole("button", { name: "Continua" });
    expect(continua).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Scegli COM-7" }));
    fireEvent.click(continua);
    expect(screen.getByRole("dialog", { name: "Finestra rapportini" })).toHaveTextContent("Rapportini su commessa-7");
  });

  it("chiusa la finestra, la volta dopo la commessa va scelta di nuovo", () => {
    render(<ScriviRapportiniScegliCommessa />);
    fireEvent.click(screen.getByRole("button", { name: "Scrivi rapportini" }));
    fireEvent.click(screen.getByRole("button", { name: "Scegli COM-7" }));
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog", { name: "Finestra rapportini" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Scrivi rapportini" }));
    expect(screen.getByRole("button", { name: "Continua" })).toBeDisabled();
  });
});
