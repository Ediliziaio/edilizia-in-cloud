import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SafetyWorkflow } from "@/components/sicurezza/SafetyWorkflow";
import { PosElencoTab } from "@/components/sicurezza/PosElencoTab";
import { posVuoto } from "../../../supabase/functions/_shared/posModello";
import type { PosRiga } from "@/hooks/usePos";
const state = vi.hoisted(() => ({
  readonly: false,
  pos: [] as PosRiga[],
  run: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null as null, effectiveCompany: null as null }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: true,
    solaLettura: state.readonly,
  }),
}));
vi.mock("@/hooks/usePos", () => ({
  usePosElenco: () => ({
    data: state.pos,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useModelliPos: () => ({ data: [] as never[], isLoading: false, isError: false }),
  useArchiviaModelloPos: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreaPos: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEliminaPos: () => ({ mutate: vi.fn(), isPending: false }),
}));
const stages = [
  { id: "todo", label: "Da fare", hint: "Attività aperte", accent: "" },
  { id: "done", label: "Completati", hint: "Conclusi", accent: "" },
];
const orders = [
  { id: "c1", order_code: "C-001", description: "Cantiere Roma" },
  { id: "c2", order_code: "C-002", description: "Cantiere Milano" },
];
function Url() {
  const l = useLocation();
  return <output data-testid="url">{l.pathname + l.search}</output>;
}
function open(node: React.ReactNode, url = "/azienda/sicurezza-cantiere") {
  render(
    <MemoryRouter initialEntries={[url]}>
      {node}
      <Url />
    </MemoryRouter>,
  );
}
function Workflow({ readonly = false }: { readonly?: boolean }) {
  return (
    <SafetyWorkflow
      namespace="test"
      label="Attività"
      items={[
        { id: "1", title: "Controllo ponteggio", order: "c1", phase: "todo" },
        { id: "2", title: "Riunione", order: "c2", phase: "done" },
      ]}
      stages={stages}
      getStage={(i) => i.phase}
      getOrderId={(i) => i.order}
      getTitle={(i) => i.title}
      getSearch={(i) => i.title}
      orders={orders}
      columns={[{ label: "Titolo", render: (i) => i.title }]}
      renderCard={(i) => <span>{i.order}</span>}
      canWrite={!readonly}
      onTransition={() => ({
        title: "Conferma attività",
        description: "Confermi il completamento?",
        label: "Conferma",
        run: state.run,
      })}
    />
  );
}
beforeEach(() => {
  state.readonly = false;
  state.pos = [];
  state.run.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("Viste sicurezza", () => {
  it("mostra le fasi, mantiene ricerca e vista nell’URL senza toccare altre schede", () => {
    open(
      <Workflow />,
      "/azienda/sicurezza-cantiere?tab=pos&sic_documenti_cerca=DURC",
    );
    expect(
      within(screen.getByRole("region", { name: "Colonna Da fare" })).getByText(
        "Controllo ponteggio",
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca Attività" }), {
      target: { value: "ponteggio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Elenco" }));
    const table = screen.getByRole("table", { name: "Elenco Attività" });
    expect(within(table).getByText("Controllo ponteggio")).toBeInTheDocument();
    expect(within(table).queryByText("Riunione")).not.toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent(
      "sic_test_vista=elenco",
    );
    expect(screen.getByTestId("url")).toHaveTextContent(
      "sic_documenti_cerca=DURC",
    );
  });
  it("filtra per fase, azzera e conserva i collegamenti alle commesse", () => {
    open(<Workflow />);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Fasi Attività" })).getByRole(
        "button",
        { name: /Completati/ },
      ),
    );
    expect(screen.queryByText("Controllo ponteggio")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "C-002" })).toHaveAttribute(
      "href",
      "/azienda/ordini/c2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Azzera" }));
    expect(screen.getByText("Controllo ponteggio")).toBeInTheDocument();
  });
  it("lo spostamento chiede conferma, annullare non salva", async () => {
    open(<Workflow />);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Sposta Controllo ponteggio" }),
      { button: 0, ctrlKey: false, pointerType: "mouse" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Completati" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Confermi il completamento",
    );
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(state.run).not.toHaveBeenCalled();
  });
  it("esegue il passaggio una volta dopo la conferma", async () => {
    open(<Workflow />);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Sposta Controllo ponteggio" }),
      { button: 0, ctrlKey: false, pointerType: "mouse" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Completati" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
  });
  it("la sola lettura rimuove maniglie e menu di spostamento", () => {
    open(<Workflow readonly />);
    expect(
      screen.queryByRole("button", { name: /Sposta Controllo/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Controllo ponteggio")).toBeInTheDocument();
  });
  it("non perde il filtro commessa quando cambia vista", () => {
    open(<Workflow />, "/azienda/sicurezza-cantiere?sic_test_commessa=c1");
    expect(screen.queryByText("Riunione")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elenco" }));
    expect(screen.getByTestId("url")).toHaveTextContent("sic_test_commessa=c1");
  });
});
function pos(status = "bozza"): PosRiga {
  return {
    id: "p1",
    company_id: "co",
    order_id: "c1",
    status,
    revisione: 0,
    revisioni: [],
    contenuto: posVuoto(),
    daCompilare: false,
    iter: {},
    approvato_da_nome: null,
    approvato_il: null,
    created_at: "2026-10-26",
    updated_at: null,
    commessa: { order_code: "C-001", description: "Cantiere Roma" },
  };
}
describe("POS integrato", () => {
  it("apre il POS cliccando sul rettangolo e lascia PDF e cestino nella barra superiore", () => {
    state.pos = [pos()];
    open(<PosElencoTab orders={orders} />);
    expect(screen.queryByRole("button", { name: "Apri POS" })).toBeNull();
    const pdf = screen.getByRole("button", { name: "PDF conservato o anteprima" });
    expect(pdf.closest("[data-pipeline-card-actions]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Elimina il POS" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Eliminare questo POS?",
    );
    expect(screen.getByTestId("url")).not.toHaveTextContent("/pos/p1");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    fireEvent.click(screen.getByText("POS C-001 · Rev. 0"));
    expect(screen.getByTestId("url")).toHaveTextContent(
      "/azienda/sicurezza-cantiere/pos/p1",
    );
  });

  it("mostra le voci mancanti del modello e il datore registrato senza inventare un assegnatario", () => {
    const p = pos();
    p.contenuto.impresa.datore_lavoro = "Mario Rossi";
    state.pos = [p];
    open(<PosElencoTab orders={orders} />);
    expect(
      screen.getByText("Datore di lavoro: Mario Rossi"),
    ).toBeInTheDocument();
    const summary = screen.getByText(/voci da completare/);
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    expect(
      screen.getByText("Committente: nome e cognome o ragione sociale"),
    ).toBeVisible();
    fireEvent.click(summary);
    expect(details).not.toHaveAttribute("open");
  });
  it("la bozza incompleta va compilata e approvare apre il controllo nell’editor", async () => {
    state.pos = [pos()];
    open(<PosElencoTab orders={orders} />);
    expect(
      within(
        screen.getByRole("region", { name: "Colonna Da compilare" }),
      ).getByText(/POS C-001/),
    ).toBeInTheDocument();
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Sposta POS C-001 · Rev. 0" }),
      { button: 0, ctrlKey: false, pointerType: "mouse" },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Approvati" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "controlli di approvazione",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apri e completa il passaggio" }),
    );
    expect(screen.getByTestId("url")).toHaveTextContent(
      "/azienda/sicurezza-cantiere/pos/p1",
    );
  });
  it("un POS approvato conserva lo stato reale e l’elenco è tabellare", () => {
    state.pos = [pos("approvato")];
    open(
      <PosElencoTab orders={orders} />,
      "/azienda/sicurezza-cantiere?sic_pos_vista=elenco",
    );
    const table = screen.getByRole("table", { name: "Elenco POS" });
    expect(within(table).getByText("Approvati")).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Revisione" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Elimina il POS" }),
    ).not.toBeInTheDocument();
  });
});
