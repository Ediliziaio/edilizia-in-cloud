// src/test/ui/settingsFasiPagina.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsModelliFasi from "@/pages/azienda/settings/SettingsModelliFasi";

const state = vi.hoisted(() => ({ role: "company_admin" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsOrders: false }) }));
vi.mock("@/components/settings/ModelliFasiConfig", () => ({ default: () => <div>sezione modelli</div> }));
vi.mock("@/components/settings/AvanzamentoCommessaConfig", () => ({ default: ({ puoModificare }: { puoModificare: boolean }) => <div>sezione avanzamento {String(puoModificare)}</div> }));
vi.mock("@/components/settings/ChiSpuntaConfig", () => ({ default: ({ puoModificare }: { puoModificare: boolean }) => <div>sezione chi spunta {String(puoModificare)}</div> }));
afterEach(cleanup);

describe("pagina «Fasi e avanzamento»", () => {
  it("compone le sezioni, e dice alle schede delle regole se si può modificare", () => {
    render(<SettingsModelliFasi />);
    expect(screen.getByText("sezione modelli")).toBeInTheDocument();
    expect(screen.getByText("sezione chi spunta true")).toBeInTheDocument();
    expect(screen.getByText("sezione avanzamento true")).toBeInTheDocument();
  });
  it("chi non è amministratore e non ha il permesso vede le schede in sola lettura", () => {
    state.role = "staff";
    render(<SettingsModelliFasi />);
    expect(screen.getByText("sezione chi spunta false")).toBeInTheDocument();
  });
});
