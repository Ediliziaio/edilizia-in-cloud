import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import "@testing-library/jest-dom/vitest";
const s = vi.hoisted(() => ({
  permissions: true,
  disabledFeature: "",
  role: "company_admin",
  mounts: [] as string[],
  billing: true,
  mode: "native",
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewBilling: s.billing, isLoading: false }),
}));
vi.mock("@/contexts/BillingModeContext", () => ({
  useBillingMode: () => ({ mode: s.mode, isLoading: false }),
}));
vi.mock("@/hooks/useFeatureAccess", () => ({
  useFeatureAccess: () => ({
    isEnabled: s.disabledFeature !== "documenti",
    isPreview: false,
    isLoading: false,
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ role: s.role, userRoles: [] as string[] }),
}));
vi.mock("@/components/auth/RequireCompanyPermission", () => ({
  RequireCompanyPermission: ({ children }: { children: ReactNode }) =>
    s.permissions ? children : <p>Accesso negato</p>,
}));
vi.mock("@/components/auth/FeatureRoute", () => ({
  FeatureRoute: ({
    children,
    featureKey,
  }: {
    children: ReactNode;
    featureKey: string;
  }) =>
    s.disabledFeature === featureKey ? <p>Modulo non abilitato</p> : children,
}));
vi.mock("@/components/billing/BillingModeGuard", () => ({
  BillingModeGuard: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/error/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/pages/azienda/fatturazione/RegistroIVA", () => ({
  default: () => {
    s.mounts.push("iva");
    return <p>Registro montato</p>;
  },
}));
vi.mock("@/pages/azienda/ContabilitaFiscale", () => ({
  default: () => {
    s.mounts.push("contabilita");
    return <p>Contabilità montata</p>;
  },
}));
vi.mock("@/pages/azienda/RitenuteGaranzia", () => ({
  default: () => {
    s.mounts.push("ritenute");
    return <p>Ritenute montate</p>;
  },
}));
vi.mock("@/pages/azienda/ArchivioSostitutivo", () => ({
  default: () => {
    s.mounts.push("archivio");
    return <p>Archivio montato</p>;
  },
}));
import FiscalWorkspace, {
  FiscalLegacyRedirect,
  FiscalStandaloneWorkspace,
} from "@/components/fatturazione/FiscalWorkspace";
function Location() {
  const p = useLocation();
  return <output data-testid="location">{p.pathname + p.search}</output>;
}
function setup(url = "/azienda/documenti?tab=fiscalita&anno=2025&mese=9") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <FiscalWorkspace />
      <Location />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  s.permissions = true;
  s.disabledFeature = "";
  s.role = "company_admin";
  s.mounts = [];
  s.billing = true;
  s.mode = "native";
});
afterEach(cleanup);
it("uses the shared rounded menus and keeps period context after real option selections", async () => {
  setup("/azienda/documenti?tab=fiscalita&anno=2025&mese=9&q_iva=test");
  await screen.findByText("Registro montato");
  expect(screen.getByRole("combobox", { name: "Anno fiscale" }).tagName).toBe(
    "BUTTON",
  );
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Anno fiscale" }), {
    key: "ArrowDown",
  });
  fireEvent.click(await screen.findByRole("option", { name: "2024" }));
  expect(screen.getByLabelText("Anno fiscale")).toHaveTextContent("2024");
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Tipo periodo fiscale" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(await screen.findByRole("option", { name: "Trimestrale" }));
  expect(screen.getByLabelText("Periodo fiscale")).toHaveTextContent(
    "3° trimestre",
  );
  expect(screen.getByTestId("location")).toHaveTextContent("q_iva=test");
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Periodo fiscale" }), {
    key: "ArrowDown",
  });
  fireEvent.click(await screen.findByRole("option", { name: "1° trimestre" }));
  expect(screen.getByTestId("location")).toHaveTextContent("mese=1");
  fireEvent.keyDown(screen.getByRole("tab", { name: "Registro IVA" }), {
    key: "End",
  });
  expect(await screen.findByText("Archivio montato")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Archivio fiscale" })).toHaveFocus();
  expect(
    screen.queryByRole("combobox", { name: "Periodo fiscale" }),
  ).toBeNull();
});
it("keeps the year selector and original module in the standalone fallback", async () => {
  s.billing = false;
  render(
    <MemoryRouter initialEntries={["/legacy?anno=2025&mese=9"]}>
      <FiscalLegacyRedirect
        section="contabilita"
        fallback={<FiscalStandaloneWorkspace section="contabilita" />}
      />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Contabilità montata")).toBeInTheDocument();
  expect(screen.getByLabelText("Anno fiscale")).toHaveTextContent("2025");
  expect(s.mounts).not.toContain("iva");
});
it.each(["permission", "feature"])(
  "preserves standalone legacy access without expanding billing entitlement: %s",
  async (reason) => {
    if (reason === "permission") s.billing = false;
    if (reason === "feature") s.disabledFeature = "documenti";
    render(
      <MemoryRouter initialEntries={["/legacy"]}>
        <Routes>
          <Route
            path="/legacy"
            element={
              <FiscalLegacyRedirect
                section="contabilita"
                fallback={<p>Contabilità autorizzata dalla rotta originale</p>}
              />
            }
          />
          <Route path="/azienda/documenti" element={<p>Hub fatture</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Contabilità autorizzata dalla rotta originale"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hub fatture")).not.toBeInTheDocument();
  },
);
it("keeps four modules inside the billing page, retaining the same period and loading only the active content", async () => {
  setup();
  await screen.findByText("Registro montato");
  expect(s.mounts).toEqual(["iva"]);
  fireEvent.click(screen.getByRole("tab", { name: "Archivio fiscale" }));
  await screen.findByText("Archivio montato");
  expect(screen.getByTestId("location")).toHaveTextContent(
    "/azienda/documenti?",
  );
  expect(screen.getByTestId("location")).toHaveTextContent("anno=2025");
  expect(screen.getByTestId("location")).toHaveTextContent("sezione=archivio");
  expect(s.mounts).not.toContain("contabilita");
  expect(s.mounts).not.toContain("ritenute");
});
it("does not mount denied content", () => {
  s.permissions = false;
  setup();
  expect(screen.getByText("Accesso negato")).toBeVisible();
  expect(s.mounts).toEqual([]);
});
it("preserves feature gate checks inside the hub", () => {
  s.disabledFeature = "archivio_sostitutivo";
  setup("/azienda/documenti?tab=fiscalita&sezione=archivio");
  expect(screen.getByText("Modulo non abilitato")).toBeVisible();
  expect(s.mounts).toEqual([]);
});
it("commercialistaMode URL is not a credential", () => {
  s.permissions = false;
  setup("/azienda/documenti?tab=fiscalita&commercialistaMode=1");
  expect(screen.getByText("Accesso negato")).toBeVisible();
});
it("a genuine accountant exception applies only to the already delegated register, not other modules", async () => {
  s.permissions = false;
  s.role = "accountant";
  setup("/azienda/documenti?tab=fiscalita&commercialistaMode=1");
  await screen.findByText("Registro montato");
  fireEvent.click(screen.getByRole("tab", { name: "Contabilità fiscale" }));
  expect(screen.getByText("Accesso negato")).toBeVisible();
  expect(s.mounts).not.toContain("contabilita");
});
it("old routes redirect to the same workspace and preserve context", async () => {
  render(
    <MemoryRouter initialEntries={["/old?anno=2024&commercialistaMode=1"]}>
      <Routes>
        <Route
          path="old"
          element={<FiscalLegacyRedirect section="archivio" />}
        />
        <Route path="azienda/documenti" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByTestId("location")).toHaveTextContent(
    "anno=2024&commercialistaMode=1&tab=fiscalita&sezione=archivio",
  );
});

it("chi fattura con un altro programma entra nello stesso hub dall'indirizzo vecchio", async () => {
  s.mode = "external";
  render(
    <MemoryRouter initialEntries={["/legacy"]}>
      <Routes>
        <Route
          path="/legacy"
          element={
            <FiscalLegacyRedirect
              section="contabilita"
              fallback={<p>Contabilità autorizzata dalla rotta originale</p>}
            />
          }
        />
        <Route path="/azienda/documenti" element={<p>Hub fatture</p>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText("Hub fatture")).toBeInTheDocument();
});
it("il Registro IVA si apre anche a chi fattura con un altro programma (legge native e importate)", async () => {
  s.mode = "external";
  setup("/azienda/documenti?tab=fiscalita&sezione=iva");
  expect(await screen.findByText("Registro montato")).toBeInTheDocument();
});
