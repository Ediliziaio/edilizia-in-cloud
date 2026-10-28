import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
const state = vi.hoisted(() => ({ read: true }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "demo",
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewBilling: state.read, isLoading: false }),
}));
vi.mock("@/hooks/useFeatureAccess", () => ({
  useFeatureAccess: () => ({
    isEnabled: true,
    isPreview: false,
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useArchivioSostitutivo", () => ({
  useArchivioSostitutivo: () => ({
    documenti: [
      {
        id: "manual",
        tipo_documento: "altro",
        note: "Ricevuta da controllare",
        storage_path: "demo/file.pdf",
      },
    ],
    canUpload: false,
    isLoading: false,
    isError: false,
    inScadenzaProssimi365gg: [] as string[],
    getSignedUrl: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      {
        id: "s",
        numero: "V-1",
        origin: "vendite",
        stato: "emessa",
        data_emissione: "2026-10-01",
        sdi_file_xml_url: "present",
      },
      {
        id: "a",
        numero_fattura: "A-1",
        origin: "acquisti",
        stato: "letta",
        data_fattura: "2026-10-02",
        xml_url: null as string | null,
      },
    ],
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/components/fatturazione/FiscalWorkspace", () => ({
  FiscalLegacyRedirect: (): null => null,
  FiscalStandaloneWorkspace: (): null => null,
}));
vi.mock("@/components/fatturazione/FiscalSourceViewer", () => ({
  FiscalSourceViewer: ({ label }: { label: string }) => (
    <button>{label}</button>
  ),
}));
vi.mock("@/components/archivio/ArchivioUploader", () => ({
  ArchivioUploader: (): null => null,
}));
vi.mock("@/components/archivio/ArchivioTable", () => ({
  ArchivioTable: ({ documenti }: { documenti: { note: string }[] }) => (
    <div>
      {documenti.map((d, i) => (
        <p key={i}>{d.note}</p>
      ))}
    </div>
  ),
}));
import Archivio from "@/pages/azienda/ArchivioSostitutivo";
function Location() {
  return <output data-testid="url">{useLocation().search}</output>;
}
function setup() {
  render(
    <MemoryRouter initialEntries={["/?anno=2026"]}>
      <Archivio embedded />
      <Location />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  state.read = true;
});
afterEach(cleanup);
it("filters missing references from its KPI without declaring files absent or conserved", () => {
  setup();
  expect(
    within(
      screen.getByRole("group", { name: "Riferimento XML da verificare" }),
    ).getByText("1"),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Filtra: Riferimento XML da verificare",
    }),
  );
  expect(screen.queryByRole("button", { name: "V-1" })).toBeNull();
  expect(screen.getByRole("button", { name: "A-1" })).toBeVisible();
  expect(
    screen.getByText("Conservazione a norma non verificata."),
  ).toBeVisible();
  expect(screen.getByTestId("url")).toHaveTextContent("anno=2026");
});
it("opens and searches the manual list independently of fiscal originals", () => {
  setup();
  fireEvent.click(
    screen.getByRole("button", { name: "Filtra: Allegati manuali" }),
  );
  expect(screen.getByText("Ricevuta da controllare")).toBeVisible();
  expect(screen.queryByRole("button", { name: "V-1" })).toBeNull();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Cerca nell’archivio fiscale" }),
    { target: { value: "absent" } },
  );
  expect(screen.queryByText("Ricevuta da controllare")).toBeNull();
});
it("does not expose fiscal source KPIs without billing permission", () => {
  state.read = false;
  setup();
  expect(
    screen.queryByRole("button", { name: "Filtra: Documenti presenti" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "V-1" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Filtra: Allegati manuali" }),
  ).toBeVisible();
});
