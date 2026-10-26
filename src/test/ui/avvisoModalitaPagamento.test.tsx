/**
 * Le modalità di pagamento dei preventivi edili sono il testo scritto nel modello (26/10/2026): se manca, nel PDF il
 * riquadro non c'è. L'avviso lo dice dove si decide l'economia, e porta al modello.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const permessi = vi.hoisted(() => ({ isAdmin: true, canViewSettingsPricing: false }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));

import { AvvisoModalitaPagamento, testoPagamentoVuoto } from "@/components/moduli/AvvisoModalitaPagamento";

afterEach(() => { cleanup(); permessi.isAdmin = true; permessi.canViewSettingsPricing = false; });
const monta = (testo: string | null | undefined, caricato = true) => render(<MemoryRouter><AvvisoModalitaPagamento testo={testo} caricato={caricato} /></MemoryRouter>);

describe("testoPagamentoVuoto", () => {
  it("vuoto è anche il testo ricco senza parole", () => {
    for (const v of [null, undefined, "", "   ", "<p></p>", "<p>&nbsp;</p>", "<p> <br/> </p>"]) expect(testoPagamentoVuoto(v)).toBe(true);
    expect(testoPagamentoVuoto("<p>30% alla firma</p>")).toBe(false);
  });
});

describe("AvvisoModalitaPagamento", () => {
  it("con il testo scritto nel modello non compare", () => {
    const { container } = monta("<p>30% alla firma, saldo a fine lavori</p>");
    expect(container.firstChild).toBeNull();
  });

  it("senza testo dice che nel PDF non compaiono e porta al modello", () => {
    monta(null);
    expect(screen.getByRole("note").textContent).toContain("Nel PDF non compaiono le modalità di pagamento");
    expect(screen.getByRole("link", { name: "apri il modello" }).getAttribute("href")).toBe("/azienda/impostazioni/template-preventivi");
  });

  it("chi non può modificare il modello vede la frase, senza il link", () => {
    permessi.isAdmin = false;
    monta("<p></p>");
    expect(screen.getByRole("note").textContent).toContain("Chiedi a chi gestisce il modello");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("finché il modello non è caricato non dice niente (non si allarma per un modello che sta arrivando)", () => {
    const { container } = monta(undefined, false);
    expect(container.firstChild).toBeNull();
  });
});
