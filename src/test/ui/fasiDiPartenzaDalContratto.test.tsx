/**
 * La tendina «Fasi di lavoro» quando le fasi vengono dal contratto letto (15/11/2026).
 *
 * Al collaudo a schermo, passare a «Dal contratto letto» faceva mandare a Radix un cambio con valore vuoto; il
 * gestore lo leggeva come «Nessuna» e le sei fasi del contratto sparivano subito dopo «Applica».
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FasiDiPartenzaSelect, sceltaFasiDiPartenza } from "@/components/orders/FasiDiPartenzaSelect";
import type { ModelloFasi } from "@/lib/orders/modelliFasi";

const offerti = [{ id: "m1", nome: "Ristrutturazione bagno", fasi: [] }] as unknown as ModelloFasi[];

describe("Fasi di partenza: dal contratto", () => {
  it("passare a «Dal contratto letto» non cambia la scelta", () => {
    const onChange = vi.fn();
    const { rerender } = render(<FasiDiPartenzaSelect offerti={offerti} valore="" onChange={onChange} />);
    expect(screen.getByRole("combobox", { name: "Fasi di lavoro" })).toHaveTextContent("Nessuna: le scelgo dopo");
    rerender(<FasiDiPartenzaSelect offerti={offerti} valore="" onChange={onChange} dalContratto />);
    expect(screen.getByRole("combobox", { name: "Fasi di lavoro" })).toHaveTextContent("Dal contratto letto");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("il cambio vuoto che Radix manda da solo non vale «Nessuna»", () => {
    expect(sceltaFasiDiPartenza("")).toBeNull();
    expect(sceltaFasiDiPartenza("__contratto__")).toBeNull();
    expect(sceltaFasiDiPartenza("__nessuna__")).toBe("");
    expect(sceltaFasiDiPartenza("m1")).toBe("m1");
  });
});
