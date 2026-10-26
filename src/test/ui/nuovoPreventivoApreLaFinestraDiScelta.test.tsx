/**
 * «Nuovo preventivo» dal contatto e dall'opportunità (26/10/2026): apre la stessa finestra di scelta dell'elenco
 * Preventivi (aree e modelli abilitati), con contatto e opportunità già collegati. Prima era un menu a discesa che
 * mandava al preventivo «classico»: un preventivo diverso da quello creato dall'elenco (segnalato da Dimora).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const finestra = vi.hoisted(() => vi.fn());
vi.mock("@/components/marketing/preventivi/moduli/NewQuoteDialog", () => ({
  NewQuoteDialog: (props: { open: boolean; params: URLSearchParams; trigger: React.ReactNode; onOpenChange: (o: boolean) => void }) => {
    finestra(props);
    return <div><span onClick={() => props.onOpenChange(true)}>{props.trigger}</span>{props.open && <div role="dialog">Che preventivo vuoi creare?</div>}</div>;
  },
}));
vi.mock("@/lib/moduli-vendita", () => ({
  useModuliVendita: () => ({ moduli: [] as unknown[] }),
  useModuliVisibilita: () => ({ isModuloVisibile: () => true }),
}));

import { NewPreventivoMenu } from "@/components/marketing/preventivi/NewPreventivoMenu";

afterEach(() => { cleanup(); finestra.mockClear(); });

const monta = (percorso: string, props: Partial<Parameters<typeof NewPreventivoMenu>[0]> = {}) =>
  render(<MemoryRouter initialEntries={[percorso]}><NewPreventivoMenu contactId="c1" opportunityId="o1" label="Preventivo" {...props} /></MemoryRouter>);

describe("NewPreventivoMenu", () => {
  it("nell'app dell'azienda apre la finestra di scelta, non un menu a discesa", () => {
    monta("/azienda/marketing/opportunita");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Preventivo/ }));
    expect(screen.getByRole("dialog").textContent).toContain("Che preventivo vuoi creare?");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("porta con sé il contatto e l'opportunità, così il preventivo nasce già collegato", () => {
    monta("/azienda/marketing/contatti/c1");
    const { params } = finestra.mock.calls[0][0] as { params: URLSearchParams };
    expect(params.get("contact_id")).toBe("c1");
    expect(params.get("opportunity_id")).toBe("o1");
  });

  it("solo il contatto, o solo l'opportunità: porta solo quello che c'è", () => {
    monta("/azienda/marketing/contatti/c1", { opportunityId: null });
    expect((finestra.mock.calls[0][0] as { params: URLSearchParams }).params.toString()).toBe("contact_id=c1");
  });

  it("dall'hub amministrativo resta il menu di prima (le rotte della finestra sono quelle dell'azienda)", () => {
    monta("/admin/marketing/opportunita");
    expect(finestra).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Preventivo/ }).getAttribute("href")).toBe("/admin/marketing/preventivi/nuovo?contact_id=c1&opportunity_id=o1");
  });

  it("con «Crea con AI» resta il menu, che ha la voce in più", () => {
    monta("/azienda/marketing/opportunita", { onCreaConAI: () => undefined });
    expect(finestra).not.toHaveBeenCalled();
  });
});
