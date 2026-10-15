import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { CompanyDetailNavigation } from "@/components/admin/company/CompanyDetailNavigation";
import {
  COMPANY_AREAS,
  COMPANY_SECTIONS,
  companyAreaFor,
} from "@/lib/companyDetailNavigation";
import {
  isCompanyMemberInactive,
  countCompanyLoginAccounts,
} from "@/lib/companyAdminState";
import { ServiceControlRow } from "@/components/admin/company/CompanyBillingTab";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(cleanup);

describe("Scheda azienda in sei aree", () => {
  it("mantiene le 16 destinazioni precedenti più la nuova economia senza duplicati", () => {
    expect(COMPANY_AREAS).toHaveLength(6);
    const sections = COMPANY_AREAS.flatMap((area) =>
      area.sections.map((section) => section.id),
    );
    expect(sections).toHaveLength(17);
    expect(COMPANY_SECTIONS.size).toBe(17);
    expect(companyAreaFor("onboarding").id).toBe("relazione");
    expect(companyAreaFor("whitelabel").id).toBe("piano");
    expect(companyAreaFor("billing").id).toBe("consumi");
  });
  it("mostra soltanto le sezioni dell'area attiva e ricorda l'ultima visitata", () => {
    function Demo() {
      const [value, setValue] = useState("panoramica");
      return (
        <Tabs value={value} onValueChange={setValue}>
          <CompanyDetailNavigation value={value} onChange={setValue} />
        </Tabs>
      );
    }
    render(<Demo />);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Relazione cliente" }));
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    fireEvent.mouseDown(
      screen.getByRole("tab", { name: "Percorso di avvio" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Riepilogo" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Relazione cliente" }));
    expect(
      screen.getByRole("tab", { name: "Percorso di avvio" }),
    ).toHaveAttribute("aria-selected", "true");
  });
  it("non considera inattivo da 30gg un account creato da 29gg e mai usato", () => {
    expect(
      isCompanyMemberInactive(
        { created_at: "2026-09-16T12:00:00Z", last_login_at: null },
        30,
        new Date("2026-10-15T12:00:00Z"),
      ),
    ).toBe(false);
    expect(
      isCompanyMemberInactive(
        { created_at: "2026-09-01T12:00:00Z", last_login_at: null },
        30,
        new Date("2026-10-15T12:00:00Z"),
      ),
    ).toBe(true);
    expect(
      isCompanyMemberInactive(
        {
          created_at: "2026-01-01T12:00:00Z",
          last_login_at: "2026-10-14T12:00:00Z",
        },
        30,
        new Date("2026-10-15T12:00:00Z"),
      ),
    ).toBe(false);
  });
  it("conta gli account unici e non usa il numero dei clienti o dipendenti senza accesso", () => {
    expect(
      countCompanyLoginAccounts({
        admins: [{ id: "a" }, { id: "b" }],
        staff: [{ id: "a" }],
        employees: [{ user_id: "b" }, { user_id: null }],
        salespeople: [{ user_id: null }],
      }),
    ).toBe(2);
  });
});

describe("Tariffe servizio: salvataggio unico", () => {
  const props = (): import("react").ComponentProps<typeof ServiceControlRow> => ({
    service: "ai_agents",
    label: "Agenti AI",
    icon: (): import("react").ReactElement | null => null,
    override: null,
    planDefaults: {
      price_per_unit_eur: null,
      markup_multiplier: null,
      monthly_fee_eur: null,
    },
    onSave: vi.fn(),
    onReset: vi.fn(),
    isSaving: false,
    isResetting: false,
  });
  it("gli switch non scrivono subito e non cancellano il prezzo in bozza", () => {
    const p = props();
    render(<ServiceControlRow {...p} />);
    fireEvent.change(screen.getAllByRole("spinbutton")[0], {
      target: { value: "0.25" },
    });
    fireEvent.click(screen.getAllByRole("switch")[1]);
    expect(p.onSave).not.toHaveBeenCalled();
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(0.25);
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(p.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "ai_agents",
        price_per_unit_eur: 0.25,
        is_free: true,
      }),
    );
  });
  it("rifiuta importi negativi senza salvare", () => {
    const p = props();
    render(<ServiceControlRow {...p} />);
    fireEvent.change(screen.getAllByRole("spinbutton")[0], {
      target: { value: "-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(p.onSave).not.toHaveBeenCalled();
  });
});
