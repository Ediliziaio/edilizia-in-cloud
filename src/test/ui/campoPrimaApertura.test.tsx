/** Piano campo completo 1.1 (26/11/2026): la prima apertura chiede la lingua solo a chi non l'ha mai scelta. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const stato = vi.hoisted(() => ({ scelta: false, profilo: { id: "p1" } as { id: string } | null, scegli: vi.fn() }));
vi.mock("@/lib/campo/lingua/LinguaCampo", () => ({
  useLinguaCampo: () => ({ scelta: stato.scelta, scegli: stato.scegli, t: (s: string) => s }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: stato.profilo }) }));

import { PrimaAperturaCampo } from "@/components/campo/PrimaAperturaCampo";

describe("prima apertura dell'app operai", () => {
  it("chi non ha scelto la lingua la sceglie, poi vede la guida e può saltarla", () => {
    stato.scelta = false; stato.profilo = { id: "p1" };
    render(<PrimaAperturaCampo />);
    fireEvent.click(screen.getByRole("button", { name: /Română/ }));
    expect(stato.scegli).toHaveBeenCalledWith("ro");
    expect(screen.getByRole("heading", { name: "Timbra" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salta" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("chi ha già scelto non vede niente", () => {
    stato.scelta = true; stato.profilo = { id: "p1" };
    render(<PrimaAperturaCampo />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("finché il profilo non è caricato non compare (niente lampo)", () => {
    stato.scelta = false; stato.profilo = null;
    render(<PrimaAperturaCampo />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
