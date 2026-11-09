import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollegamentiImpostazioni } from "@/components/impostazioni/CollegamentiImpostazioni";
const state = vi.hoisted(() => ({ voci: [] as { title: string; url: string }[] }));
vi.mock("@/hooks/useVociImpostazioni", () => ({ useVociImpostazioni: () => ({ voci: state.voci }) }));
afterEach(cleanup);
describe("rimandi tra impostazioni", () => {
  it("mostra soltanto destinazioni presenti nell'indice autorizzato", () => {
    state.voci = [{ title: "Stati commessa", url: "/azienda/impostazioni/stati-ordine" }];
    render(<MemoryRouter><CollegamentiImpostazioni sezione="modelli-fasi" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Stati commessa/ })).toHaveAttribute("href", "/azienda/impostazioni/stati-ordine");
    expect(screen.queryByRole("link", { name: /Rapportini/ })).not.toBeInTheDocument();
  });
  it("senza destinazioni accessibili non lascia una sezione vuota", () => {
    state.voci = [];
    render(<MemoryRouter><CollegamentiImpostazioni sezione="modelli-fasi" /></MemoryRouter>);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
