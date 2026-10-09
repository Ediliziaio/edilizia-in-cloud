// src/test/ui/settingsFasiPagina.test.tsx
import { cleanup, render as renderBase, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsModelliFasi from "@/pages/azienda/settings/SettingsModelliFasi";

// La pagina porta alle sue sezioni con l'àncora dell'indirizzo (useVaiASezione): serve un Router.
const render = (ui: ReactElement) => renderBase(<MemoryRouter>{ui}</MemoryRouter>);

const state = vi.hoisted(() => ({ role: "company_admin" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsOrders: false }) }));
vi.mock("@/components/settings/ModelliFasiConfig", () => ({ default: () => <div>sezione modelli</div> }));
vi.mock("@/components/settings/AvanzamentoCommessaConfig", () => ({ default: ({ puoModificare }: { puoModificare: boolean }) => <div>sezione avanzamento {String(puoModificare)}</div> }));
vi.mock("@/components/settings/ChiSpuntaConfig", () => ({ default: ({ puoModificare }: { puoModificare: boolean }) => <div>sezione chi spunta {String(puoModificare)}</div> }));
vi.mock("@/components/settings/NuovaCommessaConfig", () => ({ default: ({ puoModificare }: { puoModificare: boolean }) => <div>sezione nuova commessa {String(puoModificare)}</div> }));
afterEach(cleanup);

describe("pagina «Fasi e avanzamento»", () => {
  it("compone le sezioni, e dice alle schede delle regole se si può modificare", () => {
    render(<SettingsModelliFasi />);
    expect(screen.getByText("sezione modelli")).toBeInTheDocument();
    expect(screen.getByText("sezione chi spunta true")).toBeInTheDocument();
    expect(screen.getByText("sezione avanzamento true")).toBeInTheDocument();
    expect(screen.getByText("sezione nuova commessa true")).toBeInTheDocument();
  });
  it("chi non è amministratore e non ha il permesso vede le schede in sola lettura", () => {
    state.role = "staff";
    render(<SettingsModelliFasi />);
    expect(screen.getByText("sezione chi spunta false")).toBeInTheDocument();
    expect(screen.getByText("sezione nuova commessa false")).toBeInTheDocument();
    expect(screen.getByText(/le cambia chi ha «Configurazione Ordini» in modifica/)).toBeInTheDocument();
  });
  it("i modelli, che sono la cosa principale, vengono per primi; le regole, che si toccano una volta, per ultime", () => {
    state.role = "company_admin";
    render(<SettingsModelliFasi />);
    const posizione = (testo: string) => screen.getByText(new RegExp(testo));
    const segue = (prima: HTMLElement, dopo: HTMLElement) => Boolean(prima.compareDocumentPosition(dopo) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(segue(posizione("sezione modelli"), posizione("sezione nuova commessa"))).toBe(true);
    expect(segue(posizione("sezione nuova commessa"), posizione("sezione avanzamento"))).toBe(true);
    expect(segue(posizione("sezione avanzamento"), posizione("sezione chi spunta"))).toBe(true);
  });
});
